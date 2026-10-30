//! Rows as mysql2 hands them to Node (`connection.execute`, binary protocol,
//! with backend/utils/database.js's options: `supportBigNumbers: true`,
//! `bigNumberStrings: true`, `dateStrings: false`, `timezone: '+00:00'`), for
//! the routes that work with whatever a dynamic query selects: `SELECT *`
//! admin lists, CSV exports ([`crate::csv`]), analytics, the dev-only raw
//! `SELECT` endpoint.
//!
//! | column | JS value ([`Js`]) | `res.json` |
//! |---|---|---|
//! | TINYINT (incl. `TINYINT(1)`), SMALLINT, MEDIUMINT, INT, YEAR | number | number |
//! | BIGINT (also `COUNT(*)`, `1 + 1`) | **string** (`bigNumberStrings`) | string |
//! | DECIMAL (also `SUM()` of ints, `AVG()`, `1 / 3`) | **string** | string |
//! | FLOAT / DOUBLE | number (FLOAT as its float32 value, `0.10000000149011612`) | number |
//! | DATE / DATETIME / TIMESTAMP | `Date` (read as UTC, ms precision); zero date → Invalid Date | ISO string / `null` |
//! | TIME | `"HH:MM:SS[.ffffff]"` (hours past 24, negatives) | string |
//! | JSON | parsed (whole doubles as integers; unsafe integers as strings) | as parsed |
//! | CHAR / VARCHAR / TEXT / ENUM / SET | string | string |
//! | BINARY / VARBINARY / BLOB / BIT / GEOMETRY | Buffer | `{ "type": "Buffer", "data": [...] }` |
//! | NULL | `null` | `null` |
//!
//! Rows keep the column order (and the last value of a repeated name), so
//! `Object.keys(row)` — which CSV exports use — comes out the same.
//!
//! Timestamps: mysql2 doesn't set a session time zone, so TIMESTAMP values
//! and `NOW()` come in the server's zone and are then read as UTC; sqlx sets
//! `time_zone = '+00:00'`. The two agree when the MySQL server runs in UTC
//! (the Docker image does).
//!
//! `_bin`-collated text columns carry MySQL's BINARY flag, and sqlx exposes no
//! charset, so it calls them VARBINARY: [`fetch_rows`] reads the names of such
//! columns from `information_schema` once and decodes a binary-flagged column
//! of that name as text (email_unsubscribes.email today).
//!
//! Parameters: [`bind`] binds JSON values the way mysql2's `execute` sends
//! them (numbers as DOUBLE, booleans as TINY, arrays/objects as JSON text,
//! `null` as NULL).

use std::collections::HashSet;
use std::sync::OnceLock;

use chrono::{NaiveDate, NaiveDateTime};
use serde_json::{Map, Value};
use sqlx::mysql::{MySql, MySqlArguments, MySqlPool, MySqlRow};
use sqlx::query::Query;
use sqlx::{Column, Row, TypeInfo, ValueRef};

use crate::express_router::js_json;

/// A value of a mysql2 row, as the JavaScript type Node sees.
#[derive(Debug, Clone, PartialEq)]
pub enum Js {
    Null,
    Number(f64),
    String(String),
    /// A `Date`; `None` is an Invalid Date (a zero date).
    Date(Option<NaiveDateTime>),
    Buffer(Vec<u8>),
    /// A parsed JSON column.
    Json(Value),
}

impl Js {
    /// The value in `res.json`.
    pub fn to_json(&self) -> Value {
        match self {
            Js::Null => Value::Null,
            Js::Number(n) => common::json::js_number(*n),
            Js::String(s) => Value::String(s.clone()),
            Js::Date(Some(d)) => Value::String(iso(d)),
            Js::Date(None) => Value::Null,
            Js::Buffer(b) => buffer_json(b),
            Js::Json(v) => v.clone(),
        }
    }

    /// JavaScript truthiness (a Date and a Buffer are objects: truthy).
    pub fn truthy(&self) -> bool {
        match self {
            Js::Null => false,
            Js::Number(n) => *n != 0.0 && !n.is_nan(),
            Js::String(s) => !s.is_empty(),
            Js::Date(_) | Js::Buffer(_) => true,
            Js::Json(v) => crate::body::truthy(Some(v)),
        }
    }

