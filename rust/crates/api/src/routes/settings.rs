//! `/api/settings` — the whole group (port of
//! backend/routes/systemSettingsRoutes.js): `GET /public`, the storefront's
//! public settings, and `GET /all`, every setting with its type and
//! visibility (`protect, admin`).
//!
//! Every path under the mount goes through [`dispatch`], routed like the
//! Express router ([`crate::express_router`]: case-insensitive, optional
//! trailing slash, HEAD answered by GET), after the app's body parsers (a
//! body they reject is the error handler's 500); anything else is the app's
//! 404.

use axum::Json;
use axum::extract::{FromRequestParts, Request, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use common::json::js_number;
use common::response::{failure_with, success};
use serde_json::{Map, Value, json};

use crate::AppState;
use crate::auth::Admin;
use crate::express_router::{self as express, Routed, Verb};
use crate::params::js_parse_int;

/// Where the group is mounted (`app.use('/api/settings', ...)`).
pub const PREFIX: &str = "/api/settings";

#[derive(Debug, Clone, Copy)]
enum R {
    Public,
    All,
}

/// systemSettingsRoutes.js, in registration order.
const ROUTES: &[(Verb, &str, R)] = &[
    (Verb::Get, "/public", R::Public),
    (Verb::Get, "/all", R::All),
];

/// `/api/settings` and every path below it, all to [`dispatch`].
pub fn router() -> axum::Router<AppState> {
    let all = axum::routing::any(dispatch);
    axum::Router::new()
        .route(PREFIX, all.clone())
        .route(&format!("{PREFIX}/"), all.clone())
        .route(&format!("{PREFIX}/{{*path}}"), all)
}

/// Every request under `/api/settings`.
pub async fn dispatch(State(state): State<AppState>, req: Request) -> Response {
    let (mut parts, body) = req.into_parts();
    // express.json() / express.urlencoded() run before any route.
    if let Err(response) = crate::express::read_body(&parts.headers, body).await {
        return response;
    }
    let path = parts.uri.path().strip_prefix(PREFIX).unwrap_or_default();
    let route = match express::route(ROUTES, &parts.method, path) {
        Routed::Route(route, _) => route,
        Routed::NotFound => return crate::express::not_found(&parts.uri),
        Routed::Error(message) => return crate::express::internal_error(&message),
    };
    match route {
        R::Public => public(&state).await,
        R::All => match Admin::from_request_parts(&mut parts, &state).await {
            Ok(_) => all(&state).await,
            Err(denied) => denied.into_response(),
        },
    }
}

/// The routes' `catch`: 500 with the error's message and a timestamp.
fn fetch_failed(err: &sqlx::Error) -> Response {
    tracing::error!(error = %err, "Error fetching system settings");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(failure_with(
            "Failed to fetch system settings",
            json!({
                "error": crate::mysql_json::error_message(err),
                "timestamp": crate::express::now_iso(),
            }),
        )),
    )
        .into_response()
}

/// Convert a stored setting the way the Node route does: booleans from
/// `'true'`/`'1'`, `parseInt` / `parseFloat` (NaN → null), JSON parsed when
/// valid (else left as the string), strings as-is.
pub fn typed_value(setting_type: &str, raw: Option<&str>) -> Value {
    match setting_type {
        "boolean" => Value::Bool(matches!(raw, Some("true" | "1"))),
        "integer" => raw
            .and_then(js_parse_int)
            .map_or(Value::Null, |n| Value::Number(n.into())),
        "decimal" => raw.and_then(js_parse_float).map_or(Value::Null, js_number),
        "json" => match raw {
            None => Value::Null,
            // JSON.parse: whole doubles are plain numbers (`1.0` is `1`).
            Some(s) => serde_json::from_str(s)
                .map(crate::express_router::js_json)
                .unwrap_or_else(|_| Value::String(s.to_owned())),
        },
        _ => raw.map_or(Value::Null, |s| Value::String(s.to_owned())),
    }
}

/// JavaScript `parseFloat`: the longest leading decimal number, or `None` (NaN).
fn js_parse_float(s: &str) -> Option<f64> {
    let s = s.trim_start();
    let mut end = 0;
    let (mut seen_digit, mut seen_dot, mut seen_exp) = (false, false, false);
    for (i, c) in s.char_indices() {
        match c {
            '+' | '-' if i == 0 || s[..i].ends_with(['e', 'E']) => {}
            '0'..='9' => seen_digit = true,
            '.' if !seen_dot && !seen_exp => seen_dot = true,
            'e' | 'E' if seen_digit && !seen_exp => seen_exp = true,
            _ => break,
        }
        if c.is_ascii_digit() {
            end = i + 1;
        }
    }
    s[..end].parse::<f64>().ok().filter(|f| f.is_finite())
}

/// `GET /public`: the `is_public` settings, typed, by key.
async fn public(state: &AppState) -> Response {
    let rows = match sqlx::query!(
        "SELECT setting_key, setting_value, setting_type FROM system_settings
         WHERE is_public = 1 ORDER BY setting_key"
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(rows) => rows,
        Err(err) => return fetch_failed(&err),
    };
    let settings: Map<String, Value> = rows
        .into_iter()
        .map(|r| {
            let value = typed_value(&r.setting_type, r.setting_value.as_deref());
            (r.setting_key, value)
        })
        .collect();
    Json(success(
        "Public system settings retrieved successfully",
        settings,
    ))
    .into_response()
}

/// `GET /all` (admin): every setting as `{ value, type, is_public }`.
async fn all(state: &AppState) -> Response {
    let rows = match sqlx::query!(
        r#"SELECT setting_key, setting_value, setting_type AS "setting_type: String", is_public
           FROM system_settings
           ORDER BY setting_key"#
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(rows) => rows,
        Err(err) => return fetch_failed(&err),
    };
    let settings: Map<String, Value> = rows
        .into_iter()
        .map(|r| {
            let value = typed_value(&r.setting_type, r.setting_value.as_deref());
            let entry = json!({
                "value": value,
                "type": r.setting_type,
                "is_public": r.is_public,
            });
            (r.setting_key, entry)
        })
        .collect();
    Json(success(
        "All system settings retrieved successfully",
        settings,
    ))
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn values_are_typed_like_the_node_route() {
        assert_eq!(typed_value("boolean", Some("true")), json!(true));
        assert_eq!(typed_value("boolean", Some("1")), json!(true));
        assert_eq!(typed_value("boolean", Some("yes")), json!(false));
        assert_eq!(typed_value("boolean", None), json!(false));
        assert_eq!(typed_value("integer", Some("3600s")), json!(3600));
        assert_eq!(typed_value("integer", Some("x")), Value::Null);
        assert_eq!(typed_value("decimal", Some("8.25")), json!(8.25));
        assert_eq!(
            typed_value("decimal", Some("10.0")),
            json!(10),
            "JSON.stringify(10.0) is 10"
        );
        assert_eq!(typed_value("decimal", Some("1e3abc")), json!(1000));
        assert_eq!(typed_value("decimal", Some(".5")), json!(0.5));
        assert_eq!(typed_value("json", Some(r#"["a"]"#)), json!(["a"]));
        assert_eq!(typed_value("json", Some("{bad")), json!("{bad"));
        assert_eq!(typed_value("json", Some(r#"{"a":1.0}"#)), json!({"a": 1}));
        assert_eq!(typed_value("json", Some("2.50")), json!(2.5));
        assert_eq!(typed_value("string", Some("USD")), json!("USD"));
        assert_eq!(typed_value("string", None), Value::Null);
    }
}
