//! `GET /api/settings/public` — public storefront settings, typed (port of
//! the public half of backend/routes/systemSettingsRoutes.js; `/all` is admin
//! and stays on Node until auth is ported).

use axum::Json;
use axum::extract::State;
use common::response::success;
use serde_json::{Map, Number, Value};

use crate::AppState;
use crate::error::ApiError;
use crate::params::js_parse_int;

/// Convert a stored setting the way the Node route does: booleans from
/// `'true'`/`'1'`, `parseInt` / `parseFloat` (NaN → null), JSON parsed when
/// valid (else left as the string), strings as-is.
pub fn typed_value(setting_type: &str, raw: Option<&str>) -> Value {
    match setting_type {
        "boolean" => Value::Bool(matches!(raw, Some("true" | "1"))),
        "integer" => raw
            .and_then(js_parse_int)
            .map_or(Value::Null, |n| Value::Number(n.into())),
        "decimal" => raw.and_then(js_parse_float).map_or(Value::Null, js_number),
        "json" => match raw {
            None => Value::Null,
            Some(s) => serde_json::from_str(s).unwrap_or_else(|_| Value::String(s.to_owned())),
        },
        _ => raw.map_or(Value::Null, |s| Value::String(s.to_owned())),
    }
}

/// JavaScript `parseFloat`: the longest leading decimal number, or `None` (NaN).
fn js_parse_float(s: &str) -> Option<f64> {
    let s = s.trim_start();
    let mut end = 0;
    let (mut seen_digit, mut seen_dot, mut seen_exp) = (false, false, false);
    for (i, c) in s.char_indices() {
        match c {
            '+' | '-' if i == 0 || s[..i].ends_with(['e', 'E']) => {}
            '0'..='9' => seen_digit = true,
            '.' if !seen_dot && !seen_exp => seen_dot = true,
            'e' | 'E' if seen_digit && !seen_exp => seen_exp = true,
            _ => break,
        }
        if c.is_ascii_digit() {
            end = i + 1;
        }
    }
    s[..end].parse::<f64>().ok().filter(|f| f.is_finite())
}

/// A number serialized like JSON.stringify: whole values without a `.0`.
fn js_number(f: f64) -> Value {
    if f.fract() == 0.0 && f.abs() < 9_007_199_254_740_992.0 {
        Value::Number((f as i64).into())
    } else {
        Number::from_f64(f).map_or(Value::Null, Value::Number)
    }
}

pub async fn public(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let rows = sqlx::query!(
        "SELECT setting_key, setting_value, setting_type FROM system_settings
         WHERE is_public = 1 ORDER BY setting_key"
    )
    .fetch_all(&state.pool)
    .await?;
    let settings: Map<String, Value> = rows
        .into_iter()
        .map(|r| {
            let value = typed_value(&r.setting_type, r.setting_value.as_deref());
            (r.setting_key, value)
        })
        .collect();
    Ok(Json(success(
        "Public system settings retrieved successfully",
        settings,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn values_are_typed_like_the_node_route() {
        assert_eq!(typed_value("boolean", Some("true")), json!(true));
        assert_eq!(typed_value("boolean", Some("1")), json!(true));
        assert_eq!(typed_value("boolean", Some("yes")), json!(false));
        assert_eq!(typed_value("boolean", None), json!(false));
        assert_eq!(typed_value("integer", Some("3600s")), json!(3600));
        assert_eq!(typed_value("integer", Some("x")), Value::Null);
        assert_eq!(typed_value("decimal", Some("8.25")), json!(8.25));
        assert_eq!(
            typed_value("decimal", Some("10.0")),
            json!(10),
            "JSON.stringify(10.0) is 10"
        );
        assert_eq!(typed_value("decimal", Some("1e3abc")), json!(1000));
        assert_eq!(typed_value("decimal", Some(".5")), json!(0.5));
        assert_eq!(typed_value("json", Some(r#"["a"]"#)), json!(["a"]));
        assert_eq!(typed_value("json", Some("{bad")), json!("{bad"));
        assert_eq!(typed_value("string", Some("USD")), json!("USD"));
        assert_eq!(typed_value("string", None), Value::Null);
    }
}
