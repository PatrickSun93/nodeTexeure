//! A port of `qs.parse` (qs 6.16, the version Express 4.22 and body-parser
//! 1.20 use) for `req.query` and `express.urlencoded({ extended: true })`
//! bodies, so `?email[]=a`, `?email=a&email=b` or `token[x]=1` reach a route as
//! the same array/object Node sees.
//!
//! Covered: `%5B`/`%5D` folding, `]=` key splitting, `+`/percent decoding (raw
//! text when the escape is invalid), duplicate keys combined into arrays,
//! bracket segments up to `depth` (the remainder kept as one segment, or an
//! error with `strict_depth`), array indexes below `array_limit`, the overflow
//! objects past it, `merge` with qs's `strictMerge` conflict arrays, and
//! `compact`. Not covered: options Express does not use (comma, allowDots,
//! charset sentinels, `throwOnLimitExceeded`).

use serde_json::{Map, Value};

/// The `qs.parse` options Express passes.
#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub array_limit: usize,
    pub depth: usize,
    pub strict_depth: bool,
    pub parameter_limit: usize,
}

/// Express 4's `query parser` ("extended"): `{ allowPrototypes: true,
/// arrayLimit: 1000 }` on top of qs's defaults.
pub const QUERY: Options = Options {
    array_limit: 1000,
    depth: 5,
    strict_depth: false,
    parameter_limit: 1000,
};

/// body-parser's extended urlencoded parser for a body with `param_count`
/// `&`-separated parts.
pub fn urlencoded(param_count: usize) -> Options {
    Options {
        array_limit: param_count.max(100),
        depth: 32,
        strict_depth: true,
        parameter_limit: 1000,
    }
}

/// `strictDepth` was exceeded (qs throws a RangeError).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DepthExceeded;

#[derive(Debug, Clone, PartialEq)]
enum Q {
    Str(String),
    Arr(Arr),
    Obj(Obj),
}

/// A JS array; `None` is a hole. `conflict` is qs's strictMerge marker.
#[derive(Debug, Clone, Default, PartialEq)]
struct Arr {
    items: Vec<Option<Q>>,
    conflict: Option<i64>,
}

/// A JS object (insertion order; String() never depends on it). `overflow`
/// and `conflict` are qs's side-channel markers with their max index.
#[derive(Debug, Clone, Default, PartialEq)]
struct Obj {
    entries: Vec<(String, Q)>,
    overflow: Option<i64>,
    conflict: Option<i64>,
}

impl Obj {
    fn get_mut(&mut self, key: &str) -> Option<&mut Q> {
        self.entries
            .iter_mut()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v)
    }

    fn set(&mut self, key: String, value: Q) {
        match self.get_mut(&key) {
            Some(slot) => *slot = value,
            None => self.entries.push((key, value)),
        }
    }
}

impl Q {
    fn is_object(&self) -> bool {
        !matches!(self, Q::Str(_))
    }

    fn overflow(&self) -> Option<i64> {
        match self {
            Q::Obj(o) => o.overflow,
            _ => None,
        }
    }
}

/// `String(parseInt(key, 10)) === key`: the key's integer when it is written
/// canonically.
fn canonical_int(key: &str) -> Option<i64> {
    let digits = key.strip_prefix('-').unwrap_or(key);
    if digits.is_empty()
        || !digits.bytes().all(|b| b.is_ascii_digit())
        || (digits.len() > 1 && digits.starts_with('0'))
        || key == "-0"
    {
        return None;
    }
    // Beyond 2^53 the index is not exact; treat it as a plain key.
    let n: i64 = key
        .parse()
        .ok()
        .filter(|n: &i64| n.unsigned_abs() < 1 << 53)?;
    Some(n)
}

/// `utils.decode`: `+` is a space, then `decodeURIComponent`, or the text as
/// it was when that throws.
fn decode(s: &str) -> String {
    crate::cookies::decode(&s.replace('+', " "))
}

/// `arrayToObject`: the array's present items under their index.
fn array_to_object(items: Vec<Option<Q>>) -> Obj {
    Obj {
        entries: items
            .into_iter()
            .enumerate()
            .filter_map(|(i, v)| v.map(|v| (i.to_string(), v)))
            .collect(),
        ..Obj::default()
    }
}

fn overflowed(items: Vec<Option<Q>>, max: i64) -> Q {
    let mut obj = array_to_object(items);
    obj.overflow = Some(max);
    Q::Obj(obj)
}

/// `[].concat(value)`: an array's slots (holes kept), else the value itself.
fn spread(value: Q) -> Vec<Option<Q>> {
    match value {
        Q::Arr(a) => a.items,
        other => vec![Some(other)],
    }
}

