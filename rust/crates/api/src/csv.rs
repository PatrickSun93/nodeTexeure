//! CSV the way the bulk routes produce and read it: papaparse 5.5
//! (`Papa.unparse` / `Papa.parse`) plus backend/utils/csvExporter.js and
//! csvParser.js on top.
//!
//! * [`unparse`] — `Papa.unparse(data, config)` for arrays of objects (the
//!   `columns`, or `Object.keys(data[0])`) and arrays of arrays: quoting
//!   (`quotes: true`, or only where needed: delimiter, quote, CR/LF/BOM,
//!   leading/trailing space), `""` escaping, the header row, `\r\n`, no
//!   trailing newline, `''` for an empty array (even with `columns`), values
//!   through `String()` (`null`/`undefined` → empty, dates as ISO).
//! * [`Exporter`] — `CSVExporter.export` (formula-injection prefix `'` on
//!   strings starting with `= + - @ \t \r`), `exportOrders` / `exportProducts` /
//!   `exportCustomers` / `exportAnalytics` over rows from
//!   [`crate::mysql_json`] (DECIMAL strings, BIGINT strings, ISO dates — the
//!   values mysql2 gives Node), and [`download`] (`setDownloadHeaders` +
//!   `res.send`, see [`crate::express_send`]).
//! * [`parse`] — `Papa.parse(text, { header: true, skipEmptyLines: true,
//!   transformHeader: h => h.trim() })` as `CSVParser.parse` calls it: BOM
//!   stripped, line ending and delimiter guessed (`, \t | ; RS US`), quoted
//!   fields, duplicate headers renamed (`a`, `a_1`), `__parsed_extra`, the
//!   `TooFewFields`/`TooManyFields`/quote errors.
//! * [`validate_products`], [`transform_product_row`], [`slugify`],
//!   [`product_template`] — the rest of csvParser.js.
//!
//! Values that only exist in Node (a `Date` that is invalid, a Buffer column
//! in a `SELECT *` export) are approximated: an invalid date has already
//! become `null` in the row (Node writes `ull`, JSON.stringify's `"null"`
//! sliced), a Buffer is written as its UTF-8 text like `Buffer#toString`.

use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::response::Response;
use common::json::{js_number_string, js_to_fixed};
use serde_json::{Map, Value};

use crate::body::js_string;
use crate::express::is_js_space;
use crate::mysql_json::{Js, JsRow};

// ---------------------------------------------------------------------------
// JavaScript number parsing
// ---------------------------------------------------------------------------

fn trim_start_js(s: &str) -> &str {
    s.trim_start_matches(is_js_space)
}

/// `parseFloat(string)`: the longest decimal prefix (`Infinity` included),
/// NaN when there is none.
pub fn js_parse_float(s: &str) -> f64 {
    let t = trim_start_js(s);
    let b = t.as_bytes();
    let mut i = 0;
    let negative = match b.first() {
        Some(b'-') => {
            i = 1;
            true
        }
        Some(b'+') => {
            i = 1;
            false
        }
        _ => false,
    };
    if t[i..].starts_with("Infinity") {
        return if negative {
            f64::NEG_INFINITY
        } else {
            f64::INFINITY
        };
    }
    let start = i;
    let mut digits = 0;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
        digits += 1;
    }
    if i < b.len() && b[i] == b'.' {
        let mut j = i + 1;
        let mut frac = 0;
        while j < b.len() && b[j].is_ascii_digit() {
            j += 1;
            frac += 1;
        }
        if digits + frac > 0 {
            i = j;
            digits += frac;
        }
    }
    if digits == 0 {
        return f64::NAN;
    }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        let mut j = i + 1;
        if j < b.len() && (b[j] == b'+' || b[j] == b'-') {
            j += 1;
        }
        let exp_start = j;
        while j < b.len() && b[j].is_ascii_digit() {
            j += 1;
        }
        if j > exp_start {
            i = j;
        }
    }
    let text = &t[start..i];
    let text = if text.starts_with('.') {
        format!("0{text}")
    } else {
        text.to_owned()
    };
    let v: f64 = text.parse().unwrap_or(f64::NAN);
    if negative { -v } else { v }
}

/// `parseInt(string)` without a radix: `0x`/`0X` means hex, else decimal;
/// the longest digit prefix, NaN when there is none.
pub fn js_parse_int(s: &str) -> f64 {
    let t = trim_start_js(s);
    let (negative, rest) = match t.as_bytes().first() {
        Some(b'-') => (true, &t[1..]),
        Some(b'+') => (false, &t[1..]),
        _ => (false, t),
    };
    let (radix, digits) = match rest.get(..2) {
        Some("0x" | "0X") => (16, &rest[2..]),
        _ => (10, rest),
    };
    let end = digits
        .find(|c: char| !c.is_digit(radix))
        .unwrap_or(digits.len());
    let digits = &digits[..end];
    if digits.is_empty() {
        return f64::NAN;
    }
    let v = if radix == 10 {
        digits.parse::<f64>().unwrap_or(f64::NAN)
    } else {
        digits.chars().fold(0.0, |acc, c| {
            acc * 16.0 + f64::from(c.to_digit(16).unwrap_or(0))
        })
    };
    if negative { -v } else { v }
}

// ---------------------------------------------------------------------------
// Papa.unparse
// ---------------------------------------------------------------------------

/// A cell as `Papa.unparse` sees it.
#[derive(Debug, Clone, PartialEq)]
pub enum Cell {
    /// `undefined` (a missing key) and `null`: empty.
    Empty,
    /// A `Date`: written unquoted, even with `quotes: true`, as
    /// `JSON.stringify(date).slice(1, 25)` (`ull` for an Invalid Date).
    Date(Option<String>),
    /// Anything else, already `String(value)`.
    Text(String),
}

impl Cell {
    /// A row value as papaparse writes it (`null` empty, a Buffer as its
    /// UTF-8 text, objects as `String(value)`).
    pub fn from_js(v: Option<&Js>) -> Cell {
        match v {
            None | Some(Js::Null) | Some(Js::Json(Value::Null)) => Cell::Empty,
            Some(Js::Date(d)) => Cell::Date(d.as_ref().map(crate::mysql_json::iso)),
            Some(v) => Cell::Text(v.js_string()),
        }
    }

