//! `/api/returns` — return requests (RMA), port of backend/routes/returnRoutes.js:
//! a customer requests a return for a delivered order of theirs and lists /
//! views their returns; admins list all returns and move a return through its
//! statuses (CSRF on the write).
//!
//! Routed like Express by [`dispatch`] (see [`crate::express`]): `GET
//! /request` is a return id (`/:id`), and paths Node doesn't route get its 404.

use axum::Json;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use common::response::{failure, success};
use serde::Serialize;
use serde_json::{Value, json};

use crate::AppState;
use crate::auth::{Admin, AuthUser};
use crate::body::{is_non_empty_string, is_optional_string, truthy};
use crate::csrf::Csrf;
use crate::express::{self, Routed, Verb};
use crate::routes::reviews::guard;

/// Where the group is mounted (`app.use('/api/returns', ...)`).
pub const PREFIX: &str = "/api/returns";

/// `returns.reason` / `returns.status` ENUMs.
const RETURN_REASONS: [&str; 6] = [
    "defective",
    "wrong_item",
    "not_as_described",
    "changed_mind",
    "damaged_shipping",
    "other",
];
const RETURN_STATUSES: [&str; 7] = [
    "requested",
    "approved",
    "rejected",
    "shipped_back",
    "received",
    "processed",
    "closed",
];

#[derive(Debug, Clone, Copy)]
enum R {
    Request,
    Mine,
    Detail,
    Status,
    All,
}

/// returnRoutes.js, in registration order.
const ROUTES: &[(Verb, &str, R)] = &[
    (Verb::Post, "/request", R::Request),
    (Verb::Get, "/my-returns", R::Mine),
    (Verb::Get, "/:id", R::Detail),
    (Verb::Put, "/:id/status", R::Status),
    (Verb::Get, "/admin/all", R::All),
];

/// `/api/returns` and every path below it, all to [`dispatch`].
pub fn router() -> axum::Router<AppState> {
    let all = axum::routing::any(dispatch);
    axum::Router::new()
        .route(PREFIX, all.clone())
        .route(&format!("{PREFIX}/"), all.clone())
        .route(&format!("{PREFIX}/{{*path}}"), all)
}

