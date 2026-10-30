//! Cookies the way the Express backend reads and writes them.
//!
//! * Reading matches `cookie-parser` 1.4 (on `cookie` 0.7.2): every `Cookie`
//!   header line is joined with `; ` (as Node does), the first occurrence of a
//!   name wins, names and values are trimmed of spaces and tabs, one pair of
//!   surrounding double quotes is dropped, `%XX` escapes are decoded with
//!   `decodeURIComponent` semantics (a malformed escape keeps the raw text), and
//!   a value starting with `j:` that parses as JSON becomes that JSON value when
//!   it is truthy (`j:1` is the number 1, `j:0` stays the string `"j:0"`).
//! * Writing matches Express 4 `res.cookie` / `res.clearCookie` on `cookie`
//!   0.7.1's `serialize`: `encodeURIComponent` on the value, `maxAge` in
//!   milliseconds becoming `Max-Age=<floor(ms/1000)>` plus `Expires=now+ms`, the
//!   default `Path=/`, and the attributes in the same order
//!   (`Max-Age; Domain; Path; Expires; HttpOnly; Secure; Partitioned; Priority;
//!   SameSite`).
//!
//! `backend/scripts/gen-rust-fixtures.js` records what the Node code produces
//! for a set of inputs (`fixtures/node_compat.json`); the tests below replay it.

use std::collections::HashMap;

use axum::http::{HeaderMap, HeaderValue, header};
use chrono::{DateTime, TimeZone, Utc};
use serde_json::Value;

/// `req.cookies`: name → value (a JSON string for ordinary cookies, any JSON
/// value for a truthy `j:` cookie).
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Cookies(HashMap<String, Value>);

impl Cookies {
    /// Parse the request's `Cookie` headers like `cookieParser()`.
    pub fn from_headers(headers: &HeaderMap) -> Self {
        let lines: Vec<&str> = headers
            .get_all(header::COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .collect();
        if lines.is_empty() {
            return Self::default();
        }
        Self::parse(&lines.join("; "))
    }

    /// Parse one `Cookie` header value.
    pub fn parse(header: &str) -> Self {
        let mut map = HashMap::new();
        for (name, raw) in parse_pairs(header) {
            map.entry(name).or_insert_with(|| json_cookie(decode(&raw)));
        }
        Self(map)
    }

    /// `req.cookies[name]`.
    pub fn get(&self, name: &str) -> Option<&Value> {
        self.0.get(name)
    }

    /// `req.cookies[name]` when it is a string (`typeof v === 'string'`).
    pub fn get_str(&self, name: &str) -> Option<&str> {
        self.0.get(name).and_then(Value::as_str)
    }

    /// `req.cookies[name] !== undefined`.
    pub fn contains(&self, name: &str) -> bool {
        self.0.contains_key(name)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&String, &Value)> {
        self.0.iter()
    }
}

/// A request cookie as `req.cookies[name]` sees it.
pub fn get(headers: &HeaderMap, name: &str) -> Option<Value> {
    Cookies::from_headers(headers).get(name).cloned()
}

/// A request cookie when it is a string.
pub fn get_str(headers: &HeaderMap, name: &str) -> Option<String> {
    get(headers, name).and_then(|v| match v {
        Value::String(s) => Some(s),
        _ => None,
    })
}

fn is_space_or_tab(c: char) -> bool {
    c == ' ' || c == '\t'
}

/// `cookie.parse`'s scan: `(name, raw value)` pairs in order, duplicates kept.
fn parse_pairs(s: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if s.len() < 2 {
        return out;
    }
    let mut index = 0;
    while index < s.len() {
        let Some(eq) = s[index..].find('=').map(|i| i + index) else {
            break;
        };
        let end = s[index..].find(';').map_or(s.len(), |i| i + index);
        if eq > end {
            // A pair without `=`: skip to the `;` before this `=`.
            index = s[..eq].rfind(';').map_or(0, |i| i + 1);
            continue;
        }
        let name = s[index..eq].trim_matches(is_space_or_tab);
        let mut value = s[eq + 1..end].trim_matches(is_space_or_tab);
        if value.starts_with('"') && value.ends_with('"') {
            // A lone `"` is both the opening and the closing quote: "".
            value = value.get(1..value.len() - 1).unwrap_or("");
        }
        out.push((name.to_owned(), value.to_owned()));
        index = end + 1;
    }
    out
}

/// `decodeURIComponent`, or the input unchanged when it would throw (a `%` not
/// followed by two hex digits, or escapes that are not valid UTF-8).
pub fn decode(raw: &str) -> String {
    if !raw.contains('%') {
        return raw.to_owned();
    }
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = |b: Option<&u8>| b.and_then(|b| (*b as char).to_digit(16));
            match (hex(bytes.get(i + 1)), hex(bytes.get(i + 2))) {
                (Some(hi), Some(lo)) => {
                    out.push((hi * 16 + lo) as u8);
                    i += 3;
                }
                _ => return raw.to_owned(),
            }
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| raw.to_owned())
}