/// `utils.combine(a, b, arrayLimit)`.
fn combine(a: Q, b: Q, limit: usize) -> Q {
    if let Q::Obj(mut obj) = a {
        if let Some(mut max) = obj.overflow {
            for item in spread(b) {
                max += 1;
                if let Some(item) = item {
                    obj.set(max.to_string(), item);
                }
            }
            obj.overflow = Some(max);
            return Q::Obj(obj);
        }
        return combine_items(vec![Some(Q::Obj(obj))], b, limit);
    }
    combine_items(spread(a), b, limit)
}

fn combine_items(mut items: Vec<Option<Q>>, b: Q, limit: usize) -> Q {
    items.extend(spread(b));
    if items.len() > limit {
        let max = items.len() as i64 - 1;
        return overflowed(items, max);
    }
    Q::Arr(Arr {
        items,
        conflict: None,
    })
}

/// `maxNumericIndex(obj, min)`.
fn max_numeric_index(obj: &Obj, min: i64) -> i64 {
    obj.entries
        .iter()
        .filter_map(|(k, _)| canonical_int(k))
        .fold(min, i64::max)
}

/// `utils.merge(target, source)` with Express's options (strictMerge on).
fn merge(target: Q, source: Q, limit: usize) -> Q {
    match source {
        // `if (!source) return target`
        Q::Str(s) if s.is_empty() => target,
        Q::Str(s) => match target {
            Q::Arr(mut a) => {
                let next = a.items.len();
                if next >= limit {
                    a.items.push(Some(Q::Str(s)));
                    return overflowed(a.items, next as i64);
                }
                a.items.push(Some(Q::Str(s)));
                Q::Arr(a)
            }
            Q::Obj(mut o) => {
                if let Some(max) = o.overflow {
                    o.set((max + 1).to_string(), Q::Str(s));
                    o.overflow = Some(max + 1);
                    Q::Obj(o)
                } else if let Some(c) = o.conflict {
                    o.set((c + 1).to_string(), Q::Str(s));
                    o.conflict = Some(c + 1);
                    Q::Obj(o)
                } else {
                    // limitedPair, marked as a conflict.
                    Q::Arr(Arr {
                        items: vec![Some(Q::Obj(o)), Some(Q::Str(s))],
                        conflict: Some(1),
                    })
                }
            }
            Q::Str(t) => Q::Arr(Arr {
                items: vec![Some(Q::Str(t)), Some(Q::Str(s))],
                conflict: None,
            }),
        },
        source => match target {
            Q::Str(t) => {
                if let Some(max) = source.overflow() {
                    let Q::Obj(src) = source else { unreachable!() };
                    let mut out = Obj {
                        entries: vec![("0".into(), Q::Str(t))],
                        ..Obj::default()
                    };
                    for (k, v) in src.entries {
                        let key = match canonical_int(&k).or_else(|| k.parse().ok()) {
                            Some(n) => (n + 1).to_string(),
                            None => "NaN".into(),
                        };
                        out.set(key, v);
                    }
                    out.overflow = Some(max + 1);
                    return Q::Obj(out);
                }
                combine_items(vec![Some(Q::Str(t))], source, limit)
            }
            Q::Arr(mut a) => match source {
                Q::Arr(b) => {
                    for (i, item) in b.items.into_iter().enumerate() {
                        let Some(item) = item else { continue };
                        match a.items.get_mut(i) {
                            Some(Some(existing)) => {
                                if existing.is_object() && item.is_object() {
                                    let current =
                                        std::mem::replace(existing, Q::Str(String::new()));
                                    *existing = merge(current, item, limit);
                                } else {
                                    a.items.push(Some(item));
                                }
                            }
                            _ => {
                                if a.items.len() <= i {
                                    a.items.resize(i + 1, None);
                                }
                                a.items[i] = Some(item);
                            }
                        }
                    }
                    if a.items.len() > limit {
                        let max = a.items.len() as i64 - 1;
                        return overflowed(a.items, max);
                    }
                    Q::Arr(a)
                }
                Q::Obj(src) => {
                    let len = a.items.len() as i64;
                    let mut acc = array_to_object(a.items);
                    if a.conflict.is_some() {
                        acc.conflict = Some(len - 1);
                    }
                    let source_overflow = src.overflow;
                    Q::Obj(reduce(acc, src.entries, source_overflow, limit))
                }
                Q::Str(_) => unreachable!("strings handled above"),
            },
            Q::Obj(acc) => {
                let (entries, source_overflow) = match source {
                    Q::Arr(b) => (array_to_object(b.items).entries, None),
                    Q::Obj(o) => (o.entries, o.overflow),
                    Q::Str(_) => unreachable!("strings handled above"),
                };
                Q::Obj(reduce(acc, entries, source_overflow, limit))
            }
        },
    }
}

