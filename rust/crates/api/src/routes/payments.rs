//! `/api/payments` — backend/routes/paymentRoutes.js with
//! services/stripeService.js ([`crate::stripe`]) and services/orderPayments.js:
//! Stripe Checkout sessions and PaymentIntents for an order (its owner, an
//! admin, or anyone for a guest order), the signed webhook that marks orders
//! paid or refunded, admin refunds (CSRF), and session lookup.
//!
//! Routed like Express ([`crate::express_router`]):
//!
//! * OPTIONS is the CORS 204;
//! * `express.json()` runs for every request whose original URL does not
//!   start with `/api/payments/webhook` (case-sensitive, as server.js checks
//!   it), then `express.urlencoded()`; a body they reject is the 500 before
//!   any route;
//! * the webhook route's own `express.raw({ type: 'application/json' })`
//!   keeps the bytes (gzip/deflate inflated, 100kb) unless a parser above
//!   already parsed the body, in which case `constructEvent` gets the parsed
//!   object — and fails the way the SDK fails for one;
//! * auth: `protectOptional` (an invalid token is a guest), or `protect`,
//!   `admin`, `csrfProtection` for the refund.
//!
//! Without a usable `STRIPE_SECRET_KEY` the API routes answer 503 after
//! validating input; the webhook still verifies and applies events whenever
//! the key is set at all (even the placeholder) and `STRIPE_WEBHOOK_SECRET`
//! is real. Order updates go through the same SQL as orderPayments.js with
//! values bound the way mysql2 binds them; a failed update is a non-2xx answer
//! (`Webhook Error: Order payment update failed: …` / the route's 500), so
//! Stripe retries.

use std::io::Read;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{FromRequestParts, Request, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use common::json::js_number;
use serde_json::{Map, Value, json};

use crate::AppState;
use crate::auth::{Admin, AuthUser, OptionalUser};
use crate::body::{js_string, js_to_number, truthy};
use crate::csrf::Csrf;
use crate::express_router::{self as express, Routed, Verb};
use crate::mysql_json::{self, Js, JsRow};
use crate::routes::reviews::guard;
use crate::stripe::{self, LineItem, Param, Payload, STRIPE, js_round};

/// Where the group is mounted (`app.use('/api/payments', ...)`).
pub const PREFIX: &str = "/api/payments";
/// body-parser's default limit ('100kb').
const BODY_LIMIT: usize = 100 * 1024;
/// Largest body buffered; parsers fail anything past [`BODY_LIMIT`] anyway.
const READ_LIMIT: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq)]
enum R {
    Checkout,
    Intent,
    Webhook,
    Refund,
    Session,
}

/// paymentRoutes.js, in registration order.
const ROUTES: &[(Verb, &str, R)] = &[
    (Verb::Post, "/create-checkout-session", R::Checkout),
    (Verb::Post, "/create-payment-intent", R::Intent),
    (Verb::Post, "/webhook", R::Webhook),
    (Verb::Post, "/refund", R::Refund),
    (Verb::Get, "/session/:sessionId", R::Session),
];

/// `/api/payments` and every path below it, all to [`dispatch`].
pub fn router(_state: &AppState) -> axum::Router<AppState> {
    let all = axum::routing::any(dispatch);
    axum::Router::new()
        .route(PREFIX, all.clone())
        .route(&format!("{PREFIX}/"), all.clone())
        .route(&format!("{PREFIX}/{{*path}}"), all)
}

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

/// `ResponseFormatter.failure(message)` for a message that may not be a
/// string (`if (message)` decides whether it is included).
fn failure_value(message: Value) -> Value {
    let mut out = Map::new();
    out.insert("status".into(), json!("FAIL"));
    if truthy(Some(&message)) {
        out.insert("message".into(), message);
    }
    out.insert("keyValueTable".into(), json!([]));
    Value::Object(out)
}

fn fail(status: StatusCode, message: &str) -> Response {
    reply(status, common::response::failure(message))
}

/// `res.status(500).json(ResponseFormatter.failure(error.message || fallback))`.
fn server_error(message: Value, fallback: &str) -> Response {
    let message = if truthy(Some(&message)) {
        message
    } else {
        Value::String(fallback.into())
    };
    reply(StatusCode::INTERNAL_SERVER_ERROR, failure_value(message))
}

