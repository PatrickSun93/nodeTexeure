//! `/api/shipping` — rate quotes, labels and tracking (port of
//! backend/routes/shippingRoutes.js on top of [`crate::fedex`]). Quotes and
//! tracking are public and share one per-IP carrier limiter; label creation is
//! admin-only with CSRF.

use axum::body::Body;
use axum::extract::{FromRequestParts, Request, State};
use axum::handler::Handler;
use axum::http::{StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, post};
use axum::{Json, Router};
use common::response::{failure, success};
use serde_json::{Value, json};

use crate::AppState;
use crate::auth::Admin;
use crate::body::{is_non_empty_string, js_to_number, truthy};
use crate::client_ip::TrustProxy;
use crate::csrf::Csrf;
use crate::express;
use crate::fedex::{self, SERVICE, ShipmentRequest};
use crate::ratelimit::{RateLimiter, presets};

const TRACK_PREFIX: &str = "/api/shipping/track/";

async fn not_found(uri: Uri) -> Response {
    express::not_found(&uri)
}

/// Express decodes `:trackingNumber` while matching the route, before the
/// limiter runs; a bad escape goes to the error handler.
async fn decode_tracking_param(req: Request, next: Next) -> Response {
    if let Err(message) = express::decode_param(raw_tracking_number(req.uri())) {
        return express::internal_error(&message);
    }
    next.run(req).await
}

pub fn router(trust: TrustProxy) -> Router<AppState> {
    // One store for both public routes, as in Node.
    let carrier = RateLimiter::new(presets::carrier(), trust);
    let mut router = Router::new();
    for path in ["/api/shipping/rates", "/api/shipping/rates/"] {
        router = router.route(path, post(rates.layer(carrier.layer())).fallback(not_found));
    }
    for path in ["/api/shipping/create-label", "/api/shipping/create-label/"] {
        router = router.route(path, post(create_label).fallback(not_found));
    }
    for path in [
        "/api/shipping/track/{tracking_number}",
        "/api/shipping/track/{tracking_number}/",
    ] {
        router = router.route(
            path,
            get(track
                .layer(carrier.layer())
                .layer(middleware::from_fn(decode_tracking_param)))
            .fallback(not_found),
        );
    }
    router
        .route("/api/shipping", any(not_found))
        .route("/api/shipping/", any(not_found))
        .route("/api/shipping/{*rest}", any(not_found))
}

/// `v.key` for a JSON value that may not be an object (undefined then).
fn prop<'a>(v: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    match v? {
        Value::Object(map) => map.get(key),
        _ => None,
    }
}

/// `a || fallback`.
fn or(v: Option<&Value>, fallback: Value) -> Value {
    if truthy(v) {
        v.cloned().expect("truthy")
    } else {
        fallback
    }
}

/// The route's packages, or `None` where `items.map(...)` throws in Node
/// (the route then answers the fallback rates).
fn packages(items: Option<&Value>) -> Option<Vec<Value>> {
    let default = || vec![json!({ "weight": 2, "length": 12, "width": 10, "height": 4 })];
    if !truthy(items) {
        return Some(default());
    }
    match items.expect("truthy") {
        Value::Array(list) if list.is_empty() => Some(default()),
        Value::Array(list) => list
            .iter()
            .map(|item| {
                // `item.weight` of null throws.
                if item.is_null() {
                    return None;
                }
                let item = Some(item);
                Some(json!({
                    "weight": or(prop(item, "weight"), json!(2)),
                    "length": or(prop(item, "length"), json!(12)),
                    "width": or(prop(item, "width"), json!(10)),
                    "height": or(prop(item, "height"), json!(4)),
                }))
            })
            .collect(),
        // A non-empty string has a length but no map().
        Value::String(_) => None,
        // `{ length }` compared with `> 0`, then no map().
        Value::Object(map) => match map.get("length") {
            Some(len) if js_to_number(len) > 0.0 => None,
            _ => Some(default()),
        },
        _ => Some(default()),
    }
}

/// `POST /api/shipping/rates` `{ destination: { postalCode, ... }, items?: [{ weight, ... }] }`
pub async fn rates(headers: axum::http::HeaderMap, body: Body) -> Response {
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(response) => return response,
    };
    let destination = body.get("destination");
    if !truthy(destination) || !truthy(prop(destination, "postalCode")) {
        return (
            StatusCode::BAD_REQUEST,
            Json(failure("Destination postal code is required")),
        )
            .into_response();
    }
    let address = json!({
        "streetLines": or(prop(destination, "streetLines"), json!([""])),
        "city": or(prop(destination, "city"), json!("")),
        "stateOrProvinceCode": or(prop(destination, "stateOrProvinceCode"), json!("")),
        "postalCode": prop(destination, "postalCode"),
        "countryCode": or(prop(destination, "countryCode"), json!("US")),
    });
    let Some(packages) = packages(body.get("items")) else {
        tracing::error!("shipping rates: malformed items, answering the fallback rates");
        return Json(success(
            "Shipping rates (fallback)",
            json!({ "rates": fedex::default_rates(), "isFallback": true }),
        ))
        .into_response();
    };
    let rates = SERVICE.get_rates(&address, &packages).await;
    Json(success(
        "Shipping rates retrieved",
        json!({ "rates": rates, "isFallback": !SERVICE.is_configured() }),
    ))
    .into_response()
}

fn server_error(message: &str) -> Response {
    let message = if message.is_empty() {
        "Failed to create shipping label"
    } else {
        message
    };
    (StatusCode::INTERNAL_SERVER_ERROR, Json(failure(message))).into_response()
}

