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
}