/// cookie-parser's `JSONCookie`: a `j:` value that parses as JSON and is
/// truthy replaces the string.
fn json_cookie(value: String) -> Value {
    if let Some(json) = value.strip_prefix("j:")
        && let Ok(parsed) = serde_json::from_str::<Value>(json)
        && crate::body::truthy(Some(&parsed))
    {
        return parsed;
    }
    Value::String(value)
}

/// `encodeURIComponent`.
pub fn encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
        {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SameSite {
    Strict,
    Lax,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    Low,
    Medium,
    High,
}

/// The `res.cookie` options the backend uses. `max_age_ms` is Express's
/// `maxAge` (milliseconds; NaN is rejected the way `cookie.serialize` throws).
#[derive(Debug, Clone, Default)]
pub struct CookieOptions {
    pub max_age_ms: Option<f64>,
    pub expires: Option<DateTime<Utc>>,
    pub domain: Option<String>,
    /// `None` is Express's default `/`; `Some("")` omits the attribute.
    pub path: Option<String>,
    pub http_only: bool,
    pub secure: bool,
    pub partitioned: bool,
    pub priority: Option<Priority>,
    pub same_site: Option<SameSite>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CookieError {
    /// `argument name is invalid`
    Name,
    /// `argument val is invalid` (cannot happen after encodeURIComponent)
    Value,
    /// `option maxAge is invalid`
    MaxAge,
    /// `option domain is invalid`
    Domain,
    /// `option path is invalid`
    Path,
    /// `option expires is invalid`
    Expires,
}

impl std::fmt::Display for CookieError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let what = match self {
            Self::Name => "argument name is invalid",
            Self::Value => "argument val is invalid",
            Self::MaxAge => "option maxAge is invalid",
            Self::Domain => "option domain is invalid",
            Self::Path => "option path is invalid",
            Self::Expires => "option expires is invalid",
        };
        f.write_str(what)
    }
}

impl std::error::Error for CookieError {}

/// `Date.prototype.toUTCString()`.
pub fn utc_string(ts: &DateTime<Utc>) -> String {
    ts.format("%a, %d %b %Y %H:%M:%S GMT").to_string()
}

fn is_token(s: &str) -> bool {
    !s.is_empty()
        && s.bytes().all(|b| {
            b.is_ascii_alphanumeric()
                || matches!(
                    b,
                    b'!' | b'#'
                        | b'$'
                        | b'%'
                        | b'&'
                        | b'\''
                        | b'*'
                        | b'+'
                        | b'-'
                        | b'.'
                        | b'^'
                        | b'_'
                        | b'`'
                        | b'|'
                        | b'~'
                )
        })
}

/// What `res.cookie(name, value, options)` appends to `Set-Cookie`, at `now`.
pub fn serialize(
    name: &str,
    value: &str,
    opts: &CookieOptions,
    now: DateTime<Utc>,
) -> Result<String, CookieError> {
    if !is_token(name) {
        return Err(CookieError::Name);
    }
    let mut out = format!("{name}={}", encode_uri_component(value));
    let mut expires = opts.expires;
    if let Some(ms) = opts.max_age_ms {
        if ms.is_nan() {
            // Express skips NaN, then cookie.serialize rejects the NaN maxAge.
            return Err(CookieError::MaxAge);
        }
        let seconds = (ms / 1000.0).floor();
        if !seconds.is_finite() {
            return Err(CookieError::MaxAge);
        }
        // `new Date(Date.now() + maxAge)`: an out-of-range date is Invalid Date.
        let at = now.timestamp_millis() as f64 + ms;
        expires = Some(
            (at.abs() <= 8.64e15)
                .then(|| Utc.timestamp_millis_opt(at.trunc() as i64).single())
                .flatten()
                .ok_or(CookieError::Expires)?,
        );
        out.push_str(&format!("; Max-Age={}", seconds as i64));
    }
    if let Some(domain) = opts.domain.as_deref().filter(|d| !d.is_empty()) {
        let valid = domain
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-');
        if !valid {
            return Err(CookieError::Domain);
        }
        out.push_str(&format!("; Domain={domain}"));
    }
    let path = opts.path.as_deref().unwrap_or("/");
    if !path.is_empty() {
        if !path
            .bytes()
            .all(|b| (0x20..=0x7e).contains(&b) && b != b';')
        {
            return Err(CookieError::Path);
        }
        out.push_str(&format!("; Path={path}"));
    }
    if let Some(expires) = expires {
        out.push_str(&format!("; Expires={}", utc_string(&expires)));
    }
    if opts.http_only {
        out.push_str("; HttpOnly");
    }
    if opts.secure {
        out.push_str("; Secure");
    }
    if opts.partitioned {
        out.push_str("; Partitioned");
    }
    match opts.priority {
        Some(Priority::Low) => out.push_str("; Priority=Low"),
        Some(Priority::Medium) => out.push_str("; Priority=Medium"),
        Some(Priority::High) => out.push_str("; Priority=High"),
        None => {}
    }
    match opts.same_site {
        Some(SameSite::Strict) => out.push_str("; SameSite=Strict"),
        Some(SameSite::Lax) => out.push_str("; SameSite=Lax"),
        Some(SameSite::None) => out.push_str("; SameSite=None"),
        None => {}
    }
    Ok(out)
}

