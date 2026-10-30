//! `/api/users` — the account half of backend/routes/userRoutes.js: the
//! signed-in user's profile and addresses, and the admin user list / detail /
//! update / deactivate. (register, login, refresh, session, csrf-token,
//! forgot/reset-password and verify-email are ported separately.)
//!
//! Everything under `/api/users` that isn't one of those exact auth paths comes
//! to [`dispatch`], which routes the way the Express router does, so the same
//! request gets the same answer:
//!
//! * the app-level body parsers run first: `express.json()` (strict) and
//!   `express.urlencoded({ extended: true })` (qs), and a body they reject is
//!   the app error handler's 500 before any route or auth check;
//! * paths match case-insensitively with one optional trailing slash
//!   (`/PROFILE/`), `/:id(USER\d+)` only takes user ids, and a route param that
//!   `decodeURIComponent` rejects is the error handler's 500;
//! * a path or method no route takes falls through to the app's 404
//!   (`Endpoint not found` with `path` and `timestamp`), never a 405;
//! * HEAD runs the GET route, OPTIONS is the CORS preflight's empty 204;
//! * auth runs in the Node order: `protect` → `admin` → `csrfProtection`, then
//!   the route's own validation.
//!
//! Database failures answer what `executeQuery`'s `{ success: false }` makes
//! each Node route answer (404 for a failed lookup, 500 for a failed write,
//! ignored for the best-effort default-address resets).

mod qs;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{FromRequestParts, Request, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use common::json::js_number;
use common::response::{failure, failure_with, success};
use serde_json::{Value, json};

use crate::AppState;
use crate::auth::{Admin, AuthUser};
use crate::body::{is_non_empty_string, is_optional_string, js_string, truthy};
use crate::csrf::Csrf;

/// body-parser's default limit (`100kb`).
const BODY_LIMIT: usize = 100 * 1024;
/// Largest body read before giving up; anything past [`BODY_LIMIT`] is
/// rejected anyway.
const BODY_READ_LIMIT: usize = 2 * 1024 * 1024;
const USER_ROLES: [&str; 3] = ["admin", "staff", "customer"];

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

fn timestamp(ts: &Option<DateTime<Utc>>) -> Value {
    ts.as_ref()
        .map_or(Value::Null, |t| Value::String(common::timestamp::format(t)))
}

/// The app's 404 handler (`app.use('*', …)` in server.js).
fn endpoint_not_found(uri: &Uri) -> Response {
    let path = uri.path_and_query().map_or(uri.path(), |p| p.as_str());
    reply(
        StatusCode::NOT_FOUND,
        failure_with(
            "Endpoint not found",
            json!({ "path": path, "timestamp": common::timestamp::format(&Utc::now()) }),
        ),
    )
}

/// The app's error handler: what an error passed to `next(err)` (a body the
/// parsers reject, an undecodable route param) answers.
fn express_error(message: &str) -> Response {
    let error = if crate::cookies::is_production() {
        "Internal server error"
    } else {
        message
    };
    reply(
        StatusCode::INTERNAL_SERVER_ERROR,
        failure_with(
            "Internal server error",
            json!({ "timestamp": common::timestamp::format(&Utc::now()), "error": error }),
        ),
    )
}

// ---------------------------------------------------------------------------
// Request bodies (`express.json()` + `express.urlencoded({ extended: true })`)
// ---------------------------------------------------------------------------

/// The media type and `charset` parameter (lower-cased) of `Content-Type`.
fn content_type(headers: &HeaderMap) -> Option<(String, Option<String>)> {
    let ct = headers.get(header::CONTENT_TYPE)?.to_str().ok()?;
    let mut parts = ct.split(';');
    let mime = parts.next()?.trim().to_ascii_lowercase();
    let charset = parts.find_map(|p| {
        let (k, v) = p.split_once('=')?;
        k.trim()
            .eq_ignore_ascii_case("charset")
            .then(|| v.trim().trim_matches('"').to_ascii_lowercase())
    });
    Some((mime, charset))
}

/// `req.body`, or the message of the error the parser passes to `next`.
fn parse_body(headers: &HeaderMap, bytes: &[u8]) -> Result<Value, String> {
    let Some((mime, charset)) = content_type(headers) else {
        return Ok(json!({}));
    };
    match mime.as_str() {
        "application/json" => {
            let charset = charset.unwrap_or_else(|| "utf-8".into());
            if !charset.starts_with("utf-") {
                return Err(format!(
                    "unsupported charset \"{}\"",
                    charset.to_uppercase()
                ));
            }
            if bytes.len() > BODY_LIMIT {
                return Err("request entity too large".into());
            }
            let text = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
            if text.is_empty() {
                return Ok(json!({}));
            }
            let first = text
                .iter()
                .find(|b| !matches!(b, b' ' | b'\t' | b'\n' | b'\r'));
            if !matches!(first, Some(b'{' | b'[')) {
                return Err("Unexpected token in JSON (strict mode)".into());
            }
            serde_json::from_slice(text).map_err(|e| format!("Invalid JSON: {e}"))
        }
        "application/x-www-form-urlencoded" => {
            let charset = charset.unwrap_or_else(|| "utf-8".into());
            if charset != "utf-8" {
                return Err(format!(
                    "unsupported charset \"{}\"",
                    charset.to_uppercase()
                ));
            }
            if bytes.len() > BODY_LIMIT {
                return Err("request entity too large".into());
            }
            let text =
                String::from_utf8_lossy(bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes));
            if text.is_empty() {
                return Ok(json!({}));
            }
            let opts = qs::body_options(&text).ok_or("too many parameters")?;
            qs::parse(&text, &opts)
                .map(Value::Object)
                .map_err(|_| "The input exceeded the depth".to_owned())
        }
        _ => Ok(json!({})),
    }
}

