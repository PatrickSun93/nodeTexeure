//! Passwords, compatible with the backend's `bcryptjs` 3:
//!
//! * [`hash`] is `bcrypt.hash(password, await bcrypt.genSalt(10))` — a
//!   `$2b$10$…` hash with a random salt;
//! * [`verify`] is `bcrypt.compare(password, hash)`: a hash that isn't 60
//!   characters is a plain mismatch, an unknown version (`$2x$`, `$1$`…) or bad
//!   cost is an error (Node rejects the promise, and the routes answer 500);
//!   `$2a$`, `$2b$` and `$2y$` hashes verify, and the recomputed hash string
//!   must equal the stored one exactly, as bcryptjs compares strings;
//! * passwords are UTF-8 and only their first 72 bytes count (bcrypt).
//!
//! Hashing is CPU-bound (~50 ms at cost 10), so both run on the blocking pool.
//! [`validate_strength`] is the shared `validatePasswordStrength` rule.

/// `bcrypt.genSalt(10)` — the cost every Node route uses.
pub const COST: u32 = 10;

const ALPHABET: &[u8; 64] = b"./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PasswordError {
    /// The stored hash has an unsupported format (bcryptjs throws).
    InvalidHash(&'static str),
    /// The OS random source failed.
    Random,
    /// The blocking task was cancelled.
    Join,
}

impl std::fmt::Display for PasswordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidHash(why) => write!(f, "invalid bcrypt hash: {why}"),
            Self::Random => f.write_str("no randomness for a bcrypt salt"),
            Self::Join => f.write_str("password hashing task failed"),
        }
    }
}

impl std::error::Error for PasswordError {}

/// bcrypt's base64 (`./A-Za-z0-9`), ignoring trailing bits like bcryptjs.
fn decode_salt(s: &str) -> Option<[u8; 16]> {
    let mut out = [0u8; 16];
    let mut acc: u32 = 0;
    let mut bits = 0;
    let mut n = 0;
    for c in s.bytes() {
        let v = ALPHABET.iter().position(|a| *a == c)? as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            if n < out.len() {
                out[n] = (acc >> bits) as u8;
                n += 1;
            }
        }
    }
    (n == out.len()).then_some(out)
}

/// The parts of a stored hash bcryptjs accepts: version, cost and salt.
fn parse(hash: &str) -> Result<(bcrypt::Version, u32, [u8; 16]), PasswordError> {
    let b = hash.as_bytes();
    if b.first() != Some(&b'$') || b.get(1) != Some(&b'2') {
        return Err(PasswordError::InvalidHash("version"));
    }
    let version = match (b.get(2), b.get(3)) {
        (Some(b'a'), Some(b'$')) => bcrypt::Version::TwoA,
        (Some(b'b'), Some(b'$')) => bcrypt::Version::TwoB,
        (Some(b'y'), Some(b'$')) => bcrypt::Version::TwoY,
        _ => return Err(PasswordError::InvalidHash("revision")),
    };
    let cost = hash
        .get(4..6)
        .filter(|c| c.bytes().all(|d| d.is_ascii_digit()))
        .and_then(|c| c.parse::<u32>().ok())
        .filter(|c| (4..=31).contains(c))
        .ok_or(PasswordError::InvalidHash("rounds"))?;
    if b.get(6) != Some(&b'$') {
        return Err(PasswordError::InvalidHash("rounds"));
    }
    let salt = hash
        .get(7..29)
        .and_then(decode_salt)
        .ok_or(PasswordError::InvalidHash("salt"))?;
    Ok((version, cost, salt))
}

/// `bcrypt.compare(password, hash)`, synchronously.
pub fn verify_sync(password: &str, hash: &str) -> Result<bool, PasswordError> {
    if hash.chars().count() != 60 {
        return Ok(false);
    }
    let (version, cost, salt) = parse(hash)?;
    let computed = bcrypt::hash_with_salt(password, cost, salt)
        .map_err(|_| PasswordError::InvalidHash("rounds"))?
        .format_for_version(version);
    // Constant-time, like bcryptjs's safeStringCompare.
    let (a, b) = (computed.as_bytes(), hash.as_bytes());
    let diff = a
        .iter()
        .zip(b)
        .fold(a.len() ^ b.len(), |acc, (x, y)| acc | usize::from(x ^ y));
    Ok(diff == 0)
}

/// `bcrypt.hash(password, salt)` for a given salt (`$2b$`), synchronously.
pub fn hash_with_salt(password: &str, cost: u32, salt: [u8; 16]) -> Result<String, PasswordError> {
    Ok(bcrypt::hash_with_salt(password, cost, salt)
        .map_err(|_| PasswordError::InvalidHash("rounds"))?
        .format_for_version(bcrypt::Version::TwoB))
}

