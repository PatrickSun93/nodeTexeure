//! `GET /health` — 200 when the database answers, 503 otherwise (container
//! healthchecks and uptime monitors).

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use common::response::{failure, success};
use serde_json::json;

use crate::AppState;

pub async fn health(State(state): State<AppState>) -> (StatusCode, Json<serde_json::Value>) {
    match sqlx::query_scalar!("SELECT 1 AS ok")
        .fetch_one(&state.pool)
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(success("Rust API is running", json!({ "database": "up" }))),
        ),
        Err(err) => {
            tracing::error!(error = %err, "health check: database unreachable");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(failure("Database unreachable")),
            )
        }
    }
}
