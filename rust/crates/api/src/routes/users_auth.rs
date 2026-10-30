//! `/api/users` — the auth half of backend/routes/userRoutes.js: register,
//! login (with the guest-cart merge and its cookies), refresh, session,
//! forgot/reset password, email verification and the back-office CSRF token.
//! The account half (profile, addresses, admin user CRUD) is in
//! `users_account.rs`; together they serve the whole group.
//!
//! Express details reproduced here, beyond the handlers themselves:
//!
//! * **Bodies** are what `express.json()` + `express.urlencoded({ extended })`
//!   hand the route: JSON only for `application/json`, form bodies through `qs`
//!   (only "is it a string" matters to these routes, see [`qs`]), anything else
//!   `{}`. A body the parsers reject (bad JSON, unsupported charset, too large,
//!   too many/too deep form keys) is the app's error handler answer: 500
//!   `Internal server error` with `{ timestamp, error }`.
//! * **Query strings** (`GET /verify-email?token=`) go through the same `qs`
//!   rules: `?token=a&token=b` and `?token[x]=y` are not strings.
//! * **Rate limits**: each route has its Node limiter (`ratelimit::presets`),
//!   counted only for the route's own method, after the body parser.
//! * **Other methods** on these paths fall through Express's router to the app's
//!   404 (`Endpoint not found` with `{ path, timestamp }`), not 405.

use axum::Json;
use axum::Router;
use axum::body::Bytes;
use axum::extract::{RawQuery, State};
use axum::handler::Handler;
use axum::http::{HeaderMap, HeaderValue, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use chrono::{DateTime, Datelike, Utc};
use common::response::{failure, failure_with, success};
use serde_json::{Map, Value, json};
use sqlx::MySqlPool;

use crate::AppState;
use crate::auth::{OptionalUser, StaffOrAdmin};
use crate::body::is_non_empty_string;
use crate::client_ip::TrustProxy;
use crate::cookies::{self, CookieOptions};
use crate::ratelimit::{self, RateLimiter, presets};
use crate::{csrf, email_queue, password, tokens};

/// Roles with back-office access: they get the `admin_auth` cookie on login and
/// skip the guest-cart merge (`BACKOFFICE_ROLES`).
const BACKOFFICE_ROLES: [&str; 2] = ["admin", "staff"];
const GUEST_SESSION_COOKIE: &str = "sessionId";
const CSRF_USAGE: &str = "Include this token in X-CSRF-Token header for admin API requests";

/// The auth routes, each behind its Node rate limiter. Build once: the
/// limiters' counts live in the returned router.
pub fn router(trust: TrustProxy) -> Router<AppState> {
    let limiter = |config| RateLimiter::new(config, trust).layer();
    Router::new()
        .route(
            "/api/users/register",
            post(register.layer(limiter(presets::register()))).fallback(express_not_found),
        )
        .route(
            "/api/users/login",
            post(login.layer(limiter(presets::login()))).fallback(express_not_found),
        )
        .route(
            "/api/users/refresh",
            post(refresh.layer(limiter(presets::refresh()))).fallback(express_not_found),
        )
        .route(
            "/api/users/session",
            get(session).fallback(express_not_found),
        )
        .route(
            "/api/users/csrf-token",
            get(csrf_token).fallback(express_not_found),
        )
        .route(
            "/api/users/forgot-password",
            post(forgot_password.layer(limiter(presets::forgot_password())))
                .fallback(express_not_found),
        )
        .route(
            "/api/users/reset-password",
            post(reset_password).fallback(express_not_found),
        )
        .route(
            "/api/users/verify-email",
            get(verify_email.layer(limiter(presets::verify_email()))).fallback(express_not_found),
        )
}

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

/// `new Date(ms).toISOString()`, including the `±YYYYYY` form outside 0–9999.
fn js_iso(ms: i64) -> String {
    let Some(at) = DateTime::from_timestamp_millis(ms) else {
        return common::timestamp::format(&Utc::now());
    };
    let year = at.year();
    if (0..=9999).contains(&year) {
        common::timestamp::format(&at)
    } else {
        let sign = if year < 0 { '-' } else { '+' };
        format!(
            "{sign}{:06}-{}",
            year.unsigned_abs(),
            at.format("%m-%dT%H:%M:%S%.3fZ")
        )
    }
}

fn now_iso() -> String {
    js_iso(Utc::now().timestamp_millis())
}

/// The app's catch-all 404 (backend/server.js) for a path Express's router
/// doesn't match — here, another method on one of these paths.
pub async fn express_not_found(uri: Uri) -> Response {
    let path = uri
        .path_and_query()
        .map_or_else(|| uri.path().to_owned(), |p| p.as_str().to_owned());
    reply(
        StatusCode::NOT_FOUND,
        failure_with(
            "Endpoint not found",
            json!({ "path": path, "timestamp": now_iso() }),
        ),
    )
}

/// The app's error handler (backend/server.js) for an error passed to `next`,
/// such as a body the parser rejected: 500 with the message only outside
/// production.
fn express_error(message: &str) -> Response {
    let error = if cookies::is_production() {
        "Internal server error"
    } else {
        message
    };
    reply(
        StatusCode::INTERNAL_SERVER_ERROR,
        failure_with(
            "Internal server error",
            json!({ "timestamp": now_iso(), "error": error }),
        ),
    )
}

// --- request bodies ----------------------------------------------------------

/// The media type of `Content-Type`, lowercased (`type-is`).
fn mime(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::CONTENT_TYPE)?.to_str().ok()?;
    Some(value.split(';').next()?.trim().to_ascii_lowercase())
}

