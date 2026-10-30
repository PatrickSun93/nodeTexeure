//! Mount `/api/admin/analytics`: backend/routes/analyticsRoutes.js. Every
//! route is `protect, admin` with no limiter (this mount comes before the
//! `/api/admin` router, so neither its adminLimiter nor its CSRF check runs);
//! a path this router doesn't define falls through to `/api/admin`, where
//! `/analytics/summary`, `/analytics/revenue` and `/analytics/sales-by-region`
//! live (see [`super::analytics`]).
//!
//! The queries are Node's, read through [`crate::mysql_json`] so COUNT/SUM/AVG
//! come back as the strings mysql2 gives (`bigNumberStrings`), and the
//! arithmetic on them is JavaScript's: `Number()`/`parseFloat()` coercion,
//! `toFixed`, `|| 0` defaults, stable sorts. `getDateRange` is replayed with
//! JavaScript `Date` semantics in the process's local time zone
//! ([`crate::js_date`]), including `new Date(start_date)` parsing; the Date
//! parameters are sent as the exact bytes mysql2 sends (an Invalid Date as a
//! zero DATETIME, a year past 65535 as the RangeError that fails the query).
//! A failed query is what `executeQuery` makes of it: `DatabaseUtil.rows()`
//! reads it as no rows, while `result.data[0]` / `result.data.map` throw the
//! TypeError the route answers as a 500 with its message.
//!
//! There is no caching in these routes (cacheManager is not used here).

use std::cmp::Ordering;

use axum::http::StatusCode;
use axum::response::Response;
use common::json::{js_number, js_to_fixed};
use common::response::{failure_with, success};
use serde_json::{Map, Value, json};
use sqlx::MySql;
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::mysql::MySqlTypeInfo;

use crate::admin::{AdminRequest, Routes, Step, safe_limit};
use crate::csv::js_parse_float;
use crate::js_date::{JsDate, LocalZone};
use crate::mysql_json::{Js, JsRow, Schema, error_message};

pub fn register(r: &mut Routes) {
    use Step::{Admin, Protect};
    let steps = &[Protect, Admin];
    r.get("/sales-summary", steps, sales_summary);
    r.get("/revenue-trend", steps, revenue_trend);
    r.get("/top-products", steps, top_products);
    r.get("/customer-stats", steps, customer_stats);
    r.get("/inventory-status", steps, inventory_status);
    r.get("/revenue-by-category", steps, revenue_by_category);
    r.get("/revenue-vs-target", steps, revenue_vs_target);
    r.get("/revenue-by-weekday", steps, revenue_by_weekday);
    r.get("/bottom-products", steps, bottom_products);
    r.get("/conversion-funnel", steps, conversion_funnel);
    r.get("/new-vs-returning", steps, new_vs_returning);
    r.get("/revenue-shortfall", steps, revenue_shortfall);
}

// ---------------------------------------------------------------------------
// executeQuery with mysql2's parameters
// ---------------------------------------------------------------------------

/// A bound parameter: a JS `Date` or a string.
pub(crate) enum Param {
    Date(JsDate),
    Text(String),
}

/// A DATETIME parameter as mysql2's `writeDate` encodes it.
struct DateBytes([u8; 12]);

impl sqlx::Type<MySql> for DateBytes {
    fn type_info() -> MySqlTypeInfo {
        <chrono::NaiveDateTime as sqlx::Type<MySql>>::type_info()
    }
}

impl<'q> sqlx::Encode<'q, MySql> for DateBytes {
    fn encode_by_ref(&self, buf: &mut Vec<u8>) -> Result<IsNull, BoxDynError> {
        buf.extend_from_slice(&self.0);
        Ok(IsNull::No)
    }
}

/// `DatabaseUtil.executeQuery(sql, params)` for a read: the rows as mysql2
/// builds them, or `Err` (`{ success: false, error }`) with the message.
pub(crate) async fn execute(
    pool: &sqlx::MySqlPool,
    sql: &str,
    params: &[Param],
) -> Result<Vec<JsRow>, String> {
    let mut query = sqlx::query(sql);
    for p in params {
        query = match p {
            Param::Date(d) => match d.mysql_param() {
                Some(bytes) => query.bind(DateBytes(bytes)),
                None => {
                    return Err(
                        "The value of \"value\" is out of range. It must be >= 0 and <= 65535."
                            .into(),
                    );
                }
            },
            Param::Text(s) => query.bind(s.clone()),
        };
    }
    let schema = Schema::cached(pool).await.map_err(|e| error_message(&e))?;
    let rows = query.fetch_all(pool).await.map_err(|e| {
        tracing::warn!(error = %e, "analytics query failed");
        error_message(&e)
    })?;
    schema.rows(&rows).map_err(|e| error_message(&e))
}

/// `DatabaseUtil.rows(result)`: a failed query is no rows.
pub(crate) fn rows(result: Result<Vec<JsRow>, String>) -> Vec<JsRow> {
    result.unwrap_or_default()
}

// ---------------------------------------------------------------------------
// JavaScript values
// ---------------------------------------------------------------------------

/// `Number(v)` (`None` is `undefined`).
pub(crate) fn number(v: Option<&Js>) -> f64 {
    match v {
        None => f64::NAN,
        Some(Js::Null) => 0.0,
        Some(Js::Number(n)) => *n,
        Some(Js::Date(d)) => d.map_or(f64::NAN, |d| d.and_utc().timestamp_millis() as f64),
        Some(Js::Json(v)) => crate::body::js_to_number(v),
        Some(other) => crate::body::js_to_number(&Value::String(other.js_string())),
    }
}

/// `parseFloat(v)`.
pub(crate) fn parse_float(v: Option<&Js>) -> f64 {
    match v {
        None => f64::NAN,
        Some(Js::Number(n)) => *n,
        Some(other) => js_parse_float(&other.js_string()),
    }
}

/// `v || 0`.
pub(crate) fn or_zero(v: Option<&Js>) -> Js {
    match v {
        Some(js) if js.truthy() => js.clone(),
        _ => Js::Number(0.0),
    }
}

/// `parseFloat(v || 0)`.
pub(crate) fn float_or_zero(v: Option<&Js>) -> f64 {
    parse_float(Some(&or_zero(v)))
}

