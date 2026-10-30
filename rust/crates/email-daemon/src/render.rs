//! Turning a queued row (plus its optional template) into the subject and bodies
//! that get sent. Pure functions — no I/O — so the rules are unit-tested here.
//!
//! # Template language
//!
//! * `{{ key }}` — the variable's value. Unknown keys are left untouched.
//! * `{{# key }} … {{/ key }}` — a section. When `key` is an array the block is
//!   rendered once per element (an object element's fields are in scope, a
//!   scalar element is `{{.}}`); any other truthy value renders the block once;
//!   a missing or falsy value (`null`, `false`, `""`, `0`, `[]`) renders nothing.
//!   Inside a section, keys the element doesn't have resolve in the outer scope.
//!
//! # Escaping
//!
//! Variables are data, and much of it is user input (names, addresses), so
//! **every value substituted into the HTML body is HTML-escaped**, inside
//! sections too. The subject and the text body are not HTML, so they get the
//! raw value. There is deliberately no "raw" placeholder: markup belongs in the
//! template, never in the variables. Producers must therefore pass raw values,
//! never pre-escaped ones (those would show up as `&amp;amp;`). Template authors
//! must quote attributes (`href="{{link}}"`) for the escaping to hold there.

use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Value};

/// `{{ key }}`, `{{# key }}` (open a section) and `{{/ key }}` (close it).
/// Whitespace inside the braces is allowed.
static TAG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{\s*([#/]?)\s*([^{}\s#/][^{}\s]*)\s*\}\}").expect("valid regex")
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rendered {
    pub subject: String,
    pub html: String,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Escape {
    None,
    Html,
}

/// Expand `template` with raw (unescaped) values — for the subject and the text
/// body. Expansion is single-pass: a value containing `{{other}}` is never
/// expanded again.
pub fn interpolate(template: &str, data: &Map<String, Value>) -> String {
    expand(template, data, Escape::None)
}

/// Expand `template` with every value HTML-escaped — for the HTML body.
pub fn interpolate_html(template: &str, data: &Map<String, Value>) -> String {
    expand(template, data, Escape::Html)
}

fn expand(template: &str, data: &Map<String, Value>, escape: Escape) -> String {
    let root = Value::Object(data.clone());
    let mut scopes = vec![&root];
    let mut out = String::with_capacity(template.len());
    expand_into(&mut out, template, &mut scopes, escape);
    out
}

fn expand_into(out: &mut String, template: &str, scopes: &mut Vec<&Value>, escape: Escape) {
    let mut pos = 0;
    while let Some(caps) = TAG.captures_at(template, pos) {
        let tag = caps.get(0).expect("whole match");
        out.push_str(&template[pos..tag.start()]);
        pos = tag.end();
        let key = &caps[2];
        match &caps[1] {
            "" => match lookup(scopes, key) {
                Some(value) => push_value(out, value, escape),
                None => out.push_str(tag.as_str()),
            },
            "#" => match section_end(template, pos, key) {
                Some((body_end, after)) => {
                    if let Some(value) = lookup(scopes, key) {
                        expand_section(out, &template[pos..body_end], value, scopes, escape);
                    }
                    pos = after;
                }
                // Unclosed: not a section, keep the text as written.
                None => out.push_str(tag.as_str()),
            },
            // A close with no open.
            _ => out.push_str(tag.as_str()),
        }
    }
    out.push_str(&template[pos..]);
}

fn expand_section<'v>(
    out: &mut String,
    body: &str,
    value: &'v Value,
    scopes: &mut Vec<&'v Value>,
    escape: Escape,
) {
    let items: &'v [Value] = match value {
        Value::Array(items) => items,
        other if truthy(other) => std::slice::from_ref(other),
        _ => &[],
    };
    for item in items {
        scopes.push(item);
        expand_into(out, body, scopes, escape);
        scopes.pop();
    }
}

/// `(start of the matching close tag, end of it)`, honouring nested sections of
/// the same name.
fn section_end(template: &str, from: usize, key: &str) -> Option<(usize, usize)> {
    let mut depth = 0usize;
    for caps in TAG.captures_iter(&template[from..]) {
        if &caps[2] != key {
            continue;
        }
        let tag = caps.get(0).expect("whole match");
        match &caps[1] {
            "#" => depth += 1,
            "/" if depth == 0 => return Some((from + tag.start(), from + tag.end())),
            "/" => depth -= 1,
            _ => {}
        }
    }
    None
}

/// Innermost scope first. `.` is the current section element (only inside one).
fn lookup<'v>(scopes: &[&'v Value], key: &str) -> Option<&'v Value> {
    if key == "." {
        return scopes.get(1..).and_then(<[_]>::last).copied();
    }
    scopes
        .iter()
        .rev()
        .find_map(|scope| scope.as_object().and_then(|m| m.get(key)))
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => false,
        Value::String(s) => !s.is_empty(),
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0),
        Value::Array(items) => !items.is_empty(),
        _ => true,
    }
}

fn push_value(out: &mut String, value: &Value, escape: Escape) {
    let text = value_to_string(value);
    match escape {
        Escape::None => out.push_str(&text),
        Escape::Html => out.push_str(&escape_html(&text)),
    }
}

