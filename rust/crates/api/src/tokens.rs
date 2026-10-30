//! Session tokens, issued exactly like backend/routes/userRoutes.js:
//!
//! * **Access token** (`signAccessToken`): an HS256 JWT signed with
//!   `JWT_SECRET` whose payload is
//!   `{ id, email, isAdmin, isStaff, tv, iat, exp }` in that order — role flags
//!   from the current DB role, `tv` the user's `token_version`, `exp` from
//!   `ACCESS_TOKEN_TTL` (default `24h`, parsed like the `ms` package). The
//!   header is `{"alg":"HS256","typ":"JWT"}`, so a token made here is
//!   byte-for-byte the one jsonwebtoken makes for the same second.
//! * **Refresh token**: 64 random bytes as hex, stored only as its SHA-256 hex
//!   in `refresh_tokens` (id from `get_next_id('REFRESH')`, expiry 7 days). It is
//!   not rotated: `POST /refresh` returns a new access token only.
//! * **Reset / verification tokens**: 32 random bytes as hex; reset tokens are
//!   stored as their SHA-256 hex, verification tokens raw (as Node does).
//!
//! Verification of access tokens is in [`crate::auth`].

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use sqlx::MySqlPool;

use crate::auth::JwtKey;

/// `n` bytes from the OS CSPRNG (`crypto.randomBytes`).
pub fn random_bytes<const N: usize>() -> anyhow::Result<[u8; N]> {
    let mut buf = [0u8; N];
    getrandom::getrandom(&mut buf).map_err(|e| anyhow::anyhow!("no randomness: {e}"))?;
    Ok(buf)
}

/// Lowercase hex (`buf.toString('hex')`).
pub fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
}

/// `crypto.randomBytes(N).toString('hex')`.
pub fn random_hex<const N: usize>() -> anyhow::Result<String> {
    Ok(hex(&random_bytes::<N>()?))
}

/// `hashToken`: SHA-256 of the token's UTF-8, as hex.
pub fn sha256_hex(token: &str) -> String {
    hex(&Sha256::digest(token.as_bytes()))
}

/// HMAC-SHA256 of `message` keyed with `key`.
pub fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC takes any key length");
    mac.update(message);
    mac.finalize().into_bytes().into()
}

/// The `ms` package (2.1) parsing a string: milliseconds, or `None` where it
/// returns `undefined`.
pub fn ms(s: &str) -> Option<f64> {
    if s.encode_utf16().count() > 100 {
        return None;
    }
    // /^(-?(?:\d+)?\.?\d+) *(unit)?$/i
    let bytes = s.as_bytes();
    let mut i = 0;
    if bytes.first() == Some(&b'-') {
        i = 1;
    }
    let num_start = i;
    let int_end = bytes[i..]
        .iter()
        .position(|b| !b.is_ascii_digit())
        .map_or(bytes.len(), |p| p + i);
    let mut end = int_end;
    if bytes.get(int_end) == Some(&b'.') {
        let frac_end = bytes[int_end + 1..]
            .iter()
            .position(|b| !b.is_ascii_digit())
            .map_or(bytes.len(), |p| p + int_end + 1);
        if frac_end > int_end + 1 {
            end = frac_end;
        }
    }
    if end == num_start {
        return None;
    }
    let number: f64 = s[..end].parse().ok()?;
    let unit = s[end..].trim_start_matches(' ').to_ascii_lowercase();
    const S: f64 = 1000.0;
    const M: f64 = S * 60.0;
    const H: f64 = M * 60.0;
    const D: f64 = H * 24.0;
    let factor = match unit.as_str() {
        "" | "milliseconds" | "millisecond" | "msecs" | "msec" | "ms" => 1.0,
        "seconds" | "second" | "secs" | "sec" | "s" => S,
        "minutes" | "minute" | "mins" | "min" | "m" => M,
        "hours" | "hour" | "hrs" | "hr" | "h" => H,
        "days" | "day" | "d" => D,
        "weeks" | "week" | "w" => D * 7.0,
        "years" | "year" | "yrs" | "yr" | "y" => D * 365.25,
        _ => return None,
    };
    Some(number * factor)
}