/// `Number(v || 0)`.
pub(crate) fn number_or_zero(v: Option<&Js>) -> f64 {
    number(Some(&or_zero(v)))
}

/// The value as `res.json` writes it (`undefined` never happens for a
/// selected column; it would be dropped).
pub(crate) fn raw(v: Option<&Js>) -> Value {
    v.map_or(Value::Null, Js::to_json)
}

/// `x.toFixed(d)` as a JSON string.
pub(crate) fn fixed(x: f64, digits: usize) -> Value {
    Value::String(js_to_fixed(x, digits))
}

/// `parseFloat(x.toFixed(d))`.
fn fixed_number(x: f64, digits: usize) -> f64 {
    js_parse_float(&js_to_fixed(x, digits))
}

/// `res.status(500).json(failure('Server error', { error: error.message }))`.
fn server_error(message: &str) -> Response {
    crate::admin::json(
        StatusCode::INTERNAL_SERVER_ERROR,
        failure_with("Server error", json!({ "error": message })),
    )
}

/// The TypeError of reading `prop` off a failed query's `undefined` data.
fn undefined_read(prop: &str) -> Response {
    server_error(&format!(
        "Cannot read properties of undefined (reading '{prop}')"
    ))
}

fn ok(message: &str, table: Value) -> Response {
    crate::admin::json(StatusCode::OK, success(message, table))
}

/// `result.data[0]` (`None`: a failed query, whose `undefined` data makes it
/// throw; no row is an empty one, whose fields read as `undefined`).
fn first_row(result: Result<Vec<JsRow>, String>) -> Option<JsRow> {
    result
        .ok()
        .map(|rows| rows.into_iter().next().unwrap_or_default())
}

// ---------------------------------------------------------------------------
// getDateRange
// ---------------------------------------------------------------------------

/// `const { period = fallback, start_date, end_date } = req.query`, then
/// `getDateRange(period, start_date, end_date)`.
fn date_range(query: &Map<String, Value>, fallback: &str) -> (JsDate, JsDate) {
    let period = match query.get("period") {
        None => Some(fallback),
        Some(Value::String(s)) => Some(s.as_str()),
        // `switch` compares strictly: arrays/objects hit the default.
        Some(_) => None,
    };
    get_date_range(period, query.get("start_date"), query.get("end_date"))
}

/// `new Date(value)` for a query value (`ToPrimitive` first: arrays join,
/// objects are "[object Object]").
fn date_of(value: &Value) -> JsDate {
    JsDate::parse(&crate::body::js_string(value), &LocalZone)
}

fn get_date_range(
    period: Option<&str>,
    start_date: Option<&Value>,
    end_date: Option<&Value>,
) -> (JsDate, JsDate) {
    let z = &LocalZone;
    let mut now = JsDate::now();
    let local = |d: &JsDate| d.local_fields(z);
    match period {
        Some("today") => {
            let start = JsDate::from_ms(now.set_hours(0.0, 0.0, 0.0, 0.0, z));
            let end = JsDate::from_ms(now.set_hours(23.0, 59.0, 59.0, 999.0, z));
            (start, end)
        }
        Some("yesterday") => {
            let mut yesterday = now;
            let date = local(&yesterday).map_or(f64::NAN, |f| f.date);
            yesterday.set_date(date - 1.0, z);
            let start = JsDate::from_ms(yesterday.set_hours(0.0, 0.0, 0.0, 0.0, z));
            let end = JsDate::from_ms(yesterday.set_hours(23.0, 59.0, 59.0, 999.0, z));
            (start, end)
        }
        Some("week") => {
            let mut start = now;
            let date = local(&now).map_or(f64::NAN, |f| f.date);
            start.set_date(date - 7.0, z);
            (start, JsDate::now())
        }
        Some("month") => {
            let mut start = now;
            let month = local(&now).map_or(f64::NAN, |f| f.month);
            start.set_month(month - 1.0, z);
            (start, JsDate::now())
        }
        Some("year") => {
            let mut start = now;
            let year = local(&now).map_or(f64::NAN, |f| f.year);
            start.set_full_year(year - 1.0, z);
            (start, JsDate::now())
        }
        Some("custom") => {
            let truthy = |v: Option<&Value>| crate::body::truthy(v);
            let start = match start_date {
                Some(v) if truthy(Some(v)) => date_of(v),
                _ => {
                    let month = local(&now).map_or(f64::NAN, |f| f.month);
                    JsDate::from_ms(now.set_month(month - 1.0, z))
                }
            };
            let end = match end_date {
                Some(v) if truthy(Some(v)) => date_of(v),
                _ => JsDate::now(),
            };
            (start, end)
        }
        _ => {
            let mut start = now;
            let date = local(&now).map_or(f64::NAN, |f| f.date);
            start.set_date(date - 30.0, z);
            (start, JsDate::now())
        }
    }
}

fn period_json(start: JsDate, end: JsDate) -> Value {
    json!({ "start": start.to_json(), "end": end.to_json() })
}

fn between(start: JsDate, end: JsDate) -> [Param; 2] {
    [Param::Date(start), Param::Date(end)]
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const SALES_SUMMARY: &str = "
            SELECT
                COUNT(*) as total_orders,
                COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as total_revenue,
                AVG(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE NULL END) as avg_order_value,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN subtotal ELSE 0 END) as total_subtotal,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN tax_amount ELSE 0 END) as total_tax,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN shipping_amount ELSE 0 END) as total_shipping,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN discount_amount ELSE 0 END) as total_discounts
            FROM orders
            WHERE created_at BETWEEN ? AND ?
        ";

const SALES_SUMMARY_PREV: &str = "
            SELECT
                COUNT(*) as prev_orders,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as prev_revenue
            FROM orders
            WHERE created_at BETWEEN ? AND ?
        ";

