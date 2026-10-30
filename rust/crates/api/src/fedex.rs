//! FedEx REST client — port of backend/services/shippingService.js.
//!
//! Configured when `FEDEX_CLIENT_ID` and `FEDEX_CLIENT_SECRET` are set and the
//! id is not a `your-fedex…` placeholder (read once, like the Node module).
//! Unconfigured, rates are the static [`default_rates`], labels get a `MOCK…`
//! tracking number and tracking answers a mock payload. Configured, the
//! OAuth token is cached until 60 s before it expires, and every request and
//! response field is mapped exactly as the Node service does (including what
//! JavaScript does with missing or oddly typed fields); rate lookups fall back
//! to the static rates on any failure, label and tracking failures surface
//! their error message.

use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use serde_json::{Map, Value, json};

use crate::body::{js_string, js_to_number, truthy};
use crate::express::template;

/// `DEFAULT_RATES`.
pub fn default_rates() -> Value {
    json!([
        {
            "serviceType": "STANDARD",
            "serviceName": "Standard Shipping",
            "deliveryDays": "5-7 business days",
            "rate": 9.99,
            "currency": "USD",
        },
        {
            "serviceType": "EXPRESS",
            "serviceName": "Express Shipping",
            "deliveryDays": "2-3 business days",
            "rate": 19.99,
            "currency": "USD",
        },
        {
            "serviceType": "OVERNIGHT",
            "serviceName": "Overnight Shipping",
            "deliveryDays": "1 business day",
            "rate": 34.99,
            "currency": "USD",
        },
    ])
}

/// `ORIGIN_ADDRESS` (the store).
fn origin_address() -> Value {
    json!({
        "streetLines": ["123 Store Street"],
        "city": "New York",
        "stateOrProvinceCode": "NY",
        "postalCode": "10001",
        "countryCode": "US",
    })
}

#[derive(Debug, Clone, Default)]
pub struct Config {
    pub api_url: String,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub account_number: Option<String>,
}

impl Config {
    /// `FEDEX_API_URL || sandbox`, the credentials as set (even empty).
    pub fn from_env() -> Self {
        let raw = |name: &str| std::env::var(name).ok();
        Self {
            api_url: raw("FEDEX_API_URL")
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| "https://apis-sandbox.fedex.com".into()),
            client_id: raw("FEDEX_CLIENT_ID"),
            client_secret: raw("FEDEX_CLIENT_SECRET"),
            account_number: raw("FEDEX_ACCOUNT_NUMBER"),
        }
    }

    /// `FEDEX_CLIENT_ID && FEDEX_CLIENT_SECRET && !id.includes('your-fedex')`.
    pub fn is_configured(&self) -> bool {
        match (&self.client_id, &self.client_secret) {
            (Some(id), Some(secret)) => {
                !id.is_empty() && !secret.is_empty() && !id.contains("your-fedex")
            }
            _ => false,
        }
    }
}

/// The token cache: `cachedToken` (a JS value, `None` = undefined) and
/// `tokenExpiry` (ms; NaN never matches).
#[derive(Debug)]
struct TokenCache {
    token: Option<Value>,
    expiry_ms: f64,
}

pub struct Fedex {
    config: Config,
    configured: bool,
    http: reqwest::Client,
    cache: Mutex<TokenCache>,
}

/// The process-wide service, configured from the environment on first use.
pub static SERVICE: LazyLock<Fedex> = LazyLock::new(|| {
    let service = Fedex::new(Config::from_env());
    if service.is_configured() {
        tracing::info!("FedEx shipping service initialized");
    } else {
        tracing::warn!("FedEx not configured (placeholder keys). Using static shipping rates.");
    }
    service
});

/// A label: `{ trackingNumber, labelUrl, mock }` (tracking number as FedEx
/// sent it; `None` = undefined).
#[derive(Debug, Clone, PartialEq)]
pub struct Shipment {
    pub tracking_number: Option<Value>,
    pub label_url: Value,
    pub mock: bool,
}

