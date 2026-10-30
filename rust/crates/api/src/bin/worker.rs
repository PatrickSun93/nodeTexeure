//! The background worker: what the Node backend runs besides HTTP.
//!
//! ```text
//! worker [run]                  migrate, then the jobs now and every 15 minutes
//! worker migrate [--status]     backend/scripts/migrate.js (npm run migrate)
//! worker once [JOB]             one run of every job (or JOB: release-reservations,
//!                               abandoned-carts), a JSON line each; for tests and cron
//! ```
//!
//! Settings: the DB_* / DATABASE_URL variables (like the API), `JWT_SECRET`
//! (signs the unsubscribe links in abandoned-cart emails, so it must match the
//! backend's), `FRONTEND_URL`, `MIGRATIONS_DIR`, `WORKER_INTERVAL_SECS`
//! (default 900) and `WORKER_MIGRATE=false` to leave migrations to the backend.

use std::time::Duration;

use api::auth::JwtKey;
use api::jobs::{self, abandoned_cart, migrate, reservations};
use serde_json::json;
use sqlx::MySqlPool;
use sqlx::mysql::MySqlPoolOptions;
use tracing_subscriber::EnvFilter;

#[derive(Clone, Copy, PartialEq)]
enum Job {
    Reservations,
    AbandonedCarts,
}

const JOBS: [Job; 2] = [Job::Reservations, Job::AbandonedCarts];

impl Job {
    fn name(self) -> &'static str {
        match self {
            Job::Reservations => "release-reservations",
            Job::AbandonedCarts => "abandoned-carts",
        }
    }
}

/// One locked run of `job` as a JSON summary (`skipped` when another
/// instance holds its lock).
async fn run_job(pool: &MySqlPool, key: &JwtKey, job: Job) -> serde_json::Value {
    let outcome = match job {
        Job::Reservations => jobs::with_lock(pool, jobs::RELEASE_RESERVATIONS_LOCK, async {
            reservations::release_expired(pool).await.map(|r| {
                if r.released_count > 0 {
                    tracing::info!("Released {} expired stock reservation(s)", r.released_count);
                }
                json!({ "released_count": r.released_count, "total_expired": r.total_expired })
            })
        })
        .await
        .and_then(|o| o.transpose()),
        Job::AbandonedCarts => jobs::with_lock(pool, jobs::ABANDONED_CART_LOCK, async {
            abandoned_cart::detect(pool, key)
                .await
                .map(|n| json!({ "processedCarts": n }))
        })
        .await
        .and_then(|o| o.transpose()),
    };
    match outcome {
        Ok(Some(data)) => json!({ "job": job.name(), "success": true, "data": data }),
        Ok(None) => json!({ "job": job.name(), "success": true, "skipped": true }),
        Err(err) => {
            tracing::error!(job = job.name(), error = %err, "job failed");
            json!({ "job": job.name(), "success": false, "error": err.to_string() })
        }
    }
}

async fn shutdown_signal() {
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
}

fn jwt_key() -> anyhow::Result<JwtKey> {
    let secret = std::env::var("JWT_SECRET").ok().filter(|s| !s.is_empty());
    let env = common::env::var("NODE_ENV").unwrap_or_default();
    if secret.is_none() && env != "development" && env != "test" {
        anyhow::bail!("JWT_SECRET is required (it signs the unsubscribe links)");
    }
    Ok(JwtKey::from_secret(secret.as_deref()))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let pool = MySqlPoolOptions::new()
        .max_connections(4)
        .connect_lazy_with(common::database_options()?);

    match args.first().map(String::as_str) {
        Some("migrate") => {
            let dir = migrate::default_dir();
            if args.iter().any(|a| a == "--status") {
                for line in migrate::status(&pool, &dir).await? {
                    println!("{line}");
                }
            } else {
                migrate::run(&pool, &dir).await?;
            }
        }
        Some("once") => {
            let key = jwt_key()?;
            let only = args.get(1).map(String::as_str);
            let selected: Vec<Job> = JOBS
                .into_iter()
                .filter(|j| only.is_none_or(|o| o == j.name()))
                .collect();
            if selected.is_empty() {
                anyhow::bail!("unknown job {:?}", only.unwrap_or_default());
            }
            let mut ok = true;
            for job in selected {
                let out = run_job(&pool, &key, job).await;
                ok &= out["success"] == true;
                println!("{out}");
            }
            if !ok {
                std::process::exit(1);
            }
        }
        None | Some("run") => {
            let key = jwt_key()?;
            if common::env::var("WORKER_MIGRATE").as_deref() != Some("false") {
                migrate::run(&pool, &migrate::default_dir()).await?;
            }
            let every = Duration::from_secs(common::env::number("WORKER_INTERVAL_SECS", 900u64));
            tracing::info!(every_secs = every.as_secs(), "background jobs started");
            let mut tick = tokio::time::interval(every);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            let shutdown = shutdown_signal();
            tokio::pin!(shutdown);
            loop {
                tokio::select! {
                    _ = &mut shutdown => break,
                    _ = tick.tick() => {
                        for job in JOBS {
                            run_job(&pool, &key, job).await;
                        }
                    }
                }
            }
            tracing::info!("shutting down");
        }
        Some(other) => anyhow::bail!("unknown command {other:?} (run, migrate, once)"),
    }
    pool.close().await;
    Ok(())
}