/// `res.cookie(name, value, options)` as a `Set-Cookie` header value.
pub fn set_cookie(
    name: &str,
    value: &str,
    opts: &CookieOptions,
    now: DateTime<Utc>,
) -> Result<HeaderValue, CookieError> {
    let s = serialize(name, value, opts, now)?;
    HeaderValue::from_str(&s).map_err(|_| CookieError::Value)
}

/// `res.clearCookie(name, options)`: an empty value expiring at the epoch
/// (`Expires=Thu, 01 Jan 1970 00:00:00 GMT`) on `Path=/` unless the options
/// say otherwise. A `max_age_ms` still wins, as in Express 4.
pub fn clear_cookie(
    name: &str,
    opts: &CookieOptions,
    now: DateTime<Utc>,
) -> Result<HeaderValue, CookieError> {
    let mut opts = opts.clone();
    if opts.expires.is_none() {
        opts.expires = Utc.timestamp_millis_opt(1).single();
    }
    set_cookie(name, "", &opts, now)
}

/// `process.env.NODE_ENV === 'production'` — the backend's `secure` flag.
pub fn is_production() -> bool {
    std::env::var("NODE_ENV").is_ok_and(|v| v == "production")
}

/// `Number.parseInt(process.env[name] || fallback, 10)` for a TTL in ms
/// (NaN when the variable is not a number, as in Node).
pub fn env_ttl_ms(name: &str, fallback: &str) -> f64 {
    let raw = std::env::var(name).ok().filter(|v| !v.is_empty());
    crate::params::js_parse_int(raw.as_deref().unwrap_or(fallback)).map_or(f64::NAN, |n| n as f64)
}

/// The `admin_auth` cookie a back-office login sets (userRoutes.js login):
/// HttpOnly, Secure in production, SameSite=Strict, `ADMIN_AUTH_COOKIE_TTL_MS`
/// (default 24h).
pub fn admin_auth_cookie(token: &str, now: DateTime<Utc>) -> Result<HeaderValue, CookieError> {
    set_cookie(
        "admin_auth",
        token,
        &CookieOptions {
            http_only: true,
            secure: is_production(),
            same_site: Some(SameSite::Strict),
            path: Some("/".into()),
            max_age_ms: Some(env_ttl_ms("ADMIN_AUTH_COOKIE_TTL_MS", "86400000")),
            ..CookieOptions::default()
        },
        now,
    )
}