/// `req.body[name]` (`None` is `undefined`; an array body has no fields).
fn field<'a>(body: &'a Value, name: &str) -> Option<&'a Value> {
    match body {
        Value::Object(map) => map.get(name),
        _ => None,
    }
}

/// A truthy string field (`if (x)` after the string checks).
fn truthy_str(v: Option<&Value>) -> Option<&str> {
    match v {
        Some(Value::String(s)) if !s.is_empty() => Some(s),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

enum Route<'a> {
    List,
    Profile,
    Addresses,
    Address(&'a str),
    AddressDefault(&'a str),
    User(&'a str),
}

/// `/:id(USER\d+)` — case-insensitive, ASCII digits.
fn is_user_id(s: &str) -> bool {
    s.len() > 4
        && s.is_char_boundary(4)
        && s[..4].eq_ignore_ascii_case("USER")
        && s[4..].bytes().all(|b| b.is_ascii_digit())
}

/// The route for the router-relative path (`req.url` under `/api/users`).
fn route(path: &str) -> Option<Route<'_>> {
    // Express's non-strict routes take one optional trailing slash.
    let p = path.strip_suffix('/').unwrap_or(path);
    if p.is_empty() {
        return Some(Route::List);
    }
    let segs: Vec<&str> = p.strip_prefix('/')?.split('/').collect();
    let is = |s: &str, name: &str| s.eq_ignore_ascii_case(name);
    match segs.as_slice() {
        [s] if is(s, "profile") => Some(Route::Profile),
        [s] if is(s, "addresses") => Some(Route::Addresses),
        [s] if is_user_id(s) => Some(Route::User(s)),
        [s, id] if is(s, "addresses") && !id.is_empty() => Some(Route::Address(id)),
        [s, id, d] if is(s, "addresses") && !id.is_empty() && is(d, "default") => {
            Some(Route::AddressDefault(id))
        }
        _ => None,
    }
}

/// Express's `decode_param`: `decodeURIComponent`, whose `URIError` goes to
/// the error handler.
fn decode_param(raw: &str) -> Result<String, Box<Response>> {
    qs::decode_uri_component(raw)
        .ok_or_else(|| Box::new(express_error(&format!("Failed to decode param '{raw}'"))))
}

/// `/api/users`, `/api/users/` and `/api/users/{*rest}` — every path of the
/// group that isn't an exact auth path.
pub async fn dispatch(State(state): State<AppState>, req: Request) -> Response {
    let (mut parts, body) = req.into_parts();
    let method = parts.method.clone();
    // cors() answers every preflight before the body parsers run.
    if method == Method::OPTIONS {
        return StatusCode::NO_CONTENT.into_response();
    }

    let parses_body = matches!(
        content_type(&parts.headers)
            .as_ref()
            .map(|(m, _)| m.as_str()),
        Some("application/json" | "application/x-www-form-urlencoded")
    );
    let bytes = if parses_body {
        match axum::body::to_bytes(body, BODY_READ_LIMIT).await {
            Ok(bytes) => bytes,
            Err(_) => return express_error("request entity too large"),
        }
    } else {
        Bytes::new()
    };
    let body = match parse_body(&parts.headers, &bytes) {
        Ok(body) => body,
        Err(message) => return express_error(&message),
    };

    let uri = parts.uri.clone();
    let rest = uri.path().strip_prefix("/api/users").unwrap_or("");
    // `app.use('/api/users', …)` matches `^\/api\/users\/?(?=\/|$)`, so one
    // extra slash belongs to the mount path: `/api/users//profile` is `/profile`.
    let rest = if rest.starts_with("//") {
        &rest[1..]
    } else {
        rest
    };
    let Some(route) = route(rest) else {
        return endpoint_not_found(&uri);
    };
    let is_get = method == Method::GET || method == Method::HEAD;
    let response = match route {
        Route::List if is_get => list_users(&state, &mut parts).await,
        Route::Profile if is_get => get_profile(&state, &mut parts).await,
        Route::Profile if method == Method::PUT => update_profile(&state, &mut parts, &body).await,
        Route::Addresses if is_get => list_addresses(&state, &mut parts).await,
        Route::Addresses if method == Method::POST => {
            create_address(&state, &mut parts, &body).await
        }
        Route::Address(raw) => {
            let id = match decode_param(raw) {
                Ok(id) => id,
                Err(response) => return *response,
            };
            match method {
                Method::PUT => update_address(&state, &mut parts, &body, &id).await,
                Method::DELETE => delete_address(&state, &mut parts, &id).await,
                _ => endpoint_not_found(&uri),
            }
        }
        Route::AddressDefault(raw) => {
            let id = match decode_param(raw) {
                Ok(id) => id,
                Err(response) => return *response,
            };
            if method == Method::PATCH {
                set_default_address(&state, &mut parts, &id).await
            } else {
                endpoint_not_found(&uri)
            }
        }
        Route::User(id) if is_get => get_user(&state, &mut parts, id).await,
        Route::User(id) if method == Method::PUT => {
            update_user(&state, &mut parts, &body, id).await
        }
        Route::User(id) if method == Method::DELETE => delete_user(&state, &mut parts, id).await,
        _ => endpoint_not_found(&uri),
    };
    if method == Method::HEAD {
        let (parts, _) = response.into_parts();
        return Response::from_parts(parts, axum::body::Body::empty());
    }
    response
}

async fn guard<G>(state: &AppState, parts: &mut Parts) -> Result<G, Response>
where
    G: FromRequestParts<AppState>,
    G::Rejection: IntoResponse,
{
    G::from_request_parts(parts, state)
        .await
        .map_err(IntoResponse::into_response)
}

macro_rules! guarded {
    ($ty:ty, $state:expr, $parts:expr) => {
        match guard::<$ty>($state, $parts).await {
            Ok(g) => g,
            Err(response) => return response,
        }
    };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/// `GET /api/users/profile`
async fn get_profile(state: &AppState, parts: &mut Parts) -> Response {
    let user = guarded!(AuthUser, state, parts);
    let row = sqlx::query!(
        r#"SELECT
             u.id,
             u.first_name,
             u.last_name,
             u.phone,
             u.email,
             CAST((
               SELECT COALESCE(
                 JSON_ARRAYAGG(
                   JSON_OBJECT(
                     'id', ua.id,
                     'type', ua.type,
                     'is_default', ua.is_default,
                     'first_name', ua.first_name,
                     'last_name', ua.last_name,
                     'phone', ua.phone,
                     'address', ua.address_json
                   )
                 ),
                 JSON_ARRAY()
               )
               FROM user_addresses ua
               WHERE ua.user_id = u.id
             ) AS CHAR) AS "addresses: String"
           FROM users u
           WHERE u.id = ?"#,
        user.id
    )
    .fetch_optional(&state.pool)
    .await;
    let row = match row {
        Ok(Some(row)) => row,
        other => {
            if let Err(e) = other {
                tracing::error!(error = %e, "get profile failed");
            }
            return reply(
                StatusCode::NOT_FOUND,
                failure_with("User not found", json!({ "error": "User not found" })),
            );
        }
    };
    let addresses = row
        .addresses
        .as_deref()
        .and_then(|s| serde_json::from_str::<Value>(s).ok())
        .unwrap_or(Value::Null);
    reply(
        StatusCode::OK,
        success(
            "User profile fetched",
            json!({
                "id": row.id,
                "first_name": row.first_name,
                "last_name": row.last_name,
                "phone": row.phone,
                "email": row.email,
                "addresses": addresses,
            }),
        ),
    )
}

/// `PUT /api/users/profile` `{ firstName?, lastName?, phone?, password?, currentPassword? }`
async fn update_profile(state: &AppState, parts: &mut Parts, body: &Value) -> Response {
    let user = guarded!(AuthUser, state, parts);
    let fail_500 = || {
        reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure_with("Failed to update profile", json!({})),
        )
    };
    let [first, last, phone, password, current] = [
        "firstName",
        "lastName",
        "phone",
        "password",
        "currentPassword",
    ]
    .map(|k| field(body, k));
    if ![first, last, phone, password, current]
        .into_iter()
        .all(is_optional_string)
    {
        return reply(
            StatusCode::BAD_REQUEST,
            failure("Profile fields must be strings"),
        );
    }
    let (first, last, phone) = (truthy_str(first), truthy_str(last), truthy_str(phone));
    let mut updated = [first, last, phone].iter().filter(|v| v.is_some()).count();

    let mut new_hash = None;
    if let Some(password) = truthy_str(password) {
        // Changing the password requires the current one.
        let Some(current) = truthy_str(current) else {
            return reply(
                StatusCode::BAD_REQUEST,
                failure("Current password is required to set a new password"),
            );
        };
        if let Some(message) = crate::password::validate_strength(password) {
            return reply(StatusCode::BAD_REQUEST, failure(message));
        }
        let stored = sqlx::query_scalar!("SELECT password_hash FROM users WHERE id = ?", user.id)
            .fetch_optional(&state.pool)
            .await;
        let Ok(Some(stored)) = stored else {
            return reply(StatusCode::NOT_FOUND, failure("User not found"));
        };
        match crate::password::verify(current, &stored).await {
            Ok(true) => {}
            Ok(false) => {
                return reply(
                    StatusCode::UNAUTHORIZED,
                    failure("Current password is incorrect"),
                );
            }
            Err(e) => {
                tracing::error!(error = %e, "update profile: password check failed");
                return fail_500();
            }
        }
        match crate::password::hash(password).await {
            Ok(hash) => new_hash = Some(hash),
            Err(e) => {
                tracing::error!(error = %e, "update profile: hashing failed");
                return fail_500();
            }
        }
        updated += 1;
    }

    if updated == 0 {
        return reply(
            StatusCode::BAD_REQUEST,
            failure_with(
                "No update fields provided",
                json!({ "error": "No fields to update" }),
            ),
        );
    }
    // Columns left NULL keep their value, like Node's SET list without them.
    let result = sqlx::query!(
        "UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
           phone = COALESCE(?, phone), password_hash = COALESCE(?, password_hash)
         WHERE id = ?",
        first,
        last,
        phone,
        new_hash,
        user.id
    )
    .execute(&state.pool)
    .await;
    if let Err(e) = result {
        tracing::error!(error = %e, "update profile failed");
        return fail_500();
    }
    reply(
        StatusCode::OK,
        success(
            "Profile updated",
            json!({ "userId": user.id, "updatedFields": updated }),
        ),
    )
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/// `user_addresses.type` is ENUM('shipping','billing'); absent means shipping.
fn is_address_type(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => true,
        Some(Value::String(s)) => matches!(s.as_str(), "" | "shipping" | "billing"),
        _ => false,
    }
}

/// `GET /api/users/addresses`
async fn list_addresses(state: &AppState, parts: &mut Parts) -> Response {
    let user = guarded!(AuthUser, state, parts);
    let rows = sqlx::query!(
        r#"SELECT id, type AS "addr_type: String", is_default AS "is_default: i8", first_name, last_name, phone,
             address_json AS "address_json: Value"
           FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC"#,
        user.id
    )
    .fetch_all(&state.pool)
    .await;
    let fail = || {
        reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure("Failed to fetch addresses"),
        )
    };
    let rows = match rows {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!(error = %e, "list addresses failed");
            return fail();
        }
    };
    let mut addresses = Vec::with_capacity(rows.len());
    for r in rows {
        // `typeof address_json === 'string' ? JSON.parse(...) : address_json`
        let address = match &r.address_json {
            Value::String(s) => match serde_json::from_str::<Value>(s) {
                Ok(v) => v,
                Err(_) => return fail(),
            },
            other => other.clone(),
        };
        addresses.push(json!({
            "id": r.id,
            "type": r.addr_type,
            "is_default": r.is_default,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "phone": r.phone,
            "address_json": r.address_json,
            "address": address,
        }));
    }
    reply(
        StatusCode::OK,
        success("Addresses fetched", json!({ "addresses": addresses })),
    )
}

/// `POST /api/users/addresses`
async fn create_address(state: &AppState, parts: &mut Parts, body: &Value) -> Response {
    let user = guarded!(AuthUser, state, parts);
    let f = |k: &str| field(body, k);
    let required = [
        "first_name",
        "last_name",
        "address_line_1",
        "city",
        "state",
        "postal_code",
        "country",
    ];
    if !required.iter().all(|k| is_non_empty_string(f(k))) {
        return reply(
            StatusCode::BAD_REQUEST,
            failure("Required address fields missing"),
        );
    }
    if !(is_optional_string(f("phone")) && is_optional_string(f("address_line_2")))
        || !is_address_type(f("type"))
    {
        return reply(StatusCode::BAD_REQUEST, failure("Invalid address fields"));
    }
    let fail = || {
        reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure("Failed to create address"),
        )
    };
    let s = |k: &str| truthy_str(f(k)).unwrap_or("");

    let address_id = match sqlx::query_scalar!(r#"SELECT get_next_id("ADDR") as "id: String""#)
        .fetch_one(&state.pool)
        .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!(error = %e, "create address: get_next_id failed");
            return fail();
        }
    };
    let address_json = json!({
        "address_line_1": s("address_line_1"),
        "address_line_2": s("address_line_2"),
        "city": s("city"),
        "state": s("state"),
        "postal_code": s("postal_code"),
        "country": s("country"),
    })
    .to_string();
    let addr_type = truthy_str(f("type")).unwrap_or("shipping");
    let is_default = truthy(f("is_default"));

    // A new default replaces the old one of the same type (best effort, as in Node).
    if is_default
        && let Err(e) = sqlx::query!(
            "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ? AND type = ?",
            user.id,
            addr_type
        )
        .execute(&state.pool)
        .await
    {
        tracing::warn!(error = %e, "create address: clearing defaults failed");
    }

    let inserted = sqlx::query!(
        "INSERT INTO user_addresses (id, user_id, type, is_default, first_name, last_name, phone, address_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        address_id,
        user.id,
        addr_type,
        i8::from(is_default),
        s("first_name"),
        s("last_name"),
        truthy_str(f("phone")),
        address_json
    )
    .execute(&state.pool)
    .await;
    if let Err(e) = inserted {
        // e.g. a 3-letter country (the idx_country functional index is CHAR(2))
        tracing::error!(error = %e, "create address: insert failed");
        return fail();
    }
    reply(
        StatusCode::CREATED,
        success("Address created", json!({ "addressId": address_id })),
    )
}

