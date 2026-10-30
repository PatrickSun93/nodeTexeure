//! JavaScript `Date` the way Node (V8) computes it: time values in
//! milliseconds (`NaN` = Invalid Date), local-time getters/setters, the
//! `Date(y, m, d)` constructor, `new Date(string)` (V8's date parser: the ES
//! date-time format, then its legacy fallback), `toISOString`/`toJSON`, and
//! the bytes mysql2 sends for a `Date` parameter.
//!
//! Local time is the process's time zone ([`LocalZone`]: `TZ`, else
//! /etc/localtime), as for Node. A local time that falls in a DST gap uses the
//! offset from before the transition and an ambiguous one the earlier instant
//! (ICU's `UCAL_TZ_LOCAL_FORMER`, which V8 uses).
//!
//! The parser and the arithmetic are checked against values recorded from
//! Node (backend/scripts/gen-js-date-fixtures.js → fixtures/js_date.json).

use chrono::{DateTime, LocalResult, Offset, TimeZone};

pub const MS_PER_DAY: f64 = 86_400_000.0;
/// ±8.64e15 ms: the range of a valid time value.
pub const MAX_TIME: f64 = 8.64e15;

/// A time zone's offset from UTC, in milliseconds.
pub trait Zone {
    /// The offset in effect at UTC time `t`.
    fn offset_at_utc(&self, t: f64) -> f64;
    /// The offset to subtract from local time `local` to get UTC.
    fn offset_for_local(&self, local: f64) -> f64;
}

/// The process's local time zone (chrono's `Local`).
#[derive(Debug, Clone, Copy, Default)]
pub struct LocalZone;

/// A fixed offset (tests; `FixedZone(0.0)` is UTC).
#[derive(Debug, Clone, Copy)]
pub struct FixedZone(pub f64);

impl Zone for FixedZone {
    fn offset_at_utc(&self, _t: f64) -> f64 {
        self.0
    }
    fn offset_for_local(&self, _local: f64) -> f64 {
        self.0
    }
}

/// chrono's range is narrower than JavaScript's: clamp into it (only the
/// zone's far-past / far-future rule matters out there).
fn chrono_ms(t: f64) -> i64 {
    const LIMIT: f64 = 8.2e15;
    t.clamp(-LIMIT, LIMIT) as i64
}

impl Zone for LocalZone {
    fn offset_at_utc(&self, t: f64) -> f64 {
        if !t.is_finite() {
            return 0.0;
        }
        let Some(at) = DateTime::from_timestamp_millis(chrono_ms(t)) else {
            return 0.0;
        };
        let offset = chrono::Local.offset_from_utc_datetime(&at.naive_utc());
        f64::from(offset.fix().local_minus_utc()) * 1000.0
    }

    fn offset_for_local(&self, local: f64) -> f64 {
        if !local.is_finite() {
            return 0.0;
        }
        let Some(at) = DateTime::from_timestamp_millis(chrono_ms(local)) else {
            return 0.0;
        };
        let secs = |o: chrono::FixedOffset| f64::from(o.local_minus_utc()) * 1000.0;
        match chrono::Local.offset_from_local_datetime(&at.naive_utc()) {
            LocalResult::Single(o) => secs(o.fix()),
            // Twice on the clock: the earlier instant, i.e. the larger offset.
            LocalResult::Ambiguous(a, b) => secs(a.fix()).max(secs(b.fix())),
            // Skipped by the clock: the offset from before the transition.
            LocalResult::None => self.offset_at_utc(local - MS_PER_DAY),
        }
    }
}

// ---------------------------------------------------------------------------
// The spec's date arithmetic (ECMA-262 §21.4.1)
// ---------------------------------------------------------------------------

/// Days since 1970-01-01 of a proleptic Gregorian date (month 1–12).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// `(year, month 1–12, day)` of a day number.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// `MakeDay(year, month, date)` (month 0-based, any integer).
pub fn make_day(year: f64, month: f64, date: f64) -> f64 {
    if !year.is_finite() || !month.is_finite() || !date.is_finite() {
        return f64::NAN;
    }
    let (y, m, dt) = (year.trunc(), month.trunc(), date.trunc());
    // V8's guard against overflow; anything this far out is past TimeClip.
    if y.abs() > 1_000_000.0 || m.abs() > 10_000_000.0 {
        return f64::NAN;
    }
    let ym = y + (m / 12.0).floor();
    let mn = m.rem_euclid(12.0);
    days_from_civil(ym as i64, mn as i64 + 1, 1) as f64 + dt - 1.0
}

