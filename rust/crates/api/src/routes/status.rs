//! `/api/status` — health and hello endpoints (port of
//! backend/routes/statusRoutes.js).

use std::sync::LazyLock;
use std::time::Instant;

use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use axum::{Json, Router};
use common::response::{failure_with, success};
use serde_json::{Value, json};

use crate::AppState;
use crate::express;

/// When this process started serving (`process.uptime()`).
static STARTED: LazyLock<Instant> = LazyLock::new(Instant::now);

async fn not_found(uri: Uri) -> Response {
    express::not_found(&uri)
}

/// The group's routes (Express also answers each path with a trailing slash).
pub fn router() -> Router<AppState> {
    LazyLock::force(&STARTED);
    let mut router = Router::new();
    for path in ["/api/status/health", "/api/status/health/"] {
        router = router.route(path, get(health).fallback(not_found));
    }
    for path in ["/api/status/hello", "/api/status/hello/"] {
        router = router.route(path, get(hello).post(hello_named).fallback(not_found));
    }
    router
        .route("/api/status", any(not_found))
        .route("/api/status/", any(not_found))
        .route("/api/status/{*rest}", any(not_found))
}

/// `process.env.PORT || 6666`.
fn port() -> Value {
    match std::env::var("PORT") {
        Ok(p) if !p.is_empty() => json!(p),
        _ => json!(6666),
    }
}

/// `GET /api/status/health`: 503 when the database does not answer.
pub async fn health(State(state): State<AppState>) -> Response {
    let up = sqlx::query_scalar!("SELECT 1 AS ok")
        .fetch_one(&state.pool)
        .await
        .inspect_err(|error| tracing::error!(%error, "health check: database unreachable"))
        .is_ok();
    let uptime = STARTED.elapsed().as_secs_f64();
    let key_value_table = json!({
        "port": port(),
        "environment": std::env::var("NODE_ENV")
            .ok()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "development".into()),
        "uptime": format!("{} seconds", common::json::js_number_string(uptime)),
        "database": if up { "up" } else { "down" },
    });
    if up {
        Json(success("Backend server is running", key_value_table)).into_response()
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(failure_with("Database unreachable", key_value_table)),
        )
            .into_response()
    }
}

/// `GET /api/status/hello`
pub async fn hello() -> Json<Value> {
    Json(success("Hello from Express backend!", json!([])))
}

/// `POST /api/status/hello` `{ name }`
pub async fn hello_named(headers: HeaderMap, body: Body) -> Response {
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(response) => return response,
    };
    let name = body.get("name");
    match name {
        Some(Value::String(s)) if !express::js_trim(s).is_empty() => {
            let name = express::js_trim(s);
            Json(success(
                &format!("Hello, {name}! Welcome to the Express backend."),
                json!({ "name": name }),
            ))
            .into_response()
        }
        _ => (
            StatusCode::BAD_REQUEST,
            Json(failure_with(
                "Invalid name provided",
                json!({
                    "error": "Name is required and must be a non-empty string",
                    // `name || 'N/A'`
                    "provided_name": if crate::body::truthy(name) { name.cloned() } else { Some(json!("N/A")) },
                }),
            )),
        )
            .into_response(),
    }
}