/// `PUT /api/users/addresses/:id` (own addresses only)
async fn update_address(state: &AppState, parts: &mut Parts, body: &Value, id: &str) -> Response {
    let user = guarded!(AuthUser, state, parts);
    let not_found = || reply(StatusCode::NOT_FOUND, failure("Address not found"));
    let owned = sqlx::query_scalar!(
        "SELECT id FROM user_addresses WHERE id = ? AND user_id = ?",
        id,
        user.id
    )
    .fetch_optional(&state.pool)
    .await;
    if !matches!(owned, Ok(Some(_))) {
        return not_found();
    }

    let f = |k: &str| field(body, k);
    let strings = [
        "first_name",
        "last_name",
        "phone",
        "address_line_1",
        "address_line_2",
        "city",
        "state",
        "postal_code",
        "country",
    ];
    if !strings.iter().all(|k| is_optional_string(f(k))) || !is_address_type(f("type")) {
        return reply(StatusCode::BAD_REQUEST, failure("Invalid address fields"));
    }

    let addr_type = truthy_str(f("type"));
    let first = truthy_str(f("first_name"));
    let last = truthy_str(f("last_name"));
    // `phone !== undefined`: present (even null or '') sets it, `phone || null`.
    let set_phone = f("phone").is_some();
    let phone = truthy_str(f("phone"));
    let address_keys = ["address_line_1", "city", "state", "postal_code", "country"];
    let address_json = address_keys
        .iter()
        .any(|k| truthy_str(f(k)).is_some())
        .then(|| {
            let s = |k: &str| truthy_str(f(k)).unwrap_or("");
            json!({
                "address_line_1": s("address_line_1"),
                "address_line_2": s("address_line_2"),
                "city": s("city"),
                "state": s("state"),
                "postal_code": s("postal_code"),
                "country": s("country"),
            })
            .to_string()
        });
    let is_default = truthy(f("is_default"));
    if is_default
        && let Err(e) = sqlx::query!(
            "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ? AND type = ?",
            user.id,
            addr_type.unwrap_or("shipping")
        )
        .execute(&state.pool)
        .await
    {
        tracing::warn!(error = %e, "update address: clearing defaults failed");
    }

    let updates = [
        addr_type.is_some(),
        first.is_some(),
        last.is_some(),
        set_phone,
        address_json.is_some(),
        is_default,
    ];
    if !updates.contains(&true) {
        return reply(StatusCode::BAD_REQUEST, failure("No fields to update"));
    }
    let result = sqlx::query!(
        "UPDATE user_addresses SET type = COALESCE(?, type), first_name = COALESCE(?, first_name),
           last_name = COALESCE(?, last_name), phone = IF(?, ?, phone),
           address_json = COALESCE(?, address_json), is_default = IF(?, TRUE, is_default)
         WHERE id = ?",
        addr_type,
        first,
        last,
        set_phone,
        phone,
        address_json,
        is_default,
        id
    )
    .execute(&state.pool)
    .await;
    if let Err(e) = result {
        tracing::error!(error = %e, "update address failed");
        return reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure("Failed to update address"),
        );
    }
    reply(StatusCode::OK, success("Address updated", json!([])))
}