/// `` `${v || ''}` ``
fn text_or_empty(v: Option<&Value>) -> String {
    if truthy(v) {
        crate::body::js_string(v.expect("truthy"))
    } else {
        String::new()
    }
}

/// `POST /api/shipping/create-label` `{ orderId, serviceType? }` (admin + CSRF).
pub async fn create_label(State(state): State<AppState>, req: Request) -> Response {
    let (mut parts, body) = req.into_parts();
    // express.json() runs before protect/admin/csrfProtection.
    let body = match express::read_body(&parts.headers, body).await {
        Ok(body) => body,
        Err(response) => return response,
    };
    if let Err(response) = Csrf::<Admin>::from_request_parts(&mut parts, &state).await {
        return response;
    }
    let order_id = body.get("orderId");
    if !is_non_empty_string(order_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(failure("Order ID is required")),
        )
            .into_response();
    }
    let order_id = order_id.and_then(Value::as_str).expect("a string");

    // A failed lookup reads as "not found", as DatabaseUtil.first does.
    let stored = sqlx::query_scalar!(
        r#"SELECT CAST(shipping_address_json AS CHAR) AS "address: String" FROM orders WHERE id = ?"#,
        order_id
    )
    .fetch_optional(&state.pool)
    .await
    .inspect_err(|error| tracing::error!(%error, "create-label: order lookup failed"))
    .ok()
    .flatten();
    let Some(stored) = stored else {
        return (StatusCode::NOT_FOUND, Json(failure("Order not found"))).into_response();
    };
    // mysql2 parses the JSON column; a JSON string inside is parsed again.
    let column: Value = stored
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(Value::Null);
    let address = match column {
        Value::String(s) => match serde_json::from_str::<Value>(&s) {
            Ok(v) => v,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(failure("Invalid shipping address on order")),
                )
                    .into_response();
            }
        },
        other => other,
    };
    if address.is_null() {
        return server_error("Cannot read properties of null (reading 'address_line_1')");
    }
    let a = Some(&address);
    let recipient = json!({
        "streetLines": [or(prop(a, "address_line_1"), json!(""))],
        "city": or(prop(a, "city"), json!("")),
        "stateOrProvinceCode": or(prop(a, "state"), json!("")),
        "postalCode": or(prop(a, "postal_code"), json!("")),
        "countryCode": or(prop(a, "country"), json!("US")),
    });
    let name = format!(
        "{} {}",
        text_or_empty(prop(a, "first_name")),
        text_or_empty(prop(a, "last_name"))
    );
    let request = ShipmentRequest {
        recipient,
        recipient_name: express::js_trim(&name).to_owned(),
        recipient_phone: or(prop(a, "phone"), json!("")),
        service_type: or(body.get("serviceType"), json!("FEDEX_GROUND")),
        packages: vec![json!({ "weight": 2 })],
    };
    let shipment = match SERVICE.create_shipment(&request).await {
        Ok(shipment) => shipment,
        Err(message) => return server_error(&message),
    };

    // Same unchecked write as Node: mysql2 cannot bind `undefined`, so no
    // tracking number means the update fails and is ignored.
    if let Some(tracking) = &shipment.tracking_number {
        let updated = match tracking {
            Value::Number(n) => {
                sqlx::query!(
                    "UPDATE orders SET tracking_number = ?, status = 'shipped', shipped_at = NOW() WHERE id = ?",
                    n.as_f64(),
                    order_id
                )
                .execute(&state.pool)
                .await
            }
            other => {
                let text = match other {
                    Value::Null => None,
                    Value::String(s) => Some(s.clone()),
                    Value::Bool(b) => Some(if *b { "1" } else { "0" }.to_owned()),
                    v => Some(v.to_string()),
                };
                sqlx::query!(
                    "UPDATE orders SET tracking_number = ?, status = 'shipped', shipped_at = NOW() WHERE id = ?",
                    text,
                    order_id
                )
                .execute(&state.pool)
                .await
            }
        };
        if let Err(error) = updated {
            tracing::error!(%error, "create-label: order update failed");
        }
    }

    let mut table = serde_json::Map::new();
    if let Some(tracking) = shipment.tracking_number {
        table.insert("trackingNumber".into(), tracking);
    }
    table.insert("labelUrl".into(), shipment.label_url);
    table.insert("isMock".into(), json!(shipment.mock));
    Json(success("Shipping label created", Value::Object(table))).into_response()
}

/// The raw (still percent-encoded) `:trackingNumber` segment.
fn raw_tracking_number(uri: &Uri) -> &str {
    let rest = uri.path().strip_prefix(TRACK_PREFIX).unwrap_or("");
    rest.strip_suffix('/').unwrap_or(rest)
}

/// `GET /api/shipping/track/{trackingNumber}`
pub async fn track(uri: Uri) -> Response {
    let tracking_number = match express::decode_param(raw_tracking_number(&uri)) {
        Ok(t) => t,
        Err(message) => return express::internal_error(&message),
    };
    match SERVICE.get_tracking(&tracking_number).await {
        Ok(tracking) => Json(success("Tracking information retrieved", tracking)).into_response(),
        Err(message) => {
            let message = if message.is_empty() {
                "Failed to get tracking info"
            } else {
                &message
            };
            (StatusCode::INTERNAL_SERVER_ERROR, Json(failure(message))).into_response()
        }
    }
}
