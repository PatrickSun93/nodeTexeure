//! `/api/admin` area: backend/routes/admin/orders.js — the order list, one
//! order with its items, a status change (history row + customer email) and
//! the bulk status change.
//!
//! Every route sits behind E's `protect, staffOrAdmin, adminLimiter,
//! csrfProtection` (see [`crate::admin`]) and adds its own guard and limiter:
//! the reads are admin-only, the status writes are open to staff.
//!
//! Customer emails go through the email queue only: `PUT /orders/:id/status`
//! queues the status template (`order_shipped` for "shipped"). Node used to
//! also send a direct SES shipping notification for "shipped" (with a made-up
//! `TRK<timestamp>` tracking number when none was set), so the customer got
//! two emails; both sides now queue the one `order_shipped` email.
//!
//! Reads go through [`crate::mysql_json`] so every column comes out the way
//! mysql2 hands it to Node (DECIMAL as a string, DATETIME as an ISO string,
//! JSON parsed); `GET /orders/:id` is `SELECT o.*`.

use axum::http::StatusCode;
use axum::response::Response;
use common::response::{failure, success};
use serde_json::{Map, Value, json};
use sqlx::MySqlPool;

use crate::admin::Limiter::{AdminRead, AdminWrite};
use crate::admin::{AdminRequest, Routes, Step::*, json};
use crate::body::truthy;
use crate::email_queue::{self, Enqueued};
use crate::mysql_json::{Js, fetch_rows};

use super::settings::js_stringify;

/// The orders / order_status_history `status` ENUM.
const ALLOWED_STATUSES: [&str; 7] = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
];
/// orders.tracking_number VARCHAR(100).
const TRACKING_NUMBER_MAX: usize = 100;

pub fn register(r: &mut Routes) {
    // router.get('/orders', admin, adminReadLimiter, handler)
    r.get("/orders", &[Admin, Limit(AdminRead)], list);
    // router.get('/orders/:id', admin, adminReadLimiter, handler)
    r.get("/orders/:id", &[Admin, Limit(AdminRead)], detail);
    // router.put('/orders/:id/status', staffOrAdmin, adminWriteLimiter, csrfProtection, handler)
    r.put(
        "/orders/:id/status",
        &[StaffOrAdmin, Limit(AdminWrite), Csrf],
        update_status,
    );
    // router.post('/orders/bulk-update', staffOrAdmin, adminWriteLimiter, csrfProtection, handler)
    r.post(
        "/orders/bulk-update",
        &[StaffOrAdmin, Limit(AdminWrite), Csrf],
        bulk_update,
    );
}

/// The routes' `catch`: 500 `Server error`.
pub(crate) fn server_error(context: &str, err: impl std::fmt::Display) -> Response {
    tracing::error!(error = %err, "{context}");
    json(StatusCode::INTERNAL_SERVER_ERROR, failure("Server error"))
}

pub(crate) fn bad_request(message: &str) -> Response {
    json(StatusCode::BAD_REQUEST, failure(message))
}

/// `const { a } = req.body` (`None` is `undefined`; an array body has no keys).
pub(crate) fn field<'a>(body: &'a Value, key: &str) -> Option<&'a Value> {
    match body {
        Value::Object(map) => map.get(key),
        _ => None,
    }
}

/// A row value in `res.json` (`undefined` → `null`, never sent as such).
pub(crate) fn out(v: Option<&Js>) -> Value {
    v.map_or(Value::Null, Js::to_json)
}

/// JavaScript truthiness of a row value (`undefined` is falsy).
pub(crate) fn row_truthy(v: Option<&Js>) -> bool {
    v.is_some_and(Js::truthy)
}

/// `a || b` over row values, as JSON.
pub(crate) fn or_else(v: Option<&Js>, fallback: Value) -> Value {
    if row_truthy(v) { out(v) } else { fallback }
}

/// `s.charAt(0).toUpperCase() + s.slice(1)`.
pub(crate) fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// `JSON.parse(String(text))` as an object/array, else `None` (parse error or
/// a primitive).
fn parse_object(text: &str) -> Option<Value> {
    serde_json::from_str::<Value>(text)
        .ok()
        .filter(|v| v.is_object() || v.is_array())
}

