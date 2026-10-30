//! Timestamps serialized the way the Node API emits them (mysql2 returns `Date`,
//! which JSON-encodes as millisecond-precision UTC): `2026-10-30T00:23:32.000Z`.
//! Use with `#[serde(serialize_with = "common::timestamp::optional")]`.

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serializer;

pub fn format(ts: &DateTime<Utc>) -> String {
    ts.to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn required<S: Serializer>(ts: &DateTime<Utc>, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&format(ts))
}

pub fn optional<S: Serializer>(ts: &Option<DateTime<Utc>>, s: S) -> Result<S::Ok, S::Error> {
    match ts {
        Some(ts) => s.serialize_str(&format(ts)),
        None => s.serialize_none(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn millisecond_utc_like_javascript_dates() {
        let ts = Utc.with_ymd_and_hms(2026, 10, 30, 0, 23, 32).unwrap();
        assert_eq!(format(&ts), "2026-10-30T00:23:32.000Z");
    }
}
