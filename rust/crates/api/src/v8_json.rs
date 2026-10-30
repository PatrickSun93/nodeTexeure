//! `JSON.parse` as V8 (Node 22) runs it, where its exact result or error
//! message reaches a client: stripe-node's `constructEvent` (the webhook
//! answers `Webhook Error: <message>`), its response parsing, and
//! body-parser's `express.json()` errors ([`crate::express::json_syntax_message`]).
//!
//! * Any JSON value at the top level (not only objects), whitespace is
//!   `' '`, `\t`, `\n`, `\r`.
//! * Numbers are doubles, as in JavaScript (`1e400` overflows; it becomes
//!   `null`, which is also what `JSON.stringify(Infinity)` writes).
//! * Duplicate keys: the last value wins.
//! * Strings are UTF-16 in V8; a lone surrogate (`"\uD800"`) has no Rust
//!   representation and becomes U+FFFD.
//! * Error messages are V8's, positions in UTF-16 units with `(line L column
//!   C)` (`\r\n` counts once), the source shown for an unexpected token the way
//!   [`crate::express::unexpected_token`] does, and the special sources
//!   (`[object Object]`, `undefined`, `NaN`, `Infinity`) as
//!   `"…" is not valid JSON`.
//! * Nesting is limited to [`MAX_DEPTH`] (V8 has no limit of its own; past it
//!   this answers `Maximum call stack size exceeded`).

use serde_json::{Map, Value};

/// Deepest nesting parsed before giving up.
pub const MAX_DEPTH: usize = 512;

/// `JSON.parse(text)`: the value, or V8's `SyntaxError` message.
pub fn parse(text: &str) -> Result<Value, String> {
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut p = Parser {
        text,
        units: &units,
        pos: 0,
        depth: 0,
    };
    p.skip_ws();
    let value = p.value()?;
    p.skip_ws();
    if p.pos < units.len() {
        return Err(p.located(
            p.pos,
            "Unexpected non-whitespace character after JSON at position",
        ));
    }
    Ok(value)
}

struct Parser<'a> {
    text: &'a str,
    units: &'a [u16],
    pos: usize,
    depth: usize,
}

fn is_ws(u: u16) -> bool {
    matches!(u, 0x20 | 0x09 | 0x0a | 0x0d)
}

fn is_digit(u: Option<u16>) -> bool {
    matches!(u, Some(0x30..=0x39))
}

