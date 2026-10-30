//! Stripe, the way backend/services/stripeService.js uses it through the
//! stripe-node 20.3.1 SDK (`new Stripe(key, { apiVersion: '2024-12-18.acacia' })`),
//! over `reqwest`:
//!
//! * **Configuration**: `new Stripe(key)` throws without a key, so the service
//!   is "constructed" ([`Stripe::is_constructed`], what the webhook needs) only
//!   with a non-empty `STRIPE_SECRET_KEY`; it is "available" for API calls
//!   ([`Stripe::is_available`]) unless the key is the `.env.example`
//!   placeholder (`…your-stripe…`). `STRIPE_WEBHOOK_SECRET` signs webhooks.
//! * **Requests** as the SDK sends them: `application/x-www-form-urlencoded`
//!   bodies from its `stringifyRequestData` ([`encode_form`]: `a[b][0]=…`,
//!   brackets left readable, `!*()'` escaped, `null` as an empty value,
//!   numbers as JavaScript prints them), path ids through
//!   `encodeURIComponent`, `Stripe-Version`, `Authorization: Bearer`, and an
//!   `Idempotency-Key: stripe-node-retry-<uuid>` on every POST (kept across
//!   retries).
//! * **Retries**: up to 2 (the SDK's `maxNetworkRetries` default) on
//!   connection errors, 409 and 5xx, honouring `Stripe-Should-Retry` and a
//!   `Retry-After` of at most 60 s, sleeping 0.5 s (its backoff for the first
//!   two retries); 80 s per attempt.
//! * **Responses**: JSON parsed like `JSON.parse`; a truthy `error` member is
//!   the thrown error (its `message`, or `error_description` for OAuth-style
//!   string errors); unparsable JSON is `Invalid JSON received from the Stripe
//!   API`; a dead connection `An error occurred with our connection to
//!   Stripe. Request was retried N times.` The routes answer `err.message`.
//! * **Webhooks** ([`construct_event`]): `stripe.webhooks.constructEvent`
//!   with the default 300 s tolerance — `t=`/`v1=` parsing, HMAC-SHA256 over
//!   `` `${t}.${payload}` ``, and every error message, including the SDK's
//!   quirks (a `v1` without a value throws, a non-numeric `t` is never too
//!   old, a parsed-object body is signed as `"[object Object]"`).
//!
//! `STRIPE_API_BASE` (default `https://api.stripe.com`) exists for tests only:
//! the parity suite points both services at one local fake Stripe.

use std::sync::LazyLock;
use std::time::Duration;

use reqwest::Method;
use serde_json::Value;

pub use crate::v8_json::parse as json_parse;

use crate::body::truthy;

/// The `apiVersion` stripeService.js pins.
pub const API_VERSION: &str = "2024-12-18.acacia";
const DEFAULT_BASE: &str = "https://api.stripe.com";
/// stripe-node's `maxNetworkRetries` default.
const MAX_NETWORK_RETRIES: u32 = 2;
/// stripe-node's `timeout` default.
const TIMEOUT_MS: u64 = 80_000;
const INITIAL_RETRY_DELAY_SECS: f64 = 0.5;
const MAX_RETRY_DELAY_SECS: f64 = 5.0;
const MAX_RETRY_AFTER_SECS: f64 = 60.0;
/// `Webhook.DEFAULT_TOLERANCE`, in seconds.
pub const TOLERANCE_SECS: f64 = 300.0;
const USER_AGENT: &str = "Stripe/v1 NodeTexeureRust/0.1.0";

/// The service, from the environment (read once, like the Node module).
pub static STRIPE: LazyLock<Stripe> = LazyLock::new(Stripe::from_env);

/// A thrown Stripe error: what `err.message` is (a string in practice; the
/// API's `message` member as given otherwise, `''` when absent).
#[derive(Debug, Clone, PartialEq)]
pub struct StripeError {
    pub message: Value,
}

impl StripeError {
    fn text(message: impl Into<String>) -> Self {
        Self {
            message: Value::String(message.into()),
        }
    }
}

/// A request parameter as `stringifyRequestData` walks it.
#[derive(Debug, Clone, PartialEq)]
pub enum Param {
    /// Skipped.
    Undefined,
    /// `key=`.
    Null,
    Bool(bool),
    /// `String(n)`: `1e+21`, `NaN`.
    Num(f64),
    Str(String),
    /// `key[0]=…&key[1]=…`.
    List(Vec<Param>),
    /// `key[k]=…`, in insertion order.
    Obj(Vec<(String, Param)>),
}