/// The `charset` parameter of `Content-Type`, lowercased.
fn charset(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::CONTENT_TYPE)?.to_str().ok()?;
    value.split(';').skip(1).find_map(|p| {
        let (k, v) = p.split_once('=')?;
        k.trim()
            .eq_ignore_ascii_case("charset")
            .then(|| v.trim().trim_matches('"').to_ascii_lowercase())
    })
}

/// `type-is` `hasBody`: a Transfer-Encoding, or a numeric Content-Length.
fn has_body(headers: &HeaderMap) -> bool {
    headers.contains_key(header::TRANSFER_ENCODING)
        || headers
            .get(header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| !crate::body::js_to_number(&Value::String(v.into())).is_nan())
}

const BODY_LIMIT: usize = 100 * 1024;

/// `req.body` after `express.json()` and `express.urlencoded({ extended: true })`,
/// or the error response when a parser rejects the body.
/// A body the parsers reject: the error message they pass to `next`.
#[derive(Debug)]
struct Rejected(String);

impl IntoResponse for Rejected {
    fn into_response(self) -> Response {
        express_error(&self.0)
    }
}

fn request_body(headers: &HeaderMap, bytes: &Bytes) -> Result<Value, Rejected> {
    let empty = || Ok(json!({}));
    if !has_body(headers) {
        return empty();
    }
    match mime(headers).as_deref() {
        Some("application/json") => {
            let charset = charset(headers).unwrap_or_else(|| "utf-8".into());
            if !charset.starts_with("utf-") {
                return Err(Rejected(format!(
                    "unsupported charset \"{}\"",
                    charset.to_ascii_uppercase()
                )));
            }
            if bytes.len() > BODY_LIMIT {
                return Err(Rejected("request entity too large".into()));
            }
            if bytes.is_empty() {
                return empty();
            }
            if ratelimit::express_json_rejects(headers, bytes) {
                // The exact V8 SyntaxError text is not reproduced (it is only
                // shown outside production).
                return Err(Rejected("Unexpected token in JSON".into()));
            }
            let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
            Ok(serde_json::from_slice(bytes).unwrap_or_else(|_| json!({})))
        }
        Some("application/x-www-form-urlencoded") => {
            let charset = charset(headers).unwrap_or_else(|| "utf-8".into());
            if charset != "utf-8" {
                return Err(Rejected(format!(
                    "unsupported charset \"{}\"",
                    charset.to_ascii_uppercase()
                )));
            }
            if bytes.len() > BODY_LIMIT {
                return Err(Rejected("request entity too large".into()));
            }
            let text = String::from_utf8_lossy(bytes);
            if text.matches('&').count() + 1 > qs::PARAMETER_LIMIT {
                return Err(Rejected("too many parameters".into()));
            }
            let fields = qs::parse(&text, qs::BODY)
                .map_err(|qs::DepthExceeded| Rejected("The input exceeded the depth".into()))?;
            Ok(Value::Object(qs::to_object(fields)))
        }
        _ => empty(),
    }
}

/// The JSON string at `body[key]` when it is a non-empty string.
fn text<'a>(body: &'a Value, key: &str) -> Option<&'a str> {
    let value = body.get(key);
    if is_non_empty_string(value) {
        value.and_then(Value::as_str)
    } else {
        None
    }
}

/// `qs.parse` as Express uses it (query strings, and form bodies via
/// body-parser), reduced to what these routes ask of a top-level key: is it a
/// string, and which. Follows qs 6.16: `%5B`/`%5D` become brackets first; up to
/// 1000 `&`-separated parts; `+` is a space; repeated keys combine into an
/// array; `a[...]` (and `[a]...` with more groups) nest; a later empty value
/// for the same key leaves a string alone, anything else turns it into an
/// array or object.
mod qs {
    use std::collections::HashMap;

    use serde_json::{Map, Value};

    pub const PARAMETER_LIMIT: usize = 1000;

    #[derive(Debug, Clone, Copy)]
    pub struct Options {
        depth: usize,
        strict_depth: bool,
    }

    /// Express's query parser (`depth` 5).
    pub const QUERY: Options = Options {
        depth: 5,
        strict_depth: false,
    };
    /// body-parser's extended urlencoded parser (`depth` 32, `strictDepth`).
    pub const BODY: Options = Options {
        depth: 32,
        strict_depth: true,
    };

    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum Field {
        Str(String),
        /// An array or object.
        Other,
    }

    /// A key nested deeper than `depth` with `strictDepth` (qs throws).
    #[derive(Debug, PartialEq, Eq)]
    pub struct DepthExceeded;

    /// `utils.decode`: `+` is a space, then `decodeURIComponent`, or the text as
    /// is when that throws.
    fn decode(s: &str) -> String {
        let plus = s.replace('+', " ");
        crate::cookies::decode(&plus)
    }

