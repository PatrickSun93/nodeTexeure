//! JSON values the way the Node API produces them.

use serde_json::{Number, Value};

/// A number as `JSON.stringify` writes it: whole values without a trailing
/// `.0` (`80`, not `80.0`); non-finite becomes `null`.
pub fn js_number(f: f64) -> Value {
    if f.is_finite() && f.fract() == 0.0 && f.abs() < 9_007_199_254_740_992.0 {
        Value::Number((f as i64).into())
    } else {
        Number::from_f64(f).map_or(Value::Null, Value::Number)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn whole_numbers_drop_the_fraction() {
        assert_eq!(js_number(80.0), json!(80));
        assert_eq!(js_number(79.99), json!(79.99));
        assert_eq!(js_number(69.99 + 10.0), json!(69.99 + 10.0));
        assert_eq!(js_number(f64::NAN), Value::Null);
    }
}
