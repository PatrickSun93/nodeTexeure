//! What Express itself does around a route, for handlers that must answer
//! exactly like backend/server.js: the body parsers (`express.json()` then
//! `express.urlencoded({ extended: true })`), the app's 404 handler, its error
//! handler, and route-parameter decoding. Plus the JavaScript string semantics
//! (trim, UTF-16 length and slicing) the route code relies on.

use axum::Json;
use axum::body::Body;
use axum::http::{HeaderMap, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use common::response::failure_with;
use serde_json::{Value, json};

/// body-parser's default `limit` ('100kb').
const BODY_LIMIT: usize = 100 * 1024;

/// The app's 404 handler: `{ path: req.originalUrl, timestamp }`.
pub fn not_found(uri: &Uri) -> Response {
    let path = uri
        .path_and_query()
        .map_or_else(|| uri.path().to_owned(), |pq| pq.as_str().to_owned());
    (
        StatusCode::NOT_FOUND,
        Json(failure_with(
            "Endpoint not found",
            json!({ "path": path, "timestamp": now_iso() }),
        )),
    )
        .into_response()
}

/// The app's error handler (any error passed to `next(err)`, e.g. a body the
/// parsers reject): 500, with the message outside production.
pub fn internal_error(message: &str) -> Response {
    let error = if crate::cookies::is_production() || message.is_empty() {
        "Internal server error"
    } else {
        message
    };
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(failure_with(
            "Internal server error",
            json!({ "timestamp": now_iso(), "error": error }),
        )),
    )
        .into_response()
}

/// `new Date().toISOString()`.
pub fn now_iso() -> String {
    common::timestamp::format(&Utc::now())
}

/// Media type (lowercased, without parameters) and `charset` of a request.
fn content_type(headers: &HeaderMap) -> Option<(String, Option<String>)> {
    let raw = headers.get(header::CONTENT_TYPE)?.to_str().ok()?;
    let mut parts = raw.split(';');
    let mime = parts.next()?.trim().to_ascii_lowercase();
    let charset = parts.find_map(|p| {
        let (k, v) = p.split_once('=')?;
        k.trim()
            .eq_ignore_ascii_case("charset")
            .then(|| v.trim().trim_matches('"').to_ascii_lowercase())
    });
    Some((mime, charset))
}

/// V8's `Unexpected token` message for the character at UTF-16 offset `pos`:
/// the whole text up to 20 units, else 10 units of context either side.
pub fn unexpected_token(text: &str, pos: usize) -> String {
    let units: Vec<u16> = text.encode_utf16().collect();
    let len = units.len();
    let token = char::decode_utf16(units[pos.min(len)..].iter().copied())
        .next()
        .and_then(Result::ok)
        .unwrap_or('\u{fffd}');
    let s = |a: usize, b: usize| String::from_utf16_lossy(&units[a..b.min(len)]);
    let shown = if len <= 20 {
        format!("\"{text}\"")
    } else if pos < 10 {
        format!("\"{}\"...", s(0, pos + 10))
    } else if pos + 10 < len {
        format!("...\"{}\"...", s(pos - 10, pos + 10))
    } else {
        format!("...\"{}\"", s(pos - 10, len))
    };
    format!("Unexpected token '{token}', {shown} is not valid JSON")
}

const JSON_WS: [char; 4] = [' ', '\t', '\n', '\r'];

/// The first non-whitespace character and its UTF-16 offset.
fn first_token(text: &str) -> Option<(char, usize)> {
    let (i, c) = text.char_indices().find(|(_, c)| !JSON_WS.contains(c))?;
    Some((c, text[..i].encode_utf16().count()))
}

/// body-parser's strict-mode error, for a body whose first character is not
/// `{` or `[` (checked before parsing, so the rest does not matter).
pub fn strict_violation_message(text: &str) -> String {
    match first_token(text) {
        Some((_, pos)) => unexpected_token(text, pos),
        None => "Unexpected end of JSON input".into(),
    }
}

/// V8's `JSON.parse` message for `text` ([`crate::v8_json`]); empty when it
/// parses.
pub fn json_syntax_message(text: &str) -> String {
    crate::v8_json::parse(text).err().unwrap_or_default()
}

