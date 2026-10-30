//! CSRF protection, identical to backend/middleware/csrfMiddleware.js so a
//! token issued by either service validates on the other:
//!
//! * a token is `base64(JSON.stringify({ data, signature }))` where `data` is
//!   `{ userId, timestamp, random }` (timestamp in ms, 16 random bytes as hex)
//!   and `signature` the hex HMAC-SHA256 of `JSON.stringify(data)`, keyed with
//!   `CSRF_SECRET || JWT_SECRET`;
//! * validation decodes the token as Node does (lenient base64, lossy UTF-8,
//!   `JSON.parse`), re-serializes `data` in the order it was parsed, and checks
//!   the signature, that `data.userId === req.user.id`, and that
//!   `Date.now() - data.timestamp > 24h` is false (JavaScript arithmetic, so a
//!   token without a timestamp does not expire — as in Node);
//! * the guard ([`Csrf`]) is the double-submit check: on POST/PUT/PATCH/DELETE
//!   the `X-CSRF-Token` header must be present, the `csrf_token` cookie
//!   present, both equal, and the token valid — with the same 401/403 bodies.
//!
//! Handlers take `Csrf<Admin>` (or `Csrf<StaffOrAdmin>`, `Csrf<AuthUser>`): the
//! auth check runs first, exactly like `protect, admin, csrfProtection`.