/// `{ ...keyValueTable }` with `undefined` members left out.
fn table(pairs: Vec<(&str, Option<Value>)>) -> Value {
    Value::Object(
        pairs
            .into_iter()
            .filter_map(|(k, v)| v.map(|v| (k.to_owned(), v)))
            .collect(),
    )
}

/// Media type of a request, lowercased, without parameters.
fn media_type(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::CONTENT_TYPE)?.to_str().ok()?;
    Some(raw.split(';').next()?.trim().to_ascii_lowercase())
}

/// type-is `hasBody`.
fn has_body(headers: &HeaderMap) -> bool {
    headers.contains_key(header::TRANSFER_ENCODING) || headers.contains_key(header::CONTENT_LENGTH)
}

/// `req.body` and whether a parser consumed the request (`req._body`).
struct Parsed {
    body: Value,
    consumed: bool,
}

/// The app's parsers: `express.json()` unless the original URL starts with
/// `/api/payments/webhook`, then `express.urlencoded()`.
fn app_parsers(parts: &Parts, bytes: &[u8]) -> Result<Parsed, Box<Response>> {
    let skip_json = parts
        .uri
        .path_and_query()
        .map_or(parts.uri.path(), |pq| pq.as_str())
        .starts_with("/api/payments/webhook");
    let mime = media_type(&parts.headers);
    let parses = match mime.as_deref() {
        Some("application/json") => !skip_json,
        Some("application/x-www-form-urlencoded") => true,
        _ => false,
    };
    if !parses || !has_body(&parts.headers) {
        return Ok(Parsed {
            body: json!({}),
            consumed: false,
        });
    }
    match crate::express::parse_body(&parts.headers, bytes) {
        Ok(body) => Ok(Parsed {
            body,
            consumed: true,
        }),
        Err(message) => Err(Box::new(crate::express::internal_error(&message))),
    }
}

/// Every request under `/api/payments`.
pub async fn dispatch(State(state): State<AppState>, req: Request) -> Response {
    let (mut parts, body) = req.into_parts();
    let head = parts.method == Method::HEAD;
    // cors() answers every preflight before anything else runs.
    if parts.method == Method::OPTIONS {
        return StatusCode::NO_CONTENT.into_response();
    }
    let (bytes, too_large) = match axum::body::to_bytes(body, READ_LIMIT).await {
        Ok(bytes) => (bytes, false),
        Err(_) => (Bytes::new(), true),
    };
    let parsed = if too_large {
        // Only a body some parser reads can fail for its size.
        match app_parsers(&parts, b"{}") {
            Ok(p) if !p.consumed => p,
            _ => return crate::express::internal_error("request entity too large"),
        }
    } else {
        match app_parsers(&parts, &bytes) {
            Ok(p) => p,
            Err(response) => return *response,
        }
    };

    let path = parts.uri.path().strip_prefix(PREFIX).unwrap_or_default();
    // One extra slash belongs to the mount path (`/api/payments//webhook`).
    let path = if path.starts_with("//") {
        &path[1..]
    } else {
        path
    };
    let (route, params) = match express::route(ROUTES, &parts.method, path) {
        Routed::Route(route, params) => (route, params),
        Routed::NotFound => return express::not_found(&parts.uri),
        Routed::Error(message) => return express::error(&message),
    };
    let response = match route {
        R::Checkout => {
            let OptionalUser(user) = optional_user(&mut parts, &state).await;
            checkout_session(&state, user, &parsed.body).await
        }
        R::Intent => {
            let OptionalUser(user) = optional_user(&mut parts, &state).await;
            payment_intent(&state, user, &parsed.body).await
        }
        R::Webhook => {
            let raw = match raw_body(&parts.headers, &parsed, &bytes, too_large) {
                Ok(raw) => raw,
                Err(response) => return *response,
            };
            let payload = match &raw {
                Some(bytes) => Payload::Raw(bytes),
                None => Payload::Parsed(&parsed.body),
            };
            webhook(&state, &parts.headers, payload).await
        }
        R::Refund => match guard::<Csrf<Admin>>(&mut parts, &state).await {
            Ok(Csrf(Admin(_))) => refund(&state, &parsed.body).await,
            Err(denied) => denied,
        },
        R::Session => {
            let OptionalUser(user) = optional_user(&mut parts, &state).await;
            let id = params.into_iter().next().unwrap_or_default();
            session(&state, user, &id).await
        }
    };
    if head {
        let (parts, _) = response.into_parts();
        return Response::from_parts(parts, axum::body::Body::empty());
    }
    response
}

