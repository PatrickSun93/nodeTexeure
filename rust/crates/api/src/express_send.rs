//! Express 4's `res.send` / `res.json` for answers that are not just a JSON
//! envelope: CSV downloads (`res.setHeader(...)` then `res.send(csv)`), plain
//! text and HTML (`res.status(400).send('Webhook Error: …')`), buffers.
//!
//! * **Content-Type**: a string body without one is `text/html; charset=utf-8`,
//!   a buffer `application/octet-stream`, `res.json` `application/json;
//!   charset=utf-8`; a type the route set on a string body gets
//!   `; charset=utf-8` (`text/csv` → `text/csv; charset=utf-8`).
//! * **Content-Length** and a weak **ETag** (`W/"<len hex>-<sha1 base64, 27>"`,
//!   the `etag` package), unless the route set one.
//! * **Freshness**: a GET/HEAD whose `If-None-Match` matches (or is `*`), and
//!   no `Cache-Control: no-cache` in the request, becomes a bodiless 304 for a
//!   2xx answer; 204/304 drop Content-Type/Length.
//! * **HEAD**: headers only.
//!
//! [`Send::headers`] are the ones set before `res.send` (`res.setHeader`,
//! `res.attachment` — see [`attachment`]).

use axum::body::Body;
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header};
use axum::response::Response;
use base64::Engine;
use sha1::{Digest, Sha1};

/// What `res.send(body)` is given.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Payload {
    /// A string (sent as UTF-8).
    Text(String),
    /// A Buffer.
    Bytes(Vec<u8>),
}

/// The `etag` package's weak tag for a body.
pub fn weak_etag(body: &[u8]) -> String {
    if body.is_empty() {
        return "W/\"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk\"".into();
    }
    let hash = base64::engine::general_purpose::STANDARD.encode(Sha1::digest(body));
    format!("W/\"{:x}-{}\"", body.len(), &hash[..27])
}

