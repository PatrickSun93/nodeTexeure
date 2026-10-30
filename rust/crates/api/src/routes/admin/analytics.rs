//! `/api/admin` area: backend/routes/admin/analytics.js (`/analytics/summary`,
//! `/analytics/revenue`, `/analytics/sales-by-region`), each
//! `admin, adminReadLimiter` behind the router's `protect, staffOrAdmin,
//! adminLimiter, csrfProtection`. They are reached only because
//! `/api/admin/analytics` (analyticsRoutes.js, [`super::analytics_routes`])
//! doesn't define these paths and falls through to `/api/admin`.
//!
//! A failed query makes the route throw (`result.data[0]` of `undefined`, or
//! the explicit `throw` in /revenue), answered as a bare 500 'Server error'.

use axum::http::StatusCode;
use axum::response::Response;
use common::json::{js_number, js_to_fixed};
use common::response::{failure, success};
use serde_json::{Map, Value, json};

use super::analytics_routes::{execute, number, number_or_zero, or_zero, rows};
use crate::admin::{AdminRequest, Limiter, Routes, Step};
use crate::js_date::{JsDate, LocalZone};
use crate::mysql_json::{Js, JsRow};

pub fn register(r: &mut Routes) {
    use Step::{Admin, Limit};
    let steps = &[Admin, Limit(Limiter::AdminRead)];
    r.get("/analytics/summary", steps, summary);
    r.get("/analytics/revenue", steps, revenue);
    r.get("/analytics/sales-by-region", steps, sales_by_region);
}

fn server_error() -> Response {
    crate::admin::json(StatusCode::INTERNAL_SERVER_ERROR, failure("Server error"))
}

fn ok(message: &str, table: Value) -> Response {
    crate::admin::json(StatusCode::OK, success(message, table))
}

/// `result.data[0]` (`None`: a failed query, which throws).
fn first(result: Result<Vec<JsRow>, String>) -> Option<JsRow> {
    result
        .ok()
        .map(|rows| rows.into_iter().next().unwrap_or_default())
}

/// GET /analytics/summary
async fn summary(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let q = |sql: &'static str| execute(pool, sql, &[]);
    let (revenue, orders, customers, visitors, paid, active) = tokio::join!(
        q("SELECT SUM(total_amount) as total FROM orders WHERE status != 'cancelled'"),
        q("SELECT COUNT(*) as count FROM orders WHERE status != 'cancelled'"),
        q("SELECT COUNT(*) as count FROM users WHERE role = 'customer' AND status = 'active'"),
        q(
            "SELECT COUNT(*) as count FROM (SELECT COALESCE(user_id, session_id, id) AS visitor FROM shopping_carts UNION SELECT COALESCE(user_id, guest_email, id) FROM orders) v"
        ),
        q(
            "SELECT COUNT(DISTINCT COALESCE(o.user_id, o.guest_email, o.id)) as count FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.status = 'completed'"
        ),
        q(
            "SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'confirmed', 'processing', 'shipped')"
        ),
    );
    // `.data[0]` of a failed query throws (all the same bare 500), except
    // DatabaseUtil.first(), for which a failed query is null.
    let active = rows(active).into_iter().next();
    let (Some(revenue), Some(orders), Some(customers), Some(visitors), Some(paid)) = (
        first(revenue),
        first(orders),
        first(customers),
        first(visitors),
        first(paid),
    ) else {
        return server_error();
    };

    let total_revenue = or_zero(revenue.get("total"));
    let total_orders = or_zero(orders.get("count"));
    let avg_order_value = if number(Some(&total_orders)) > 0.0 {
        number(Some(&total_revenue)) / number(Some(&total_orders))
    } else {
        0.0
    };
    let active_customers = or_zero(customers.get("count"));
    // Number(first?.count) || 0
    let or0 = |n: f64| if n.is_nan() || n == 0.0 { 0.0 } else { n };
    let active_orders = or0(number(active.as_ref().and_then(|r| r.get("count"))));
    let visitors = or0(number(visitors.get("count")));
    let paid_orders = or0(number(paid.get("count")));
    let conversion = if visitors > 0.0 {
        crate::csv::js_parse_float(&js_to_fixed(paid_orders / visitors * 100.0, 2))
    } else {
        0.0
    };
    ok(
        "Summary metrics fetched",
        json!([{
            "metrics": {
                "totalRevenue": total_revenue.to_json(),
                "activeOrders": js_number(active_orders),
                "avgOrderValue": js_number(avg_order_value),
                "conversionRate": js_number(conversion),
                "visitors": js_number(visitors),
                "activeCustomers": active_customers.to_json(),
            }
        }]),
    )
}