    /// A JSON value (a route's own data) as papaparse writes it.
    pub fn from_value(v: Option<&Value>) -> Cell {
        match v {
            None | Some(Value::Null) => Cell::Empty,
            Some(v) => Cell::Text(js_string(v)),
        }
    }

    pub fn text(s: impl Into<String>) -> Cell {
        Cell::Text(s.into())
    }

    /// `String(n)`.
    pub fn number(n: f64) -> Cell {
        Cell::Text(js_number_string(n))
    }
}

/// `Papa.unparse` options the routes use.
#[derive(Debug, Clone)]
pub struct UnparseConfig {
    pub quotes: bool,
    pub header: bool,
    pub delimiter: String,
    pub newline: String,
    pub quote_char: char,
    /// `escapeChar` (`"`, so a quote is doubled).
    pub escape_char: char,
}

impl Default for UnparseConfig {
    /// papaparse's defaults.
    fn default() -> Self {
        Self {
            quotes: false,
            header: true,
            delimiter: ",".into(),
            newline: "\r\n".into(),
            quote_char: '"',
            escape_char: '"',
        }
    }
}

impl UnparseConfig {
    /// csvExporter.js: `quotes: true`, `\r\n`.
    pub fn exporter() -> Self {
        Self {
            quotes: true,
            ..Self::default()
        }
    }
}

/// Rows for [`unparse`].
#[derive(Debug, Clone)]
pub enum Rows {
    /// An array of objects: key/value pairs in `Object.keys` order.
    Objects(Vec<Vec<(String, Cell)>>),
    /// An array of arrays.
    Arrays(Vec<Vec<Cell>>),
}

/// The `safe()` of papaparse: quoted when forced or needed.
fn safe(cell: &Cell, config: &UnparseConfig) -> String {
    let s = match cell {
        Cell::Empty => return String::new(),
        Cell::Date(Some(iso)) => return format!("\"{iso}\"").chars().skip(1).take(24).collect(),
        Cell::Date(None) => return "ull".into(),
        Cell::Text(s) => s,
    };
    let q = config.quote_char.to_string();
    let escaped = s.replace(&q, &format!("{}{}", config.escape_char, config.quote_char));
    let needs = config.quotes
        || ["\r", "\n", "\"", "\u{feff}"]
            .iter()
            .any(|bad| escaped.contains(bad))
        || escaped.contains(config.delimiter.as_str())
        || escaped.starts_with(' ')
        || escaped.ends_with(' ');
    if needs {
        format!("{q}{escaped}{q}")
    } else {
        escaped
    }
}

/// `Object.keys` order: canonical array-index keys first (ascending), then
/// the rest in insertion order.
pub fn js_key_order(keys: &[String]) -> Vec<String> {
    let index = |k: &str| {
        k.parse::<u32>()
            .ok()
            .filter(|n| *n != u32::MAX && n.to_string() == k)
    };
    let mut ints: Vec<(u32, &String)> = keys
        .iter()
        .filter_map(|k| index(k).map(|n| (n, k)))
        .collect();
    ints.sort_by_key(|(n, _)| *n);
    ints.into_iter()
        .map(|(_, k)| k.clone())
        .chain(keys.iter().filter(|k| index(k).is_none()).cloned())
        .collect()
}

/// `Papa.unparse(data, { ...config, columns })`.
pub fn unparse(rows: &Rows, columns: Option<&[&str]>, config: &UnparseConfig) -> String {
    let mut csv = String::new();
    match rows {
        // `!_input.length || Array.isArray(_input[0])` → no header.
        Rows::Arrays(data) => {
            for (r, row) in data.iter().enumerate() {
                for (c, cell) in row.iter().enumerate() {
                    if c > 0 {
                        csv.push_str(&config.delimiter);
                    }
                    csv.push_str(&safe(cell, config));
                }
                if r + 1 < data.len() {
                    csv.push_str(&config.newline);
                }
            }
        }
        Rows::Objects(data) if data.is_empty() => {}
        Rows::Objects(data) => {
            let fields: Vec<String> = match columns {
                Some(c) => c.iter().map(|s| (*s).to_owned()).collect(),
                None => js_key_order(&data[0].iter().map(|(k, _)| k.clone()).collect::<Vec<_>>()),
            };
            let has_header = !fields.is_empty();
            if has_header && config.header {
                for (i, f) in fields.iter().enumerate() {
                    if i > 0 {
                        csv.push_str(&config.delimiter);
                    }
                    csv.push_str(&safe(&Cell::Text(f.clone()), config));
                }
                csv.push_str(&config.newline);
            }
            for (r, row) in data.iter().enumerate() {
                let null_line = row.is_empty();
                for (c, field) in fields.iter().enumerate() {
                    if c > 0 && !null_line {
                        csv.push_str(&config.delimiter);
                    }
                    let cell = row
                        .iter()
                        .rev()
                        .find(|(k, _)| k == field)
                        .map_or(Cell::Empty, |(_, v)| v.clone());
                    csv.push_str(&safe(&cell, config));
                }
                if r + 1 < data.len() {
                    csv.push_str(&config.newline);
                }
            }
        }
    }
    csv
}

// ---------------------------------------------------------------------------
// csvExporter.js
// ---------------------------------------------------------------------------

/// `CSVExporter.sanitizeCell`: a string starting with `= + - @ \t \r` gets a
/// leading `'`.
pub fn sanitize_cell(cell: Cell) -> Cell {
    match cell {
        Cell::Text(s) if s.starts_with(['=', '+', '-', '@', '\t', '\r']) => {
            Cell::Text(format!("'{s}"))
        }
        other => other,
    }
}

/// A formatted export row: `(key, value)` in object-literal order, plus
/// whether each value is a string (only strings are sanitized).
#[derive(Debug, Clone, Default)]
pub struct Row(Vec<(String, Cell, bool)>);

impl Row {
    pub fn new() -> Self {
        Self::default()
    }