/// GET /sales-summary
async fn sales_summary(req: AdminRequest) -> Response {
    let (start, end) = date_range(&req.query(), "month");
    let pool = &req.state.pool;
    let summary = match first_row(execute(pool, SALES_SUMMARY, &between(start, end)).await) {
        Some(row) => row,
        None => return undefined_read("0"),
    };
    let period_length = end.time() - start.time();
    let prev_start = JsDate::from_ms(start.time() - period_length);
    let prev_end = JsDate::from_ms(start.time());
    let prev =
        match first_row(execute(pool, SALES_SUMMARY_PREV, &between(prev_start, prev_end)).await) {
            Some(row) => row,
            None => return undefined_read("0"),
        };
    let get = |k: &str| summary.get(k);
    let prev_orders = number(prev.get("prev_orders"));
    let order_growth = if prev_orders > 0.0 {
        fixed_number(
            (number(get("total_orders")) - prev_orders) / prev_orders * 100.0,
            2,
        )
    } else {
        0.0
    };
    let prev_revenue = number(prev.get("prev_revenue"));
    let revenue_growth = if prev_revenue > 0.0 {
        fixed_number(
            (number(get("total_revenue")) - prev_revenue) / prev_revenue * 100.0,
            2,
        )
    } else {
        0.0
    };
    let money = |k: &str| fixed(float_or_zero(get(k)), 2);
    ok(
        "Sales summary fetched successfully",
        json!({
            "period": period_json(start, end),
            "metrics": {
                "total_orders": raw(get("total_orders")),
                "delivered_orders": raw(get("delivered_orders")),
                "pending_orders": raw(get("pending_orders")),
                "cancelled_orders": raw(get("cancelled_orders")),
                "total_revenue": money("total_revenue"),
                "avg_order_value": money("avg_order_value"),
                "total_subtotal": money("total_subtotal"),
                "total_tax": money("total_tax"),
                "total_shipping": money("total_shipping"),
                "total_discounts": money("total_discounts"),
            },
            "growth": {
                "orders": js_number(order_growth),
                "revenue": js_number(revenue_growth),
            }
        }),
    )
}

const REVENUE_TREND: &str = "
            SELECT
                DATE_FORMAT(created_at, ?) as period,
                COUNT(*) as order_count,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as revenue,
                AVG(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE NULL END) as avg_order_value
            FROM orders
            WHERE created_at BETWEEN ? AND ?
            GROUP BY period
            ORDER BY period ASC
        ";

/// GET /revenue-trend
async fn revenue_trend(req: AdminRequest) -> Response {
    let query = req.query();
    let (start, end) = date_range(&query, "month");
    let group_by = query
        .get("group_by")
        .cloned()
        .unwrap_or_else(|| Value::String("day".into()));
    let format = match group_by.as_str() {
        Some("hour") => "%Y-%m-%d %H:00:00",
        Some("week") => "%Y-W%u",
        Some("month") => "%Y-%m",
        _ => "%Y-%m-%d",
    };
    let params = [
        Param::Text(format.into()),
        Param::Date(start),
        Param::Date(end),
    ];
    let Ok(rows) = execute(&req.state.pool, REVENUE_TREND, &params).await else {
        return undefined_read("map");
    };
    let data: Vec<Value> = rows
        .iter()
        .map(|row| {
            json!({
                "period": raw(row.get("period")),
                "order_count": raw(row.get("order_count")),
                "revenue": fixed(float_or_zero(row.get("revenue")), 2),
                "avg_order_value": fixed(float_or_zero(row.get("avg_order_value")), 2),
            })
        })
        .collect();
    ok(
        "Revenue trend fetched successfully",
        json!({
            "period": { "start": start.to_json(), "end": end.to_json(), "group_by": group_by },
            "data": data,
        }),
    )
}

/// The top/bottom-products query (`ORDER BY total_revenue <order>`).
fn products_sql(order: &str, limit: f64) -> String {
    format!(
        "
            SELECT
                p.id,
                p.name,
                p.slug,
                p.base_price,
                COUNT(oi.id) as times_sold,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                AVG(CASE WHEN pr.rating IS NOT NULL THEN pr.rating ELSE NULL END) as avg_rating,
                COUNT(DISTINCT pr.id) as review_count
            FROM products p
            INNER JOIN order_items oi ON p.id = oi.product_id
            INNER JOIN orders o ON oi.order_id = o.id
            LEFT JOIN product_reviews pr ON p.id = pr.product_id AND pr.is_approved = 1
            WHERE o.created_at BETWEEN ? AND ?
            AND o.status NOT IN ('cancelled', 'refunded')
            GROUP BY p.id, p.name, p.slug, p.base_price
            ORDER BY total_revenue {order}
            LIMIT {}
        ",
        limit as i64
    )
}

fn product_json(row: &JsRow) -> Value {
    let avg = row.get("avg_rating");
    json!({
        "id": raw(row.get("id")),
        "name": raw(row.get("name")),
        "slug": raw(row.get("slug")),
        "base_price": fixed(parse_float(row.get("base_price")), 2),
        "times_sold": raw(row.get("times_sold")),
        "total_quantity": raw(row.get("total_quantity")),
        "total_revenue": fixed(float_or_zero(row.get("total_revenue")), 2),
        "avg_rating": if avg.is_some_and(Js::truthy) { fixed(parse_float(avg), 1) } else { Value::Null },
        "review_count": raw(row.get("review_count")),
    })
}

/// GET /top-products and GET /bottom-products.
async fn ranked_products(req: AdminRequest, order: &str, fallback: f64, message: &str) -> Response {
    let query = req.query();
    let (start, end) = date_range(&query, "month");
    let limit = query.get("limit").cloned().unwrap_or(json!(fallback));
    let limit = safe_limit(Some(&limit), fallback, 100.0);
    let sql = products_sql(order, limit);
    let products: Vec<Value> = rows(execute(&req.state.pool, &sql, &between(start, end)).await)
        .iter()
        .map(product_json)
        .collect();
    ok(
        message,
        json!({ "period": period_json(start, end), "products": products }),
    )
}

async fn top_products(req: AdminRequest) -> Response {
    ranked_products(req, "DESC", 10.0, "Top products fetched successfully").await
}

async fn bottom_products(req: AdminRequest) -> Response {
    ranked_products(req, "ASC", 5.0, "Bottom products fetched successfully").await
}