async fn optional_user(parts: &mut Parts, state: &AppState) -> OptionalUser {
    OptionalUser::from_request_parts(parts, state)
        .await
        .unwrap_or(OptionalUser(None))
}

/// `express.raw({ type: 'application/json' })`: the bytes, or `None` when it
/// leaves `req.body` alone (already parsed, no body, another type).
fn raw_body(
    headers: &HeaderMap,
    parsed: &Parsed,
    bytes: &[u8],
    too_large: bool,
) -> Result<Option<Vec<u8>>, Box<Response>> {
    if parsed.consumed || !has_body(headers) {
        return Ok(None);
    }
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .map(|v| String::from_utf8_lossy(v.as_bytes()).into_owned())
        .and_then(|v| crate::multer::normalize_media_type(&v))
        .is_some_and(|t| t == "application/json");
    if !is_json {
        return Ok(None);
    }
    let encoding = headers
        .get(header::CONTENT_ENCODING)
        .map(|v| String::from_utf8_lossy(v.as_bytes()).to_lowercase())
        .unwrap_or_else(|| "identity".into());
    let too_big = || Box::new(crate::express::internal_error("request entity too large"));
    if too_large {
        return Err(too_big());
    }
    let inflated = match encoding.as_str() {
        "identity" => bytes.to_vec(),
        "gzip" | "deflate" => {
            let mut out = Vec::new();
            let limited = |r: &mut dyn Read, out: &mut Vec<u8>| {
                r.take(BODY_LIMIT as u64 + 1).read_to_end(out)
            };
            let result = if encoding == "gzip" {
                limited(&mut flate2::read::GzDecoder::new(bytes), &mut out)
            } else {
                limited(&mut flate2::read::ZlibDecoder::new(bytes), &mut out)
            };
            if let Err(err) = result {
                return Err(Box::new(crate::express::internal_error(&err.to_string())));
            }
            out
        }
        other => {
            return Err(Box::new(crate::express::internal_error(&format!(
                "unsupported content encoding \"{other}\""
            ))));
        }
    };
    if inflated.len() > BODY_LIMIT {
        return Err(too_big());
    }
    Ok(Some(inflated))
}

// ---------------------------------------------------------------------------
// JavaScript semantics for values from JSON / mysql2 rows
// ---------------------------------------------------------------------------

/// `obj.key` where `obj` may be `undefined` (`None`), `null` or a primitive:
/// reading a property of undefined/null throws V8's TypeError.
fn prop<'a>(obj: Option<&'a Value>, key: &str) -> Result<Option<&'a Value>, String> {
    match obj {
        None => Err(format!(
            "Cannot read properties of undefined (reading '{key}')"
        )),
        Some(Value::Null) => Err(format!("Cannot read properties of null (reading '{key}')")),
        Some(Value::Object(map)) => Ok(map.get(key)),
        Some(_) => Ok(None),
    }
}

/// `obj.key` that never throws (for values known to be objects or absent).
fn get<'a>(obj: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    prop(obj, key).ok().flatten()
}

/// `Number(v)`, `undefined` → NaN.
fn number(v: Option<&Value>) -> f64 {
    v.map_or(f64::NAN, js_to_number)
}

/// `a < b` (abstract relational comparison) for JSON values.
fn js_less(a: Option<&Value>, b: Option<&Value>) -> bool {
    let primitive = |v: Option<&Value>| match v {
        Some(v @ (Value::Array(_) | Value::Object(_))) => Some(Value::String(js_string(v))),
        other => other.cloned(),
    };
    match (primitive(a), primitive(b)) {
        (Some(Value::String(x)), Some(Value::String(y))) => x.encode_utf16().lt(y.encode_utf16()),
        (x, y) => number(x.as_ref()) < number(y.as_ref()),
    }
}