use axum::Json;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::{DateTime, Utc};
use common::response::failure_with;
use serde::de::{Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde_json::{Value, json};

use crate::AppState;
use crate::auth::{Admin, AuthUser, OptionalUser, StaffOrAdmin};
use crate::cookies::{CookieError, CookieOptions, Cookies, SameSite};
use crate::tokens::{hex, hmac_sha256, random_bytes};

/// How long a token is accepted (`24 * 60 * 60 * 1000`).
pub const MAX_AGE_MS: f64 = 86_400_000.0;
pub const COOKIE: &str = "csrf_token";
pub const HEADER: &str = "x-csrf-token";

/// `process.env.CSRF_SECRET || process.env.JWT_SECRET`.
#[derive(Clone, Default)]
pub struct CsrfKey(Option<std::sync::Arc<[u8]>>);

impl CsrfKey {
    pub fn from_env() -> Self {
        let pick = |name: &str| std::env::var(name).ok().filter(|v| !v.is_empty());
        Self::from_secret(
            pick("CSRF_SECRET")
                .or_else(|| pick("JWT_SECRET"))
                .as_deref(),
        )
    }

    pub fn from_secret(secret: Option<&str>) -> Self {
        Self(
            secret
                .filter(|s| !s.is_empty())
                .map(|s| s.as_bytes().into()),
        )
    }

    fn sign(&self, data: &str) -> Option<String> {
        self.0
            .as_deref()
            .map(|k| hex(&hmac_sha256(k, data.as_bytes())))
    }
}

/// `generateCSRFToken(user)` with explicit time and randomness.
pub fn generate_with(
    key: &CsrfKey,
    user_id: &str,
    timestamp_ms: i64,
    random: [u8; 16],
) -> anyhow::Result<String> {
    let data = format!(
        r#"{{"userId":{},"timestamp":{timestamp_ms},"random":"{}"}}"#,
        Value::String(user_id.to_owned()),
        hex(&random)
    );
    let signature = key
        .sign(&data)
        .ok_or_else(|| anyhow::anyhow!("CSRF_SECRET/JWT_SECRET is not set"))?;
    Ok(STANDARD.encode(format!(r#"{{"data":{data},"signature":"{signature}"}}"#)))
}

/// `generateCSRFToken(user)`.
pub fn generate(key: &CsrfKey, user_id: &str) -> anyhow::Result<String> {
    generate_with(
        key,
        user_id,
        Utc::now().timestamp_millis(),
        random_bytes::<16>()?,
    )
}

/// `Buffer.from(s, 'base64')`: both alphabets, other characters skipped,
/// decoding stops at the first `=`, a dangling sextet is dropped.
pub fn node_base64_decode(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for b in s.bytes() {
        let v = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            _ => continue,
        };
        acc = (acc << 6) | u32::from(v);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
        acc &= (1 << bits) - 1;
    }
    out
}

/// A parsed JSON value that keeps object key order (what `JSON.parse` gives
/// JavaScript), so it can be serialized back exactly like `JSON.stringify`.
#[derive(Debug, Clone, PartialEq)]
enum Ordered {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Ordered>),
    Object(Vec<(String, Ordered)>),
}

impl<'de> Deserialize<'de> for Ordered {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = Ordered;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("JSON")
            }
            fn visit_unit<E>(self) -> Result<Ordered, E> {
                Ok(Ordered::Null)
            }
            fn visit_bool<E>(self, b: bool) -> Result<Ordered, E> {
                Ok(Ordered::Bool(b))
            }
            fn visit_i64<E>(self, n: i64) -> Result<Ordered, E> {
                Ok(Ordered::Number(n as f64))
            }
            fn visit_u64<E>(self, n: u64) -> Result<Ordered, E> {
                Ok(Ordered::Number(n as f64))
            }
            fn visit_f64<E>(self, n: f64) -> Result<Ordered, E> {
                Ok(Ordered::Number(n))
            }
            fn visit_str<E>(self, s: &str) -> Result<Ordered, E> {
                Ok(Ordered::String(s.to_owned()))
            }
            fn visit_string<E>(self, s: String) -> Result<Ordered, E> {
                Ok(Ordered::String(s))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Ordered, A::Error> {
                let mut items = Vec::new();
                while let Some(item) = seq.next_element()? {
                    items.push(item);
                }
                Ok(Ordered::Array(items))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Ordered, A::Error> {
                let mut entries: Vec<(String, Ordered)> = Vec::new();
                while let Some((k, v)) = map.next_entry::<String, Ordered>()? {
                    // A repeated key keeps its first position and the last value.
                    match entries.iter_mut().find(|(e, _)| *e == k) {
                        Some(entry) => entry.1 = v,
                        None => entries.push((k, v)),
                    }
                }
                Ok(Ordered::Object(entries))
            }
        }
        d.deserialize_any(V)
    }
}

/// A JavaScript array index ("0", "17"; not "01" or "4294967295"): such keys
/// come first, ascending, in any object.
fn array_index(key: &str) -> Option<u32> {
    if key.is_empty() || (key.len() > 1 && key.starts_with('0')) {
        return None;
    }
    key.parse::<u32>().ok().filter(|n| *n != u32::MAX)
}

impl Ordered {
    fn get(&self, key: &str) -> Option<&Ordered> {
        match self {
            Self::Object(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// `JSON.stringify`.
    fn stringify(&self, out: &mut String) {
        let string = |s: &str| Value::String(s.to_owned()).to_string();
        match self {
            Self::Null => out.push_str("null"),
            Self::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Self::Number(f) if f.is_finite() => out.push_str(&common::json::js_number_string(*f)),
            Self::Number(_) => out.push_str("null"),
            Self::String(s) => out.push_str(&string(s)),
            Self::Array(items) => {
                out.push('[');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    item.stringify(out);
                }
                out.push(']');
            }
            Self::Object(entries) => {
                let mut indexed: Vec<(u32, &(String, Ordered))> = entries
                    .iter()
                    .filter_map(|e| array_index(&e.0).map(|i| (i, e)))
                    .collect();
                indexed.sort_by_key(|(i, _)| *i);
                let ordered = indexed
                    .into_iter()
                    .map(|(_, e)| e)
                    .chain(entries.iter().filter(|e| array_index(&e.0).is_none()));
                out.push('{');
                for (i, (k, v)) in ordered.enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    out.push_str(&string(k));
                    out.push(':');
                    v.stringify(out);
                }
                out.push('}');
            }
        }
    }

    /// `Number(v)` for the timestamp arithmetic (`undefined` is `None` → NaN).
    fn to_number(v: Option<&Ordered>) -> f64 {
        match v {
            None => f64::NAN,
            Some(Self::Null) => 0.0,
            Some(Self::Bool(b)) => f64::from(u8::from(*b)),
            Some(Self::Number(n)) => *n,
            Some(Self::String(s)) => crate::body::js_to_number(&Value::String(s.clone())),
            Some(Self::Array(items)) if items.is_empty() => 0.0,
            Some(Self::Array(items)) if items.len() == 1 => match &items[0] {
                Self::Null => 0.0,
                Self::Array(_) | Self::Object(_) => f64::NAN,
                one => Self::to_number(Some(one)),
            },
            Some(_) => f64::NAN,
        }
    }
}

/// `validateCSRFToken(token, user)` at `now_ms`.
pub fn validate_at(key: &CsrfKey, token: &str, user_id: &str, now_ms: i64) -> bool {
    if token.is_empty() || user_id.is_empty() {
        return false;
    }
    let decoded = String::from_utf8_lossy(&node_base64_decode(token)).into_owned();
    let Ok(parsed) = serde_json::from_str::<Ordered>(&decoded) else {
        return false;
    };
    // `const { data, signature } = decoded` throws for null; `JSON.stringify(undefined)`
    // makes `hmac.update` throw — both are `false`.
    let Some(data) = parsed.get("data") else {
        return false;
    };
    let mut serialized = String::new();
    data.stringify(&mut serialized);
    let Some(expected) = key.sign(&serialized) else {
        return false;
    };
    if parsed.get("signature") != Some(&Ordered::String(expected)) {
        return false;
    }
    if data.get("userId") != Some(&Ordered::String(user_id.to_owned())) {
        return false;
    }
    let age = now_ms as f64 - Ordered::to_number(data.get("timestamp"));
    // `if (tokenAge > maxAge) return false` — NaN compares false.
    age.is_nan() || age <= MAX_AGE_MS
}

/// `validateCSRFToken(token, user)` now.
pub fn validate(key: &CsrfKey, token: &str, user_id: &str) -> bool {
    validate_at(key, token, user_id, Utc::now().timestamp_millis())
}

/// Why a write was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CsrfError {
    NotAuthenticated,
    MissingHeader,
    MissingCookie,
    Mismatch,
    Invalid,
}

impl IntoResponse for CsrfError {
    fn into_response(self) -> Response {
        let (status, message, error) = match self {
            Self::NotAuthenticated => (
                StatusCode::UNAUTHORIZED,
                "Not authenticated",
                "Authentication required for CSRF protection",
            ),
            Self::MissingHeader => (
                StatusCode::FORBIDDEN,
                "CSRF token required",
                "CSRF token missing in X-CSRF-Token header",
            ),
            Self::MissingCookie => (
                StatusCode::FORBIDDEN,
                "CSRF token required",
                "CSRF cookie missing",
            ),
            Self::Mismatch => (
                StatusCode::FORBIDDEN,
                "CSRF token mismatch",
                "CSRF header and cookie tokens do not match",
            ),
            Self::Invalid => (
                StatusCode::FORBIDDEN,
                "CSRF token validation failed",
                "Invalid or expired CSRF token",
            ),
        };
        (
            status,
            Json(failure_with(message, json!({ "error": error }))),
        )
            .into_response()
    }
}

/// `csrfProtection` for a request whose user (if any) is already resolved.
pub fn check(
    key: &CsrfKey,
    method: &Method,
    headers: &HeaderMap,
    user: Option<&AuthUser>,
    now_ms: i64,
) -> Result<(), CsrfError> {
    if matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return Ok(());
    }
    let user = user.ok_or(CsrfError::NotAuthenticated)?;
    // Node joins repeated headers with ", ".
    let header = headers
        .get_all(HEADER)
        .iter()
        .map(|v| String::from_utf8_lossy(v.as_bytes()).into_owned())
        .collect::<Vec<_>>()
        .join(", ");
    if header.is_empty() {
        return Err(CsrfError::MissingHeader);
    }
    let cookies = Cookies::from_headers(headers);
    let cookie = cookies.get(COOKIE);
    if !crate::body::truthy(cookie) {
        return Err(CsrfError::MissingCookie);
    }
    if cookie != Some(&Value::String(header.clone())) {
        return Err(CsrfError::Mismatch);
    }
    if !validate_at(key, &header, &user.id, now_ms) {
        return Err(CsrfError::Invalid);
    }
    Ok(())
}