impl Parser<'_> {
    fn peek(&self) -> Option<u16> {
        self.units.get(self.pos).copied()
    }

    fn skip_ws(&mut self) {
        while self.peek().is_some_and(is_ws) {
            self.pos += 1;
        }
    }

    /// `<message> in JSON at position P (line L column C)`.
    fn at(&self, pos: usize, message: &str) -> String {
        self.located(pos, &format!("{message} in JSON at position"))
    }

    /// `<prefix> P (line L column C)`.
    fn located(&self, pos: usize, prefix: &str) -> String {
        let (mut line, mut start) = (1, 0);
        let mut i = 0;
        while i < pos.min(self.units.len()) {
            match self.units[i] {
                0x0d if self.units.get(i + 1) == Some(&0x0a) && i + 1 < pos => {
                    line += 1;
                    i += 2;
                    start = i;
                    continue;
                }
                0x0a | 0x0d => {
                    line += 1;
                    start = i + 1;
                }
                _ => {}
            }
            i += 1;
        }
        format!("{prefix} {pos} (line {line} column {})", pos - start + 1)
    }

    /// V8's ReportUnexpectedToken for the character at `pos` (no specific
    /// message): by the token that character starts.
    fn unexpected(&self, pos: usize) -> String {
        match self.units.get(pos) {
            None => "Unexpected end of JSON input".into(),
            Some(&u) if u == u16::from(b'"') => self.at(pos, "Unexpected string"),
            Some(&u) if u == u16::from(b'-') || (0x30..=0x39).contains(&u) => {
                self.at(pos, "Unexpected number")
            }
            Some(_) => {
                if matches!(
                    self.text,
                    "[object Object]" | "undefined" | "NaN" | "Infinity"
                ) {
                    format!("\"{}\" is not valid JSON", self.text)
                } else {
                    crate::express::unexpected_token(self.text, pos)
                }
            }
        }
    }

    fn value(&mut self) -> Result<Value, String> {
        match self.peek() {
            None => Err(self.unexpected(self.pos)),
            Some(0x22) => self.string().map(Value::String),
            Some(0x7b) => self.nested(Self::object),
            Some(0x5b) => self.nested(Self::array),
            Some(u) if u == 0x2d || (0x30..=0x39).contains(&u) => self.number(),
            Some(0x74) => self.literal("true", Value::Bool(true)),
            Some(0x66) => self.literal("false", Value::Bool(false)),
            Some(0x6e) => self.literal("null", Value::Null),
            Some(_) => Err(self.unexpected(self.pos)),
        }
    }

    fn nested(&mut self, f: fn(&mut Self) -> Result<Value, String>) -> Result<Value, String> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return Err("Maximum call stack size exceeded".into());
        }
        let v = f(self);
        self.depth -= 1;
        v
    }

    fn literal(&mut self, word: &str, value: Value) -> Result<Value, String> {
        // The first character matched already.
        for expected in word.bytes().skip(1) {
            self.pos += 1;
            match self.peek() {
                None => return Err("Unexpected end of JSON input".into()),
                Some(u) if u == u16::from(expected) => {}
                Some(_) => return Err(self.unexpected(self.pos)),
            }
        }
        self.pos += 1;
        Ok(value)
    }

    fn digits(&mut self) {
        while is_digit(self.peek()) {
            self.pos += 1;
        }
    }

    fn number(&mut self) -> Result<Value, String> {
        let start = self.pos;
        if self.peek() == Some(0x2d) {
            self.pos += 1;
        }
        match self.peek() {
            Some(0x30) => {
                self.pos += 1;
                if is_digit(self.peek()) {
                    return Err(self.at(self.pos, "Unexpected number"));
                }
            }
            u if is_digit(u) => self.digits(),
            _ => return Err(self.at(self.pos, "No number after minus sign")),
        }
        if self.peek() == Some(0x2e) {
            self.pos += 1;
            if !is_digit(self.peek()) {
                return Err(self.at(self.pos, "Unterminated fractional number"));
            }
            self.digits();
        }
        if matches!(self.peek(), Some(0x65 | 0x45)) {
            self.pos += 1;
            if matches!(self.peek(), Some(0x2b | 0x2d)) {
                self.pos += 1;
            }
            if !is_digit(self.peek()) {
                return Err(self.at(self.pos, "Exponent part is missing a number"));
            }
            self.digits();
        }
        let literal = String::from_utf16_lossy(&self.units[start..self.pos]);
        let f: f64 = literal.parse().unwrap_or(f64::NAN);
        Ok(common::json::js_number(f))
    }

    fn hex4(&mut self) -> Result<u16, String> {
        let mut code = 0u16;
        for _ in 0..4 {
            let digit = self
                .peek()
                .and_then(|u| char::from_u32(u32::from(u)))
                .and_then(|c| c.to_digit(16));
            let Some(d) = digit else {
                return Err(self.at(self.pos, "Bad Unicode escape"));
            };
            code = code * 16 + d as u16;
            self.pos += 1;
        }
        Ok(code)
    }

    fn string(&mut self) -> Result<String, String> {
        self.pos += 1; // the opening quote
        let mut out: Vec<u16> = Vec::new();
        loop {
            let Some(u) = self.peek() else {
                return Err(self.at(self.pos, "Unterminated string"));
            };
            match u {
                0x22 => {
                    self.pos += 1;
                    return Ok(String::from_utf16_lossy(&out));
                }
                0x5c => {
                    self.pos += 1;
                    let Some(e) = self.peek() else {
                        return Err("Unexpected end of JSON input".into());
                    };
                    let decoded = match e {
                        0x22 => 0x22,
                        0x5c => 0x5c,
                        0x2f => 0x2f,
                        0x62 => 0x08,
                        0x66 => 0x0c,
                        0x6e => 0x0a,
                        0x72 => 0x0d,
                        0x74 => 0x09,
                        0x75 => {
                            self.pos += 1;
                            out.push(self.hex4()?);
                            continue;
                        }
                        _ => return Err(self.at(self.pos, "Bad escaped character")),
                    };
                    out.push(decoded);
                    self.pos += 1;
                }
                u if u < 0x20 => {
                    return Err(self.at(self.pos, "Bad control character in string literal"));
                }
                u => {
                    out.push(u);
                    self.pos += 1;
                }
            }
        }
    }

    fn object(&mut self) -> Result<Value, String> {
        self.pos += 1;
        self.skip_ws();
        let mut map = Map::new();
        if self.peek() == Some(0x7d) {
            self.pos += 1;
            return Ok(Value::Object(map));
        }
        let mut first = true;
        loop {
            if self.peek() != Some(0x22) {
                let message = if first {
                    "Expected property name or '}'"
                } else {
                    "Expected double-quoted property name"
                };
                return Err(self.at(self.pos, message));
            }
            first = false;
            let key = self.string()?;
            self.skip_ws();
            if self.peek() != Some(0x3a) {
                return Err(self.at(self.pos, "Expected ':' after property name"));
            }
            self.pos += 1;
            self.skip_ws();
            let value = self.value()?;
            map.insert(key, value);
            self.skip_ws();
            match self.peek() {
                Some(0x2c) => {
                    self.pos += 1;
                    self.skip_ws();
                }
                Some(0x7d) => {
                    self.pos += 1;
                    return Ok(Value::Object(map));
                }
                _ => return Err(self.at(self.pos, "Expected ',' or '}' after property value")),
            }
        }
    }

    fn array(&mut self) -> Result<Value, String> {
        self.pos += 1;
        self.skip_ws();
        let mut items = Vec::new();
        if self.peek() == Some(0x5d) {
            self.pos += 1;
            return Ok(Value::Array(items));
        }
        loop {
            items.push(self.value()?);
            self.skip_ws();
            match self.peek() {
                Some(0x2c) => {
                    self.pos += 1;
                    self.skip_ws();
                }
                Some(0x5d) => {
                    self.pos += 1;
                    return Ok(Value::Array(items));
                }
                _ => return Err(self.at(self.pos, "Expected ',' or ']' after array element")),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn values() {
        assert_eq!(
            parse(" {\"a\":[1,2.5,-0,1e2,true,false,null,\"x\\u00e9\\n\"]} ").unwrap(),
            json!({ "a": [1, 2.5, 0, 100, true, false, null, "xé\n"] })
        );
        assert_eq!(parse("{\"a\":1,\"a\":2}").unwrap(), json!({ "a": 2 }));
        assert_eq!(parse("\"\\uD83D\\uDE00\"").unwrap(), json!("😀"));
        assert_eq!(parse("\"\\uD800\"").unwrap(), json!("\u{fffd}"));
        assert_eq!(parse("1e400").unwrap(), Value::Null);
        assert_eq!(
            parse("12345678901234567890").unwrap(),
            json!(12345678901234567000.0)
        );
        assert_eq!(parse("42").unwrap(), json!(42));
    }

    /// Recorded from Node 22 (`node -e 'JSON.parse(...)'`).
    #[test]
    fn v8_messages() {
        for (input, message) in [
            (
                "\"\\u12",
                "Bad Unicode escape in JSON at position 5 (line 1 column 6)",
            ),
            ("\"abc\\", "Unexpected end of JSON input"),
            (
                "\"\\x\"",
                "Bad escaped character in JSON at position 2 (line 1 column 3)",
            ),
            (
                "{",
                "Expected property name or '}' in JSON at position 1 (line 1 column 2)",
            ),
            (
                "{\"a\":1,",
                "Expected double-quoted property name in JSON at position 7 (line 1 column 8)",
            ),
            (
                "{\"a\"",
                "Expected ':' after property name in JSON at position 4 (line 1 column 5)",
            ),
            ("{\"a\":", "Unexpected end of JSON input"),
            (
                "[1",
                "Expected ',' or ']' after array element in JSON at position 2 (line 1 column 3)",
            ),
            ("[1,", "Unexpected end of JSON input"),
            (
                "{ ",
                "Expected property name or '}' in JSON at position 2 (line 1 column 3)",
            ),
            (
                "{\"a\":1 ,}",
                "Expected double-quoted property name in JSON at position 8 (line 1 column 9)",
            ),
            (
                "tr1e",
                "Unexpected number in JSON at position 2 (line 1 column 3)",
            ),
            ("trux", "Unexpected token 'x', \"trux\" is not valid JSON"),
            ("fals", "Unexpected end of JSON input"),
            (
                "[1]  x",
                "Unexpected non-whitespace character after JSON at position 5 (line 1 column 6)",
            ),
            (
                "\"a\nb\"",
                "Bad control character in string literal in JSON at position 2 (line 1 column 3)",
            ),
            (
                "{\"a\":1}\r\n\r\n x",
                "Unexpected non-whitespace character after JSON at position 12 (line 3 column 2)",
            ),
            (
                "\n\n  x",
                "Unexpected token 'x', \"\n\n  x\" is not valid JSON",
            ),
            (
                "1e+",
                "Exponent part is missing a number in JSON at position 3 (line 1 column 4)",
            ),
            (
                "1E5x",
                "Unexpected non-whitespace character after JSON at position 3 (line 1 column 4)",
            ),
            (
                "-01",
                "Unexpected number in JSON at position 2 (line 1 column 3)",
            ),
            (
                "- 1",
                "No number after minus sign in JSON at position 1 (line 1 column 2)",
            ),
            ("[,1]", "Unexpected token ',', \"[,1]\" is not valid JSON"),
            (
                "{,}",
                "Expected property name or '}' in JSON at position 1 (line 1 column 2)",
            ),
            (
                "\u{a0} 1",
                "Unexpected token '\u{a0}', \"\u{a0} 1\" is not valid JSON",
            ),
            (
                "[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15 x]",
                "Expected ',' or ']' after array element in JSON at position 37 (line 1 column 38)",
            ),
            ("undefined", "\"undefined\" is not valid JSON"),
            ("NaN", "\"NaN\" is not valid JSON"),
            (
                "-Infinity",
                "No number after minus sign in JSON at position 1 (line 1 column 2)",
            ),
            (
                "{\"a\":[1,2}",
                "Expected ',' or ']' after array element in JSON at position 9 (line 1 column 10)",
            ),
            (
                "\"\t\"",
                "Bad control character in string literal in JSON at position 1 (line 1 column 2)",
            ),
        ] {
            assert_eq!(parse(input).unwrap_err(), message, "{input:?}");
        }
    }

    #[test]
    fn deep_nesting_does_not_overflow() {
        let deep = "[".repeat(200_000);
        assert_eq!(
            parse(&deep).unwrap_err(),
            "Maximum call stack size exceeded"
        );
    }
}