/// `req.body` after `express.json()` and `express.urlencoded({ extended: true })`:
/// `{}` when neither applies; `Err` is the parser's error message (Node's error
/// handler answers it, see [`internal_error`]).
pub fn parse_body(headers: &HeaderMap, bytes: &[u8]) -> Result<Value, String> {
    let has_body = headers.contains_key(header::TRANSFER_ENCODING)
        || headers
            .get(header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.trim().parse::<u64>().is_ok());
    let Some((mime, charset)) = content_type(headers).filter(|_| has_body) else {
        return Ok(json!({}));
    };
    match mime.as_str() {
        "application/json" => {
            if let Some(c) = charset.as_deref().filter(|c| !c.starts_with("utf-")) {
                return Err(format!("unsupported charset \"{}\"", c.to_uppercase()));
            }
            if bytes.len() > BODY_LIMIT {
                return Err("request entity too large".into());
            }
            let raw = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
            let text = String::from_utf8_lossy(raw);
            if text.is_empty() {
                return Ok(json!({}));
            }
            // strict: only an object or array, checked before parsing.
            if !matches!(first_token(&text), Some(('{' | '[', _))) {
                return Err(strict_violation_message(&text));
            }
            serde_json::from_str::<Value>(&text).map_err(|_| json_syntax_message(&text))
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
            let text = String::from_utf8_lossy(bytes);
            if text.is_empty() {
                return Ok(json!({}));
            }
            let count = text.matches('&').count() + 1;
            if count > 1000 {
                return Err("too many parameters".into());
            }
            crate::qs::parse(&text, &crate::qs::urlencoded(count))
                .map(Value::Object)
                .map_err(|_| "The input exceeded the depth".into())
        }
        _ => Ok(json!({})),
    }
}

/// Reads a request body the way body-parser does (anything past its limit is
/// an error, never a silent truncation).
pub async fn read_body(headers: &HeaderMap, body: Body) -> Result<Value, Response> {
    match axum::body::to_bytes(body, 4 * BODY_LIMIT).await {
        Ok(bytes) => parse_body(headers, &bytes).map_err(|message| internal_error(&message)),
        Err(_) => Err(internal_error("request entity too large")),
    }
}

/// Express's `decode_param`: `decodeURIComponent`, and a failure is an error
/// (`Failed to decode param '…'`) for the error handler ([`internal_error`]).
pub fn decode_param(raw: &str) -> Result<String, String> {
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
                    continue;
                }
                _ => return Err(param_error(raw)),
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).map_err(|_| param_error(raw))
}

fn param_error(raw: &str) -> String {
    format!("Failed to decode param '{raw}'")
}

/// JavaScript whitespace (`String.prototype.trim`, `\s`): Unicode White_Space
/// minus U+0085, plus U+FEFF.
pub fn is_js_space(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}'
}

/// `String.prototype.trim`.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_space)
}

/// `str.length`: UTF-16 code units.
pub fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// `str.slice(0, n)` written out as UTF-8 the way mysql2 sends it: a surrogate
/// pair cut in half becomes U+FFFD.
pub fn js_slice(s: &str, n: usize) -> String {
    let units: Vec<u16> = s.encode_utf16().take(n).collect();
    String::from_utf16_lossy(&units)
}

/// `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (the routes' EMAIL_RE).
pub fn is_email(s: &str) -> bool {
    if s.chars().any(is_js_space) {
        return false;
    }
    let Some((local, domain)) = s.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.contains('@')
        && domain
            .bytes()
            .enumerate()
            .any(|(i, b)| b == b'.' && i > 0 && i + 1 < domain.len())
}