/// Every request under `/api/returns`.
pub async fn dispatch(State(state): State<AppState>, req: Request) -> Response {
    let (mut parts, body) = req.into_parts();
    let Ok(bytes) = axum::body::to_bytes(body, 2 * 1024 * 1024).await else {
        return express::error("request entity too large");
    };
    let body = match express::body(&parts.headers, &bytes) {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let path = parts.uri.path().strip_prefix(PREFIX).unwrap_or_default();
    let (route, params) = match express::route(ROUTES, &parts.method, path) {
        Routed::Route(route, params) => (route, params),
        Routed::NotFound => return express::not_found(&parts.uri),
        Routed::Error(message) => return express::error(&message),
    };
    let param = params.into_iter().next().unwrap_or_default();
    // Each route's catch: a 500 with its own message.
    let (result, on_error) = match route {
        R::Request => match guard::<AuthUser>(&mut parts, &state).await {
            Ok(user) => (
                request(&state, user, &body).await,
                "Failed to create return request",
            ),
            Err(denied) => return denied,
        },
        R::Mine => match guard::<AuthUser>(&mut parts, &state).await {
            Ok(user) => (mine(&state, user).await, "Failed to fetch returns"),
            Err(denied) => return denied,
        },
        R::Detail => match guard::<AuthUser>(&mut parts, &state).await {
            Ok(user) => (detail(&state, user, param).await, "Failed to fetch return"),
            Err(denied) => return denied,
        },
        R::Status => match guard::<Csrf<Admin>>(&mut parts, &state).await {
            Ok(Csrf(Admin(user))) => (
                update_status(&state, user, param, &body).await,
                "Failed to update return",
            ),
            Err(denied) => return denied,
        },
        R::All => match guard::<Admin>(&mut parts, &state).await {
            Ok(_) => (all(&state, &parts).await, "Failed to fetch returns"),
            Err(denied) => return denied,
        },
    };
    result.unwrap_or_else(|err| {
        tracing::error!(error = %format!("{err:#}"), "returns request failed");
        reply(StatusCode::INTERNAL_SERVER_ERROR, failure(on_error))
    })
}

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

type Timestamp = Option<DateTime<Utc>>;

/// `item.quantity`: omitted (or falsy) means 1, otherwise a whole number of units.
fn return_quantity(item: &Value) -> Option<u32> {
    match item.get("quantity") {
        q if !truthy(q) => Some(1),
        Some(Value::Number(n)) => n
            .as_f64()
            .filter(|f| f.fract() == 0.0 && *f > 0.0 && *f <= f64::from(u32::MAX))
            .map(|f| f as u32),
        _ => None,
    }
}

/// `isReturnItem`: `{ orderItemId, reason?, quantity? }`.
fn is_return_item(item: &Value) -> bool {
    item.is_object()
        && is_non_empty_string(item.get("orderItemId"))
        && is_optional_string(item.get("reason"))
        && return_quantity(item).is_some()
}

/// `POST /api/returns/request` `{ orderId, reason, description?, items: [{ orderItemId, quantity?, reason? }] }`
async fn request(state: &AppState, user: AuthUser, body: &Value) -> anyhow::Result<Response> {
    let reason = body.get("reason").and_then(Value::as_str);
    let items = body.get("items").and_then(Value::as_array);
    let valid = is_non_empty_string(body.get("orderId"))
        && reason.is_some_and(|r| RETURN_REASONS.contains(&r))
        && items.is_some_and(|items| !items.is_empty() && items.iter().all(is_return_item))
        && is_optional_string(body.get("description"));
    let (Some(order_id), Some(reason), Some(items), true) = (
        body.get("orderId").and_then(Value::as_str),
        reason,
        items,
        valid,
    ) else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("orderId, reason, and items are required"),
        ));
    };

    // The order must be the caller's, and delivered.
    let order = sqlx::query!(
        "SELECT id, status, user_id FROM orders WHERE id = ? AND user_id = ?",
        order_id,
        user.id
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(order) = order else {
        return Ok(reply(StatusCode::NOT_FOUND, failure("Order not found")));
    };
    if order.status != "delivered" {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("Returns can only be requested for delivered orders"),
        ));
    }

    let open_return = sqlx::query_scalar!(
        "SELECT id FROM returns WHERE order_id = ? AND status NOT IN ('rejected','closed')",
        order_id
    )
    .fetch_all(&state.pool)
    .await?;
    if !open_return.is_empty() {
        return Ok(reply(
            StatusCode::CONFLICT,
            failure("A return request already exists for this order"),
        ));
    }

    // Every item must belong to this order (no attaching another order's items).
    let order_items =
        sqlx::query_scalar!("SELECT id FROM order_items WHERE order_id = ?", order_id)
            .fetch_all(&state.pool)
            .await?;
    let belongs = |item: &Value| {
        item.get("orderItemId")
            .and_then(Value::as_str)
            .is_some_and(|id| order_items.iter().any(|o| o == id))
    };
    if !items.iter().all(belongs) {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("One or more return items do not belong to this order"),
        ));
    }

    let return_id = sqlx::query_scalar!(r#"SELECT get_next_id('RMA') AS "id: String""#)
        .fetch_one(&state.pool)
        .await?
        .ok_or_else(|| anyhow::anyhow!("transno prefix RMA is not registered"))?;
    let return_number = format!("RMA-{return_id}");

    #[derive(Serialize)]
    struct Details<'a> {
        description: &'a str,
        customer_notes: &'a str,
        admin_notes: &'a str,
        evidence_urls: [(); 0],
    }
    let details = serde_json::to_string(&Details {
        description: body
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        customer_notes: "",
        admin_notes: "",
        evidence_urls: [],
    })?;

    // Node does not check these writes; a failure is logged, as there.
    if let Err(err) = sqlx::query!(
        "INSERT INTO returns (id, order_id, user_id, return_number, reason, return_details)
         VALUES (?, ?, ?, ?, ?, ?)",
        return_id,
        order_id,
        user.id,
        return_number,
        reason,
        details
    )
    .execute(&state.pool)
    .await
    {
        tracing::error!(error = %err, "inserting return failed");
    }
    for item in items {
        let item_id = sqlx::query_scalar!(r#"SELECT get_next_id('RMAITEM') AS "id: String""#)
            .fetch_one(&state.pool)
            .await?;
        let order_item_id = item.get("orderItemId").and_then(Value::as_str);
        let quantity = return_quantity(item).unwrap_or(1);
        let item_reason = item
            .get("reason")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if let Err(err) = sqlx::query!(
            "INSERT INTO return_items (id, return_id, order_item_id, quantity, reason) VALUES (?, ?, ?, ?, ?)",
            item_id,
            return_id,
            order_item_id,
            quantity,
            item_reason
        )
        .execute(&state.pool)
        .await
        {
            tracing::error!(error = %err, "inserting return item failed");
        }
    }

    Ok(reply(
        StatusCode::CREATED,
        success(
            "Return request submitted",
            json!({ "returnId": return_id, "returnNumber": return_number }),
        ),
    ))
}

