//! `/api/admin` area: backend/routes/admin/users.js — customers (list,
//! create, update, delete, one customer's profile/addresses/order stats) and
//! the staff list. Admin only, behind E's `protect, staffOrAdmin,
//! adminLimiter, csrfProtection` (see [`crate::admin`]).
//!
//! * Create hashes the password like `bcrypt.hash(password, 10)`
//!   ([`crate::password::hash`]) and takes the id from MySQL's `UUID()`.
//! * Update writes only the whitelisted columns, strings (or null) only, and a
//!   `role` or `status` key bumps `token_version`, revoking the user's tokens.
//! * Reads go through [`crate::mysql_json`]: `COUNT()` comes out as a string,
//!   `SUM()` of DECIMAL as a string, dates as ISO strings, as from mysql2.

use axum::http::StatusCode;
use axum::response::Response;
use common::response::{failure, success};
use serde_json::{Value, json};

use crate::admin::Limiter::{AdminRead, AdminWrite};
use crate::admin::{AdminRequest, Routes, Step::*, json};
use crate::body::{is_non_empty_string, is_optional_string, js_to_number, truthy};
use crate::mysql_json::{Js, fetch_rows};

use super::orders::{bad_request, capitalize, field, or_else, out, row_truthy, server_error};

/// users.js `ALLOWED_USER_COLUMNS`, in its order.
const ALLOWED_USER_COLUMNS: [&str; 6] = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "role",
    "status",
];

pub fn register(r: &mut Routes) {
    // router.get('/users', admin, adminReadLimiter, handler)
    r.get("/users", &[Admin, Limit(AdminRead)], list);
    // router.post('/users', admin, adminWriteLimiter, csrfProtection, handler)
    r.post("/users", &[Admin, Limit(AdminWrite), Csrf], create);
    // router.put('/users/:id', admin, adminWriteLimiter, csrfProtection, handler)
    r.put("/users/:id", &[Admin, Limit(AdminWrite), Csrf], update);
    // router.delete('/users/:id', admin, adminWriteLimiter, csrfProtection, handler)
    r.delete("/users/:id", &[Admin, Limit(AdminWrite), Csrf], remove);
    // router.get('/staff', admin, adminReadLimiter, handler)
    r.get("/staff", &[Admin, Limit(AdminRead)], staff);
    // router.get('/users/:id', admin, adminReadLimiter, handler)
    r.get("/users/:id", &[Admin, Limit(AdminRead)], customer);
}

/// `` u.first_name ? `${u.first_name} ${u.last_name || ''}` : fallback ``.
fn display_name(first: Option<&Js>, last: Option<&Js>, fallback: &str) -> String {
    if !row_truthy(first) {
        return fallback.to_owned();
    }
    let last = if row_truthy(last) {
        last.map(Js::js_string).unwrap_or_default()
    } else {
        String::new()
    };
    format!("{} {last}", first.map(Js::js_string).unwrap_or_default())
}

/// `GET /users`: customers (every non-admin, non-staff user) with order
/// count, total spent and last order date.
async fn list(req: AdminRequest) -> Response {
    let rows = match fetch_rows(
        &req.state.pool,
        "SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status,
                COUNT(o.id) as orders_count,
                COALESCE(SUM(o.total_amount), 0) as total_spent,
                MAX(o.created_at) as last_order_date
         FROM users u
         LEFT JOIN orders o ON u.id = o.user_id
         WHERE u.role NOT IN ('admin', 'staff')
         GROUP BY u.id",
        &[],
    )
    .await
    {
        Ok(rows) => rows,
        Err(err) => return server_error("admin users list", err),
    };
    let users: Vec<Value> = rows
        .iter()
        .map(|u| {
            json!({
                "id": out(u.get("id")),
                "name": display_name(u.get("first_name"), u.get("last_name"), "Guest/Unknown"),
                "email": out(u.get("email")),
                "role": out(u.get("role")),
                "status": out(u.get("status")),
                "orders": out(u.get("orders_count")),
                "spent": out(u.get("total_spent")),
                "lastOrder": out(u.get("last_order_date")),
            })
        })
        .collect();
    json(
        StatusCode::OK,
        success("Users fetched successfully", json!([{ "users": users }])),
    )
}