/// `parseFloat(v)` for a mysql2 value.
fn parse_float(v: Option<&Js>) -> f64 {
    let text = v.map_or_else(|| "undefined".to_owned(), Js::js_string);
    let t = crate::express::js_trim(&text);
    // The longest prefix that is a decimal literal (or Infinity).
    let b = t.as_bytes();
    let mut i = 0;
    if matches!(b.first(), Some(b'+' | b'-')) {
        i = 1;
    }
    if t[i..].starts_with("Infinity") {
        return if b.first() == Some(&b'-') {
            f64::NEG_INFINITY
        } else {
            f64::INFINITY
        };
    }
    let digits_start = i;
    while b.get(i).is_some_and(u8::is_ascii_digit) {
        i += 1;
    }
    let mut int_digits = i - digits_start;
    if b.get(i) == Some(&b'.') {
        let j = i + 1;
        let mut k = j;
        while b.get(k).is_some_and(u8::is_ascii_digit) {
            k += 1;
        }
        int_digits += k - j;
        if k > j || int_digits > 0 {
            i = k;
        }
    }
    if int_digits == 0 {
        return f64::NAN;
    }
    if matches!(b.get(i), Some(b'e' | b'E')) {
        let mut k = i + 1;
        if matches!(b.get(k), Some(b'+' | b'-')) {
            k += 1;
        }
        let start = k;
        while b.get(k).is_some_and(u8::is_ascii_digit) {
            k += 1;
        }
        if k > start {
            i = k;
        }
    }
    t[..i].parse().unwrap_or(f64::NAN)
}

/// `x / 100` for a value of a Stripe object (`undefined / 100` is NaN → null).
fn cents_to_amount(v: Option<&Value>) -> Value {
    js_number(number(v) / 100.0)
}

fn js_value(row: &JsRow, column: &str) -> Value {
    row.get(column).map_or(Value::Null, Js::to_json)
}

// ---------------------------------------------------------------------------
// services/orderPayments.js
// ---------------------------------------------------------------------------

/// mysql2's error for an `undefined` bind parameter.
const UNDEFINED_BIND: &str =
    "Bind parameters must not contain undefined. To pass SQL NULL specify JS null";

/// `run(sql, params)`: the affected rows, or `Order payment update failed: …`.
async fn run(state: &AppState, sql: &str, params: &[Option<&Value>]) -> Result<u64, String> {
    let fail = |e: &str| format!("Order payment update failed: {e}");
    let mut query = sqlx::query(sql);
    for p in params {
        match p {
            Some(v) => query = mysql_json::bind(query, v),
            None => return Err(fail(UNDEFINED_BIND)),
        }
    }
    query
        .execute(&state.pool)
        .await
        .map(|r| r.rows_affected())
        .map_err(|e| fail(&mysql_json::error_message(&e)))
}

/// `markOrderPaid(orderId, paymentIntentId = null)`.
async fn mark_order_paid(
    state: &AppState,
    order_id: &Value,
    payment_intent: Option<&Value>,
) -> Result<u64, String> {
    // A default parameter: `undefined` becomes null.
    let null = Value::Null;
    run(
        state,
        "UPDATE orders SET status = IF(status = 'pending', 'confirmed', status), payment_status = 'paid',
       paid_at = COALESCE(paid_at, NOW()), stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id)
     WHERE id = ?",
        &[Some(payment_intent.unwrap_or(&null)), Some(order_id)],
    )
    .await
}

/// `markOrderRefunded(orderId, { partial })`.
async fn mark_order_refunded(
    state: &AppState,
    order_id: &Value,
    partial: bool,
) -> Result<u64, String> {
    let sql = if partial {
        "UPDATE orders SET payment_status = 'partially_refunded' WHERE id = ?"
    } else {
        "UPDATE orders SET status = 'refunded', payment_status = 'refunded' WHERE id = ?"
    };
    run(state, sql, &[Some(order_id)]).await
}