#[derive(Debug, Serialize)]
pub struct ReturnSummary {
    pub id: String,
    pub return_number: String,
    pub order_id: String,
    pub status: String,
    pub reason: String,
    pub refund_amount: Option<String>,
    pub return_tracking_number: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub updated_at: Timestamp,
    pub order_number: String,
}

/// `GET /api/returns/my-returns`
async fn mine(state: &AppState, user: AuthUser) -> anyhow::Result<Response> {
    let returns = sqlx::query_as!(
        ReturnSummary,
        r#"SELECT r.id, r.return_number, r.order_id, r.status, r.reason,
             CAST(r.refund_amount AS CHAR) AS "refund_amount: String",
             r.return_tracking_number, r.created_at, r.updated_at,
             o.order_number
           FROM returns r
           JOIN orders o ON r.order_id = o.id
           WHERE r.user_id = ?
           ORDER BY r.created_at DESC"#,
        user.id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(reply(
        StatusCode::OK,
        success("Returns fetched", json!({ "returns": returns })),
    ))
}

/// Every `returns` column (`r.*`), then what the query joins in (`extra`).
#[derive(Debug, Serialize)]
pub struct Return<E> {
    pub id: String,
    pub order_id: String,
    pub user_id: String,
    pub return_number: String,
    pub status: String,
    pub reason: String,
    pub return_details: Option<Value>,
    pub refund_amount: Option<String>,
    pub return_tracking_number: Option<String>,
    pub approved_by: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub approved_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub received_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub processed_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub updated_at: Timestamp,
    #[serde(flatten)]
    pub extra: E,
}

/// Build a [`Return`] from a query record with the `r.*` columns.
macro_rules! return_row {
    ($r:expr, $details:expr, $extra:expr) => {
        Return {
            id: $r.id,
            order_id: $r.order_id,
            user_id: $r.user_id,
            return_number: $r.return_number,
            status: $r.status,
            reason: $r.reason,
            return_details: $details,
            refund_amount: $r.refund_amount,
            return_tracking_number: $r.return_tracking_number,
            approved_by: $r.approved_by,
            approved_at: $r.approved_at,
            received_at: $r.received_at,
            processed_at: $r.processed_at,
            created_at: $r.created_at,
            updated_at: $r.updated_at,
            extra: $extra,
        }
    };
}

#[derive(Debug, Serialize)]
pub struct ReturnItem {
    pub id: String,
    pub return_id: String,
    pub order_item_id: String,
    pub quantity: u32,
    pub reason: Option<String>,
    pub condition_on_receipt: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Timestamp,
    pub product_name: String,
    pub unit_price: String,
}

#[derive(Debug, Serialize)]
pub struct DetailExtra {
    pub order_number: String,
    pub items: Vec<ReturnItem>,
}

/// `GET /api/returns/{id}` — the owner or an admin.
async fn detail(state: &AppState, user: AuthUser, id: String) -> anyhow::Result<Response> {
    let row = sqlx::query!(
        r#"SELECT r.id, r.order_id, r.user_id, r.return_number, r.status, r.reason,
             r.return_details AS "return_details: Value",
             CAST(r.refund_amount AS CHAR) AS "refund_amount: String",
             r.return_tracking_number, r.approved_by, r.approved_at, r.received_at,
             r.processed_at, r.created_at, r.updated_at, o.order_number
           FROM returns r
           JOIN orders o ON r.order_id = o.id
           WHERE r.id = ? AND (r.user_id = ? OR ? = TRUE)"#,
        id,
        user.id,
        user.is_admin()
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(row) = row else {
        return Ok(reply(StatusCode::NOT_FOUND, failure("Return not found")));
    };
    // A JSON string column is parsed once more (and throws if it isn't JSON).
    let details = match row.return_details.map(express::js_json) {
        Some(Value::String(s)) => Some(serde_json::from_str::<Value>(&s)?),
        other => other,
    };

    let items = sqlx::query_as!(
        ReturnItem,
        r#"SELECT ri.id, ri.return_id, ri.order_item_id, ri.quantity, ri.reason,
             ri.condition_on_receipt, ri.created_at, oi.product_name,
             CAST(oi.unit_price AS CHAR) AS "unit_price!: String"
           FROM return_items ri
           JOIN order_items oi ON ri.order_item_id = oi.id
           WHERE ri.return_id = ?"#,
        id
    )
    .fetch_all(&state.pool)
    .await?;

    let order_number = row.order_number.clone();
    let found = return_row!(
        row,
        details,
        DetailExtra {
            order_number,
            items
        }
    );
    Ok(reply(
        StatusCode::OK,
        success("Return details fetched", json!({ "return": found })),
    ))
}

/// `UPDATE returns SET ...` for a status change; `refund` is the
/// `refund_amount = ?` value when the body has one, bound with the type mysql2
/// would give it (MySQL then accepts or refuses it the same way).
macro_rules! set_status {
    ($pool:expr, $u:expr) => {
        sqlx::query!(
            "UPDATE returns SET status = ?,
               approved_by = IF(?, ?, approved_by), approved_at = IF(?, NOW(), approved_at),
               received_at = IF(?, NOW(), received_at), processed_at = IF(?, NOW(), processed_at),
               return_tracking_number = IF(?, ?, return_tracking_number),
               return_details = IF(?, JSON_SET(COALESCE(return_details, '{}'), '$.admin_notes', ?), return_details)
             WHERE id = ?",
            $u.status, $u.approved, $u.admin_id, $u.approved, $u.received, $u.processed,
            $u.tracking.is_some(), $u.tracking, $u.notes.is_some(), $u.notes, $u.id
        )
        .execute($pool)
        .await
    };
    ($pool:expr, $u:expr, refund = $refund:expr) => {
        sqlx::query!(
            "UPDATE returns SET status = ?,
               approved_by = IF(?, ?, approved_by), approved_at = IF(?, NOW(), approved_at),
               received_at = IF(?, NOW(), received_at), processed_at = IF(?, NOW(), processed_at),
               refund_amount = ?,
               return_tracking_number = IF(?, ?, return_tracking_number),
               return_details = IF(?, JSON_SET(COALESCE(return_details, '{}'), '$.admin_notes', ?), return_details)
             WHERE id = ?",
            $u.status, $u.approved, $u.admin_id, $u.approved, $u.received, $u.processed,
            $refund,
            $u.tracking.is_some(), $u.tracking, $u.notes.is_some(), $u.notes, $u.id
        )
        .execute($pool)
        .await
    };
}

struct StatusUpdate<'a> {
    id: &'a str,
    status: &'a str,
    admin_id: &'a str,
    approved: bool,
    received: bool,
    processed: bool,
    tracking: Option<&'a str>,
    notes: Option<&'a str>,
}

/// A truthy string body field.
fn non_empty<'a>(body: &'a Value, key: &str) -> Option<&'a str> {
    body.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