    fn replace_ignore_case(s: &str, from: &str, to: &str) -> String {
        let mut out = String::with_capacity(s.len());
        let mut rest = s;
        while let Some(i) = rest
            .char_indices()
            .find(|(i, _)| {
                rest.get(*i..*i + from.len())
                    .is_some_and(|w| w.eq_ignore_ascii_case(from))
            })
            .map(|(i, _)| i)
        {
            out.push_str(&rest[..i]);
            out.push_str(to);
            rest = &rest[i + from.len()..];
        }
        out.push_str(rest);
        out
    }

    /// An array-index property name, which JS objects list first.
    fn integer_key(k: &str) -> Option<u64> {
        if k == "0" {
            return Some(0);
        }
        if k.starts_with('0') || k.is_empty() || !k.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        k.parse::<u64>().ok().filter(|n| *n < u64::from(u32::MAX))
    }

    /// `splitKeyIntoSegments` + `parseObject`'s root: the top-level name a key
    /// writes to and whether it nests below it. `None` for keys qs ignores.
    fn root(key: &str, opts: Options) -> Result<Option<(String, bool)>, DepthExceeded> {
        if key.is_empty() {
            return Ok(None);
        }
        let bytes = key.as_bytes();
        let first = key.find('[');
        let parent = first.map_or(key, |i| &key[..i]);
        let mut segments: Vec<&str> = Vec::new();
        let mut owned_tail: Option<String> = None;
        if !parent.is_empty() {
            segments.push(parent);
        }
        let mut open = first;
        let mut collected = 0;
        while let Some(o) = open {
            if collected >= opts.depth {
                break;
            }
            let mut level = 1;
            let mut close = None;
            let mut i = o + 1;
            while i < bytes.len() && close.is_none() {
                match bytes[i] {
                    b'[' => level += 1,
                    b']' => {
                        level -= 1;
                        if level == 0 {
                            close = Some(i);
                        }
                    }
                    _ => {}
                }
                i += 1;
            }
            match close {
                None => {
                    owned_tail = Some(format!("[{}]", &key[o..]));
                    open = None;
                    break;
                }
                Some(c) => {
                    segments.push(&key[o..=c]);
                    collected += 1;
                    open = key[c + 1..].find('[').map(|j| j + c + 1);
                }
            }
        }
        if let Some(o) = open {
            if opts.strict_depth {
                return Err(DepthExceeded);
            }
            owned_tail = Some(format!("[{}]", &key[o..]));
        }
        let count = segments.len() + usize::from(owned_tail.is_some());
        let head = segments
            .first()
            .map(|s| (*s).to_owned())
            .or(owned_tail)
            .unwrap_or_default();
        let clean = if head.len() >= 2 && head.starts_with('[') && head.ends_with(']') {
            head[1..head.len() - 1].to_owned()
        } else {
            head
        };
        Ok(Some((clean, count > 1)))
    }

    /// The top-level keys of `qs.parse(s)`.
    pub fn parse(s: &str, opts: Options) -> Result<HashMap<String, Field>, DepthExceeded> {
        let mut out: HashMap<String, Field> = HashMap::new();
        if s.is_empty() {
            return Ok(out);
        }
        let clean = replace_ignore_case(&replace_ignore_case(s, "%5B", "["), "%5D", "]");
        // parseValues: raw key → values, in first-seen order.
        let mut raw: Vec<(String, Vec<String>)> = Vec::new();
        for part in clean.split('&').take(PARAMETER_LIMIT) {
            let pos = part.find("]=").map(|b| b + 1).or_else(|| part.find('='));
            let (key, val) = match pos {
                None => (decode(part), String::new()),
                Some(p) => (decode(&part[..p]), decode(&part[p + 1..])),
            };
            match raw.iter_mut().find(|(k, _)| *k == key) {
                Some((_, vals)) => vals.push(val),
                None => raw.push((key, vec![val])),
            }
        }
        // Object.keys order: array indexes first, ascending.
        raw.sort_by_key(|(k, _)| integer_key(k).map_or((1, 0), |n| (0, n)));
        for (key, vals) in raw {
            let Some((root, nested)) = root(&key, opts)? else {
                continue;
            };
            if root == "__proto__" {
                continue;
            }
            let field = match vals.as_slice() {
                [one] if !nested => Field::Str(one.clone()),
                _ => Field::Other,
            };
            match out.get_mut(&root) {
                None => {
                    out.insert(root, field);
                }
                // utils.merge: a falsy source ('') leaves the target as it is.
                Some(_) if field == Field::Str(String::new()) => {}
                Some(existing) => *existing = Field::Other,
            }
        }
        Ok(out)
    }

    /// The parse as `req.body`: strings as strings, anything else as `[]` (a
    /// non-string stand-in; these routes only check for strings).
    pub fn to_object(fields: HashMap<String, Field>) -> Map<String, Value> {
        fields
            .into_iter()
            .map(|(k, f)| match f {
                Field::Str(s) => (k, Value::String(s)),
                Field::Other => (k, Value::Array(Vec::new())),
            })
            .collect()
    }

