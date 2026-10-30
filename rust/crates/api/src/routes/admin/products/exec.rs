//! `DatabaseUtil.executeQuery(sql, params)` (backend/utils/database.js) for the
//! admin catalogue routes (products, coupons, inventory), whose statements bind
//! request values as they arrive: a JSON body field can be a string, a number,
//! a boolean, `null`, an object or missing.
//!
//! * A parameter is a JavaScript value, `None` being `undefined`. mysql2
//!   refuses `undefined` before the statement reaches the server
//!   ([`UNDEFINED_BIND`]), and `executeQuery` turns that, like every other
//!   failure, into `{ success: false, error: err.message }`: `Err(message)`
//!   here, with MySQL's own text for a server error.
//! * Values bind the way mysql2's `execute` encodes them: numbers as DOUBLE,
//!   booleans as TINY, `null` as NULL, strings as text, arrays and objects as
//!   their `JSON.stringify` text (mysql2 tags those as JSON; the text is the
//!   same).
//! * Rows come back as mysql2 builds them ([`crate::mysql_json`]).
//!
//! The SQL is dynamic, as Node's is (column lists built from the request,
//! `SELECT *`, optional filters), so it is not checked at compile time.

use serde_json::{Map, Value};
use sqlx::MySqlPool;
use sqlx::mysql::{MySql, MySqlArguments};
use sqlx::query::Query;

use crate::mysql_json::{self, Js, JsRow, Schema};

/// mysql2's error for an `undefined` bind parameter.
pub const UNDEFINED_BIND: &str =
    "Bind parameters must not contain undefined. To pass SQL NULL specify JS null";

/// A bind parameter: the JavaScript value, `None` for `undefined`.
pub type Param = Option<Value>;

fn bind<'q>(
    query: Query<'q, MySql, MySqlArguments>,
    value: &Value,
) -> Query<'q, MySql, MySqlArguments> {
    match value {
        Value::Array(_) | Value::Object(_) => query.bind(stringify(value)),
        other => mysql_json::bind(query, other),
    }
}

fn prepare<'q>(sql: &'q str, params: &[Param]) -> Result<Query<'q, MySql, MySqlArguments>, String> {
    let mut query = sqlx::query(sql);
    for p in params {
        match p {
            Some(v) => query = bind(query, v),
            None => return Err(UNDEFINED_BIND.into()),
        }
    }
    Ok(query)
}

/// A read: `result.data` as mysql2 rows.
pub async fn rows(pool: &MySqlPool, sql: &str, params: &[Param]) -> Result<Vec<JsRow>, String> {
    let query = prepare(sql, params)?;
    let schema = Schema::cached(pool)
        .await
        .map_err(|e| mysql_json::error_message(&e))?;
    let rows = query
        .fetch_all(pool)
        .await
        .map_err(|e| mysql_json::error_message(&e))?;
    schema
        .rows(&rows)
        .map_err(|e| mysql_json::error_message(&e))
}

/// A write: `result.affectedRows` (mysql2 connects with FOUND_ROWS, as sqlx
/// does, so it counts matched rows).
pub async fn write(pool: &MySqlPool, sql: &str, params: &[Param]) -> Result<u64, String> {
    let query = prepare(sql, params)?;
    query
        .execute(pool)
        .await
        .map(|done| done.rows_affected())
        .map_err(|e| mysql_json::error_message(&e))
}

/// `SELECT get_next_id(<prefix>) AS id`: `Ok(None)` for a NULL id.
pub async fn next_id(pool: &MySqlPool, prefix: &str) -> Result<Option<String>, String> {
    sqlx::query_scalar!(r#"SELECT get_next_id(?) AS "id: String""#, prefix)
        .fetch_one(pool)
        .await
        .map_err(|e| mysql_json::error_message(&e))
}

/// `JSON.stringify(value)` for a JSON value (numbers as JavaScript writes
/// them: `1`, not `1.0`). Object keys come out in the parsed body's order,
/// which serde_json keeps sorted.
pub fn stringify(value: &Value) -> String {
    let mut out = String::new();
    write_json(value, &mut out);
    out
}

fn write_json(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(f64::NAN);
            if f.is_finite() {
                out.push_str(&common::json::js_number_string(f));
            } else {
                out.push_str("null");
            }
        }
        Value::String(s) => out.push_str(&serde_json::to_string(s).unwrap_or_default()),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_json(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            out.push('{');
            for (i, (k, v)) in map.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(k).unwrap_or_default());
                out.push(':');
                write_json(v, out);
            }
            out.push('}');
        }
    }
}