/// `PUT /api/returns/{id}/status` `{ status, admin_notes?, refund_amount?, return_tracking_number? }` (admin + CSRF)
async fn update_status(
    state: &AppState,
    admin: AuthUser,
    id: String,
    body: &Value,
) -> anyhow::Result<Response> {
    let Some(status) = body
        .get("status")
        .and_then(Value::as_str)
        .filter(|s| RETURN_STATUSES.contains(s))
    else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("status is required"),
        ));
    };
    if !is_optional_string(body.get("admin_notes"))
        || !is_optional_string(body.get("return_tracking_number"))
    {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("admin_notes and return_tracking_number must be text"),
        ));
    }
    let update = StatusUpdate {
        id: &id,
        status,
        admin_id: &admin.id,
        approved: status == "approved",
        received: status == "received",
        processed: status == "processed",
        tracking: non_empty(body, "return_tracking_number"),
        notes: non_empty(body, "admin_notes"),
    };
    let pool = &state.pool;
    // A value MySQL refuses fails the whole UPDATE: the route's 500.
    match body.get("refund_amount") {
        None => set_status!(pool, update)?,
        Some(Value::Null) => set_status!(pool, update, refund = None::<String>)?,
        Some(Value::Number(n)) => set_status!(pool, update, refund = n.as_f64())?,
        Some(Value::Bool(b)) => set_status!(pool, update, refund = i8::from(*b))?,
        Some(Value::String(s)) => set_status!(pool, update, refund = s)?,
        // Arrays and objects are bound as their JSON text.
        Some(other) => set_status!(pool, update, refund = other.to_string())?,
    };
    Ok(reply(
        StatusCode::OK,
        success("Return status updated", json!([])),
    ))
}