/// `DatabaseUtil.first(await executeQuery(sql, params))`: `None` for no row
/// and for a failed query (including an `undefined` parameter).
async fn first_row(state: &AppState, sql: &str, params: &[Option<&Value>]) -> Option<JsRow> {
    let params: Option<Vec<Value>> = params.iter().map(|p| p.cloned()).collect();
    let params = params?;
    mysql_json::fetch_rows(&state.pool, sql, &params)
        .await
        .inspect_err(|error| tracing::error!(%error, "payments: query failed"))
        .ok()?
        .into_iter()
        .next()
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/// Orders of a registered account need that account or an admin.
fn denied(user: Option<&AuthUser>, owner: Option<&Js>) -> bool {
    let Some(owner) = owner.filter(|o| o.truthy()) else {
        return false;
    };
    match user {
        None => true,
        Some(u) => Js::String(u.id.clone()) != *owner && !u.is_admin(),
    }
}

/// `process.env.FRONTEND_URL || 'http://localhost:3000'`.
fn frontend_url() -> String {
    std::env::var("FRONTEND_URL")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "http://localhost:3000".into())
}

fn order_id_required() -> Response {
    fail(StatusCode::BAD_REQUEST, "Order ID is required")
}

/// `POST /api/payments/create-checkout-session` `{ orderId }`
async fn checkout_session(state: &AppState, user: Option<AuthUser>, body: &Value) -> Response {
    const FAILED: &str = "Failed to create checkout session";
    let order_id = match body.get("orderId") {
        Some(Value::String(s)) if !s.is_empty() => s.clone(),
        _ => return order_id_required(),
    };
    if !STRIPE.is_available() {
        return fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "Payment service is not configured. Please add Stripe API keys.",
        );
    }
    // The same SQL as Node, so the rows (line items) come back in its order.
    let items = mysql_json::fetch_rows(
        &state.pool,
        "
      SELECT o.*, oi.product_name, oi.quantity, oi.unit_price
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = ?
    ",
        &[Value::String(order_id.clone())],
    )
    .await
    .inspect_err(|error| tracing::error!(%error, "checkout session: order lookup failed"))
    .unwrap_or_default();
    let Some(order) = items.first() else {
        return fail(StatusCode::NOT_FOUND, "Order not found");
    };
    if denied(user.as_ref(), order.get("user_id")) {
        return fail(StatusCode::FORBIDDEN, "Access denied");
    }

    let mut line_items: Vec<LineItem> = items
        .iter()
        .map(|item| LineItem {
            name: Param::from_json(Some(&js_value(item, "product_name"))),
            quantity: Param::from_json(Some(&js_value(item, "quantity"))),
            unit_amount: js_round(js_to_number(&js_value(item, "unit_price")) * 100.0),
        })
        .collect();
    for (column, name) in [("tax_amount", "Tax"), ("shipping_amount", "Shipping")] {
        let amount = js_to_number(&js_value(order, column));
        if amount > 0.0 {
            line_items.push(LineItem {
                name: Param::str(name),
                quantity: Param::Num(1.0),
                unit_amount: js_round(amount * 100.0),
            });
        }
    }
    // `order.guest_email || (req.user ? req.user.email : null)`
    let guest = js_value(order, "guest_email");
    let customer_email = if truthy(Some(&guest)) {
        Param::from_json(Some(&guest))
    } else {
        match &user {
            Some(u) => u.email.clone().map_or(Param::Undefined, Param::Str),
            None => Param::Null,
        }
    };
    let base = frontend_url();
    let success_url =
        format!("{base}/order/confirmation/{order_id}?session_id={{CHECKOUT_SESSION_ID}}");
    let cancel_url = format!("{base}/checkout?cancelled=true");

    let session = match STRIPE
        .create_checkout_session(
            &order_id,
            &line_items,
            customer_email,
            &success_url,
            &cancel_url,
        )
        .await
    {
        Ok(session) => session,
        Err(err) => return server_error(err.message, FAILED),
    };
    // recordCheckoutSession(orderId, session.id)
    let id = Value::String(order_id);
    if let Err(message) = run(
        state,
        "UPDATE orders SET stripe_session_id = ? WHERE id = ?",
        &[get(Some(&session), "id"), Some(&id)],
    )
    .await
    {
        return server_error(Value::String(message), FAILED);
    }
    Json(common::response::success(
        "Checkout session created",
        table(vec![
            ("sessionId", get(Some(&session), "id").cloned()),
            ("url", get(Some(&session), "url").cloned()),
        ]),
    ))
    .into_response()
}

