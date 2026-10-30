use std::net::SocketAddr;

use api::{AppState, router};
use sqlx::mysql::MySqlPoolOptions;
use tracing_subscriber::EnvFilter;

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
    tracing::info!("shutting down");
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=warn")),
        )
        .init();

    // Connects lazily, so the API starts even if MySQL is still coming up;
    // /health reports 503 until it answers.
    let pool = MySqlPoolOptions::new()
        .max_connections(common::env::number("API_DB_POOL_SIZE", 10))
        .connect_lazy_with(common::database_options()?);

    // Same rule as the Node backend: outside development/test, refuse to start
    // with a missing, short or placeholder secret (it signs every session).
    // Raw, like `process.env.JWT_SECRET`: the same bytes must sign and verify
    // on both services.
    let secret = std::env::var("JWT_SECRET").ok().filter(|s| !s.is_empty());
    let env = common::env::var("NODE_ENV").unwrap_or_default();
    let is_dev = env == "development" || env == "test";
    let weak = secret.as_deref().is_none_or(|s| {
        let lower = s.to_lowercase();
        s.len() < 32
            || [
                "your-super-secret",
                "change_me",
                "change-me",
                "changeme",
                "placeholder",
                "example",
                "min-32-chars",
            ]
            .iter()
            .any(|p| lower.contains(p))
    });
    if !is_dev && weak {
        anyhow::bail!(
            "JWT_SECRET is missing, too short, or a placeholder; set a strong 32+ character secret"
        );
    }
    let state = AppState::new(pool, secret.as_deref());
    if state.trust_proxy.0 > 0 {
        tracing::info!(
            hops = state.trust_proxy.0,
            "trusting X-Forwarded-For (TRUST_PROXY)"
        );
    }

    let addr = SocketAddr::from(([0, 0, 0, 0], common::env::number("API_PORT", 7000)));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "Rust API listening");
    // The peer address is the rate-limit key when no proxy is trusted.
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;
    Ok(())
}