#[derive(Debug, Serialize)]
pub struct Customer {
    pub order_number: String,
    pub user_email: String,
    pub first_name: String,
    pub last_name: String,
}

/// `GET /api/returns/admin/all?status&page&limit` (admin)
async fn all(state: &AppState, parts: &Parts) -> anyhow::Result<Response> {
    let query = express::query(&parts.uri);
    let status = query.get("status");
    if !is_optional_string(status) {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("status must be a single value"),
        ));
    }
    let status = status.and_then(Value::as_str).filter(|s| !s.is_empty());
    let page = query.get("page").map_or(1.0, express::parse_int);
    let limit = query.get("limit").map_or(20.0, express::parse_int);
    let or = |n: f64, d: f64| if n.is_nan() || n == 0.0 { d } else { n };
    let limit = or(limit, 20.0).clamp(1.0, 100.0);
    let page = or(page, 1.0).max(1.0);
    // Node inlines `${offset}`: past u64 (or in exponent form) MySQL refuses it.
    let offset_text = common::json::js_number_string((page - 1.0) * limit);
    let offset: u64 = offset_text
        .parse()
        .map_err(|_| anyhow::anyhow!("OFFSET {offset_text} is not valid SQL"))?;
    let limit_rows = limit as u64;

    let rows = sqlx::query!(
        r#"SELECT r.id, r.order_id, r.user_id, r.return_number, r.status, r.reason,
             r.return_details AS "return_details: Value",
             CAST(r.refund_amount AS CHAR) AS "refund_amount: String",
             r.return_tracking_number, r.approved_by, r.approved_at, r.received_at,
             r.processed_at, r.created_at, r.updated_at,
             o.order_number, u.email AS user_email, u.first_name, u.last_name
           FROM returns r
           JOIN orders o ON r.order_id = o.id
           JOIN users u ON r.user_id = u.id
           WHERE (? IS NULL OR r.status = ?)
           ORDER BY r.created_at DESC, r.id DESC
           LIMIT ? OFFSET ?"#,
        status,
        status,
        limit_rows,
        offset
    )
    .fetch_all(&state.pool)
    .await?;
    let returns: Vec<_> = rows
        .into_iter()
        .map(|r| {
            let details = r.return_details.clone().map(express::js_json);
            let customer = Customer {
                order_number: r.order_number.clone(),
                user_email: r.user_email.clone(),
                first_name: r.first_name.clone(),
                last_name: r.last_name.clone(),
            };
            return_row!(r, details, customer)
        })
        .collect();

    let total = sqlx::query_scalar!(
        r#"SELECT CAST(COUNT(*) AS CHAR) AS "total!: String" FROM returns r
           WHERE (? IS NULL OR r.status = ?)"#,
        status,
        status
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(reply(
        StatusCode::OK,
        success(
            "Returns fetched",
            json!({
                "returns": returns,
                "total": total,
                "page": common::json::js_number(page),
                "limit": common::json::js_number(limit),
            }),
        ),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn items_and_quantities() {
        assert!(is_return_item(&json!({"orderItemId": "OI1"})));
        assert!(is_return_item(
            &json!({"orderItemId": "OI1", "quantity": 2, "reason": null})
        ));
        assert_eq!(return_quantity(&json!({"quantity": 0})), Some(1));
        assert_eq!(return_quantity(&json!({"quantity": ""})), Some(1));
        assert_eq!(return_quantity(&json!({"quantity": 3.0})), Some(3));
        assert_eq!(return_quantity(&json!({"quantity": 1.5})), None);
        assert_eq!(return_quantity(&json!({"quantity": -1})), None);
        assert_eq!(return_quantity(&json!({"quantity": "2"})), None);
        assert_eq!(return_quantity(&json!({"quantity": true})), None);
        assert_eq!(return_quantity(&json!({"quantity": 4294967296u64})), None);
        assert!(!is_return_item(&json!(["OI1"])));
        assert!(!is_return_item(&json!({"orderItemId": 1})));
        assert!(!is_return_item(&json!({"orderItemId": "OI1", "reason": 2})));
        assert!(!is_return_item(&json!(null)));
    }
}