    /// `req.query[name]` when it is a string.
    pub fn query_string(query: Option<&str>, name: &str) -> Option<String> {
        let mut fields = parse(query.unwrap_or(""), QUERY).ok()?;
        match fields.remove(name)? {
            Field::Str(s) => Some(s),
            Field::Other => None,
        }
    }
}

// --- validation --------------------------------------------------------------

/// JavaScript's `\s`.
fn js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
fn is_email(s: &str) -> bool {
    if s.chars().any(js_space) {
        return false;
    }
    let Some((local, domain)) = s.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.contains('@')
        && domain
            .char_indices()
            .any(|(i, c)| c == '.' && i > 0 && i + 1 < domain.len())
}

fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// `process.env.NEXTAUTH_URL || 'http://localhost:3000'` (email links).
fn nextauth_url() -> String {
    std::env::var("NEXTAUTH_URL")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "http://localhost:3000".into())
}

async fn next_id(pool: &MySqlPool, prefix: &str) -> anyhow::Result<String> {
    sqlx::query_scalar!(r#"SELECT get_next_id(?) AS "id: String""#, prefix)
        .fetch_one(pool)
        .await?
        .ok_or_else(|| anyhow::anyhow!("transno prefix {prefix} is not registered"))
}

fn vars(pairs: &[(&str, &str)]) -> Map<String, Value> {
    pairs
        .iter()
        .map(|(k, v)| ((*k).to_owned(), Value::String((*v).to_owned())))
        .collect()
}

// --- POST /register ------------------------------------------------------------

/// `POST /api/users/register` `{ email, password, firstName, lastName }`
pub async fn register(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let body = match request_body(&headers, &body) {
        Ok(body) => body,
        Err(rejected) => return rejected.into_response(),
    };
    let (Some(email), Some(pw), Some(first), Some(last)) = (
        text(&body, "email"),
        text(&body, "password"),
        text(&body, "firstName"),
        text(&body, "lastName"),
    ) else {
        return reply(
            StatusCode::BAD_REQUEST,
            failure_with(
                "Missing required fields",
                json!({ "error": "All fields are required: email, password, firstName, lastName" }),
            ),
        );
    };
    if let Some(message) = password::validate_strength(pw) {
        return reply(StatusCode::BAD_REQUEST, failure(message));
    }
    if !is_email(email) {
        return reply(StatusCode::BAD_REQUEST, failure("Invalid email format"));
    }
    if js_len(first) > 50 || js_len(last) > 50 {
        return reply(
            StatusCode::BAD_REQUEST,
            failure("Name fields must be 50 characters or less"),
        );
    }
    match register_user(&state, email, pw, first, last).await {
        Ok(response) => response,
        Err(error) => {
            tracing::error!(error = %format!("{error:#}"), "user registration failed");
            reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure("User registration failed"),
            )
        }
    }
}

async fn register_user(
    state: &AppState,
    email: &str,
    pw: &str,
    first: &str,
    last: &str,
) -> anyhow::Result<Response> {
    let pool = &state.pool;
    // Node goes on when this lookup fails (its result has no rows to check).
    let existing = sqlx::query_scalar!("SELECT id FROM users WHERE email = ? LIMIT 1", email)
        .fetch_optional(pool)
        .await
        .unwrap_or_else(|error| {
            tracing::error!(%error, "register: email lookup failed");
            None
        });
    if existing.is_some() {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure_with(
                "Email already exists",
                json!({ "error": "Email already registered" }),
            ),
        ));
    }
    let hash = password::hash(pw)
        .await
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    let user_id = next_id(pool, "USER").await?;
    let verification_token = tokens::random_hex::<32>()?;
    sqlx::query!(
        "INSERT INTO users (id, email, password_hash, first_name, last_name, email_verified, email_verification_token)
         VALUES (?, ?, ?, ?, ?, FALSE, ?)",
        user_id,
        email,
        hash,
        first,
        last,
        verification_token
    )
    .execute(pool)
    .await?;

    // Not awaited, as in Node: the emails never hold up the response.
    let welcome = vars(&[
        ("first_name", first),
        ("last_name", last),
        ("customer_name", &format!("{first} {last}")),
    ]);
    let verify_link = format!("{}/verify-email?token={verification_token}", nextauth_url());
    let verification = vars(&[("first_name", first), ("verify_link", &verify_link)]);
    let (pool, to, name) = (pool.clone(), email.to_owned(), first.to_owned());
    tokio::spawn(async move {
        email_queue::enqueue(&pool, &to, &name, "welcome_user", &welcome, None).await;
        email_queue::enqueue(&pool, &to, &name, "email_verification", &verification, None).await;
    });

    Ok(reply(
        StatusCode::CREATED,
        success(
            "User registered successfully",
            json!({
                "userId": user_id,
                "email": email,
                "firstName": first,
                "lastName": last,
                "emailVerified": false,
            }),
        ),
    ))
}

// --- POST /login ---------------------------------------------------------------

fn invalid_credentials() -> Response {
    reply(
        StatusCode::UNAUTHORIZED,
        failure_with(
            "Invalid credentials",
            json!({ "error": "Invalid email or password" }),
        ),
    )
}