/// A JSON value as a template literal / `String()` shows it (`undefined` for
/// a missing one).
pub fn template(value: Option<&Value>) -> String {
    value.map_or_else(|| "undefined".into(), crate::body::js_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(ct: &str, len: usize) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(header::CONTENT_TYPE, ct.parse().unwrap());
        h.insert(header::CONTENT_LENGTH, len.to_string().parse().unwrap());
        h
    }

    #[test]
    fn email_regex() {
        assert!(is_email("a@b.co"));
        assert!(is_email("a.b@c.d.e"));
        assert!(!is_email("a@b."));
        assert!(!is_email("a@.b"));
        assert!(!is_email("a@b"));
        assert!(!is_email("@b.c"));
        assert!(!is_email("a@b@c.d"));
        assert!(!is_email("a b@c.d"));
        assert!(is_email("a\u{85}@b.c"), "U+0085 is not \\s in JS");
        assert!(!is_email("a\u{feff}@b.c"));
    }

    #[test]
    fn js_strings() {
        assert_eq!(js_trim("\u{feff} a \u{3000}"), "a");
        assert_eq!(js_trim("\u{85}a"), "\u{85}a");
        assert_eq!(js_len("a😀"), 3);
        assert_eq!(js_slice("a😀b", 2), "a\u{fffd}");
        assert_eq!(js_slice("a😀b", 3), "a😀");
    }

    #[test]
    fn bodies() {
        let b = br#"{"a":1}"#;
        assert_eq!(
            parse_body(&headers("application/json", b.len()), b).unwrap(),
            json!({ "a": 1 })
        );
        let f = b"a[]=1&b=x+y";
        assert_eq!(
            parse_body(&headers("application/x-www-form-urlencoded", f.len()), f).unwrap(),
            json!({ "a": ["1"], "b": "x y" })
        );
        assert!(parse_body(&headers("application/json", 4), b"{bad").is_err());
        assert_eq!(
            parse_body(&headers("application/json", 1), b"1").unwrap_err(),
            "Unexpected token '1', \"1\" is not valid JSON"
        );
        assert_eq!(
            parse_body(&headers("application/json; charset=latin1", 2), b"{}").unwrap_err(),
            "unsupported charset \"LATIN1\""
        );
        assert_eq!(
            parse_body(&headers("text/plain", 1), b"x").unwrap(),
            json!({})
        );
        assert_eq!(parse_body(&HeaderMap::new(), b"").unwrap(), json!({}));
    }

    /// express.urlencoded({ extended: true }) on the same bodies
    /// (backend/scripts/gen-misc-fixtures.js).
    #[test]
    fn matches_express_urlencoded() {
        let fixtures: Value =
            serde_json::from_str(include_str!("../fixtures/misc_compat.json")).unwrap();
        for case in fixtures["urlencoded"].as_array().unwrap() {
            let input = case["input"].as_str().unwrap();
            let h = headers("application/x-www-form-urlencoded", input.len());
            match parse_body(&h, input.as_bytes()) {
                Ok(v) => assert_eq!(v, case["body"], "body {input:?}"),
                Err(message) => assert_eq!(message, case["error"]["message"], "body {input:?}"),
            }
        }
    }

    #[test]
    fn syntax_messages() {
        assert_eq!(json_syntax_message(""), "Unexpected end of JSON input");
        assert_eq!(
            json_syntax_message("<html>"),
            "Unexpected token '<', \"<html>\" is not valid JSON"
        );
        assert_eq!(
            json_syntax_message("<!DOCTYPE html><html>"),
            "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
        );
        // Recorded from body-parser (strict mode) and V8.
        assert_eq!(
            strict_violation_message("\"Ann\""),
            "Unexpected token '\"', \"\"Ann\"\" is not valid JSON"
        );
        assert_eq!(
            strict_violation_message(" 1"),
            "Unexpected token '1', \" 1\" is not valid JSON"
        );
        assert_eq!(
            strict_violation_message("nul"),
            "Unexpected token 'n', \"nul\" is not valid JSON"
        );
        assert_eq!(
            strict_violation_message("  \"a long string here\""),
            "Unexpected token '\"', \"  \"a long st\"... is not valid JSON"
        );
        assert_eq!(
            json_syntax_message("xaaaaaaaaaaaaaaaaaaa"),
            "Unexpected token 'x', \"xaaaaaaaaaaaaaaaaaaa\" is not valid JSON"
        );
        assert_eq!(
            json_syntax_message("xaaaaaaaaaaaaaaaaaaaa"),
            "Unexpected token 'x', \"xaaaaaaaaa\"... is not valid JSON"
        );
        assert_eq!(
            unexpected_token("{\"a\":1, \"b\": [1,2,3,4,5,6,7,8,9,10,11,12,x]}", 41),
            "Unexpected token 'x', ...\",10,11,12,x]}\" is not valid JSON"
        );
        assert_eq!(
            json_syntax_message("{\"a\":"),
            "Unexpected end of JSON input"
        );
    }

    #[test]
    fn params() {
        assert_eq!(decode_param("a%20b").unwrap(), "a b");
        assert!(decode_param("%E0").is_err());
        assert!(decode_param("%zz").is_err());
    }
}
