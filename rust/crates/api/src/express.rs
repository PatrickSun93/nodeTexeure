//! Express 4 request handling that a whole route group needs to answer exactly
//! like Node, beyond [`crate::body`] and [`crate::params`]:
//!
//! * the Router's matching ([`route`]): literals compared case-insensitively,
//!   an optional trailing slash, `:param` = one non-empty segment, routes tried
//!   in registration order with GET also answering HEAD, and params decoded with
//!   `decodeURIComponent` — a bad escape is an error (500), not a miss;
//! * `req.query` and urlencoded `req.body` as the `qs` package parses them
//!   ([`query`], [`body`]): `a=1&a=2` and `a[]=1` are arrays, `a[b]=1` objects;
//! * the app's 404 handler ([`not_found`]) and error handler ([`error`]) from
//!   backend/server.js, including the 500 Express answers for a body that
//!   `express.json()`/`express.urlencoded()` rejects (checked before routing,
//!   so even an unauthenticated request gets it).
//!
//! A group served through [`route`] gets every path and method under its mount
//! point: what Node routes goes to the handler, everything else gets Node's 404.

use axum::Json;
use axum::http::{HeaderMap, Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use common::response::failure_with;
use serde_json::{Map, Value, json};

/// A route's method as registered with `router.get/post/put/delete`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verb {
    /// Also answers HEAD, as Express does for GET routes.
    Get,
    Post,
    Put,
    Delete,
}

impl Verb {
    fn allows(self, method: &Method) -> bool {
        match self {
            Self::Get => method == Method::GET || method == Method::HEAD,
            Self::Post => method == Method::POST,
            Self::Put => method == Method::PUT,
            Self::Delete => method == Method::DELETE,
        }
    }
}

/// Where a request goes.
#[derive(Debug)]
pub enum Routed<T> {
    /// The first route whose path and method match, with its decoded params.
    Route(T, Vec<String>),
    /// No route: the app's 404.
    NotFound,
    /// A matching path had a param `decodeURIComponent` rejects.
    Error(String),
}

/// Express's Router over `table` (in registration order) for `path`, the
/// request path with the mount point removed (`""` is `/`). Patterns are
/// literal segments and `:name` params, like `/admin/:id/approve`.
pub fn route<T: Copy>(table: &[(Verb, &str, T)], method: &Method, path: &str) -> Routed<T> {
    let path = if path.is_empty() { "/" } else { path };
    for (verb, pattern, tag) in table {
        let Some(raw) = match_pattern(pattern, path) else {
            continue;
        };
        // Params are decoded when the path matches, before the method is checked.
        let mut params = Vec::with_capacity(raw.len());
        for value in raw {
            match decode_uri_component(value) {
                Some(decoded) => params.push(decoded),
                None => return Routed::Error(format!("Failed to decode param '{value}'")),
            }
        }
        if verb.allows(method) {
            return Routed::Route(*tag, params);
        }
    }
    Routed::NotFound
}

/// path-to-regexp 0.1 (`strict: false`, `end: true`, case-insensitive): the raw
/// (still percent-encoded) param values when `path` matches `pattern`.
fn match_pattern<'a>(pattern: &str, path: &'a str) -> Option<Vec<&'a str>> {
    let rest = path.strip_prefix('/')?;
    let rest = rest.strip_suffix('/').unwrap_or(rest);
    let segments: Vec<&str> = rest.split('/').collect();
    let parts: Vec<&str> = pattern.strip_prefix('/')?.split('/').collect();
    if segments.len() != parts.len() {
        return None;
    }
    let mut params = Vec::new();
    for (segment, part) in segments.into_iter().zip(parts) {
        if part.starts_with(':') {
            if segment.is_empty() {
                return None;
            }
            params.push(segment);
        } else if !segment.eq_ignore_ascii_case(part) {
            return None;
        }
    }
    Some(params)
}

