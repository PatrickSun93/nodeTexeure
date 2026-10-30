//! `multer` 2.5 (with `busboy` 1.6 underneath) for the routes that take a file
//! upload: `upload.single(field)` with memory or disk storage, `limits`
//! (`fileSize`, busboy's 1 MB `fieldSize`, …) and a `fileFilter`, giving the
//! same `req.file`, `req.body` and errors.
//!
//! ```ignore
//! const CSV: Multer = Multer {
//!     storage: Storage::Memory,
//!     limits: Limits { file_size: Some(5 * 1024 * 1024), ..Limits::NONE },
//!     file_filter: Some(|f| if f.mimetype == "text/csv" || f.originalname.ends_with(".csv") {
//!         Ok(true) } else { Err("Only CSV files are allowed".into()) }),
//! };
//! // In an /api/admin handler (crate::admin::AdminRequest):
//! let file = match req.multer_single(&CSV, "file").await {
//!     Ok(file) => file,
//!     // `next(err)` → the app's error handler (500)
//!     Err(err) => return err.into_response(),
//! };
//! let Some(file) = file else { /* 400 'No file uploaded' */ };
//! // Elsewhere: CSV.single("file", &headers, body).await → Upload { file, body, .. }
//! ```
//!
//! What it reproduces:
//!
//! * **Which requests it parses** — type-is `is(req, ['multipart'])`: a body
//!   (Content-Length or Transfer-Encoding) whose Content-Type media-typer
//!   accepts as `multipart/*`. Anything else passes through untouched
//!   (`req.file` undefined, `req.body` as the JSON parser left it).
//! * **busboy's parser**, byte for byte: the CRLF it writes first (so a body
//!   may start right at `--boundary`), boundary search, the part-header parser
//!   (16 KB, 2000 pairs, folding, `Malformed part header`), Content-Disposition
//!   parameters (`filename*` RFC 5987, latin1 plain `filename` — so a raw UTF-8
//!   name arrives mojibaked exactly as in Node), the basename of the filename,
//!   `application/octet-stream` parts without a filename counted as files,
//!   field charsets, `Unexpected end of form`, and the epilogue ignored.
//! * **multer's rules**: `%0A`/`%0D`/`%22` decoded in names, nameless parts
//!   (`Field name missing`), empty filenames skipped, `single()`'s one slot
//!   (`LIMIT_UNEXPECTED_FILE` for a second file or another field's file),
//!   the filter's error or rejection, `LIMIT_FILE_SIZE` once a file passes
//!   `fileSize` bytes, `LIMIT_FIELD_VALUE` past 1 MB, `req.body` rebuilt from
//!   the fields with append-field (`a[b]`, `a[]`, `a[0]`), first error wins.
//! * **Errors** go to `next(err)`: [`MulterError::into_response`] is the app
//!   error handler's 500 with the message (outside production).
//!
//! Differences: the body is read incrementally but a request that keeps
//! sending after an error is drained only up to [`DRAIN_LIMIT`]; unknown field
//! charsets give an undefined value in Node (busboy's TextDecoder bug) and are
//! dropped here too; a disk-storage file is written when its part ends rather
//! than streamed, and an I/O error's message is Rust's, not Node's `ENOENT: …`.

use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;

use axum::body::{Body, HttpBody};
use axum::http::{HeaderMap, header};
use axum::response::Response;
use base64::Engine;
use serde_json::{Map, Value};

/// After an error, multer drains the rest of the request before answering;
/// past this many bytes we stop reading.
pub const DRAIN_LIMIT: usize = 64 * 1024 * 1024;

/// busboy's default `limits.fieldSize`.
const DEFAULT_FIELD_SIZE: u64 = 1024 * 1024;
const MAX_HEADER_PAIRS: usize = 2000;
const MAX_HEADER_SIZE: usize = 16 * 1024;

/// The file as the fileFilter sees it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileInfo {
    pub fieldname: String,
    pub originalname: String,
    pub encoding: String,
    pub mimetype: String,
}

/// `req.file`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct File {
    pub fieldname: String,
    pub originalname: String,
    pub encoding: String,
    pub mimetype: String,
    pub size: u64,
    /// Memory storage: the contents.
    pub buffer: Option<Vec<u8>>,
    /// Disk storage: where it was written.
    pub destination: Option<PathBuf>,
    pub filename: Option<String>,
    pub path: Option<PathBuf>,
}

/// `fileFilter(req, file, cb)`: `Ok(true)` accepts, `Ok(false)` skips the
/// file, `Err(message)` is `cb(new Error(message))`.
pub type FileFilter = fn(&FileInfo) -> Result<bool, String>;

/// `multer.diskStorage({ destination, filename })`.
#[derive(Clone)]
pub struct DiskStorage {
    pub destination: PathBuf,
    /// Called when the file part starts (as multer's `filename` callback is).
    pub filename: Arc<dyn Fn(&FileInfo) -> String + Send + Sync>,
}

impl std::fmt::Debug for DiskStorage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DiskStorage")
            .field("destination", &self.destination)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone)]
pub enum Storage {
    /// `multer.memoryStorage()`.
    Memory,
    Disk(DiskStorage),
}

/// multer `limits` (all optional; `None` = busboy's default).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub file_size: Option<u64>,
    pub field_size: Option<u64>,
    pub files: Option<u64>,
    pub fields: Option<u64>,
    pub parts: Option<u64>,
    pub field_name_size: Option<usize>,
}

impl Limits {
    pub const NONE: Limits = Limits {
        file_size: None,
        field_size: None,
        files: None,
        fields: None,
        parts: None,
        field_name_size: None,
    };
}

/// `multer({ storage, limits, fileFilter })`.
#[derive(Debug, Clone)]
pub struct Multer {
    pub storage: Storage,
    pub limits: Limits,
    /// `None` accepts every file.
    pub file_filter: Option<FileFilter>,
}

/// What `upload.single(field)` leaves on the request.
#[derive(Debug, Clone, PartialEq)]
pub struct Upload {
    /// Whether multer parsed the request at all (type-is said multipart).
    pub multipart: bool,
    /// `req.file`.
    pub file: Option<File>,
    /// `req.body` after multer: the fields (append-field), or `None` when the
    /// request wasn't multipart (the body parsers' value stays).
    pub body: Option<Value>,
}

/// An error multer passes to `next(err)`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MulterError {
    /// `new MulterError(code, field, filename)`.
    Multer {
        code: &'static str,
        field: Option<String>,
        filename: Option<String>,
    },
    /// Any other error (busboy's, the fileFilter's, storage I/O).
    Other(String),
}

impl MulterError {
    fn code(code: &'static str) -> Self {
        Self::Multer {
            code,
            field: None,
            filename: None,
        }
    }

    /// `err.message`.
    pub fn message(&self) -> String {
        match self {
            Self::Multer { code, .. } => match *code {
                "LIMIT_PART_COUNT" => "Too many parts".into(),
                "LIMIT_FILE_SIZE" => "File too large".into(),
                "LIMIT_FILE_COUNT" => "Too many files".into(),
                "LIMIT_FIELD_KEY" => "Field name too long".into(),
                "LIMIT_FIELD_VALUE" => "Field value too long".into(),
                "LIMIT_FIELD_COUNT" => "Too many fields".into(),
                "LIMIT_UNEXPECTED_FILE" => "Unexpected file field".into(),
                "MISSING_FIELD_NAME" => "Field name missing".into(),
                "LIMIT_FIELD_NESTING" => "Field name nesting too deep".into(),
                "LIMIT_FIELD_ARRAY_INDEX" => "Field name array index too large".into(),
                "STREAM_DESTROYED" => "File stream was destroyed".into(),
                "INVALID_FIELD_NAME" => "Invalid field name".into(),
                other => format!("Unknown error: {other}"),
            },
            Self::Other(message) => message.clone(),
        }
    }