    /// A string value (sanitized on export).
    pub fn string(mut self, key: &str, value: impl Into<String>) -> Self {
        self.0.push((key.into(), Cell::Text(value.into()), true));
        self
    }

    /// A row value as is (only a JS string is sanitized).
    pub fn value(mut self, key: &str, value: Option<&Js>) -> Self {
        let is_string = matches!(value, Some(Js::String(_)));
        self.0.push((key.into(), Cell::from_js(value), is_string));
        self
    }
}

/// `parseFloat(v).toFixed(2)`.
fn fixed2(v: Option<&Js>) -> String {
    js_to_fixed(parse_float_js(v), 2)
}

/// `parseFloat(value)` (`String(value)` first).
fn parse_float_js(v: Option<&Js>) -> f64 {
    match v {
        None => f64::NAN,
        Some(Js::Number(n)) => *n,
        Some(v) => js_parse_float(&v.js_string()),
    }
}

fn truthy(v: Option<&Js>) -> bool {
    v.is_some_and(Js::truthy)
}

/// `v || fallback` for a row value.
fn or<'a>(v: Option<&'a Js>, fallback: &'a Js) -> &'a Js {
    if truthy(v) {
        v.expect("truthy")
    } else {
        fallback
    }
}

/// backend/utils/csvExporter.js.
pub struct Exporter;

impl Exporter {
    /// `CSVExporter.export(data, fields)`.
    pub fn export(rows: Vec<Row>, fields: Option<&[&str]>) -> String {
        let data = rows
            .into_iter()
            .map(|Row(cells)| {
                cells
                    .into_iter()
                    .map(|(k, c, is_string)| (k, if is_string { sanitize_cell(c) } else { c }))
                    .collect()
            })
            .collect();
        unparse(&Rows::Objects(data), fields, &UnparseConfig::exporter())
    }

    /// `CSVExporter.export(rows)` for raw database rows (`Object.keys` of
    /// each row, every string sanitized).
    pub fn export_rows(rows: &[JsRow], fields: Option<&[&str]>) -> String {
        Self::export(
            rows.iter()
                .map(|r| {
                    r.keys()
                        .into_iter()
                        .fold(Row::new(), |row, k| row.value(&k, r.get(&k)))
                })
                .collect(),
            fields,
        )
    }

    /// `CSVExporter.exportOrders(orders)` (rows of `SELECT o.*, u.email as user_email`).
    pub fn export_orders(orders: &[JsRow]) -> String {
        const FIELDS: &[&str] = &[
            "id",
            "order_number",
            "user_email",
            "status",
            "payment_status",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "shipping_amount",
            "total",
            "created_at",
            "shipped_at",
            "delivered_at",
        ];
        let zero = Js::Number(0.0);
        let empty = Js::String(String::new());
        let guest = Js::String("Guest".into());
        let rows = orders
            .iter()
            .map(|o| {
                Row::new()
                    .value("id", o.get("id"))
                    .value("order_number", o.get("order_number"))
                    .value("user_email", Some(or(o.get("user_email"), &guest)))
                    .value("status", o.get("status"))
                    .value("payment_status", o.get("payment_status"))
                    .string("subtotal", fixed2(o.get("subtotal")))
                    .string(
                        "discount_amount",
                        fixed2(Some(or(o.get("discount_amount"), &zero))),
                    )
                    .string("tax_amount", fixed2(Some(or(o.get("tax_amount"), &zero))))
                    .string(
                        "shipping_amount",
                        fixed2(Some(or(o.get("shipping_amount"), &zero))),
                    )
                    .string("total", fixed2(o.get("total")))
                    .value("created_at", o.get("created_at"))
                    .value("shipped_at", Some(or(o.get("shipped_at"), &empty)))
                    .value("delivered_at", Some(or(o.get("delivered_at"), &empty)))
            })
            .collect();
        Self::export(rows, Some(FIELDS))
    }

    /// `CSVExporter.exportProducts(products)` (rows of `SELECT * FROM products`).
    pub fn export_products(products: &[JsRow]) -> String {
        const FIELDS: &[&str] = &[
            "id",
            "sku",
            "name",
            "slug",
            "category_name",
            "base_price",
            "sale_price",
            "stock_quantity",
            "status",
            "is_active",
            "is_featured",
            "created_at",
        ];
        let empty = Js::String(String::new());
        let yes_no = |v: Option<&Js>| if truthy(v) { "Yes" } else { "No" };
        let rows = products
            .iter()
            .map(|p| {
                Row::new()
                    .value("id", p.get("id"))
                    .value("sku", p.get("sku"))
                    .value("name", p.get("name"))
                    .value("slug", p.get("slug"))
                    .value("category_name", Some(or(p.get("category_name"), &empty)))
                    .string("base_price", fixed2(p.get("base_price")))
                    .string(
                        "sale_price",
                        if truthy(p.get("sale_price")) {
                            fixed2(p.get("sale_price"))
                        } else {
                            String::new()
                        },
                    )
                    .value("stock_quantity", p.get("stock_quantity"))
                    .value("status", p.get("status"))
                    .string("is_active", yes_no(p.get("is_active")))
                    .string("is_featured", yes_no(p.get("is_featured")))
                    .value("created_at", p.get("created_at"))
            })
            .collect();
        Self::export(rows, Some(FIELDS))
    }

    /// `CSVExporter.exportCustomers(customers)` (`u.*` + `total_orders`,
    /// `lifetime_value`).
    pub fn export_customers(customers: &[JsRow]) -> String {
        const FIELDS: &[&str] = &[
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "status",
            "email_verified",
            "total_orders",
            "lifetime_value",
            "created_at",
            "last_login",
        ];
        let empty = Js::String(String::new());
        let zero = Js::Number(0.0);
        let rows = customers
            .iter()
            .map(|c| {
                Row::new()
                    .value("id", c.get("id"))
                    .value("email", c.get("email"))
                    .value("first_name", c.get("first_name"))
                    .value("last_name", c.get("last_name"))
                    .value("phone", Some(or(c.get("phone"), &empty)))
                    .value("status", c.get("status"))
                    .string(
                        "email_verified",
                        if truthy(c.get("email_verified")) {
                            "Yes"
                        } else {
                            "No"
                        },
                    )
                    .value("total_orders", Some(or(c.get("total_orders"), &zero)))
                    .string(
                        "lifetime_value",
                        if truthy(c.get("lifetime_value")) {
                            fixed2(c.get("lifetime_value"))
                        } else {
                            "0.00".into()
                        },
                    )
                    .value("created_at", c.get("created_at"))
                    .value("last_login", Some(or(c.get("last_login"), &empty)))
            })
            .collect();
        Self::export(rows, Some(FIELDS))
    }

