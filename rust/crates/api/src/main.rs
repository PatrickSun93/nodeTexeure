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

    let addr = SocketAddr::from(([0, 0, 0, 0], common::env::number("API_PORT", 7000)));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "Rust API listening");
    axum::serve(listener, router(AppState { pool }))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}