/// What `createShipment` gets from the route.
#[derive(Debug, Clone)]
pub struct ShipmentRequest {
    pub recipient: Value,
    pub recipient_name: String,
    /// `shippingAddress.phone || ''` (any JSON value).
    pub recipient_phone: Value,
    pub service_type: Value,
    pub packages: Vec<Value>,
}

fn now_ms() -> f64 {
    chrono::Utc::now().timestamp_millis() as f64
}

/// JS property access `v.key` on a JSON value (`None` = undefined). Reading a
/// property of `null`/`undefined` throws the V8 TypeError.
fn get<'a>(v: Option<&'a Value>, key: &str) -> Result<Option<&'a Value>, String> {
    match v {
        None => Err(format!(
            "Cannot read properties of undefined (reading '{key}')"
        )),
        Some(Value::Null) => Err(format!("Cannot read properties of null (reading '{key}')")),
        Some(v) => Ok(opt(Some(v), key)),
    }
}

/// `v?.key`.
fn opt<'a>(v: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    match v? {
        Value::Object(map) => map.get(key),
        Value::Array(items) => key.parse::<usize>().ok().and_then(|i| items.get(i)),
        _ => None,
    }
}

/// `v?.[0]` (a string's first character only matters as "not an object").
fn first(v: Option<&Value>) -> Option<Value> {
    match v? {
        Value::Array(items) => items.first().cloned(),
        Value::Object(map) => map.get("0").cloned(),
        Value::String(s) => s.chars().next().map(|c| Value::String(c.to_string())),
        _ => None,
    }
}

/// `a || b`.
fn or<'a>(a: Option<&'a Value>, b: Option<&'a Value>) -> Option<&'a Value> {
    if truthy(a) { a } else { b }
}

/// `parseFloat(x)` of a JSON value (via `String(x)`).
fn parse_float(v: &Value) -> f64 {
    let s = js_string(v);
    let s = crate::express::js_trim(&s);
    for (prefix, value) in [
        ("Infinity", f64::INFINITY),
        ("+Infinity", f64::INFINITY),
        ("-Infinity", f64::NEG_INFINITY),
    ] {
        if s.starts_with(prefix) {
            return value;
        }
    }
    // Longest prefix that is a decimal literal.
    let b = s.as_bytes();
    let mut i = 0;
    if matches!(b.first(), Some(b'+' | b'-')) {
        i = 1;
    }
    let int_start = i;
    while b.get(i).is_some_and(u8::is_ascii_digit) {
        i += 1;
    }
    let mut digits = i - int_start;
    if b.get(i) == Some(&b'.') {
        let mut j = i + 1;
        while b.get(j).is_some_and(u8::is_ascii_digit) {
            j += 1;
        }
        digits += j - i - 1;
        if digits > 0 {
            i = j;
        }
    }
    if digits == 0 {
        return f64::NAN;
    }
    if matches!(b.get(i), Some(b'e' | b'E')) {
        let mut j = i + 1;
        if matches!(b.get(j), Some(b'+' | b'-')) {
            j += 1;
        }
        let exp_start = j;
        while b.get(j).is_some_and(u8::is_ascii_digit) {
            j += 1;
        }
        if j > exp_start {
            i = j;
        }
    }
    s[..i].parse().unwrap_or(f64::NAN)
}

/// A JSON object without the keys whose value is undefined
/// (`JSON.stringify` drops them).
fn object(fields: Vec<(&str, Option<Value>)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .filter_map(|(k, v)| v.map(|v| (k.to_owned(), v)))
            .collect::<Map<_, _>>(),
    )
}