/// `DELETE /api/users/addresses/:id` (own addresses only)
async fn delete_address(state: &AppState, parts: &mut Parts, id: &str) -> Response {
    let user = guarded!(AuthUser, state, parts);
    let done = sqlx::query!(
        "DELETE FROM user_addresses WHERE id = ? AND user_id = ?",
        id,
        user.id
    )
    .execute(&state.pool)
    .await;
    match done {
        Ok(done) if done.rows_affected() > 0 => {
            reply(StatusCode::OK, success("Address deleted", json!([])))
        }
        _ => reply(StatusCode::NOT_FOUND, failure("Address not found")),
    }
}

/// `PATCH /api/users/addresses/:id/default`
async fn set_default_address(state: &AppState, parts: &mut Parts, id: &str) -> Response {
    let user = guarded!(AuthUser, state, parts);
    let row = sqlx::query!(
        r#"SELECT id, type AS "addr_type: String" FROM user_addresses WHERE id = ? AND user_id = ?"#,
        id,
        user.id
    )
    .fetch_optional(&state.pool)
    .await;
    let Ok(Some(row)) = row else {
        return reply(StatusCode::NOT_FOUND, failure("Address not found"));
    };
    if let Err(e) = sqlx::query!(
        "UPDATE user_addresses SET is_default = FALSE WHERE user_id = ? AND type = ?",
        user.id,
        row.addr_type
    )
    .execute(&state.pool)
    .await
    {
        tracing::warn!(error = %e, "set default address: clearing defaults failed");
    }
    if let Err(e) = sqlx::query!(
        "UPDATE user_addresses SET is_default = TRUE WHERE id = ?",
        id
    )
    .execute(&state.pool)
    .await
    {
        tracing::warn!(error = %e, "set default address failed");
    }
    reply(
        StatusCode::OK,
        success("Default address updated", json!([])),
    )
}