/// What a guard extractor knows about the caller.
pub trait CsrfSubject {
    fn csrf_user(&self) -> Option<&AuthUser>;
}

impl CsrfSubject for AuthUser {
    fn csrf_user(&self) -> Option<&AuthUser> {
        Some(self)
    }
}

impl CsrfSubject for Admin {
    fn csrf_user(&self) -> Option<&AuthUser> {
        Some(&self.0)
    }
}

impl CsrfSubject for StaffOrAdmin {
    fn csrf_user(&self) -> Option<&AuthUser> {
        Some(&self.0)
    }
}

impl CsrfSubject for OptionalUser {
    fn csrf_user(&self) -> Option<&AuthUser> {
        self.0.as_ref()
    }
}

/// `guard, csrfProtection`: runs the auth extractor `G`, then the CSRF check.
pub struct Csrf<G>(pub G);

impl<G> FromRequestParts<AppState> for Csrf<G>
where
    G: FromRequestParts<AppState> + CsrfSubject + Send,
    G::Rejection: IntoResponse,
{
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let guard = G::from_request_parts(parts, state)
            .await
            .map_err(IntoResponse::into_response)?;
        check(
            &state.csrf,
            &parts.method,
            &parts.headers,
            guard.csrf_user(),
            Utc::now().timestamp_millis(),
        )
        .map_err(IntoResponse::into_response)?;
        Ok(Self(guard))
    }
}