/// `SELECT * FROM orders WHERE id = ?` → first row (a failed query reads as
/// no row).
async fn order_row(state: &AppState, order_id: &str) -> Option<JsRow> {
    first_row(
        state,
        "SELECT * FROM orders WHERE id = ?",
        &[Some(&Value::String(order_id.to_owned()))],
    )
    .await
}

/// `POST /api/payments/create-payment-intent` `{ orderId }`
async fn payment_intent(state: &AppState, user: Option<AuthUser>, body: &Value) -> Response {
    const FAILED: &str = "Failed to create payment intent";
    let order_id = match body.get("orderId") {
        Some(Value::String(s)) if !s.is_empty() => s.clone(),
        _ => return order_id_required(),
    };
    if !STRIPE.is_available() {
        return fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "Payment service is not configured",
        );
    }
    let Some(order) = order_row(state, &order_id).await else {
        return fail(StatusCode::NOT_FOUND, "Order not found");
    };
    if denied(user.as_ref(), order.get("user_id")) {
        return fail(StatusCode::FORBIDDEN, "Access denied");
    }
    let amount = js_round(js_to_number(&js_value(&order, "total_amount")) * 100.0);
    let metadata = vec![
        ("orderId".to_owned(), Param::str(order_id.clone())),
        (
            "orderNumber".to_owned(),
            Param::from_json(order.get("order_number").map(Js::to_json).as_ref()),
        ),
    ];
    let intent = match STRIPE.create_payment_intent(amount, "usd", metadata).await {
        Ok(intent) => intent,
        Err(err) => return server_error(err.message, FAILED),
    };
    let id = Value::String(order_id);
    if let Err(message) = run(
        state,
        "UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ?",
        &[get(Some(&intent), "id"), Some(&id)],
    )
    .await
    {
        return server_error(Value::String(message), FAILED);
    }
    Json(common::response::success(
        "Payment intent created",
        table(vec![
            ("clientSecret", get(Some(&intent), "client_secret").cloned()),
            ("paymentIntentId", get(Some(&intent), "id").cloned()),
        ]),
    ))
    .into_response()
}

/// The `Stripe-Signature` header as Node sees it (latin1; repeated headers
/// joined with `", "`).
fn signature_header(headers: &HeaderMap) -> Option<String> {
    let values: Vec<String> = headers
        .get_all("stripe-signature")
        .iter()
        .map(|v| v.as_bytes().iter().map(|&b| b as char).collect())
        .collect();
    (!values.is_empty()).then(|| values.join(", "))
}

fn webhook_error(message: &str) -> Response {
    reply(
        StatusCode::BAD_REQUEST,
        json!({ "error": format!("Webhook Error: {message}") }),
    )
}

/// `POST /api/payments/webhook` (raw body, `Stripe-Signature`).
async fn webhook(state: &AppState, headers: &HeaderMap, payload: Payload<'_>) -> Response {
    let header = signature_header(headers);
    let secret = std::env::var("STRIPE_WEBHOOK_SECRET").ok();
    let now_ms = chrono::Utc::now().timestamp_millis() as f64;
    let event = match stripe::construct_webhook_event(
        &STRIPE,
        secret.as_deref(),
        payload,
        header.as_deref(),
        now_ms,
    ) {
        Ok(event) => event,
        Err(message) => {
            tracing::error!(%message, "Webhook error");
            return webhook_error(&message);
        }
    };
    match handle_event(state, &event).await {
        Ok(()) => Json(json!({ "received": true })).into_response(),
        Err(message) => {
            tracing::error!(%message, "Webhook error");
            webhook_error(&message)
        }
    }
}