    /// `String(value)`.
    pub fn js_string(&self) -> String {
        match self {
            Js::Null => "null".into(),
            Js::Number(n) => common::json::js_number_string(*n),
            Js::String(s) => s.clone(),
            Js::Date(Some(d)) => d
                .format("%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)")
                .to_string(),
            Js::Date(None) => "Invalid Date".into(),
            Js::Buffer(b) => String::from_utf8_lossy(b).into_owned(),
            Js::Json(v) => crate::body::js_string(v),
        }
    }

    /// The value `res.json` would have produced, read back (a JSON value of
    /// a route's own making).
    pub fn from_json(v: &Value) -> Js {
        match v {
            Value::Null => Js::Null,
            Value::Number(n) => Js::Number(n.as_f64().unwrap_or(f64::NAN)),
            Value::String(s) => Js::String(s.clone()),
            other => Js::Json(other.clone()),
        }
    }
}

/// A row: `(column, value)` in column order.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct JsRow(pub Vec<(String, Js)>);

impl JsRow {
    /// `row[name]` (`None` is `undefined`).
    pub fn get(&self, name: &str) -> Option<&Js> {
        self.0.iter().find(|(k, _)| k == name).map(|(_, v)| v)
    }

    /// `row[name] = value`: a repeated name keeps its first position.
    pub fn set(&mut self, name: &str, value: Js) {
        match self.0.iter_mut().find(|(k, _)| k == name) {
            Some(slot) => slot.1 = value,
            None => self.0.push((name.to_owned(), value)),
        }
    }

    /// The row in `res.json`.
    pub fn to_json(&self) -> Map<String, Value> {
        self.0
            .iter()
            .map(|(k, v)| (k.clone(), v.to_json()))
            .collect()
    }

    /// `Object.keys(row)` (integer-like keys first, as in JavaScript).
    pub fn keys(&self) -> Vec<String> {
        crate::csv::js_key_order(&self.0.iter().map(|(k, _)| k.clone()).collect::<Vec<_>>())
    }
}

/// How a column is read, from sqlx's type name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    I8,
    U8,
    I16,
    U16,
    I32,
    U32,
    /// BIGINT [UNSIGNED]: a decimal string.
    I64String,
    U64String,
    Float,
    Double,
    /// DECIMAL: the text MySQL sends.
    Decimal,
    Date,
    Time,
    Json,
    Text,
    /// Binary-flagged: binary data, or `_bin`-collated text.
    Binary,
    Buffer,
}

/// The kind for a sqlx type name (`MySqlTypeInfo::name`).
pub fn column_kind(name: &str) -> Kind {
    match name {
        // sqlx calls TINYINT(1) "BOOLEAN"; mysql2 reads it as a number.
        "BOOLEAN" | "TINYINT" => Kind::I8,
        "TINYINT UNSIGNED" => Kind::U8,
        "SMALLINT" => Kind::I16,
        "SMALLINT UNSIGNED" | "YEAR" => Kind::U16,
        "INT" | "MEDIUMINT" => Kind::I32,
        "INT UNSIGNED" | "MEDIUMINT UNSIGNED" => Kind::U32,
        "BIGINT" => Kind::I64String,
        "BIGINT UNSIGNED" => Kind::U64String,
        "FLOAT" => Kind::Float,
        "DOUBLE" => Kind::Double,
        "DECIMAL" => Kind::Decimal,
        "DATE" | "DATETIME" | "TIMESTAMP" => Kind::Date,
        "TIME" => Kind::Time,
        "JSON" => Kind::Json,
        "BINARY" | "VARBINARY" | "TINYBLOB" | "BLOB" | "MEDIUMBLOB" | "LONGBLOB" => Kind::Binary,
        "BIT" | "GEOMETRY" => Kind::Buffer,
        _ => Kind::Text,
    }
}

/// `{ type: 'Buffer', data: [...] }` (Buffer#toJSON).
pub fn buffer_json(bytes: &[u8]) -> Value {
    let mut m = Map::new();
    m.insert("type".into(), Value::String("Buffer".into()));
    m.insert(
        "data".into(),
        Value::Array(bytes.iter().map(|b| Value::from(*b)).collect()),
    );
    Value::Object(m)
}