const LAST_7_DAYS: &str = "
            SELECT DATE(created_at) as date, SUM(total_amount) as value
            FROM orders
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND status != 'cancelled'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        ";

const DAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/// GET /analytics/revenue
async fn revenue(req: AdminRequest) -> Response {
    let Ok(rows) = execute(&req.state.pool, LAST_7_DAYS, &[]).await else {
        return server_error();
    };
    let data: Vec<Value> = rows
        .iter()
        .map(|row| {
            // days[new Date(row.date).getDay()]: the DATE is read as UTC
            // midnight, its weekday taken in local time.
            let t = match row.get("date") {
                Some(Js::Date(Some(d))) => d.and_utc().timestamp_millis() as f64,
                Some(Js::Null) => 0.0,
                Some(other) => JsDate::parse(&other.js_string(), &LocalZone).time(),
                None => f64::NAN,
            };
            let mut out = Map::new();
            // An Invalid Date's label is undefined: JSON drops the key.
            if let Some(f) = JsDate::from_ms(t).local_fields(&LocalZone) {
                out.insert("label".into(), json!(DAYS[f.weekday as usize]));
            }
            out.insert(
                "value".into(),
                row.get("value").map_or(Value::Null, Js::to_json),
            );
            Value::Object(out)
        })
        .collect();
    ok("Revenue details fetched", json!([{ "revenue": data }]))
}

/// `String(key)` used as a property of a plain `{}`: the names an object
/// already has through Object.prototype, and how `(map[key] || 0) + 1` reads
/// each (`__proto__` can't become an own property at all).
fn inherited(key: &str) -> Option<Option<&'static str>> {
    Some(Some(match key {
        "__proto__" => return Some(None),
        "constructor" => "function Object() { [native code] }",
        "__defineGetter__" => "function __defineGetter__() { [native code] }",
        "__defineSetter__" => "function __defineSetter__() { [native code] }",
        "hasOwnProperty" => "function hasOwnProperty() { [native code] }",
        "__lookupGetter__" => "function __lookupGetter__() { [native code] }",
        "__lookupSetter__" => "function __lookupSetter__() { [native code] }",
        "isPrototypeOf" => "function isPrototypeOf() { [native code] }",
        "propertyIsEnumerable" => "function propertyIsEnumerable() { [native code] }",
        "toString" => "function toString() { [native code] }",
        "valueOf" => "function valueOf() { [native code] }",
        "toLocaleString" => "function toLocaleString() { [native code] }",
        _ => return None,
    }))
}

/// GET /analytics/sales-by-region
async fn sales_by_region(req: AdminRequest) -> Response {
    let Ok(rows) = execute(
        &req.state.pool,
        "SELECT shipping_address_json FROM orders WHERE status != 'cancelled'",
        &[],
    )
    .await
    else {
        return server_error();
    };
    // regionMap: key → count (a number, or the string an inherited
    // property's `+ 1` concatenation makes).
    let mut keys: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    for row in &rows {
        let addr: Option<Value> = match row.get("shipping_address_json") {
            // typeof === 'string' → JSON.parse (a throw skips the order)
            Some(Js::String(s)) => match serde_json::from_str::<Value>(s) {
                Ok(v) => Some(crate::express_router::js_json(v)),
                Err(_) => continue,
            },
            Some(Js::Json(v)) => Some(v.clone()),
            Some(Js::Number(n)) => Some(js_number(*n)),
            _ => None,
        };
        // addr?.state || 'Unknown' (only an object has a `state`)
        let state = match &addr {
            Some(Value::Object(m)) => m.get("state").cloned(),
            _ => None,
        };
        let state = match state {
            Some(v) if crate::body::truthy(Some(&v)) => v,
            _ => continue, // 'Unknown'
        };
        if state == Value::String("Unknown".into()) {
            continue;
        }
        let key = crate::body::js_string(&state);
        match keys.iter().position(|k| *k == key) {
            Some(i) => {
                values[i] = match &values[i] {
                    Value::String(s) => Value::String(format!("{s}1")),
                    v => js_number(number_or_zero(Some(&Js::from_json(v))) + 1.0),
                };
            }
            None => match inherited(&key) {
                Some(None) => {}
                Some(Some(native)) => {
                    keys.push(key);
                    values.push(Value::String(format!("{native}1")));
                }
                None => {
                    keys.push(key);
                    values.push(json!(1));
                }
            },
        }
    }
    let sales: Vec<Value> = crate::csv::js_key_order(&keys)
        .into_iter()
        .map(|k| {
            let i = keys.iter().position(|x| *x == k).expect("own key");
            json!({ "name": k, "value": values[i] })
        })
        .collect();
    ok(
        "Regional sales fetched",
        json!([{ "salesByRegion": sales }]),
    )
}