    /// `err.code` of a MulterError.
    pub fn multer_code(&self) -> Option<&'static str> {
        match self {
            Self::Multer { code, .. } => Some(code),
            Self::Other(_) => None,
        }
    }

    /// `next(err)`: the app's error handler (500).
    pub fn into_response(self) -> Response {
        crate::express::internal_error(&self.message())
    }
}

impl std::fmt::Display for MulterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message())
    }
}

impl std::error::Error for MulterError {}

// ---------------------------------------------------------------------------
// type-is / media-typer
// ---------------------------------------------------------------------------

fn is_tchar(b: u8) -> bool {
    matches!(b, b'!' | b'#'..=b'\'' | b'*' | b'+' | b'-' | b'.' | b'0'..=b'9' | b'A'..=b'Z' | b'^'..=b'z' | b'|' | b'~')
}

/// media-typer 0.3 `typeNameRegExp` / `subtypeNameRegExp` body characters.
fn media_name(s: &str, extra: &[u8]) -> bool {
    let b = s.as_bytes();
    !b.is_empty()
        && b.len() <= 127
        && b[0].is_ascii_alphanumeric()
        && b[1..]
            .iter()
            .all(|c| c.is_ascii_alphanumeric() || b"!#$&^_-".contains(c) || extra.contains(c))
}

/// type-is's `tryNormalizeType` (media-typer 0.3 `parse` then `format`
/// without parameters): `type/subtype[+suffix]`, or `None` if it throws.
pub(crate) fn normalize_media_type(value: &str) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    let index = value.find(';');
    let ty = index.map_or(value, |i| &value[..i]);
    // typeRegExp on the lowercased type: optional spaces around it.
    let lower = ty.to_ascii_lowercase();
    let trimmed = lower.trim_matches(' ');
    let (t, sub) = trimmed.split_once('/')?;
    if !media_name(t, b"") || !media_name(sub, b".+") {
        return None;
    }
    // Parameters: `; *token *= *(quoted|token) *`, back to back to the end.
    if let Some(mut i) = index {
        let bytes = value.as_bytes();
        while i < bytes.len() {
            let mut j = i;
            if bytes[j] != b';' {
                return None;
            }
            j += 1;
            while bytes.get(j) == Some(&b' ') {
                j += 1;
            }
            let key_start = j;
            while bytes.get(j).is_some_and(|b| is_tchar(*b)) {
                j += 1;
            }
            if j == key_start {
                return None;
            }
            while bytes.get(j) == Some(&b' ') {
                j += 1;
            }
            if bytes.get(j) != Some(&b'=') {
                return None;
            }
            j += 1;
            while bytes.get(j) == Some(&b' ') {
                j += 1;
            }
            if bytes.get(j) == Some(&b'"') {
                j += 1;
                loop {
                    match bytes.get(j) {
                        None => return None,
                        Some(b'"') => {
                            j += 1;
                            break;
                        }
                        Some(b'\\')
                            if bytes.get(j + 1).is_some_and(|c| (0x20..0x7f).contains(c)) =>
                        {
                            j += 2
                        }
                        Some(&c)
                            if c == b' '
                                || c == b'!'
                                || (0x23..=0x7e).contains(&c) && c != b'\\' =>
                        {
                            j += 1
                        }
                        Some(&c) if c >= 0x80 => j += 1,
                        Some(_) => return None,
                    }
                }
            } else {
                let start = j;
                while bytes.get(j).is_some_and(|b| is_tchar(*b)) {
                    j += 1;
                }
                if j == start {
                    return None;
                }
            }
            while bytes.get(j) == Some(&b' ') {
                j += 1;
            }
            i = j;
        }
    }
    // format(): the suffix after the last '+' must be a type name (if any).
    let (subtype, suffix) = match sub.rfind('+') {
        Some(p) => (&sub[..p], &sub[p + 1..]),
        None => (sub, ""),
    };
    if !media_name(subtype, b".") || (!suffix.is_empty() && !media_name(suffix, b"")) {
        return None;
    }
    Some(if suffix.is_empty() {
        format!("{t}/{subtype}")
    } else {
        format!("{t}/{subtype}+{suffix}")
    })
}

/// A header value as Node gives it (latin1).
fn latin1(bytes: &[u8]) -> String {
    bytes.iter().map(|&b| b as char).collect()
}

/// type-is `typeis.hasBody(req)`.
fn has_body(headers: &HeaderMap) -> bool {
    headers.contains_key(header::TRANSFER_ENCODING)
        || headers
            .get(header::CONTENT_LENGTH)
            .map(|v| latin1(v.as_bytes()))
            .is_some_and(|v| {
                let t = v.trim();
                t.is_empty() || t.parse::<f64>().is_ok()
            })
}

/// `is(req, ['multipart'])`, which decides whether multer runs.
pub fn is_multipart(headers: &HeaderMap) -> bool {
    if !has_body(headers) {
        return false;
    }
    headers
        .get(header::CONTENT_TYPE)
        .map(|v| latin1(v.as_bytes()))
        .and_then(|v| normalize_media_type(&v))
        .is_some_and(|t| t.starts_with("multipart/"))
}

// ---------------------------------------------------------------------------
// busboy utils (lib/utils.js)
// ---------------------------------------------------------------------------

fn token(c: char) -> bool {
    (c as u32) < 128 && is_tchar(c as u8)
}

fn qdtext(c: char) -> bool {
    let c = c as u32;
    c == 9
        || c == 32
        || c == 33
        || (35..=91).contains(&c)
        || (93..=126).contains(&c)
        || (128..=255).contains(&c)
}

fn charset_char(c: char) -> bool {
    let c = c as u32;
    matches!(c, 33 | 35..=38 | 43 | 45 | 48..=57 | 65..=90 | 94..=123 | 125 | 126)
}

fn extended_value(c: char) -> bool {
    let c = c as u32;
    matches!(c, 33 | 35 | 36 | 38 | 43 | 45 | 46 | 48..=57 | 65..=90 | 94..=122 | 124 | 126)
}

fn hex_value(c: Option<char>) -> Option<u32> {
    c.and_then(|c| c.to_digit(16))
}

/// busboy `parseContentType`: `{ type, subtype, params }`, lowercased.
/// Header parameters in order, first occurrence of a name kept.
type Params = Vec<(String, String)>;

fn parse_content_type(s: &str) -> Option<(String, String, Params)> {
    let chars: Vec<char> = s.chars().collect();
    if chars.is_empty() {
        return None;
    }
    let mut i = 0;
    while i < chars.len() {
        if !token(chars[i]) {
            if chars[i] != '/' || i == 0 {
                return None;
            }
            break;
        }
        i += 1;
    }
    if i == chars.len() {
        return None;
    }
    let ty: String = chars[..i].iter().collect::<String>().to_lowercase();
    i += 1;
    let subtype_start = i;
    let mut params = Vec::new();
    while i < chars.len() {
        if !token(chars[i]) {
            if i == subtype_start {
                return None;
            }
            parse_params(&chars, i, &mut params, None)?;
            break;
        }
        i += 1;
    }
    let sub_end = (subtype_start..chars.len())
        .find(|&j| !token(chars[j]))
        .unwrap_or(chars.len());
    if sub_end == subtype_start {
        return None;
    }
    let subtype: String = chars[subtype_start..sub_end]
        .iter()
        .collect::<String>()
        .to_lowercase();
    Some((ty, subtype, params))
}