/// The rate reply mapped like `getRates`; `Err` (a TypeError in Node) falls
/// back to the static rates.
pub fn map_rates(data: &Value) -> Result<Value, String> {
    let details = opt(get(Some(data), "output")?, "rateReplyDetails");
    let details = if truthy(details) {
        details.expect("truthy")
    } else {
        return Ok(json!([]));
    };
    let Value::Array(details) = details else {
        return Err("rateReplyDetails.map is not a function".into());
    };
    let mut out = Vec::with_capacity(details.len());
    for detail in details {
        let service_type = get(Some(detail), "serviceType")?;
        let service_name = or(get(Some(detail), "serviceName")?, service_type);
        let day_format = opt(opt(get(Some(detail), "commit")?, "dateDetail"), "dayFormat");
        let shipped = first(get(Some(detail), "ratedShipmentDetails")?);
        // parseFloat(charge || 0)
        let rate = or(opt(shipped.as_ref(), "totalNetCharge"), None).map_or(0.0, parse_float);
        let currency = opt(shipped.as_ref(), "currency");
        out.push(object(vec![
            ("serviceType", service_type.cloned()),
            ("serviceName", service_name.cloned()),
            (
                "deliveryDays",
                Some(
                    or(day_format, None)
                        .cloned()
                        .unwrap_or_else(|| json!("N/A")),
                ),
            ),
            ("rate", Some(common::json::js_number(rate))),
            (
                "currency",
                Some(or(currency, None).cloned().unwrap_or_else(|| json!("USD"))),
            ),
        ]));
    }
    Ok(Value::Array(out))
}

/// The ship reply mapped like `createShipment`.
pub fn map_shipment(data: &Value) -> Result<Shipment, String> {
    let result = first(opt(get(Some(data), "output")?, "transactionShipments"));
    let piece = first(opt(result.as_ref(), "pieceResponses"));
    let master = opt(
        opt(result.as_ref(), "masterTrackingNumber"),
        "trackingNumber",
    );
    let tracking = or(opt(piece.as_ref(), "trackingNumber"), master).cloned();
    let documents = first(opt(piece.as_ref(), "packageDocuments"));
    let url = opt(documents.as_ref(), "url");
    Ok(Shipment {
        tracking_number: tracking,
        label_url: or(url, None).cloned().unwrap_or(Value::Null),
        mock: false,
    })
}

/// The track reply mapped like `getTracking`.
pub fn map_tracking(tracking_number: &str, data: &Value) -> Result<Value, String> {
    let complete = first(opt(get(Some(data), "output")?, "completeTrackResults"));
    let result = first(opt(complete.as_ref(), "trackResults"));
    let result = result.as_ref();
    let latest = opt(result, "latestStatusDetail");
    let ends = opt(
        opt(opt(result, "estimatedDeliveryTimeWindow"), "window"),
        "ends",
    );
    let scans = opt(result, "scanEvents");
    let events = if truthy(scans) {
        match scans.expect("truthy") {
            Value::Array(events) => events.as_slice(),
            _ => return Err("((intermediate value) || []).map is not a function".into()),
        }
    } else {
        &[]
    };
    let mut mapped = Vec::with_capacity(events.len());
    for event in events {
        // Same evaluation order as the object literal (the first property read
        // of a null event names `date`).
        let timestamp = get(Some(event), "date")?.cloned();
        let description = get(Some(event), "eventDescription")?.cloned();
        let location = get(Some(event), "scanLocation")?;
        let location = if truthy(location) {
            json!(format!(
                "{}, {}",
                template(get(location, "city")?),
                template(get(location, "stateOrProvinceCode")?)
            ))
        } else {
            json!("N/A")
        };
        mapped.push(object(vec![
            ("timestamp", timestamp),
            ("description", description),
            ("location", Some(location)),
        ]));
    }
    let pick = |v: Option<&Value>, fallback: Value| or(v, None).cloned().unwrap_or(fallback);
    Ok(json!({
        "trackingNumber": tracking_number,
        "status": pick(opt(latest, "code"), json!("UNKNOWN")),
        "statusDescription": pick(opt(latest, "description"), json!("Unknown")),
        "estimatedDelivery": pick(ends, Value::Null),
        "events": mapped,
        "mock": false,
    }))
}

