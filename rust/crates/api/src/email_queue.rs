//! The email queue producer: one `email_queue` row per email, delivered by the
//! email daemon (rust/crates/email-daemon). Port of
//! backend/services/emailQueueProducer.js `enqueue`, the abandoned-cart part of
//! backend/services/emailQueueService.js and the unsubscribe helpers of
//! backend/utils/emailSuppression.js.
//!
//! * [`enqueue`] looks the template up by name (active only), interpolates the
//!   subject (`{{ key }}` → `String(value)`, with `String.replace`'s `$`
//!   patterns), copies the template's html/text bodies and stores the variables
//!   as `template_data`. Marketing templates (`abandon`, `newsletter`, `promo`…)
//!   are skipped for unsubscribed recipients; the suppression check fails open.
//!   It never fails the caller: problems come back as [`Enqueued::NotQueued`].
//! * [`queue_abandoned_cart_email`] / [`cancel_abandoned_cart_emails`] are the
//!   3-step abandoned-cart sequence (1 h / 24 h / 72 h).
//! * [`unsubscribe_token`] / [`unsubscribe_url`] / [`verify_unsubscribe_token`]
//!   are the stateless one-click unsubscribe links (HMAC with `JWT_SECRET`).

use chrono::{DateTime, Duration, Utc};
use serde_json::{Map, Value, json};
use sqlx::MySqlPool;

use crate::auth::JwtKey;
use crate::body::{js_string, truthy};
use crate::tokens::{hmac_sha256, random_bytes};

/// Template names containing any of these are marketing (suppressible).
pub const MARKETING_MARKERS: [&str; 10] = [
    "abandon",
    "marketing",
    "newsletter",
    "promo",
    "campaign",
    "win_back",
    "winback",
    "re_engage",
    "reengage",
    "digest",
];

/// The abandoned-cart sequence's template (migration 013).
pub const ABANDONED_CART_TEMPLATE: &str = "abandoned_cart";

/// `isMarketingCategory(name)`.
pub fn is_marketing_category(name: &str) -> bool {
    let n = name.to_lowercase();
    MARKETING_MARKERS.iter().any(|m| n.contains(m))
}

/// `normalizeEmail(email)`: trimmed, lowercased.
pub fn normalize_email(email: &str) -> String {
    email
        .trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
        .to_lowercase()
}

/// `isEmailSuppressed(email)`: has this address unsubscribed? `false` on any
/// error, so a failing check never blocks an email.
pub async fn is_email_suppressed(pool: &MySqlPool, email: &str) -> bool {
    let normalized = normalize_email(email);
    if normalized.is_empty() {
        return false;
    }
    sqlx::query_scalar!(
        "SELECT 1 AS found FROM email_unsubscribes WHERE email = ? LIMIT 1",
        normalized
    )
    .fetch_optional(pool)
    .await
    .map(|row| row.is_some())
    .unwrap_or(false)
}

/// `crypto.randomUUID()`.
pub fn uuid_v4() -> anyhow::Result<String> {
    let mut b = random_bytes::<16>()?;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let hex = crate::tokens::hex(&b);
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    ))
}

/// `String.prototype.replace`'s replacement patterns for a regex without
/// groups: `$$` → `$`, `$&` → the match, `` $` `` / `$'` → the text before /
/// after it; anything else (including `$1`) is literal.
fn expand_replacement(replacement: &str, haystack: &str, start: usize, end: usize) -> String {
    let mut out = String::with_capacity(replacement.len());
    let mut chars = replacement.char_indices().peekable();
    while let Some((_, c)) = chars.next() {
        if c != '$' {
            out.push(c);
            continue;
        }
        match chars.peek().map(|(_, n)| *n) {
            Some('$') => {
                out.push('$');
                chars.next();
            }
            Some('&') => {
                out.push_str(&haystack[start..end]);
                chars.next();
            }
            Some('`') => {
                out.push_str(&haystack[..start]);
                chars.next();
            }
            Some('\'') => {
                out.push_str(&haystack[end..]);
                chars.next();
            }
            _ => out.push('$'),
        }
    }
    out
}

/// JavaScript's `\s` (Unicode white space plus the BOM).
fn js_space(c: char) -> bool {
    c.is_whitespace() || c == '\u{feff}'
}