// ---------------------------------------------------------------------------
// Admin: users
// ---------------------------------------------------------------------------

/// `Number.parseInt(String(v), 10)` as a JS number (NaN when there are no
/// digits; huge digit runs stay as large doubles, as in JS).
fn parse_int(v: Option<&Value>) -> f64 {
    let Some(v) = v else { return f64::NAN };
    let s = js_string(v);
    let s = s.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    let (sign, digits) = match s.as_bytes().first() {
        Some(b'-') => (-1.0, &s[1..]),
        Some(b'+') => (1.0, &s[1..]),
        _ => (1.0, s),
    };
    let end = digits
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(digits.len());
    if end == 0 {
        return f64::NAN;
    }
    sign * digits[..end].parse::<f64>().unwrap_or(f64::NAN)
}

/// `x || fallback` for a number.
fn or(x: f64, fallback: f64) -> f64 {
    if x.is_nan() || x == 0.0 { fallback } else { x }
}

/// `GET /api/users?limit=&page=` (admin)
async fn list_users(state: &AppState, parts: &mut Parts) -> Response {
    let _admin = guarded!(Admin, state, parts);
    let query = qs::parse(parts.uri.query().unwrap_or(""), &qs::QUERY).unwrap_or_default();
    let fail = || {
        reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure_with("Failed to get users", json!({})),
        )
    };
    let limit = or(parse_int(query.get("limit")), 10.0).clamp(1.0, 100.0);
    let page = or(parse_int(query.get("page")), 1.0).max(1.0);
    let offset = (page - 1.0) * limit;
    // Node inlines `${offset}`: past u64 (or as `1e+21`) MySQL rejects the SQL.
    if !offset.is_finite() || offset >= 18_446_744_073_709_551_616.0 {
        return fail();
    }
    let rows = sqlx::query!(
        r#"SELECT id, email, first_name, last_name, role AS "role: String", status AS "status: String", created_at
           FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?"#,
        limit as u64,
        offset as u64
    )
    .fetch_all(&state.pool)
    .await;
    let rows = match rows {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!(error = %e, "list users failed");
            return fail();
        }
    };
    let users: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "email": r.email,
                "first_name": r.first_name,
                "last_name": r.last_name,
                "role": r.role,
                "status": r.status,
                "created_at": timestamp(&r.created_at),
            })
        })
        .collect();
    reply(
        StatusCode::OK,
        success(
            "Users fetched",
            json!({ "users": users, "page": js_number(page), "limit": js_number(limit) }),
        ),
    )
}