const NEW_CUSTOMERS: &str = "
            SELECT COUNT(*) as new_customers
            FROM users
            WHERE role = 'customer' AND created_at BETWEEN ? AND ?
        ";

const REPEAT_CUSTOMERS: &str = "
            SELECT COUNT(DISTINCT user_id) as repeat_customers
            FROM (
                SELECT user_id, COUNT(*) as order_count
                FROM orders
                WHERE created_at BETWEEN ? AND ?
                AND status NOT IN ('cancelled', 'refunded')
                GROUP BY user_id
                HAVING order_count > 1
            ) as repeat_buyers
        ";

const ACTIVE_CUSTOMERS: &str = "
            SELECT COUNT(DISTINCT user_id) as active_customers
            FROM orders
            WHERE created_at BETWEEN ? AND ?
            AND status NOT IN ('cancelled', 'refunded')
        ";

const LIFETIME_VALUE: &str = "
            SELECT
                u.id,
                CONCAT(u.first_name, ' ', u.last_name) as name,
                COUNT(o.id) as total_orders,
                SUM(o.total_amount) as lifetime_value,
                MAX(o.created_at) as last_order_date
            FROM users u
            INNER JOIN orders o ON u.id = o.user_id
            WHERE o.status NOT IN ('cancelled', 'refunded')
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY lifetime_value DESC
            LIMIT 10
        ";

/// GET /customer-stats
async fn customer_stats(req: AdminRequest) -> Response {
    let (start, end) = date_range(&req.query(), "month");
    let pool = &req.state.pool;
    // Run in Node's order; the response then reads them in its own order.
    let new_customers = execute(pool, NEW_CUSTOMERS, &between(start, end)).await;
    let repeat = execute(pool, REPEAT_CUSTOMERS, &between(start, end)).await;
    let active = execute(pool, ACTIVE_CUSTOMERS, &between(start, end)).await;
    let lifetime = execute(pool, LIFETIME_VALUE, &[]).await;

    let new_customers = match first_row(new_customers) {
        Some(row) => row,
        None => return undefined_read("0"),
    };
    let active = match first_row(active) {
        Some(row) => row,
        None => return undefined_read("0"),
    };
    let repeat = match first_row(repeat) {
        Some(row) => row,
        None => return undefined_read("0"),
    };
    let Ok(lifetime) = lifetime else {
        return undefined_read("map");
    };
    let active_n = number(active.get("active_customers"));
    let retention = if active_n > 0.0 {
        fixed(number(repeat.get("repeat_customers")) / active_n * 100.0, 2)
    } else {
        json!(0)
    };
    let top: Vec<Value> = lifetime
        .iter()
        .map(|row| {
            json!({
                "id": raw(row.get("id")),
                "name": raw(row.get("name")),
                "total_orders": raw(row.get("total_orders")),
                "lifetime_value": fixed(parse_float(row.get("lifetime_value")), 2),
                "last_order_date": raw(row.get("last_order_date")),
            })
        })
        .collect();
    ok(
        "Customer stats fetched successfully",
        json!({
            "period": period_json(start, end),
            "metrics": {
                "new_customers": raw(new_customers.get("new_customers")),
                "active_customers": raw(active.get("active_customers")),
                "repeat_customers": raw(repeat.get("repeat_customers")),
                "retention_rate": retention,
            },
            "top_customers": top,
        }),
    )
}

const INVENTORY_STATS: &str = "
            SELECT
                COUNT(DISTINCT p.id) as total_products,
                COALESCE(SUM(i.quantity_available), 0) as total_stock,
                SUM(CASE WHEN i.quantity_available <= i.reorder_point THEN 1 ELSE 0 END) as low_stock_items,
                SUM(CASE WHEN i.quantity_available = 0 THEN 1 ELSE 0 END) as out_of_stock_items,
                AVG(i.quantity_available) as avg_stock_per_product
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            WHERE p.status = 'approved'
        ";

const LOW_STOCK: &str = "
            SELECT
                p.id,
                p.name,
                p.sku,
                i.quantity_available AS stock_quantity,
                i.reorder_point AS low_stock_threshold,
                p.base_price
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            WHERE p.status = 'approved'
            AND i.quantity_available <= i.reorder_point
            ORDER BY i.quantity_available ASC
            LIMIT 20
        ";

const STOCK_VALUE: &str = "
            SELECT
                0 as total_cost_value,
                COALESCE(SUM(i.quantity_available * p.base_price), 0) as total_retail_value
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            WHERE p.status = 'approved'
        ";

/// GET /inventory-status
async fn inventory_status(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let stats = execute(pool, INVENTORY_STATS, &[]).await;
    let low = execute(pool, LOW_STOCK, &[]).await;
    let value = execute(pool, STOCK_VALUE, &[]).await;
    let stats = match first_row(stats) {
        Some(row) => row,
        None => return undefined_read("0"),
    };
    let value = match first_row(value) {
        Some(row) => row,
        None => return undefined_read("0"),
    };
    let Ok(low) = low else {
        return undefined_read("map");
    };
    let low: Vec<Value> = low
        .iter()
        .map(|row| {
            json!({
                "id": raw(row.get("id")),
                "name": raw(row.get("name")),
                "sku": raw(row.get("sku")),
                "stock_quantity": raw(row.get("stock_quantity")),
                "low_stock_threshold": raw(row.get("low_stock_threshold")),
                "base_price": fixed(parse_float(row.get("base_price")), 2),
            })
        })
        .collect();
    ok(
        "Inventory status fetched successfully",
        json!({
            "overview": {
                "total_products": raw(stats.get("total_products")),
                "total_stock": raw(stats.get("total_stock")),
                "low_stock_items": raw(stats.get("low_stock_items")),
                "out_of_stock_items": raw(stats.get("out_of_stock_items")),
                "avg_stock_per_product": fixed(float_or_zero(stats.get("avg_stock_per_product")), 2),
                "total_cost_value": fixed(float_or_zero(value.get("total_cost_value")), 2),
                "total_retail_value": fixed(float_or_zero(value.get("total_retail_value")), 2),
            },
            "low_stock_products": low,
        }),
    )
}