/// `subject.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value))`.
fn replace_placeholder(subject: &str, key: &str, value: &str) -> String {
    let mut out = String::with_capacity(subject.len());
    let mut i = 0;
    let mut last = 0;
    while let Some(found) = subject[i..].find("{{") {
        let start = i + found;
        let mut j = start + 2;
        j += subject[j..]
            .char_indices()
            .find(|(_, c)| !js_space(*c))
            .map_or(subject.len() - j, |(p, _)| p);
        let matched = subject[j..].strip_prefix(key).and_then(|rest| {
            let k = j + key.len();
            let spaces = rest
                .char_indices()
                .find(|(_, c)| !js_space(*c))
                .map_or(rest.len(), |(p, _)| p);
            subject[k + spaces..]
                .starts_with("}}")
                .then_some(k + spaces + 2)
        });
        match matched {
            Some(end) => {
                out.push_str(&subject[last..start]);
                out.push_str(&expand_replacement(value, subject, start, end));
                last = end;
                i = end;
            }
            None => i = start + 1,
        }
    }
    out.push_str(&subject[last..]);
    out
}

/// The producer's subject interpolation, key by key in the given order.
pub fn interpolate_subject<'a>(
    template: &str,
    variables: impl IntoIterator<Item = (&'a String, &'a Value)>,
) -> String {
    let mut subject = template.to_owned();
    for (key, value) in variables {
        subject = replace_placeholder(&subject, key, &js_string(value));
    }
    subject
}

/// What [`enqueue`] did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Enqueued {
    Queued { id: String },
    NotQueued { reason: String },
}

impl Enqueued {
    pub fn id(&self) -> Option<&str> {
        match self {
            Self::Queued { id } => Some(id),
            Self::NotQueued { .. } => None,
        }
    }
}

async fn try_enqueue(
    pool: &MySqlPool,
    to_email: &str,
    to_name: &str,
    template_name: &str,
    variables: &Map<String, Value>,
    scheduled_at: Option<DateTime<Utc>>,
) -> anyhow::Result<Enqueued> {
    if is_marketing_category(template_name) && is_email_suppressed(pool, to_email).await {
        tracing::info!(
            template_name,
            to_email,
            "suppressed marketing email (unsubscribed)"
        );
        return Ok(Enqueued::NotQueued {
            reason: "recipient_unsubscribed".into(),
        });
    }
    let template = sqlx::query!(
        r#"SELECT id, subject, template_content AS "content: Value"
           FROM email_templates WHERE name = ? AND is_active = 1
           ORDER BY id LIMIT 1"#,
        template_name
    )
    .fetch_optional(pool)
    .await?;
    let Some(template) = template else {
        tracing::warn!(
            template_name,
            "email template not found or inactive; not queued"
        );
        return Ok(Enqueued::NotQueued {
            reason: format!("Template '{template_name}' not found"),
        });
    };
    // A string is parsed (bad JSON → {}); null makes Node's property access throw.
    let content = match template.content {
        Value::String(s) => serde_json::from_str(&s).unwrap_or_else(|_| json!({})),
        other => other,
    };
    if content.is_null() {
        anyhow::bail!("Cannot read properties of null (reading 'html_content')");
    }
    let field = |k: &str| {
        content
            .get(k)
            .filter(|v| truthy(Some(v)))
            .cloned()
            .unwrap_or_else(|| json!(""))
    };
    let email_content = json!({
        "html_content": field("html_content"),
        "text_content": field("text_content"),
        "priority": "normal",
    });
    let subject = interpolate_subject(&template.subject, variables);
    let id = uuid_v4()?;
    sqlx::query!(
        "INSERT INTO email_queue
           (id, to_email, to_name, subject, email_content, template_id, template_data, status,
            attempts, max_attempts, scheduled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 3, COALESCE(?, NOW()))",
        id,
        to_email,
        to_name,
        subject,
        email_content.to_string(),
        template.id,
        Value::Object(variables.clone()).to_string(),
        scheduled_at
    )
    .execute(pool)
    .await?;
    tracing::info!(subject, to_email, template_name, "email queued");
    Ok(Enqueued::Queued { id })
}

/// `emailQueueProducer.enqueue(toEmail, toName, templateName, variables,
/// scheduledAt)`. Never fails: errors are logged and returned as `NotQueued`.
pub async fn enqueue(
    pool: &MySqlPool,
    to_email: &str,
    to_name: &str,
    template_name: &str,
    variables: &Map<String, Value>,
    scheduled_at: Option<DateTime<Utc>>,
) -> Enqueued {
    match try_enqueue(
        pool,
        to_email,
        to_name,
        template_name,
        variables,
        scheduled_at,
    )
    .await
    {
        Ok(result) => result,
        Err(err) => {
            tracing::error!(error = %format!("{err:#}"), template_name, "failed to enqueue email");
            Enqueued::NotQueued {
                reason: err.to_string(),
            }
        }
    }
}