/// `obj.key` for a value of the request: `None` is `undefined` (a missing
/// key, or any non-object, whose named properties are all undefined here).
pub fn prop(value: Option<&Value>, key: &str) -> Param {
    value
        .and_then(Value::as_object)
        .and_then(|m| m.get(key))
        .cloned()
}

/// `value || fallback`.
pub fn or(value: Param, fallback: Value) -> Value {
    match value {
        Some(v) if crate::body::truthy(Some(&v)) => v,
        _ => fallback,
    }
}

/// `value || null`.
pub fn or_null(value: Param) -> Value {
    or(value, Value::Null)
}

/// `Number(value)` (`undefined` is NaN).
pub fn number(value: Option<&Value>) -> f64 {
    value.map_or(f64::NAN, crate::body::js_to_number)
}

/// `Number(value)` of a row value.
pub fn js_number(value: Option<&Js>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Js::Null) => 0.0,
        Some(Js::Number(n)) => *n,
        Some(Js::String(s)) => crate::body::js_to_number(&Value::String(s.clone())),
        Some(Js::Date(Some(d))) => d.and_utc().timestamp_millis() as f64,
        Some(Js::Date(None)) => f64::NAN,
        Some(Js::Buffer(b)) => {
            crate::body::js_to_number(&Value::String(String::from_utf8_lossy(b).into_owned()))
        }
        Some(Js::Json(v)) => crate::body::js_to_number(v),
    }
}

/// A row value in `res.json` (`undefined` → `null`, which only matters for
/// columns the query always selects).
pub fn js_json(value: Option<&Js>) -> Value {
    value.map_or(Value::Null, Js::to_json)
}

/// `a || b` over row values.
pub fn js_or(a: Option<&Js>, b: Value) -> Value {
    match a {
        Some(v) if v.truthy() => v.to_json(),
        _ => b,
    }
}

/// `for (const [key, value] of Object.entries(obj))`: an array's entries are
/// its indices, never a column name; anything else has none.
pub fn entries(value: &Value) -> Vec<(String, Value)> {
    match value {
        Value::Object(map) => map.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        Value::Array(items) => items
            .iter()
            .enumerate()
            .map(|(i, v)| (i.to_string(), v.clone()))
            .collect(),
        _ => Vec::new(),
    }
}

/// `{ ...value }` for a parsed JSON value.
pub fn spread(value: &Value) -> Map<String, Value> {
    match value {
        Value::Object(map) => map.clone(),
        Value::Array(_) => entries(value).into_iter().collect(),
        Value::String(s) => s
            .chars()
            .enumerate()
            .map(|(i, c)| (i.to_string(), Value::String(c.to_string())))
            .collect(),
        _ => Map::new(),
    }
}

/// A 500 `Server error`, the routes' catch-all (`console.error(error)` first).
pub fn server_error(context: &str, error: &str) -> axum::response::Response {
    tracing::error!(error, "{context}");
    crate::admin::json(
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        common::response::failure("Server error"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn stringify_like_javascript() {
        assert_eq!(
            stringify(&json!({ "a": 1.0, "b": [1.5, null, "x\n"], "c": {} })),
            r#"{"a":1,"b":[1.5,null,"x\n"],"c":{}}"#
        );
        assert_eq!(stringify(&json!(1e21)), "1e+21");
        assert_eq!(stringify(&json!("q\"")), r#""q\"""#);
    }

    #[test]
    fn js_operators() {
        assert_eq!(or_null(Some(json!(""))), Value::Null);
        assert_eq!(or_null(Some(json!(0))), Value::Null);
        assert_eq!(or_null(Some(json!("a"))), json!("a"));
        assert_eq!(or(None, json!(0)), json!(0));
        assert_eq!(prop(Some(&json!({ "a": 1 })), "a"), Some(json!(1)));
        assert_eq!(prop(Some(&json!([1])), "a"), None);
        assert_eq!(prop(Some(&json!(5)), "a"), None);
        assert!(number(None).is_nan());
        assert_eq!(number(Some(&json!(null))), 0.0);
        assert_eq!(js_number(Some(&Js::String("12.50".into()))), 12.5);
        assert_eq!(js_number(Some(&Js::Null)), 0.0);
        assert_eq!(
            spread(&json!([7, 8])),
            json!({ "0": 7, "1": 8 }).as_object().unwrap().clone()
        );
        assert_eq!(spread(&json!(3)), Map::new());
    }
}