/// `POST /api/users/login` `{ email, password }`
pub async fn login(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let body = match request_body(&headers, &body) {
        Ok(body) => body,
        Err(rejected) => return rejected.into_response(),
    };
    let (Some(email), Some(pw)) = (text(&body, "email"), text(&body, "password")) else {
        return reply(
            StatusCode::BAD_REQUEST,
            failure_with(
                "Missing required fields",
                json!({ "error": "Email and password are required" }),
            ),
        );
    };
    match login_user(&state, &headers, email, pw).await {
        Ok(response) => response,
        Err(error) => {
            tracing::error!(error = %format!("{error:#}"), "login failed");
            reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure_with("Login failed", json!({})),
            )
        }
    }
}

async fn login_user(
    state: &AppState,
    headers: &HeaderMap,
    email: &str,
    pw: &str,
) -> anyhow::Result<Response> {
    let pool = &state.pool;
    let user = sqlx::query!(
        r#"SELECT id, email, password_hash, role AS "role!: String", status AS "status!: String",
             token_version
           FROM users WHERE email = ? LIMIT 1"#,
        email
    )
    .fetch_optional(pool)
    .await;
    // A failed lookup is "invalid credentials" in Node too.
    let Ok(Some(user)) = user else {
        if let Err(error) = user {
            tracing::error!(%error, "login: user lookup failed");
        }
        return Ok(invalid_credentials());
    };
    let role = user.role.to_lowercase();
    if user.status != "active" {
        return Ok(invalid_credentials());
    }
    let matches = password::verify(pw, &user.password_hash)
        .await
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    if !matches {
        return Ok(invalid_credentials());
    }

    let is_admin = role == "admin";
    let is_staff = role == "staff";
    let backoffice = BACKOFFICE_ROLES.contains(&role.as_str());
    let access_token = tokens::sign_access_token(
        &state.jwt,
        &tokens::TokenUser {
            id: &user.id,
            email: Some(&user.email),
            role: &user.role,
            token_version: i64::from(user.token_version),
        },
    )?;
    let refresh_token = tokens::issue_refresh_token(pool, &user.id).await?;

    let now = Utc::now();
    let mut set_cookies: Vec<HeaderValue> = Vec::new();
    if backoffice {
        set_cookies.push(cookies::admin_auth_cookie(&access_token, now)?);
    }
    // Only a session id we issue counts (backend/utils/guestSession.js).
    if let Some(session_id) = super::cart::guest_session(headers)
        && !backoffice
        && let Err(error) = merge_guest_cart(pool, &session_id, &user.id).await
    {
        // Never fail a valid login over the cart; the guest cart stays as it was.
        tracing::error!(error = %format!("{error:#}"), "guest cart merge failed");
    }
    if cookies::Cookies::from_headers(headers).contains(GUEST_SESSION_COOKIE) {
        set_cookies.push(cookies::clear_cookie(
            GUEST_SESSION_COOKIE,
            &CookieOptions::default(),
            now,
        )?);
    }

    let mut response = reply(
        StatusCode::OK,
        success(
            "Login successful",
            json!({
                "userId": user.id,
                "email": user.email,
                "accessToken": access_token,
                "refreshToken": refresh_token,
                "role": user.role,
                "isAdmin": is_admin,
                "isStaff": is_staff,
            }),
        ),
    );
    for cookie in set_cookies {
        response.headers_mut().append(header::SET_COOKIE, cookie);
    }
    Ok(response)
}

/// `mergeGuestCart`: move the guest cart's lines into the user's cart (created
/// if needed; a line for the same product + variant adds its quantity), then
/// delete the guest cart. Statement by statement, like Node (no transaction).
async fn merge_guest_cart(pool: &MySqlPool, session_id: &str, user_id: &str) -> anyhow::Result<()> {
    let guest = sqlx::query_scalar!(
        "SELECT id FROM shopping_carts WHERE session_id = ? AND user_id IS NULL
         ORDER BY created_at ASC, id ASC LIMIT 1",
        session_id
    )
    .fetch_optional(pool)
    .await?;
    let Some(guest) = guest else { return Ok(()) };

    let existing = sqlx::query_scalar!(
        "SELECT id FROM shopping_carts WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 1",
        user_id
    )
    .fetch_optional(pool)
    .await?;
    let user_cart = match existing {
        Some(id) => id,
        None => {
            let id = next_id(pool, "CART").await?;
            sqlx::query!(
                "INSERT INTO shopping_carts (id, user_id) VALUES (?, ?)",
                id,
                user_id
            )
            .execute(pool)
            .await?;
            id
        }
    };

    let lines = sqlx::query!(
        r#"SELECT product_id, variant_id, quantity, CAST(price AS CHAR) AS "price!: String"
           FROM cart_items WHERE cart_id = ? ORDER BY id"#,
        guest
    )
    .fetch_all(pool)
    .await?;
    for line in lines {
        // variant_id may be NULL: `<=>`.
        let same = sqlx::query_scalar!(
            "SELECT id FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id <=> ?
             ORDER BY id LIMIT 1",
            user_cart,
            line.product_id,
            line.variant_id
        )
        .fetch_optional(pool)
        .await?;
        match same {
            Some(id) => {
                sqlx::query!(
                    "UPDATE cart_items SET quantity = quantity + ? WHERE id = ?",
                    line.quantity,
                    id
                )
                .execute(pool)
                .await?;
            }
            None => {
                let id = next_id(pool, "CARTITEM").await?;
                sqlx::query!(
                    "INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price)
                     VALUES (?, ?, ?, ?, ?, ?)",
                    id,
                    user_cart,
                    line.product_id,
                    line.variant_id,
                    line.quantity,
                    line.price
                )
                .execute(pool)
                .await?;
            }
        }
    }
    sqlx::query!("DELETE FROM shopping_carts WHERE id = ?", guest)
        .execute(pool)
        .await?;
    Ok(())
}