/// `POST /users` `{ email, password, first_name, last_name, role?, status?, phone? }`.
async fn create(req: AdminRequest) -> Response {
    let body = &req.body;
    let get = |k| field(body, k);
    // Strings only: a numeric email would compare numerically in the
    // duplicate check (backend/utils/params.js).
    let required = ["email", "password", "first_name", "last_name"];
    let optional = ["role", "status", "phone"];
    if !required.iter().all(|k| is_non_empty_string(get(k)))
        || !optional.iter().all(|k| is_optional_string(get(k)))
    {
        return bad_request("Missing required fields");
    }
    let text = |k| get(k).and_then(Value::as_str).unwrap_or_default();
    let (email, password) = (text("email"), text("password"));
    let pool = &req.state.pool;

    match sqlx::query_scalar!("SELECT id FROM users WHERE email = ?", email)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(_)) => {
            return json(
                StatusCode::CONFLICT,
                failure("User with this email already exists"),
            );
        }
        Ok(None) => {}
        // `checkResult.data.length` of a failed query throws.
        Err(err) => return server_error("admin user create: duplicate check", err),
    }

    let id = match sqlx::query_scalar!(r#"SELECT UUID() as "id!: String""#)
        .fetch_one(pool)
        .await
    {
        Ok(id) => id,
        Err(err) => return server_error("admin user create: UUID()", err),
    };
    let hashed = match crate::password::hash(password).await {
        Ok(hash) => hash,
        Err(err) => return server_error("admin user create: bcrypt", format!("{err:?}")),
    };
    // `role || 'customer'`, `status || 'active'`; an absent phone is NULL.
    let or_default = |k, default: &'static str| {
        if truthy(get(k)) { text(k) } else { default }
    };
    let phone = get("phone").and_then(Value::as_str);
    if let Err(err) = sqlx::query!(
        "INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        email,
        hashed,
        text("first_name"),
        text("last_name"),
        or_default("role", "customer"),
        or_default("status", "active"),
        phone
    )
    .execute(pool)
    .await
    {
        return server_error("admin user create: insert", err);
    }
    json(
        StatusCode::CREATED,
        success("User created successfully", json!([{ "id": id }])),
    )
}

/// `PUT /users/:id`: the whitelisted columns present in the body.
///
/// `Object.entries(req.body)` walks the body in its key order and the first
/// non-string whitelisted value is the 400; the parsed body here has its keys
/// sorted, so with two such values the message can name the other one.
async fn update(req: AdminRequest) -> Response {
    let id = req.param(0).to_owned();
    let Value::Object(updates) = &req.body else {
        // An array body: no whitelisted keys.
        return bad_request("No valid fields to update");
    };
    let mut fields = Vec::new();
    let mut values = Vec::new();
    for (key, value) in updates {
        if !ALLOWED_USER_COLUMNS.contains(&key.as_str()) {
            continue;
        }
        // role/status are ENUMs: a number would be written as an enum index.
        if !is_optional_string(Some(value)) {
            return bad_request(&format!("{key} must be a string"));
        }
        fields.push(format!("{key} = ?"));
        values.push(value.clone());
    }
    if fields.is_empty() {
        return bad_request("No valid fields to update");
    }
    // A role or status change revokes the user's outstanding access tokens.
    if updates.contains_key("role") || updates.contains_key("status") {
        fields.push("token_version = token_version + 1".into());
    }
    let sql = format!("UPDATE users SET {} WHERE id = ?", fields.join(", "));
    let mut query = sqlx::query(&sql);
    for v in &values {
        query = crate::mysql_json::bind(query, v);
    }
    if let Err(err) = query.bind(id).execute(&req.state.pool).await {
        return server_error("admin user update", err);
    }
    json(
        StatusCode::OK,
        success("User updated successfully", json!([])),
    )
}

