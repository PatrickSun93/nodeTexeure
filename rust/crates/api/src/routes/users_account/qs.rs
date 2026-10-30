//! The `qs.parse` that Express runs on query strings (`req.query`) and that
//! `express.urlencoded({ extended: true })` runs on form bodies — enough of it
//! that a value arrives as the same type (string, array or object) with the
//! same contents: `a=1&a=2` and `a[]=1` are arrays, `a[b]=1` an object, keys
//! nest up to `depth` levels, `+` is a space, `%5B`/`%5D` are brackets, a bad
//! `%` escape is kept as is, and an array index at or past `array_limit`
//! makes an object. qs's bookkeeping for pathological mixes (overflow and
//! conflict markers) is not reproduced: such inputs still come out with the
//! right top-level type, which is all the routes look at.

use serde_json::{Map, Value};

#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub depth: usize,
    pub array_limit: usize,
    pub parameter_limit: usize,
    /// body-parser's `strictDepth: true`: nesting past `depth` is an error.
    pub strict_depth: bool,
}

/// Express 4's query parser: `qs.parse(str, { allowPrototypes: true })`.
pub const QUERY: Options = Options {
    depth: 5,
    array_limit: 20,
    parameter_limit: 1000,
    strict_depth: false,
};

/// Nesting deeper than `depth` with `strict_depth`.
#[derive(Debug, PartialEq, Eq)]
pub struct DepthExceeded;

#[derive(Debug, Clone, PartialEq)]
enum Node {
    Str(String),
    /// Sparse until [`Node::into_value`] compacts it.
    Arr(Vec<Option<Node>>),
    Obj(Vec<(String, Node)>),
}

impl Node {
    fn is_container(&self) -> bool {
        !matches!(self, Node::Str(_))
    }

    fn into_value(self) -> Value {
        match self {
            Node::Str(s) => Value::String(s),
            Node::Arr(items) => {
                Value::Array(items.into_iter().flatten().map(Node::into_value).collect())
            }
            Node::Obj(entries) => {
                let mut map = Map::new();
                for (k, v) in entries {
                    map.insert(k, v.into_value());
                }
                Value::Object(map)
            }
        }
    }

    /// An array's present items as `(index, item)` object entries.
    fn into_entries(self) -> Vec<(String, Node)> {
        match self {
            Node::Arr(items) => items
                .into_iter()
                .enumerate()
                .filter_map(|(i, v)| v.map(|v| (i.to_string(), v)))
                .collect(),
            Node::Obj(entries) => entries,
            Node::Str(_) => Vec::new(),
        }
    }
}

/// `decodeURIComponent`, `None` where it throws (a `%` without two hex digits,
/// or escapes that are not UTF-8).
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

/// qs's decoder: `+` is a space, then `decodeURIComponent`, or the text as is.
fn decode(s: &str) -> String {
    let plus = s.replace('+', " ");
    decode_uri_component(&plus).unwrap_or(plus)
}