// --- POST /refresh -------------------------------------------------------------

fn invalid_refresh() -> Response {
    reply(
        StatusCode::UNAUTHORIZED,
        failure("Invalid or expired refresh token"),
    )
}

/// `POST /api/users/refresh` `{ refreshToken }` → a new access token (the
/// refresh token is not rotated).
pub async fn refresh(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let body = match request_body(&headers, &body) {
        Ok(body) => body,
        Err(rejected) => return rejected.into_response(),
    };
    let Some(token) = text(&body, "refreshToken") else {
        return reply(StatusCode::BAD_REQUEST, failure("Refresh token required"));
    };
    match refresh_access(&state, token).await {
        Ok(response) => response,
        Err(error) => {
            tracing::error!(error = %format!("{error:#}"), "token refresh failed");
            reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure("Token refresh failed"),
            )
        }
    }
}

async fn refresh_access(state: &AppState, token: &str) -> anyhow::Result<Response> {
    let pool = &state.pool;
    let Ok(Some(user_id)) = tokens::refresh_token_user(pool, token).await else {
        return Ok(invalid_refresh());
    };
    let user = sqlx::query!(
        r#"SELECT id, email, role AS "role!: String", status AS "status!: String", token_version
           FROM users WHERE id = ?"#,
        user_id
    )
    .fetch_optional(pool)
    .await;
    let Ok(Some(user)) = user else {
        return Ok(reply(StatusCode::NOT_FOUND, failure("User not found")));
    };
    if user.status != "active" {
        return Ok(invalid_refresh());
    }
    let access_token = tokens::sign_access_token(
        &state.jwt,
        &tokens::TokenUser {
            id: &user.id,
            email: Some(&user.email),
            role: &user.role,
            token_version: i64::from(user.token_version),
        },
    )?;
    Ok(reply(
        StatusCode::OK,
        success("Token refreshed", json!({ "accessToken": access_token })),
    ))
}

// --- GET /session --------------------------------------------------------------

/// `GET /api/users/session` — 200 whether or not the caller is signed in.
pub async fn session(State(state): State<AppState>, user: OptionalUser) -> Response {
    let Some(user) = user.0 else {
        return reply(
            StatusCode::OK,
            success("No active session", json!({ "authenticated": false })),
        );
    };
    let mut table = Map::new();
    table.insert("authenticated".into(), json!(true));
    table.insert("id".into(), json!(user.id));
    table.insert("isAdmin".into(), json!(user.is_admin()));
    table.insert("isStaff".into(), json!(user.is_staff()));
    let profile = sqlx::query!(
        r#"SELECT id, first_name, last_name, email, phone, role AS "role!: String"
           FROM users WHERE id = ?"#,
        user.id
    )
    .fetch_optional(&state.pool)
    .await;
    match profile {
        Ok(Some(p)) => {
            table.insert("id".into(), json!(p.id));
            table.insert("first_name".into(), json!(p.first_name));
            table.insert("last_name".into(), json!(p.last_name));
            table.insert("email".into(), json!(p.email));
            table.insert("phone".into(), json!(p.phone));
            table.insert("role".into(), json!(p.role));
        }
        Ok(None) => {}
        Err(error) => tracing::error!(%error, "session check: profile lookup failed"),
    }
    reply(
        StatusCode::OK,
        success("Authenticated", Value::Object(table)),
    )
}

// --- GET /csrf-token -----------------------------------------------------------

/// `GET /api/users/csrf-token` (staff or admin): a token in the body and in the
/// JavaScript-readable `csrf_token` cookie (double submit).
pub async fn csrf_token(
    State(state): State<AppState>,
    StaffOrAdmin(user): StaffOrAdmin,
) -> Response {
    let issue = || -> anyhow::Result<Response> {
        let token = csrf::generate(&state.csrf, &user.id)?;
        let now = Utc::now();
        let (cookie, ttl_ms) = csrf::token_cookie(&token, now)?;
        let expires = js_iso(now.timestamp_millis() + ttl_ms as i64);
        let mut response = reply(
            StatusCode::OK,
            success(
                "CSRF token generated successfully",
                json!({ "csrfToken": token, "expires": expires, "usage": CSRF_USAGE }),
            ),
        );
        response.headers_mut().append(header::SET_COOKIE, cookie);
        Ok(response)
    };
    issue().unwrap_or_else(|error| {
        tracing::error!(error = %format!("{error:#}"), "CSRF token generation failed");
        reply(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure_with("Failed to generate CSRF token", json!({})),
        )
    })
}

// --- POST /forgot-password -----------------------------------------------------