/// A DATE/DATETIME/TIMESTAMP value in the binary protocol (length byte
/// first) as mysql2's `readDateTime('+00:00')`.
pub fn read_date(raw: &[u8]) -> Option<NaiveDateTime> {
    let len = raw.first().copied().unwrap_or(0) as usize;
    let b = raw.get(1..).unwrap_or(&[]);
    let at = |i: usize| b.get(i).copied().unwrap_or(0);
    if len < 4 {
        // readDateTimeString gives ZERO_DATE → Invalid Date.
        return None;
    }
    let year = u16::from_le_bytes([at(0), at(1)]);
    let (month, day) = (at(2), at(3));
    let (h, m, s) = if len > 6 {
        (at(4), at(5), at(6))
    } else {
        (0, 0, 0)
    };
    let micros = if len > 10 {
        u32::from_le_bytes([at(7), at(8), at(9), at(10)])
    } else {
        0
    };
    // `new Date('YYYY-MM-DDTHH:MM:SS.ffffff+00:00')` keeps milliseconds.
    NaiveDate::from_ymd_opt(i32::from(year), u32::from(month), u32::from(day))?.and_hms_micro_opt(
        u32::from(h),
        u32::from(m),
        u32::from(s),
        micros / 1000 * 1000,
    )
}

/// `Date#toJSON`.
pub fn iso(dt: &NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// A TIME value as mysql2's `readTimeString()`.
pub fn read_time(raw: &[u8]) -> String {
    let len = raw.first().copied().unwrap_or(0) as usize;
    if len == 0 {
        return "00:00:00".into();
    }
    let b = raw.get(1..).unwrap_or(&[]);
    let at = |i: usize| b.get(i).copied().unwrap_or(0);
    let negative = at(0) != 0;
    let (mut d, mut h, mut m, mut s, mut us) = (0u32, 0u32, 0u32, 0u32, 0u32);
    if len > 6 {
        d = u32::from_le_bytes([at(1), at(2), at(3), at(4)]);
        h = u32::from(at(5));
        m = u32::from(at(6));
        s = u32::from(at(7));
    }
    if len > 10 {
        us = u32::from_le_bytes([at(8), at(9), at(10), at(11)]);
    }
    let mut out = format!(
        "{}{:02}:{:02}:{:02}",
        if negative { "-" } else { "" },
        u64::from(d) * 24 + u64::from(h),
        m,
        s
    );
    if us != 0 {
        let frac = format!(".{us:06}");
        out.push_str(frac.trim_end_matches('0'));
    }
    out
}

/// A JSON column: `JSON.parse` (with mysql2's big-number reviver).
pub fn json_column(text: &str) -> Value {
    match serde_json::from_str::<Value>(text) {
        Ok(v) => unsafe_ints_to_strings(js_json(v)),
        // MySQL only sends valid JSON.
        Err(_) => Value::String(text.to_owned()),
    }
}

/// The reviver: an integer literal outside ±(2^53 − 1) stays an exact string.
fn unsafe_ints_to_strings(v: Value) -> Value {
    const MAX_SAFE: u64 = 9_007_199_254_740_991;
    match v {
        Value::Number(n) => {
            if let Some(u) = n.as_u64().filter(|u| *u > MAX_SAFE) {
                Value::String(u.to_string())
            } else if let Some(i) = n.as_i64().filter(|i| i.unsigned_abs() > MAX_SAFE) {
                Value::String(i.to_string())
            } else {
                Value::Number(n)
            }
        }
        Value::Array(items) => {
            Value::Array(items.into_iter().map(unsafe_ints_to_strings).collect())
        }
        Value::Object(m) => Value::Object(
            m.into_iter()
                .map(|(k, v)| (k, unsafe_ints_to_strings(v)))
                .collect(),
        ),
        other => other,
    }
}

/// Column names of `_bin`-collated text columns in the current schema.
#[derive(Debug, Clone, Default)]
pub struct Schema {
    bin_text: HashSet<String>,
}

impl Schema {
    /// Reads `information_schema` (text columns with a `_bin` collation).
    pub async fn load(pool: &MySqlPool) -> Result<Self, sqlx::Error> {
        let names: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT CAST(COLUMN_NAME AS CHAR(64)) FROM information_schema.COLUMNS \
             WHERE TABLE_SCHEMA = DATABASE() AND COLLATION_NAME LIKE '%\\_bin'",
        )
        .fetch_all(pool)
        .await?;
        Ok(Self {
            bin_text: names.into_iter().collect(),
        })
    }

    /// Loaded once per process (the schema is migrated before start).
    pub async fn cached(pool: &MySqlPool) -> Result<&'static Schema, sqlx::Error> {
        static SCHEMA: OnceLock<Schema> = OnceLock::new();
        if let Some(s) = SCHEMA.get() {
            return Ok(s);
        }
        let loaded = Self::load(pool).await?;
        Ok(SCHEMA.get_or_init(|| loaded))
    }

    /// No `_bin` text columns (every binary-flagged column is binary).
    pub fn none() -> Self {
        Self::default()
    }

    /// Pretends `names` are `_bin` text columns (tests).
    pub fn with_bin_text(names: &[&str]) -> Self {
        Self {
            bin_text: names.iter().map(|s| (*s).to_owned()).collect(),
        }
    }

    fn value(&self, row: &MySqlRow, i: usize) -> Result<Js, sqlx::Error> {
        let raw = row.try_get_raw(i)?;
        if raw.is_null() {
            return Ok(Js::Null);
        }
        let kind = column_kind(raw.type_info().name());
        let bytes: &[u8] = row.try_get_unchecked::<&[u8], _>(i)?;
        let fixed = |n: usize| -> [u8; 8] {
            let mut out = [0u8; 8];
            let n = n.min(bytes.len());
            out[..n].copy_from_slice(&bytes[..n]);
            out
        };
        let le2 = |b: [u8; 8]| [b[0], b[1]];
        let le4 = |b: [u8; 8]| [b[0], b[1], b[2], b[3]];
        let text = || String::from_utf8_lossy(bytes).into_owned();
        Ok(match kind {
            Kind::I8 => Js::Number(f64::from(fixed(1)[0] as i8)),
            Kind::U8 => Js::Number(f64::from(fixed(1)[0])),
            Kind::I16 => Js::Number(f64::from(i16::from_le_bytes(le2(fixed(2))))),
            Kind::U16 => Js::Number(f64::from(u16::from_le_bytes(le2(fixed(2))))),
            Kind::I32 => Js::Number(f64::from(i32::from_le_bytes(le4(fixed(4))))),
            Kind::U32 => Js::Number(f64::from(u32::from_le_bytes(le4(fixed(4))))),
            Kind::I64String => Js::String(i64::from_le_bytes(fixed(8)).to_string()),
            Kind::U64String => Js::String(u64::from_le_bytes(fixed(8)).to_string()),
            Kind::Float => Js::Number(f64::from(f32::from_le_bytes(le4(fixed(4))))),
            Kind::Double => Js::Number(f64::from_le_bytes(fixed(8))),
            Kind::Decimal | Kind::Text => Js::String(text()),
            Kind::Date => Js::Date(read_date(bytes)),
            Kind::Time => Js::String(read_time(bytes)),
            Kind::Json => Js::from_json(&json_column(&text())),
            Kind::Binary if self.bin_text.contains(row.columns()[i].name()) => Js::String(text()),
            Kind::Binary | Kind::Buffer => Js::Buffer(bytes.to_vec()),
        })
    }

    /// A row as the object mysql2 builds.
    pub fn row(&self, row: &MySqlRow) -> Result<JsRow, sqlx::Error> {
        let mut out = JsRow::default();
        for (i, column) in row.columns().iter().enumerate() {
            out.set(column.name(), self.value(row, i)?);
        }
        Ok(out)
    }

    pub fn rows(&self, rows: &[MySqlRow]) -> Result<Vec<JsRow>, sqlx::Error> {
        rows.iter().map(|r| self.row(r)).collect()
    }
}