/// `GET /api/users/:id(USER\d+)` (admin)
async fn get_user(state: &AppState, parts: &mut Parts, id: &str) -> Response {
    let _admin = guarded!(Admin, state, parts);
    let row = sqlx::query!(
        r#"SELECT id, email, first_name, last_name, phone, role AS "role: String", status AS "status: String",
             email_verified AS "email_verified: i8", last_login, created_at
           FROM users WHERE id = ?"#,
        id
    )
    .fetch_optional(&state.pool)
    .await;
    let Ok(Some(r)) = row else {
        if let Err(e) = row {
            tracing::error!(error = %e, "get user failed");
        }
        return reply(
            StatusCode::NOT_FOUND,
            failure_with("User not found", json!({ "error": "User not found" })),
        );
    };
    reply(
        StatusCode::OK,
        success(
            "User fetched",
            json!({
                "id": r.id,
                "email": r.email,
                "first_name": r.first_name,
                "last_name": r.last_name,
                "phone": r.phone,
                "role": r.role,
                "status": r.status,
                "email_verified": r.email_verified,
                "last_login": timestamp(&r.last_login),
                "created_at": timestamp(&r.created_at),
            }),
        ),
    )
}

/// `PUT /api/users/:id(USER\d+)` `{ firstName?, lastName?, email?, role? }`
/// (admin + CSRF). A role change bumps `token_version`, revoking the user's
/// tokens.
async fn update_user(state: &AppState, parts: &mut Parts, body: &Value, id: &str) -> Response {
    let Csrf(Admin(_admin)) = guarded!(Csrf<Admin>, state, parts);
    let [first, last, email, role] =
        ["firstName", "lastName", "email", "role"].map(|k| field(body, k));
    if ![first, last, email].into_iter().all(is_optional_string) {
        return reply(
            StatusCode::BAD_REQUEST,
            failure("Name and email must be strings"),
        );
    }
    let (first, last, email) = (truthy_str(first), truthy_str(last), truthy_str(email));
    let mut updated = [first, last, email].iter().filter(|v| v.is_some()).count();
    let role = match role {
        None => None,
        Some(Value::String(r)) if USER_ROLES.contains(&r.as_str()) => Some(r.as_str()),
        Some(_) => return reply(StatusCode::BAD_REQUEST, failure("Invalid role")),
    };
    if role.is_some() {
        updated += 1;
    }
    if updated == 0 {
        return reply(
            StatusCode::BAD_REQUEST,
            failure_with(
                "No update fields provided",
                json!({ "error": "No fields to update" }),
            ),
        );
    }
    let result = sqlx::query!(
        "UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
           email = COALESCE(?, email), role = COALESCE(?, role), token_version = token_version + ?
         WHERE id = ?",
        first,
        last,
        email,
        role,
        i32::from(role.is_some()),
        id
    )
    .execute(&state.pool)
    .await;
    match result {
        Ok(done) if done.rows_affected() > 0 => reply(
            StatusCode::OK,
            success(
                "User updated",
                json!({ "userId": id, "updatedFields": updated }),
            ),
        ),
        Ok(_) => reply(StatusCode::NOT_FOUND, failure("User not found")),
        Err(e) => {
            tracing::error!(error = %e, "update user failed");
            reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure_with("Failed to update user", json!({})),
            )
        }
    }
}