/// `decodeURIComponent`; `None` where it throws (a `%` without two hex digits,
/// or escapes that are not UTF-8). Express leaves an empty param as is.
pub fn decode_uri_component(raw: &str) -> Option<String> {
    if !raw.contains('%') {
        return Some(raw.to_owned());
    }
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = |b: Option<&u8>| b.and_then(|b| (*b as char).to_digit(16));
            let (hi, lo) = (hex(bytes.get(i + 1))?, hex(bytes.get(i + 2))?);
            out.push((hi * 16 + lo) as u8);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn now() -> String {
    common::timestamp::format(&chrono::Utc::now())
}

/// The app's catch-all 404 (`app.use('*')` in backend/server.js).
pub fn not_found(uri: &Uri) -> Response {
    let path = uri.path_and_query().map_or("/", |p| p.as_str());
    (
        StatusCode::NOT_FOUND,
        Json(failure_with(
            "Endpoint not found",
            json!({ "path": path, "timestamp": now() }),
        )),
    )
        .into_response()
}

/// The app's error handler: 500, with the error's message outside production.
pub fn error(message: &str) -> Response {
    let error = if crate::cookies::is_production() {
        "Internal server error"
    } else {
        message
    };
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(failure_with(
            "Internal server error",
            json!({ "timestamp": now(), "error": error }),
        )),
    )
        .into_response()
}

/// Message for a body the parsers reject. Outside production Node shows the
/// parser's own text (V8's `JSON.parse` message, which this does not copy).
const BODY_REJECTED: &str = "Request body could not be parsed";

fn media_type(headers: &HeaderMap) -> Option<(String, Option<String>)> {
    let value = headers.get(header::CONTENT_TYPE)?.to_str().ok()?;
    let mut parts = value.split(';');
    let mime = parts.next()?.trim().to_ascii_lowercase();
    let charset = parts.find_map(|p| {
        let (k, v) = p.split_once('=')?;
        k.trim()
            .eq_ignore_ascii_case("charset")
            .then(|| v.trim().trim_matches('"').to_ascii_lowercase())
    });
    Some((mime, charset))
}

/// Express's `req.body` after `express.json()` and
/// `express.urlencoded({ extended: true })`: `{}` without a parsable type,
/// Err(500 response) where either parser fails the request.
pub fn body(headers: &HeaderMap, bytes: &[u8]) -> Result<Value, Box<Response>> {
    const LIMIT: usize = 100 * 1024;
    let fail = |message: &str| Err(Box::new(error(message)));
    let unsupported = |charset: &str| format!("unsupported charset \"{}\"", charset.to_uppercase());
    let Some((mime, charset)) = media_type(headers) else {
        return Ok(json!({}));
    };
    // body-parser's order: charset, then size, then parsing.
    match mime.as_str() {
        "application/json" => {
            if let Some(c) = charset.as_deref().filter(|c| !c.starts_with("utf-")) {
                return fail(&unsupported(c));
            }
            if bytes.len() > LIMIT {
                return fail("request entity too large");
            }
            if bytes.is_empty() {
                return Ok(json!({}));
            }
            if crate::ratelimit::express_json_rejects(headers, bytes) {
                return fail(BODY_REJECTED);
            }
            let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
            Ok(serde_json::from_slice(bytes).unwrap_or_else(|_| json!({})))
        }
        "application/x-www-form-urlencoded" => {
            if let Some(c) = charset.as_deref().filter(|c| *c != "utf-8") {
                return fail(&unsupported(c));
            }
            if bytes.len() > LIMIT {
                return fail("request entity too large");
            }
            let text = String::from_utf8_lossy(bytes);
            let ampersands = text.matches('&').count();
            if ampersands >= 1000 {
                return fail("too many parameters");
            }
            Ok(qs_parse(
                &text,
                QsOptions {
                    array_limit: ampersands.max(100),
                    depth: 32,
                },
            ))
        }
        _ => Ok(json!({})),
    }
}