/// Binds one value the way mysql2's `execute` encodes it.
pub fn bind<'q>(
    query: Query<'q, MySql, MySqlArguments>,
    value: &Value,
) -> Query<'q, MySql, MySqlArguments> {
    match value {
        Value::Null => query.bind(None::<String>),
        Value::Bool(b) => query.bind(i8::from(*b)),
        Value::Number(n) => query.bind(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => query.bind(s.clone()),
        other => query.bind(other.to_string()),
    }
}

/// `DatabaseUtil.executeQuery(sql, params)` for a read, as typed rows. The
/// SQL is dynamic (no compile-time check): use it only where Node's query is
/// dynamic too (`SELECT *`, built filters, the raw-query endpoint).
pub async fn fetch_rows(
    pool: &MySqlPool,
    sql: &str,
    params: &[Value],
) -> Result<Vec<JsRow>, sqlx::Error> {
    let schema = Schema::cached(pool).await?;
    let mut query = sqlx::query(sql);
    for p in params {
        query = bind(query, p);
    }
    let rows = query.fetch_all(pool).await?;
    schema.rows(&rows)
}

/// The same, as `res.json` writes the rows.
pub async fn fetch(
    pool: &MySqlPool,
    sql: &str,
    params: &[Value],
) -> Result<Vec<Map<String, Value>>, sqlx::Error> {
    Ok(fetch_rows(pool, sql, params)
        .await?
        .iter()
        .map(JsRow::to_json)
        .collect())
}