/// `MakeTime(hour, min, sec, ms)`.
pub fn make_time(h: f64, m: f64, s: f64, ms: f64) -> f64 {
    if !(h.is_finite() && m.is_finite() && s.is_finite() && ms.is_finite()) {
        return f64::NAN;
    }
    h.trunc() * 3_600_000.0 + m.trunc() * 60_000.0 + s.trunc() * 1000.0 + ms.trunc()
}

/// `MakeDate(day, time)`.
pub fn make_date(day: f64, time: f64) -> f64 {
    let t = day * MS_PER_DAY + time;
    if t.is_finite() { t } else { f64::NAN }
}

/// `TimeClip(t)`.
pub fn time_clip(t: f64) -> f64 {
    if !t.is_finite() || t.abs() > MAX_TIME {
        f64::NAN
    } else {
        t.trunc() + 0.0
    }
}

/// `UTC(t)` for a local time value.
pub fn utc(local: f64, zone: &impl Zone) -> f64 {
    // V8 refuses local times more than a month past the range.
    if !local.is_finite() || local.abs() > MAX_TIME + 30.0 * MS_PER_DAY {
        return f64::NAN;
    }
    local - zone.offset_for_local(local)
}

/// `LocalTime(t)`.
pub fn local_time(t: f64, zone: &impl Zone) -> f64 {
    t + zone.offset_at_utc(t)
}

/// The calendar fields of a time value (as `getUTC*` would read them).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Fields {
    pub year: f64,
    /// 0-based.
    pub month: f64,
    pub date: f64,
    pub hours: f64,
    pub minutes: f64,
    pub seconds: f64,
    pub ms: f64,
    /// 0 = Sunday.
    pub weekday: f64,
}

/// `TimeWithinDay(t)`.
fn time_within_day(t: f64) -> f64 {
    t.rem_euclid(MS_PER_DAY)
}

/// The fields of `t` read without any zone (`None` for NaN).
pub fn fields(t: f64) -> Option<Fields> {
    if !t.is_finite() {
        return None;
    }
    let day = (t / MS_PER_DAY).floor();
    let (y, m, d) = civil_from_days(day as i64);
    let within = time_within_day(t);
    Some(Fields {
        year: y as f64,
        month: (m - 1) as f64,
        date: d as f64,
        hours: (within / 3_600_000.0).floor(),
        minutes: (within / 60_000.0).floor() % 60.0,
        seconds: (within / 1000.0).floor() % 60.0,
        ms: within % 1000.0,
        weekday: (day + 4.0).rem_euclid(7.0),
    })
}

/// A `Date`: its time value (`NaN` is Invalid Date).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct JsDate(pub f64);

impl JsDate {
    /// `new Date()`.
    pub fn now() -> Self {
        JsDate(chrono::Utc::now().timestamp_millis() as f64)
    }

    /// `new Date(ms)`.
    pub fn from_ms(t: f64) -> Self {
        JsDate(time_clip(t))
    }

    /// `new Date(string)`.
    pub fn parse(s: &str, zone: &impl Zone) -> Self {
        JsDate(time_clip(parse(s, zone)))
    }

    /// `new Date(year, month, date)`: local midnight.
    pub fn local(year: f64, month: f64, date: f64, zone: &impl Zone) -> Self {
        // Years 0–99 mean 1900–1999.
        let year = if year.is_finite() && (0.0..=99.0).contains(&year.trunc()) {
            1900.0 + year.trunc()
        } else {
            year
        };
        let local = make_date(make_day(year, month, date), make_time(0.0, 0.0, 0.0, 0.0));
        JsDate(time_clip(utc(local, zone)))
    }

    pub fn time(self) -> f64 {
        self.0
    }

    pub fn is_valid(self) -> bool {
        !self.0.is_nan()
    }

    /// The local-time fields (`getFullYear()`, `getMonth()`, …), `None` for an
    /// Invalid Date.
    pub fn local_fields(self, zone: &impl Zone) -> Option<Fields> {
        if self.0.is_nan() {
            return None;
        }
        fields(local_time(self.0, zone))
    }

    /// `setHours(h, m, s, ms)`.
    pub fn set_hours(&mut self, h: f64, m: f64, s: f64, ms: f64, zone: &impl Zone) -> f64 {
        if self.0.is_nan() {
            return f64::NAN;
        }
        let t = local_time(self.0, zone);
        let date = make_date((t / MS_PER_DAY).floor(), make_time(h, m, s, ms));
        self.0 = time_clip(utc(date, zone));
        self.0
    }

    /// `setDate(date)`.
    pub fn set_date(&mut self, date: f64, zone: &impl Zone) -> f64 {
        let Some(f) = self.local_fields(zone) else {
            return f64::NAN;
        };
        let t = local_time(self.0, zone);
        let new = make_date(make_day(f.year, f.month, date), time_within_day(t));
        self.0 = time_clip(utc(new, zone));
        self.0
    }