/// `req.query` (Express 4's "extended" parser: `qs` with arrayLimit 1000).
pub fn query(uri: &Uri) -> Value {
    qs_parse(
        uri.query().unwrap_or(""),
        QsOptions {
            array_limit: 1000,
            depth: 5,
        },
    )
}

#[derive(Debug, Clone, Copy)]
struct QsOptions {
    array_limit: usize,
    depth: usize,
}

/// A `qs` value while parsing: arrays can have holes until [`compact`].
#[derive(Debug, Clone)]
enum Q {
    S(String),
    A(Vec<Option<Q>>),
    O(Vec<(String, Q)>),
}

impl Q {
    fn is_object(&self) -> bool {
        !matches!(self, Q::S(_))
    }

    fn into_value(self) -> Value {
        match self {
            Q::S(s) => Value::String(s),
            Q::A(items) => Value::Array(items.into_iter().flatten().map(Q::into_value).collect()),
            Q::O(entries) => Value::Object(
                entries
                    .into_iter()
                    .map(|(k, v)| (k, v.into_value()))
                    .collect::<Map<_, _>>(),
            ),
        }
    }
}

fn set(entries: &mut Vec<(String, Q)>, key: String, value: Q) {
    match entries.iter_mut().find(|(k, _)| *k == key) {
        Some(slot) => slot.1 = value,
        None => entries.push((key, value)),
    }
}

fn array_to_object(items: Vec<Option<Q>>) -> Vec<(String, Q)> {
    items
        .into_iter()
        .enumerate()
        .filter_map(|(i, v)| v.map(|v| (i.to_string(), v)))
        .collect()
}

/// An array past `arrayLimit` becomes an index-keyed object.
fn limited(items: Vec<Option<Q>>, opts: QsOptions) -> Q {
    if items.len() > opts.array_limit {
        Q::O(array_to_object(items))
    } else {
        Q::A(items)
    }
}

/// `utils.combine(a, b)`: `[].concat(a, b)`.
fn combine(a: Q, b: Q, opts: QsOptions) -> Q {
    let mut items = Vec::new();
    for v in [a, b] {
        match v {
            Q::A(inner) => items.extend(inner),
            other => items.push(Some(other)),
        }
    }
    limited(items, opts)
}

/// `utils.merge` (without the bookkeeping for overflowed arrays).
fn merge(target: Q, source: Q, opts: QsOptions) -> Q {
    match (target, source) {
        // `if (!source) return target`
        (target, Q::S(s)) if s.is_empty() => target,
        (Q::A(mut items), Q::S(s)) => {
            items.push(Some(Q::S(s)));
            limited(items, opts)
        }
        // A pair of conflicting values (strictMerge).
        (target, Q::S(s)) => limited(vec![Some(target), Some(Q::S(s))], opts),
        (Q::S(t), Q::A(items)) => {
            let mut all = vec![Some(Q::S(t))];
            all.extend(items);
            limited(all, opts)
        }
        (Q::S(t), source) => limited(vec![Some(Q::S(t)), Some(source)], opts),
        (Q::A(mut target), Q::A(source)) => {
            for (i, item) in source.into_iter().enumerate() {
                let Some(item) = item else { continue };
                match target.get_mut(i) {
                    Some(Some(existing)) if existing.is_object() && item.is_object() => {
                        let old = std::mem::replace(existing, Q::S(String::new()));
                        *existing = merge(old, item, opts);
                    }
                    Some(Some(_)) => target.push(Some(item)),
                    Some(slot) => *slot = Some(item),
                    None => {
                        target.resize(i, None);
                        target.push(Some(item));
                    }
                }
            }
            limited(target, opts)
        }
        (target, source) => {
            let mut entries = match target {
                Q::A(items) => array_to_object(items),
                Q::O(entries) => entries,
                Q::S(_) => unreachable!("handled above"),
            };
            let source = match source {
                Q::A(items) => array_to_object(items),
                Q::O(entries) => entries,
                Q::S(_) => unreachable!("handled above"),
            };
            for (key, value) in source {
                let merged = match entries.iter().position(|(k, _)| *k == key) {
                    Some(i) => {
                        let old = std::mem::replace(&mut entries[i].1, Q::S(String::new()));
                        merge(old, value, opts)
                    }
                    None => value,
                };
                set(&mut entries, key, merged);
            }
            Q::O(entries)
        }
    }
}

