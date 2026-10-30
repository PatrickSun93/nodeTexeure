//! `/api/abandoned-cart` — the recovery links in abandoned-cart emails (port of
//! backend/routes/abandonedCartRoutes.js). Public: the 64-hex `recovery_token`
//! (crypto.randomBytes(32), UNIQUE on `abandoned_cart_recovery`) is the
//! capability that lets the holder read that cart.
//!
//! A valid token marks the cart recovered (once: only a row whose
//! `recovered_at` is NULL changes, and then the address's pending recovery
//! emails are cancelled) and returns the cart lines plus where to send the
//! shopper next.

use axum::Json;
use axum::extract::State;
use axum::http::{StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use common::response::{failure, failure_with, success};
use serde::Serialize;
use serde_json::json;
use sqlx::MySqlPool;

use crate::AppState;
use crate::email_queue;
use crate::routes::cart::js_space;

const RECOVERY_PREFIX: &str = "/api/abandoned-cart/recovery/";

fn reply(status: StatusCode, body: serde_json::Value) -> Response {
    (status, Json(body)).into_response()
}

/// JavaScript's `decodeURIComponent`: `%XX` escapes must spell valid UTF-8
/// (else URIError); everything else is kept as is.
fn decode_uri_component(raw: &str) -> Option<String> {
    let b = raw.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = raw.get(i + 1..i + 3)?;
            if !hex.bytes().all(|c| c.is_ascii_hexdigit()) {
                return None;
            }
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// What backend/server.js's error handler sends when Express's router fails
/// to decode a route parameter (`Failed to decode param '…'`).
fn bad_param(raw: &str) -> Response {
    let error = if crate::cookies::is_production() {
        "Internal server error".to_owned()
    } else {
        format!("Failed to decode param '{raw}'")
    };
    reply(
        StatusCode::INTERNAL_SERVER_ERROR,
        failure_with(
            "Internal server error",
            json!({ "timestamp": common::timestamp::format(&Utc::now()), "error": error }),
        ),
    )
}

/// One cart line, in the column order of Node's SELECT.
#[derive(Debug, Serialize)]
pub struct RecoveredLine {
    pub product_id: String,
    pub variant_id: Option<String>,
    pub quantity: u32,
    pub price: String,
    pub name: String,
}

/// `AbandonedCartService.markCartRecovered(cartId, null)`: errors are logged
/// and ignored (the shopper still gets the cart back).
async fn mark_cart_recovered(pool: &MySqlPool, cart_id: &str) {
    let marked = sqlx::query!(
        "UPDATE abandoned_cart_recovery
         SET recovered_at = NOW(), recovery_order_id = ?
         WHERE cart_id = ? AND recovered_at IS NULL",
        None::<String>,
        cart_id
    )
    .execute(pool)
    .await;
    match marked {
        Ok(done) if done.rows_affected() > 0 => {}
        Ok(_) => return,
        Err(error) => {
            tracing::error!(%error, cart_id, "failed to mark cart as recovered");
            return;
        }
    }
    let email = sqlx::query_scalar!(
        "SELECT email FROM abandoned_cart_recovery
         WHERE cart_id = ? AND recovered_at IS NOT NULL
         LIMIT 1",
        cart_id
    )
    .fetch_optional(pool)
    .await;
    match email {
        Ok(Some(email)) => {
            email_queue::cancel_abandoned_cart_emails(pool, &email).await;
        }
        Ok(None) => {}
        Err(error) => tracing::error!(%error, cart_id, "failed to read the recovered cart's email"),
    }
}

/// `GET /api/abandoned-cart/recovery/{token}`
pub async fn recovery(State(state): State<AppState>, uri: Uri) -> Response {
    // Express hands the route the decoded segment; a bad escape is an error.
    let raw = uri.path().strip_prefix(RECOVERY_PREFIX).unwrap_or_default();
    let Some(decoded) = decode_uri_component(raw) else {
        return bad_param(raw);
    };
    let token = decoded.trim_matches(js_space);
    // recovery_token is 64 hex chars; junk is rejected before the database.
    let units = token.encode_utf16().count();
    if token.is_empty() || !(16..=255).contains(&units) {
        return reply(StatusCode::BAD_REQUEST, failure("Invalid recovery link"));
    }

    let recovery = sqlx::query!(
        "SELECT id, cart_id, email, recovered_at FROM abandoned_cart_recovery
         WHERE recovery_token = ? LIMIT 1",
        token
    )
    .fetch_optional(&state.pool)
    .await
    .unwrap_or_else(|error| {
        tracing::error!(%error, "recovery lookup failed");
        None
    });
    let Some(recovery) = recovery else {
        return reply(
            StatusCode::NOT_FOUND,
            failure("This recovery link is invalid or has expired"),
        );
    };

    mark_cart_recovered(&state.pool, &recovery.cart_id).await;

    // A failed read is an empty cart (`DatabaseUtil.rows`).
    let items = sqlx::query_as!(
        RecoveredLine,
        r#"SELECT ci.product_id, ci.variant_id, ci.quantity,
             CAST(ci.price AS CHAR) AS "price!: String", p.name
           FROM cart_items ci
           JOIN products p ON ci.product_id = p.id
           WHERE ci.cart_id = ?"#,
        recovery.cart_id
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_else(|error| {
        tracing::error!(%error, "reading the recovered cart failed");
        Vec::new()
    });

    let redirect_to = if items.is_empty() {
        "/cart"
    } else {
        "/checkout"
    };
    reply(
        StatusCode::OK,
        success(
            "Cart recovered",
            json!({
                "cartId": recovery.cart_id,
                "itemCount": items.len(),
                "items": items,
                "redirectTo": redirect_to,
            }),
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_like_decode_uri_component() {
        assert_eq!(decode_uri_component("abc").as_deref(), Some("abc"));
        assert_eq!(decode_uri_component("a%20b").as_deref(), Some("a b"));
        assert_eq!(decode_uri_component("a+b").as_deref(), Some("a+b"));
        assert_eq!(decode_uri_component("%2F").as_deref(), Some("/"));
        assert_eq!(decode_uri_component("%C3%A9").as_deref(), Some("é"));
        for bad in ["%", "%z1", "%1", "%C3", "%FF", "%ED%A0%80", "%C0%AF"] {
            assert_eq!(decode_uri_component(bad), None, "{bad}");
        }
    }

    #[test]
    fn trims_javascript_white_space_only() {
        assert_eq!("\u{feff} a \n".trim_matches(js_space), "a");
        assert_eq!("\u{85}a".trim_matches(js_space), "\u{85}a");
    }
}