/// `DELETE /api/users/:id(USER\d+)` (admin + CSRF): deactivate the account and
/// revoke its sessions (token_version bump, refresh tokens deleted).
async fn delete_user(state: &AppState, parts: &mut Parts, id: &str) -> Response {
    let Csrf(Admin(_admin)) = guarded!(Csrf<Admin>, state, parts);
    let result = sqlx::query!(
        "UPDATE users SET status = 'inactive', token_version = token_version + 1 WHERE id = ?",
        id
    )
    .execute(&state.pool)
    .await;
    if !matches!(&result, Ok(done) if done.rows_affected() > 0) {
        if let Err(e) = result {
            tracing::error!(error = %e, "delete user failed");
        }
        return reply(
            StatusCode::NOT_FOUND,
            failure_with("User not found", json!({ "error": "User not found" })),
        );
    }
    if let Err(e) = sqlx::query!("DELETE FROM refresh_tokens WHERE user_id = ?", id)
        .execute(&state.pool)
        .await
    {
        tracing::warn!(error = %e, "delete user: revoking refresh tokens failed");
    }
    reply(
        StatusCode::OK,
        success("User deleted", json!({ "userId": id })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_like_the_express_router() {
        let name = |p: &str| match route(p) {
            None => "404".to_owned(),
            Some(Route::List) => "list".into(),
            Some(Route::Profile) => "profile".into(),
            Some(Route::Addresses) => "addresses".into(),
            Some(Route::Address(id)) => format!("address:{id}"),
            Some(Route::AddressDefault(id)) => format!("default:{id}"),
            Some(Route::User(id)) => format!("user:{id}"),
        };
        assert_eq!(name(""), "list");
        assert_eq!(name("/"), "list");
        assert_eq!(name("//"), "404");
        assert_eq!(name("/profile"), "profile");
        assert_eq!(name("/PROFILE/"), "profile");
        assert_eq!(name("/profile//"), "404");
        assert_eq!(name("/addresses"), "addresses");
        assert_eq!(name("/addresses/"), "addresses");
        assert_eq!(name("/addresses//"), "404");
        assert_eq!(name("/addresses/ADDR1"), "address:ADDR1");
        assert_eq!(name("/addresses/default"), "address:default");
        assert_eq!(name("/Addresses/a%20b/Default/"), "default:a%20b");
        assert_eq!(name("/addresses/a/b"), "404");
        assert_eq!(name("/USER0000000001"), "user:USER0000000001");
        assert_eq!(name("/user12/"), "user:user12");
        assert_eq!(name("/USER"), "404");
        assert_eq!(name("/USER1a"), "404");
        assert_eq!(name("/%55SER1"), "404");
        assert_eq!(name("/login"), "404");
        assert_eq!(name("/USER1/x"), "404");
    }

    /// The auth half registers exact paths next to this module's catch-all:
    /// matchit prefers them, and only their exact spelling.
    #[tokio::test]
    async fn exact_routes_take_precedence_over_the_catch_all() {
        use axum::routing::{any, post};
        use tower::ServiceExt;
        let app: axum::Router = axum::Router::new()
            .route("/api/users/login", post(|| async { "login" }))
            .route("/api/users", any(|| async { "account" }))
            .route("/api/users/", any(|| async { "account" }))
            .route("/api/users/{*rest}", any(|| async { "account" }));
        for (method, uri, expected) in [
            ("POST", "/api/users/login", "login"),
            ("POST", "/api/users/login/", "account"),
            ("POST", "/api/users/LOGIN", "account"),
            ("GET", "/api/users/profile", "account"),
            ("GET", "/api/users/addresses/A/default", "account"),
            ("GET", "/api/users", "account"),
            ("GET", "/api/users/", "account"),
            ("GET", "/api/users//", "account"),
        ] {
            let req = Request::builder()
                .method(method)
                .uri(uri)
                .body(axum::body::Body::empty())
                .unwrap();
            let res = app.clone().oneshot(req).await.unwrap();
            let body = axum::body::to_bytes(res.into_body(), 64).await.unwrap();
            assert_eq!((method, uri, &body[..]), (method, uri, expected.as_bytes()));
        }
    }

    #[test]
    fn parse_int_is_javascript_parse_int() {
        let p = |v: Value| parse_int(Some(&v));
        assert_eq!(p(json!("5")), 5.0);
        assert_eq!(p(json!(" 12abc")), 12.0);
        assert_eq!(p(json!(["7", "8"])), 7.0);
        assert!(p(json!({ "a": "1" })).is_nan());
        assert!(p(json!("")).is_nan());
        assert_eq!(p(json!("-3")), -3.0);
        assert_eq!(p(json!("99999999999999999999")), 1e20);
        assert!(parse_int(None).is_nan());
    }

    #[test]
    fn bodies_like_express() {
        let h = |ct: &str| {
            let mut h = HeaderMap::new();
            h.insert(header::CONTENT_TYPE, ct.parse().unwrap());
            h
        };
        let json_ct = h("application/json");
        assert_eq!(parse_body(&json_ct, b""), Ok(json!({})));
        assert_eq!(parse_body(&json_ct, b"[1]"), Ok(json!([1])));
        assert!(parse_body(&json_ct, b"null").is_err());
        assert!(parse_body(&json_ct, b"{").is_err());
        assert!(parse_body(&h("application/json; charset=latin1"), b"{}").is_err());
        assert_eq!(parse_body(&h("text/plain"), b"{"), Ok(json!({})));
        assert_eq!(
            parse_body(
                &h("application/x-www-form-urlencoded"),
                b"firstName=A+b&x[]=1"
            ),
            Ok(json!({ "firstName": "A b", "x": ["1"] }))
        );
        assert_eq!(parse_body(&HeaderMap::new(), b"{"), Ok(json!({})));
    }
}