    /// `CSVExporter.exportAnalytics(data, type)`.
    pub fn export_analytics(data: &[JsRow], kind: &str) -> String {
        let zero = Js::Number(0.0);
        let na = Js::String("N/A".into());
        match kind {
            "sales" => Self::export(
                data.iter()
                    .map(|r| {
                        Row::new()
                            .value("period", r.get("period"))
                            .value("order_count", r.get("order_count"))
                            .string("revenue", fixed2(Some(or(r.get("revenue"), &zero))))
                            .string(
                                "avg_order_value",
                                fixed2(Some(or(r.get("avg_order_value"), &zero))),
                            )
                    })
                    .collect(),
                None,
            ),
            "products" => Self::export(
                data.iter()
                    .map(|r| {
                        Row::new()
                            .value("product_name", r.get("name"))
                            .value("times_sold", r.get("times_sold"))
                            .value("total_quantity", r.get("total_quantity"))
                            .string(
                                "total_revenue",
                                fixed2(Some(or(r.get("total_revenue"), &zero))),
                            )
                            .value("avg_rating", Some(or(r.get("avg_rating"), &na)))
                    })
                    .collect(),
                None,
            ),
            _ => Self::export_rows(data, None),
        }
    }
}

/// `CSVExporter.setDownloadHeaders(res, filename)` then `res.send(csv)`:
/// `text/csv; charset=utf-8`, `attachment; filename="<name>_<UTC date>.csv"`,
/// no-cache, plus Express's Content-Length / ETag / 304 handling.
pub fn download(filename: &str, csv: String, method: &Method, request: &HeaderMap) -> Response {
    let date = chrono::Utc::now().format("%Y-%m-%d");
    crate::express_send::Send::new(StatusCode::OK, crate::express_send::Payload::Text(csv))
        .header(header::CONTENT_TYPE, "text/csv")
        .header(
            header::CONTENT_DISPOSITION,
            &format!("attachment; filename=\"{filename}_{date}.csv\""),
        )
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::PRAGMA, "no-cache")
        .respond(method, request)
}

// ---------------------------------------------------------------------------
// Papa.parse
// ---------------------------------------------------------------------------

/// One value of a parsed row: a field, or the `__parsed_extra` list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Field {
    Text(String),
    Extra(Vec<String>),
}

/// A parsed row (`header: true`): fields in header order.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ParsedRow(pub Vec<(String, Field)>);

impl ParsedRow {
    /// `row[name]` when it is a string.
    pub fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(k, _)| k == name)
            .and_then(|(_, v)| match v {
                Field::Text(s) => Some(s.as_str()),
                Field::Extra(_) => None,
            })
    }

    fn set(&mut self, name: &str, value: Field) {
        match self.0.iter_mut().find(|(k, _)| k == name) {
            Some(slot) => slot.1 = value,
            None => self.0.push((name.to_owned(), value)),
        }
    }

    /// The row as JSON (`{ ...row }`).
    pub fn to_json(&self) -> Map<String, Value> {
        self.0
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    match v {
                        Field::Text(s) => Value::String(s.clone()),
                        Field::Extra(items) => {
                            Value::Array(items.iter().cloned().map(Value::String).collect())
                        }
                    },
                )
            })
            .collect()
    }
}

/// A `results.errors` entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub kind: &'static str,
    pub code: &'static str,
    pub message: String,
    pub row: Option<usize>,
}

/// `{ data, errors, meta }` (the meta the routes could read).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parsed {
    pub data: Vec<ParsedRow>,
    pub errors: Vec<ParseError>,
    pub delimiter: String,
    pub linebreak: String,
    pub fields: Vec<String>,
}

const RECORD_SEP: &str = "\u{1e}";
const UNIT_SEP: &str = "\u{1f}";

/// `guessLineEndings` on the first MiB (UTF-16 units) without quoted text.
fn guess_line_endings(input: &str) -> &'static str {
    let mut units = 0usize;
    let mut cut = input.len();
    for (i, c) in input.char_indices() {
        if units >= 1024 * 1024 {
            cut = i;
            break;
        }
        units += c.len_utf16();
    }
    let head = &input[..cut];
    // Drop `"…"` (lazy, across lines).
    let mut stripped = String::with_capacity(head.len());
    let mut rest = head;
    while let Some(open) = rest.find('"') {
        match rest[open + 1..].find('"') {
            Some(close) => {
                stripped.push_str(&rest[..open]);
                rest = &rest[open + 1 + close + 1..];
            }
            None => break,
        }
    }
    stripped.push_str(rest);
    let r: Vec<&str> = stripped.split('\r').collect();
    let n: Vec<&str> = stripped.split('\n').collect();
    let n_first = n.len() > 1 && n[0].len() < r[0].len();
    if r.len() == 1 || n_first {
        return "\n";
    }
    let with_n = r.iter().filter(|s| s.starts_with('\n')).count();
    if with_n as f64 >= r.len() as f64 / 2.0 {
        "\r\n"
    } else {
        "\r"
    }
}

/// The core `Parser` (no header handling): rows of fields, errors.
struct Core<'a> {
    delim: &'a str,
    newline: &'a str,
    preview: usize,
}

struct CoreResult {
    data: Vec<Vec<String>>,
    errors: Vec<ParseError>,
}