/// `POST /api/users/forgot-password` `{ email }` — the same answer whether or
/// not the account exists.
pub async fn forgot_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let body = match request_body(&headers, &body) {
        Ok(body) => body,
        Err(rejected) => return rejected.into_response(),
    };
    let Some(email) = text(&body, "email") else {
        return reply(
            StatusCode::BAD_REQUEST,
            failure_with("Missing email", json!({ "error": "Email is required" })),
        );
    };
    match send_reset(&state.pool, email).await {
        Ok(response) => response,
        Err(error) => {
            tracing::error!(error = %format!("{error:#}"), "forgot password failed");
            reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure_with("Failed to process forgot password", json!({})),
            )
        }
    }
}

async fn send_reset(pool: &MySqlPool, email: &str) -> anyhow::Result<Response> {
    let user_id = sqlx::query_scalar!("SELECT id FROM users WHERE email = ? LIMIT 1", email)
        .fetch_optional(pool)
        .await;
    let Ok(Some(user_id)) = user_id else {
        return Ok(reply(
            StatusCode::OK,
            success(
                "Password reset email sent if email exists",
                json!({ "message": "If the email exists, a reset link has been sent" }),
            ),
        ));
    };
    // Single use; only the SHA-256 is stored.
    let token = tokens::random_hex::<32>()?;
    sqlx::query!(
        "UPDATE users SET password_reset_token = ?, password_reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR)
         WHERE id = ?",
        tokens::sha256_hex(&token),
        user_id
    )
    .execute(pool)
    .await?;
    let reset_link = format!("{}/reset-password?token={token}", nextauth_url());
    email_queue::enqueue(
        pool,
        email,
        "",
        "password_reset",
        &vars(&[("reset_link", &reset_link)]),
        None,
    )
    .await;
    Ok(reply(
        StatusCode::OK,
        success(
            "Email sent",
            json!({ "message": "Password reset email sent" }),
        ),
    ))
}

// --- POST /reset-password ------------------------------------------------------

/// `POST /api/users/reset-password` `{ token, newPassword }` (no rate limit in
/// Node either).
pub async fn reset_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let body = match request_body(&headers, &body) {
        Ok(body) => body,
        Err(rejected) => return rejected.into_response(),
    };
    let (Some(token), Some(new_password)) = (text(&body, "token"), text(&body, "newPassword"))
    else {
        return reply(
            StatusCode::BAD_REQUEST,
            failure_with(
                "Missing required fields",
                json!({ "error": "Token and new password are required" }),
            ),
        );
    };
    if let Some(message) = password::validate_strength(new_password) {
        return reply(StatusCode::BAD_REQUEST, failure(message));
    }
    match reset(&state.pool, token, new_password).await {
        Ok(response) => response,
        Err(error) => {
            tracing::error!(error = %format!("{error:#}"), "reset password failed");
            reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure_with("Failed to reset password", json!({})),
            )
        }
    }
}

async fn reset(pool: &MySqlPool, token: &str, new_password: &str) -> anyhow::Result<Response> {
    let user_id = sqlx::query_scalar!(
        "SELECT id FROM users WHERE password_reset_token = ? AND password_reset_expires > NOW() LIMIT 1",
        tokens::sha256_hex(token)
    )
    .fetch_optional(pool)
    .await;
    let Ok(Some(user_id)) = user_id else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure_with(
                "Invalid token",
                json!({ "error": "Invalid or expired token" }),
            ),
        ));
    };
    let hash = password::hash(new_password)
        .await
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    // Clear the token (single use) and revoke every existing session.
    let updated = sqlx::query!(
        "UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL,
           token_version = token_version + 1
         WHERE id = ?",
        hash,
        user_id
    )
    .execute(pool)
    .await;
    if let Err(error) = tokens::revoke_refresh_tokens(pool, &user_id).await {
        tracing::error!(error = %format!("{error:#}"), "reset password: revoking sessions failed");
    }
    match updated {
        Ok(done) if done.rows_affected() > 0 => Ok(reply(
            StatusCode::OK,
            success(
                "Password reset successful",
                json!({ "message": "Password has been reset" }),
            ),
        )),
        other => {
            if let Err(error) = other {
                tracing::error!(%error, "reset password: update failed");
            }
            Ok(reply(
                StatusCode::INTERNAL_SERVER_ERROR,
                failure_with(
                    "Failed to reset password",
                    json!({ "error": "Password could not be updated" }),
                ),
            ))
        }
    }
}

// --- GET /verify-email ---------------------------------------------------------

