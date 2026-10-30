//! `/api/contact` — the storefront contact form (port of
//! backend/routes/contactRoutes.js). Validates the message and queues it in
//! `email_queue` for the support inbox (not template-based, so the row is
//! written directly).

use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, post};
use axum::{Json, Router};
use common::response::{failure, success};
use serde_json::{Value, json};
use sqlx::MySqlPool;

use crate::AppState;
use crate::express::{self, is_email, js_len, js_slice, js_trim};

async fn not_found(uri: Uri) -> Response {
    express::not_found(&uri)
}

pub fn router() -> Router<AppState> {
    let mut router = Router::new();
    for path in ["/api/contact", "/api/contact/"] {
        router = router.route(path, post(submit).fallback(not_found));
    }
    router.route("/api/contact/{*rest}", any(not_found))
}

/// `system_settings.support_email`, then `SUPPORT_EMAIL || ADMIN_EMAIL`, then
/// the default.
async fn support_email(pool: &MySqlPool) -> String {
    let setting = sqlx::query_scalar!(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'support_email' LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .inspect_err(|error| tracing::error!(%error, "contact: support_email lookup failed"))
    .ok()
    .flatten()
    .flatten();
    if let Some(email) = setting.filter(|e| !e.is_empty()) {
        return email;
    }
    let env = |name: &str| std::env::var(name).ok().filter(|v| !v.is_empty());
    env("SUPPORT_EMAIL")
        .or_else(|| env("ADMIN_EMAIL"))
        .unwrap_or_else(|| "support@nodetexture.com".into())
}

fn bad_request(message: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(failure(message))).into_response()
}

fn send_failed() -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(failure(
            "Failed to send your message. Please try again later.",
        )),
    )
        .into_response()
}

/// A trimmed string field, or `''` when it is not a string.
fn text(body: &Value, key: &str) -> String {
    match body.get(key) {
        Some(Value::String(s)) => js_trim(s).to_owned(),
        _ => String::new(),
    }
}

/// `POST /api/contact` `{ fullName | name, email, subject?, message }`
pub async fn submit(State(state): State<AppState>, headers: HeaderMap, body: Body) -> Response {
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(response) => return response,
    };
    // The form's field is `fullName`; `name` is the fallback.
    let full_name = match (body.get("fullName"), body.get("name")) {
        (Some(Value::String(s)), _) | (_, Some(Value::String(s))) => js_trim(s).to_owned(),
        _ => String::new(),
    };
    let email = text(&body, "email");
    let subject = text(&body, "subject");
    let message = text(&body, "message");

    if full_name.is_empty() || js_len(&full_name) > 200 {
        return bad_request("A valid name is required");
    }
    if email.is_empty() || js_len(&email) > 255 || !is_email(&email) {
        return bad_request("A valid email address is required");
    }
    if message.is_empty() || !(2..=5000).contains(&js_len(&message)) {
        return bad_request("A message is required (max 5000 characters)");
    }
    if js_len(&subject) > 200 {
        return bad_request("Subject is too long");
    }

    let to = support_email(&state.pool).await;
    let id = sqlx::query_scalar!(r#"SELECT get_next_id('EMAIL') AS "id: String""#)
        .fetch_one(&state.pool)
        .await
        .inspect_err(|error| tracing::error!(%error, "get_next_id('EMAIL') failed"))
        .ok()
        .flatten();
    let Some(id) = id else {
        tracing::error!("get_next_id('EMAIL') returned NULL");
        return send_failed();
    };
    let content = json!({
        "type": "contact_form",
        "from_name": full_name,
        "from_email": email,
        "subject": if subject.is_empty() { "(no subject)" } else { &subject },
        "message": message,
        "submitted_at": express::now_iso(),
    });
    let title = js_slice(
        &format!(
            "Contact form: {}",
            if subject.is_empty() {
                "New message"
            } else {
                &subject
            }
        ),
        255,
    );
    let inserted = sqlx::query!(
        "INSERT INTO email_queue (id, to_email, to_name, subject, email_content, status, scheduled_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())",
        id,
        to,
        "Support",
        title,
        content.to_string()
    )
    .execute(&state.pool)
    .await;
    if let Err(error) = inserted {
        tracing::error!(%error, "enqueueing contact message failed");
        return send_failed();
    }
    Json(success(
        "Thanks for reaching out — we've received your message and will reply by email shortly.",
        json!({ "received": true }),
    ))
    .into_response()
}
