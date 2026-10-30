use std::time::Duration;

use email_daemon::config::{self, Config, Transport};
use email_daemon::mailer::{OutboxMailer, SesMailer};
use email_daemon::{queue, run};
use sqlx::mysql::MySqlPoolOptions;
use tokio::sync::watch;
use tracing_subscriber::EnvFilter;

/// Connect, waiting for MySQL to come up and for the backend to have applied the
/// migrations this daemon needs (it runs them on start).
async fn connect() -> anyhow::Result<sqlx::MySqlPool> {
    let options = config::database_options()?;
    loop {
        match MySqlPoolOptions::new()
            .max_connections(4)
            .connect_with(options.clone())
            .await
        {
            Ok(pool) => match queue::schema_version(&pool).await {
                Ok(v) if v >= queue::REQUIRED_MIGRATION => return Ok(pool),
                Ok(v) => tracing::info!(
                    have = v,
                    need = queue::REQUIRED_MIGRATION,
                    "waiting for migrations"
                ),
                Err(err) => tracing::warn!(error = %err, "schema check failed"),
            },
            Err(err) => tracing::warn!(error = %err, "waiting for MySQL"),
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}

async fn shutdown_signal(tx: watch::Sender<bool>) {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {}
        _ = term => {}
    }
    tracing::info!("shutting down after the current email");
    let _ = tx.send(true);
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // backend/.env when started from backend/ (manual dev flow); Docker passes env.
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();
    tracing::info!(
        poll_ms = config.poll_interval.as_millis() as u64,
        batch = config.batch_size,
        transport = ?config.transport,
        "email daemon starting"
    );

    let pool = connect().await?;
    let (tx, rx) = watch::channel(false);
    tokio::spawn(shutdown_signal(tx));

    match config.transport {
        Transport::Ses => run(pool, SesMailer::new(&config).await, config, rx).await,
        Transport::Outbox => {
            tracing::warn!(dir = %config.outbox_dir.display(), "SES not configured; writing emails to the outbox");
            let mailer = OutboxMailer::new(config.outbox_dir.clone());
            run(pool, mailer, config, rx).await
        }
    }
    tracing::info!("email daemon stopped");
    Ok(())
}
