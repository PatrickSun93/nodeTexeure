//! All SQL against `email_queue` / `email_templates`. Every query uses sqlx's
//! `query!` macros, so it is checked against the real schema at compile time
//! (live `DATABASE_URL`, or the committed `rust/.sqlx` data offline).

use std::time::Duration;

use serde_json::Value;
use sqlx::MySqlPool;

/// Migration that adds the `processing` status and `claimed_at` (012). The daemon
/// waits for it so a new daemon never runs against an old schema.
pub const REQUIRED_MIGRATION: i64 = 12;

/// A queued email that is due to be sent.
#[derive(Debug, Clone)]
pub struct QueuedEmail {
    pub id: String,
    pub to_email: String,
    pub subject: String,
    pub email_content: Value,
    pub template_id: Option<String>,
    pub template_data: Option<Value>,
    pub attempts: u32,
    pub max_attempts: u32,
}

/// Highest applied schema migration (0 when the table doesn't exist yet).
pub async fn schema_version(pool: &MySqlPool) -> anyhow::Result<i64> {
    let row = sqlx::query!(
        r#"SELECT COUNT(*) AS "present!: i64" FROM information_schema.tables
           WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'"#
    )
    .fetch_one(pool)
    .await?;
    if row.present == 0 {
        return Ok(0);
    }
    let row = sqlx::query!(r#"SELECT CAST(COALESCE(MAX(version), 0) AS SIGNED) AS "version!: i64" FROM schema_migrations"#)
        .fetch_one(pool)
        .await?;
    Ok(row.version)
}

/// Return rows a crashed worker left in `processing` to the queue.
pub async fn recover_stale(pool: &MySqlPool, older_than: Duration) -> anyhow::Result<u64> {
    let done = sqlx::query!(
        "UPDATE email_queue SET status = 'pending', claimed_at = NULL
         WHERE status = 'processing' AND claimed_at < NOW() - INTERVAL ? SECOND",
        older_than.as_secs()
    )
    .execute(pool)
    .await?;
    Ok(done.rows_affected())
}

/// Pending emails whose time has come, oldest first.
pub async fn fetch_due(pool: &MySqlPool, limit: u32) -> anyhow::Result<Vec<QueuedEmail>> {
    let rows = sqlx::query!(
        "SELECT id, to_email, subject, email_content, template_id, template_data, attempts, max_attempts
         FROM email_queue
         WHERE status = 'pending' AND scheduled_at <= NOW() AND attempts < max_attempts
         ORDER BY scheduled_at ASC
         LIMIT ?",
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| QueuedEmail {
            id: r.id,
            to_email: r.to_email,
            subject: r.subject,
            email_content: r.email_content,
            template_id: r.template_id,
            template_data: r.template_data,
            attempts: r.attempts.unwrap_or(0),
            max_attempts: r.max_attempts.unwrap_or(3),
        })
        .collect())
}

/// Atomically take a row. `false` means another worker got it first.
pub async fn claim(pool: &MySqlPool, id: &str) -> anyhow::Result<bool> {
    let done = sqlx::query!(
        "UPDATE email_queue SET status = 'processing', claimed_at = NOW()
         WHERE id = ? AND status = 'pending'",
        id
    )
    .execute(pool)
    .await?;
    Ok(done.rows_affected() == 1)
}

/// `template_content` of a template, if it exists.
pub async fn template_content(
    pool: &MySqlPool,
    template_id: &str,
) -> anyhow::Result<Option<Value>> {
    let row = sqlx::query!(
        "SELECT template_content FROM email_templates WHERE id = ?",
        template_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.template_content))
}

pub async fn mark_sent(pool: &MySqlPool, id: &str, details: &Value) -> anyhow::Result<()> {
    sqlx::query!(
        "UPDATE email_queue
         SET status = 'sent', sent_at = NOW(), claimed_at = NULL, attempts = attempts + 1, processing_details = ?
         WHERE id = ?",
        details.to_string(),
        id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Record a failed attempt: back to `pending` after `retry_in`, or `failed` for good.
pub async fn mark_failed(
    pool: &MySqlPool,
    id: &str,
    attempts: u32,
    give_up: bool,
    retry_in: Duration,
    details: &Value,
) -> anyhow::Result<()> {
    let status = if give_up { "failed" } else { "pending" };
    sqlx::query!(
        "UPDATE email_queue
         SET status = ?, attempts = ?, claimed_at = NULL, processing_details = ?,
             scheduled_at = IF(? = 'pending', NOW() + INTERVAL ? SECOND, scheduled_at)
         WHERE id = ?",
        status,
        attempts,
        details.to_string(),
        status,
        retry_in.as_secs(),
        id
    )
    .execute(pool)
    .await?;
    Ok(())
}