/// `GET /api/users/verify-email?token=`
pub async fn verify_email(State(state): State<AppState>, RawQuery(query): RawQuery) -> Response {
    let Some(token) = qs::query_string(query.as_deref(), "token").filter(|t| !t.is_empty()) else {
        return reply(
            StatusCode::BAD_REQUEST,
            failure("Verification token is required"),
        );
    };
    let pool = &state.pool;
    let user = sqlx::query!(
        "SELECT id, email FROM users WHERE email_verification_token = ? AND email_verified = FALSE LIMIT 1",
        token
    )
    .fetch_optional(pool)
    .await;
    let Ok(Some(user)) = user else {
        return reply(
            StatusCode::BAD_REQUEST,
            failure("Invalid or expired verification token"),
        );
    };
    // Node does not check this write.
    if let Err(error) = sqlx::query!(
        "UPDATE users SET email_verified = TRUE, email_verification_token = NULL WHERE id = ?",
        user.id
    )
    .execute(pool)
    .await
    {
        tracing::error!(%error, "verify email: update failed");
    }
    reply(
        StatusCode::OK,
        success(
            "Email verified successfully",
            json!({ "email": user.email }),
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::qs::{BODY, Field, QUERY, parse, query_string};
    use super::*;

    #[test]
    fn email_format_matches_the_node_regex() {
        for ok in ["a@b.co", "a.b@c.d.e", "x@y..z", "ü@ö.de", "a@.b.c"] {
            assert!(is_email(ok), "{ok}");
        }
        for bad in [
            "a@b",
            "a@.b",
            "a@b.",
            "@b.co",
            "a@@b.co",
            "a@b@c.co",
            "a b@c.co",
            "a@b.c\u{a0}",
            "a@b.c\u{feff}",
            "",
        ] {
            assert!(!is_email(bad), "{bad:?}");
        }
        // U+0085 is not `\s` in JavaScript.
        assert!(is_email("a\u{85}@b.co"));
    }

    #[test]
    fn query_strings_follow_qs() {
        let q = |s: &str| query_string(Some(s), "token");
        assert_eq!(q("token=abc").as_deref(), Some("abc"));
        assert_eq!(q("token=a+b%20c").as_deref(), Some("a b c"));
        assert_eq!(q("token=%E0%A4%A").as_deref(), Some("%E0%A4%A"));
        assert_eq!(q("token").as_deref(), Some(""));
        assert_eq!(q("token=a&token=b"), None);
        assert_eq!(q("token[]=a"), None);
        assert_eq!(q("token[x]=a"), None);
        assert_eq!(q("token%5Bx%5D=a"), None);
        assert_eq!(q("token[=a"), None);
        assert_eq!(q("[token]=a").as_deref(), Some("a"));
        assert_eq!(q("[token][x]=a"), None);
        assert_eq!(q("token=a&[token]=").as_deref(), Some("a"));
        assert_eq!(q("token=a&[token]=b"), None);
        assert_eq!(q("token=&token=a"), None);
        assert_eq!(q("toke%6E=abc").as_deref(), Some("abc"));
        assert_eq!(q("other=1"), None);
        assert_eq!(query_string(None, "token"), None);
        // Parts after the 1000th are dropped.
        let many = format!("{}token=late", "a=1&".repeat(1000));
        assert_eq!(q(&many), None);
    }

    #[test]
    fn strict_depth_only_for_bodies() {
        let deep = format!("email{}=x", "[a]".repeat(33));
        assert!(parse(&deep, BODY).is_err());
        assert_eq!(parse(&deep, QUERY).unwrap()["email"], Field::Other);
        let ok = format!("email{}=x", "[a]".repeat(32));
        assert_eq!(parse(&ok, BODY).unwrap()["email"], Field::Other);
    }

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.append(
                axum::http::HeaderName::from_bytes(k.as_bytes()).unwrap(),
                v.parse().unwrap(),
            );
        }
        h
    }

    #[test]
    fn bodies_are_parsed_like_express() {
        let json_h = headers(&[
            ("content-type", "application/json"),
            ("content-length", "1"),
        ]);
        let body = request_body(&json_h, &Bytes::from_static(br#"{"email":"a"}"#)).unwrap();
        assert_eq!(body, json!({ "email": "a" }));
        assert!(request_body(&json_h, &Bytes::from_static(b"{bad")).is_err());
        assert!(request_body(&json_h, &Bytes::from_static(b"\"str\"")).is_err());
        let latin = headers(&[
            ("content-type", "application/json; charset=latin1"),
            ("content-length", "2"),
        ]);
        assert!(request_body(&latin, &Bytes::from_static(b"{}")).is_err());
        // No Content-Length / Transfer-Encoding: no body to parse.
        let no_len = headers(&[("content-type", "application/json; charset=latin1")]);
        assert_eq!(request_body(&no_len, &Bytes::new()).unwrap(), json!({}));
        // Other JSON-ish types are not parsed by express.json().
        let text_json = headers(&[("content-type", "text/json"), ("content-length", "2")]);
        assert_eq!(
            request_body(&text_json, &Bytes::from_static(br#"{"email":"a"}"#)).unwrap(),
            json!({})
        );
        let form = headers(&[
            ("content-type", "application/x-www-form-urlencoded"),
            ("content-length", "9"),
        ]);
        let body =
            request_body(&form, &Bytes::from_static(b"email=a%40b.co&password[]=x")).unwrap();
        assert_eq!(body["email"], json!("a@b.co"));
        assert!(!is_non_empty_string(body.get("password")));
        let many = "a=1&".repeat(1000) + "a=1";
        assert!(request_body(&form, &Bytes::from(many)).is_err());
    }

    #[test]
    fn iso_strings_match_javascript() {
        assert_eq!(js_iso(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(js_iso(253_402_300_800_000), "+010000-01-01T00:00:00.000Z");
        assert_eq!(js_iso(-62_198_755_200_000), "-000001-01-01T00:00:00.000Z");
    }
}