// --- unsubscribe links -------------------------------------------------------

fn base64url(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// `buildUnsubscribeToken(email)`: base64url HMAC-SHA256 of
/// `unsubscribe:<normalized email>` keyed with `JWT_SECRET`.
pub fn unsubscribe_token(key: &JwtKey, email: &str) -> anyhow::Result<String> {
    let secret = key.secret().ok_or_else(|| {
        anyhow::anyhow!("JWT_SECRET is not set — refusing to build/verify unsubscribe tokens")
    })?;
    let message = format!("unsubscribe:{}", normalize_email(email));
    Ok(base64url(&hmac_sha256(secret, message.as_bytes())))
}

/// `verifyUnsubscribeToken(email, token)`, constant-time.
pub fn verify_unsubscribe_token(key: &JwtKey, email: &str, token: &str) -> anyhow::Result<bool> {
    if email.is_empty() || token.is_empty() {
        return Ok(false);
    }
    let expected = unsubscribe_token(key, email)?;
    let (a, b) = (expected.as_bytes(), token.as_bytes());
    if a.len() != b.len() {
        return Ok(false);
    }
    Ok(a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0)
}

/// `URLSearchParams` serialization of one value.
fn form_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'*' | b'-' | b'.' | b'_' | b'0'..=b'9' | b'A'..=b'Z' | b'a'..=b'z' => {
                out.push(b as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// The storefront origin emails link to: `FRONTEND_URL || NEXTAUTH_URL ||
/// http://localhost:3000`, without a trailing slash.
pub fn storefront_url() -> String {
    let pick = |name: &str| std::env::var(name).ok().filter(|v| !v.is_empty());
    let base = pick("FRONTEND_URL")
        .or_else(|| pick("NEXTAUTH_URL"))
        .unwrap_or_else(|| "http://localhost:3000".into());
    base.strip_suffix('/').map(str::to_owned).unwrap_or(base)
}

/// `buildUnsubscribeUrl(email)`.
pub fn unsubscribe_url(key: &JwtKey, email: &str) -> anyhow::Result<String> {
    Ok(format!(
        "{}/unsubscribe?email={}&token={}",
        storefront_url(),
        form_encode(&normalize_email(email)),
        form_encode(&unsubscribe_token(key, email)?)
    ))
}

// --- abandoned carts -------------------------------------------------------

/// `parseFloat` of a string that only holds digits, `.` and `-`.
fn parse_float_prefix(s: &str) -> f64 {
    let b = s.as_bytes();
    let mut i = usize::from(b.first() == Some(&b'-'));
    let digits_start = i;
    while b.get(i).is_some_and(u8::is_ascii_digit) {
        i += 1;
    }
    let mut end = i;
    if b.get(i) == Some(&b'.') {
        let mut j = i + 1;
        while b.get(j).is_some_and(u8::is_ascii_digit) {
            j += 1;
        }
        if j > i + 1 || i > digits_start {
            end = j;
        }
    }
    s[..end].parse().unwrap_or(f64::NAN)
}

/// `formatAmount`: `"$123.4"` → `"123.40"`, anything unparseable `"0.00"`.
pub fn format_amount(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .collect();
    let n = parse_float_prefix(&cleaned);
    if n.is_finite() {
        common::json::js_to_fixed(n, 2)
    } else {
        "0.00".into()
    }
}

/// One cart line for the email summary.
#[derive(Debug, Clone)]
pub struct CartLine {
    pub name: String,
    pub quantity: i64,
}

/// `cartData` for [`queue_abandoned_cart_email`].
#[derive(Debug, Clone)]
pub struct AbandonedCart {
    pub items: Vec<CartLine>,
    /// e.g. `"$123.40"`.
    pub total_amount: String,
    pub checkout_url: Option<String>,
    pub customer_name: Option<String>,
}

/// Step → delay (`{ 1: 1h, 2: 24h, 3: 72h }[step] || 1h`).
pub fn sequence_delay(step: i64) -> Duration {
    match step {
        2 => Duration::hours(24),
        3 => Duration::hours(72),
        _ => Duration::hours(1),
    }
}

/// The abandoned_cart template variables (raw values; the daemon escapes them).
pub fn abandoned_cart_variables(
    key: &JwtKey,
    email: &str,
    cart: &AbandonedCart,
    step: i64,
) -> anyhow::Result<Map<String, Value>> {
    let name = cart
        .customer_name
        .clone()
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "Customer".into());
    let summary = cart
        .items
        .iter()
        .map(|i| format!("{} × {}", i.name, i.quantity))
        .collect::<Vec<_>>()
        .join(", ");
    let mut v = Map::new();
    v.insert("customer_name".into(), json!(name));
    v.insert("item_count".into(), json!(cart.items.len()));
    v.insert("item_summary".into(), json!(summary));
    v.insert(
        "cart_total".into(),
        json!(format_amount(&cart.total_amount)),
    );
    // `recovery_link: undefined` is dropped by JSON.stringify.
    if let Some(url) = &cart.checkout_url {
        v.insert("recovery_link".into(), json!(url));
    }
    v.insert(
        "unsubscribe_link".into(),
        json!(unsubscribe_url(key, email)?),
    );
    v.insert("sequence_step".into(), json!(step));
    Ok(v)
}

/// `queueAbandonedCartEmail(email, cartData, step)`: the queued id, or `None`
/// when the recipient unsubscribed or the template is missing.
pub async fn queue_abandoned_cart_email(
    pool: &MySqlPool,
    key: &JwtKey,
    email: &str,
    cart: &AbandonedCart,
    step: i64,
) -> anyhow::Result<Option<String>> {
    let scheduled_at = Utc::now() + sequence_delay(step);
    let scheduled_at =
        DateTime::from_timestamp_millis(scheduled_at.timestamp_millis()).unwrap_or(scheduled_at);
    let variables = abandoned_cart_variables(key, email, cart, step)?;
    let to_name = cart.customer_name.as_deref().unwrap_or("");
    let result = enqueue(
        pool,
        email,
        to_name,
        ABANDONED_CART_TEMPLATE,
        &variables,
        Some(scheduled_at),
    )
    .await;
    if let Enqueued::NotQueued { reason } = &result {
        tracing::info!(email, step, reason, "abandoned cart email not queued");
    }
    Ok(result.id().map(str::to_owned))
}

/// `cancelAbandonedCartEmails(email)`: pending abandoned-cart emails for the
/// address become `cancelled`; returns how many (0 on a database error, as Node).
pub async fn cancel_abandoned_cart_emails(pool: &MySqlPool, email: &str) -> u64 {
    let result = sqlx::query!(
        "UPDATE email_queue SET status = 'cancelled'
         WHERE to_email = ?
           AND template_id IN (SELECT id FROM email_templates WHERE name = ?)
           AND status = 'pending'",
        email,
        ABANDONED_CART_TEMPLATE
    )
    .execute(pool)
    .await;
    match result {
        Ok(r) => r.rows_affected(),
        Err(err) => {
            tracing::error!(error = %err, "failed to cancel abandoned cart emails");
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subject_interpolation_matches_string_replace() {
        let fx = crate::cookies::tests::fixtures();
        let cases = fx["subject"].as_array().unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            let vars = case["variables"].as_object().unwrap();
            // Node iterates in insertion order; the fixtures keep one key each
            // or order-independent keys.
            assert_eq!(
                interpolate_subject(case["template"].as_str().unwrap(), vars),
                case["subject"].as_str().unwrap(),
                "{case}"
            );
        }
    }

    #[test]
    fn marketing_and_amounts() {
        assert!(is_marketing_category("abandoned_cart"));
        assert!(is_marketing_category("Spring_PROMO"));
        assert!(!is_marketing_category("order_confirmation"));
        assert!(!is_marketing_category("password_reset"));
        let fx = crate::cookies::tests::fixtures();
        for case in fx["format_amount"].as_array().unwrap() {
            assert_eq!(
                format_amount(case[0].as_str().unwrap()),
                case[1].as_str().unwrap(),
                "{case}"
            );
        }
    }

    #[test]
    fn unsubscribe_links_match_node() {
        let fx = crate::cookies::tests::fixtures();
        let key = JwtKey::from_secret(fx["secret"].as_str());
        for case in fx["unsubscribe"].as_array().unwrap() {
            let email = case["email"].as_str().unwrap();
            assert_eq!(
                unsubscribe_token(&key, email).unwrap(),
                case["token"].as_str().unwrap()
            );
            assert!(
                verify_unsubscribe_token(&key, email, case["token"].as_str().unwrap()).unwrap()
            );
            assert!(!verify_unsubscribe_token(&key, email, "x").unwrap());
            let query = case["url"].as_str().unwrap().split_once('?').unwrap().1;
            let ours = unsubscribe_url(&key, email).unwrap();
            assert_eq!(ours.split_once('?').unwrap().1, query, "{email}");
        }
        assert!(unsubscribe_token(&JwtKey::from_secret(None), "a@b.c").is_err());
    }

    #[test]
    fn uuids_are_v4() {
        let id = uuid_v4().unwrap();
        assert_eq!(id.len(), 36);
        assert_eq!(&id[14..15], "4");
        assert!(matches!(&id[19..20], "8" | "9" | "a" | "b"));
    }

    async fn pool() -> MySqlPool {
        MySqlPool::connect(&std::env::var("DATABASE_URL").expect("DATABASE_URL"))
            .await
            .unwrap()
    }

    #[tokio::test]
    #[ignore = "needs DATABASE_URL (seeded MySQL)"]
    async fn enqueue_writes_the_node_row() {
        let pool = pool().await;
        let to = format!(
            "rust-enqueue-{}@example.com",
            Utc::now().timestamp_nanos_opt().unwrap()
        );
        let mut vars = Map::new();
        vars.insert("first_name".into(), json!("Ada"));
        vars.insert("verify_link".into(), json!("http://x/verify?token=t"));
        let queued = enqueue(&pool, &to, "Ada", "email_verification", &vars, None).await;
        let id = queued.id().expect("queued").to_owned();
        let row = sqlx::query!(
            r#"SELECT to_name, subject, status AS "status: String", attempts, max_attempts,
                      template_data AS "data: Value", email_content AS "content: Value",
                      TIMESTAMPDIFF(SECOND, scheduled_at, NOW()) AS "age!: i64"
               FROM email_queue WHERE id = ?"#,
            id
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.to_name.as_deref(), Some("Ada"));
        assert_eq!(row.status, "pending");
        assert_eq!((row.attempts, row.max_attempts), (Some(0), Some(3)));
        assert_eq!(row.data, Some(Value::Object(vars.clone())));
        assert_eq!(row.content["priority"], "normal");
        assert!(row.age.abs() < 5, "scheduled now");
        assert!(!row.subject.contains("{{"), "{}", row.subject);

        let missing = enqueue(&pool, &to, "", "no_such_template", &vars, None).await;
        assert_eq!(
            missing,
            Enqueued::NotQueued {
                reason: "Template 'no_such_template' not found".into()
            }
        );

        // Abandoned-cart sequence: suppression, scheduling, cancellation.
        let key = JwtKey::from_secret(Some("test-secret"));
        let cart = AbandonedCart {
            items: vec![CartLine {
                name: "Silk Pillowcase".into(),
                quantity: 2,
            }],
            total_amount: "$59.90".into(),
            checkout_url: Some("http://localhost:3000/checkout".into()),
            customer_name: Some("Ada".into()),
        };
        let step3 = queue_abandoned_cart_email(&pool, &key, &to, &cart, 3)
            .await
            .unwrap()
            .unwrap();
        let hours = sqlx::query_scalar!(
            r#"SELECT TIMESTAMPDIFF(MINUTE, NOW(), scheduled_at) AS "m!: i64" FROM email_queue WHERE id = ?"#,
            step3
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            (71 * 60..=72 * 60).contains(&hours),
            "72h later, got {hours} min"
        );
        assert_eq!(cancel_abandoned_cart_emails(&pool, &to).await, 1);
        assert_eq!(cancel_abandoned_cart_emails(&pool, &to).await, 0);

        sqlx::query!(
            "INSERT INTO email_unsubscribes (id, email, token, scope, reason) VALUES (?, ?, 't', 'marketing', 'test')",
            uuid_v4().unwrap(),
            to
        )
        .execute(&pool)
        .await
        .unwrap();
        assert!(is_email_suppressed(&pool, &to.to_uppercase()).await);
        assert_eq!(
            queue_abandoned_cart_email(&pool, &key, &to, &cart, 1)
                .await
                .unwrap(),
            None
        );
        // Transactional email still goes out to an unsubscribed address.
        assert!(
            enqueue(&pool, &to, "Ada", "email_verification", &vars, None)
                .await
                .id()
                .is_some()
        );

        sqlx::query!("DELETE FROM email_unsubscribes WHERE email = ?", to)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query!("DELETE FROM email_queue WHERE to_email = ?", to)
            .execute(&pool)
            .await
            .unwrap();
    }
}