impl Core<'_> {
    fn parse(&self, input: &str) -> CoreResult {
        let mut data: Vec<Vec<String>> = Vec::new();
        let mut errors = Vec::new();
        if input.is_empty() {
            return CoreResult { data, errors };
        }
        let delim = self.delim;
        let newline = self.newline;
        let preview = self.preview;
        if !input.contains('"') {
            let rows: Vec<&str> = input.split(newline).collect();
            for (i, row) in rows.iter().enumerate() {
                data.push(row.split(delim).map(str::to_owned).collect());
                if preview > 0 && i >= preview {
                    data.truncate(preview);
                    return CoreResult { data, errors };
                }
            }
            return CoreResult { data, errors };
        }
        let find = |from: usize, pat: &str| {
            input
                .get(from..)
                .and_then(|s| s.find(pat))
                .map(|i| i + from)
        };
        let len = input.len();
        let mut cursor = 0usize;
        let mut row: Vec<String> = Vec::new();
        let mut next_delim = find(0, delim);
        let mut next_newline = find(0, newline);
        let unescape = |s: &str| s.replace("\"\"", "\"");
        let utf16 = |byte: usize| input[..byte.min(len)].encode_utf16().count();
        loop {
            if input.as_bytes().get(cursor) == Some(&b'"') {
                let mut quote_search = cursor;
                cursor += 1;
                loop {
                    let Some(q) = find(quote_search + 1, "\"") else {
                        errors.push(ParseError {
                            kind: "Quotes",
                            code: "MissingQuotes",
                            message: "Quoted field unterminated".into(),
                            row: Some(data.len()),
                        });
                        let _ = utf16(cursor);
                        row.push(input[cursor..].to_owned());
                        data.push(row);
                        return CoreResult { data, errors };
                    };
                    if q == len - 1 {
                        row.push(unescape(&input[cursor..q]));
                        data.push(row);
                        return CoreResult { data, errors };
                    }
                    if input.as_bytes().get(q + 1) == Some(&b'"') {
                        quote_search = q + 1;
                        continue;
                    }
                    if next_delim.is_some_and(|d| d < q + 1) {
                        next_delim = find(q + 1, delim);
                    }
                    if next_newline.is_some_and(|n| n < q + 1) {
                        next_newline = find(q + 1, newline);
                    }
                    let check_up_to = match next_newline {
                        None => next_delim,
                        Some(n) => Some(next_delim.map_or(n, |d| d.min(n))),
                    };
                    let extra = |index: Option<usize>| -> usize {
                        match index {
                            Some(i) if i > q + 1 => {
                                let between = &input[q + 1..i];
                                if crate::express::js_trim(between).is_empty() {
                                    between.len()
                                } else {
                                    0
                                }
                            }
                            _ => 0,
                        }
                    };
                    let spaces = extra(check_up_to);
                    let after = q + 1 + spaces;
                    if input.get(after..).is_some_and(|s| s.starts_with(delim)) {
                        row.push(unescape(&input[cursor..q]));
                        cursor = after + delim.len();
                        next_delim = find(cursor, delim);
                        next_newline = find(cursor, newline);
                        break;
                    }
                    let spaces_nl = extra(next_newline);
                    let after_nl = q + 1 + spaces_nl;
                    if input
                        .get(after_nl..)
                        .is_some_and(|s| s.starts_with(newline))
                    {
                        row.push(unescape(&input[cursor..q]));
                        cursor = after_nl + newline.len();
                        data.push(std::mem::take(&mut row));
                        next_newline = find(cursor, newline);
                        next_delim = find(cursor, delim);
                        if preview > 0 && data.len() >= preview {
                            return CoreResult { data, errors };
                        }
                        break;
                    }
                    errors.push(ParseError {
                        kind: "Quotes",
                        code: "InvalidQuotes",
                        message: "Trailing quote on quoted field is malformed".into(),
                        row: Some(data.len()),
                    });
                    // `quoteSearch++`, then the next search starts after it.
                    quote_search = q + 1;
                }
                continue;
            }
            if let Some(d) = next_delim
                && next_newline.is_none_or(|n| d < n)
            {
                row.push(input[cursor..d].to_owned());
                cursor = d + delim.len();
                next_delim = find(cursor, delim);
                continue;
            }
            if let Some(n) = next_newline {
                row.push(input[cursor..n].to_owned());
                cursor = n + newline.len();
                data.push(std::mem::take(&mut row));
                next_newline = find(cursor, newline);
                if preview > 0 && data.len() >= preview {
                    return CoreResult { data, errors };
                }
                continue;
            }
            break;
        }
        row.push(input.get(cursor..).unwrap_or("").to_owned());
        data.push(row);
        CoreResult { data, errors }
    }
}

fn is_empty_line(row: &[String]) -> bool {
    row.len() == 1 && row[0].is_empty()
}

/// `guessDelimiter` (skipEmptyLines on).
fn guess_delimiter(input: &str, newline: &str) -> Option<&'static str> {
    let mut best: Option<&'static str> = None;
    let mut best_delta: Option<usize> = None;
    let mut max_fields: Option<f64> = None;
    for delim in [",", "\t", "|", ";", RECORD_SEP, UNIT_SEP] {
        let preview = Core {
            delim,
            newline,
            preview: 10,
        }
        .parse(input);
        let mut delta = 0usize;
        let mut avg = 0f64;
        let mut empty = 0usize;
        let mut prev: Option<usize> = None;
        for row in &preview.data {
            if is_empty_line(row) {
                empty += 1;
                continue;
            }
            let count = row.len();
            avg += count as f64;
            match prev {
                None => prev = Some(count),
                Some(p) if count > 0 => {
                    delta += count.abs_diff(p);
                    prev = Some(count);
                }
                Some(_) => {}
            }
        }
        if !preview.data.is_empty() {
            avg /= (preview.data.len() - empty) as f64;
        }
        if best_delta.is_none_or(|b| delta <= b) && max_fields.is_none_or(|m| avg > m) && avg > 1.99
        {
            best_delta = Some(delta);
            best = Some(delim);
            max_fields = Some(avg);
        }
    }
    best
}

/// `transformHeader: (header) => header.trim()`.
fn trim_header(h: &str) -> String {
    crate::express::js_trim(h).to_owned()
}