/// Charset decoders (`getDecoder`), on a latin1 string or bytes.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Decoder {
    Utf8,
    Latin1,
    Utf16le,
    Base64,
    /// `decoders.other`: always `undefined` (busboy binds an arrow function).
    Other,
}

fn get_decoder(charset: &str) -> Decoder {
    let pick = |c: &str| match c {
        "utf-8" | "utf8" => Some(Decoder::Utf8),
        "latin1" | "ascii" | "us-ascii" | "iso-8859-1" | "iso8859-1" | "iso88591"
        | "iso_8859-1" | "windows-1252" | "iso_8859-1:1987" | "cp1252" | "x-cp1252" => {
            Some(Decoder::Latin1)
        }
        "utf16le" | "utf-16le" | "ucs2" | "ucs-2" => Some(Decoder::Utf16le),
        "base64" => Some(Decoder::Base64),
        _ => None,
    };
    pick(charset)
        .or_else(|| pick(&charset.to_lowercase()))
        .unwrap_or(Decoder::Other)
}

/// `decoder(bytes)` for a field value (`hint` 0).
fn decode_bytes(decoder: Decoder, data: &[u8]) -> Option<String> {
    if data.is_empty() {
        return Some(String::new());
    }
    match decoder {
        Decoder::Utf8 => Some(String::from_utf8_lossy(data).into_owned()),
        Decoder::Latin1 => Some(latin1(data)),
        Decoder::Utf16le => {
            let units: Vec<u16> = data
                .chunks_exact(2)
                .map(|p| u16::from_le_bytes([p[0], p[1]]))
                .collect();
            Some(String::from_utf16_lossy(&units))
        }
        Decoder::Base64 => Some(base64::engine::general_purpose::STANDARD.encode(data)),
        Decoder::Other => None,
    }
}

/// `decoder(string, hint)` for a parameter value (a latin1 string).
fn decode_param_string(decoder: Decoder, s: &str, hint: u8) -> Option<String> {
    if s.is_empty() {
        return Some(String::new());
    }
    match decoder {
        Decoder::Utf8 if hint < 2 => Some(s.to_owned()),
        Decoder::Latin1 => Some(s.to_owned()),
        _ => {
            let bytes: Vec<u8> = s.chars().map(|c| c as u32 as u8).collect();
            decode_bytes(decoder, &bytes)
        }
    }
}

/// The parameter list of a Content-Type (`decoder: None`) or a
/// Content-Disposition (`Some(default decoder)`), busboy's parsers. `None` is
/// a malformed header.
fn parse_params(
    chars: &[char],
    mut i: usize,
    params: &mut Params,
    disposition: Option<Decoder>,
) -> Option<()> {
    let len = chars.len();
    let ws = |c: char| c == ' ' || c == '\t';
    while i < len {
        while i < len && ws(chars[i]) {
            i += 1;
        }
        if i == len {
            break;
        }
        if chars[i] != ';' {
            return None;
        }
        i += 1;
        while i < len && ws(chars[i]) {
            i += 1;
        }
        if i == len {
            return None;
        }
        let name_start = i;
        while i < len {
            if !token(chars[i]) {
                if chars[i] == '=' {
                    break;
                }
                return None;
            }
            i += 1;
        }
        if i == len {
            return None;
        }
        let mut name: String = chars[name_start..i].iter().collect();
        let mut value = String::new();
        if disposition.is_some() && name.ends_with('*') {
            // Extended value: charset'lang'%XX…
            i += 1;
            let charset_start = i;
            while i < len {
                if !charset_char(chars[i]) {
                    if chars[i] != '\'' {
                        return None;
                    }
                    break;
                }
                i += 1;
            }
            if i == len {
                return None;
            }
            let charset: String = chars[charset_start..i].iter().collect();
            i += 1;
            while i < len && chars[i] != '\'' {
                i += 1;
            }
            if i == len {
                return None;
            }
            i += 1;
            if i == len {
                return None;
            }
            let mut value_start = i;
            let mut encode = 0u8;
            while i < len {
                if !extended_value(chars[i]) {
                    if chars[i] == '%' {
                        let hi = hex_value(chars.get(i + 1).copied());
                        let lo = hex_value(chars.get(i + 2).copied());
                        if i + 2 < len
                            && let (Some(hi), Some(lo)) = (hi, lo)
                        {
                            let byte = (hi << 4) + lo;
                            value.extend(&chars[value_start..i]);
                            value.push(char::from_u32(byte).unwrap_or('\0'));
                            i += 2;
                            value_start = i + 1;
                            if byte >= 128 {
                                encode = 2;
                            } else if encode == 0 {
                                encode = 1;
                            }
                            i += 1;
                            continue;
                        }
                        return None;
                    }
                    break;
                }
                i += 1;
            }
            value.extend(&chars[value_start..i]);
            value = decode_param_string(get_decoder(&charset), &value, encode)?;
        } else {
            i += 1;
            if i == len {
                return None;
            }
            if chars[i] == '"' {
                i += 1;
                let mut value_start = i;
                let mut escaping = false;
                while i < len {
                    let c = chars[i];
                    if c == '\\' {
                        if escaping {
                            value_start = i;
                            escaping = false;
                        } else {
                            value.extend(&chars[value_start..i]);
                            escaping = true;
                        }
                        i += 1;
                        continue;
                    }
                    if c == '"' {
                        if escaping {
                            value_start = i;
                            escaping = false;
                            i += 1;
                            continue;
                        }
                        value.extend(&chars[value_start..i]);
                        break;
                    }
                    if escaping {
                        value_start = i - 1;
                        escaping = false;
                    }
                    if !qdtext(c) {
                        return None;
                    }
                    i += 1;
                }
                if i == len {
                    return None;
                }
                i += 1;
            } else {
                let value_start = i;
                while i < len {
                    if !token(chars[i]) {
                        if i == value_start {
                            return None;
                        }
                        break;
                    }
                    i += 1;
                }
                value = chars[value_start..i].iter().collect();
            }
            if let Some(decoder) = disposition {
                value = decode_param_string(decoder, &value, 2)?;
            }
        }
        name = name.to_lowercase();
        if !params.iter().any(|(k, _)| *k == name) {
            params.push((name, value));
        }
    }
    Some(())
}

/// busboy `parseDisposition` with multer's `defParamCharset: 'latin1'`.
fn parse_disposition(s: &str) -> Option<(String, Params)> {
    let chars: Vec<char> = s.chars().collect();
    if chars.is_empty() {
        return None;
    }
    let mut params = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if !token(chars[i]) {
            parse_params(&chars, i, &mut params, Some(Decoder::Latin1))?;
            break;
        }
        i += 1;
    }
    let end = (0..chars.len())
        .find(|&j| !token(chars[j]))
        .unwrap_or(chars.len());
    let ty: String = chars[..end].iter().collect::<String>().to_lowercase();
    Some((ty, params))
}

/// busboy `basename`.
fn basename(path: &str) -> String {
    let name = match path.rfind(['/', '\\']) {
        Some(i) => &path[i + 1..],
        None => path,
    };
    if name == ".." || name == "." {
        String::new()
    } else {
        name.to_owned()
    }
}

/// multer `decodeFormDataName`: `%0A`, `%0D`, `%22` only.
fn decode_form_data_name(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        let code = rest.get(i..i + 3).map(str::to_ascii_uppercase);
        match code.as_deref() {
            Some("%0A") => out.push('\n'),
            Some("%0D") => out.push('\r'),
            Some("%22") => out.push('"'),
            _ => {
                out.push('%');
                rest = &rest[i + 1..];
                continue;
            }
        }
        rest = &rest[i + 3..];
    }
    out.push_str(rest);
    out
}

// ---------------------------------------------------------------------------
// append-field (req.body from the fields)
// ---------------------------------------------------------------------------