/// The unconfigured `getTracking` answer.
pub fn mock_tracking(tracking_number: &str) -> Value {
    let now = chrono::Utc::now();
    json!({
        "trackingNumber": tracking_number,
        "status": "MOCK_IN_TRANSIT",
        "statusDescription": "Package is in transit (mock)",
        "estimatedDelivery": common::timestamp::format(&(now + chrono::Duration::days(5))),
        "events": [{
            "timestamp": common::timestamp::format(&now),
            "description": "Shipment information sent to FedEx (mock)",
            "location": "New York, NY",
        }],
        "mock": true,
    })
}

/// `'MOCK' + Date.now().toString().slice(-10)`.
pub fn mock_tracking_number() -> String {
    let now = chrono::Utc::now().timestamp_millis().to_string();
    let tail = now.len().saturating_sub(10);
    format!("MOCK{}", &now[tail..])
}

/// Body of the rate quote request.
pub fn rate_request(account: Option<&str>, destination: &Value, packages: &[Value]) -> Value {
    json!({
        "accountNumber": object(vec![("value", account.map(|a| json!(a)))]),
        "requestedShipment": {
            "shipper": { "address": origin_address() },
            "recipient": { "address": destination },
            "pickupType": "DROPOFF_AT_FEDEX_LOCATION",
            "rateRequestType": ["ACCOUNT", "LIST"],
            "requestedPackageLineItems": packages.iter().map(|pkg| json!({
                "weight": object(vec![("units", Some(json!("LB"))), ("value", opt(Some(pkg), "weight").cloned())]),
                "dimensions": object(vec![
                    ("length", opt(Some(pkg), "length").cloned()),
                    ("width", opt(Some(pkg), "width").cloned()),
                    ("height", opt(Some(pkg), "height").cloned()),
                    ("units", Some(json!("IN"))),
                ]),
            })).collect::<Vec<_>>(),
        },
    })
}

/// Body of the ship request.
pub fn ship_request(account: Option<&str>, req: &ShipmentRequest) -> Value {
    let name = if req.recipient_name.is_empty() {
        "Customer"
    } else {
        &req.recipient_name
    };
    let phone = if truthy(Some(&req.recipient_phone)) {
        req.recipient_phone.clone()
    } else {
        json!("0000000000")
    };
    // The route always passes packages (`[{ weight: 2 }]`).
    let packages = &req.packages;
    json!({
        "accountNumber": object(vec![("value", account.map(|a| json!(a)))]),
        "labelResponseOptions": "URL_ONLY",
        "requestedShipment": {
            "shipper": {
                "address": origin_address(),
                "contact": { "personName": "Store Admin", "phoneNumber": "1234567890" },
            },
            "recipients": [{
                "address": req.recipient,
                "contact": { "personName": name, "phoneNumber": phone },
            }],
            "serviceType": if truthy(Some(&req.service_type)) { req.service_type.clone() } else { json!("FEDEX_GROUND") },
            "packagingType": "YOUR_PACKAGING",
            "pickupType": "DROPOFF_AT_FEDEX_LOCATION",
            "shippingChargesPayment": { "paymentType": "SENDER" },
            "labelSpecification": {
                "labelFormatType": "COMMON2D",
                "imageType": "PDF",
                "labelStockType": "PAPER_4X6",
            },
            "requestedPackageLineItems": packages.iter().map(|pkg| json!({
                "weight": object(vec![("units", Some(json!("LB"))), ("value", opt(Some(pkg), "weight").cloned())]),
            })).collect::<Vec<_>>(),
        },
    })
}

/// Body of the track request.
pub fn track_request(tracking_number: &str) -> Value {
    json!({
        "includeDetailedScans": true,
        "trackingInfo": [{ "trackingNumberInfo": { "trackingNumber": tracking_number } }],
    })
}