/// orders.js `parseAddress(raw)`: the JSON column as an object (`{}` for
/// anything else; a string is parsed).
fn parse_address(raw: Option<&Js>) -> Value {
    if !row_truthy(raw) {
        return json!({});
    }
    match raw {
        Some(Js::Json(v @ (Value::Object(_) | Value::Array(_)))) => v.clone(),
        Some(Js::Date(_) | Js::Buffer(_)) => json!({}),
        Some(Js::Json(Value::String(s)) | Js::String(s)) => {
            parse_object(s).unwrap_or_else(|| json!({}))
        }
        // `JSON.parse(5)` / `JSON.parse(true)`: not an object.
        _ => json!({}),
    }
}

/// orders.js `formatDestination(raw)`: "City, Country" (or whichever half is
/// a non-blank string).
fn format_destination(raw: Option<&Js>) -> String {
    let addr = parse_address(raw);
    ["city", "country"]
        .iter()
        .filter_map(|k| match field(&addr, k) {
            Some(Value::String(s)) if !crate::express::js_trim(s).is_empty() => Some(s.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// `GET /orders[?user_id=]`.
async fn list(req: AdminRequest) -> Response {
    let query = req.query();
    let user_id = query.get("user_id");
    // ?user_id=a&user_id=b is an array (and qs builds objects): only a plain
    // string may be bound against the VARCHAR column.
    if user_id.is_some_and(|v| !v.is_string()) {
        return bad_request("user_id must be a string");
    }
    let filter = user_id.filter(|v| truthy(Some(v)));
    let sql = format!(
        "SELECT o.id, o.order_number, o.created_at, o.status, o.total_amount,
                COALESCE(u.first_name, o.guest_email) as customer_name,
                o.shipping_address_json
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         {}
         ORDER BY o.created_at DESC",
        if filter.is_some() {
            "WHERE o.user_id = ?"
        } else {
            ""
        }
    );
    let params: Vec<Value> = filter.cloned().into_iter().collect();
    let rows = match fetch_rows(&req.state.pool, &sql, &params).await {
        Ok(rows) => rows,
        Err(err) => return server_error("admin orders list", err),
    };
    let orders: Vec<Value> = rows
        .iter()
        .map(|r| {
            let destination = format_destination(r.get("shipping_address_json"));
            let status = match r.get("status") {
                Some(s) if s.truthy() => Value::String(capitalize(&s.js_string())),
                _ => json!("Pending"),
            };
            json!({
                "id": or_else(r.get("order_number"), out(r.get("id"))),
                "_id": out(r.get("id")),
                "date": out(r.get("created_at")),
                "customer": or_else(r.get("customer_name"), json!("Guest")),
                "amount": out(r.get("total_amount")),
                "destination": if destination.is_empty() { "N/A".to_owned() } else { destination },
                "status": status,
            })
        })
        .collect();
    json(
        StatusCode::OK,
        success("Orders fetched successfully", json!([{ "orders": orders }])),
    )
}

/// `GET /orders/:id` (by id or order number): the order row, its user's
/// name/email and its items.
async fn detail(req: AdminRequest) -> Response {
    let id = Value::String(req.param(0).to_owned());
    let pool = &req.state.pool;
    let orders = match fetch_rows(
        pool,
        "SELECT o.*, u.first_name, u.last_name, u.email as user_email
         FROM orders o
         LEFT JOIN users u ON o.user_id = u.id
         WHERE o.id = ? OR o.order_number = ?",
        &[id.clone(), id],
    )
    .await
    {
        Ok(rows) => rows,
        Err(err) => return server_error("admin order detail", err),
    };
    let Some(order) = orders.into_iter().next() else {
        return json(StatusCode::NOT_FOUND, failure("Order not found"));
    };
    // A failed items query is just no items.
    let items = match fetch_rows(
        pool,
        "SELECT * FROM order_items WHERE order_id = ?",
        &[out(order.get("id"))],
    )
    .await
    {
        Ok(rows) => rows.iter().map(|r| Value::Object(r.to_json())).collect(),
        Err(err) => {
            tracing::error!(error = %err, "admin order detail: items query failed");
            Vec::new()
        }
    };
    let mut details = order.to_json();
    details.insert("items".into(), Value::Array(items));
    json(
        StatusCode::OK,
        success("Order details fetched", json!([{ "order": details }])),
    )
}

fn invalid_status() -> Response {
    bad_request(&format!(
        "Invalid status. Allowed: {}",
        ALLOWED_STATUSES.join(", ")
    ))
}

/// `notes ? JSON.stringify({ notes }) : null`.
fn status_details(notes: Option<&Value>) -> Option<String> {
    truthy(notes).then(|| {
        let mut map = Map::new();
        map.insert("notes".into(), notes.cloned().unwrap_or(Value::Null));
        js_stringify(&Value::Object(map))
    })
}

/// The status → email template map of the status route.
fn template_for(status: &str) -> Option<&'static str> {
    match status {
        "confirmed" => Some("order_confirmed"),
        "processing" => Some("order_processing"),
        "shipped" => Some("order_shipped"),
        "delivered" => Some("order_delivered"),
        "cancelled" => Some("order_cancelled"),
        _ => None,
    }
}

/// `PUT /orders/:id/status` `{ status, notes?, tracking_number? }`.
async fn update_status(req: AdminRequest) -> Response {
    let id = req.param(0).to_owned();
    let body = &req.body;
    let normalized = match field(body, "status") {
        Some(Value::String(s)) => s.to_lowercase(),
        _ => return invalid_status(),
    };
    if !ALLOWED_STATUSES.contains(&normalized.as_str()) {
        return invalid_status();
    }
    // Optional (absent / null / '' keeps the stored one), else a string that
    // fits the column (`.length` is UTF-16 units).
    let tracking =
        field(body, "tracking_number").filter(|v| !v.is_null() && v.as_str() != Some(""));
    let tracking = match tracking {
        None => None,
        Some(Value::String(s)) if crate::express::js_len(s) <= TRACKING_NUMBER_MAX => {
            Some(s.as_str())
        }
        Some(_) => {
            return bad_request(&format!(
                "tracking_number must be a string of at most {TRACKING_NUMBER_MAX} characters"
            ));
        }
    };

    let pool = &req.state.pool;
    let updated = match tracking {
        Some(tracking) => {
            sqlx::query!(
                "UPDATE orders SET status = ?, tracking_number = ? WHERE id = ?",
                normalized,
                tracking,
                id
            )
            .execute(pool)
            .await
        }
        None => {
            sqlx::query!("UPDATE orders SET status = ? WHERE id = ?", normalized, id)
                .execute(pool)
                .await
        }
    };
    match updated {
        Err(err) => return server_error("admin order status update", err),
        // Unknown id (mysql2 and sqlx both count matched rows: FOUND_ROWS).
        Ok(done) if done.rows_affected() == 0 => {
            return json(StatusCode::NOT_FOUND, failure("Order not found"));
        }
        Ok(_) => {}
    }

    let pool = &req.state.pool;
    let details = status_details(field(body, "notes"));
    insert_history(pool, &req.user().id, &id, &normalized, details).await;
    notify_customer(pool, &id, &normalized).await;
    json(StatusCode::OK, success("Order status updated", json!([])))
}

/// The `order_status_history` row (its result is ignored, like Node's).
async fn insert_history(
    pool: &MySqlPool,
    changed_by: &str,
    order_id: &str,
    status: &str,
    details: Option<String>,
) {
    let history_id = match email_queue::uuid_v4() {
        Ok(id) => id,
        Err(err) => {
            tracing::error!(error = %err, "order status history: no uuid");
            return;
        }
    };
    if let Err(err) = sqlx::query!(
        "INSERT INTO order_status_history (id, order_id, status, status_details, changed_by) VALUES (?, ?, ?, ?, ?)",
        history_id,
        order_id,
        status,
        details,
        changed_by
    )
    .execute(pool)
    .await
    {
        tracing::error!(error = %err, "order status history insert failed");
    }
}

/// Queues the status email to the order's customer (user or guest email).
async fn notify_customer(pool: &MySqlPool, order_id: &str, status: &str) {
    let rows = fetch_rows(
        pool,
        "SELECT o.order_number, o.guest_email, u.email as user_email,
                COALESCE(u.first_name, 'Valued Customer') as customer_name,
                o.tracking_number
         FROM orders o LEFT JOIN users u ON o.user_id = u.id
         WHERE o.id = ?",
        &[Value::String(order_id.to_owned())],
    )
    .await
    .unwrap_or_else(|err| {
        tracing::error!(error = %err, "order status email: lookup failed");
        Vec::new()
    });
    let Some(order) = rows.first() else { return };
    let email: Option<&Js> = [order.get("user_email"), order.get("guest_email")]
        .into_iter()
        .flatten()
        .find(|v| v.truthy());
    let Some(email) = email else { return };
    let Some(template) = template_for(status) else {
        return;
    };
    let mut variables = Map::new();
    variables.insert("order_number".into(), out(order.get("order_number")));
    variables.insert("customer_name".into(), out(order.get("customer_name")));
    variables.insert(
        "tracking_number".into(),
        or_else(order.get("tracking_number"), json!("")),
    );
    let name = order.get("customer_name");
    let to_name = if row_truthy(name) {
        name.map(Js::js_string).unwrap_or_default()
    } else {
        String::new()
    };
    if let Enqueued::NotQueued { reason } = email_queue::enqueue(
        pool,
        &email.js_string(),
        &to_name,
        template,
        &variables,
        None,
    )
    .await
    {
        tracing::error!(reason, template, "Non-fatal: status email enqueue failed");
    }
}

/// `POST /orders/bulk-update` `{ orderIds, status, notes? }`: the single
/// status change (minus the email) for each known id.
async fn bulk_update(req: AdminRequest) -> Response {
    let body = &req.body;
    let ids = match field(body, "orderIds") {
        Some(Value::Array(ids)) if !ids.is_empty() => ids,
        _ => return bad_request("orderIds must be a non-empty array"),
    };
    // Each id is bound against the VARCHAR orders.id column: strings only.
    let ids: Option<Vec<&str>> = ids
        .iter()
        .map(|v| v.as_str().filter(|s| !s.is_empty()))
        .collect();
    let Some(ids) = ids else {
        return bad_request("orderIds must contain only non-empty strings");
    };
    let normalized = match field(body, "status") {
        Some(Value::String(s)) => s.to_lowercase(),
        _ => String::new(),
    };
    if !ALLOWED_STATUSES.contains(&normalized.as_str()) {
        return invalid_status();
    }
    let details = status_details(field(body, "notes"));
    let pool = &req.state.pool;
    let mut updated = 0u64;
    for order_id in ids {
        // Unknown ids are skipped (also avoids the history row's FK error).
        let exists = sqlx::query_scalar!("SELECT id FROM orders WHERE id = ?", order_id)
            .fetch_optional(pool)
            .await
            .unwrap_or_else(|err| {
                tracing::error!(error = %err, "bulk order update: lookup failed");
                None
            });
        if exists.is_none() {
            continue;
        }
        if let Err(err) = sqlx::query!(
            "UPDATE orders SET status = ? WHERE id = ?",
            normalized,
            order_id
        )
        .execute(pool)
        .await
        {
            tracing::error!(error = %err, "bulk order update failed");
            continue;
        }
        insert_history(pool, &req.user().id, order_id, &normalized, details.clone()).await;
        updated += 1;
    }
    json(
        StatusCode::OK,
        success(
            "Orders updated successfully",
            json!([{ "result": { "updated": updated } }]),
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mysql_json::JsRow;

    fn row(pairs: &[(&str, Js)]) -> JsRow {
        JsRow(
            pairs
                .iter()
                .map(|(k, v)| ((*k).to_owned(), v.clone()))
                .collect(),
        )
    }

    #[test]
    fn destination_follows_format_destination() {
        let dest = |v: Js| format_destination(Some(&v));
        assert_eq!(
            dest(Js::Json(json!({"city": "Austin", "country": "US"}))),
            "Austin, US"
        );
        assert_eq!(dest(Js::Json(json!({"city": "  ", "country": "US"}))), "US");
        assert_eq!(dest(Js::Json(json!({"city": 5, "country": "US"}))), "US");
        assert_eq!(
            dest(Js::Json(json!(r#"{"city":"Paris","country":"FR"}"#))),
            "Paris, FR"
        );
        assert_eq!(dest(Js::Json(json!("not json"))), "");
        assert_eq!(dest(Js::Json(json!(["Austin"]))), "");
        assert_eq!(dest(Js::Json(json!(7))), "");
        assert_eq!(dest(Js::Null), "");
        assert_eq!(format_destination(None), "");
    }

    #[test]
    fn helpers_follow_javascript() {
        assert_eq!(capitalize("shipped"), "Shipped");
        assert_eq!(capitalize(""), "");
        assert_eq!(status_details(Some(&json!(""))), None);
        assert_eq!(status_details(None), None);
        assert_eq!(
            status_details(Some(&json!({"b": 1.0, "a": [2.5]}))).as_deref(),
            Some(r#"{"notes":{"a":[2.5],"b":1}}"#)
        );
        let r = row(&[("a", Js::Null), ("b", Js::String("x".into()))]);
        assert_eq!(or_else(r.get("a"), json!("Guest")), json!("Guest"));
        assert_eq!(or_else(r.get("b"), json!("Guest")), json!("x"));
        assert_eq!(or_else(r.get("missing"), json!(1)), json!(1));
    }
}