/// MySQL's own message for an error (`err.message` in mysql2).
pub fn error_message(err: &sqlx::Error) -> String {
    match err {
        sqlx::Error::Database(db) => db.message().to_owned(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn date(raw: &[u8]) -> Value {
        Js::Date(read_date(raw)).to_json()
    }

    #[test]
    fn dates_like_mysql2() {
        // 2024-02-29 13:05:09.123456
        let mut raw = vec![11u8];
        raw.extend(2024u16.to_le_bytes());
        raw.extend([2, 29, 13, 5, 9]);
        raw.extend(123_456u32.to_le_bytes());
        assert_eq!(date(&raw), json!("2024-02-29T13:05:09.123Z"));
        let mut d = vec![4u8];
        d.extend(1999u16.to_le_bytes());
        d.extend([12, 31]);
        assert_eq!(date(&d), json!("1999-12-31T00:00:00.000Z"));
        assert_eq!(date(&[0]), Value::Null);
    }

    #[test]
    fn times_like_mysql2() {
        assert_eq!(read_time(&[0]), "00:00:00");
        let mut t = vec![12u8, 1];
        t.extend(1u32.to_le_bytes());
        t.extend([2, 3, 4]);
        t.extend(500_000u32.to_le_bytes());
        assert_eq!(read_time(&t), "-26:03:04.5");
    }

    #[test]
    fn json_columns() {
        assert_eq!(
            json_column(r#"{"a": 1.0, "b": 12345678901234567890, "c": [9007199254740993]}"#),
            json!({ "a": 1, "b": "12345678901234567890", "c": ["9007199254740993"] })
        );
    }

    /// Recorded from mysql2 against the same table
    /// (backend/scripts/gen-foundation-fixtures.js).
    #[tokio::test]
    #[ignore = "needs DATABASE_URL (MySQL)"]
    async fn rows_match_mysql2() {
        let fixtures: Value =
            serde_json::from_str(include_str!("../fixtures/foundation_b.json")).unwrap();
        let mysql = &fixtures["mysql2"];
        let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .unwrap();
        for stmt in mysql["setup"].as_array().unwrap() {
            sqlx::raw_sql(stmt.as_str().unwrap())
                .execute(&pool)
                .await
                .unwrap();
        }
        let schema = Schema::load(&pool).await.unwrap();
        for case in mysql["queries"].as_array().unwrap() {
            let sql = case["sql"].as_str().unwrap();
            let params: Vec<Value> = case["params"].as_array().unwrap().clone();
            let mut query = sqlx::query(sql);
            for p in &params {
                query = bind(query, p);
            }
            let got = match query.fetch_all(&pool).await {
                Ok(rows) => schema.rows(&rows),
                Err(e) => Err(e),
            };
            match (&got, case.get("error")) {
                (Ok(rows), None) => {
                    let rows =
                        Value::Array(rows.iter().map(|r| Value::Object(r.to_json())).collect());
                    assert_eq!(rows, case["rows"], "{sql}");
                }
                (Err(e), Some(message)) => {
                    assert_eq!(error_message(e), message.as_str().unwrap(), "{sql}")
                }
                (got, expected) => {
                    panic!(
                        "{sql}: got {got:?}, Node gave {expected:?} / {}",
                        case["rows"]
                    )
                }
            }
        }
        sqlx::raw_sql(mysql["teardown"].as_str().unwrap())
            .execute(&pool)
            .await
            .unwrap();
    }
}