/// `utils.decode`: `+` is a space, then `decodeURIComponent` (or the text as is).
fn qs_decode(s: &str) -> String {
    let s = s.replace('+', " ");
    decode_uri_component(&s).unwrap_or(s)
}

/// `splitKeyIntoSegments`: `a[b][c]` → `a`, `[b]`, `[c]` (balanced brackets;
/// beyond `depth`, the rest is one segment).
fn split_key(key: &str, depth: usize) -> Vec<String> {
    let first = key.find('[');
    let parent = first.map_or(key, |f| &key[..f]);
    let mut segments = Vec::new();
    if !parent.is_empty() {
        segments.push(parent.to_owned());
    }
    let bytes = key.as_bytes();
    let mut open = first;
    let mut collected = 0;
    while let Some(o) = open {
        if collected >= depth {
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
        let Some(c) = close else {
            segments.push(format!("[{}]", &key[o..]));
            return segments;
        };
        segments.push(key[o..=c].to_owned());
        collected += 1;
        open = key[c + 1..].find('[').map(|x| x + c + 1);
    }
    if let Some(o) = open {
        segments.push(format!("[{}]", &key[o..]));
    }
    segments
}

/// `parseObject`: the value for one key's segments.
fn parse_object(chain: &[String], value: Q, opts: QsOptions) -> Q {
    let mut leaf = value;
    for root in chain.iter().rev() {
        leaf = if root == "[]" {
            combine(Q::A(Vec::new()), leaf, opts)
        } else {
            let clean = if root.len() >= 2 && root.starts_with('[') && root.ends_with(']') {
                &root[1..root.len() - 1]
            } else {
                root.as_str()
            };
            // A canonical non-negative integer in brackets is an array index.
            let index = (clean.len() < root.len()
                && !clean.is_empty()
                && clean.bytes().all(|b| b.is_ascii_digit())
                && (clean == "0" || !clean.starts_with('0')))
            .then(|| clean.parse::<usize>().ok())
            .flatten()
            .filter(|i| *i < opts.array_limit);
            match index {
                Some(i) => {
                    let mut items = vec![None; i];
                    items.push(Some(leaf));
                    Q::A(items)
                }
                None if clean == "__proto__" => Q::O(Vec::new()),
                None => Q::O(vec![(clean.to_owned(), leaf)]),
            }
        };
    }
    leaf
}

/// `qs.parse(str, { allowPrototypes: true, ... })` as an object.
fn qs_parse(input: &str, opts: QsOptions) -> Value {
    if input.is_empty() {
        return json!({});
    }
    let clean = replace_ci(&replace_ci(input, "%5B", "["), "%5D", "]");
    let mut values: Vec<(String, Q)> = Vec::new();
    for part in clean.split('&').take(1000) {
        let pos = match part.find("]=") {
            Some(i) => Some(i + 1),
            None => part.find('='),
        };
        let (key, value) = match pos {
            None => (qs_decode(part), Q::S(String::new())),
            Some(p) => (qs_decode(&part[..p]), Q::S(qs_decode(&part[p + 1..]))),
        };
        match values.iter().position(|(k, _)| *k == key) {
            Some(i) => {
                let old = std::mem::replace(&mut values[i].1, Q::S(String::new()));
                values[i].1 = combine(old, value, opts);
            }
            None => values.push((key, value)),
        }
    }
    let mut out = Q::O(Vec::new());
    for (key, value) in values {
        if key.is_empty() {
            continue;
        }
        let parsed = parse_object(&split_key(&key, opts.depth), value, opts);
        out = merge(out, parsed, opts);
    }
    out.into_value()
}

fn replace_ci(s: &str, from: &str, to: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.to_ascii_lowercase().find(&from.to_ascii_lowercase()) {
        out.push_str(&rest[..i]);
        out.push_str(to);
        rest = &rest[i + from.len()..];
    }
    out.push_str(rest);
    out
}

/// JavaScript's whitespace and line terminators (`String.prototype.trim`).
pub fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\u{9}'..='\u{d}'
            | ' '
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

/// `String.prototype.trim`.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_space)
}

