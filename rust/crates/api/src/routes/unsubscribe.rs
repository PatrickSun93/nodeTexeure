//! `/api/unsubscribe` — one-click unsubscribe links (port of
//! backend/routes/unsubscribeRoutes.js). Public: the signed HMAC token in the
//! link (`email_queue::unsubscribe_token`, the same bytes Node computes)
//! proves the request is for that address. An invalid token never changes
//! anything, and the answers never reveal whether an address is known.

use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, post};
use axum::{Json, Router};
use common::response::{failure_with, success};
use serde_json::{Value, json};

use crate::AppState;
use crate::email_queue::{normalize_email, verify_unsubscribe_token};
use crate::express;

const VALID_SCOPES: [&str; 2] = ["all", "marketing"];

/// emailSuppression.js `secret()` throws this without JWT_SECRET.
const NO_SECRET: &str =
    "JWT_SECRET is not set — refusing to build/verify unsubscribe tokens with a fallback secret";

async fn not_found(uri: Uri) -> Response {
    express::not_found(&uri)
}

pub fn router() -> Router<AppState> {
    let mut router = Router::new();
    for path in ["/api/unsubscribe", "/api/unsubscribe/"] {
        router = router.route(path, get(status).post(unsubscribe).fallback(not_found));
    }
    for path in [
        "/api/unsubscribe/resubscribe",
        "/api/unsubscribe/resubscribe/",
    ] {
        router = router.route(path, post(resubscribe).fallback(not_found));
    }
    router.route("/api/unsubscribe/{*rest}", any(not_found))
}

/// `normalizeEmail(v)`: `String(v || '').trim().toLowerCase()`.
fn normalize(v: Option<&Value>) -> String {
    if crate::body::truthy(v) {
        normalize_email(&crate::body::js_string(v.expect("truthy")))
    } else {
        String::new()
    }
}

/// `tokenOf(v)`: the token when it is a string.
fn token_of(v: Option<&Value>) -> &str {
    match v {
        Some(Value::String(s)) => s,
        _ => "",
    }
}

fn server_error(message: &str) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(failure_with("Server error", json!([{ "error": message }]))),
    )
        .into_response()
}

/// No JWT_SECRET to check a token with.
struct NoSecret;

impl IntoResponse for NoSecret {
    fn into_response(self) -> Response {
        server_error(NO_SECRET)
    }
}

/// `!email || !token || !verifyUnsubscribeToken(email, token)`; `Err` when
/// there is no secret to check with (Node throws, the route answers 500).
fn link_is_valid(state: &AppState, email: &str, token: &str) -> Result<bool, NoSecret> {
    if email.is_empty() || token.is_empty() {
        return Ok(false);
    }
    verify_unsubscribe_token(&state.jwt, email, token).map_err(|_| NoSecret)
}

/// `GET /api/unsubscribe?email=&token=`: is the address still subscribed?
pub async fn status(State(state): State<AppState>, uri: Uri) -> Response {
    let query = crate::qs::query(&uri);
    let email = normalize(query.get("email"));
    let token = token_of(query.get("token"));
    match link_is_valid(&state, &email, token) {
        Err(no_secret) => return no_secret.into_response(),
        Ok(false) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(failure_with(
                    "This unsubscribe link is invalid or has expired.",
                    json!([{ "valid": false }]),
                )),
            )
                .into_response();
        }
        Ok(true) => {}
    }
    // A failed lookup reads as "no suppression", as executeQuery's empty rows do.
    let scope = sqlx::query_scalar!(
        "SELECT scope FROM email_unsubscribes WHERE email = ? LIMIT 1",
        email
    )
    .fetch_optional(&state.pool)
    .await
    .inspect_err(|error| tracing::error!(%error, "unsubscribe lookup failed"))
    .ok()
    .flatten();
    Json(success(
        "Link verified",
        json!([{
            "email": email,
            "valid": true,
            "subscribed": scope.is_none(),
            "scope": scope,
        }]),
    ))
    .into_response()
}

/// `POST /api/unsubscribe` `{ email, token, scope?, reason? }`
pub async fn unsubscribe(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(response) => return response,
    };
    let email = normalize(body.get("email"));
    let token = token_of(body.get("token"));
    let scope = match body.get("scope") {
        Some(Value::String(s)) if VALID_SCOPES.contains(&s.as_str()) => s.as_str(),
        _ => "all",
    };
    let reason = match body.get("reason") {
        Some(Value::String(s)) => Some(express::js_slice(s, 255)),
        _ => None,
    };
    match link_is_valid(&state, &email, token) {
        Err(no_secret) => return no_secret.into_response(),
        Ok(false) => {
            return Json(success(
                "Your email preferences have been updated.",
                json!([{
                    "email": if email.is_empty() { None } else { Some(&email) },
                    "unsubscribed": true,
                    "recorded": false,
                }]),
            ))
            .into_response();
        }
        Ok(true) => {}
    }

    let id = sqlx::query_scalar!(r#"SELECT get_next_id('UNSB') AS "id: String""#)
        .fetch_one(&state.pool)
        .await
        .inspect_err(|error| tracing::error!(%error, "get_next_id('UNSB') failed"))
        .ok()
        .flatten();
    let Some(id) = id else {
        return server_error(
            "get_next_id('UNSB') returned NULL — is the UNSB prefix registered in transno?",
        );
    };
    // One suppression row per address; Node does not check this write.
    let written = sqlx::query!(
        "INSERT INTO email_unsubscribes (id, email, token, scope, reason, unsubscribed_at)
           VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           scope = VALUES(scope),
           reason = COALESCE(VALUES(reason), reason),
           unsubscribed_at = NOW()",
        id,
        email,
        token,
        scope,
        reason
    )
    .execute(&state.pool)
    .await;
    if let Err(error) = written {
        tracing::error!(%error, "recording unsubscribe failed");
    }
    Json(success(
        "You have been unsubscribed from marketing emails.",
        json!([{ "email": email, "unsubscribed": true, "recorded": true, "scope": scope }]),
    ))
    .into_response()
}

/// `POST /api/unsubscribe/resubscribe` `{ email, token }`
pub async fn resubscribe(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(response) => return response,
    };
    let email = normalize(body.get("email"));
    let token = token_of(body.get("token"));
    match link_is_valid(&state, &email, token) {
        Err(no_secret) => return no_secret.into_response(),
        Ok(false) => {
            return Json(success(
                "Your email preferences have been updated.",
                json!([{
                    "email": if email.is_empty() { None } else { Some(&email) },
                    "subscribed": true,
                    "recorded": false,
                }]),
            ))
            .into_response();
        }
        Ok(true) => {}
    }
    let removed = sqlx::query!("DELETE FROM email_unsubscribes WHERE email = ?", email)
        .execute(&state.pool)
        .await;
    if let Err(error) = removed {
        tracing::error!(%error, "resubscribe failed");
    }
    Json(success(
        "You have been resubscribed to Noiraé emails.",
        json!([{ "email": email, "subscribed": true, "recorded": true }]),
    ))
    .into_response()
}