/// `Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader:
/// trim })` — `CSVParser.parse`.
pub fn parse(text: &str) -> Parsed {
    let input = text.strip_prefix('\u{feff}').unwrap_or(text);
    let newline = guess_line_endings(input);
    let guessed = guess_delimiter(input, newline);
    let delimiter = guessed.unwrap_or(",");
    let core = Core {
        delim: delimiter,
        newline,
        preview: 0,
    }
    .parse(input);
    let mut errors = core.errors;
    if guessed.is_none() {
        errors.push(ParseError {
            kind: "Delimiter",
            code: "UndetectableDelimiter",
            message: "Unable to auto-detect delimiting character; defaulted to ','".into(),
            row: None,
        });
    }
    let mut rows = core.data;
    // The core parser renames duplicate headers (after transformHeader).
    if let Some(first) = rows.first_mut() {
        let originals: Vec<String> = first.clone();
        let mut used: std::collections::HashSet<String> = originals.iter().cloned().collect();
        let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for cell in first.iter_mut() {
            let header = trim_header(cell);
            match counts.get(&header).copied() {
                None | Some(0) => {
                    counts.insert(header.clone(), 1);
                    *cell = header.clone();
                }
                Some(mut suffix) => {
                    let mut renamed;
                    loop {
                        renamed = format!("{header}_{suffix}");
                        suffix += 1;
                        if !used.contains(&renamed) {
                            break;
                        }
                    }
                    used.insert(renamed.clone());
                    *cell = renamed;
                    *counts.get_mut(&header).expect("counted") += 1;
                }
            }
            used.insert(header);
        }
    }
    rows.retain(|r| !is_empty_line(r));
    let mut fields = Vec::new();
    if !rows.is_empty() {
        fields = rows.remove(0).iter().map(|h| trim_header(h)).collect();
    }
    let data = rows
        .iter()
        .enumerate()
        .map(|(i, source)| {
            let mut row = ParsedRow::default();
            for (j, value) in source.iter().enumerate() {
                if j >= fields.len() {
                    let mut extra = match row.0.iter().find(|(k, _)| k == "__parsed_extra") {
                        Some((_, Field::Extra(items))) => items.clone(),
                        _ => Vec::new(),
                    };
                    extra.push(value.clone());
                    row.set("__parsed_extra", Field::Extra(extra));
                } else {
                    row.set(&fields[j], Field::Text(value.clone()));
                }
            }
            let n = source.len();
            if n > fields.len() {
                errors.push(ParseError {
                    kind: "FieldMismatch",
                    code: "TooManyFields",
                    message: format!(
                        "Too many fields: expected {} fields but parsed {n}",
                        fields.len()
                    ),
                    row: Some(i),
                });
            } else if n < fields.len() {
                errors.push(ParseError {
                    kind: "FieldMismatch",
                    code: "TooFewFields",
                    message: format!(
                        "Too few fields: expected {} fields but parsed {n}",
                        fields.len()
                    ),
                    row: Some(i),
                });
            }
            row
        })
        .collect();
    Parsed {
        data,
        errors,
        delimiter: delimiter.to_owned(),
        linebreak: newline.to_owned(),
        fields,
    }
}

// ---------------------------------------------------------------------------
// csvParser.js
// ---------------------------------------------------------------------------

/// A row that passed validation: the parsed row plus `rowNumber`, `warnings`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidRow {
    pub row: ParsedRow,
    pub row_number: usize,
    pub warnings: Vec<String>,
}

impl ValidRow {
    /// `{ ...row, rowNumber, warnings }`.
    pub fn to_json(&self) -> Value {
        let mut m = self.row.to_json();
        m.insert("rowNumber".into(), Value::from(self.row_number));
        m.insert(
            "warnings".into(),
            Value::Array(self.warnings.iter().cloned().map(Value::String).collect()),
        );
        Value::Object(m)
    }
}

/// `CSVParser.validateProducts(data)`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Validation {
    pub valid: bool,
    pub total_rows: usize,
    pub valid_rows: usize,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub data: Vec<ValidRow>,
}

fn is_sku(s: &str) -> bool {
    !s.is_empty()
        && s.bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'-')
}

/// `CSVParser.validateProducts(parsed.data)`.
pub fn validate_products(data: &[ParsedRow]) -> Validation {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut valid = Vec::new();
    for (index, row) in data.iter().enumerate() {
        let row_number = index + 2;
        let mut row_errors = Vec::new();
        let mut row_warnings = Vec::new();
        for field in ["sku", "name", "base_price"] {
            if row
                .get(field)
                .is_none_or(|v| v.is_empty() || crate::express::js_trim(v).is_empty())
            {
                row_errors.push(format!(
                    "Row {row_number}: Missing required field '{field}'"
                ));
            }
        }
        if let Some(sku) = row.get("sku").filter(|s| !s.is_empty())
            && !is_sku(sku)
        {
            row_warnings.push(format!(
                "Row {row_number}: SKU should only contain uppercase letters, numbers, and hyphens"
            ));
        }
        if let Some(p) = row.get("base_price").filter(|s| !s.is_empty())
            && js_parse_float(p).is_nan()
        {
            row_errors.push(format!(
                "Row {row_number}: base_price must be a valid number"
            ));
        }
        if let Some(q) = row.get("stock_quantity").filter(|s| !s.is_empty())
            && js_parse_int(q).is_nan()
        {
            row_errors.push(format!(
                "Row {row_number}: stock_quantity must be a valid integer"
            ));
        }
        if let Some(s) = row.get("status").filter(|s| !s.is_empty())
            && !["draft", "active", "discontinued"].contains(&s.to_lowercase().as_str())
        {
            row_errors.push(format!(
                "Row {row_number}: status must be 'draft', 'active', or 'discontinued'"
            ));
        }
        if row_errors.is_empty() {
            valid.push(ValidRow {
                row: row.clone(),
                row_number,
                warnings: row_warnings.clone(),
            });
        } else {
            errors.extend(row_errors);
        }
        warnings.extend(row_warnings);
    }
    Validation {
        valid: errors.is_empty(),
        total_rows: data.len(),
        valid_rows: valid.len(),
        errors,
        warnings,
        data: valid,
    }
}

