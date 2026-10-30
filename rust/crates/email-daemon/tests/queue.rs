//! End-to-end daemon behaviour against a real MySQL with the NodeTexeure schema
//! (init.sql + migrations + seed). Needs DATABASE_URL, so these are `#[ignore]`d
//! for plain `cargo test`; CI runs them with `--include-ignored`:
//!
//!   DATABASE_URL=mysql://root:...@127.0.0.1:3307/bed_texture_ecommerce \
//!     cargo test -p email-daemon -- --include-ignored --test-threads=1

use std::sync::Mutex;
use std::time::Duration;

use email_daemon::config::{Config, Transport};
use email_daemon::mailer::{Delivery, Mailer, OutboxMailer};
use email_daemon::render::Rendered;
use email_daemon::{Outcome, process_email, queue};
use serde_json::{Value, json};
use sqlx::MySqlPool;

async fn pool() -> MySqlPool {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL must point at the test database");
    MySqlPool::connect(&url).await.expect("connect")
}

fn config(outbox: &std::path::Path) -> Config {
    Config {
        poll_interval: Duration::from_millis(10),
        batch_size: 50,
        retry_base: Duration::from_secs(60),
        stale_claim: Duration::from_secs(600),
        transport: Transport::Outbox,
        outbox_dir: outbox.into(),
        from: "Test <noreply@example.com>".into(),
        reply_to: "support@example.com".into(),
        ses_region: "us-east-1".into(),
    }
}

fn unique(prefix: &str) -> String {
    format!(
        "{prefix}-{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap()
    )
}

/// Insert a due email and return it as the daemon would fetch it.
async fn enqueue(
    pool: &MySqlPool,
    subject: &str,
    content: Value,
    template: Option<&str>,
    data: Value,
    max_attempts: u32,
) -> queue::QueuedEmail {
    let id = unique("TEST");
    let to = format!("{}@example.com", id.to_lowercase());
    sqlx::query(
        "INSERT INTO email_queue (id, to_email, subject, email_content, template_id, template_data, status, attempts, max_attempts, scheduled_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, NOW() - INTERVAL 1 SECOND)",
    )
    .bind(&id)
    .bind(&to)
    .bind(subject)
    .bind(content.to_string())
    .bind(template)
    .bind(data.to_string())
    .bind(max_attempts)
    .execute(pool)
    .await
    .unwrap();
    queue::fetch_due(pool, 10_000)
        .await
        .unwrap()
        .into_iter()
        .find(|e| e.id == id)
        .expect("inserted row is due")
}