/// Escape text for an HTML element body or a quoted attribute value.
pub fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            c => out.push(c),
        }
    }
    out
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
/// * `data` — the row's `template_data` variables: escaped in the HTML body,
///   raw in the subject and the text body.
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
        html: interpolate_html(html, data),
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
        assert_eq!(
            interpolate_html("{{name}} {{missing}}", &data),
            "Alice {{missing}}"
        );
    }

    #[test]
    fn does_not_expand_placeholders_inside_values() {
        let data = vars(json!({ "a": "{{b}}", "b": "boom", "c": "{{#b}}x{{/b}}" }));
        assert_eq!(interpolate("{{a}} {{c}}", &data), "{{b}} {{#b}}x{{/b}}");
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

    // --- escaping -----------------------------------------------------------

    const NASTY: &str = r#"<script>alert("x")</script> Tom & Jerry's"#;

    #[test]
    fn html_body_escapes_every_variable() {
        let data = vars(json!({ "name": NASTY }));
        let out = render(
            "Hi {{name}}",
            &json!({ "html_content": "<p>{{name}}</p>", "text_content": "Hi {{name}}" }),
            None,
            &data,
        );
        assert_eq!(
            out.html,
            "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; Tom &amp; Jerry&#39;s</p>"
        );
        // Subject and text body are not HTML: the customer sees what they typed.
        assert_eq!(out.subject, format!("Hi {NASTY}"));
        assert_eq!(out.text, format!("Hi {NASTY}"));
    }

    #[test]
    fn values_are_escaped_exactly_once() {
        // Someone literally named "A&amp;B" keeps their name; nothing is decoded
        // or skipped, and nothing is escaped twice.
        let data = vars(json!({ "a": "A&B", "b": "A&amp;B" }));
        assert_eq!(
            interpolate_html("{{a}}|{{b}}", &data),
            "A&amp;B|A&amp;amp;B"
        );
        assert_eq!(interpolate("{{a}}|{{b}}", &data), "A&B|A&amp;B");
    }

    #[test]
    fn escaping_holds_in_quoted_attributes() {
        let data = vars(
            json!({ "link": "x\" onmouseover=\"alert(1)", "q": "https://s.example/r?a=1&b=2" }),
        );
        assert_eq!(
            interpolate_html(r#"<a href="{{link}}">{{q}}</a><a href="{{q}}">"#, &data),
            r#"<a href="x&quot; onmouseover=&quot;alert(1)">https://s.example/r?a=1&amp;b=2</a><a href="https://s.example/r?a=1&amp;b=2">"#
        );
    }

    #[test]
    fn non_string_values_are_escaped_too() {
        let data = vars(json!({ "o": { "k": "<b>" } }));
        assert_eq!(
            interpolate_html("{{o}}", &data),
            "{&quot;k&quot;:&quot;&lt;b&gt;&quot;}"
        );
    }

    // --- sections -----------------------------------------------------------

    #[test]
    fn sections_repeat_for_each_item_and_escape_its_fields() {
        let data = vars(json!({
            "currency": "$",
            "items": [
                { "name": "Silk <Pillowcase>", "quantity": 2, "line_total": "79.98" },
                { "name": "Duvet & Sham", "quantity": 1, "line_total": "120.00" }
            ]
        }));
        let tpl = "<ul>{{#items}}<li>{{name}} × {{quantity}} {{currency}}{{line_total}}</li>{{/items}}</ul>";
        assert_eq!(
            interpolate_html(tpl, &data),
            "<ul><li>Silk &lt;Pillowcase&gt; × 2 $79.98</li><li>Duvet &amp; Sham × 1 $120.00</li></ul>"
        );
        assert_eq!(
            interpolate("{{#items}}- {{name}}\n{{/items}}", &data),
            "- Silk <Pillowcase>\n- Duvet & Sham\n"
        );
    }

    #[test]
    fn sections_over_scalars_use_dot() {
        let data = vars(json!({ "lines": ["Ada <L>", "1 Silk Way"] }));
        assert_eq!(
            interpolate_html("{{#lines}}{{.}}<br>{{/lines}}", &data),
            "Ada &lt;L&gt;<br>1 Silk Way<br>"
        );
        assert_eq!(
            interpolate("{{.}}", &data),
            "{{.}}",
            "no element outside a section"
        );
    }

    #[test]
    fn sections_are_conditionals_for_non_arrays() {
        let tpl = "a{{#d}}[-{{amount}}]{{/d}}b";
        for falsy in [json!(null), json!(false), json!(""), json!(0), json!([])] {
            let data = vars(json!({ "d": falsy, "amount": "5.00" }));
            assert_eq!(interpolate_html(tpl, &data), "ab", "{falsy}");
        }
        assert_eq!(interpolate_html(tpl, &Map::new()), "ab", "missing is falsy");
        let data = vars(json!({ "d": true, "amount": "5.00" }));
        assert_eq!(interpolate_html(tpl, &data), "a[-5.00]b");
    }

    #[test]
    fn nested_and_malformed_sections() {
        let data = vars(json!({ "a": [{ "a": [1, 2] }] }));
        assert_eq!(
            interpolate("{{#a}}({{#a}}{{.}}{{/a}}){{/a}}", &data),
            "(12)"
        );
        // An unclosed open or a stray close is kept as written.
        let data = vars(json!({ "x": "1" }));
        assert_eq!(interpolate("{{#x}}{{x}}", &data), "{{#x}}1");
        assert_eq!(interpolate("{{x}}{{/x}}", &data), "1{{/x}}");
    }
}