/// `ACCESS_TOKEN_TTL || '24h'`, as jsonwebtoken reads `expiresIn`.
pub fn access_token_ttl() -> String {
    std::env::var("ACCESS_TOKEN_TTL")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "24h".into())
}

/// The user fields `signAccessToken` reads.
#[derive(Debug, Clone)]
pub struct TokenUser<'a> {
    pub id: &'a str,
    pub email: Option<&'a str>,
    /// `users.role` (any case).
    pub role: &'a str,
    pub token_version: i64,
}

#[derive(Debug)]
pub enum TokenError {
    /// `JWT_SECRET` is not set (jsonwebtoken: "secretOrPrivateKey must have a value").
    NoSecret,
    /// `ACCESS_TOKEN_TTL` is not a timespan.
    BadTtl(String),
}

impl std::fmt::Display for TokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoSecret => f.write_str("secretOrPrivateKey must have a value"),
            Self::BadTtl(ttl) => write!(
                f,
                "\"expiresIn\" should be a number of seconds or string representing a timespan (got {ttl:?})"
            ),
        }
    }
}

impl std::error::Error for TokenError {}

fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// `signAccessToken(user)` at `now` with the given `expiresIn` string.
pub fn sign_access_token_at(
    key: &JwtKey,
    user: &TokenUser<'_>,
    ttl: &str,
    now: DateTime<Utc>,
) -> Result<String, TokenError> {
    let secret = key.secret().ok_or(TokenError::NoSecret)?;
    let iat = now.timestamp();
    let ttl_ms = ms(ttl).ok_or_else(|| TokenError::BadTtl(ttl.to_owned()))?;
    // timespan(): Math.floor(timestamp + milliseconds / 1000)
    let exp = (iat as f64 + ttl_ms / 1000.0).floor();
    let role = user.role.to_lowercase();
    let email = user.email.map_or_else(
        || "null".to_owned(),
        |e| serde_json::Value::String(e.to_owned()).to_string(),
    );
    let payload = format!(
        r#"{{"id":{},"email":{email},"isAdmin":{},"isStaff":{},"tv":{},"iat":{iat},"exp":{}}}"#,
        serde_json::Value::String(user.id.to_owned()),
        role == "admin",
        role == "staff",
        user.token_version,
        common::json::js_number_string(exp),
    );
    let signing_input = format!(
        "{}.{}",
        b64(br#"{"alg":"HS256","typ":"JWT"}"#),
        b64(payload.as_bytes())
    );
    let signature = hmac_sha256(secret, signing_input.as_bytes());
    Ok(format!("{signing_input}.{}", b64(&signature)))
}

/// `signAccessToken(user)` now, with `ACCESS_TOKEN_TTL`.
pub fn sign_access_token(key: &JwtKey, user: &TokenUser<'_>) -> Result<String, TokenError> {
    sign_access_token_at(key, user, &access_token_ttl(), Utc::now())
}

/// How long a refresh token lives.
pub const REFRESH_TTL_DAYS: i64 = 7;

/// A new refresh token for `user_id`: stores its hash (login), returns the raw
/// token for the client.
pub async fn issue_refresh_token(pool: &MySqlPool, user_id: &str) -> anyhow::Result<String> {
    let token = random_hex::<64>()?;
    // `new Date(Date.now() + 7d)`: millisecond precision, like Node sends it.
    let now = Utc::now();
    let now = DateTime::from_timestamp_millis(now.timestamp_millis()).unwrap_or(now);
    let expiry = now + Duration::days(REFRESH_TTL_DAYS);
    let id = sqlx::query_scalar!(r#"SELECT get_next_id('REFRESH') AS "id: String""#)
        .fetch_one(pool)
        .await?
        .ok_or_else(|| anyhow::anyhow!("transno prefix REFRESH is not registered"))?;
    sqlx::query!(
        "INSERT INTO refresh_tokens (id, user_id, token_hash, expiry) VALUES (?, ?, ?, ?)",
        id,
        user_id,
        sha256_hex(&token),
        expiry
    )
    .execute(pool)
    .await?;
    Ok(token)
}

/// The user a live refresh token belongs to (`SELECT * FROM refresh_tokens
/// WHERE token_hash = ? AND expiry > NOW()`).
pub async fn refresh_token_user(pool: &MySqlPool, token: &str) -> anyhow::Result<Option<String>> {
    Ok(sqlx::query_scalar!(
        "SELECT user_id FROM refresh_tokens WHERE token_hash = ? AND expiry > NOW() LIMIT 1",
        sha256_hex(token)
    )
    .fetch_optional(pool)
    .await?)
}

/// Log a user out everywhere (`DELETE FROM refresh_tokens WHERE user_id = ?`).
pub async fn revoke_refresh_tokens(pool: &MySqlPool, user_id: &str) -> anyhow::Result<u64> {
    Ok(
        sqlx::query!("DELETE FROM refresh_tokens WHERE user_id = ?", user_id)
            .execute(pool)
            .await?
            .rows_affected(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use serde_json::Value;

    #[test]
    fn ms_matches_the_ms_package() {
        let fx = crate::cookies::tests::fixtures();
        let cases = fx["ms"].as_array().unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            let input = case[0].as_str().unwrap();
            assert_eq!(ms(input), case[1].as_f64(), "ms({input:?})");
        }
    }

    #[test]
    fn access_tokens_are_byte_identical_to_jsonwebtoken() {
        let fx = crate::cookies::tests::fixtures();
        let secret = fx["secret"].as_str().unwrap();
        let key = JwtKey::from_secret(Some(secret));
        let now = Utc
            .timestamp_millis_opt(fx["now_ms"].as_i64().unwrap())
            .unwrap();
        let cases = fx["jwt"].as_array().unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            let u = &case["user"];
            let user = TokenUser {
                id: u["id"].as_str().unwrap(),
                email: u["email"].as_str(),
                role: u["role"].as_str().unwrap(),
                token_version: u["token_version"].as_i64().unwrap(),
            };
            let got = sign_access_token_at(&key, &user, case["ttl"].as_str().unwrap(), now);
            match &case["token"] {
                Value::String(expected) => assert_eq!(got.unwrap(), *expected, "{case}"),
                _ => assert!(got.is_err(), "{case}"),
            }
        }
    }

    #[test]
    fn hashing_and_random_helpers() {
        assert_eq!(
            sha256_hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let t = random_hex::<32>().unwrap();
        assert_eq!(t.len(), 64);
        assert!(
            t.bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        );
        assert_ne!(t, random_hex::<32>().unwrap());
        assert_eq!(random_hex::<64>().unwrap().len(), 128);
        assert!(
            sign_access_token_at(
                &JwtKey::from_secret(None),
                &TokenUser {
                    id: "U",
                    email: None,
                    role: "customer",
                    token_version: 0
                },
                "1h",
                Utc::now()
            )
            .is_err()
        );
    }

    #[tokio::test]
    #[ignore = "needs DATABASE_URL (seeded MySQL)"]
    async fn refresh_tokens_round_trip() {
        let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
        let pool = MySqlPool::connect(&url).await.unwrap();
        let user =
            sqlx::query_scalar!("SELECT id FROM users WHERE email = 'alice.customer@example.com'")
                .fetch_one(&pool)
                .await
                .unwrap();
        let token = issue_refresh_token(&pool, &user).await.unwrap();
        assert_eq!(token.len(), 128);
        assert_eq!(
            refresh_token_user(&pool, &token).await.unwrap().as_deref(),
            Some(user.as_str())
        );
        assert_eq!(refresh_token_user(&pool, "nope").await.unwrap(), None);
        let stored = sqlx::query_scalar!(
            r#"SELECT TIMESTAMPDIFF(HOUR, NOW(), expiry) AS "h!: i64" FROM refresh_tokens WHERE token_hash = ?"#,
            sha256_hex(&token)
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            (167..=168).contains(&stored),
            "expires in 7 days, got {stored}h"
        );
        sqlx::query!(
            "DELETE FROM refresh_tokens WHERE token_hash = ?",
            sha256_hex(&token)
        )
        .execute(&pool)
        .await
        .unwrap();
    }
}