async fn row(pool: &MySqlPool, id: &str) -> (String, u32, Value, bool) {
    let r: (String, Option<u32>, Option<Value>, i64) = sqlx::query_as(
        "SELECT status, attempts, processing_details, CAST(scheduled_at > NOW() AS SIGNED) FROM email_queue WHERE id = ?",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap();
    (r.0, r.1.unwrap_or(0), r.2.unwrap_or(Value::Null), r.3 == 1)
}

/// Remove a test row so later runs (and the real daemon) never see it.
async fn cleanup(pool: &MySqlPool, id: &str) {
    sqlx::query("DELETE FROM email_queue WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
}

struct FailingMailer;
impl Mailer for FailingMailer {
    async fn send(&self, _to: &str, _email: &Rendered) -> anyhow::Result<Delivery> {
        anyhow::bail!("SES said no")
    }
}

struct RecordingMailer(Mutex<Vec<Rendered>>);
impl Mailer for RecordingMailer {
    async fn send(&self, _to: &str, email: &Rendered) -> anyhow::Result<Delivery> {
        self.0.lock().unwrap().push(email.clone());
        Ok(Delivery {
            info: "recorded".into(),
        })
    }
}

#[tokio::test]
#[ignore = "needs DATABASE_URL"]
async fn sends_and_marks_sent_via_outbox() {
    let pool = pool().await;
    let dir = tempfile::tempdir().unwrap();
    let cfg = config(dir.path());
    let item = enqueue(
        &pool,
        "Hello {{name}}",
        json!({ "html_content": "<p>Hi {{name}}</p>", "text_content": "Hi {{name}}" }),
        None,
        json!({ "name": "Alice" }),
        3,
    )
    .await;

    let outcome = process_email(&pool, &OutboxMailer::new(dir.path()), &cfg, &item)
        .await
        .unwrap();
    assert_eq!(outcome, Outcome::Sent);

    let (status, attempts, details, _) = row(&pool, &item.id).await;
    assert_eq!((status.as_str(), attempts), ("sent", 1));
    assert_eq!(details["sent_by"], "email-daemon");
    let file = std::fs::read_dir(dir.path())
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let html = std::fs::read_to_string(file).unwrap();
    assert!(html.contains("<p>Hi Alice</p>") && html.contains("Hello Alice"));
    cleanup(&pool, &item.id).await;
}

#[tokio::test]
#[ignore = "needs DATABASE_URL"]
async fn uses_the_linked_template_body() {
    let pool = pool().await;
    let cfg = config(std::path::Path::new("unused"));
    let template_id: String =
        sqlx::query_scalar("SELECT id FROM email_templates WHERE name = 'password_reset'")
            .fetch_one(&pool)
            .await
            .expect("migration 012 seeds password_reset");
    let item = enqueue(
        &pool,
        "Reset your password",
        json!({ "html_content": "stale copy" }),
        Some(&template_id),
        json!({ "reset_link": "https://shop.example/reset?token=abc" }),
        3,
    )
    .await;

    let mailer = RecordingMailer(Mutex::new(Vec::new()));
    assert_eq!(
        process_email(&pool, &mailer, &cfg, &item).await.unwrap(),
        Outcome::Sent
    );
    let sent = mailer.0.lock().unwrap().pop().unwrap();
    assert!(sent.html.contains("https://shop.example/reset?token=abc"));
    assert!(!sent.html.contains("stale copy"));
    cleanup(&pool, &item.id).await;
}

#[tokio::test]
#[ignore = "needs DATABASE_URL"]
async fn failure_backs_off_then_gives_up() {
    let pool = pool().await;
    let cfg = config(std::path::Path::new("unused"));
    let item = enqueue(
        &pool,
        "S",
        json!({ "html_content": "x" }),
        None,
        json!({}),
        2,
    )
    .await;

    assert_eq!(
        process_email(&pool, &FailingMailer, &cfg, &item)
            .await
            .unwrap(),
        Outcome::Retrying
    );
    let (status, attempts, details, rescheduled) = row(&pool, &item.id).await;
    assert_eq!((status.as_str(), attempts), ("pending", 1));
    assert!(
        rescheduled,
        "retry is scheduled in the future, not on the next poll"
    );
    assert_eq!(details["error_message"], "SES said no");

    // Make it due again and fail the last allowed attempt.
    sqlx::query("UPDATE email_queue SET scheduled_at = NOW() - INTERVAL 1 SECOND WHERE id = ?")
        .bind(&item.id)
        .execute(&pool)
        .await
        .unwrap();
    let again = queue::fetch_due(&pool, 10_000)
        .await
        .unwrap()
        .into_iter()
        .find(|e| e.id == item.id)
        .unwrap();
    assert_eq!(
        process_email(&pool, &FailingMailer, &cfg, &again)
            .await
            .unwrap(),
        Outcome::Failed
    );
    assert_eq!(row(&pool, &item.id).await.0, "failed");
    cleanup(&pool, &item.id).await;
}

#[tokio::test]
#[ignore = "needs DATABASE_URL"]
async fn a_row_is_only_claimed_once() {
    let pool = pool().await;
    let item = enqueue(&pool, "S", json!({}), None, json!({}), 3).await;
    assert!(queue::claim(&pool, &item.id).await.unwrap());
    assert!(
        !queue::claim(&pool, &item.id).await.unwrap(),
        "second worker must not get it"
    );

    // A second daemon processing the same fetched row skips it instead of sending twice.
    let cfg = config(std::path::Path::new("unused"));
    let mailer = RecordingMailer(Mutex::new(Vec::new()));
    assert_eq!(
        process_email(&pool, &mailer, &cfg, &item).await.unwrap(),
        Outcome::Skipped
    );
    assert!(mailer.0.lock().unwrap().is_empty());
    cleanup(&pool, &item.id).await;
}

#[tokio::test]
#[ignore = "needs DATABASE_URL"]
async fn abandoned_claims_are_recovered() {
    let pool = pool().await;
    let item = enqueue(&pool, "S", json!({}), None, json!({}), 3).await;
    sqlx::query("UPDATE email_queue SET status = 'processing', claimed_at = NOW() - INTERVAL 1 HOUR WHERE id = ?")
        .bind(&item.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        queue::recover_stale(&pool, Duration::from_secs(600))
            .await
            .unwrap()
            >= 1
    );
    assert_eq!(row(&pool, &item.id).await.0, "pending");
    cleanup(&pool, &item.id).await;
}

#[tokio::test]
#[ignore = "needs DATABASE_URL"]
async fn schema_is_new_enough() {
    let pool = pool().await;
    assert!(queue::schema_version(&pool).await.unwrap() >= queue::REQUIRED_MIGRATION);
}