/// The amount check before marking an order paid: `false` (do not mark it)
/// when the order exists and `paid < Math.round(parseFloat(total) * 100)`.
async fn amount_covers_order(state: &AppState, order_id: &Value, paid: Option<&Value>) -> bool {
    let Some(order) = first_row(
        state,
        "SELECT total_amount FROM orders WHERE id = ?",
        &[Some(order_id)],
    )
    .await
    else {
        return true;
    };
    let expected = js_round(parse_float(order.get("total_amount")) * 100.0);
    if js_less(paid, Some(&js_number(expected))) {
        tracing::error!(
            order = %js_string(order_id),
            "Payment amount mismatch: paid {}, expected {expected}",
            paid.map_or_else(|| "undefined".into(), js_string)
        );
        return false;
    }
    true
}

/// The `switch (event.type)` of the webhook route; `Err` is a thrown error.
async fn handle_event(state: &AppState, event: &Value) -> Result<(), String> {
    let event_type = prop(Some(event), "type")?;
    match event_type.and_then(Value::as_str) {
        Some(kind @ ("checkout.session.completed" | "payment_intent.succeeded")) => {
            let object = prop(prop(Some(event), "data")?, "object")?;
            let order_id = prop(prop(object, "metadata")?, "orderId")?;
            let Some(order_id) = order_id.filter(|v| truthy(Some(v))) else {
                return Ok(());
            };
            let (paid, intent) = if kind == "checkout.session.completed" {
                (get(object, "amount_total"), get(object, "payment_intent"))
            } else {
                (get(object, "amount_received"), get(object, "id"))
            };
            if !amount_covers_order(state, order_id, paid).await {
                return Ok(());
            }
            mark_order_paid(state, order_id, intent).await?;
            tracing::info!(order = %js_string(order_id), "order marked as paid ({kind})");
        }
        Some("charge.refunded") => {
            let charge = prop(prop(Some(event), "data")?, "object")?;
            let intent = prop(charge, "payment_intent")?;
            let order = first_row(
                state,
                "SELECT id FROM orders WHERE stripe_payment_intent_id = ?",
                &[intent],
            )
            .await;
            if let Some(order) = order {
                let id = js_value(&order, "id");
                let partial = js_less(get(charge, "amount_refunded"), get(charge, "amount"));
                mark_order_refunded(state, &id, partial).await?;
                tracing::info!(order = %js_string(&id), "order refunded");
            }
        }
        _ => {
            tracing::info!(
                "Unhandled Stripe event: {}",
                event_type.map_or_else(|| "undefined".into(), js_string)
            );
        }
    }
    Ok(())
}

/// `POST /api/payments/refund` `{ orderId, amount? }` (admin + CSRF).
async fn refund(state: &AppState, body: &Value) -> Response {
    const FAILED: &str = "Failed to process refund";
    let order_id = match body.get("orderId") {
        Some(Value::String(s)) if !s.is_empty() => s.clone(),
        _ => return order_id_required(),
    };
    if !STRIPE.is_available() {
        return fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "Payment service is not configured",
        );
    }
    let Some(order) = order_row(state, &order_id).await else {
        return fail(StatusCode::NOT_FOUND, "Order not found");
    };
    let intent = order.get("stripe_payment_intent_id").filter(|v| v.truthy());
    let Some(intent) = intent else {
        return fail(StatusCode::BAD_REQUEST, "No payment found for this order");
    };
    // `amount ? Math.round(amount * 100) : null`
    let amount = body
        .get("amount")
        .filter(|a| truthy(Some(a)))
        .map(|a| js_round(js_to_number(a) * 100.0));
    let refund = match STRIPE.process_refund(&intent.js_string(), amount).await {
        Ok(refund) => refund,
        Err(err) => return server_error(err.message, FAILED),
    };
    let total = js_round(js_to_number(&js_value(&order, "total_amount")) * 100.0);
    let partial = js_less(get(Some(&refund), "amount"), Some(&js_number(total)));
    if let Err(message) = mark_order_refunded(state, &Value::String(order_id), partial).await {
        return server_error(Value::String(message), FAILED);
    }
    Json(common::response::success(
        "Refund processed",
        table(vec![
            ("refundId", get(Some(&refund), "id").cloned()),
            (
                "amount",
                Some(cents_to_amount(get(Some(&refund), "amount"))),
            ),
            ("status", get(Some(&refund), "status").cloned()),
        ]),
    ))
    .into_response()
}