/// `DELETE /users/:id` (no existence check, like Node).
async fn remove(req: AdminRequest) -> Response {
    let id = req.param(0);
    if let Err(err) = sqlx::query!("DELETE FROM users WHERE id = ?", id)
        .execute(&req.state.pool)
        .await
    {
        return server_error("admin user delete", err);
    }
    json(
        StatusCode::OK,
        success("User deleted successfully", json!([])),
    )
}

/// `GET /staff`: admins and staff.
async fn staff(req: AdminRequest) -> Response {
    let rows = match fetch_rows(
        &req.state.pool,
        "SELECT id, email, first_name, last_name, role, status, last_login
         FROM users
         WHERE role IN ('admin', 'staff')",
        &[],
    )
    .await
    {
        Ok(rows) => rows,
        Err(err) => return server_error("admin staff list", err),
    };
    let staff: Vec<Value> = rows
        .iter()
        .map(|u| {
            let cap = |k| capitalize(&u.get(k).map(Js::js_string).unwrap_or_default());
            json!({
                "id": out(u.get("id")),
                "name": display_name(u.get("first_name"), u.get("last_name"), "Unknown"),
                "email": out(u.get("email")),
                "role": cap("role"),
                "status": cap("status"),
                "lastActive": or_else(u.get("last_login"), json!("Never")),
            })
        })
        .collect();
    json(
        StatusCode::OK,
        success("Staff fetched successfully", json!([{ "staff": staff }])),
    )
}

/// One address's `address_json` as the route reads it: the parsed column, a
/// string parsed again (`{}` when that fails). `Err` is JavaScript's
/// TypeError when the result is `null` (`addr.company` throws: the 500).
fn address_fields(raw: Option<&Js>) -> Result<Value, ()> {
    if !row_truthy(raw) {
        return Ok(json!({}));
    }
    let addr = match raw {
        Some(Js::Json(Value::String(s)) | Js::String(s)) => {
            serde_json::from_str::<Value>(s).unwrap_or_else(|_| json!({}))
        }
        Some(Js::Json(v)) => v.clone(),
        Some(other) => other.to_json(),
        None => json!({}),
    };
    if addr.is_null() { Err(()) } else { Ok(addr) }
}

/// `addr.<key> || null`.
fn addr_field(addr: &Value, key: &str) -> Value {
    match field(addr, key) {
        Some(v) if truthy(Some(v)) => crate::express_router::js_json(v.clone()),
        _ => Value::Null,
    }
}