const REVENUE_BY_CATEGORY: &str = "
            SELECT
                c.name as category_name,
                COUNT(DISTINCT oi.product_id) as product_count,
                COUNT(oi.id) as items_sold,
                SUM(oi.quantity) as total_quantity,
                SUM(oi.total_price) as total_revenue,
                AVG(oi.unit_price) as avg_price
            FROM order_items oi
            INNER JOIN orders o ON oi.order_id = o.id
            INNER JOIN products p ON oi.product_id = p.id
            INNER JOIN categories c ON p.category_id = c.id
            WHERE o.created_at BETWEEN ? AND ?
            AND o.status NOT IN ('cancelled', 'refunded')
            AND c.name IS NOT NULL
            GROUP BY c.name
            ORDER BY total_revenue DESC
        ";

/// GET /revenue-by-category
async fn revenue_by_category(req: AdminRequest) -> Response {
    let (start, end) = date_range(&req.query(), "month");
    let rows = rows(execute(&req.state.pool, REVENUE_BY_CATEGORY, &between(start, end)).await);
    let total = rows.iter().fold(0.0, |sum, row| {
        sum + float_or_zero(row.get("total_revenue"))
    });
    let categories: Vec<Value> = rows
        .iter()
        .map(|row| {
            json!({
                "category": raw(row.get("category_name")),
                "product_count": raw(row.get("product_count")),
                "items_sold": raw(row.get("items_sold")),
                "total_quantity": raw(row.get("total_quantity")),
                "total_revenue": fixed(float_or_zero(row.get("total_revenue")), 2),
                "avg_price": fixed(float_or_zero(row.get("avg_price")), 2),
                "percentage": if total > 0.0 {
                    fixed(number(row.get("total_revenue")) / total * 100.0, 2)
                } else {
                    json!(0)
                },
            })
        })
        .collect();
    ok(
        "Revenue by category fetched successfully",
        json!({
            "period": period_json(start, end),
            "total_revenue": fixed(total, 2),
            "categories": categories,
        }),
    )
}

const REVENUE_BY_MONTH: &str = "
            SELECT
                DATE_FORMAT(created_at, '%Y-%m') as ym,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as revenue,
                COUNT(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN 1 END) as order_count
            FROM orders
            WHERE created_at >= ? AND created_at <= ?
            GROUP BY ym
            ORDER BY ym ASC
        ";

const MONTH_LABELS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// A month of revenue-vs-target's series (or a weekday of revenue-by-weekday).
#[derive(Clone)]
struct Bucket {
    key: String,
    label: &'static str,
    year: f64,
    revenue: f64,
    count: f64,
}

/// `[...xs].sort((a, b) => a.revenue - b.revenue)` (stable).
fn sorted_by_revenue(xs: &[Bucket]) -> Vec<Bucket> {
    let mut sorted = xs.to_vec();
    sorted.sort_by(|a, b| {
        let d = a.revenue - b.revenue;
        if d < 0.0 {
            Ordering::Less
        } else if d > 0.0 {
            Ordering::Greater
        } else {
            Ordering::Equal
        }
    });
    sorted
}

/// `row ? row.revenue || 0 : 0` through parseFloat, and `row ? Number(row.order_count) : 0`.
fn bucket_values(row: Option<&JsRow>) -> (f64, f64) {
    match row {
        Some(r) => (
            float_or_zero(r.get("revenue")),
            number(r.get("order_count")),
        ),
        None => (0.0, 0.0),
    }
}

/// GET /revenue-vs-target
async fn revenue_vs_target(req: AdminRequest) -> Response {
    let z = &LocalZone;
    let months = crate::admin::clamp_int(req.query().get("months"), 12.0, 1.0, 24.0);
    let now = JsDate::now();
    let nf = now.local_fields(z).expect("now is a valid date");
    let start = JsDate::local(nf.year, nf.month - (months - 1.0), 1.0, z);
    let rows = rows(execute(&req.state.pool, REVENUE_BY_MONTH, &between(start, now)).await);
    // new Map(rows.map(r => [r.ym, r])): the last row of a key wins.
    let by_month = |ym: &str| {
        rows.iter()
            .rev()
            .find(|r| matches!(r.get("ym"), Some(Js::String(s)) if s == ym))
    };

    let mut series = Vec::new();
    for i in 0..months as i64 {
        let d = JsDate::local(nf.year, nf.month - (months - 1.0) + i as f64, 1.0, z);
        let f = d.local_fields(z).expect("a month in range");
        let ym = format!("{}-{:02}", f.year as i64, f.month as i64 + 1);
        let (revenue, count) = bucket_values(by_month(&ym));
        series.push(Bucket {
            key: ym,
            label: MONTH_LABELS[f.month as usize],
            year: f.year,
            revenue,
            count,
        });
    }

    let active: Vec<Bucket> = series.iter().filter(|s| s.revenue > 0.0).cloned().collect();
    let target = if active.is_empty() {
        0.0
    } else {
        active.iter().fold(0.0, |s, x| s + x.revenue) / active.len() as f64
    };
    let band = 0.05;
    let vs_avg = |v: f64| {
        if target > 0.0 {
            (v - target) / target * 100.0
        } else {
            0.0
        }
    };
    let status = |revenue: f64| {
        if target == 0.0 {
            "none"
        } else if revenue >= target * (1.0 + band) {
            "above"
        } else if revenue <= target * (1.0 - band) {
            "below"
        } else {
            "on"
        }
    };
    let out_series: Vec<Value> = series
        .iter()
        .map(|s| {
            json!({
                "ym": s.key,
                "label": s.label,
                "year": js_number(s.year),
                "revenue": fixed(s.revenue, 2),
                "order_count": js_number(s.count),
                "target": fixed(target, 2),
                "status": status(s.revenue),
            })
        })
        .collect();
    let count = |which: &str| series.iter().filter(|s| status(s.revenue) == which).count();
    let (peak, trough) = if active.is_empty() {
        (Value::Null, Value::Null)
    } else {
        let sorted = sorted_by_revenue(&active);
        let point = |b: &Bucket| {
            json!({
                "label": b.label,
                "ym": b.key,
                "revenue": fixed(b.revenue, 2),
                "vs_avg_pct": fixed(vs_avg(b.revenue), 1),
            })
        };
        (point(&sorted[sorted.len() - 1]), point(&sorted[0]))
    };
    let ytd: Vec<&Bucket> = series.iter().filter(|s| s.year == nf.year).collect();
    let ytd_active = ytd.iter().filter(|s| s.revenue > 0.0).count();
    let ytd_actual = ytd.iter().fold(0.0, |s, x| s + x.revenue);
    let ytd_target = target * ytd_active as f64;
    ok(
        "Revenue vs target fetched successfully",
        json!({
            "months": js_number(months),
            "target": fixed(target, 2),
            "target_basis": "Mean monthly revenue across active months in the trailing window (no revenue_targets table exists; baseline is self-referential). On-target band = +/-5%.",
            "series": out_series,
            "summary": {
                "above_count": count("above"),
                "on_count": count("on"),
                "below_count": count("below"),
                "peak": peak,
                "trough": trough,
                "ytd_actual": fixed(ytd_actual, 2),
                "ytd_target": fixed(ytd_target, 2),
                "ytd_variance_pct": fixed(if ytd_target > 0.0 { (ytd_actual - ytd_target) / ytd_target * 100.0 } else { 0.0 }, 1),
            }
        }),
    )
}