/// `GET /api/payments/session/:sessionId`
async fn session(state: &AppState, user: Option<AuthUser>, session_id: &str) -> Response {
    const FAILED: &str = "Failed to fetch session";
    if !STRIPE.is_available() {
        return fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "Payment service is not configured",
        );
    }
    let session = match STRIPE.get_checkout_session(session_id).await {
        Ok(session) => session,
        Err(err) => return server_error(err.message, FAILED),
    };
    // `session && session.metadata ? session.metadata.orderId : null`
    let s = Some(&session);
    let metadata = get(s, "metadata").filter(|m| truthy(Some(m)));
    let order_id = if truthy(s) {
        metadata.and_then(|m| get(Some(m), "orderId"))
    } else {
        None
    };
    if let Some(order_id) = order_id.filter(|v| truthy(Some(v))) {
        let order = first_row(
            state,
            "SELECT user_id FROM orders WHERE id = ?",
            &[Some(order_id)],
        )
        .await;
        if let Some(order) = order
            && denied(user.as_ref(), order.get("user_id"))
        {
            return fail(StatusCode::FORBIDDEN, "Access denied");
        }
    }
    Json(common::response::success(
        "Session retrieved",
        table(vec![
            ("id", get(s, "id").cloned()),
            ("status", get(s, "status").cloned()),
            ("paymentStatus", get(s, "payment_status").cloned()),
            ("amountTotal", Some(cents_to_amount(get(s, "amount_total")))),
            ("customerEmail", get(s, "customer_email").cloned()),
        ]),
    ))
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn javascript_comparisons() {
        let lt = |a: Value, b: Value| js_less(Some(&a), Some(&b));
        assert!(lt(json!(999), json!(1000)));
        assert!(!lt(json!(1000), json!(1000)));
        assert!(!js_less(None, Some(&json!(1000))), "undefined < n is false");
        assert!(lt(json!(null), json!(1)), "null is 0");
        assert!(lt(json!("10"), json!("9")), "two strings compare as text");
        assert!(!lt(json!("10"), json!(9)));
        assert!(lt(json!([5]), json!(6)));
        assert!(!lt(json!({}), json!(6)));
        assert!(!js_less(None, None));
    }

    #[test]
    fn parse_float_like_javascript() {
        let s = |t: &str| parse_float(Some(&Js::String(t.into())));
        assert_eq!(s("123.45"), 123.45);
        assert_eq!(s("  12px"), 12.0);
        assert_eq!(s(".5"), 0.5);
        assert_eq!(s("5."), 5.0);
        assert_eq!(s("1e3x"), 1000.0);
        assert_eq!(s("1e"), 1.0);
        assert!(s("abc").is_nan());
        assert!(s(".").is_nan());
        assert!(parse_float(Some(&Js::Null)).is_nan());
        assert_eq!(s("-Infinity"), f64::NEG_INFINITY);
    }

    #[test]
    fn property_reads_throw_like_v8() {
        assert_eq!(
            prop(None, "metadata").unwrap_err(),
            "Cannot read properties of undefined (reading 'metadata')"
        );
        assert_eq!(
            prop(Some(&Value::Null), "orderId").unwrap_err(),
            "Cannot read properties of null (reading 'orderId')"
        );
        assert_eq!(prop(Some(&json!("x")), "orderId").unwrap(), None);
        assert_eq!(
            prop(Some(&json!({ "a": 1 })), "a").unwrap(),
            Some(&json!(1))
        );
    }

    #[test]
    fn amounts() {
        assert_eq!(cents_to_amount(Some(&json!(1999))), json!(19.99));
        assert_eq!(cents_to_amount(Some(&json!(500))), json!(5));
        assert_eq!(cents_to_amount(Some(&Value::Null)), json!(0));
        assert_eq!(cents_to_amount(None), Value::Null);
        assert_eq!(cents_to_amount(Some(&json!("250"))), json!(2.5));
    }

    #[test]
    fn failure_envelope() {
        assert_eq!(
            failure_value(json!("x")),
            json!({ "status": "FAIL", "message": "x", "keyValueTable": [] })
        );
        assert_eq!(
            failure_value(json!("")),
            json!({ "status": "FAIL", "keyValueTable": [] })
        );
    }
}