/// `CSVParser.slugify(text)`.
pub fn slugify(text: &str) -> String {
    let lower = text.to_lowercase();
    let trimmed = crate::express::js_trim(&lower);
    // /[^\w\s-]/g → ''
    let kept: String = trimmed
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || is_js_space(*c) || *c == '-')
        .collect();
    // /[\s_-]+/g → '-'
    let mut out = String::with_capacity(kept.len());
    let mut in_run = false;
    for c in kept.chars() {
        if is_js_space(c) || c == '_' || c == '-' {
            if !in_run {
                out.push('-');
                in_run = true;
            }
        } else {
            out.push(c);
            in_run = false;
        }
    }
    out.trim_matches('-').to_owned()
}

/// `CSVParser.transformProductRow(row)`; numbers are JS numbers (NaN
/// possible where Node would bind NaN).
#[derive(Debug, Clone, PartialEq)]
pub struct ProductRow {
    pub sku: String,
    pub name: String,
    pub slug: String,
    pub short_description: String,
    pub description: String,
    pub category_name: Option<String>,
    pub base_price: f64,
    pub sale_price: Option<f64>,
    pub cost_price: Option<f64>,
    pub stock_quantity: f64,
    pub low_stock_threshold: f64,
    pub status: String,
    pub is_featured: bool,
    pub meta_title: String,
    pub meta_description: String,
    pub material: Option<String>,
    pub thread_count: Option<f64>,
    pub weight: Option<f64>,
    pub organic: bool,
}

impl ProductRow {
    /// `JSON.stringify(product.product_details)`.
    pub fn product_details_json(&self) -> String {
        let num = |v: Option<f64>| match v {
            Some(n) if n.is_finite() => js_number_string(n),
            _ => "null".into(),
        };
        format!(
            "{{\"material\":{},\"thread_count\":{},\"weight\":{},\"organic\":{}}}",
            self.material
                .as_ref()
                .map_or("null".into(), |m| Value::String(m.clone()).to_string()),
            num(self.thread_count),
            num(self.weight),
            self.organic
        )
    }
}

/// `CSVParser.transformProductRow(row)` (for a validated row: `sku`, `name`
/// present).
pub fn transform_product_row(row: &ParsedRow) -> ProductRow {
    let trim = |s: &str| crate::express::js_trim(s).to_owned();
    let get = |k: &str| row.get(k).filter(|s| !s.is_empty());
    let opt_trim = |k: &str| row.get(k).map(trim).filter(|s| !s.is_empty());
    let name = trim(row.get("name").unwrap_or(""));
    ProductRow {
        sku: trim(row.get("sku").unwrap_or("")).to_uppercase(),
        name: name.clone(),
        slug: match get("slug") {
            Some(s) => trim(s),
            None => slugify(row.get("name").unwrap_or("")),
        },
        short_description: opt_trim("short_description").unwrap_or_default(),
        description: opt_trim("description").unwrap_or_default(),
        category_name: opt_trim("category_name"),
        base_price: js_parse_float(row.get("base_price").unwrap_or("")),
        sale_price: get("sale_price").map(js_parse_float),
        cost_price: get("cost_price").map(js_parse_float),
        stock_quantity: get("stock_quantity").map_or(0.0, js_parse_int),
        low_stock_threshold: get("low_stock_threshold").map_or(10.0, js_parse_int),
        status: get("status").map_or_else(|| "draft".into(), str::to_lowercase),
        is_featured: matches!(row.get("is_featured"), Some("true" | "1")),
        meta_title: opt_trim("meta_title").unwrap_or(name),
        meta_description: opt_trim("meta_description").unwrap_or_default(),
        material: opt_trim("material"),
        thread_count: get("thread_count").map(js_parse_int),
        weight: get("weight").map(js_parse_float),
        organic: matches!(row.get("organic"), Some("true" | "1")),
    }
}