/// `bcrypt.hash(password, await bcrypt.genSalt(10))`, synchronously.
pub fn hash_sync(password: &str) -> Result<String, PasswordError> {
    let mut salt = [0u8; 16];
    getrandom::getrandom(&mut salt).map_err(|_| PasswordError::Random)?;
    hash_with_salt(password, COST, salt)
}

/// [`verify_sync`] on the blocking pool.
pub async fn verify(password: &str, hash: &str) -> Result<bool, PasswordError> {
    let (password, hash) = (password.to_owned(), hash.to_owned());
    tokio::task::spawn_blocking(move || verify_sync(&password, &hash))
        .await
        .map_err(|_| PasswordError::Join)?
}

/// [`hash_sync`] on the blocking pool.
pub async fn hash(password: &str) -> Result<String, PasswordError> {
    let password = password.to_owned();
    tokio::task::spawn_blocking(move || hash_sync(&password))
        .await
        .map_err(|_| PasswordError::Join)?
}

/// `validatePasswordStrength` (userRoutes.js): the error message, or `None`
/// when the password is acceptable. Length is in UTF-16 units, as in JS.
pub fn validate_strength(password: &str) -> Option<&'static str> {
    if password.encode_utf16().count() < 8 {
        return Some("Password must be at least 8 characters");
    }
    if !password.bytes().any(|b| b.is_ascii_uppercase()) {
        return Some("Password must contain at least one uppercase letter");
    }
    if !password.bytes().any(|b| b.is_ascii_lowercase()) {
        return Some("Password must contain at least one lowercase letter");
    }
    if !password.bytes().any(|b| b.is_ascii_digit()) {
        return Some("Password must contain at least one number");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Hashes made by bcryptjs (fixtures/node_compat.json) verify here, and a
    /// hash made here with the same salt is the same string.
    #[test]
    fn compatible_with_bcryptjs() {
        let fx = crate::cookies::tests::fixtures();
        let cases = fx["bcrypt_hash"].as_array().unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            let password = case["password"].as_str().unwrap();
            let hash = case["hash"].as_str().unwrap();
            assert_eq!(verify_sync(password, hash), Ok(true), "{case}");
            let (version, cost, salt) = parse(hash).unwrap();
            let again = bcrypt::hash_with_salt(password, cost, salt)
                .unwrap()
                .format_for_version(version);
            assert_eq!(again, hash, "same salt, same hash");
        }
        for case in fx["bcrypt_compare"].as_array().unwrap() {
            let got = verify_sync(
                case["password"].as_str().unwrap(),
                case["hash"].as_str().unwrap(),
            );
            match case["result"].as_str() {
                Some("true") => assert_eq!(got, Ok(true), "{case}"),
                Some("false") => assert_eq!(got, Ok(false), "{case}"),
                _ => assert!(got.is_err(), "{case}: bcryptjs threw, Rust gave {got:?}"),
            }
        }
    }

    #[test]
    fn hashes_like_gen_salt_10() {
        let h = hash_sync("Customer@123").unwrap();
        assert!(h.starts_with("$2b$10$"));
        assert_eq!(h.len(), 60);
        assert_eq!(verify_sync("Customer@123", &h), Ok(true));
        assert_eq!(verify_sync("customer@123", &h), Ok(false));
        assert_ne!(hash_sync("Customer@123").unwrap(), h, "random salt");
    }

    #[test]
    fn strength_rules() {
        assert_eq!(
            validate_strength("Ab1"),
            Some("Password must be at least 8 characters")
        );
        assert_eq!(
            validate_strength("abcdefg1"),
            Some("Password must contain at least one uppercase letter")
        );
        assert_eq!(
            validate_strength("ABCDEFG1"),
            Some("Password must contain at least one lowercase letter")
        );
        assert_eq!(
            validate_strength("Abcdefgh"),
            Some("Password must contain at least one number")
        );
        assert_eq!(validate_strength("Abcdefg1"), None);
        assert_eq!(
            validate_strength("Ab1😀😀x"),
            None,
            "an emoji counts twice, as in UTF-16"
        );
    }

    /// The seeded accounts' hashes (whatever version they were made with).
    #[tokio::test]
    #[ignore = "needs DATABASE_URL (seeded MySQL)"]
    async fn verifies_seeded_hashes() {
        let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
        let pool = sqlx::MySqlPool::connect(&url).await.unwrap();
        for (email, password) in [
            ("admin@example.com", "Admin@123"),
            ("staff@example.com", "Staff@123"),
            ("alice.customer@example.com", "Customer@123"),
        ] {
            let hash = sqlx::query_scalar!(
                r#"SELECT password_hash AS "hash!: String" FROM users WHERE email = ?"#,
                email
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert!(hash.starts_with("$2"), "{email}: {hash}");
            assert_eq!(verify(password, &hash).await, Ok(true), "{email}");
            assert_eq!(verify("wrong", &hash).await, Ok(false), "{email}");
        }
    }
}