/// Node's `fetch` rejects with `TypeError: fetch failed` on network errors.
const FETCH_FAILED: &str = "fetch failed";

impl Fedex {
    pub fn new(config: Config) -> Self {
        let configured = config.is_configured();
        let http = reqwest::Client::builder()
            // undici's default headers/body timeouts.
            .timeout(Duration::from_secs(300))
            .build()
            .unwrap_or_default();
        Self {
            config,
            configured,
            http,
            cache: Mutex::new(TokenCache {
                token: None,
                expiry_ms: 0.0,
            }),
        }
    }

    /// `isConfigured`.
    pub fn is_configured(&self) -> bool {
        self.configured
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.config.api_url)
    }

    /// `authenticate()`: the cached token while it is valid, else a new one.
    async fn authenticate(&self) -> Result<Option<Value>, String> {
        if !self.configured {
            return Err("FedEx is not configured".into());
        }
        {
            let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
            if truthy(cache.token.as_ref()) && now_ms() < cache.expiry_ms {
                return Ok(cache.token.clone());
            }
        }
        let form = format!(
            "grant_type=client_credentials&client_id={}&client_secret={}",
            crate::email_queue::form_encode(self.config.client_id.as_deref().unwrap_or("")),
            crate::email_queue::form_encode(self.config.client_secret.as_deref().unwrap_or("")),
        );
        let response = self
            .http
            .post(self.url("/oauth/token"))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(form)
            .send()
            .await
            .map_err(|_| FETCH_FAILED.to_owned())?;
        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(format!("FedEx authentication failed: {text}"));
        }
        let data = read_json(response).await?;
        let token = get(Some(&data), "access_token")?.cloned();
        let expires_in = get(Some(&data), "expires_in")?.map_or(f64::NAN, js_to_number);
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.token = token.clone();
        cache.expiry_ms = now_ms() + (expires_in - 60.0) * 1000.0;
        Ok(token)
    }

    async fn post_json(&self, path: &str, body: &Value) -> Result<reqwest::Response, String> {
        let token = self.authenticate().await?;
        self.http
            .post(self.url(path))
            .header("Content-Type", "application/json")
            .header(
                "Authorization",
                format!("Bearer {}", template(token.as_ref())),
            )
            .header("X-locale", "en_US")
            .body(body.to_string())
            .send()
            .await
            .map_err(|_| FETCH_FAILED.to_owned())
    }

    /// `getRates(destination, packages)`.
    pub async fn get_rates(&self, destination: &Value, packages: &[Value]) -> Value {
        if !self.configured {
            return default_rates();
        }
        let body = rate_request(self.config.account_number.as_deref(), destination, packages);
        let result = async {
            let response = self.post_json("/rate/v1/rates/quotes", &body).await?;
            if !response.status().is_success() {
                tracing::warn!("FedEx rate API error, falling back to static rates");
                return Ok(default_rates());
            }
            map_rates(&read_json(response).await?)
        }
        .await;
        result.unwrap_or_else(|error| {
            tracing::error!(%error, "FedEx rate lookup error, using fallback");
            default_rates()
        })
    }

    /// `createShipment(details)`.
    pub async fn create_shipment(&self, req: &ShipmentRequest) -> Result<Shipment, String> {
        if !self.configured {
            let tracking = mock_tracking_number();
            tracing::info!(%tracking, "mock shipment");
            return Ok(Shipment {
                tracking_number: Some(json!(tracking)),
                label_url: Value::Null,
                mock: true,
            });
        }
        let body = ship_request(self.config.account_number.as_deref(), req);
        let result = async {
            let response = self.post_json("/ship/v1/shipments", &body).await?;
            if !response.status().is_success() {
                let text = response.text().await.unwrap_or_default();
                return Err(format!("FedEx shipment creation failed: {text}"));
            }
            map_shipment(&read_json(response).await?)
        }
        .await;
        if let Err(error) = &result {
            tracing::error!(%error, "FedEx shipment creation error");
        }
        result
    }

    /// `getTracking(trackingNumber)`.
    pub async fn get_tracking(&self, tracking_number: &str) -> Result<Value, String> {
        if !self.configured {
            return Ok(mock_tracking(tracking_number));
        }
        let body = track_request(tracking_number);
        let result = async {
            let response = self.post_json("/track/v1/trackingnumbers", &body).await?;
            if !response.status().is_success() {
                return Err("FedEx tracking lookup failed".to_owned());
            }
            map_tracking(tracking_number, &read_json(response).await?)
        }
        .await;
        if let Err(error) = &result {
            tracing::error!(%error, "FedEx tracking error");
        }
        result
    }
}