/// `CSVParser.generateProductTemplate()`.
pub fn product_template() -> String {
    const HEADERS: [&str; 19] = [
        "sku",
        "name",
        "slug",
        "short_description",
        "description",
        "category_name",
        "base_price",
        "sale_price",
        "cost_price",
        "stock_quantity",
        "low_stock_threshold",
        "status",
        "is_featured",
        "meta_title",
        "meta_description",
        "material",
        "thread_count",
        "weight",
        "organic",
    ];
    const EXAMPLE: [&str; 19] = [
        "SILK-SHEET-001",
        "100% Mulberry Silk Sheet Set",
        "mulberry-silk-sheet-set",
        "Luxurious silk bedding for ultimate comfort",
        "Premium 100% mulberry silk sheets with 600 thread count...",
        "Sheets",
        "450.00",
        "399.00",
        "200.00",
        "50",
        "10",
        "active",
        "true",
        "Premium Mulberry Silk Sheets | Luxury Bedding",
        "Shop our 100% mulberry silk sheet sets...",
        "Silk",
        "600",
        "2.5",
        "true",
    ];
    let row = |cells: &[&str]| cells.iter().map(|c| Cell::text(*c)).collect();
    unparse(
        &Rows::Arrays(vec![row(&HEADERS), row(&EXAMPLE)]),
        None,
        &UnparseConfig::default(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Recorded from papaparse 5.5.3 and backend/utils (gen-foundation-fixtures.js).
    fn fixtures() -> Value {
        serde_json::from_str(include_str!("../fixtures/foundation_b.json")).unwrap()
    }

    /// `[[key, value]]` rows with `{ $date }` / `{ $buffer }` markers.
    fn rows(v: &Value) -> Vec<JsRow> {
        let js = |v: &Value| match v {
            Value::Object(o) if o.contains_key("$date") => Js::Date(
                o["$date"]
                    .as_str()
                    .map(|s| chrono::DateTime::parse_from_rfc3339(s).unwrap().naive_utc()),
            ),
            Value::Object(o) if o.contains_key("$buffer") => Js::Buffer(
                o["$buffer"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|b| b.as_u64().unwrap() as u8)
                    .collect(),
            ),
            other => Js::from_json(other),
        };
        v.as_array()
            .unwrap()
            .iter()
            .map(|r| {
                JsRow(
                    r.as_array()
                        .unwrap()
                        .iter()
                        .map(|kv| (kv[0].as_str().unwrap().to_owned(), js(&kv[1])))
                        .collect(),
                )
            })
            .collect()
    }

    #[test]
    fn exports_match_csv_exporter() {
        let f = fixtures();
        for case in f["csv"]["exports"].as_array().unwrap() {
            let input = rows(&case["rows"]);
            let out = match case["kind"].as_str().unwrap() {
                "orders" => Exporter::export_orders(&input),
                "products" => Exporter::export_products(&input),
                "customers" => Exporter::export_customers(&input),
                "rows" => Exporter::export_rows(&input, None),
                other => {
                    Exporter::export_analytics(&input, other.strip_prefix("analytics:").unwrap())
                }
            };
            assert_eq!(out, case["csv"].as_str().unwrap(), "{}", case["kind"]);
        }
        assert_eq!(product_template(), f["csv"]["template"].as_str().unwrap());
    }

    #[test]
    fn parsing_matches_papaparse() {
        let f = fixtures();
        for case in f["csv"]["parse"].as_array().unwrap() {
            let text = case["input"].as_str().unwrap();
            let parsed = parse(text);
            let data: Vec<Value> = parsed
                .data
                .iter()
                .map(|r| Value::Object(r.to_json()))
                .collect();
            assert_eq!(Value::Array(data), case["data"], "data of {text:?}");
            let errors: Vec<Value> = parsed
                .errors
                .iter()
                .map(|e| json!({ "type": e.kind, "code": e.code, "message": e.message, "row": e.row }))
                .collect();
            let expected: Vec<Value> = case["errors"]
                .as_array()
                .unwrap()
                .iter()
                .map(|e| json!({ "type": e["type"], "code": e["code"], "message": e["message"], "row": e.get("row").cloned().unwrap_or(Value::Null) }))
                .collect();
            assert_eq!(errors, expected, "errors of {text:?}");
            assert_eq!(
                parsed.delimiter,
                case["delimiter"].as_str().unwrap(),
                "delimiter of {text:?}"
            );
            assert_eq!(
                parsed.linebreak,
                case["linebreak"].as_str().unwrap(),
                "linebreak of {text:?}"
            );
            let v = validate_products(&parsed.data);
            let got = json!({
                "valid": v.valid, "totalRows": v.total_rows, "validRows": v.valid_rows,
                "errors": v.errors, "warnings": v.warnings,
                "data": v.data.iter().map(ValidRow::to_json).collect::<Vec<_>>(),
            });
            assert_eq!(got, case["validation"], "validation of {text:?}");
            let transformed: Vec<Value> = v
                .data
                .iter()
                .map(|r| {
                    let p = transform_product_row(&r.row);
                    let n = common::json::js_number;
                    json!({
                        "sku": p.sku, "name": p.name, "slug": p.slug,
                        "short_description": p.short_description, "description": p.description,
                        "category_name": p.category_name, "base_price": n(p.base_price),
                        "sale_price": p.sale_price.map(n), "cost_price": p.cost_price.map(n),
                        "stock_quantity": n(p.stock_quantity), "low_stock_threshold": n(p.low_stock_threshold),
                        "status": p.status, "is_featured": p.is_featured, "meta_title": p.meta_title,
                        "meta_description": p.meta_description,
                        "product_details": serde_json::from_str::<Value>(&p.product_details_json()).unwrap(),
                        "details_json": p.product_details_json(),
                    })
                })
                .collect();
            assert_eq!(
                Value::Array(transformed),
                case["transformed"],
                "transform of {text:?}"
            );
        }
    }

    #[test]
    fn unparse_edge_cases() {
        let cfg = UnparseConfig::default();
        let r = |cells: &[&str]| cells.iter().map(|c| Cell::text(*c)).collect::<Vec<_>>();
        assert_eq!(
            unparse(
                &Rows::Arrays(vec![r(&["a", " b", "c,d", "e\"f"]), r(&["1"])]),
                None,
                &cfg
            ),
            "a,\" b\",\"c,d\",\"e\"\"f\"\r\n1"
        );
        assert_eq!(
            unparse(
                &Rows::Objects(vec![]),
                Some(&["a"]),
                &UnparseConfig::exporter()
            ),
            ""
        );
        assert_eq!(
            unparse(
                &Rows::Objects(vec![vec![("a".into(), Cell::Empty)]]),
                Some(&["a", "b"]),
                &UnparseConfig::exporter()
            ),
            // null/undefined are empty and never quoted.
            "\"a\",\"b\"\r\n,"
        );
        assert_eq!(safe(&Cell::Date(None), &UnparseConfig::exporter()), "ull");
        assert_eq!(
            js_key_order(&["b".into(), "2".into(), "a".into(), "1".into()]),
            ["1", "2", "b", "a"]
        );
    }

    #[test]
    fn javascript_numbers() {
        assert_eq!(js_parse_float("  12.5abc"), 12.5);
        assert_eq!(js_parse_float(".5"), 0.5);
        assert_eq!(js_parse_float("-Infinityx"), f64::NEG_INFINITY);
        assert_eq!(js_parse_float("1e3"), 1000.0);
        assert_eq!(js_parse_float("1e"), 1.0);
        assert_eq!(js_parse_float("5."), 5.0);
        assert!(js_parse_float(".").is_nan());
        assert!(js_parse_float("abc").is_nan());
        assert_eq!(js_parse_int("0x1A"), 26.0);
        assert_eq!(js_parse_int(" 42px"), 42.0);
        assert_eq!(js_parse_int("-7.9"), -7.0);
        assert!(js_parse_int("x").is_nan());
        assert!(js_parse_int("0x").is_nan());
        assert_eq!(
            slugify("  Silk & Satin__Set -- Deluxe! "),
            "silk-satin-set-deluxe"
        );
    }
}
