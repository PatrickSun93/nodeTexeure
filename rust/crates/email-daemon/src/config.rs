//! Configuration from environment variables — the same names the Node backend
//! uses (see backend/.env.example), so one `.env` serves both.

use std::{env, path::PathBuf, time::Duration};

use sqlx::mysql::MySqlConnectOptions;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transport {
    /// AWS SES (`aws-sdk-sesv2`).
    Ses,
    /// Write each email as an HTML file (local development, no SES keys).
    Outbox,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub poll_interval: Duration,
    pub batch_size: u32,
    /// First retry delay; doubles per attempt (capped at one hour).
    pub retry_base: Duration,
    /// A row left in `processing` this long is assumed abandoned (crashed worker).
    pub stale_claim: Duration,
    pub transport: Transport,
    pub outbox_dir: PathBuf,
    pub from: String,
    pub reply_to: String,
    pub ses_region: String,
}

fn var(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

fn number<T: std::str::FromStr>(name: &str, default: T) -> T {
    var(name).and_then(|v| v.parse().ok()).unwrap_or(default)
}

/// SES is used when real-looking AWS keys are present (the Node service's rule),
/// unless `EMAIL_TRANSPORT=outbox|ses` forces a choice.
fn transport() -> Transport {
    match var("EMAIL_TRANSPORT").as_deref() {
        Some("ses") => Transport::Ses,
        Some("outbox") => Transport::Outbox,
        _ => {
            let key = var("AWS_ACCESS_KEY_ID").unwrap_or_default();
            let secret = var("AWS_SECRET_ACCESS_KEY").unwrap_or_default();
            if !key.is_empty() && !secret.is_empty() && !key.contains("your-aws") {
                Transport::Ses
            } else {
                Transport::Outbox
            }
        }
    }
}

impl Config {
    pub fn from_env() -> Self {
        let from_email =
            var("AWS_SES_FROM_EMAIL").unwrap_or_else(|| "noreply@yourdomain.com".into());
        let from_name = var("AWS_SES_FROM_NAME").unwrap_or_else(|| "Noiraé Store".into());
        Self {
            poll_interval: Duration::from_millis(number("EMAIL_DAEMON_POLL_MS", 5_000)),
            batch_size: number("EMAIL_DAEMON_BATCH_SIZE", 10),
            retry_base: Duration::from_secs(number("EMAIL_DAEMON_RETRY_BASE_SECS", 60)),
            stale_claim: Duration::from_secs(number("EMAIL_DAEMON_STALE_CLAIM_SECS", 15 * 60)),
            transport: transport(),
            outbox_dir: var("EMAIL_OUTBOX_DIR")
                .unwrap_or_else(|| "email-outbox".into())
                .into(),
            from: format!("{from_name} <{from_email}>"),
            reply_to: var("AWS_SES_REPLY_TO_EMAIL")
                .unwrap_or_else(|| "support@yourdomain.com".into()),
            ses_region: var("AWS_SES_REGION")
                .or_else(|| var("AWS_REGION"))
                .unwrap_or_else(|| "us-east-1".into()),
        }
    }
}

/// MySQL connection from `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`,
/// or a full `DATABASE_URL` when set (used by the tests and sqlx tooling).
pub fn database_options() -> anyhow::Result<MySqlConnectOptions> {
    if let Some(url) = var("DATABASE_URL") {
        return Ok(url.parse()?);
    }
    Ok(MySqlConnectOptions::new()
        .host(&var("DB_HOST").unwrap_or_else(|| "localhost".into()))
        .port(number("DB_PORT", 3306))
        .username(&var("DB_USER").unwrap_or_else(|| "root".into()))
        .password(&var("DB_PASSWORD").unwrap_or_default())
        .database(&var("DB_NAME").unwrap_or_else(|| "bed_texture_ecommerce".into()))
        .charset("utf8mb4"))
}
