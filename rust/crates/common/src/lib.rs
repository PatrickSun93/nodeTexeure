//! Shared conventions for the Rust services, kept identical to the Node backend's
//! so the two can serve the same clients side by side.

pub mod env;
pub mod json;
pub mod response;
pub mod timestamp;

use sqlx::mysql::MySqlConnectOptions;

/// MySQL connection from `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`
/// (backend/.env names), or a full `DATABASE_URL` when set (tests, sqlx tooling).
pub fn database_options() -> anyhow::Result<MySqlConnectOptions> {
    if let Some(url) = env::var("DATABASE_URL") {
        return Ok(url.parse()?);
    }
    Ok(MySqlConnectOptions::new()
        .host(&env::var("DB_HOST").unwrap_or_else(|| "localhost".into()))
        .port(env::number("DB_PORT", 3306))
        .username(&env::var("DB_USER").unwrap_or_else(|| "root".into()))
        .password(&env::var("DB_PASSWORD").unwrap_or_default())
        .database(&env::var("DB_NAME").unwrap_or_else(|| "bed_texture_ecommerce".into()))
        .charset("utf8mb4"))
}