const REVENUE_BY_WEEKDAY: &str = "
            SELECT
                DAYOFWEEK(created_at) as dow,
                SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END) as revenue,
                COUNT(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN 1 END) as order_count
            FROM orders
            WHERE created_at BETWEEN ? AND ?
            GROUP BY dow
        ";

const DAY_LABELS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/// `x.toFixed(1)` of a share, `'0.0'` when there is no total.
fn share(part: f64, total: f64) -> Value {
    if total > 0.0 {
        fixed(part / total * 100.0, 1)
    } else {
        json!("0.0")
    }
}

/// GET /revenue-by-weekday
async fn revenue_by_weekday(req: AdminRequest) -> Response {
    let (start, end) = date_range(&req.query(), "year");
    let rows = rows(execute(&req.state.pool, REVENUE_BY_WEEKDAY, &between(start, end)).await);
    // new Map(rows.map(r => [Number(r.dow), r])): the last row of a key wins.
    let by_dow = |dow: f64| rows.iter().rev().find(|r| number(r.get("dow")) == dow);
    let days: Vec<Bucket> = (1..=7)
        .map(|dow| {
            let (revenue, count) = bucket_values(by_dow(f64::from(dow)));
            Bucket {
                key: String::new(),
                label: DAY_LABELS[dow as usize - 1],
                year: f64::from(dow),
                revenue,
                count,
            }
        })
        .collect();
    let total = days.iter().fold(0.0, |s, d| s + d.revenue);
    let with_share: Vec<Value> = days
        .iter()
        .map(|d| {
            json!({
                "dow": js_number(d.year),
                "label": d.label,
                "revenue": fixed(d.revenue, 2),
                "order_count": js_number(d.count),
                "share_pct": share(d.revenue, total),
            })
        })
        .collect();
    let non_zero: Vec<Bucket> = days.iter().filter(|d| d.revenue > 0.0).cloned().collect();
    let sorted = sorted_by_revenue(&non_zero);
    let pick = |b: Option<&Bucket>| {
        b.map_or(
            Value::Null,
            |b| json!({ "label": b.label, "share_pct": share(b.revenue, total) }),
        )
    };
    let weekend = days
        .iter()
        .filter(|d| d.year == 1.0 || d.year == 7.0)
        .fold(0.0, |s, d| s + d.revenue);
    ok(
        "Revenue by weekday fetched successfully",
        json!({
            "period": period_json(start, end),
            "total_revenue": fixed(total, 2),
            "days": with_share,
            "best_day": pick(sorted.last()),
            "worst_day": pick(sorted.first()),
            "weekend_share_pct": share(weekend, total),
        }),
    )
}

/// GET /conversion-funnel
async fn conversion_funnel(req: AdminRequest) -> Response {
    let (start, end) = date_range(&req.query(), "month");
    let pool = &req.state.pool;
    const CARTS: &str = "SELECT COUNT(*) as n FROM shopping_carts WHERE created_at BETWEEN ? AND ?";
    const PLACED: &str = "SELECT COUNT(*) as n FROM orders WHERE created_at BETWEEN ? AND ? AND status NOT IN ('cancelled')";
    const PAID: &str = "
            SELECT COUNT(DISTINCT o.id) as n
            FROM orders o
            INNER JOIN payments pay ON pay.order_id = o.id AND pay.status = 'completed'
            WHERE o.created_at BETWEEN ? AND ?";
    const DELIVERED: &str = "SELECT COUNT(*) as n FROM orders WHERE created_at BETWEEN ? AND ? AND status = 'delivered'";
    let p = between(start, end);
    let (carts, placed, paid, delivered) = tokio::join!(
        execute(pool, CARTS, &p),
        execute(pool, PLACED, &p),
        execute(pool, PAID, &p),
        execute(pool, DELIVERED, &p),
    );
    // Number((rows(r)[0] || {}).n || 0)
    let val = |r: Result<Vec<JsRow>, String>| {
        number_or_zero(rows(r).first().and_then(|row| row.get("n")))
    };
    let raw_stages = [
        ("carts", "Shopping carts", val(carts)),
        ("orders", "Orders placed", val(placed)),
        ("paid", "Paid orders", val(paid)),
        ("delivered", "Delivered", val(delivered)),
    ];
    let top = raw_stages[0].2;
    let stages: Vec<Value> = raw_stages
        .iter()
        .enumerate()
        .map(|(i, (key, label, count))| {
            let prev = (i > 0).then(|| raw_stages[i - 1].2);
            let drop = prev.map_or(0.0, |p| p - count);
            json!({
                "key": key,
                "label": label,
                "count": js_number(*count),
                "pct_of_top": share(*count, top),
                "drop_from_prev_pct": match prev {
                    Some(p) if p > 0.0 => fixed(drop / p * 100.0, 1),
                    _ => Value::Null,
                },
                "drop_from_prev_count": prev.map_or(Value::Null, |_| js_number(drop)),
            })
        })
        .collect();
    let mut biggest: Option<(usize, f64)> = None;
    for i in 1..raw_stages.len() {
        let drop = raw_stages[i - 1].2 - raw_stages[i].2;
        if biggest.is_none_or(|(_, best)| drop > best) {
            biggest = Some((i, drop));
        }
    }
    let biggest = biggest.map_or(Value::Null, |(i, drop)| {
        let from = raw_stages[i - 1];
        json!({
            "from": from.1,
            "to": raw_stages[i].1,
            "drop_count": js_number(drop),
            "drop_pct": if from.2 > 0.0 { fixed(drop / from.2 * 100.0, 1) } else { json!("0.0") },
        })
    });
    ok(
        "Conversion funnel fetched successfully",
        json!({
            "period": period_json(start, end),
            "stages": stages,
            "overall_conversion_pct": share(raw_stages[2].2, top),
            "biggest_drop": biggest,
            "note": "Funnel uses real backend stages only. Upstream web-traffic stages (visitors, product views) are not tracked in the database and are intentionally excluded.",
        }),
    )
}