/// `parseInt(String(value), 10)` as a JS number (`NaN` when no digits; huge
/// values stay numbers, as in JS).
pub fn parse_int(value: &Value) -> f64 {
    let s = crate::body::js_string(value);
    let t = s.trim_start_matches(is_js_space);
    let (negative, rest) = match t.as_bytes().first() {
        Some(b'-') => (true, &t[1..]),
        Some(b'+') => (false, &t[1..]),
        _ => (false, t),
    };
    let end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    match rest[..end].parse::<f64>() {
        Ok(n) if negative => -n,
        Ok(n) => n,
        Err(_) => f64::NAN,
    }
}

/// A JSON column as mysql2 hands it over: `JSON.parse` of the server's text, so
/// whole doubles (`1.0`) are plain integers.
pub fn js_json(value: Value) -> Value {
    match value {
        Value::Number(n) => match n.as_f64() {
            Some(f) if n.is_f64() => common::json::js_number(f),
            _ => Value::Number(n),
        },
        Value::Array(items) => Value::Array(items.into_iter().map(js_json).collect()),
        Value::Object(map) => {
            Value::Object(map.into_iter().map(|(k, v)| (k, js_json(v))).collect())
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Clone, Copy, PartialEq)]
    enum R {
        List,
        Create,
        Update,
        Helpful,
        Approve,
    }

    const TABLE: &[(Verb, &str, R)] = &[
        (Verb::Get, "/product/:productId", R::List),
        (Verb::Post, "/create", R::Create),
        (Verb::Put, "/:id", R::Update),
        (Verb::Post, "/:id/helpful", R::Helpful),
        (Verb::Put, "/admin/:id/approve", R::Approve),
    ];

    fn routed(method: Method, path: &str) -> Option<(R, Vec<String>)> {
        match route(TABLE, &method, path) {
            Routed::Route(r, p) => Some((r, p)),
            Routed::NotFound => None,
            Routed::Error(e) => panic!("{e}"),
        }
    }

    #[test]
    fn routes_like_the_express_router() {
        let s = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            routed(Method::GET, "/product/P1"),
            Some((R::List, s(&["P1"])))
        );
        assert_eq!(
            routed(Method::HEAD, "/product/P1/"),
            Some((R::List, s(&["P1"])))
        );
        assert_eq!(
            routed(Method::GET, "/PRODUCT/a%20b"),
            Some((R::List, s(&["a b"])))
        );
        assert_eq!(routed(Method::GET, "/product/"), None);
        assert_eq!(routed(Method::GET, "/product//"), None);
        assert_eq!(routed(Method::POST, "/create"), Some((R::Create, vec![])));
        assert_eq!(routed(Method::POST, "/Create/"), Some((R::Create, vec![])));
        assert_eq!(
            routed(Method::PUT, "/create"),
            Some((R::Update, s(&["create"])))
        );
        assert_eq!(
            routed(Method::POST, "/product/helpful"),
            Some((R::Helpful, s(&["product"])))
        );
        assert_eq!(
            routed(Method::PUT, "/admin/X/approve"),
            Some((R::Approve, s(&["X"])))
        );
        assert_eq!(routed(Method::DELETE, "/x"), None);
        assert_eq!(routed(Method::GET, ""), None);
        assert_eq!(routed(Method::PUT, "//x"), None);
        assert_eq!(
            routed(Method::PUT, "/a%2Fb"),
            Some((R::Update, s(&["a/b"])))
        );
        // A bad escape in any matching path is an error, whatever the method.
        assert!(matches!(
            route(TABLE, &Method::GET, "/%ZZ"),
            Routed::Error(e) if e == "Failed to decode param '%ZZ'"
        ));
        assert!(matches!(
            route(TABLE, &Method::GET, "/product/%E0%A4%A"),
            Routed::Error(_)
        ));
    }

    /// Outputs of qs 6.16.2 `parse(str, { allowPrototypes: true, arrayLimit: 1000 })`
    /// (Express 4's query parser), recorded with node.
    #[test]
    fn query_strings_parse_like_qs() {
        let cases: &[(&str, Value)] = &[
            ("", json!({})),
            ("page=2", json!({"page": "2"})),
            ("page=2&page=3", json!({"page": ["2", "3"]})),
            ("page[]=2", json!({"page": ["2"]})),
            ("page[0]=5", json!({"page": ["5"]})),
            ("page[1]=5&page[0]=4", json!({"page": ["4", "5"]})),
            ("page[a]=1", json!({"page": {"a": "1"}})),
            ("page[]=1&page=2", json!({"page": ["1", "2"]})),
            ("page=1&page[]=2", json!({"page": ["1", "2"]})),
            ("[page]=3", json!({"page": "3"})),
            ("page[][a]=1", json!({"page": [{"a": "1"}]})),
            ("page=%5B1%5D", json!({"page": "[1]"})),
            ("page%5B%5D=7", json!({"page": ["7"]})),
            ("page[=1", json!({"page": {"[": "1"}})),
            ("page]=1", json!({"page]": "1"})),
            ("page+x=1", json!({"page x": "1"})),
            ("page=a+b", json!({"page": "a b"})),
            ("page=%E0%A4%A", json!({"page": "%E0%A4%A"})),
            ("page", json!({"page": ""})),
            ("page=&page=", json!({"page": ["", ""]})),
            ("a=1&&b=2", json!({"a": "1", "b": "2"})),
            ("=x", json!({})),
            ("page[1001]=5", json!({"page": {"1001": "5"}})),
            ("page[999]=5", json!({"page": ["5"]})),
            ("page[b]=1&page=x", json!({"page": [{"b": "1"}, "x"]})),
            ("page=x&page[b]=1", json!({"page": ["x", {"b": "1"}]})),
            ("status=a,b", json!({"status": "a,b"})),
            ("page[0][0]=1", json!({"page": [["1"]]})),
            ("page[0]=1&page[0]=2", json!({"page": [["1", "2"]]})),
            ("status[]=", json!({"status": [""]})),
            ("page[]=1&page[]=2&page=3", json!({"page": ["1", "2", "3"]})),
            ("page[]=1&page=2&page[]=3", json!({"page": ["1", "3", "2"]})),
            (
                "a[b][c][d][e][f][g]=1",
                json!({"a": {"b": {"c": {"d": {"e": {"f": {"[g]": "1"}}}}}}}),
            ),
            (
                "page[b]=1&page=x&page=y",
                json!({"page": {"0": "x", "1": "y", "b": "1"}}),
            ),
            (
                "page=x&page=y&page[b]=1",
                json!({"page": {"0": "x", "1": "y", "b": "1"}}),
            ),
            ("page=%ZZ", json!({"page": "%ZZ"})),
            ("page%=1", json!({"page%": "1"})),
            ("a=1=2", json!({"a": "1=2"})),
            ("a[]=1=2", json!({"a": ["1=2"]})),
            ("a[b]=c]=d", json!({"a": {"b": "c]=d"}})),
            ("page[ ]=1", json!({"page": {" ": "1"}})),
            ("page[01]=1", json!({"page": {"01": "1"}})),
            ("page[-1]=1", json!({"page": {"-1": "1"}})),
            ("page[1]=a&page[]=b", json!({"page": ["b", "a"]})),
            ("page[]=a&page[1]=b", json!({"page": ["a", "b"]})),
            ("page=1&page[0]=2", json!({"page": ["1", "2"]})),
            ("x=1&page=2", json!({"x": "1", "page": "2"})),
            ("page[]", json!({"page": [""]})),
            ("page[a]", json!({"page": {"a": ""}})),
            ("page=1;page=2", json!({"page": "1;page=2"})),
            ("%70age=1", json!({"page": "1"})),
            ("PAGE=1", json!({"PAGE": "1"})),
            ("page[0]=a&page[2]=c", json!({"page": ["a", "c"]})),
            ("a.b=1", json!({"a.b": "1"})),
            ("__proto__=1", json!({})),
            ("toString=1", json!({"toString": "1"})),
            ("hasOwnProperty[x]=1", json!({"hasOwnProperty": {"x": "1"}})),
            ("page[__proto__]=1", json!({"page": {}})),
            (
                "page=a&page[]=b&page[c]=d",
                json!({"page": {"0": "a", "1": "b", "c": "d"}}),
            ),
            ("page[[]]=1", json!({"page": {"[]": "1"}})),
            ("page[a[b]]=1", json!({"page": {"a[b]": "1"}})),
        ];
        let opts = QsOptions {
            array_limit: 1000,
            depth: 5,
        };
        for (input, expected) in cases {
            assert_eq!(&qs_parse(input, opts), expected, "qs.parse({input:?})");
        }
        let uri: Uri = "/x?page=2&page=3".parse().unwrap();
        assert_eq!(query(&uri), json!({"page": ["2", "3"]}));
        assert_eq!(query(&"/x".parse().unwrap()), json!({}));
    }

    #[test]
    fn parse_int_and_trim_follow_javascript() {
        assert_eq!(parse_int(&json!("12abc")), 12.0);
        assert_eq!(parse_int(&json!(" \u{feff}-7")), -7.0);
        assert_eq!(parse_int(&json!("99999999999999999999")), 1e20);
        assert_eq!(parse_int(&json!(4.9)), 4.0);
        assert_eq!(parse_int(&json!(1e21)), 1.0, "String(1e21) is 1e+21");
        assert_eq!(parse_int(&json!(["3", "4"])), 3.0);
        assert!(parse_int(&json!({})).is_nan());
        assert!(parse_int(&json!(null)).is_nan());
        assert!(parse_int(&json!("0x1A")) == 0.0);
        assert_eq!(js_trim("\u{feff} a \u{2028}"), "a");
        assert_eq!(js_trim("\u{85}a"), "\u{85}a", "NEL is not JS whitespace");
    }

    #[test]
    fn json_columns_read_like_mysql2() {
        assert_eq!(
            serde_json::to_string(&js_json(json!({"a": 1.0, "b": [2.5, 3.0]}))).unwrap(),
            r#"{"a":1,"b":[2.5,3]}"#
        );
    }

    #[test]
    fn bodies_parse_like_express() {
        let mut h = HeaderMap::new();
        h.insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
        assert_eq!(body(&h, br#"{"a":1}"#).unwrap(), json!({"a": 1}));
        assert_eq!(body(&h, b"").unwrap(), json!({}));
        assert!(body(&h, b"{bad").is_err());
        assert!(body(&h, b"1").is_err());
        h.insert(
            header::CONTENT_TYPE,
            "application/x-www-form-urlencoded".parse().unwrap(),
        );
        assert_eq!(
            body(&h, b"rating=5&items[0][orderItemId]=OI1").unwrap(),
            json!({"rating": "5", "items": [{"orderItemId": "OI1"}]})
        );
        h.insert(header::CONTENT_TYPE, "text/plain".parse().unwrap());
        assert_eq!(body(&h, b"a=1").unwrap(), json!({}));
        assert_eq!(body(&HeaderMap::new(), b"{}").unwrap(), json!({}));
    }
}
