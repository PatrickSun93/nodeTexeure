//! Turning a queued row (plus its optional template) into the subject and bodies
//! that get sent. Pure functions — no I/O — so the rules are unit-tested here.

use std::sync::LazyLock;

use regex::{Captures, Regex};
use serde_json::{Map, Value};

/// `{{ key }}` placeholders. Whitespace inside the braces is allowed.
static PLACEHOLDER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{\s*([^{}\s]+)\s*\}\}").expect("valid regex"));

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rendered {
    pub subject: String,
    pub html: String,
    pub text: String,
}

/// Replace every `{{ key }}` whose key is present in `data`. Unknown placeholders
/// are left untouched. Substitution is single-pass, so a value containing
/// `{{other}}` is never expanded again.
pub fn interpolate(template: &str, data: &Map<String, Value>) -> String {
    PLACEHOLDER
        .replace_all(template, |caps: &Captures<'_>| match data.get(&caps[1]) {
            Some(value) => value_to_string(value),
            None => caps[0].to_string(),
        })
        .into_owned()
}

/// How a template variable is written into the email: strings as-is, `null` as
/// empty, numbers/booleans in their JSON form, anything else as compact JSON.
pub fn value_to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Read a string field from a JSON object, treating missing/non-string as empty.
fn field<'a>(content: &'a Value, key: &str) -> &'a str {
    content.get(key).and_then(Value::as_str).unwrap_or("")
}

/// Build the outgoing email.
///
/// * `content` — the row's `email_content` (`html_content`, `text_content`).
/// * `template` — the linked template's `template_content`, if the row has one.
///   Its bodies win over the row's stored copy, so template edits apply to mail
///   that is still queued.
/// * `data` — the row's `template_data` variables.
pub fn render(
    subject: &str,
    content: &Value,
    template: Option<&Value>,
    data: &Map<String, Value>,
) -> Rendered {
    let mut html = field(content, "html_content");
    let mut text = field(content, "text_content");
    if let Some(tpl) = template {
        let (tpl_html, tpl_text) = (field(tpl, "html_content"), field(tpl, "text_content"));
        if !tpl_html.is_empty() {
            html = tpl_html;
        }
        if !tpl_text.is_empty() {
            text = tpl_text;
        }
    }
    Rendered {
        subject: interpolate(subject, data),
        html: interpolate(html, data),
        text: interpolate(text, data),
    }
}

/// Parse `template_data` into a variable map; anything that isn't a JSON object
/// (NULL, malformed) means "no variables".
pub fn variables(template_data: Option<&Value>) -> Map<String, Value> {
    match template_data {
        Some(Value::Object(map)) => map.clone(),
        // Some writers stored the JSON as a string inside the JSON column.
        Some(Value::String(s)) => match serde_json::from_str(s) {
            Ok(Value::Object(map)) => map,
            _ => Map::new(),
        },
        _ => Map::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn vars(v: Value) -> Map<String, Value> {
        v.as_object().cloned().unwrap()
    }

    #[test]
    fn interpolates_known_keys_with_optional_spaces() {
        let data = vars(json!({ "name": "Alice", "order": "NT-1" }));
        assert_eq!(
            interpolate("Hi {{name}}, order {{ order }}", &data),
            "Hi Alice, order NT-1"
        );
    }

    #[test]
    fn leaves_unknown_placeholders() {
        let data = vars(json!({ "name": "Alice" }));
        assert_eq!(
            interpolate("{{name}} {{missing}}", &data),
            "Alice {{missing}}"
        );
    }

    #[test]
    fn does_not_expand_placeholders_inside_values() {
        let data = vars(json!({ "a": "{{b}}", "b": "boom" }));
        assert_eq!(interpolate("{{a}}", &data), "{{b}}");
    }

    #[test]
    fn renders_value_types() {
        let data = vars(json!({ "n": 3, "f": 9.5, "t": true, "z": null, "o": { "k": 1 } }));
        assert_eq!(
            interpolate("{{n}} {{f}} {{t}} [{{z}}] {{o}}", &data),
            r#"3 9.5 true [] {"k":1}"#
        );
    }

    #[test]
    fn regex_metacharacters_in_keys_are_literal() {
        let data = vars(json!({ "a.b": "x" }));
        assert_eq!(interpolate("{{a.b}} {{aXb}}", &data), "x {{aXb}}");
    }

    #[test]
    fn template_bodies_override_stored_copy() {
        let content = json!({ "html_content": "<p>old {{x}}</p>", "text_content": "old" });
        let tpl = json!({ "html_content": "<p>new {{x}}</p>" });
        let out = render("S {{x}}", &content, Some(&tpl), &vars(json!({ "x": "1" })));
        assert_eq!(out.subject, "S 1");
        assert_eq!(out.html, "<p>new 1</p>");
        assert_eq!(out.text, "old", "empty template text keeps the stored text");
    }

    #[test]
    fn missing_content_fields_are_empty() {
        let out = render("S", &json!({}), None, &Map::new());
        assert_eq!(
            out,
            Rendered {
                subject: "S".into(),
                html: String::new(),
                text: String::new()
            }
        );
    }

    #[test]
    fn variables_accepts_objects_and_stringified_json() {
        assert_eq!(variables(Some(&json!({ "a": 1 })))["a"], 1);
        assert_eq!(variables(Some(&json!("{\"a\":2}")))["a"], 2);
        assert!(variables(Some(&json!("not json"))).is_empty());
        assert!(variables(Some(&json!([1, 2]))).is_empty());
        assert!(variables(None).is_empty());
    }
}
