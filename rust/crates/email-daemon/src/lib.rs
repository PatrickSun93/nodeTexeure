//! Email daemon: the single consumer of the `email_queue` table.
//!
//! The Node API enqueues mail (backend/services/emailQueueProducer.js); this
//! process claims due rows, renders them, sends them, and records the outcome.
//! Delivery is at-least-once: a row is claimed before sending, and a claim left
//! behind by a crash is returned to the queue after `stale_claim`.

pub mod config;
pub mod mailer;
pub mod queue;
pub mod render;

use std::time::Duration;

use serde_json::json;
use sqlx::MySqlPool;
use tokio::sync::watch;

use crate::config::Config;
use crate::mailer::Mailer;
use crate::queue::QueuedEmail;

/// Delay before retry number `attempt` (1-based): `base`, then doubling, max 1h.
pub fn retry_delay(base: Duration, attempt: u32) -> Duration {
    let factor = 2u32.saturating_pow(attempt.saturating_sub(1));
    base.saturating_mul(factor).min(Duration::from_secs(3600))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Sent,
    /// Another worker claimed it first.
    Skipped,
    Retrying,
    Failed,
}

/// Render and send one claimed row, then record the result.
async fn deliver<M: Mailer>(
    pool: &MySqlPool,
    mailer: &M,
    item: &QueuedEmail,
) -> anyhow::Result<String> {
    let data = render::variables(item.template_data.as_ref());
    // Like the Node daemon, the linked template is only consulted when there are
    // variables to fill in; otherwise the stored copy is sent as-is.
    let template = match (&item.template_id, data.is_empty()) {
        (Some(id), false) => queue::template_content(pool, id).await?,
        _ => None,
    };
    let email = render::render(&item.subject, &item.email_content, template.as_ref(), &data);
    let delivery = mailer.send(&item.to_email, &email).await?;
    Ok(delivery.info)
}

pub async fn process_email<M: Mailer>(
    pool: &MySqlPool,
    mailer: &M,
    config: &Config,
    item: &QueuedEmail,
) -> anyhow::Result<Outcome> {
    if !queue::claim(pool, &item.id).await? {
        return Ok(Outcome::Skipped);
    }
    let now = chrono::Utc::now().to_rfc3339();
    match deliver(pool, mailer, item).await {
        Ok(info) => {
            let details =
                json!({ "delivery_info": info, "sent_by": "email-daemon", "sent_timestamp": now });
            queue::mark_sent(pool, &item.id, &details).await?;
            tracing::info!(id = %item.id, to = %item.to_email, subject = %item.subject, "sent");
            Ok(Outcome::Sent)
        }
        Err(err) => {
            let attempts = item.attempts + 1;
            let give_up = attempts >= item.max_attempts;
            let retry_in = retry_delay(config.retry_base, attempts);
            let details = json!({ "error_message": format!("{err:#}"), "failed_at": now, "attempt_number": attempts });
            queue::mark_failed(pool, &item.id, attempts, give_up, retry_in, &details).await?;
            if give_up {
                tracing::error!(id = %item.id, attempts, error = %format!("{err:#}"), "failed permanently");
                Ok(Outcome::Failed)
            } else {
                tracing::warn!(id = %item.id, attempts, retry_in_secs = retry_in.as_secs(), error = %format!("{err:#}"), "will retry");
                Ok(Outcome::Retrying)
            }
        }
    }
}

/// One poll cycle: recover abandoned claims, then send what's due. Stops early
/// (between emails) when `shutdown` flips to true.
pub async fn process_batch<M: Mailer>(
    pool: &MySqlPool,
    mailer: &M,
    config: &Config,
    shutdown: &watch::Receiver<bool>,
) -> anyhow::Result<Vec<Outcome>> {
    let recovered = queue::recover_stale(pool, config.stale_claim).await?;
    if recovered > 0 {
        tracing::warn!(recovered, "returned abandoned claims to the queue");
    }
    let due = queue::fetch_due(pool, config.batch_size).await?;
    let mut outcomes = Vec::with_capacity(due.len());
    for item in &due {
        if *shutdown.borrow() {
            break;
        }
        outcomes.push(process_email(pool, mailer, config, item).await?);
    }
    if !outcomes.is_empty() {
        let sent = outcomes.iter().filter(|o| **o == Outcome::Sent).count();
        tracing::info!(processed = outcomes.len(), sent, "batch complete");
    }
    Ok(outcomes)
}

/// Poll until `shutdown` is signalled. A failing cycle (e.g. DB briefly down) is
/// logged and retried on the next tick rather than killing the process.
pub async fn run<M: Mailer>(
    pool: MySqlPool,
    mailer: M,
    config: Config,
    mut shutdown: watch::Receiver<bool>,
) {
    let mut ticker = tokio::time::interval(config.poll_interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            _ = ticker.tick() => {}
            _ = shutdown.changed() => {}
        }
        if *shutdown.borrow() {
            break;
        }
        if let Err(err) = process_batch(&pool, &mailer, &config, &shutdown).await {
            tracing::error!(error = %format!("{err:#}"), "poll cycle failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_delay_doubles_and_caps() {
        let base = Duration::from_secs(60);
        assert_eq!(retry_delay(base, 1), Duration::from_secs(60));
        assert_eq!(retry_delay(base, 2), Duration::from_secs(120));
        assert_eq!(retry_delay(base, 3), Duration::from_secs(240));
        assert_eq!(retry_delay(base, 30), Duration::from_secs(3600));
        assert_eq!(retry_delay(base, 0), Duration::from_secs(60));
    }
}