impl Param {
    pub fn str(s: impl Into<String>) -> Self {
        Self::Str(s.into())
    }

    /// A value that came from JSON or a database row (`None` is `undefined`).
    pub fn from_json(v: Option<&Value>) -> Self {
        match v {
            None => Self::Undefined,
            Some(Value::Null) => Self::Null,
            Some(Value::Bool(b)) => Self::Bool(*b),
            Some(Value::Number(n)) => Self::Num(n.as_f64().unwrap_or(f64::NAN)),
            Some(Value::String(s)) => Self::Str(s.clone()),
            Some(Value::Array(items)) => {
                Self::List(items.iter().map(|v| Self::from_json(Some(v))).collect())
            }
            Some(Value::Object(map)) => Self::Obj(
                map.iter()
                    .map(|(k, v)| (k.clone(), Self::from_json(Some(v))))
                    .collect(),
            ),
        }
    }
}

/// `encodeURIComponent`.
pub fn encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// stripe-node's `encodeQueryValue`: `encodeURIComponent`, then `!*()'`
/// escaped and `[`/`]` put back.
fn encode_query_value(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~[]".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// `stringifyRequestData(data)` for a top-level object.
pub fn encode_form(data: &[(String, Param)]) -> String {
    fn walk(key: &str, value: &Param, pairs: &mut Vec<String>) {
        let scalar = match value {
            Param::Undefined => return,
            Param::Null => String::new(),
            Param::Bool(b) => b.to_string(),
            Param::Num(n) => common::json::js_number_string(*n),
            Param::Str(s) => s.clone(),
            Param::List(items) => {
                for (i, item) in items.iter().enumerate() {
                    walk(&format!("{key}[{i}]"), item, pairs);
                }
                return;
            }
            Param::Obj(fields) => {
                for (k, v) in fields {
                    walk(&format!("{key}[{k}]"), v, pairs);
                }
                return;
            }
        };
        pairs.push(format!(
            "{}={}",
            encode_query_value(key),
            encode_query_value(&scalar)
        ));
    }
    let mut pairs = Vec::new();
    for (k, v) in data {
        walk(k, v, &mut pairs);
    }
    pairs.join("&")
}

/// JavaScript `Math.round`: nearest integer, halves toward +∞.
pub fn js_round(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let floor = x.floor();
    if x - floor >= 0.5 { floor + 1.0 } else { floor }
}

/// A line item as the route builds it (`{ name, quantity, unitAmount }`).
#[derive(Debug, Clone, PartialEq)]
pub struct LineItem {
    pub name: Param,
    pub quantity: Param,
    pub unit_amount: f64,
}

/// One request as it goes out (method, path with query, form body).
#[derive(Debug, Clone, PartialEq)]
pub struct Outgoing {
    pub method: Method,
    pub path: String,
    pub body: String,
}

/// `stripe.checkout.sessions.create({...})` as createCheckoutSession builds it.
pub fn checkout_session_request(
    order_id: &str,
    line_items: &[LineItem],
    customer_email: Param,
    success_url: &str,
    cancel_url: &str,
) -> Outgoing {
    let items = line_items
        .iter()
        .map(|item| {
            Param::Obj(vec![
                (
                    "price_data".into(),
                    Param::Obj(vec![
                        ("currency".into(), Param::str("usd")),
                        (
                            "product_data".into(),
                            Param::Obj(vec![("name".into(), item.name.clone())]),
                        ),
                        ("unit_amount".into(), Param::Num(js_round(item.unit_amount))),
                    ]),
                ),
                ("quantity".into(), item.quantity.clone()),
            ])
        })
        .collect();
    let data = vec![
        (
            "payment_method_types".into(),
            Param::List(vec![Param::str("card")]),
        ),
        ("mode".into(), Param::str("payment")),
        ("customer_email".into(), customer_email),
        ("line_items".into(), Param::List(items)),
        (
            "metadata".into(),
            Param::Obj(vec![("orderId".into(), Param::str(order_id))]),
        ),
        ("success_url".into(), Param::str(success_url)),
        ("cancel_url".into(), Param::str(cancel_url)),
    ];
    Outgoing {
        method: Method::POST,
        path: "/v1/checkout/sessions".into(),
        body: encode_form(&data),
    }
}

/// `stripe.paymentIntents.create({...})` as createPaymentIntent builds it.
pub fn payment_intent_request(
    amount: f64,
    currency: &str,
    metadata: Vec<(String, Param)>,
) -> Outgoing {
    let data = vec![
        ("amount".into(), Param::Num(js_round(amount))),
        ("currency".into(), Param::str(currency)),
        ("metadata".into(), Param::Obj(metadata)),
        (
            "automatic_payment_methods".into(),
            Param::Obj(vec![("enabled".into(), Param::Bool(true))]),
        ),
    ];
    Outgoing {
        method: Method::POST,
        path: "/v1/payment_intents".into(),
        body: encode_form(&data),
    }
}

/// `stripe.refunds.create({...})` as processRefund builds it: `amount` only
/// when truthy (so `0` and `NaN` refund in full).
pub fn refund_request(payment_intent: &str, amount: Option<f64>) -> Outgoing {
    let mut data = vec![("payment_intent".into(), Param::str(payment_intent))];
    if let Some(a) = amount.filter(|a| *a != 0.0 && !a.is_nan()) {
        data.push(("amount".into(), Param::Num(js_round(a))));
    }
    Outgoing {
        method: Method::POST,
        path: "/v1/refunds".into(),
        body: encode_form(&data),
    }
}

/// `stripe.checkout.sessions.retrieve(id, { expand: [...] })`.
pub fn retrieve_session_request(session_id: &str) -> Outgoing {
    Outgoing {
        method: Method::GET,
        path: format!(
            "/v1/checkout/sessions/{}?expand[0]=payment_intent&expand[1]=line_items",
            encode_uri_component(session_id)
        ),
        body: String::new(),
    }
}

/// What the SDK resolves or throws for a response (`_jsonResponseHandler`).
pub fn map_response(text: &str) -> Result<Value, StripeError> {
    let Ok(json) = json_parse(text) else {
        return Err(StripeError::text(
            "Invalid JSON received from the Stripe API",
        ));
    };
    let error = match &json {
        Value::Null => {
            return Err(StripeError::text(
                "Cannot read properties of null (reading 'error')",
            ));
        }
        Value::Object(map) => map.get("error"),
        _ => None,
    };
    if !truthy(error) {
        return Ok(json);
    }
    let message = match error.expect("truthy") {
        // OAuth errors: `{ error: 'invalid_grant', error_description }`.
        Value::String(_) => json.get("error_description").cloned(),
        Value::Object(e) => e.get("message").cloned(),
        Value::Array(_) => None,
        // `jsonResponse.error.headers = …` on a primitive, in strict mode.
        other => {
            let kind = if other.is_boolean() {
                "boolean"
            } else {
                "number"
            };
            return Err(StripeError::text(format!(
                "Cannot create property 'headers' on {kind} '{}'",
                crate::body::js_string(other)
            )));
        }
    };
    Err(StripeError {
        message: match message {
            None | Some(Value::Null) => Value::String(String::new()),
            Some(v) => v,
        },
    })
}

/// `_shouldRetry` for an answered request.
fn should_retry(status: u16, should_retry: Option<&str>, retries: u32) -> bool {
    if retries >= MAX_NETWORK_RETRIES {
        return false;
    }
    match should_retry {
        Some("false") => return false,
        Some("true") => return true,
        _ => {}
    }
    status == 409 || status >= 500
}

/// `_getSleepTimeInMS(numRetries, retryAfter)` with the jitter factor given
/// (0.5..=1.0; it never shortens the 0.5 s base).
fn sleep_secs(retries: u32, retry_after: Option<f64>, jitter: f64) -> f64 {
    let exp = f64::from(retries) - 1.0;
    let mut secs = (INITIAL_RETRY_DELAY_SECS * 2f64.powf(exp)).min(MAX_RETRY_DELAY_SECS);
    secs *= jitter;
    secs = secs.max(INITIAL_RETRY_DELAY_SECS);
    if let Some(after) = retry_after
        && after.fract() == 0.0
        && after <= MAX_RETRY_AFTER_SECS
    {
        secs = secs.max(after);
    }
    secs
}

fn jitter() -> f64 {
    let mut b = [0u8; 4];
    let r = getrandom::getrandom(&mut b).map_or(0.5, |()| {
        f64::from(u32::from_le_bytes(b)) / f64::from(u32::MAX)
    });
    0.5 * (1.0 + r)
}

/// The Stripe client.
pub struct Stripe {
    key: Option<String>,
    base: String,
    http: reqwest::Client,
}

impl Stripe {
    pub fn new(key: Option<String>, base: impl Into<String>) -> Self {
        Self {
            key,
            base: base.into().trim_end_matches('/').to_owned(),
            http: reqwest::Client::builder()
                .timeout(Duration::from_millis(TIMEOUT_MS))
                .build()
                .expect("reqwest client"),
        }
    }

    /// `STRIPE_SECRET_KEY` (and the test-only `STRIPE_API_BASE`).
    pub fn from_env() -> Self {
        Self::new(
            std::env::var("STRIPE_SECRET_KEY").ok(),
            std::env::var("STRIPE_API_BASE")
                .ok()
                .filter(|b| !b.is_empty())
                .unwrap_or_else(|| DEFAULT_BASE.into()),
        )
    }

    /// stripeService's `stripe !== null`: `new Stripe(key)` only throws for a
    /// missing or empty key.
    pub fn is_constructed(&self) -> bool {
        self.key.as_deref().is_some_and(|k| !k.is_empty())
    }

    /// stripeService's `isAvailable()`.
    pub fn is_available(&self) -> bool {
        self.is_constructed() && !self.key.as_deref().unwrap_or("").contains("your-stripe")
    }

    fn require_available(&self, message: &str) -> Result<(), StripeError> {
        if self.is_available() {
            Ok(())
        } else {
            Err(StripeError::text(message))
        }
    }

    /// createCheckoutSession(orderId, lineItems, customerEmail, successUrl, cancelUrl)
    pub async fn create_checkout_session(
        &self,
        order_id: &str,
        line_items: &[LineItem],
        customer_email: Param,
        success_url: &str,
        cancel_url: &str,
    ) -> Result<Value, StripeError> {
        self.require_available("Stripe is not configured. Please add valid API keys to .env")?;
        self.send(&checkout_session_request(
            order_id,
            line_items,
            customer_email,
            success_url,
            cancel_url,
        ))
        .await
    }

    /// createPaymentIntent(amount, currency, metadata)
    pub async fn create_payment_intent(
        &self,
        amount: f64,
        currency: &str,
        metadata: Vec<(String, Param)>,
    ) -> Result<Value, StripeError> {
        self.require_available("Stripe is not configured. Please add valid API keys to .env")?;
        self.send(&payment_intent_request(amount, currency, metadata))
            .await
    }

    /// processRefund(paymentIntentId, amount)
    pub async fn process_refund(
        &self,
        payment_intent: &str,
        amount: Option<f64>,
    ) -> Result<Value, StripeError> {
        self.require_available("Stripe is not configured. Please add valid API keys to .env")?;
        self.send(&refund_request(payment_intent, amount)).await
    }

    /// getCheckoutSession(sessionId)
    pub async fn get_checkout_session(&self, session_id: &str) -> Result<Value, StripeError> {
        self.require_available("Stripe is not configured")?;
        self.send(&retrieve_session_request(session_id)).await
    }

    /// One API call with the SDK's headers, retries and response handling.
    pub async fn send(&self, req: &Outgoing) -> Result<Value, StripeError> {
        let key = self.key.clone().unwrap_or_default();
        let idempotency_key = if req.method == Method::POST {
            Some(format!(
                "stripe-node-retry-{}",
                crate::email_queue::uuid_v4().map_err(|e| StripeError::text(e.to_string()))?
            ))
        } else {
            None
        };
        let url = format!("{}{}", self.base, req.path);
        let mut retries = 0;
        loop {
            let mut builder = self
                .http
                .request(req.method.clone(), &url)
                .header("Accept", "application/json")
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("User-Agent", USER_AGENT)
                .header("Stripe-Version", API_VERSION)
                .header("Authorization", format!("Bearer {key}"));
            if let Some(k) = &idempotency_key {
                builder = builder.header("Idempotency-Key", k);
            }
            if req.method == Method::POST {
                builder = builder.body(req.body.clone());
            }
            match builder.send().await {
                Ok(res) => {
                    let status = res.status().as_u16();
                    let header = |name: &str| {
                        res.headers()
                            .get(name)
                            .map(|v| String::from_utf8_lossy(v.as_bytes()).into_owned())
                    };
                    let hint = header("stripe-should-retry");
                    if should_retry(status, hint.as_deref(), retries) {
                        let after = header("retry-after")
                            .map(|v| crate::body::js_to_number(&Value::String(v)));
                        let secs = sleep_secs(retries, after, jitter());
                        tokio::time::sleep(Duration::from_secs_f64(secs)).await;
                        retries += 1;
                        continue;
                    }
                    let bytes = res.bytes().await.map_err(|err| {
                        tracing::warn!(%err, "stripe: reading the response failed");
                        StripeError::text("Invalid JSON received from the Stripe API")
                    })?;
                    return map_response(&String::from_utf8_lossy(&bytes));
                }
                Err(err) => {
                    tracing::warn!(%err, retries, "stripe: request failed");
                    if retries < MAX_NETWORK_RETRIES {
                        let secs = sleep_secs(retries, None, jitter());
                        tokio::time::sleep(Duration::from_secs_f64(secs)).await;
                        retries += 1;
                        continue;
                    }
                    return Err(StripeError::text(if err.is_timeout() {
                        format!("Request aborted due to timeout being reached ({TIMEOUT_MS}ms)")
                    } else if retries > 0 {
                        format!(
                            "An error occurred with our connection to Stripe. Request was retried {retries} times."
                        )
                    } else {
                        "An error occurred with our connection to Stripe.".to_owned()
                    }));
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/// What reaches `constructEvent` as `req.body`.
#[derive(Debug, Clone, Copy)]
pub enum Payload<'a> {
    /// The raw body (`express.raw` produced a Buffer).
    Raw(&'a [u8]),
    /// Something a body parser already parsed (`{}` at least).
    Parsed(&'a Value),
}

/// stripeService's `constructWebhookEvent(rawBody, signature)`: the checks it
/// makes before handing over to the SDK.
pub fn construct_webhook_event(
    stripe: &Stripe,
    webhook_secret: Option<&str>,
    payload: Payload<'_>,
    header: Option<&str>,
    now_ms: f64,
) -> Result<Value, String> {
    if !stripe.is_constructed() {
        return Err("Stripe is not configured".into());
    }
    let secret = webhook_secret.unwrap_or("");
    if secret.is_empty() || secret.contains("your-stripe") {
        return Err("Stripe webhook secret is not configured".into());
    }
    construct_event(payload, header, secret, now_ms)
}

/// TextDecoder('utf8').decode: lossy, a leading BOM dropped.
fn text_decode(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    String::from_utf8_lossy(bytes).into_owned()
}

/// `parseInt(s, 10)`.
fn parse_int_10(s: Option<&str>) -> f64 {
    let Some(s) = s else { return f64::NAN };
    let t = s.trim_start_matches(crate::express::is_js_space);
    let (sign, digits) = match t.as_bytes().first() {
        Some(b'-') => (-1.0, &t[1..]),
        Some(b'+') => (1.0, &t[1..]),
        _ => (1.0, t),
    };
    let end = digits
        .bytes()
        .position(|b| !b.is_ascii_digit())
        .unwrap_or(digits.len());
    if end == 0 {
        return f64::NAN;
    }
    sign * digits[..end].parse::<f64>().unwrap_or(f64::NAN)
}

const DOCS: &str = "\nLearn more about webhook signing and explore webhook integration examples for various frameworks at https://docs.stripe.com/webhooks/signature";
const WHITESPACE_NOTE: &str = "\n\nNote: The provided signing secret contains whitespace. This often indicates an extra newline or space is in the value";

/// `stripe.webhooks.constructEvent(payload, header, secret)` at `now_ms`
/// (default tolerance): the parsed event, or the error's message.
pub fn construct_event(
    payload: Payload<'_>,
    header: Option<&str>,
    secret: &str,
    now_ms: f64,
) -> Result<Value, String> {
    if let Payload::Parsed(v) = payload
        && !truthy(Some(v))
    {
        return Err("No webhook payload was provided.".into());
    }
    let (text, suspect) = match payload {
        Payload::Raw(bytes) => (text_decode(bytes), false),
        Payload::Parsed(v) => (crate::body::js_string(v), true),
    };
    let header = match header {
        None | Some("") => return Err("No stripe-signature header value was provided.".into()),
        Some(h) => h,
    };
    let mut timestamp = -1.0;
    let mut signatures: Vec<Option<&str>> = Vec::new();
    for item in header.split(',') {
        let mut kv = item.split('=');
        let k = kv.next().unwrap_or("");
        let v = kv.next();
        if k == "t" {
            timestamp = parse_int_10(v);
        }
        if k == "v1" {
            signatures.push(v);
        }
    }
    if timestamp == -1.0 {
        return Err("Unable to extract timestamp and signatures from header".into());
    }
    if signatures.is_empty() {
        return Err("No signatures found with expected scheme".into());
    }
    let secret_has_whitespace = secret.chars().any(crate::express::is_js_space);
    let content = format!("{}.{text}", common::json::js_number_string(timestamp));
    let expected = crate::tokens::hex(&crate::tokens::hmac_sha256(
        secret.as_bytes(),
        content.as_bytes(),
    ));
    let mut found = false;
    for sig in &signatures {
        // NodePlatformFunctions.secureCompare(expected, sig).
        let sig = match sig {
            None | Some("") => return Err("secureCompare must receive two arguments".into()),
            Some(s) => *s,
        };
        if crate::express::js_len(sig) != expected.len() {
            continue;
        }
        if sig.len() != expected.len() {
            // Same UTF-16 length, different UTF-8 length: timingSafeEqual throws.
            return Err("Input buffers must have the same byte length".into());
        }
        // crypto.timingSafeEqual: no early exit on the first differing byte.
        found |= sig
            .bytes()
            .zip(expected.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0;
    }
    let whitespace = if secret_has_whitespace {
        WHITESPACE_NOTE
    } else {
        ""
    };
    if !found {
        return Err(if suspect {
            format!(
                "Webhook payload must be provided as a string or a Buffer (https://nodejs.org/api/buffer.html) instance representing the _raw_ request body.Payload was provided as a parsed JavaScript object instead. \nSignature verification is impossible without access to the original signed material. \n{DOCS}\n{whitespace}"
            )
        } else {
            format!(
                "No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe? \n If a webhook request is being forwarded by a third-party tool, ensure that the exact request body, including JSON formatting and new line style, is preserved.\n{DOCS}\n{whitespace}"
            )
        });
    }
    let age = (now_ms / 1000.0).floor() - timestamp;
    if age > TOLERANCE_SECS {
        return Err("Timestamp outside the tolerance zone".into());
    }
    json_parse(&text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use serde_json::json;

    fn fixtures() -> Value {
        serde_json::from_str(include_str!("../fixtures/payments_images.json")).unwrap()
    }

    /// `#NaN` / `#1e+21` in the recorded args are numbers JSON can't carry.
    fn num(v: &Value) -> f64 {
        match v {
            Value::String(s) if s.starts_with('#') => match &s[1..] {
                "NaN" => f64::NAN,
                other => other.parse().unwrap(),
            },
            other => other.as_f64().unwrap(),
        }
    }

    fn param(v: &Value) -> Param {
        match v {
            Value::String(s) if s.starts_with('#') => Param::Num(num(v)),
            Value::Object(m) => Param::Obj(m.iter().map(|(k, v)| (k.clone(), param(v))).collect()),
            other => Param::from_json(Some(other)),
        }
    }

    fn rebuild(case: &Value) -> Outgoing {
        let a = case["args"].as_array().unwrap();
        match case["fn"].as_str().unwrap() {
            "createCheckoutSession" => {
                let items: Vec<LineItem> = a[1]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|i| LineItem {
                        name: Param::from_json(i.get("name")),
                        quantity: Param::from_json(i.get("quantity")),
                        unit_amount: num(&i["unitAmount"]),
                    })
                    .collect();
                checkout_session_request(
                    a[0].as_str().unwrap(),
                    &items,
                    Param::from_json(Some(&a[2])),
                    a[3].as_str().unwrap(),
                    a[4].as_str().unwrap(),
                )
            }
            "createPaymentIntent" => {
                // Object key order matters for the form; keep the recorded order.
                let meta: Vec<(String, Param)> = ["orderId", "orderNumber"]
                    .iter()
                    .filter(|k| a[2].get(**k).is_some())
                    .map(|k| ((*k).to_owned(), param(&a[2][*k])))
                    .collect();
                payment_intent_request(num(&a[0]), a[1].as_str().unwrap(), meta)
            }
            "processRefund" => refund_request(
                a[0].as_str().unwrap(),
                a[1].as_f64().or_else(|| a[1].as_str().map(|_| num(&a[1]))),
            ),
            "getCheckoutSession" => retrieve_session_request(a[0].as_str().unwrap()),
            other => panic!("{other}"),
        }
    }

    #[test]
    fn requests_match_stripe_node() {
        let f = fixtures();
        for case in f["stripe"]["requests"].as_array().unwrap() {
            let sent = &case["sent"][0];
            let out = rebuild(case);
            let name = case["name"].as_str().unwrap();
            assert_eq!(out.method.as_str(), sent["method"], "{name}");
            assert_eq!(out.path, sent["path"], "{name}");
            assert_eq!(out.body, sent["body"], "{name}");
            if out.method == Method::POST {
                assert_eq!(
                    out.body.len().to_string(),
                    sent["headers"]["content-length"],
                    "{name}"
                );
                assert_eq!(sent["headers"]["idempotency-key"], "stripe-node-retry-UUID");
            }
            assert_eq!(sent["headers"]["stripe-version"], API_VERSION);
            assert_eq!(
                sent["headers"]["content-type"],
                "application/x-www-form-urlencoded"
            );
        }
    }

    #[test]
    fn responses_map_like_stripe_node() {
        let f = fixtures();
        for case in f["stripe"]["responses"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let last = case["answers"].as_array().unwrap().last().unwrap();
            let got = map_response(last["body"].as_str().unwrap());
            match case.get("error") {
                Some(message) => assert_eq!(got.unwrap_err().message, *message, "{name}"),
                None => assert_eq!(got.unwrap(), case["value"], "{name}"),
            }
        }
    }

    #[test]
    fn retry_policy() {
        assert!(should_retry(500, None, 0));
        assert!(should_retry(503, None, 1));
        assert!(!should_retry(500, None, 2));
        assert!(should_retry(409, None, 0));
        assert!(!should_retry(500, Some("false"), 0));
        assert!(should_retry(400, Some("true"), 0));
        assert!(!should_retry(402, None, 0));
        assert_eq!(sleep_secs(0, None, 1.0), 0.5);
        assert_eq!(sleep_secs(1, None, 0.5), 0.5);
        assert_eq!(sleep_secs(1, Some(3.0), 0.7), 3.0);
        assert_eq!(sleep_secs(1, Some(61.0), 0.7), 0.5);
        assert_eq!(sleep_secs(1, Some(1.5), 0.7), 0.5);
    }

    #[test]
    fn webhooks_match_stripe_node() {
        let f = fixtures();
        for case in f["webhooks"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let raw;
            let payload = match &case["payload"] {
                p if p.get("object").is_some() => Payload::Parsed(&p["object"]),
                p => {
                    raw = base64::engine::general_purpose::STANDARD
                        .decode(p["base64"].as_str().unwrap())
                        .unwrap();
                    Payload::Raw(&raw)
                }
            };
            let got = construct_event(
                payload,
                case["header"].as_str(),
                case["secret"].as_str().unwrap(),
                case["now"].as_f64().unwrap() * 1000.0,
            );
            match case.get("error") {
                Some(message) => assert_eq!(got.unwrap_err(), *message, "{name}"),
                None => assert_eq!(got.unwrap(), case["event"], "{name}"),
            }
        }
    }

    #[test]
    fn webhook_needs_configuration() {
        let off = Stripe::new(None, DEFAULT_BASE);
        let placeholder = Stripe::new(
            Some("sk_test_your-stripe-secret-key-here".into()),
            DEFAULT_BASE,
        );
        let empty = json!({});
        let p = Payload::Parsed(&empty);
        assert_eq!(
            construct_webhook_event(&off, Some("whsec_x"), p, Some("t=1"), 0.0).unwrap_err(),
            "Stripe is not configured"
        );
        assert!(!placeholder.is_available() && placeholder.is_constructed());
        for secret in [
            None,
            Some(""),
            Some("whsec_your-stripe-webhook-secret-here"),
        ] {
            assert_eq!(
                construct_webhook_event(&placeholder, secret, p, Some("t=1"), 0.0).unwrap_err(),
                "Stripe webhook secret is not configured"
            );
        }
    }

    #[test]
    fn js_numbers() {
        assert_eq!(js_round(1998.9999999999998), 1999.0);
        assert_eq!(js_round(-0.5), 0.0);
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert!(js_round(f64::NAN).is_nan());
        assert_eq!(parse_int_10(Some(" 12abc")), 12.0);
        assert!(parse_int_10(Some("abc")).is_nan());
        assert!(parse_int_10(None).is_nan());
        assert_eq!(parse_int_10(Some("-5")), -5.0);
    }

    /// A local fake Stripe: the client's headers, retries and error mapping.
    #[tokio::test]
    async fn client_against_a_fake_stripe() {
        use axum::http::HeaderMap;
        use std::sync::{Arc, Mutex};
        type Seen = Arc<Mutex<Vec<(String, HeaderMap, String)>>>;
        let seen: Seen = Arc::default();
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let app = {
            let seen = seen.clone();
            let calls = calls.clone();
            axum::Router::new().fallback(move |req: axum::extract::Request| {
                let seen = seen.clone();
                let calls = calls.clone();
                async move {
                    use axum::http::StatusCode;
                    use axum::response::IntoResponse;
                    let uri = req.uri().to_string();
                    let headers = req.headers().clone();
                    let body = axum::body::to_bytes(req.into_body(), 1 << 20).await.unwrap();
                    seen.lock().unwrap().push((
                        uri.clone(),
                        headers,
                        String::from_utf8_lossy(&body).into_owned(),
                    ));
                    let n = calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    let (status, text) = if uri.starts_with("/v1/refunds") && n == 0 {
                        (StatusCode::INTERNAL_SERVER_ERROR, r#"{"error":{"message":"boom"}}"#)
                    } else if uri.starts_with("/v1/checkout") {
                        (
                            StatusCode::NOT_FOUND,
                            r#"{"error":{"type":"invalid_request_error","message":"No such checkout.session: 'x'"}}"#,
                        )
                    } else {
                        (StatusCode::OK, r#"{"id":"re_1","amount":500,"status":"succeeded"}"#)
                    };
                    (status, text).into_response()
                }
            })
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let stripe = Stripe::new(Some("sk_test_fake".into()), format!("http://{addr}"));

        let refund = stripe.process_refund("pi_1", Some(500.0)).await.unwrap();
        assert_eq!(
            refund,
            json!({ "id": "re_1", "amount": 500, "status": "succeeded" })
        );
        {
            let seen = seen.lock().unwrap();
            assert_eq!(seen.len(), 2, "the 500 is retried");
            let key = |i: usize| seen[i].1["idempotency-key"].to_str().unwrap().to_owned();
            assert!(key(0).starts_with("stripe-node-retry-"));
            assert_eq!(key(0), key(1), "one idempotency key across retries");
            assert_eq!(seen[0].1["authorization"], "Bearer sk_test_fake");
            assert_eq!(seen[0].1["stripe-version"], API_VERSION);
            assert_eq!(
                seen[0].1["content-type"],
                "application/x-www-form-urlencoded"
            );
            assert_eq!(seen[0].2, "payment_intent=pi_1&amount=500");
        }
        let err = stripe.get_checkout_session("x").await.unwrap_err();
        assert_eq!(err.message, json!("No such checkout.session: 'x'"));
        {
            let seen = seen.lock().unwrap();
            let last = seen.last().unwrap();
            assert_eq!(
                last.0,
                "/v1/checkout/sessions/x?expand[0]=payment_intent&expand[1]=line_items"
            );
            assert!(!last.1.contains_key("idempotency-key"));
            assert_eq!(last.2, "");
        }

        // Nothing listening: two retries, then the SDK's connection message.
        let dead = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap()
        };
        let gone = Stripe::new(Some("sk_test_fake".into()), format!("http://{dead}"));
        let err = gone.process_refund("pi_1", None).await.unwrap_err();
        assert_eq!(err.message, f_connection());
        let placeholder = Stripe::new(
            Some("sk_test_your-stripe-key".into()),
            format!("http://{addr}"),
        );
        assert_eq!(
            placeholder
                .get_checkout_session("x")
                .await
                .unwrap_err()
                .message,
            json!("Stripe is not configured")
        );
    }

    fn f_connection() -> Value {
        fixtures()["stripe"]["connectionError"].clone()
    }
}