/// A JS value inside `req.body` (`Object.create(null)` objects).
#[derive(Debug, Clone, PartialEq)]
enum Node {
    /// A string, or `undefined`.
    Scalar(Option<String>),
    /// A (possibly sparse) array.
    Array(Vec<Option<Node>>),
    Object(Vec<(String, Node)>),
}

/// Array indexes past this are kept as object keys (Node would build a
/// huge sparse array).
const MAX_ARRAY_INDEX: usize = 100_000;

#[derive(Debug, Clone)]
enum Key {
    Object(String),
    Array(usize),
}

#[derive(Debug, Clone)]
struct PathStep {
    key: Key,
    append: bool,
    next_is_array: Option<bool>,
}

/// append-field `parsePath`.
fn parse_path(key: &str) -> Vec<PathStep> {
    let failure = || {
        vec![PathStep {
            key: Key::Object(key.to_owned()),
            append: false,
            next_is_array: None,
        }]
    };
    let first = key.find('[').map_or(key, |i| &key[..i]);
    if first.is_empty() {
        return failure();
    }
    let mut steps = vec![PathStep {
        key: Key::Object(first.to_owned()),
        append: false,
        next_is_array: None,
    }];
    let mut pos = first.len();
    while pos < key.len() {
        let rest = &key[pos..];
        if rest.starts_with("[]") {
            pos += 2;
            steps.last_mut().expect("first step").append = true;
            if pos != key.len() {
                return failure();
            }
            continue;
        }
        let Some(inner_end) = rest.strip_prefix('[').and_then(|r| r.find(']')) else {
            return failure();
        };
        let inner = &rest[1..1 + inner_end];
        if inner.is_empty() {
            return failure();
        }
        pos += inner_end + 2;
        let digits = inner.bytes().all(|b| b.is_ascii_digit());
        let index = digits
            .then(|| inner.parse::<usize>().ok())
            .flatten()
            .filter(|i| *i <= MAX_ARRAY_INDEX);
        let tail = steps.last_mut().expect("first step");
        match index {
            Some(i) => {
                tail.next_is_array = Some(true);
                steps.push(PathStep {
                    key: Key::Array(i),
                    append: false,
                    next_is_array: None,
                });
            }
            None => {
                tail.next_is_array = Some(false);
                steps.push(PathStep {
                    key: Key::Object(inner.to_owned()),
                    append: false,
                    next_is_array: None,
                });
            }
        }
    }
    steps
}

impl Node {
    fn get_mut(&mut self, key: &Key) -> Option<&mut Node> {
        match (self, key) {
            (Node::Object(entries), Key::Object(k)) => {
                entries.iter_mut().find(|(n, _)| n == k).map(|(_, v)| v)
            }
            (Node::Object(entries), Key::Array(i)) => {
                let k = i.to_string();
                entries.iter_mut().find(|(n, _)| *n == k).map(|(_, v)| v)
            }
            (Node::Array(items), Key::Array(i)) => items.get_mut(*i).and_then(Option::as_mut),
            (Node::Array(items), Key::Object(k)) => {
                let i: usize = k.parse().ok()?;
                (k == &i.to_string()).then_some(())?;
                items.get_mut(i).and_then(Option::as_mut)
            }
            (Node::Scalar(_), _) => None,
        }
    }

    fn set(&mut self, key: &Key, value: Node) {
        match (self, key) {
            (Node::Array(items), Key::Array(i)) => {
                if items.len() <= *i {
                    items.resize(*i + 1, None);
                }
                items[*i] = Some(value);
            }
            (Node::Object(entries), key) => {
                let k = match key {
                    Key::Object(k) => k.clone(),
                    Key::Array(i) => i.to_string(),
                };
                match entries.iter_mut().find(|(n, _)| *n == k) {
                    Some(slot) => slot.1 = value,
                    None => entries.push((k, value)),
                }
            }
            (Node::Array(items), Key::Object(k)) => {
                // A non-index key on an array is invisible to JSON.stringify.
                let _ = (items, k);
            }
            (Node::Scalar(_), _) => {}
        }
    }

    fn to_json(&self) -> Option<Value> {
        match self {
            Node::Scalar(s) => s.clone().map(Value::String),
            Node::Array(items) => Some(Value::Array(
                items
                    .iter()
                    .map(|i| i.as_ref().and_then(Node::to_json).unwrap_or(Value::Null))
                    .collect(),
            )),
            Node::Object(entries) => Some(Value::Object(
                entries
                    .iter()
                    .filter_map(|(k, v)| Some((k.clone(), v.to_json()?)))
                    .collect::<Map<_, _>>(),
            )),
        }
    }
}

/// append-field `setLastValue`.
fn set_last_value(context: &mut Node, step: &PathStep, value: Option<String>) {
    let current = context.get_mut(&step.key);
    match current {
        None => {
            let v = Node::Scalar(value);
            context.set(
                &step.key,
                if step.append {
                    Node::Array(vec![Some(v)])
                } else {
                    v
                },
            );
        }
        Some(Node::Array(items)) => items.push(Some(Node::Scalar(value))),
        Some(obj @ Node::Object(_)) => {
            let inner = PathStep {
                key: Key::Object(String::new()),
                append: false,
                next_is_array: None,
            };
            set_last_value(obj, &inner, value);
        }
        Some(scalar @ Node::Scalar(_)) => {
            let old = std::mem::replace(scalar, Node::Scalar(None));
            *scalar = Node::Array(vec![Some(old), Some(Node::Scalar(value))]);
        }
    }
}

/// append-field: `appendField(store, key, value)`.
fn append_field(store: &mut Node, key: &str, value: Option<String>) {
    let steps = parse_path(key);
    let mut context: &mut Node = store;
    for (n, step) in steps.iter().enumerate() {
        if n == steps.len() - 1 {
            set_last_value(context, step, value);
            return;
        }
        let next_array = step.next_is_array == Some(true);
        let exists = context.get_mut(&step.key).is_some();
        if !exists {
            context.set(
                &step.key,
                if next_array {
                    Node::Array(Vec::new())
                } else {
                    Node::Object(Vec::new())
                },
            );
        } else {
            let current = context.get_mut(&step.key).expect("exists");
            match current {
                Node::Object(_) => {}
                Node::Array(_) if next_array => {}
                Node::Array(items) => {
                    let entries = items
                        .iter()
                        .enumerate()
                        .filter_map(|(i, v)| v.clone().map(|v| (i.to_string(), v)))
                        .collect();
                    *current = Node::Object(entries);
                }
                Node::Scalar(_) => {
                    let old = std::mem::replace(current, Node::Scalar(None));
                    *current = Node::Object(vec![(String::new(), old)]);
                }
            }
        }
        context = context.get_mut(&step.key).expect("just set");
    }
}

// ---------------------------------------------------------------------------
// busboy's multipart parser + multer's single()
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HState {
    Name,
    PreOws,
    Value,
}

/// busboy's `HeaderParser`.
#[derive(Debug)]
struct HeaderParser {
    header: Vec<(String, Vec<String>)>,
    pair_count: usize,
    byte_count: usize,
    state: HState,
    name: String,
    value: String,
    crlf: u8,
}

fn field_vchar(b: u8) -> bool {
    b == 9 || (32..=126).contains(&b) || b >= 128
}

enum HeaderPush {
    Error,
    /// Consumed up to (exclusive) this position; maybe a complete header.
    At(usize, Option<Vec<(String, Vec<String>)>>),
}

impl HeaderParser {
    fn new() -> Self {
        Self {
            header: Vec::new(),
            pair_count: 0,
            byte_count: 0,
            state: HState::Name,
            name: String::new(),
            value: String::new(),
            crlf: 0,
        }
    }

