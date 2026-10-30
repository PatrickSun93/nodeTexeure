//! `/api/orders` read routes (port of the GET handlers in
//! backend/routes/orderRoutes.js): the signed-in customer's order list, order
//! detail (owner, admin, or anyone holding a guest order's id/number) and public
//! tracking. Creating orders, coupons and tax quotes are still served by Node.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use common::response::{failure, success};
use serde::Serialize;
use serde_json::{Value, json};

use crate::AppState;
use crate::auth::{AuthUser, OptionalUser};
use crate::error::ApiError;

type Timestamp = Option<DateTime<Utc>>;

#[derive(Debug, Serialize)]
pub struct OrderSummary {
    pub id: String,
    pub order_number: String,
    pub status: String,
    pub subtotal: String,
    pub tax_amount: String,
    pub shipping_amount: String,
    pub discount_amount: String,
    pub total_amount: String,
    pub shipping_method: Option<String>,
    pub tracking_number: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub shipped_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub delivered_at: Timestamp,
}

/// `GET /api/orders/my-orders`
pub async fn my_orders(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Value>, ApiError> {
    let orders = sqlx::query_as!(
        OrderSummary,
        r#"SELECT id, order_number, status,
             CAST(subtotal AS CHAR) AS "subtotal!: String",
             CAST(tax_amount AS CHAR) AS "tax_amount!: String",
             CAST(shipping_amount AS CHAR) AS "shipping_amount!: String",
             CAST(discount_amount AS CHAR) AS "discount_amount!: String",
             CAST(total_amount AS CHAR) AS "total_amount!: String",
             shipping_method, tracking_number, created_at, shipped_at, delivered_at
           FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC"#,
        user.id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(success("Orders fetched", json!({ "orders": orders }))))
}

/// Every `orders` column (Node selects `o.*`) plus the customer's name/email.
#[derive(Debug, Serialize)]
pub struct Order {
    pub id: String,
    pub order_number: String,
    pub user_id: Option<String>,
    pub guest_email: Option<String>,
    pub status: String,
    pub currency: String,
    pub exchange_rate: Option<String>,
    pub subtotal: String,
    pub tax_amount: String,
    pub shipping_amount: String,
    pub discount_amount: String,
    pub total_amount: String,
    pub shipping_address_json: Value,
    pub billing_address_json: Value,
    pub shipping_method: Option<String>,
    pub tracking_number: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub shipped_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub delivered_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub updated_at: Timestamp,
    pub payment_status: String,
    pub stripe_payment_intent_id: Option<String>,
    pub stripe_session_id: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub paid_at: Timestamp,
    pub user_email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OrderItem {
    pub id: String,
    pub order_id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    pub bundle_id: Option<String>,
    pub product_name: String,
    pub product_sku: String,
    pub variant_details: Option<Value>,
    pub quantity: u32,
    pub unit_price: String,
    pub total_price: String,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
    pub image_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StatusChange {
    pub status: String,
    pub status_details: Option<Value>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
    pub changed_by_name: Option<String>,
}

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

/// `GET /api/orders/{idOrNumber}`
pub async fn detail(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    let order = sqlx::query_as!(
        Order,
        r#"SELECT o.id, o.order_number, o.user_id, o.guest_email, o.status, o.currency,
             CAST(o.exchange_rate AS CHAR) AS "exchange_rate: String",
             CAST(o.subtotal AS CHAR) AS "subtotal!: String",
             CAST(o.tax_amount AS CHAR) AS "tax_amount!: String",
             CAST(o.shipping_amount AS CHAR) AS "shipping_amount!: String",
             CAST(o.discount_amount AS CHAR) AS "discount_amount!: String",
             CAST(o.total_amount AS CHAR) AS "total_amount!: String",
             o.shipping_address_json AS "shipping_address_json: Value",
             o.billing_address_json AS "billing_address_json: Value",
             o.shipping_method, o.tracking_number, o.shipped_at, o.delivered_at,
             o.created_at, o.updated_at, o.payment_status,
             o.stripe_payment_intent_id, o.stripe_session_id, o.paid_at,
             u.email AS "user_email: String", u.first_name AS "first_name: String",
             u.last_name AS "last_name: String"
           FROM orders o LEFT JOIN users u ON o.user_id = u.id
           WHERE o.id = ? OR o.order_number = ?
           LIMIT 1"#,
        id,
        id
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(order) = order else {
        return Ok(reply(StatusCode::NOT_FOUND, failure("Order not found")));
    };

    // Account orders need that account (or an admin); guest orders stay viewable
    // by their unguessable id/number so guest checkout confirmation works.
    if let Some(owner) = order.user_id.as_deref().filter(|o| !o.is_empty()) {
        let allowed = user.as_ref().is_some_and(|u| u.id == owner || u.is_admin());
        if !allowed {
            return Ok(reply(StatusCode::FORBIDDEN, failure("Access denied")));
        }
    }

    let items = sqlx::query_as!(
        OrderItem,
        r#"SELECT oi.id, oi.order_id, oi.product_id, oi.variant_id, oi.bundle_id,
             oi.product_name, oi.product_sku,
             oi.variant_details AS "variant_details: Value", oi.quantity,
             CAST(oi.unit_price AS CHAR) AS "unit_price!: String",
             CAST(oi.total_price AS CHAR) AS "total_price!: String",
             oi.created_at,
             (SELECT pi.thumbnail_small_url FROM product_images pi
               WHERE pi.product_id = oi.product_id AND pi.is_primary = 1
               ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) AS "image_url: String"
           FROM order_items oi
           WHERE oi.order_id = ?
           ORDER BY oi.created_at ASC, oi.id ASC"#,
        order.id
    )
    .fetch_all(&state.pool)
    .await?;

    let history = sqlx::query_as!(
        StatusChange,
        r#"SELECT osh.status, osh.status_details AS "status_details: Value", osh.created_at,
             u.first_name AS "changed_by_name: String"
           FROM order_status_history osh
           LEFT JOIN users u ON osh.changed_by = u.id
           WHERE osh.order_id = ? ORDER BY osh.created_at ASC, osh.id ASC"#,
        order.id
    )
    .fetch_all(&state.pool)
    .await?;

    let mut order = serde_json::to_value(order)?;
    order["items"] = serde_json::to_value(items)?;
    order["status_history"] = serde_json::to_value(history)?;
    Ok(reply(
        StatusCode::OK,
        success("Order details fetched", json!({ "order": order })),
    ))
}

#[derive(Debug, Serialize)]
pub struct Tracking {
    pub order_number: String,
    pub status: String,
    pub shipping_method: Option<String>,
    pub tracking_number: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub shipped_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub delivered_at: Timestamp,
}

#[derive(Debug, Serialize)]
pub struct TrackingEvent {
    pub status: String,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
}

/// `GET /api/orders/track/{orderNumber}` — public; shows no customer data.
pub async fn track(
    State(state): State<AppState>,
    Path(order_number): Path<String>,
) -> Result<Response, ApiError> {
    let tracking = sqlx::query_as!(
        Tracking,
        "SELECT order_number, status, shipping_method, tracking_number,
           created_at, shipped_at, delivered_at
         FROM orders WHERE order_number = ?",
        order_number
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(tracking) = tracking else {
        return Ok(reply(StatusCode::NOT_FOUND, failure("Order not found")));
    };

    let history = sqlx::query_as!(
        TrackingEvent,
        "SELECT osh.status, osh.created_at FROM order_status_history osh
         JOIN orders o ON o.id = osh.order_id
         WHERE o.order_number = ?
         ORDER BY osh.created_at ASC, osh.id ASC",
        order_number
    )
    .fetch_all(&state.pool)
    .await?;

    let mut tracking = serde_json::to_value(tracking)?;
    tracking["history"] = serde_json::to_value(history)?;
    Ok(reply(
        StatusCode::OK,
        success("Order tracking", json!({ "tracking": tracking })),
    ))
}