/// `GET /users/:id`: the customer, their addresses (address_json flattened)
/// and order stats (total spent counts only orders not cancelled/refunded).
async fn customer(req: AdminRequest) -> Response {
    let id = Value::String(req.param(0).to_owned());
    let pool = &req.state.pool;
    let users = match fetch_rows(
        pool,
        "SELECT id, first_name, last_name, email, role, status, phone, created_at FROM users WHERE id = ?",
        std::slice::from_ref(&id),
    )
    .await
    {
        Ok(rows) => rows,
        Err(err) => return server_error("admin customer detail", err),
    };
    let Some(user) = users.first() else {
        return json(StatusCode::NOT_FOUND, failure("User not found"));
    };

    // A failed address query is no addresses (`DatabaseUtil.rows`).
    let address_rows = fetch_rows(
        pool,
        "SELECT id, type, first_name, last_name, phone, address_json, is_default FROM user_addresses WHERE user_id = ?",
        std::slice::from_ref(&id),
    )
    .await
    .unwrap_or_else(|err| {
        tracing::error!(error = %err, "admin customer detail: addresses query failed");
        Vec::new()
    });
    let mut addresses = Vec::with_capacity(address_rows.len());
    for a in &address_rows {
        let Ok(addr) = address_fields(a.get("address_json")) else {
            return server_error(
                "admin customer detail",
                "Cannot read properties of null (reading 'company')",
            );
        };
        addresses.push(json!({
            "id": out(a.get("id")),
            "type": out(a.get("type")),
            "first_name": out(a.get("first_name")),
            "last_name": out(a.get("last_name")),
            "phone": or_else(a.get("phone"), Value::Null),
            "company": addr_field(&addr, "company"),
            "address_line_1": addr_field(&addr, "address_line_1"),
            "address_line_2": addr_field(&addr, "address_line_2"),
            "city": addr_field(&addr, "city"),
            "state": addr_field(&addr, "state"),
            "postal_code": addr_field(&addr, "postal_code"),
            "country": addr_field(&addr, "country"),
            "is_default": row_truthy(a.get("is_default")),
        }));
    }

    // users.phone, else the default (or first) address's phone, else null.
    let default_addr = addresses
        .iter()
        .find(|a| a["is_default"] == Value::Bool(true))
        .or_else(|| addresses.first());
    let phone = if row_truthy(user.get("phone")) {
        out(user.get("phone"))
    } else {
        default_addr
            .map(|a| a["phone"].clone())
            .filter(|p| truthy(Some(p)))
            .unwrap_or(Value::Null)
    };

    let stats_rows = fetch_rows(
        pool,
        "SELECT COUNT(*) AS orders,
                COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'refunded') THEN total_amount ELSE 0 END), 0) AS totalSpent,
                MAX(created_at) AS lastOrder
         FROM orders WHERE user_id = ?",
        std::slice::from_ref(&id),
    )
    .await
    .unwrap_or_else(|err| {
        tracing::error!(error = %err, "admin customer detail: stats query failed");
        Vec::new()
    });
    let stats_row = stats_rows.first();
    // `Number(x) || 0` (undefined → NaN and null → 0 both end up 0).
    let number = |k| {
        let n = js_to_number(&out(stats_row.and_then(|r| r.get(k))));
        if n.is_nan() || n == 0.0 {
            json!(0)
        } else {
            common::json::js_number(n)
        }
    };
    let stats = json!({
        "orders": number("orders"),
        "totalSpent": number("totalSpent"),
        "lastOrder": or_else(stats_row.and_then(|r| r.get("lastOrder")), Value::Null),
    });

    let customer = json!({
        "user": {
            "id": out(user.get("id")),
            "first_name": out(user.get("first_name")),
            "last_name": out(user.get("last_name")),
            "email": out(user.get("email")),
            "role": out(user.get("role")),
            "status": out(user.get("status")),
            "created_at": out(user.get("created_at")),
            "phone": phone,
        },
        "addresses": addresses,
        "stats": stats,
    });
    json(
        StatusCode::OK,
        success(
            "Customer fetched successfully",
            json!([{ "customer": customer }]),
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_like_the_template_literal() {
        let s = |v: &str| Js::String(v.into());
        assert_eq!(display_name(Some(&s("Ada")), Some(&s("L")), "x"), "Ada L");
        assert_eq!(display_name(Some(&s("Ada")), Some(&Js::Null), "x"), "Ada ");
        assert_eq!(
            display_name(Some(&s("")), Some(&s("L")), "Unknown"),
            "Unknown"
        );
        assert_eq!(display_name(None, None, "Guest/Unknown"), "Guest/Unknown");
    }

    #[test]
    fn address_json_is_read_like_the_route() {
        let a = |v: Value| address_fields(Some(&Js::Json(v)));
        assert_eq!(a(json!({"city": "X"})), Ok(json!({"city": "X"})));
        assert_eq!(a(json!(r#"{"city":"Y"}"#)), Ok(json!({"city": "Y"})));
        assert_eq!(a(json!("not json")), Ok(json!({})));
        assert_eq!(a(json!("null")), Err(()));
        assert_eq!(a(json!(5)), Ok(json!(5)));
        assert_eq!(address_fields(Some(&Js::Null)), Ok(json!({})));
        assert_eq!(addr_field(&json!(5), "city"), Value::Null);
        assert_eq!(addr_field(&json!({"city": ""}), "city"), Value::Null);
        assert_eq!(addr_field(&json!({"city": 1.0}), "city"), json!(1));
    }
}