    fn push(&mut self, chunk: &[u8], mut pos: usize, end: usize) -> HeaderPush {
        let mut start = pos;
        while pos < end {
            if self.state == HState::Name {
                let mut done = false;
                while pos < end {
                    if self.byte_count == MAX_HEADER_SIZE {
                        return HeaderPush::Error;
                    }
                    self.byte_count += 1;
                    let code = chunk[pos];
                    if !is_tchar(code) {
                        if code != b':' {
                            return HeaderPush::Error;
                        }
                        self.name.push_str(&latin1(&chunk[start..pos]));
                        if self.name.is_empty() {
                            return HeaderPush::Error;
                        }
                        pos += 1;
                        done = true;
                        self.state = HState::PreOws;
                        break;
                    }
                    pos += 1;
                }
                if !done {
                    self.name.push_str(&latin1(&chunk[start..pos]));
                    continue;
                }
            }
            if self.state == HState::PreOws {
                let mut done = false;
                while pos < end {
                    if self.byte_count == MAX_HEADER_SIZE {
                        return HeaderPush::Error;
                    }
                    self.byte_count += 1;
                    let code = chunk[pos];
                    if code != b' ' && code != b'\t' {
                        start = pos;
                        done = true;
                        self.state = HState::Value;
                        break;
                    }
                    pos += 1;
                }
                if !done {
                    continue;
                }
            }
            // HState::Value
            match self.crlf {
                0 => {
                    while pos < end {
                        if self.byte_count == MAX_HEADER_SIZE {
                            return HeaderPush::Error;
                        }
                        self.byte_count += 1;
                        let code = chunk[pos];
                        if !field_vchar(code) {
                            if code != b'\r' {
                                return HeaderPush::Error;
                            }
                            self.crlf += 1;
                            break;
                        }
                        pos += 1;
                    }
                    self.value.push_str(&latin1(&chunk[start..pos.min(end)]));
                    pos += 1;
                }
                1 => {
                    if self.byte_count == MAX_HEADER_SIZE {
                        return HeaderPush::Error;
                    }
                    self.byte_count += 1;
                    let code = chunk[pos];
                    pos += 1;
                    if code != b'\n' {
                        return HeaderPush::Error;
                    }
                    self.crlf += 1;
                }
                2 => {
                    if self.byte_count == MAX_HEADER_SIZE {
                        return HeaderPush::Error;
                    }
                    self.byte_count += 1;
                    let code = chunk[pos];
                    if code == b' ' || code == b'\t' {
                        start = pos;
                        self.crlf = 0;
                    } else {
                        self.pair_count += 1;
                        if self.pair_count < MAX_HEADER_PAIRS {
                            let name = self.name.to_ascii_lowercase();
                            let value = std::mem::take(&mut self.value);
                            match self.header.iter_mut().find(|(n, _)| *n == name) {
                                Some((_, values)) => values.push(value),
                                None => self.header.push((name, vec![value])),
                            }
                        }
                        if code == b'\r' {
                            self.crlf += 1;
                            pos += 1;
                        } else {
                            start = pos;
                            self.crlf = 0;
                            self.state = HState::Name;
                            self.name.clear();
                            self.value.clear();
                        }
                    }
                }
                _ => {
                    if self.byte_count == MAX_HEADER_SIZE {
                        return HeaderPush::Error;
                    }
                    self.byte_count += 1;
                    let code = chunk[pos];
                    pos += 1;
                    if code != b'\n' {
                        return HeaderPush::Error;
                    }
                    let header = std::mem::take(&mut self.header);
                    *self = Self::new();
                    return HeaderPush::At(pos, Some(header));
                }
            }
        }
        HeaderPush::At(pos, None)
    }
}

/// The part being read.
#[derive(Debug)]
enum Part {
    None,
    /// A file part busboy emitted (`accepted`: multer is storing it).
    File {
        accepted: bool,
        info: FileInfo,
        data: Vec<u8>,
        size: u64,
        disk_name: Option<String>,
    },
    Field {
        name: Option<String>,
        data: Vec<u8>,
        size: u64,
        charset: String,
        truncated: bool,
    },
}

/// busboy's `Multipart` writable with multer's `single(field)` listeners.
struct Parser<'a> {
    multer: &'a Multer,
    field: &'a str,
    needle: Vec<u8>,
    /// Bytes not yet searched (StreamSearch's lookbehind).
    pending: Vec<u8>,
    hparser: Option<HeaderParser>,
    match_post_boundary: u8,
    complete: bool,
    skip_part: bool,
    part: Part,
    parts: i64,
    files: u64,
    fields: u64,
    hit_files_limit: bool,
    hit_fields_limit: bool,
    file_size_limit: u64,
    field_size_limit: u64,
    files_left: u64,
    body: Node,
    file: Option<File>,
    error: Option<MulterError>,
}

impl<'a> Parser<'a> {
    fn new(multer: &'a Multer, field: &'a str, boundary: &str) -> Self {
        let limits = &multer.limits;
        // multer passes one more than each limit to busboy (it reports when a
        // limit is *reached*).
        let field_size = limits.field_size.unwrap_or(DEFAULT_FIELD_SIZE) + 1;
        let file_size = limits.file_size.map_or(u64::MAX, |f| f + 1);
        // StreamSearch's `Buffer.from(needle)`: the (latin1) boundary string
        // encoded as UTF-8.
        let mut needle = b"\r\n--".to_vec();
        needle.extend_from_slice(boundary.as_bytes());
        let mut parser = Self {
            multer,
            field,
            needle,
            pending: Vec::new(),
            hparser: None,
            match_post_boundary: 0,
            complete: false,
            skip_part: false,
            part: Part::None,
            parts: -1,
            files: 0,
            fields: 0,
            hit_files_limit: false,
            hit_fields_limit: false,
            file_size_limit: file_size,
            field_size_limit: field_size,
            files_left: 1,
            body: Node::Object(Vec::new()),
            file: None,
            error: None,
        };
        // "Just in case there is no preamble".
        parser.write(b"\r\n");
        parser
    }

    fn fail(&mut self, err: MulterError) {
        if self.error.is_none() {
            self.error = Some(err);
        }
    }

    fn done(&self) -> bool {
        self.error.is_some() || self.complete
    }

    /// StreamSearch: data before a match comes with the match in one call.
    fn write(&mut self, chunk: &[u8]) {
        if self.done() {
            return;
        }
        self.pending.extend_from_slice(chunk);
        loop {
            if self.done() {
                self.pending.clear();
                return;
            }
            let found = find(&self.pending, &self.needle);
            match found {
                Some(i) => {
                    let data: Vec<u8> = self.pending[..i].to_vec();
                    self.pending.drain(..i + self.needle.len());
                    self.ss_cb(true, &data);
                }
                None => {
                    // Keep what could still be the start of the needle.
                    let keep = partial_suffix(&self.pending, &self.needle);
                    let cut = self.pending.len() - keep;
                    if cut > 0 {
                        let data: Vec<u8> = self.pending[..cut].to_vec();
                        self.pending.drain(..cut);
                        self.ss_cb(false, &data);
                    }
                    return;
                }
            }
        }
    }

    /// `_final`: flush the lookbehind, then the end-of-form checks.
    fn finish(&mut self) {
        if self.done() {
            return;
        }
        let rest = std::mem::take(&mut self.pending);
        if !rest.is_empty() {
            self.ss_cb(false, &rest);
        }
        if self.error.is_none() && !self.complete {
            self.fail(MulterError::Other("Unexpected end of form".into()));
        }
    }