/// The `Object.keys(source).reduce(...)` tail of `merge`.
fn reduce(
    mut acc: Obj,
    entries: Vec<(String, Q)>,
    source_overflow: Option<i64>,
    limit: usize,
) -> Obj {
    for (key, value) in entries {
        match acc.get_mut(&key) {
            Some(slot) => {
                let current = std::mem::replace(slot, Q::Str(String::new()));
                *slot = merge(current, value, limit);
            }
            None => acc.entries.push((key.clone(), value)),
        }
        if let Some(source_max) = source_overflow
            && acc.overflow.is_none()
        {
            acc.overflow = Some(max_numeric_index(&acc, source_max));
        }
        let n = canonical_int(&key);
        if let (Some(max), Some(n)) = (acc.overflow, n)
            && n >= 0
            && n > max
        {
            acc.overflow = Some(n);
        }
        if let (Some(c), Some(n)) = (acc.conflict, n)
            && n > c
        {
            acc.conflict = Some(n);
        }
    }
    acc
}

/// `splitKeyIntoSegments`.
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
        for (i, b) in bytes.iter().enumerate().skip(o + 1) {
            match b {
                b'[' => level += 1,
                b']' => {
                    level -= 1;
                    if level == 0 {
                        close = Some(i);
                        break;
                    }
                }
                _ => {}
            }
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

/// `parseObject(chain, val)`.
fn parse_object(chain: &[String], value: Q, opts: &Options) -> Q {
    let mut leaf = value;
    for root in chain.iter().rev() {
        leaf = if root == "[]" {
            if leaf.overflow().is_some() {
                leaf
            } else {
                combine(Q::Arr(Arr::default()), leaf, opts.array_limit)
            }
        } else {
            let clean = if root.len() >= 2 && root.starts_with('[') && root.ends_with(']') {
                &root[1..root.len() - 1]
            } else {
                root.as_str()
            };
            let index = canonical_int(clean).filter(|n| *n >= 0 && root != clean);
            match index {
                Some(n) if (n as u64) < opts.array_limit as u64 => {
                    let mut items = vec![None; n as usize + 1];
                    items[n as usize] = Some(leaf);
                    Q::Arr(Arr {
                        items,
                        conflict: None,
                    })
                }
                Some(n) => Q::Obj(Obj {
                    entries: vec![(n.to_string(), leaf)],
                    overflow: Some(n),
                    conflict: None,
                }),
                None if clean != "__proto__" => Q::Obj(Obj {
                    entries: vec![(clean.to_owned(), leaf)],
                    ..Obj::default()
                }),
                None => Q::Obj(Obj::default()),
            }
        };
    }
    leaf
}

/// `compact`: holes removed from every nested array.
fn compact(q: Q) -> Q {
    match q {
        Q::Str(s) => Q::Str(s),
        Q::Arr(a) => Q::Arr(Arr {
            items: a
                .items
                .into_iter()
                .flatten()
                .map(|v| Some(compact(v)))
                .collect(),
            conflict: a.conflict,
        }),
        Q::Obj(mut o) => {
            o.entries = o
                .entries
                .into_iter()
                .map(|(k, v)| (k, compact(v)))
                .collect();
            Q::Obj(o)
        }
    }
}

fn to_value(q: Q) -> Value {
    match q {
        Q::Str(s) => Value::String(s),
        Q::Arr(a) => Value::Array(a.items.into_iter().flatten().map(to_value).collect()),
        Q::Obj(o) => Value::Object(
            o.entries
                .into_iter()
                .map(|(k, v)| (k, to_value(v)))
                .collect(),
        ),
    }
}

/// A canonical array index (`Object.keys` lists these first, ascending).
fn array_index(key: &str) -> Option<u32> {
    canonical_int(key)
        .filter(|n| (0..i64::from(u32::MAX)).contains(n))
        .map(|n| n as u32)
}

/// `qs.parse(str, opts)`.
pub fn parse(input: &str, opts: &Options) -> Result<Map<String, Value>, DepthExceeded> {
    if input.is_empty() {
        return Ok(Map::new());
    }
    // parseValues
    let clean = fold_brackets(input);
    let mut temp: Vec<(String, Q)> = Vec::new();
    for part in clean.split('&').take(opts.parameter_limit) {
        let pos = match part.find("]=") {
            Some(p) => Some(p + 1),
            None => part.find('='),
        };
        let (key, value) = match pos {
            None => (decode(part), String::new()),
            Some(p) => (decode(&part[..p]), decode(&part[p + 1..])),
        };
        match temp.iter_mut().find(|(k, _)| *k == key) {
            Some((_, existing)) => {
                let current = std::mem::replace(existing, Q::Str(String::new()));
                *existing = combine(current, Q::Str(value), opts.array_limit);
            }
            None => temp.push((key, Q::Str(value))),
        }
    }
    // Object.keys order: array indexes ascending, then insertion order.
    let mut indexed: Vec<(u32, usize)> = temp
        .iter()
        .enumerate()
        .filter_map(|(i, (k, _))| array_index(k).map(|n| (n, i)))
        .collect();
    indexed.sort_unstable();
    let order: Vec<usize> = indexed
        .iter()
        .map(|(_, i)| *i)
        .chain((0..temp.len()).filter(|i| array_index(&temp[*i].0).is_none()))
        .collect();
    let mut slots: Vec<Option<(String, Q)>> = temp.into_iter().map(Some).collect();

    let mut obj = Q::Obj(Obj::default());
    for i in order {
        let Some((key, value)) = slots[i].take() else {
            continue;
        };
        if key.is_empty() {
            continue;
        }
        let chain = segments(&key, opts)?;
        let parsed = parse_object(&chain, value, opts);
        obj = merge(obj, parsed, opts.array_limit);
    }
    match to_value(compact(obj)) {
        Value::Object(map) => Ok(map),
        _ => Ok(Map::new()),
    }
}

/// `str.replace(/%5B/gi, '[').replace(/%5D/gi, ']')`.
fn fold_brackets(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() && b[i + 1] == b'5' {
            match b[i + 2] {
                b'B' | b'b' => {
                    out.push('[');
                    i += 3;
                    continue;
                }
                b'D' | b'd' => {
                    out.push(']');
                    i += 3;
                    continue;
                }
                _ => {}
            }
        }
        // Copy one whole character.
        let ch = s[i..].chars().next().expect("in bounds");
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// Express's `req.query` for a request URI (`{}` without a query string).
pub fn query(uri: &axum::http::Uri) -> Map<String, Value> {
    parse(uri.query().unwrap_or(""), &QUERY).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn q(s: &str) -> Value {
        Value::Object(parse(s, &QUERY).unwrap())
    }

    #[test]
    fn simple_and_repeated_keys() {
        assert_eq!(q("a=1&b=2"), json!({ "a": "1", "b": "2" }));
        assert_eq!(q("a=1&a=2"), json!({ "a": ["1", "2"] }));
        assert_eq!(q("a[]=1"), json!({ "a": ["1"] }));
        assert_eq!(q("a[1]=x&a[0]=y"), json!({ "a": ["y", "x"] }));
        assert_eq!(q("a[x]=1"), json!({ "a": { "x": "1" } }));
        assert_eq!(q("a%5Bx%5D=1"), json!({ "a": { "x": "1" } }));
        assert_eq!(q("a"), json!({ "a": "" }));
        assert_eq!(q("a=%E0"), json!({ "a": "%E0" }));
        assert_eq!(q("a=b+c%20d"), json!({ "a": "b c d" }));
        assert_eq!(q("=x&&"), json!({}));
        assert_eq!(q("[a]=x"), json!({ "a": "x" }));
    }

    #[test]
    fn merges_like_qs() {
        assert_eq!(q("a=1&a[x]=2"), json!({ "a": ["1", { "x": "2" }] }));
        assert_eq!(q("a[x]=2&a=1"), json!({ "a": [{ "x": "2" }, "1"] }));
        assert_eq!(q("a[]=1&a[x]=2"), json!({ "a": { "0": "1", "x": "2" } }));
        assert_eq!(q("a[1500]=x"), json!({ "a": { "1500": "x" } }));
        assert_eq!(q("a[]=x&a="), json!({ "a": ["x"] }));
    }

    /// Express's own query parser on the same strings
    /// (backend/scripts/gen-misc-fixtures.js).
    #[test]
    fn matches_express_query_parser() {
        let fixtures: Value =
            serde_json::from_str(include_str!("../fixtures/misc_compat.json")).unwrap();
        let cases = fixtures["query"].as_array().unwrap();
        assert!(cases.len() > 30);
        for case in cases {
            let input = case["input"].as_str().unwrap();
            assert_eq!(q(input), case["value"], "query {input:?}");
        }
    }

    #[test]
    fn depth_limits() {
        assert_eq!(
            q("a[b][c][d][e][f][g]=1"),
            json!({ "a": { "b": { "c": { "d": { "e": { "f": { "[g]": "1" } } } } } } })
        );
        let strict = Options {
            depth: 1,
            ..urlencoded(1)
        };
        assert_eq!(parse("a[b][c]=1", &strict), Err(DepthExceeded));
    }
}