/// `await response.json()`.
async fn read_json(response: reqwest::Response) -> Result<Value, String> {
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "terminated".to_owned())?;
    let text = String::from_utf8_lossy(bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes));
    serde_json::from_str(&text).map_err(|_| crate::express::json_syntax_message(&text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configuration_rules() {
        let cfg = |id: Option<&str>, secret: Option<&str>| Config {
            client_id: id.map(Into::into),
            client_secret: secret.map(Into::into),
            ..Config::default()
        };
        assert!(cfg(Some("id"), Some("s")).is_configured());
        assert!(!cfg(Some("your-fedex-client-id"), Some("s")).is_configured());
        assert!(!cfg(Some(""), Some("s")).is_configured());
        assert!(!cfg(Some("id"), None).is_configured());
        assert!(!cfg(None, None).is_configured());
    }

    #[test]
    fn parse_float_like_javascript() {
        assert_eq!(parse_float(&json!("12.50")), 12.5);
        assert_eq!(parse_float(&json!(" 3.2abc")), 3.2);
        assert_eq!(parse_float(&json!(7)), 7.0);
        assert_eq!(parse_float(&json!([5])), 5.0);
        assert_eq!(parse_float(&json!(".5")), 0.5);
        assert_eq!(parse_float(&json!("1e3x")), 1000.0);
        assert_eq!(parse_float(&json!("1e")), 1.0);
        assert!(parse_float(&json!("abc")).is_nan());
        assert!(parse_float(&json!({})).is_nan());
        assert_eq!(parse_float(&json!("-Infinityx")), f64::NEG_INFINITY);
    }

    use std::collections::{HashMap, VecDeque};
    use std::sync::Arc;

    use axum::extract::State;
    use axum::http::{HeaderMap, Method, StatusCode, Uri};

    /// Canned replies (status, body) per path, in order.
    type Replies = HashMap<String, VecDeque<(u16, String)>>;

    #[derive(Clone, Default)]
    struct Mock {
        replies: Arc<Mutex<Replies>>,
        seen: Arc<Mutex<Vec<Value>>>,
    }

    async fn answer(
        State(mock): State<Mock>,
        method: Method,
        uri: Uri,
        headers: HeaderMap,
        body: String,
    ) -> (StatusCode, String) {
        let header = |name: &str| {
            headers
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
        };
        mock.seen.lock().unwrap().push(json!({
            "method": method.as_str(),
            "path": uri.path(),
            "headers": {
                "content-type": header("content-type"),
                "authorization": header("authorization"),
                "x-locale": header("x-locale"),
            },
            "body": body,
        }));
        let mut replies = mock.replies.lock().unwrap();
        let queue = replies.get_mut(uri.path()).expect("a canned reply");
        let reply = if queue.len() > 1 {
            queue.pop_front().unwrap()
        } else {
            queue[0].clone()
        };
        (StatusCode::from_u16(reply.0).unwrap(), reply.1)
    }

    /// A request as the Node fixture records it: JSON bodies compared parsed,
    /// only the headers Node set.
    fn comparable(request: &Value, headers_of: &Value) -> Value {
        let mut headers = Map::new();
        for (k, _) in headers_of["headers"].as_object().unwrap() {
            headers.insert(k.clone(), request["headers"][k].clone());
        }
        let body = request["body"].as_str().unwrap_or_default();
        let body = serde_json::from_str::<Value>(body).unwrap_or_else(|_| json!(body));
        json!({
            "method": request["method"],
            "path": request["path"],
            "headers": headers,
            "body": body,
        })
    }

    fn shipment_json(s: &Shipment) -> Value {
        object(vec![
            ("trackingNumber", s.tracking_number.clone()),
            ("labelUrl", Some(s.label_url.clone())),
            ("mock", Some(json!(s.mock))),
        ])
    }

    /// The Node service, driven by the same canned FedEx replies
    /// (backend/scripts/gen-misc-fixtures.js), sent the same requests and
    /// returned the same results.
    #[tokio::test]
    async fn matches_the_node_service() {
        let fixtures: Value =
            serde_json::from_str(include_str!("../fixtures/misc_compat.json")).unwrap();
        let cases = fixtures["fedex"].as_array().unwrap();
        assert!(cases.len() > 20);
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let mock = Mock::default();
            for (path, replies) in case["responses"].as_object().unwrap() {
                let queue = replies
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|r| {
                        (
                            r["status"].as_u64().unwrap() as u16,
                            r["text"].as_str().unwrap().to_owned(),
                        )
                    })
                    .collect();
                mock.replies.lock().unwrap().insert(path.clone(), queue);
            }
            let network = case["network"].as_bool().unwrap_or(false);
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            let app = axum::Router::new()
                .fallback(answer)
                .with_state(mock.clone());
            let server = tokio::spawn(async move { axum::serve(listener, app).await });
            let service = Fedex::new(Config {
                // Port 1 refuses connections: Node's "fetch failed".
                api_url: if network {
                    "http://127.0.0.1:1".into()
                } else {
                    format!("http://{addr}")
                },
                client_id: Some("client id&1".into()),
                client_secret: Some("se cret+/=".into()),
                account_number: Some("740561073".into()),
            });

            let mut results = Vec::new();
            for call in case["calls"].as_array().unwrap() {
                let call = call.as_array().unwrap();
                let result = match call[0].as_str().unwrap() {
                    "getRates" => {
                        let packages = call[2].as_array().unwrap().clone();
                        Ok(service.get_rates(&call[1], &packages).await)
                    }
                    "createShipment" => {
                        let d = &call[1];
                        let req = ShipmentRequest {
                            recipient: d["recipient"].clone(),
                            recipient_name: d["recipientName"].as_str().unwrap().into(),
                            recipient_phone: d["recipientPhone"].clone(),
                            service_type: d["serviceType"].clone(),
                            packages: d["packages"].as_array().unwrap().clone(),
                        };
                        service
                            .create_shipment(&req)
                            .await
                            .map(|s| shipment_json(&s))
                    }
                    "getTracking" => service.get_tracking(call[1].as_str().unwrap()).await,
                    other => panic!("unknown call {other}"),
                };
                results.push(match result {
                    Ok(v) => json!({ "ok": v }),
                    Err(e) => json!({ "error": e }),
                });
            }
            assert_eq!(Value::Array(results), case["results"], "{name}: results");

            if !network {
                let seen = mock.seen.lock().unwrap().clone();
                let expected = case["requests"].as_array().unwrap();
                assert_eq!(seen.len(), expected.len(), "{name}: request count");
                for (got, want) in seen.iter().zip(expected) {
                    assert_eq!(
                        comparable(got, want),
                        comparable(want, want),
                        "{name}: request"
                    );
                }
            }
            server.abort();
        }
    }

    #[test]
    fn mock_tracking_number_shape() {
        let t = mock_tracking_number();
        assert!(t.starts_with("MOCK"));
        assert_eq!(t.len(), 14);
    }
}