    fn ss_cb(&mut self, is_match: bool, data: &[u8]) {
        let mut start = 0;
        let end = data.len();
        'retry: loop {
            if end == 0 {
                break;
            }
            if let Some(hp) = self.hparser.as_mut() {
                match hp.push(data, start, end) {
                    HeaderPush::Error => {
                        self.hparser = None;
                        self.fail(MulterError::Other("Malformed part header".into()));
                        break;
                    }
                    HeaderPush::At(pos, header) => {
                        start = pos;
                        if let Some(header) = header {
                            self.hparser = None;
                            self.on_header(header);
                            if self.error.is_some() {
                                return;
                            }
                        }
                    }
                }
            }
            if start >= end {
                break;
            }
            if self.match_post_boundary != 0 {
                if self.match_post_boundary == 1 {
                    match data[start] {
                        b'-' => {
                            self.match_post_boundary = 2;
                            start += 1;
                        }
                        b'\r' => {
                            self.match_post_boundary = 3;
                            start += 1;
                        }
                        _ => self.match_post_boundary = 0,
                    }
                    if start == end {
                        return;
                    }
                }
                if self.match_post_boundary == 2 {
                    self.match_post_boundary = 0;
                    if data[start] == b'-' {
                        // End of multipart data; the epilogue is ignored.
                        self.complete = true;
                        return;
                    }
                    // busboy feeds the consumed '-' back as data: no part is
                    // open here, so it is dropped.
                } else if self.match_post_boundary == 3 {
                    self.match_post_boundary = 0;
                    if data[start] == b'\n' {
                        start += 1;
                        if let Some(limit) = self.multer.limits.parts
                            && self.parts >= (limit + 1) as i64
                        {
                            break;
                        }
                        self.hparser = Some(HeaderParser::new());
                        if start == end {
                            break;
                        }
                        continue 'retry;
                    }
                }
            }
            if !self.skip_part {
                let slice = &data[start..end];
                match &mut self.part {
                    Part::File {
                        data: buf,
                        size,
                        accepted,
                        ..
                    } => {
                        let room = self.file_size_limit - *size;
                        let take = (slice.len() as u64).min(room) as usize;
                        *size += take as u64;
                        if *accepted {
                            buf.extend_from_slice(&slice[..take]);
                        }
                        if *size == self.file_size_limit {
                            self.skip_part = true;
                            self.on_file_limit();
                        }
                    }
                    Part::Field {
                        data: buf,
                        size,
                        truncated,
                        ..
                    } => {
                        let room = self.field_size_limit - *size;
                        let take = (slice.len() as u64).min(room) as usize;
                        *size += take as u64;
                        buf.extend_from_slice(&slice[..take]);
                        if *size == self.field_size_limit {
                            self.skip_part = true;
                            *truncated = true;
                        }
                    }
                    Part::None => {}
                }
            }
            break;
        }
        if is_match {
            self.match_post_boundary = 1;
            match std::mem::replace(&mut self.part, Part::None) {
                Part::File {
                    accepted: true,
                    info,
                    data,
                    size,
                    disk_name,
                } => self.store_file(info, data, size, disk_name),
                Part::File { .. } | Part::None => {}
                Part::Field {
                    name,
                    data,
                    charset,
                    truncated,
                    ..
                } => {
                    let value = decode_bytes(get_decoder(&charset), &data);
                    self.on_field(name, value, truncated);
                }
            }
            self.parts += 1;
            if let Some(limit) = self.multer.limits.parts
                && self.parts == (limit + 1) as i64
            {
                self.fail(MulterError::code("LIMIT_PART_COUNT"));
            }
        }
    }

    /// The header callback: decide what the part is.
    fn on_header(&mut self, header: Vec<(String, Vec<String>)>) {
        self.skip_part = false;
        let get = |name: &str| {
            header
                .iter()
                .find(|(n, _)| n == name)
                .and_then(|(_, v)| v.first().cloned())
        };
        let mut part_type = "text/plain".to_owned();
        let mut charset = "utf8".to_owned();
        let mut encoding = "7bit".to_owned();
        let Some(disposition) = get("content-disposition") else {
            self.skip_part = true;
            return;
        };
        let Some((dtype, params)) = parse_disposition(&disposition) else {
            self.skip_part = true;
            return;
        };
        if dtype != "form-data" {
            self.skip_part = true;
            return;
        }
        let param = |n: &str| params.iter().find(|(k, _)| k == n).map(|(_, v)| v.clone());
        // `if (disp.params.name)`, `if (disp.params['filename*'])`, … — truthy
        // checks, so an empty `filename=""` is no filename at all.
        let part_name = param("name").filter(|n| !n.is_empty());
        let filename = param("filename*")
            .filter(|f| !f.is_empty())
            .or_else(|| param("filename").filter(|f| !f.is_empty()))
            .map(|f| basename(&f));
        if let Some(ct) = get("content-type")
            && let Some((t, s, ps)) = parse_content_type(&ct)
        {
            part_type = format!("{t}/{s}");
            if let Some((_, c)) = ps.iter().find(|(k, _)| k == "charset") {
                charset = c.to_lowercase();
            }
        }
        if let Some(te) = get("content-transfer-encoding") {
            encoding = te.to_lowercase();
        }

        if part_type == "application/octet-stream" || filename.is_some() {
            if let Some(limit) = self.multer.limits.files
                && self.files == limit
            {
                if !self.hit_files_limit {
                    self.hit_files_limit = true;
                    self.fail(MulterError::code("LIMIT_FILE_COUNT"));
                }
                self.skip_part = true;
                return;
            }
            self.files += 1;
            self.on_file(part_name, filename, encoding, part_type);
        } else {
            if let Some(limit) = self.multer.limits.fields
                && self.fields == limit
            {
                if !self.hit_fields_limit {
                    self.hit_fields_limit = true;
                    self.fail(MulterError::code("LIMIT_FIELD_COUNT"));
                }
                self.skip_part = true;
                return;
            }
            self.fields += 1;
            self.part = Part::Field {
                name: part_name,
                data: Vec::new(),
                size: 0,
                charset,
                truncated: false,
            };
        }
    }

    /// multer's `busboy.on('file')`.
    fn on_file(
        &mut self,
        fieldname: Option<String>,
        filename: Option<String>,
        encoding: String,
        mimetype: String,
    ) {
        // The stream exists either way; only an accepted one is kept.
        let ignored = |info: FileInfo| Part::File {
            accepted: false,
            info,
            data: Vec::new(),
            size: 0,
            disk_name: None,
        };
        let originalname = filename.as_deref().map(decode_form_data_name);
        let Some(raw_fieldname) = fieldname else {
            self.part = ignored(FileInfo {
                fieldname: String::new(),
                originalname: String::new(),
                encoding,
                mimetype,
            });
            self.fail(MulterError::code("MISSING_FIELD_NAME"));
            return;
        };
        let fieldname = decode_form_data_name(&raw_fieldname);
        let info = FileInfo {
            fieldname: fieldname.clone(),
            originalname: originalname.clone().unwrap_or_default(),
            encoding,
            mimetype,
        };
        if originalname.as_deref().is_none_or(str::is_empty) {
            self.part = ignored(info);
            return;
        }
        if let Some(max) = self.multer.limits.field_name_size
            && raw_fieldname.encode_utf16().count() > max
        {
            self.part = ignored(info);
            self.fail(MulterError::code("LIMIT_FIELD_KEY"));
            return;
        }
        // single(): one slot for `field`, none for any other name.
        if fieldname != self.field || self.files_left == 0 {
            self.part = ignored(info.clone());
            self.fail(MulterError::Multer {
                code: "LIMIT_UNEXPECTED_FILE",
                field: Some(info.fieldname),
                filename: Some(info.originalname),
            });
            return;
        }
        let verdict = self.multer.file_filter.map_or(Ok(true), |f| f(&info));
        match verdict {
            Err(message) => {
                self.part = ignored(info);
                self.fail(MulterError::Other(message));
            }
            Ok(false) => self.part = ignored(info),
            Ok(true) => {
                self.files_left -= 1;
                let disk_name = match &self.multer.storage {
                    Storage::Disk(disk) => Some((disk.filename)(&info)),
                    Storage::Memory => None,
                };
                self.part = Part::File {
                    accepted: true,
                    info,
                    data: Vec::new(),
                    size: 0,
                    disk_name,
                };
            }
        }
    }

    /// The file stream's `limit` event.
    fn on_file_limit(&mut self) {
        if let Part::File {
            accepted: true,
            info,
            ..
        } = &self.part
        {
            let err = MulterError::Multer {
                code: "LIMIT_FILE_SIZE",
                field: Some(info.fieldname.clone()),
                filename: Some(info.originalname.clone()),
            };
            self.fail(err);
        }
    }

    /// The storage engine's `_handleFile` finishing.
    fn store_file(&mut self, info: FileInfo, data: Vec<u8>, size: u64, disk_name: Option<String>) {
        let mut file = File {
            fieldname: info.fieldname,
            originalname: info.originalname,
            encoding: info.encoding,
            mimetype: info.mimetype,
            size,
            buffer: None,
            destination: None,
            filename: None,
            path: None,
        };
        match &self.multer.storage {
            Storage::Memory => file.buffer = Some(data),
            Storage::Disk(disk) => {
                let name = disk_name.unwrap_or_default();
                let path = disk.destination.join(&name);
                if let Err(err) = std::fs::write(&path, &data) {
                    self.fail(MulterError::Other(err.to_string()));
                    return;
                }
                file.destination = Some(disk.destination.clone());
                file.filename = Some(name);
                file.path = Some(path);
            }
        }
        self.file = Some(file);
    }

    /// multer's `busboy.on('field')`.
    fn on_field(&mut self, name: Option<String>, value: Option<String>, truncated: bool) {
        let Some(raw) = name else {
            self.fail(MulterError::code("MISSING_FIELD_NAME"));
            return;
        };
        let fieldname = decode_form_data_name(&raw);
        if truncated {
            self.fail(MulterError::Multer {
                code: "LIMIT_FIELD_VALUE",
                field: Some(fieldname),
                filename: None,
            });
            return;
        }
        if let Some(max) = self.multer.limits.field_name_size
            && raw.encode_utf16().count() > max
        {
            self.fail(MulterError::code("LIMIT_FIELD_KEY"));
            return;
        }
        append_field(&mut self.body, &fieldname, value);
    }

    /// The result once the body has ended.
    fn result(mut self) -> Result<Upload, MulterError> {
        self.finish();
        if let Some(err) = self.error {
            // A stored file is removed when the upload fails.
            if let Some(path) = self.file.and_then(|f| f.path) {
                let _ = std::fs::remove_file(path);
            }
            return Err(err);
        }
        Ok(Upload {
            multipart: true,
            file: self.file,
            body: self.body.to_json(),
        })
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// The longest proper suffix of `data` that is a prefix of `needle`.
fn partial_suffix(data: &[u8], needle: &[u8]) -> usize {
    let max = (needle.len() - 1).min(data.len());
    (1..=max)
        .rev()
        .find(|&k| data[data.len() - k..] == needle[..k])
        .unwrap_or(0)
}

/// Next chunk of the body (`None` at the end; an error ends it too).
async fn next_chunk(body: &mut Body) -> Option<axum::body::Bytes> {
    loop {
        let frame = std::future::poll_fn(|cx| Pin::new(&mut *body).poll_frame(cx)).await?;
        match frame {
            Ok(frame) => {
                if let Ok(data) = frame.into_data() {
                    return Some(data);
                }
            }
            Err(_) => return None,
        }
    }
}

/// Reads and drops what the client still sends (multer drains before
/// answering an error).
async fn drain(body: &mut Body) {
    let mut seen = 0usize;
    while let Some(chunk) = next_chunk(body).await {
        seen += chunk.len();
        if seen > DRAIN_LIMIT {
            return;
        }
    }
}

impl Multer {
    /// `upload.single(field)` on a request's headers and (unread) body.
    pub async fn single(
        &self,
        field: &str,
        headers: &HeaderMap,
        mut body: Body,
    ) -> Result<Upload, MulterError> {
        if !is_multipart(headers) {
            return Ok(Upload {
                multipart: false,
                file: None,
                body: None,
            });
        }
        // Busboy's constructor: content type and boundary.
        let raw = headers
            .get(header::CONTENT_TYPE)
            .map(|v| latin1(v.as_bytes()))
            .unwrap_or_default();
        let Some((ty, subtype, params)) = parse_content_type(&raw) else {
            return Err(MulterError::Other("Malformed content type".into()));
        };
        if ty != "multipart" || subtype != "form-data" {
            return Err(MulterError::Other(format!(
                "Unsupported content type: {raw}"
            )));
        }
        let Some((_, boundary)) = params.iter().find(|(k, _)| k == "boundary") else {
            return Err(MulterError::Other("Multipart: Boundary not found".into()));
        };
        let mut parser = Parser::new(self, field, boundary);
        while let Some(chunk) = next_chunk(&mut body).await {
            parser.write(&chunk);
            if parser.error.is_some() {
                drain(&mut body).await;
                break;
            }
        }
        parser.result()
    }

    /// The same on a complete body (tests, fixtures).
    pub fn single_from_bytes(
        &self,
        field: &str,
        headers: &HeaderMap,
        bytes: &[u8],
    ) -> Result<Upload, MulterError> {
        if !is_multipart(headers) {
            return Ok(Upload {
                multipart: false,
                file: None,
                body: None,
            });
        }
        let raw = headers
            .get(header::CONTENT_TYPE)
            .map(|v| latin1(v.as_bytes()))
            .unwrap_or_default();
        let Some((ty, subtype, params)) = parse_content_type(&raw) else {
            return Err(MulterError::Other("Malformed content type".into()));
        };
        if ty != "multipart" || subtype != "form-data" {
            return Err(MulterError::Other(format!(
                "Unsupported content type: {raw}"
            )));
        }
        let Some((_, boundary)) = params.iter().find(|(k, _)| k == "boundary") else {
            return Err(MulterError::Other("Multipart: Boundary not found".into()));
        };
        let mut parser = Parser::new(self, field, boundary);
        parser.write(bytes);
        parser.result()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn headers(ct: &str, len: usize) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(
            header::CONTENT_TYPE,
            axum::http::HeaderValue::from_bytes(ct.as_bytes()).unwrap(),
        );
        h.insert(header::CONTENT_LENGTH, len.to_string().parse().unwrap());
        h
    }

    const CSV: Multer = Multer {
        storage: Storage::Memory,
        limits: Limits {
            file_size: Some(10),
            ..Limits::NONE
        },
        file_filter: Some(|f| {
            if f.mimetype == "text/csv" || f.originalname.ends_with(".csv") {
                Ok(true)
            } else {
                Err("Only CSV files are allowed".into())
            }
        }),
    };

    fn run(m: &Multer, body: &str) -> Result<Upload, MulterError> {
        m.single_from_bytes(
            "file",
            &headers("multipart/form-data; boundary=XX", body.len()),
            body.as_bytes(),
        )
    }

    #[test]
    fn a_file_and_fields() {
        let body = "--XX\r\nContent-Disposition: form-data; name=\"a[b]\"\r\n\r\n1\r\n\
                    --XX\r\nContent-Disposition: form-data; name=\"file\"; filename=\"C:\\\\x\\\\p.csv\"\r\nContent-Type: text/plain\r\n\r\nsku,n\r\n\r\n--XX--\r\n";
        let up = run(&CSV, body).unwrap();
        let file = up.file.unwrap();
        assert_eq!(file.originalname, "p.csv");
        assert_eq!(file.mimetype, "text/plain");
        assert_eq!(file.buffer.as_deref(), Some(&b"sku,n\r\n"[..]));
        assert_eq!(file.size, 7);
        assert_eq!(up.body, Some(json!({ "a": { "b": "1" } })));
    }

    #[test]
    fn errors() {
        let file = |name: &str, ct: &str, content: &str| {
            format!(
                "--XX\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"f\"\r\nContent-Type: {ct}\r\n\r\n{content}\r\n--XX--"
            )
        };
        assert_eq!(
            run(&CSV, &file("file", "image/png", "x"))
                .unwrap_err()
                .message(),
            "Only CSV files are allowed"
        );
        assert_eq!(
            run(&CSV, &file("other", "text/csv", "x")).unwrap_err(),
            MulterError::Multer {
                code: "LIMIT_UNEXPECTED_FILE",
                field: Some("other".into()),
                filename: Some("f".into())
            }
        );
        // fileSize 10: 10 bytes pass, 11 fail.
        assert!(run(&CSV, &file("file", "text/csv", "0123456789")).is_ok());
        assert_eq!(
            run(&CSV, &file("file", "text/csv", "0123456789A"))
                .unwrap_err()
                .message(),
            "File too large"
        );
        assert_eq!(
            run(
                &CSV,
                "--XX\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\n1"
            )
            .unwrap_err()
            .message(),
            "Unexpected end of form"
        );
        assert_eq!(
            run(&CSV, "--XX\r\n\r\n").unwrap_err().message(),
            "Malformed part header"
        );
        assert_eq!(
            run(&CSV, "").unwrap_err().message(),
            "Unexpected end of form"
        );
        let none = CSV.single_from_bytes("file", &headers("multipart/form-data", 0), b"");
        assert_eq!(none.unwrap_err().message(), "Multipart: Boundary not found");
        let not = CSV
            .single_from_bytes("file", &headers("application/json", 2), b"{}")
            .unwrap();
        assert!(!not.multipart);
    }

    /// multer 2.5 / busboy 1.6 on the same bodies, recorded by
    /// backend/scripts/gen-foundation-fixtures.js.
    #[test]
    fn matches_multer_fixtures() {
        let fixtures: Value =
            serde_json::from_str(include_str!("../fixtures/foundation_b.json")).unwrap();
        let config = |name: &str| match name {
            "csv_small" => CSV,
            "image" => Multer {
                storage: Storage::Memory,
                limits: Limits {
                    file_size: Some(10 * 1024 * 1024),
                    ..Limits::NONE
                },
                file_filter: Some(|f| {
                    if ["image/jpeg", "image/png", "image/gif", "image/webp"]
                        .contains(&f.mimetype.as_str())
                    {
                        Ok(true)
                    } else {
                        Err("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.".into())
                    }
                }),
            },
            "open" => Multer {
                storage: Storage::Memory,
                limits: Limits::NONE,
                file_filter: Some(|f| Ok(!f.originalname.ends_with(".skip"))),
            },
            "field_small" => Multer {
                storage: Storage::Memory,
                limits: Limits {
                    field_size: Some(8),
                    ..Limits::NONE
                },
                file_filter: None,
            },
            other => panic!("unknown config {other}"),
        };
        let b64 = base64::engine::general_purpose::STANDARD;
        for case in fixtures["multer"].as_array().unwrap() {
            let body = b64.decode(case["body"].as_str().unwrap()).unwrap();
            let mut h = HeaderMap::new();
            h.insert(
                header::CONTENT_TYPE,
                axum::http::HeaderValue::from_bytes(
                    case["contentType"].as_str().unwrap().as_bytes(),
                )
                .unwrap(),
            );
            h.insert(
                header::CONTENT_LENGTH,
                body.len().to_string().parse().unwrap(),
            );
            let label = format!(
                "{} {:?}",
                case["contentType"],
                String::from_utf8_lossy(&body)
            );
            let got = config(case["config"].as_str().unwrap()).single_from_bytes(
                case["field"].as_str().unwrap(),
                &h,
                &body,
            );
            let result = &case["result"];
            match (case["status"].as_u64().unwrap(), got) {
                (200, Ok(up)) => {
                    let file = up.file.map(|f| {
                        json!({
                            "fieldname": f.fieldname, "originalname": f.originalname,
                            "encoding": f.encoding, "mimetype": f.mimetype,
                            "buffer": b64.encode(f.buffer.unwrap_or_default()), "size": f.size,
                        })
                    });
                    assert_eq!(
                        file.unwrap_or(Value::Null),
                        result["file"],
                        "file of {label}"
                    );
                    if up.multipart {
                        assert_eq!(up.body.unwrap(), result["body"], "body of {label}");
                    }
                }
                (500, Err(err)) => {
                    let (code, field, filename) = match &err {
                        MulterError::Multer {
                            code,
                            field,
                            filename,
                        } => (json!(code), json!(field), json!(filename)),
                        MulterError::Other(_) => (Value::Null, Value::Null, Value::Null),
                    };
                    assert_eq!(
                        json!({ "message": err.message(), "code": code, "field": field, "filename": filename }),
                        result["error"],
                        "error of {label}"
                    );
                }
                (status, got) => panic!("{label}: Node {status} {result}, Rust {got:?}"),
            }
        }
    }

    #[test]
    fn media_types_like_type_is() {
        assert_eq!(
            normalize_media_type("multipart/form-data; boundary=x").as_deref(),
            Some("multipart/form-data")
        );
        assert_eq!(
            normalize_media_type("Multipart/Form-Data;boundary=\"a b\"").as_deref(),
            Some("multipart/form-data")
        );
        assert_eq!(normalize_media_type("multipart/form-data; boundary="), None);
        assert_eq!(normalize_media_type("multipart/form-data;;"), None);
        assert_eq!(normalize_media_type("multipart"), None);
    }

    #[test]
    fn append_field_like_the_package() {
        let mut body = Node::Object(Vec::new());
        for (k, v) in [
            ("a", "1"),
            ("a", "2"),
            ("b[]", "x"),
            ("b[]", "y"),
            ("c[1]", "z"),
            ("d[e][f]", "g"),
            ("h", "1"),
            ("h[i]", "2"),
            ("[x]", "3"),
        ] {
            append_field(&mut body, k, Some(v.into()));
        }
        assert_eq!(
            body.to_json().unwrap(),
            json!({
                "a": ["1", "2"],
                "b": ["x", "y"],
                "c": [null, "z"],
                "d": { "e": { "f": "g" } },
                "h": { "": "1", "i": "2" },
                "[x]": "3"
            })
        );
    }

    #[test]
    fn disposition_parameters() {
        let (t, p) = parse_disposition(
            "form-data; name=\"f\"; filename*=utf-8''%E2%82%AC%20rates.csv; filename=\"x\"",
        )
        .unwrap();
        assert_eq!(t, "form-data");
        assert_eq!(p[1], ("filename*".into(), "€ rates.csv".into()));
        // A raw UTF-8 filename is read as latin1, like busboy.
        let raw = latin1("form-data; filename=\"é.csv\"".as_bytes());
        let (_, p) = parse_disposition(&raw).unwrap();
        assert_eq!(p[0].1, "Ã©.csv");
        assert_eq!(decode_form_data_name("a%0Ab%22c%zz"), "a\nb\"c%zz");
        assert_eq!(basename("../x/..\\y.csv"), "y.csv");
        assert_eq!(basename(".."), "");
    }
}
