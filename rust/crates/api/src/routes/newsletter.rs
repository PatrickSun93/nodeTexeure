//! `/api/newsletter` — newsletter sign-up (port of
//! backend/routes/newsletterRoutes.js). Public and idempotent: a repeat
//! sign-up is a no-op that answers the same, so it reveals nothing.

use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, post};
use axum::{Json, Router};
use common::response::{failure, success};
use serde_json::{Value, json};

use crate::AppState;
use crate::express;

async fn not_found(uri: Uri) -> Response {
    express::not_found(&uri)
}

pub fn router() -> Router<AppState> {
    let mut router = Router::new();
    for path in ["/api/newsletter/subscribe", "/api/newsletter/subscribe/"] {
        router = router.route(path, post(subscribe).fallback(not_found));
    }
    router
        .route("/api/newsletter", any(not_found))
        .route("/api/newsletter/", any(not_found))
        .route("/api/newsletter/{*rest}", any(not_found))
}

/// `POST /api/newsletter/subscribe` `{ email }`
pub async fn subscribe(State(state): State<AppState>, headers: HeaderMap, body: Body) -> Response {
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(response) => return response,
    };
    let email = match body.get("email") {
        Some(Value::String(s)) => express::js_trim(s).to_lowercase(),
        _ => String::new(),
    };
    if email.is_empty() || express::js_len(&email) > 255 || !express::is_email(&email) {
        return (
            StatusCode::BAD_REQUEST,
            Json(failure("A valid email address is required")),
        )
            .into_response();
    }
    let written = sqlx::query!(
        "INSERT INTO newsletter_subscribers (email, status, created_at)
         VALUES (?, 'subscribed', NOW())
         ON DUPLICATE KEY UPDATE status = 'subscribed'",
        email
    )
    .execute(&state.pool)
    .await;
    if let Err(error) = written {
        tracing::error!(%error, "newsletter subscription failed");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(failure("Failed to subscribe. Please try again later.")),
        )
            .into_response();
    }
    Json(success(
        "Thanks for subscribing — welcome to the Noiraé list.",
        json!({ "subscribed": true }),
    ))
    .into_response()
}