const NEW_VS_RETURNING_SPLIT: &str = "
            SELECT
                COALESCE(SUM(CASE WHEN rn = 1 THEN total_amount ELSE 0 END), 0) as new_revenue,
                COALESCE(SUM(CASE WHEN rn > 1 THEN total_amount ELSE 0 END), 0) as returning_revenue,
                SUM(CASE WHEN rn = 1 THEN 1 ELSE 0 END) as new_orders,
                SUM(CASE WHEN rn > 1 THEN 1 ELSE 0 END) as returning_orders
            FROM (
                SELECT o.id, o.total_amount, o.created_at,
                    CASE WHEN o.user_id IS NULL THEN 1
                         ELSE ROW_NUMBER() OVER (PARTITION BY o.user_id ORDER BY o.created_at ASC)
                    END as rn
                FROM orders o
                WHERE o.status NOT IN ('cancelled', 'refunded')
            ) t
            WHERE t.created_at BETWEEN ? AND ?
        ";

const LIFETIME_METRICS: &str = "
            SELECT
                COUNT(DISTINCT user_id) as customers,
                COUNT(*) as orders,
                COALESCE(SUM(total_amount), 0) as revenue
            FROM orders
            WHERE status NOT IN ('cancelled', 'refunded') AND user_id IS NOT NULL
        ";

const REPEAT_BUYERS: &str = "
            SELECT COUNT(*) as n FROM (
                SELECT user_id FROM orders
                WHERE status NOT IN ('cancelled', 'refunded') AND user_id IS NOT NULL
                GROUP BY user_id HAVING COUNT(*) > 1
            ) x
        ";

/// GET /new-vs-returning
async fn new_vs_returning(req: AdminRequest) -> Response {
    let (start, end) = date_range(&req.query(), "year");
    let pool = &req.state.pool;
    let p = between(start, end);
    let (split, metrics, repeat) = tokio::join!(
        execute(pool, NEW_VS_RETURNING_SPLIT, &p),
        execute(pool, LIFETIME_METRICS, &[]),
        execute(pool, REPEAT_BUYERS, &[]),
    );
    let split = rows(split).into_iter().next().unwrap_or_default();
    let metrics = rows(metrics).into_iter().next().unwrap_or_default();
    let repeat_customers = number_or_zero(rows(repeat).first().and_then(|r| r.get("n")));
    let new_rev = float_or_zero(split.get("new_revenue"));
    let ret_rev = float_or_zero(split.get("returning_revenue"));
    let total = new_rev + ret_rev;
    let customers = number_or_zero(metrics.get("customers"));
    let orders = number_or_zero(metrics.get("orders"));
    let lifetime = float_or_zero(metrics.get("revenue"));
    let per_customer = |x: f64, digits: usize, zero: &str| {
        if customers > 0.0 {
            fixed(x / customers, digits)
        } else {
            json!(zero)
        }
    };
    ok(
        "New vs returning fetched successfully",
        json!({
            "period": period_json(start, end),
            "split": {
                "new_revenue": fixed(new_rev, 2),
                "returning_revenue": fixed(ret_rev, 2),
                "new_orders": js_number(number_or_zero(split.get("new_orders"))),
                "returning_orders": js_number(number_or_zero(split.get("returning_orders"))),
                "new_share_pct": share(new_rev, total),
                "returning_share_pct": share(ret_rev, total),
            },
            "metrics": {
                "total_customers": js_number(customers),
                "repeat_customers": js_number(repeat_customers),
                "repeat_purchase_rate_pct": share(repeat_customers, customers),
                "avg_orders_per_customer": per_customer(orders, 1, "0.0"),
                "customer_lifetime_value": per_customer(lifetime, 2, "0.00"),
            }
        }),
    )
}

const SHORTFALL_AGG: &str = "
            SELECT
                COUNT(*) as orders,
                COALESCE(SUM(total_amount), 0) as revenue,
                COALESCE(SUM(CASE WHEN rn = 1 THEN total_amount ELSE 0 END), 0) as new_revenue,
                COALESCE(SUM(CASE WHEN rn > 1 THEN total_amount ELSE 0 END), 0) as returning_revenue
            FROM (
                SELECT o.id, o.total_amount, o.created_at,
                    CASE WHEN o.user_id IS NULL THEN 1
                         ELSE ROW_NUMBER() OVER (PARTITION BY o.user_id ORDER BY o.created_at ASC)
                    END as rn
                FROM orders o
                WHERE o.status NOT IN ('cancelled', 'refunded')
            ) t
            WHERE t.created_at BETWEEN ? AND ?
        ";

struct Shape {
    orders: f64,
    revenue: f64,
    aov: f64,
    new_revenue: f64,
    returning_revenue: f64,
}

impl Shape {
    fn of(row: &JsRow) -> Self {
        let orders = number_or_zero(row.get("orders"));
        let revenue = float_or_zero(row.get("revenue"));
        Shape {
            orders,
            revenue,
            aov: if orders > 0.0 { revenue / orders } else { 0.0 },
            new_revenue: float_or_zero(row.get("new_revenue")),
            returning_revenue: float_or_zero(row.get("returning_revenue")),
        }
    }

