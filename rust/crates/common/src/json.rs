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

/// `String(f)` / `JSON.stringify(f)` text for a finite number, JavaScript's
/// Number::toString: shortest round-trip digits, plain notation for
/// 1e-7 < |f| < 1e21, otherwise `1.5e+21` / `1e-7`. `NaN` and the infinities
/// give `"NaN"`, `"Infinity"`, `"-Infinity"` (JSON.stringify writes `null`).
pub fn js_number_string(f: f64) -> String {
    if f.is_nan() {
        return "NaN".into();
    }
    if f.is_infinite() {
        return if f > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    if f == 0.0 {
        return "0".into();
    }
    let sign = if f < 0.0 { "-" } else { "" };
    // `{:e}` is the shortest round-trip digits in scientific form: d.ddde±x.
    let sci = format!("{:e}", f.abs());
    let (mantissa, exp) = sci.split_once('e').expect("scientific notation");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exp.parse::<i32>().expect("exponent") + 1; // decimal point position
    let body = if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let e = n - 1;
        let e = if e >= 0 {
            format!("+{e}")
        } else {
            e.to_string()
        };
        match digits.split_at(1) {
            (d, "") => format!("{d}e{e}"),
            (d, rest) => format!("{d}.{rest}e{e}"),
        }
    };
    format!("{sign}{body}")
}

/// `Number.prototype.toFixed(digits)` (0–20 digits): the exact binary value
/// rounded half away from zero (Rust's `{:.N}` rounds ties to even), and
/// `String(x)` from 1e21 on.
pub fn js_to_fixed(x: f64, digits: usize) -> String {
    if !x.is_finite() {
        return js_number_string(x);
    }
    if x.abs() >= 1e21 {
        return js_number_string(x);
    }
    let rounded = format!("{:.*}", digits, x.abs());
    // A tie is an exact decimal expansion ending in 5 right after `digits`.
    let exact = format!("{:.1100}", x.abs());
    let (_, frac) = exact.split_once('.').expect("fraction");
    let tail = &frac[digits..];
    let is_tie = tail.starts_with('5') && tail[1..].bytes().all(|b| b == b'0');
    let magnitude = if is_tie {
        // Round the truncated value up by one unit in the last place.
        let truncated = format!("{}.{}", exact.split_once('.').unwrap().0, &frac[..digits]);
        let mut chars: Vec<u8> = truncated.trim_end_matches('.').bytes().collect();
        let mut i = chars.len();
        loop {
            if i == 0 {
                chars.insert(0, b'1');
                break;
            }
            i -= 1;
            match chars[i] {
                b'.' => continue,
                b'9' => chars[i] = b'0',
                d => {
                    chars[i] = d + 1;
                    break;
                }
            }
        }
        String::from_utf8(chars).expect("ascii")
    } else {
        rounded
    };
    // `If x < 0, let s be "-"`: (-0.001).toFixed(2) is "-0.00", (-0).toFixed(2) "0.00".
    if x < 0.0 {
        format!("-{magnitude}")
    } else {
        magnitude
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn number_strings_match_javascript() {
        for (f, s) in [
            (0.0, "0"),
            (-0.0, "0"),
            (1.0, "1"),
            (-12.5, "-12.5"),
            (0.1, "0.1"),
            (0.000001, "0.000001"),
            (0.0000001, "1e-7"),
            (1730000000000.0, "1730000000000"),
            (1e21, "1e+21"),
            (1.5e21, "1.5e+21"),
            (123456789012345680000.0, "123456789012345680000"),
            (2.5e-8, "2.5e-8"),
            (f64::MAX, "1.7976931348623157e+308"),
            (5e-324, "5e-324"),
        ] {
            assert_eq!(js_number_string(f), s, "{f:e}");
        }
        assert_eq!(js_number_string(f64::NAN), "NaN");
    }

    #[test]
    fn to_fixed_rounds_ties_up_like_javascript() {
        assert_eq!(js_to_fixed(0.125, 2), "0.13", "exact tie");
        assert_eq!(
            js_to_fixed(1.005, 2),
            "1.00",
            "1.005 is below the tie in binary"
        );
        assert_eq!(js_to_fixed(2.5, 0), "3");
        assert_eq!(js_to_fixed(9.995, 2), "9.99");
        assert_eq!(js_to_fixed(99.995, 2), "100.00");
        assert_eq!(js_to_fixed(0.375, 2), "0.38");
        assert_eq!(js_to_fixed(-0.125, 2), "-0.13");
        assert_eq!(js_to_fixed(123.4, 2), "123.40");
        assert_eq!(js_to_fixed(0.0, 2), "0.00");
        assert_eq!(js_to_fixed(1e21, 2), "1e+21");
        assert_eq!(js_to_fixed(-0.001, 2), "-0.00");
        assert_eq!(js_to_fixed(-0.0, 2), "0.00");
        assert_eq!(js_to_fixed(0.5, 0), "1");
        assert_eq!(js_to_fixed(1.45, 1), "1.4");
        assert_eq!(js_to_fixed(8.345, 2), "8.35");
        assert_eq!(js_to_fixed(1234.5678, 2), "1234.57");
    }

    #[test]
    fn whole_numbers_drop_the_fraction() {
        assert_eq!(js_number(80.0), json!(80));
        assert_eq!(js_number(79.99), json!(79.99));
        assert_eq!(js_number(69.99 + 10.0), json!(69.99 + 10.0));
        assert_eq!(js_number(f64::NAN), Value::Null);
    }
}
