//! Request-parameter parsing that matches the Express routes exactly, so the
//! Rust and Node implementations answer the same URL the same way.

use axum::http::HeaderMap;

/// Locales with translated product copy (`product_translations`).
pub const SUPPORTED_LOCALES: [&str; 4] = ["en", "zh", "fr", "es"];

/// Raw query string pairs, in order (keeps repeated keys like `materials[]`).
pub type Pairs = Vec<(String, String)>;

/// First non-empty value for `key` — Express's `if (req.query.x)` truthiness.
pub fn first<'a>(pairs: &'a Pairs, key: &str) -> Option<&'a str> {
    pairs
        .iter()
        .find(|(k, v)| k == key && !v.is_empty())
        .map(|(_, v)| v.as_str())
}

/// JavaScript `parseInt(s, 10)`: optional leading whitespace and sign, then the
/// longest run of digits; `None` where JS gives `NaN`.
pub fn js_parse_int(s: &str) -> Option<i64> {
    let s = s.trim_start();
    let (sign, digits) = match s.as_bytes().first() {
        Some(b'-') => (-1, &s[1..]),
        Some(b'+') => (1, &s[1..]),
        _ => (1, s),
    };
    let end = digits
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(digits.len());
    digits[..end].parse::<i64>().ok().map(|n| sign * n)
}

/// `Math.max(1, Math.min(parseInt(v) || default, max))` — note `0` and `NaN`
/// both fall back to the default, as `||` does in JS.
pub fn clamp_int(value: Option<&str>, default: i64, max: i64) -> i64 {
    let n = value
        .and_then(js_parse_int)
        .filter(|n| *n != 0)
        .unwrap_or(default);
    n.min(max).max(1)
}

/// Custom product ids look like `PROD0000000001`.
pub fn is_product_id(s: &str) -> bool {
    s.len() == 14 && s.starts_with("PROD") && s[4..].bytes().all(|b| b.is_ascii_digit())
}

/// `?locale=` first, then the storefront's `NEXT_LOCALE` cookie; unknown → `en`.
pub fn locale(pairs: &Pairs, headers: &HeaderMap) -> &'static str {
    let requested = first(pairs, "locale")
        .map(str::to_owned)
        .or_else(|| cookie(headers, "NEXT_LOCALE"));
    requested
        .and_then(|l| SUPPORTED_LOCALES.iter().copied().find(|s| *s == l))
        .unwrap_or("en")
}

fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(axum::http::header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|kv| kv.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v.to_owned())
}

/// Material filter, as Express/qs parses it: `materials[]=a&materials[]=b` (or a
/// repeated `materials=`) is an array taken as-is; a single `materials=a,b` is
/// split on commas and trimmed. Falls back to `material` the same way.
pub fn materials(pairs: &Pairs) -> Vec<String> {
    for key in ["materials", "material"] {
        let array_key = format!("{key}[]");
        let values: Vec<&String> = pairs
            .iter()
            .filter(|(k, _)| *k == key || *k == array_key)
            .map(|(_, v)| v)
            .collect();
        let is_array = values.len() > 1 || pairs.iter().any(|(k, _)| *k == array_key);
        match values.as_slice() {
            [] => continue,
            _ if is_array => return values.into_iter().cloned().collect(),
            [single] => {
                return single
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
                    .collect();
            }
            _ => unreachable!("more than one value is an array"),
        }
    }
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs(q: &[(&str, &str)]) -> Pairs {
        q.iter().map(|(k, v)| ((*k).into(), (*v).into())).collect()
    }

    #[test]
    fn parse_int_matches_javascript() {
        assert_eq!(js_parse_int("12"), Some(12));
        assert_eq!(js_parse_int("  12abc"), Some(12));
        assert_eq!(js_parse_int("-3"), Some(-3));
        assert_eq!(js_parse_int("abc"), None);
        assert_eq!(js_parse_int(""), None);
        assert_eq!(js_parse_int("1.9"), Some(1));
    }

    #[test]
    fn clamp_mirrors_the_express_pagination() {
        assert_eq!(clamp_int(None, 10, 100), 10);
        assert_eq!(clamp_int(Some("0"), 10, 100), 10, "0 is falsy in JS");
        assert_eq!(clamp_int(Some("-5"), 10, 100), 1);
        assert_eq!(clamp_int(Some("1000"), 10, 100), 100);
        assert_eq!(clamp_int(Some("nope"), 1, i64::MAX), 1);
    }

    #[test]
    fn locale_prefers_query_then_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert("cookie", "a=1; NEXT_LOCALE=fr".parse().unwrap());
        assert_eq!(locale(&pairs(&[]), &headers), "fr");
        assert_eq!(locale(&pairs(&[("locale", "zh")]), &headers), "zh");
        assert_eq!(locale(&pairs(&[("locale", "xx")]), &HeaderMap::new()), "en");
        assert_eq!(
            locale(&pairs(&[("locale", "")]), &headers),
            "fr",
            "empty is falsy"
        );
    }

    #[test]
    fn product_ids_are_prefixed_and_ten_digits() {
        assert!(is_product_id("PROD0000000001"));
        assert!(!is_product_id("PROD000000001"));
        assert!(!is_product_id("prod0000000001"));
        assert!(!is_product_id("PROD000000000x"));
        assert!(!is_product_id("1"));
    }

    #[test]
    fn materials_parse_like_qs() {
        assert_eq!(
            materials(&pairs(&[("materials", "Silk, Cashmere ,")])),
            ["Silk", "Cashmere"]
        );
        assert_eq!(
            materials(&pairs(&[("materials[]", "A, B")])),
            ["A, B"],
            "array items are not split"
        );
        assert_eq!(
            materials(&pairs(&[("materials", "a"), ("materials", "b")])),
            ["a", "b"]
        );
        assert_eq!(materials(&pairs(&[("material", "Silk")])), ["Silk"]);
        assert!(materials(&pairs(&[])).is_empty());
    }
}