    fn to_json(&self) -> Value {
        json!({
            "orders": js_number(self.orders),
            "revenue": fixed(self.revenue, 2),
            "aov": fixed(self.aov, 2),
            "new_revenue": fixed(self.new_revenue, 2),
            "returning_revenue": fixed(self.returning_revenue, 2),
        })
    }
}

struct Driver {
    key: &'static str,
    label: &'static str,
    value: String,
    pct: String,
    up: bool,
}

impl Driver {
    fn to_json(&self) -> Value {
        json!({
            "key": self.key,
            "label": self.label,
            "value": self.value,
            "pct": self.pct,
            "direction": if self.up { "up" } else { "down" },
        })
    }
}

/// GET /revenue-shortfall
async fn revenue_shortfall(req: AdminRequest) -> Response {
    let (start, end) = date_range(&req.query(), "month");
    let period_length = end.time() - start.time();
    let prev_start = JsDate::from_ms(start.time() - period_length);
    let prev_end = JsDate::from_ms(start.time());
    let pool = &req.state.pool;
    let (cur_params, prev_params) = (between(start, end), between(prev_start, prev_end));
    let (cur, prev) = tokio::join!(
        execute(pool, SHORTFALL_AGG, &cur_params),
        execute(pool, SHORTFALL_AGG, &prev_params),
    );
    let cur = Shape::of(&rows(cur).into_iter().next().unwrap_or_default());
    let prev = Shape::of(&rows(prev).into_iter().next().unwrap_or_default());

    let delta = cur.revenue - prev.revenue;
    let volume = (cur.orders - prev.orders) * prev.aov;
    let aov = (cur.aov - prev.aov) * cur.orders;
    let new_effect = cur.new_revenue - prev.new_revenue;
    let returning_effect = cur.returning_revenue - prev.returning_revenue;
    let pct_of_prev = |v: f64| {
        if prev.revenue > 0.0 {
            v / prev.revenue * 100.0
        } else {
            0.0
        }
    };
    let driver = |key, label, v: f64| Driver {
        key,
        label,
        value: js_to_fixed(v, 2),
        pct: js_to_fixed(pct_of_prev(v), 1),
        up: v >= 0.0,
    };
    let mut drivers = [
        driver("volume", "Order volume", volume),
        driver("aov", "Average order value", aov),
    ];
    // .sort((a, b) => Math.abs(parseFloat(b.value)) - Math.abs(parseFloat(a.value)))
    drivers.sort_by(|a, b| {
        let d = js_parse_float(&b.value).abs() - js_parse_float(&a.value).abs();
        if d < 0.0 {
            Ordering::Less
        } else if d > 0.0 {
            Ordering::Greater
        } else {
            Ordering::Equal
        }
    });
    let mix = [
        driver("new", "New-customer revenue", new_effect),
        driver("returning", "Returning-customer revenue", returning_effect),
    ];

    let lead = &drivers[0];
    let takeaway = if prev.revenue == 0.0 && cur.revenue == 0.0 {
        "No revenue in either period to compare.".to_owned()
    } else {
        let tail = if aov >= 0.0 && volume < 0.0 {
            "Basket size held up while order volume softened."
        } else if volume >= 0.0 && aov < 0.0 {
            "Order volume held up while basket size softened."
        } else {
            ""
        };
        format!(
            "Revenue {} {}% vs the prior period, driven mostly by {} ({}{}%). {tail}",
            if delta >= 0.0 { "grew" } else { "fell" },
            js_to_fixed(pct_of_prev(delta).abs(), 1),
            lead.label.to_lowercase(),
            if lead.up { '+' } else { '-' },
            js_to_fixed(js_parse_float(&lead.pct).abs(), 1),
        )
        .trim()
        .to_owned()
    };

    ok(
        "Revenue shortfall analysis fetched successfully",
        json!({
            "period": {
                "current": period_json(start, end),
                "previous": period_json(prev_start, prev_end),
            },
            "current": cur.to_json(),
            "previous": prev.to_json(),
            "change": {
                "revenue": fixed(delta, 2),
                "revenue_pct": fixed(pct_of_prev(delta), 1),
                "orders_pct": if prev.orders > 0.0 { fixed((cur.orders - prev.orders) / prev.orders * 100.0, 1) } else { json!("0.0") },
                "aov_pct": if prev.aov > 0.0 { fixed((cur.aov - prev.aov) / prev.aov * 100.0, 1) } else { json!("0.0") },
            },
            "drivers": drivers.iter().map(Driver::to_json).collect::<Vec<_>>(),
            "customer_mix": mix.iter().map(Driver::to_json).collect::<Vec<_>>(),
            "takeaway": takeaway,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn javascript_coercions() {
        let s = |v: &str| Js::String(v.into());
        assert_eq!(number(Some(&s("12"))), 12.0);
        assert_eq!(number(Some(&Js::Null)), 0.0);
        assert!(number(None).is_nan());
        assert_eq!(float_or_zero(Some(&Js::Null)), 0.0);
        assert_eq!(float_or_zero(Some(&s("12.50"))), 12.5);
        assert!(parse_float(Some(&Js::Null)).is_nan());
        // "0" is a non-empty string: truthy.
        assert_eq!(or_zero(Some(&s("0"))), s("0"));
        assert_eq!(fixed(0.125, 2), json!("0.13"));
    }

    #[test]
    fn custom_ranges_parse_like_new_date() {
        let (start, end) = get_date_range(
            Some("custom"),
            Some(&json!("2026-01-01")),
            Some(&json!(["2026-02-01"])),
        );
        assert_eq!(start.to_json(), json!("2026-01-01T00:00:00.000Z"));
        assert_eq!(end.to_json(), json!("2026-02-01T00:00:00.000Z"));
        let (start, _) = get_date_range(Some("custom"), Some(&json!({ "a": "1" })), None);
        assert!(!start.is_valid());
        // An empty string is falsy: the default month back.
        let (start, end) = get_date_range(Some("custom"), Some(&json!("")), Some(&json!("")));
        assert!(start.is_valid() && end.is_valid() && start.time() < end.time());
    }
}