/// The cookies `POST /api/admin/logout` clears: `admin_auth` (HttpOnly) and
/// `csrf_token`, both `Path=/; SameSite=Strict`, Secure in production.
pub fn logout_cookies(now: DateTime<Utc>) -> Result<[HeaderValue; 2], CookieError> {
    let base = CookieOptions {
        path: Some("/".into()),
        same_site: Some(SameSite::Strict),
        secure: is_production(),
        ..CookieOptions::default()
    };
    Ok([
        clear_cookie(
            "admin_auth",
            &CookieOptions {
                http_only: true,
                ..base.clone()
            },
            now,
        )?,
        clear_cookie("csrf_token", &base, now)?,
    ])
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::json;

    pub(crate) fn fixtures() -> Value {
        serde_json::from_str(include_str!("../fixtures/node_compat.json")).unwrap()
    }

    #[test]
    fn parse_matches_cookie_parser() {
        let fx = fixtures();
        let cases = fx["cookie_parse"].as_array().unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            let header = case["header"].as_str().unwrap();
            let parsed = Cookies::parse(header);
            let expected = case["cookies"].as_object().unwrap();
            assert_eq!(
                parsed.0.len(),
                expected.len(),
                "{header:?}: {:?} vs {expected:?}",
                parsed.0
            );
            for (k, v) in expected {
                assert_eq!(parsed.get(k), Some(v), "{header:?} [{k}]");
            }
        }
    }

    #[test]
    fn serialize_matches_express() {
        let fx = fixtures();
        let now = Utc
            .timestamp_millis_opt(fx["now_ms"].as_i64().unwrap())
            .unwrap();
        let cases = fx["set_cookie"].as_array().unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            let o = &case["options"];
            let opts = CookieOptions {
                max_age_ms: o.get("maxAge").map(|v| v.as_f64().unwrap_or(f64::NAN)),
                expires: o
                    .get("expires_ms")
                    .and_then(Value::as_i64)
                    .and_then(|ms| Utc.timestamp_millis_opt(ms).single()),
                domain: o.get("domain").and_then(Value::as_str).map(str::to_owned),
                path: o.get("path").and_then(Value::as_str).map(str::to_owned),
                http_only: o.get("httpOnly").and_then(Value::as_bool).unwrap_or(false),
                secure: o.get("secure").and_then(Value::as_bool).unwrap_or(false),
                partitioned: false,
                priority: None,
                same_site: match o.get("sameSite").and_then(Value::as_str) {
                    Some("strict") => Some(SameSite::Strict),
                    Some("lax") => Some(SameSite::Lax),
                    Some("none") => Some(SameSite::None),
                    _ => None,
                },
            };
            let name = case["name"].as_str().unwrap();
            let got = if case["clear"].as_bool().unwrap_or(false) {
                clear_cookie(name, &opts, now).map(|h| h.to_str().unwrap().to_owned())
            } else {
                serialize(name, case["value"].as_str().unwrap(), &opts, now)
            };
            match case.get("set_cookie").and_then(Value::as_str) {
                Some(expected) => assert_eq!(got.as_deref(), Ok(expected), "{case}"),
                None => assert!(got.is_err(), "{case}: Node threw, Rust gave {got:?}"),
            }
        }
    }

    #[test]
    fn encode_uri_component_matches_javascript() {
        let fx = fixtures();
        for case in fx["encode_uri_component"].as_array().unwrap() {
            assert_eq!(
                encode_uri_component(case[0].as_str().unwrap()),
                case[1].as_str().unwrap()
            );
        }
    }

    #[test]
    fn json_and_duplicate_rules() {
        let c = Cookies::parse("a=j:1; a=2; b=j:0; c=j:\"s\"; d=j:{bad");
        assert_eq!(c.get("a"), Some(&json!(1)), "first wins, j: parsed");
        assert_eq!(c.get_str("a"), None);
        assert_eq!(c.get("b"), Some(&json!("j:0")), "falsy JSON keeps the text");
        assert_eq!(c.get_str("c"), Some("s"));
        assert_eq!(c.get_str("d"), Some("j:{bad"));
        assert!(!c.contains("e"));
    }

    #[test]
    fn multiple_cookie_headers_are_joined() {
        let mut h = HeaderMap::new();
        h.append(header::COOKIE, "a=1".parse().unwrap());
        h.append(header::COOKIE, "b=2; a=3".parse().unwrap());
        let c = Cookies::from_headers(&h);
        assert_eq!(c.get_str("a"), Some("1"));
        assert_eq!(c.get_str("b"), Some("2"));
        assert_eq!(get_str(&h, "b").as_deref(), Some("2"));
        assert_eq!(get(&HeaderMap::new(), "a"), None);
    }

    #[test]
    fn helpers_build_the_backend_cookies() {
        let now = Utc.timestamp_millis_opt(1_700_000_000_123).unwrap();
        let [auth, csrf] = logout_cookies(now).unwrap();
        let secure = if is_production() { "; Secure" } else { "" };
        assert_eq!(
            auth.to_str().unwrap(),
            format!(
                "admin_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly{secure}; SameSite=Strict"
            )
        );
        assert_eq!(
            csrf.to_str().unwrap(),
            format!(
                "csrf_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT{secure}; SameSite=Strict"
            )
        );
    }
}