/// `String.prototype.replace(/%5B/gi, '[').replace(/%5D/gi, ']')`.
fn brackets(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        match tail.get(1..3) {
            Some(code) if code.eq_ignore_ascii_case("5B") => {
                out.push('[');
                rest = &tail[3..];
            }
            Some(code) if code.eq_ignore_ascii_case("5D") => {
                out.push(']');
                rest = &tail[3..];
            }
            _ => {
                out.push('%');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// `utils.combine(a, b)`: `[].concat(a, b)`, an object past the array limit.
fn combine(a: Node, b: Node, opts: &Options) -> Node {
    let mut items = Vec::new();
    for n in [a, b] {
        match n {
            Node::Arr(xs) => items.extend(xs),
            other => items.push(Some(other)),
        }
    }
    if items.len() > opts.array_limit {
        return Node::Obj(Node::Arr(items).into_entries());
    }
    Node::Arr(items)
}

/// `splitKeyIntoSegments`: `a[b][c]` → `a`, `[b]`, `[c]`.
fn segments(key: &str, opts: &Options) -> Result<Vec<String>, DepthExceeded> {
    if opts.depth == 0 {
        return Ok(vec![key.to_owned()]);
    }
    let mut out = Vec::new();
    let first = key.find('[');
    let parent = first.map_or(key, |f| &key[..f]);
    if !parent.is_empty() {
        out.push(parent.to_owned());
    }
    let bytes = key.as_bytes();
    let mut open = first;
    let mut collected = 0;
    while let Some(o) = open {
        if collected >= opts.depth {
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
            out.push(format!("[{}]", &key[o..]));
            return Ok(out);
        };
        out.push(key[o..=c].to_owned());
        collected += 1;
        open = key[c + 1..].find('[').map(|i| i + c + 1);
    }
    if let Some(o) = open {
        if opts.strict_depth {
            return Err(DepthExceeded);
        }
        out.push(format!("[{}]", &key[o..]));
    }
    Ok(out)
}

/// `parseObject`: the value for one key chain, innermost first.
fn chain_value(chain: &[String], leaf: Node, opts: &Options) -> Node {
    let mut leaf = leaf;
    for root in chain.iter().rev() {
        leaf = if root == "[]" {
            combine(Node::Arr(Vec::new()), leaf, opts)
        } else {
            let clean = if root.len() >= 2 && root.starts_with('[') && root.ends_with(']') {
                &root[1..root.len() - 1]
            } else {
                root.as_str()
            };
            let index = (root.as_str() != clean)
                .then(|| clean.parse::<usize>().ok())
                .flatten()
                .filter(|i| i.to_string() == clean);
            match index {
                Some(i) if i < opts.array_limit => {
                    let mut items = vec![None; i + 1];
                    items[i] = Some(leaf);
                    Node::Arr(items)
                }
                Some(i) => Node::Obj(vec![(i.to_string(), leaf)]),
                None if clean == "__proto__" => Node::Obj(Vec::new()),
                None => Node::Obj(vec![(clean.to_owned(), leaf)]),
            }
        };
    }
    leaf
}

/// `utils.merge(target, source)`.
fn merge(target: Node, source: Node, opts: &Options) -> Node {
    match (target, source) {
        (Node::Arr(mut items), Node::Str(s)) => {
            items.push(Some(Node::Str(s)));
            Node::Arr(items)
        }
        (target, Node::Str(s)) => Node::Arr(vec![Some(target), Some(Node::Str(s))]),
        (Node::Str(t), source) => combine(Node::Str(t), source, opts),
        (Node::Arr(mut items), Node::Arr(source)) => {
            for (i, item) in source.into_iter().enumerate() {
                let Some(item) = item else { continue };
                match items.get_mut(i) {
                    Some(slot @ Some(_)) => {
                        let existing = slot.take().expect("present");
                        if existing.is_container() && item.is_container() {
                            *slot = Some(merge(existing, item, opts));
                        } else {
                            *slot = Some(existing);
                            items.push(Some(item));
                        }
                    }
                    Some(slot) => *slot = Some(item),
                    None => {
                        items.resize(i, None);
                        items.push(Some(item));
                    }
                }
            }
            Node::Arr(items)
        }
        (target, source) => {
            let mut entries = target.into_entries();
            for (k, v) in source.into_entries() {
                match entries.iter_mut().find(|(e, _)| *e == k) {
                    Some((_, existing)) => {
                        let old = std::mem::replace(existing, Node::Obj(Vec::new()));
                        *existing = merge(old, v, opts);
                    }
                    None => entries.push((k, v)),
                }
            }
            Node::Obj(entries)
        }
    }
}

/// `qs.parse(s, opts)`.
pub fn parse(s: &str, opts: &Options) -> Result<Map<String, Value>, DepthExceeded> {
    let mut values: Vec<(String, Node)> = Vec::new();
    if !s.is_empty() {
        let clean = brackets(s);
        for part in clean.split('&').take(opts.parameter_limit) {
            let pos = part.find("]=").map(|i| i + 1).or_else(|| part.find('='));
            let (key, val) = match pos {
                None => (decode(part), String::new()),
                Some(p) => (decode(&part[..p]), decode(&part[p + 1..])),
            };
            match values.iter_mut().find(|(k, _)| *k == key) {
                Some((_, existing)) => {
                    let old = std::mem::replace(existing, Node::Arr(Vec::new()));
                    *existing = combine(old, Node::Str(val), opts);
                }
                None => values.push((key, Node::Str(val))),
            }
        }
    }
    let mut result = Node::Obj(Vec::new());
    for (key, val) in values {
        if key.is_empty() {
            continue;
        }
        let chain = segments(&key, opts)?;
        let node = chain_value(&chain, val, opts);
        result = merge(result, node, opts);
    }
    match result.into_value() {
        Value::Object(map) => Ok(map),
        _ => Ok(Map::new()),
    }
}

/// The options body-parser gives qs for a form body: depth 32 (strict),
/// `arrayLimit: Math.max(100, paramCount)`, 1000 parameters. `None` when the
/// body has more than 1000 parameters (body-parser's 413).
pub fn body_options(body: &str) -> Option<Options> {
    let count = body.matches('&').count() + 1;
    (count <= 1000).then_some(Options {
        depth: 32,
        array_limit: count.max(100),
        parameter_limit: 1000,
        strict_depth: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn q(s: &str) -> Value {
        Value::Object(parse(s, &QUERY).unwrap())
    }

    /// Expected values are what qs 6.16 (the backend's) returns.
    #[test]
    fn matches_qs() {
        assert_eq!(q("limit=5&limit=6"), json!({ "limit": ["5", "6"] }));
        assert_eq!(q("limit[]=5"), json!({ "limit": ["5"] }));
        assert_eq!(q("limit[a]=5"), json!({ "limit": { "a": "5" } }));
        assert_eq!(q("limit[0]=5"), json!({ "limit": ["5"] }));
        assert_eq!(q("limit[21]=5"), json!({ "limit": { "21": "5" } }));
        assert_eq!(
            q("limit=5&limit[a]=6"),
            json!({ "limit": ["5", { "a": "6" }] })
        );
        assert_eq!(
            q("limit[a]=6&limit=5"),
            json!({ "limit": [{ "a": "6" }, "5"] })
        );
        assert_eq!(q("limit[1]=7&limit[0]=8"), json!({ "limit": ["8", "7"] }));
        assert_eq!(q("a[b][c]=1"), json!({ "a": { "b": { "c": "1" } } }));
        assert_eq!(q("limit%5B%5D=3"), json!({ "limit": ["3"] }));
        assert_eq!(q("limit"), json!({ "limit": "" }));
        assert_eq!(q("limit=%E0"), json!({ "limit": "%E0" }));
        assert_eq!(q("a=1+2"), json!({ "a": "1 2" }));
        assert_eq!(q("__proto__=1&limit[__proto__]=2"), json!({ "limit": {} }));
        assert_eq!(
            q("a=1&a=2&a[x]=3"),
            json!({ "a": { "0": "1", "1": "2", "x": "3" } })
        );
        assert_eq!(q("a[x]=1&a[]=2"), json!({ "a": { "0": "2", "x": "1" } }));
        assert_eq!(q("a[]=1&a[x]=2"), json!({ "a": { "0": "1", "x": "2" } }));
        assert_eq!(
            q("a[0][b]=1&a[0][c]=2"),
            json!({ "a": [{ "b": "1", "c": "2" }] })
        );
        assert_eq!(q("a[1]=1&a[3]=2"), json!({ "a": ["1", "2"] }));
        assert_eq!(q("a[]=1&a[]=2&a=3"), json!({ "a": ["1", "2", "3"] }));
        assert_eq!(q("a=1&a[]=2"), json!({ "a": ["1", "2"] }));
        assert_eq!(q("a[0]=1&a[x]=2"), json!({ "a": { "0": "1", "x": "2" } }));
        assert_eq!(q("a[=1"), json!({ "a": { "[": "1" } }));
        assert_eq!(q("a]=1"), json!({ "a]": "1" }));
        assert_eq!(q("[a]=1"), json!({ "a": "1" }));
        assert_eq!(q("a[b]c=1"), json!({ "a": { "b": "1" } }));
        assert_eq!(q("a[b=c]=1"), json!({ "a": { "b=c": "1" } }));
        assert_eq!(q("=x"), json!({}));
        assert_eq!(q("a==b"), json!({ "a": "=b" }));
        assert_eq!(
            q("a[b][c][d][e][f][g]=1"),
            json!({ "a": { "b": { "c": { "d": { "e": { "f": { "[g]": "1" } } } } } } })
        );
        assert_eq!(q(""), json!({}));
        assert_eq!(q("&&a=1&"), json!({ "a": "1" }));
    }

    #[test]
    fn body_options_follow_body_parser() {
        assert_eq!(body_options("a=1&b=2").unwrap().array_limit, 100);
        assert!(body_options(&"a=1&".repeat(1000)).is_none());
        let deep = "a[b][c][d][e][f][g][h][i][j][k][l][m][n][o][p][q][r][s][t][u][v][w][x][y][z][a][b][c][d][e][f][g][h]=1";
        assert_eq!(
            parse(deep, &body_options(deep).unwrap()),
            Err(DepthExceeded)
        );
    }

    #[test]
    fn decode_uri_component_throws_like_javascript() {
        assert_eq!(decode_uri_component("a%20b").as_deref(), Some("a b"));
        assert_eq!(decode_uri_component("%E4%B8%9D").as_deref(), Some("丝"));
        assert_eq!(decode_uri_component("%E0"), None);
        assert_eq!(decode_uri_component("%zz"), None);
        assert_eq!(decode_uri_component("%"), None);
        assert_eq!(decode_uri_component("%ED%A0%80"), None, "a lone surrogate");
    }
}