/// The `csrf_token` cookie `GET /api/users/csrf-token` sets: readable by
/// JavaScript, Secure in production, SameSite=Strict, `CSRF_TOKEN_TTL_MS`
/// (default 24h). Returns the header and the TTL in ms (NaN if the variable is
/// not a number — then the cookie fails like `res.cookie` does).
pub fn token_cookie(token: &str, now: DateTime<Utc>) -> Result<(HeaderValue, f64), CookieError> {
    let ttl = crate::cookies::env_ttl_ms("CSRF_TOKEN_TTL_MS", "86400000");
    let cookie = crate::cookies::set_cookie(
        COOKIE,
        token,
        &CookieOptions {
            http_only: false,
            secure: crate::cookies::is_production(),
            same_site: Some(SameSite::Strict),
            path: Some("/".into()),
            max_age_ms: Some(ttl),
            ..CookieOptions::default()
        },
        now,
    )?;
    Ok((cookie, ttl))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixtures() -> (CsrfKey, Value) {
        let fx = crate::cookies::tests::fixtures();
        (
            CsrfKey::from_secret(fx["secret"].as_str()),
            fx["csrf"].clone(),
        )
    }

    fn user(id: &str) -> AuthUser {
        AuthUser {
            id: id.into(),
            email: None,
            role: "admin".into(),
        }
    }

    /// Node's generateCSRFToken with the same time and randomness gives the
    /// same token, so Node validates ours.
    #[test]
    fn generation_is_byte_identical_to_node() {
        let (key, fx) = fixtures();
        let cases = fx["generated"].as_array().unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            let random: Vec<u8> = (0..16)
                .map(|i| {
                    u8::from_str_radix(&case["random"].as_str().unwrap()[i * 2..i * 2 + 2], 16)
                        .unwrap()
                })
                .collect();
            let token = generate_with(
                &key,
                case["userId"].as_str().unwrap(),
                case["timestamp"].as_i64().unwrap(),
                random.try_into().unwrap(),
            )
            .unwrap();
            assert_eq!(token, case["token"].as_str().unwrap());
        }
    }

    /// Node's validateCSRFToken verdicts, including tampered, re-encoded,
    /// expired, wrongly-bound and odd-but-signed tokens.
    #[test]
    fn validation_matches_node() {
        let (key, fx) = fixtures();
        let cases = fx["validate"].as_array().unwrap();
        assert!(cases.len() > 10);
        for case in cases {
            assert_eq!(
                validate_at(
                    &key,
                    case["token"].as_str().unwrap(),
                    case["userId"].as_str().unwrap(),
                    case["now"].as_i64().unwrap()
                ),
                case["valid"].as_bool().unwrap(),
                "{}",
                case["label"]
            );
        }
    }

    /// csrfProtection's answers for the same requests.
    #[test]
    fn guard_matches_csrf_protection() {
        let (key, fx) = fixtures();
        let cases = fx["middleware"].as_array().unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            let mut headers = HeaderMap::new();
            for (k, v) in case["headers"].as_object().unwrap() {
                headers.append(
                    axum::http::HeaderName::from_bytes(k.as_bytes()).unwrap(),
                    v.as_str().unwrap().parse().unwrap(),
                );
            }
            let method: Method = case["method"].as_str().unwrap().parse().unwrap();
            let u = case["userId"].as_str().map(user);
            let got = check(
                &key,
                &method,
                &headers,
                u.as_ref(),
                case["now"].as_i64().unwrap(),
            );
            let (status, body) = match got {
                Ok(()) => (200, Value::Null),
                Err(e) => {
                    let r = e.into_response();
                    let status = r.status().as_u16();
                    let bytes = futures_body(r);
                    (status, serde_json::from_slice(&bytes).unwrap())
                }
            };
            assert_eq!(
                (status, &body),
                (case["status"].as_u64().unwrap() as u16, &case["body"]),
                "{}",
                case["label"]
            );
        }
    }

    fn futures_body(r: Response) -> Vec<u8> {
        let rt = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        rt.block_on(async {
            axum::body::to_bytes(r.into_body(), 4096)
                .await
                .unwrap()
                .to_vec()
        })
    }

    #[test]
    fn base64_like_buffer_from() {
        let fx = crate::cookies::tests::fixtures();
        for case in fx["base64"].as_array().unwrap() {
            assert_eq!(
                hex(&node_base64_decode(case[0].as_str().unwrap())),
                case[1].as_str().unwrap(),
                "{case}"
            );
        }
    }

    #[test]
    fn round_trip_and_binding() {
        let key = CsrfKey::from_secret(Some("k"));
        let token = generate(&key, "USER0000000001").unwrap();
        assert!(validate(&key, &token, "USER0000000001"));
        assert!(!validate(&key, &token, "USER0000000002"));
        assert!(!validate(
            &CsrfKey::from_secret(Some("other")),
            &token,
            "USER0000000001"
        ));
        assert!(!validate(&CsrfKey::default(), &token, "USER0000000001"));
        let later = Utc::now().timestamp_millis() + 86_400_001;
        assert!(!validate_at(&key, &token, "USER0000000001", later));
    }

    #[test]
    fn stringify_orders_keys_like_javascript() {
        let parsed: Ordered =
            serde_json::from_str(r#"{"b":1,"2":0,"a":[1.0,0.5],"1":"x","b":2}"#).unwrap();
        let mut s = String::new();
        parsed.stringify(&mut s);
        assert_eq!(s, r#"{"1":"x","2":0,"b":2,"a":[1,0.5]}"#);
    }
}
