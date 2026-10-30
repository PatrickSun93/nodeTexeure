//! Request bodies the way Express (`express.json()`) hands them to a route.

use axum::body::Bytes;
use axum::http::{HeaderMap, header};
use serde_json::{Value, json};

/// Express `req.body`: parsed JSON when the request is JSON, else `{}`.
pub fn json(headers: &HeaderMap, body: &Bytes) -> Value {
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.contains("json"));
    if is_json {
        serde_json::from_slice(body).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    }
}

/// `String(value)` in JavaScript, for values that came from JSON.
pub fn js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => common::json::js_number(n.as_f64().unwrap_or(f64::NAN)).to_string(),
        // Array.prototype.toString: elements joined by commas, null → "".
        Value::Array(items) => items
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_string(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

/// `Number(value)` in JavaScript, for values that came from JSON (NaN for
/// anything that isn't numeric).
pub fn js_to_number(value: &Value) -> f64 {
    match value {
        Value::Null => 0.0,
        Value::Bool(b) => f64::from(u8::from(*b)),
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => string_to_number(s),
        Value::Array(items) if items.is_empty() => 0.0,
        Value::Array(items) if items.len() == 1 => string_to_number(&js_string(value)),
        Value::Array(_) | Value::Object(_) => f64::NAN,
    }
}

/// `Number(string)`: trimmed; empty is 0; decimal, exponent, `Infinity` and
/// `0x`/`0o`/`0b` integers; anything else NaN.
fn string_to_number(s: &str) -> f64 {
    let t = s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    if t.is_empty() {
        return 0.0;
    }
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0o", 8),
        ("0O", 8),
        ("0b", 2),
        ("0B", 2),
    ] {
        if let Some(digits) = t.strip_prefix(prefix) {
            return u64::from_str_radix(digits, radix).map_or(f64::NAN, |n| n as f64);
        }
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    // Rust accepts "inf"/"nan"/"infinity" spellings that JavaScript doesn't.
    if t.chars()
        .any(|c| c.is_ascii_alphabetic() && c != 'e' && c != 'E')
    {
        return f64::NAN;
    }
    t.parse().unwrap_or(f64::NAN)
}

/// JavaScript truthiness of a JSON value.
pub fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(_) => true,
    }
}

/// `Number.parseInt(value, 10)` for a JSON value; `None` is NaN.
pub fn parse_int(value: &Value) -> Option<i64> {
    crate::params::js_parse_int(&js_string(value))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_int_matches_javascript() {
        assert_eq!(parse_int(&json!(3)), Some(3));
        assert_eq!(parse_int(&json!(2.9)), Some(2));
        assert_eq!(parse_int(&json!("7 items")), Some(7));
        assert_eq!(parse_int(&json!([4, 5])), Some(4));
        assert_eq!(parse_int(&json!("abc")), None);
        assert_eq!(parse_int(&json!(true)), None);
        assert_eq!(parse_int(&json!({ "a": 1 })), None);
        assert_eq!(parse_int(&json!(null)), None);
    }

    #[test]
    fn to_number_matches_javascript() {
        assert_eq!(js_to_number(&json!("12.5")), 12.5);
        assert_eq!(js_to_number(&json!(" 7 ")), 7.0);
        assert_eq!(js_to_number(&json!("")), 0.0);
        assert_eq!(js_to_number(&json!("0x10")), 16.0);
        assert_eq!(js_to_number(&json!("1e3")), 1000.0);
        assert_eq!(js_to_number(&json!(true)), 1.0);
        assert_eq!(js_to_number(&json!([])), 0.0);
        assert_eq!(js_to_number(&json!(["4"])), 4.0);
        assert!(js_to_number(&json!("abc")).is_nan());
        assert!(js_to_number(&json!("inf")).is_nan());
        assert!(js_to_number(&json!([1, 2])).is_nan());
        assert!(js_to_number(&json!({})).is_nan());
        assert_eq!(js_to_number(&json!("-Infinity")), f64::NEG_INFINITY);
    }

    #[test]
    fn truthiness() {
        assert!(truthy(Some(&json!("a"))));
        assert!(truthy(Some(&json!([]))));
        assert!(!truthy(Some(&json!(""))));
        assert!(!truthy(Some(&json!(0))));
        assert!(!truthy(None));
    }
}