    /// `setMonth(month)`.
    pub fn set_month(&mut self, month: f64, zone: &impl Zone) -> f64 {
        let Some(f) = self.local_fields(zone) else {
            return f64::NAN;
        };
        let t = local_time(self.0, zone);
        let new = make_date(make_day(f.year, month, f.date), time_within_day(t));
        self.0 = time_clip(utc(new, zone));
        self.0
    }

    /// `setFullYear(year)` (an Invalid Date counts as +0).
    pub fn set_full_year(&mut self, year: f64, zone: &impl Zone) -> f64 {
        let t = if self.0.is_nan() {
            0.0
        } else {
            local_time(self.0, zone)
        };
        let f = fields(t).expect("finite");
        let new = make_date(make_day(year, f.month, f.date), time_within_day(t));
        self.0 = time_clip(utc(new, zone));
        self.0
    }

    /// `toISOString()` (`None` where it throws, for an Invalid Date).
    pub fn to_iso(self) -> Option<String> {
        let f = fields(self.0)?;
        let year = f.year as i64;
        let y = if (0..=9999).contains(&year) {
            format!("{year:04}")
        } else {
            format!("{}{:06}", if year < 0 { '-' } else { '+' }, year.abs())
        };
        Some(format!(
            "{y}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
            f.month as i64 + 1,
            f.date as i64,
            f.hours as i64,
            f.minutes as i64,
            f.seconds as i64,
            f.ms as i64
        ))
    }

    /// `JSON.stringify(date)`: the ISO string, `null` for an Invalid Date.
    pub fn to_json(self) -> serde_json::Value {
        self.to_iso()
            .map_or(serde_json::Value::Null, serde_json::Value::String)
    }

    /// The 12 bytes mysql2's `writeDate(d, '+00:00')` puts in an `execute`
    /// packet for this Date (a DATETIME: length 11, then the UTC fields).
    /// An Invalid Date is all zeros (Buffer writes of NaN store 0). `None`
    /// is the RangeError `writeUInt16LE` throws for a year outside 0–65535,
    /// which makes the query fail.
    pub fn mysql_param(self) -> Option<[u8; 12]> {
        let mut out = [0u8; 12];
        out[0] = 11;
        let Some(f) = fields(self.0) else {
            return Some(out);
        };
        if !(0.0..=65535.0).contains(&f.year) {
            return None;
        }
        out[1..3].copy_from_slice(&(f.year as u16).to_le_bytes());
        out[3] = f.month as u8 + 1;
        out[4] = f.date as u8;
        out[5] = f.hours as u8;
        out[6] = f.minutes as u8;
        out[7] = f.seconds as u8;
        out[8..12].copy_from_slice(&((f.ms as u32) * 1000).to_le_bytes());
        Some(out)
    }
}

// ---------------------------------------------------------------------------
// new Date(string): V8's DateParser
// ---------------------------------------------------------------------------