/// `setCharset(type, 'utf-8')` (content-type parse + format): the media type
/// lowercased, parameters kept (sorted by name), `charset=utf-8`.
pub fn set_charset(content_type: &str) -> String {
    let mut parts = content_type.split(';');
    let media = parts.next().unwrap_or("").trim().to_ascii_lowercase();
    let mut params: Vec<(String, String)> = parts
        .filter_map(|p| {
            let (k, v) = p.split_once('=')?;
            let k = k.trim().to_ascii_lowercase();
            let v = v.trim();
            let v = v
                .strip_prefix('"')
                .and_then(|v| v.strip_suffix('"'))
                .unwrap_or(v);
            Some((k, v.to_owned()))
        })
        .filter(|(k, _)| k != "charset")
        .collect();
    params.push(("charset".into(), "utf-8".into()));
    params.sort_by(|a, b| a.0.cmp(&b.0));
    let mut out = media;
    for (k, v) in params {
        let token = !v.is_empty()
            && v.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+.^_`|~-".contains(&b));
        if token {
            out.push_str(&format!("; {k}={v}"));
        } else {
            out.push_str(&format!(
                "; {k}=\"{}\"",
                v.replace('\\', "\\\\").replace('"', "\\\"")
            ));
        }
    }
    out
}

/// The `fresh` package: does the client's cached copy (If-None-Match) match?
pub fn fresh(request: &HeaderMap, etag: Option<&str>) -> bool {
    let get = |name: HeaderName| {
        request
            .get(name)
            .map(|v| String::from_utf8_lossy(v.as_bytes()).into_owned())
    };
    let none_match = get(header::IF_NONE_MATCH).filter(|v| !v.is_empty());
    let modified_since = get(header::IF_MODIFIED_SINCE).filter(|v| !v.is_empty());
    if none_match.is_none() && modified_since.is_none() {
        return false;
    }
    if let Some(cc) = get(header::CACHE_CONTROL)
        && cc
            .split(',')
            .any(|d| d.trim_matches(|c: char| c == ' ' || c == '\t') == "no-cache")
    {
        return false;
    }
    if let Some(none_match) = &none_match
        && none_match != "*"
    {
        let Some(etag) = etag else { return false };
        let matched = none_match
            .split([' ', ','])
            .filter(|t| !t.is_empty())
            .any(|m| m == etag || format!("W/{etag}") == m || format!("W/{m}") == etag);
        if !matched {
            return false;
        }
    }
    // No route sets Last-Modified, so an If-Modified-Since is always stale.
    modified_since.is_none()
}

/// `res.status(status)` + headers set so far + `res.send(payload)`.
#[derive(Debug, Clone)]
pub struct Send {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub payload: Payload,
}

impl Send {
    pub fn new(status: StatusCode, payload: Payload) -> Self {
        Self {
            status,
            headers: HeaderMap::new(),
            payload,
        }
    }

    /// `res.setHeader(name, value)` before the send.
    pub fn header(mut self, name: HeaderName, value: &str) -> Self {
        if let Ok(v) = HeaderValue::from_str(value) {
            self.headers.insert(name, v);
        }
        self
    }

    /// The response for a request with this method and headers.
    pub fn respond(self, method: &Method, request: &HeaderMap) -> Response {
        let Send {
            mut status,
            mut headers,
            payload,
        } = self;
        let (bytes, is_text) = match payload {
            Payload::Text(s) => (s.into_bytes(), true),
            Payload::Bytes(b) => (b, false),
        };
        let content_type = headers
            .get(header::CONTENT_TYPE)
            .map(|v| String::from_utf8_lossy(v.as_bytes()).into_owned());
        match (content_type, is_text) {
            (None, true) => {
                headers.insert(
                    header::CONTENT_TYPE,
                    HeaderValue::from_static("text/html; charset=utf-8"),
                );
            }
            (None, false) => {
                headers.insert(
                    header::CONTENT_TYPE,
                    HeaderValue::from_static("application/octet-stream"),
                );
            }
            (Some(ct), true) => {
                if let Ok(v) = HeaderValue::from_str(&set_charset(&ct)) {
                    headers.insert(header::CONTENT_TYPE, v);
                }
            }
            (Some(_), false) => {}
        }
        headers.insert(header::CONTENT_LENGTH, HeaderValue::from(bytes.len()));
        if !headers.contains_key(header::ETAG)
            && let Ok(v) = HeaderValue::from_str(&weak_etag(&bytes))
        {
            headers.insert(header::ETAG, v);
        }
        let is_get = *method == Method::GET || *method == Method::HEAD;
        let cacheable = status.is_success() || status == StatusCode::NOT_MODIFIED;
        let etag = headers
            .get(header::ETAG)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        if is_get && cacheable && fresh(request, etag.as_deref()) {
            status = StatusCode::NOT_MODIFIED;
        }
        let mut body = bytes;
        if status == StatusCode::NO_CONTENT || status == StatusCode::NOT_MODIFIED {
            headers.remove(header::CONTENT_TYPE);
            headers.remove(header::CONTENT_LENGTH);
            headers.remove(header::TRANSFER_ENCODING);
            body = Vec::new();
        }
        if status == StatusCode::RESET_CONTENT {
            headers.insert(header::CONTENT_LENGTH, HeaderValue::from(0));
            headers.remove(header::TRANSFER_ENCODING);
            body = Vec::new();
        }
        if *method == Method::HEAD {
            body = Vec::new();
        }
        let mut response = Response::new(Body::from(body));
        *response.status_mut() = status;
        *response.headers_mut() = headers;
        response
    }
}

/// `res.json(value)` with Express's headers (charset, ETag, 304s).
pub fn json(
    status: StatusCode,
    value: &serde_json::Value,
    method: &Method,
    request: &HeaderMap,
) -> Response {
    Send::new(status, Payload::Text(value.to_string()))
        .header(header::CONTENT_TYPE, "application/json")
        .respond(method, request)
}

/// `res.attachment(filename)`: the `content-disposition` package's header
/// for the basename (quoted, with an RFC 5987 `filename*` for non-latin1).
pub fn attachment(filename: &str) -> String {
    let name = filename.rsplit(['/', '\\']).next().unwrap_or(filename);
    let latin1 = name.chars().all(|c| (c as u32) <= 0xff);
    let fallback: String = name
        .chars()
        .map(|c| if (c as u32) <= 0xff { c } else { '?' })
        .collect();
    let quoted = |s: &str| format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""));
    let hex_escape = name
        .as_bytes()
        .windows(3)
        .any(|w| w[0] == b'%' && w[1].is_ascii_hexdigit() && w[2].is_ascii_hexdigit());
    if latin1 && !hex_escape {
        format!("attachment; filename={}", quoted(&fallback))
    } else {
        let encoded: String = name
            .bytes()
            .map(|b| {
                // encodeURIComponent, then ' ( ) * escaped too.
                if b.is_ascii_alphanumeric() || b"-_.!~".contains(&b) {
                    (b as char).to_string()
                } else {
                    format!("%{b:02X}")
                }
            })
            .collect();
        format!(
            "attachment; filename={}; filename*=UTF-8''{encoded}",
            quoted(&fallback)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Recorded from express 4.22 (backend/scripts/gen-foundation-fixtures.js).
    #[test]
    fn etags_match_express() {
        assert_eq!(weak_etag(b""), "W/\"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk\"");
        assert_eq!(weak_etag(b"hello"), "W/\"5-qvTGHdzF6KLavt4PO0gs2a6pQ00\"");
    }

    #[test]
    fn charset_is_added() {
        assert_eq!(set_charset("text/csv"), "text/csv; charset=utf-8");
        assert_eq!(
            set_charset("Text/HTML; charset=latin1"),
            "text/html; charset=utf-8"
        );
        assert_eq!(
            set_charset("text/plain; format=flowed"),
            "text/plain; charset=utf-8; format=flowed"
        );
    }

    #[test]
    fn sends_like_express() {
        let r = Send::new(StatusCode::OK, Payload::Text("a,b\r\n1,2".into()))
            .header(header::CONTENT_TYPE, "text/csv")
            .respond(&Method::GET, &HeaderMap::new());
        assert_eq!(r.headers()[header::CONTENT_TYPE], "text/csv; charset=utf-8");
        assert_eq!(r.headers()[header::CONTENT_LENGTH], "8");
        let etag = r.headers()[header::ETAG].to_str().unwrap().to_owned();
        let mut req = HeaderMap::new();
        req.insert(header::IF_NONE_MATCH, etag.parse().unwrap());
        let r = Send::new(StatusCode::OK, Payload::Text("a,b\r\n1,2".into()))
            .respond(&Method::GET, &req);
        assert_eq!(r.status(), StatusCode::NOT_MODIFIED);
        assert!(!r.headers().contains_key(header::CONTENT_TYPE));
        req.insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());
        let r = Send::new(StatusCode::OK, Payload::Text("a,b\r\n1,2".into()))
            .respond(&Method::GET, &req);
        assert_eq!(r.status(), StatusCode::OK);
        let r = Send::new(StatusCode::BAD_REQUEST, Payload::Text("nope".into()))
            .respond(&Method::POST, &HeaderMap::new());
        assert_eq!(
            r.headers()[header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
    }

    #[test]
    fn attachments() {
        assert_eq!(
            attachment("a/b/orders.csv"),
            "attachment; filename=\"orders.csv\""
        );
        assert_eq!(
            attachment("€.csv"),
            "attachment; filename=\"?.csv\"; filename*=UTF-8''%E2%82%AC.csv"
        );
    }
}