const NONE: i32 = i32::MAX;
const MAX_SIGNIFICANT_DIGITS: usize = 9;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kw {
    Invalid,
    MonthName,
    TimeZoneName,
    TimeSeparator,
    AmPm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Token {
    Invalid,
    Unknown,
    WhiteSpace,
    Number { value: i32, len: usize },
    Symbol(u16),
    End,
    Keyword { kind: Kw, value: i32, len: usize },
}

impl Token {
    fn is_number(self) -> bool {
        matches!(self, Token::Number { .. })
    }
    fn number(self) -> i32 {
        match self {
            Token::Number { value, .. } => value,
            _ => 0,
        }
    }
    fn is_fixed_number(self, n: usize) -> bool {
        matches!(self, Token::Number { len, .. } if len == n)
    }
    fn is_symbol(self, c: char) -> bool {
        self == Token::Symbol(c as u16)
    }
    fn is_sign(self) -> bool {
        self.is_symbol('+') || self.is_symbol('-')
    }
    fn sign(self) -> i32 {
        if self.is_symbol('-') { -1 } else { 1 }
    }
    fn is_keyword_type(self, k: Kw) -> bool {
        matches!(self, Token::Keyword { kind, .. } if kind == k)
    }
    fn is_keyword_z(self) -> bool {
        matches!(
            self,
            Token::Keyword {
                kind: Kw::TimeZoneName,
                value: 0,
                len: 1
            }
        )
    }
}

const KEYWORDS: &[(&[u8; 3], Kw, i32)] = &[
    (b"jan", Kw::MonthName, 1),
    (b"feb", Kw::MonthName, 2),
    (b"mar", Kw::MonthName, 3),
    (b"apr", Kw::MonthName, 4),
    (b"may", Kw::MonthName, 5),
    (b"jun", Kw::MonthName, 6),
    (b"jul", Kw::MonthName, 7),
    (b"aug", Kw::MonthName, 8),
    (b"sep", Kw::MonthName, 9),
    (b"oct", Kw::MonthName, 10),
    (b"nov", Kw::MonthName, 11),
    (b"dec", Kw::MonthName, 12),
    (b"am\0", Kw::AmPm, 0),
    (b"pm\0", Kw::AmPm, 12),
    (b"ut\0", Kw::TimeZoneName, 0),
    (b"utc", Kw::TimeZoneName, 0),
    (b"z\0\0", Kw::TimeZoneName, 0),
    (b"gmt", Kw::TimeZoneName, 0),
    (b"cdt", Kw::TimeZoneName, -5),
    (b"cst", Kw::TimeZoneName, -6),
    (b"edt", Kw::TimeZoneName, -4),
    (b"est", Kw::TimeZoneName, -5),
    (b"mdt", Kw::TimeZoneName, -6),
    (b"mst", Kw::TimeZoneName, -7),
    (b"pdt", Kw::TimeZoneName, -7),
    (b"pst", Kw::TimeZoneName, -8),
    (b"t\0\0", Kw::TimeSeparator, 0),
];

fn lookup(prefix: [u16; 3], len: usize) -> (Kw, i32) {
    for (word, kind, value) in KEYWORDS {
        let matches = prefix
            .iter()
            .zip(word.iter())
            .all(|(a, b)| *a == u16::from(*b));
        // A word longer than its keyword only counts for month names.
        if matches && (len <= 3 || *kind == Kw::MonthName) {
            return (*kind, *value);
        }
    }
    (Kw::Invalid, 0)
}

/// `IsWhiteSpace` (no line terminators).
fn is_white_space(c: u16) -> bool {
    matches!(
        c,
        0x09 | 0x0B | 0x0C | 0x20 | 0xA0 | 0xFEFF | 0x1680 | 0x2000
            ..=0x200A | 0x202F | 0x205F | 0x3000
    )
}

fn is_line_terminator(c: u16) -> bool {
    matches!(c, 0x0A | 0x0D | 0x2028 | 0x2029)
}

struct Reader {
    s: Vec<u16>,
    index: usize,
    ch: u16,
}

impl Reader {
    fn new(s: &str) -> Self {
        let mut r = Reader {
            s: s.encode_utf16().collect(),
            index: 0,
            ch: 0,
        };
        r.next();
        r
    }
    fn next(&mut self) {
        self.ch = self.s.get(self.index).copied().unwrap_or(0);
        self.index += 1;
    }
    fn position(&self) -> usize {
        self.index
    }
    fn is_end(&self) -> bool {
        self.ch == 0
    }
    fn is_digit(&self) -> bool {
        (b'0' as u16..=b'9' as u16).contains(&self.ch)
    }
    fn skip(&mut self, c: char) -> bool {
        if self.ch == c as u16 {
            self.next();
            true
        } else {
            false
        }
    }
    fn read_unsigned_numeral(&mut self) -> i32 {
        let mut n = 0i32;
        let mut i = 0;
        while self.ch == b'0' as u16 {
            self.next();
        }
        while self.is_digit() {
            if i < MAX_SIGNIFICANT_DIGITS {
                n = n * 10 + i32::from(self.ch - b'0' as u16);
            }
            i += 1;
            self.next();
        }
        n
    }
    fn is_word_char(&self) -> bool {
        self.ch >= b'A' as u16 && !is_white_space(self.ch)
    }
    fn read_word(&mut self) -> ([u16; 3], usize) {
        let mut prefix = [0u16; 3];
        let mut len = 0;
        while self.is_word_char() {
            if len < 3 {
                prefix[len] = self.ch | 0x20;
            }
            len += 1;
            self.next();
        }
        (prefix, len)
    }
    fn skip_white_space(&mut self) -> bool {
        if is_white_space(self.ch) || is_line_terminator(self.ch) {
            self.next();
            true
        } else {
            false
        }
    }
    fn skip_parentheses(&mut self) -> bool {
        if self.ch != b'(' as u16 {
            return false;
        }
        let mut balance = 0;
        loop {
            if self.ch == b')' as u16 {
                balance -= 1;
            } else if self.ch == b'(' as u16 {
                balance += 1;
            }
            self.next();
            if !(balance > 0 && self.ch != 0) {
                break;
            }
        }
        true
    }
}

struct Scanner {
    reader: Reader,
    next: Token,
}

impl Scanner {
    fn new(s: &str) -> Self {
        let mut reader = Reader::new(s);
        let next = Self::scan(&mut reader);
        Scanner { reader, next }
    }

    fn scan(r: &mut Reader) -> Token {
        let pre = r.position();
        if r.is_end() {
            return Token::End;
        }
        if r.is_digit() {
            let value = r.read_unsigned_numeral();
            return Token::Number {
                value,
                len: r.position() - pre,
            };
        }
        for c in [':', '-', '+', '.', ')'] {
            if r.skip(c) {
                return Token::Symbol(c as u16);
            }
        }
        if r.is_word_char() {
            let (prefix, len) = r.read_word();
            let (kind, value) = lookup(prefix, len);
            return Token::Keyword { kind, value, len };
        }
        if r.skip_white_space() {
            return Token::WhiteSpace;
        }
        if r.skip_parentheses() {
            return Token::Unknown;
        }
        r.next();
        Token::Unknown
    }

    fn next(&mut self) -> Token {
        let t = self.next;
        self.next = Self::scan(&mut self.reader);
        t
    }
    fn peek(&self) -> Token {
        self.next
    }
    fn skip_symbol(&mut self, c: char) -> bool {
        if self.next.is_symbol(c) {
            self.next();
            true
        } else {
            false
        }
    }
}

fn between(x: i32, lo: i32, hi: i32) -> bool {
    lo <= x && x <= hi
}
fn is_month(x: i32) -> bool {
    between(x, 1, 12)
}
fn is_day(x: i32) -> bool {
    between(x, 1, 31)
}
fn is_hour(x: i32) -> bool {
    between(x, 0, 23)
}
fn is_minute(x: i32) -> bool {
    between(x, 0, 59)
}
fn is_hour12(x: i32) -> bool {
    between(x, 0, 12)
}
fn is_millisecond(x: i32) -> bool {
    between(x, 0, 999)
}

#[derive(Default)]
struct Day {
    comp: [i32; 3],
    index: usize,
    named_month: Option<i32>,
    iso: bool,
}

impl Day {
    fn is_empty(&self) -> bool {
        self.index == 0
    }
    fn add(&mut self, n: i32) -> bool {
        if self.index < 3 {
            self.comp[self.index] = n;
            self.index += 1;
            true
        } else {
            false
        }
    }
    /// `(year, month 0-based, day)`.
    fn write(&mut self) -> Option<(i32, i32, i32)> {
        if self.index < 1 {
            return None;
        }
        while self.index < 3 {
            self.comp[self.index] = 1;
            self.index += 1;
        }
        let c = self.comp;
        let (mut year, month, day);
        match self.named_month {
            None => {
                if self.iso || !is_day(c[0]) {
                    (year, month, day) = (c[0], c[1], c[2]);
                } else {
                    (month, day, year) = (c[0], c[1], c[2]);
                }
            }
            Some(m) => {
                month = m;
                if !is_day(c[0]) {
                    (year, day) = (c[0], c[1]);
                } else {
                    (day, year) = (c[0], c[1]);
                }
            }
        }
        if !self.iso {
            if between(year, 0, 49) {
                year += 2000;
            } else if between(year, 50, 99) {
                year += 1900;
            }
        }
        if !is_month(month) || !is_day(day) {
            return None;
        }
        Some((year, month - 1, day))
    }
}

struct Time {
    comp: [i32; 4],
    index: usize,
    hour_offset: i32,
}

impl Default for Time {
    fn default() -> Self {
        Time {
            comp: [0; 4],
            index: 0,
            hour_offset: NONE,
        }
    }
}

impl Time {
    fn is_empty(&self) -> bool {
        self.index == 0
    }
    fn is_expecting(&self, n: i32) -> bool {
        (self.index == 1 && is_minute(n))
            || (self.index == 2 && is_minute(n))
            || (self.index == 3 && is_millisecond(n))
    }
    fn add(&mut self, n: i32) -> bool {
        if self.index < 4 {
            self.comp[self.index] = n;
            self.index += 1;
            true
        } else {
            false
        }
    }
    fn add_final(&mut self, n: i32) -> bool {
        if !self.add(n) {
            return false;
        }
        while self.index < 4 {
            self.comp[self.index] = 0;
            self.index += 1;
        }
        true
    }
    fn write(&mut self) -> Option<[i32; 4]> {
        while self.index < 4 {
            self.comp[self.index] = 0;
            self.index += 1;
        }
        let [mut hour, minute, second, ms] = self.comp;
        if self.hour_offset != NONE {
            if !is_hour12(hour) {
                return None;
            }
            hour %= 12;
            hour += self.hour_offset;
        }
        if (!is_hour(hour) || !is_minute(minute) || !is_minute(second) || !is_millisecond(ms))
            && (hour != 24 || minute != 0 || second != 0 || ms != 0)
        {
            return None;
        }
        Some([hour, minute, second, ms])
    }
}

struct Tz {
    sign: i32,
    hour: i32,
    minute: i32,
}

impl Default for Tz {
    fn default() -> Self {
        Tz {
            sign: NONE,
            hour: NONE,
            minute: NONE,
        }
    }
}

impl Tz {
    fn set(&mut self, offset_hours: i32) {
        self.sign = if offset_hours < 0 { -1 } else { 1 };
        self.hour = offset_hours * self.sign;
        self.minute = 0;
    }
    fn set_sign(&mut self, sign: i32) {
        self.sign = if sign < 0 { -1 } else { 1 };
    }
    fn is_expecting(&self, n: i32) -> bool {
        self.hour != NONE && self.minute == NONE && is_minute(n)
    }
    fn is_utc(&self) -> bool {
        self.hour == 0 && self.minute == 0
    }
    fn is_empty(&self) -> bool {
        self.hour == NONE
    }
    /// The offset in seconds; `Some(None)` is local time.
    fn write(&mut self) -> Option<Option<i64>> {
        if self.sign == NONE {
            return Some(None);
        }
        if self.hour == NONE {
            self.hour = 0;
        }
        if self.minute == NONE {
            self.minute = 0;
        }
        // Unsigned 32-bit arithmetic, capped at a Smi, as V8 does it.
        let total = (self.hour as u32)
            .wrapping_mul(3600)
            .wrapping_add((self.minute as u32).wrapping_mul(60));
        if total > (1 << 30) - 1 {
            return None;
        }
        let total = i64::from(total);
        Some(Some(if self.sign < 0 { -total } else { total }))
    }
}

/// `ReadMilliseconds`: the first three significant digits of the numeral.
fn read_milliseconds(token: Token) -> i32 {
    let Token::Number { value, len } = token else {
        return 0;
    };
    let mut number = value;
    let mut length = len;
    if length == 1 {
        number *= 100;
    } else if length == 2 {
        number *= 10;
    } else if length > 3 {
        if length > MAX_SIGNIFICANT_DIGITS {
            length = MAX_SIGNIFICANT_DIGITS;
        }
        let mut factor = 1;
        while length > 3 {
            factor *= 10;
            length -= 1;
        }
        number /= factor;
    }
    number
}

/// `ParseES5DateTime`: as far as the string follows the ES format; the token
/// it stopped at goes on to the legacy parser.
fn parse_es5(s: &mut Scanner, day: &mut Day, time: &mut Time, tz: &mut Tz) -> Token {
    if s.peek().is_sign() {
        let sign_token = s.next();
        if !s.peek().is_fixed_number(6) {
            return sign_token;
        }
        let sign = sign_token.sign();
        let year = s.next().number();
        if sign < 0 && year == 0 {
            return sign_token;
        }
        day.add(sign * year);
    } else if s.peek().is_fixed_number(4) {
        let y = s.next().number();
        day.add(y);
    } else {
        return s.next();
    }
    if s.skip_symbol('-') {
        if !s.peek().is_fixed_number(2) || !is_month(s.peek().number()) {
            return s.next();
        }
        let m = s.next().number();
        day.add(m);
        if s.skip_symbol('-') {
            if !s.peek().is_fixed_number(2) || !is_day(s.peek().number()) {
                return s.next();
            }
            let d = s.next().number();
            day.add(d);
        }
    }
    if !s.peek().is_keyword_type(Kw::TimeSeparator) {
        if s.peek() != Token::End {
            return s.next();
        }
    } else {
        s.next();
        if !s.peek().is_fixed_number(2) || !between(s.peek().number(), 0, 24) {
            return Token::Invalid;
        }
        let hour_is_24 = s.peek().number() == 24;
        let h = s.next().number();
        time.add(h);
        if !s.skip_symbol(':') {
            return Token::Invalid;
        }
        if !s.peek().is_fixed_number(2)
            || !is_minute(s.peek().number())
            || (hour_is_24 && s.peek().number() > 0)
        {
            return Token::Invalid;
        }
        let m = s.next().number();
        time.add(m);
        if s.skip_symbol(':') {
            if !s.peek().is_fixed_number(2)
                || !is_minute(s.peek().number())
                || (hour_is_24 && s.peek().number() > 0)
            {
                return Token::Invalid;
            }
            let sec = s.next().number();
            time.add(sec);
            if s.skip_symbol('.') {
                if !s.peek().is_number() || (hour_is_24 && s.peek().number() > 0) {
                    return Token::Invalid;
                }
                let ms = read_milliseconds(s.next());
                time.add(ms);
            }
        }
        if s.peek().is_keyword_z() {
            s.next();
            tz.set(0);
        } else if s.peek().is_sign() {
            let sign = s.next().sign();
            tz.set_sign(sign);
            if s.peek().is_fixed_number(4) {
                let hourmin = s.next().number();
                let (hour, min) = (hourmin / 100, hourmin % 100);
                if !is_hour(hour) || !is_minute(min) {
                    return Token::Invalid;
                }
                tz.hour = hour;
                tz.minute = min;
            } else {
                if !s.peek().is_fixed_number(2) || !is_hour(s.peek().number()) {
                    return Token::Invalid;
                }
                tz.hour = s.next().number();
                if !s.skip_symbol(':') {
                    return Token::Invalid;
                }
                if !s.peek().is_fixed_number(2) || !is_minute(s.peek().number()) {
                    return Token::Invalid;
                }
                tz.minute = s.next().number();
            }
        }
        if s.peek() != Token::End {
            return Token::Invalid;
        }
    }
    // Date-only forms are UTC; date-time forms without an offset are local.
    if tz.is_empty() && time.is_empty() {
        tz.set(0);
    }
    day.iso = true;
    Token::End
}

/// `Date.parse(s)` as a time value before TimeClip (`NaN` when V8 rejects it).
pub fn parse(input: &str, zone: &impl Zone) -> f64 {
    let mut s = Scanner::new(input);
    let mut day = Day::default();
    let mut time = Time::default();
    let mut tz = Tz::default();
    let first = parse_es5(&mut s, &mut day, &mut time, &mut tz);
    if first == Token::Invalid {
        return f64::NAN;
    }
    let mut has_read_number = !day.is_empty();
    let mut token = first;
    while token != Token::End {
        match token {
            Token::Number { value: n, .. } => {
                has_read_number = true;
                if s.skip_symbol(':') {
                    if s.skip_symbol(':') {
                        if !time.is_empty() {
                            return f64::NAN;
                        }
                        time.add(n);
                        time.add(0);
                    } else {
                        if !time.add(n) {
                            return f64::NAN;
                        }
                        if s.peek().is_symbol('.') {
                            s.next();
                        }
                    }
                } else if s.skip_symbol('.') && time.is_expecting(n) {
                    time.add(n);
                    if !s.peek().is_number() {
                        return f64::NAN;
                    }
                    let ms = read_milliseconds(s.next());
                    if ms < 0 {
                        return f64::NAN;
                    }
                    time.add_final(ms);
                } else if tz.is_expecting(n) {
                    tz.minute = n;
                } else if time.is_expecting(n) {
                    time.add_final(n);
                    let peek = s.peek();
                    if peek != Token::End
                        && peek != Token::WhiteSpace
                        && !peek.is_keyword_z()
                        && !peek.is_sign()
                    {
                        return f64::NAN;
                    }
                } else {
                    if !day.add(n) {
                        return f64::NAN;
                    }
                    s.skip_symbol('-');
                }
            }
            Token::Keyword { kind, value, .. } => {
                if kind == Kw::AmPm && !time.is_empty() {
                    time.hour_offset = value;
                } else if kind == Kw::MonthName {
                    day.named_month = Some(value);
                    s.skip_symbol('-');
                } else if kind == Kw::TimeZoneName && has_read_number {
                    tz.set(value);
                } else {
                    // Garbage words are illegal once a number has been read,
                    // and must be separated from the first number.
                    if has_read_number || s.peek().is_number() {
                        return f64::NAN;
                    }
                }
            }
            t if t.is_sign() && (tz.is_utc() || !time.is_empty()) => {
                tz.set_sign(t.sign());
                let (mut n, mut length) = (0, 0);
                if s.peek().is_number() {
                    if let Token::Number { value, len } = s.next() {
                        n = value;
                        length = len;
                    }
                }
                has_read_number = true;
                if s.peek().is_symbol(':') {
                    tz.hour = n;
                    tz.minute = NONE;
                } else if length == 1 || length == 2 {
                    tz.hour = n;
                    tz.minute = 0;
                } else if length == 3 || length == 4 {
                    tz.hour = n / 100;
                    tz.minute = n % 100;
                } else {
                    return f64::NAN;
                }
            }
            t if (t.is_sign() || t.is_symbol(')')) && has_read_number => return f64::NAN,
            _ => {}
        }
        token = s.next();
    }

    let Some((year, month, date)) = day.write() else {
        return f64::NAN;
    };
    let Some([h, m, sec, ms]) = time.write() else {
        return f64::NAN;
    };
    let Some(offset) = tz.write() else {
        return f64::NAN;
    };
    let date = make_date(
        make_day(f64::from(year), f64::from(month), f64::from(date)),
        make_time(f64::from(h), f64::from(m), f64::from(sec), f64::from(ms)),
    );
    match offset {
        None => utc(date, zone),
        Some(seconds) => {
            let t = date - seconds as f64 * 1000.0;
            if t.abs() > MAX_TIME { f64::NAN } else { t }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn ms(v: &Value) -> f64 {
        v.as_f64().unwrap_or(f64::NAN)
    }

    fn same(got: f64, want: &Value, what: &str) {
        let want = ms(want);
        assert!(
            (got.is_nan() && want.is_nan()) || got == want,
            "{what}: got {got}, Node gave {want}"
        );
    }

    /// Recorded from Node in UTC and in UTC-07:00
    /// (backend/scripts/gen-js-date-fixtures.js).
    #[test]
    fn matches_node() {
        let fixtures: Value =
            serde_json::from_str(include_str!("../fixtures/js_date.json")).unwrap();
        let strings = fixtures["strings"].as_array().unwrap();
        for (name, z) in fixtures["zones"].as_object().unwrap() {
            let zone = FixedZone(z["offset_ms"].as_f64().unwrap());
            for (s, want) in strings.iter().zip(z["parse"].as_array().unwrap()) {
                let s = s.as_str().unwrap();
                same(
                    JsDate::parse(s, &zone).0,
                    want,
                    &format!("{name} parse {s:?}"),
                );
            }
            for case in z["times"].as_array().unwrap() {
                let d = JsDate(ms(&case["t"]));
                let what = |op: &str| format!("{name} {op} of {:?}", case["t"]);
                assert_eq!(d.to_json(), case["iso"], "{}", what("toISOString"));
                let f = d.local_fields(&zone).map(|f| {
                    vec![
                        f.year, f.month, f.date, f.hours, f.minutes, f.seconds, f.ms, f.weekday,
                    ]
                });
                let want: Option<Vec<f64>> = case["fields"]
                    .as_array()
                    .map(|a| a.iter().map(|v| v.as_f64().unwrap()).collect());
                assert_eq!(f, want, "{}", what("fields"));
                let run = |f: &dyn Fn(&mut JsDate) -> f64| {
                    let mut x = d;
                    f(&mut x)
                };
                let local = |x: &JsDate| x.local_fields(&zone);
                same(
                    run(&|x| x.set_hours(0.0, 0.0, 0.0, 0.0, &zone)),
                    &case["startOfDay"],
                    &what("setHours(0)"),
                );
                same(
                    run(&|x| x.set_hours(23.0, 59.0, 59.0, 999.0, &zone)),
                    &case["endOfDay"],
                    &what("setHours(23:59)"),
                );
                for (k, key) in [
                    (1.0, "minus1Day"),
                    (7.0, "minus7Days"),
                    (30.0, "minus30Days"),
                ] {
                    same(
                        run(&|x| {
                            let date = local(x).map_or(f64::NAN, |f| f.date);
                            x.set_date(date - k, &zone)
                        }),
                        &case[key],
                        &what(key),
                    );
                }
                same(
                    run(&|x| {
                        let m = local(x).map_or(f64::NAN, |f| f.month);
                        x.set_month(m - 1.0, &zone)
                    }),
                    &case["minus1Month"],
                    &what("setMonth"),
                );
                same(
                    run(&|x| {
                        let y = local(x).map_or(f64::NAN, |f| f.year);
                        x.set_full_year(y - 1.0, &zone)
                    }),
                    &case["minus1Year"],
                    &what("setFullYear"),
                );
                for (n, want) in [1.0, 12.0, 24.0]
                    .iter()
                    .zip(case["firstOfMonth"].as_array().unwrap())
                {
                    let (y, m) = local(&d).map_or((f64::NAN, f64::NAN), |f| (f.year, f.month));
                    same(
                        JsDate::local(y, m - (n - 1.0), 1.0, &zone).0,
                        want,
                        &what(&format!("new Date(y, m - {}, 1)", n - 1.0)),
                    );
                }
            }
        }
    }

    #[test]
    fn mysql2_date_params() {
        let d = JsDate(1_793_456_789_123.0); // 2026-10-31T14:26:29.123Z
        let p = d.mysql_param().unwrap();
        assert_eq!(p[0], 11);
        assert_eq!(u16::from_le_bytes([p[1], p[2]]), 2026);
        assert_eq!(&p[3..8], &[10, 31, 14, 26, 29]);
        assert_eq!(u32::from_le_bytes([p[8], p[9], p[10], p[11]]), 123_000);
        assert_eq!(
            JsDate(f64::NAN).mysql_param(),
            Some([11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
        );
        let far = JsDate::parse("+070000-01-01", &FixedZone(0.0));
        assert_eq!(far.mysql_param(), None);
        let before_zero = JsDate::parse("-000001-01-01", &FixedZone(0.0));
        assert_eq!(before_zero.mysql_param(), None);
        assert!(
            JsDate::parse("+010000-01-01", &FixedZone(0.0))
                .mysql_param()
                .is_some()
        );
    }
}
