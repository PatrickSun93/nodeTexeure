//! `/api/admin` area: backend/routes/admin/coupons.js — discount codes
//! (create, update, delete, list with a computed status). Every route is
//! `admin` plus the read or write limiter (and CSRF for writes), behind E's
//! router-level steps; registered in coupons.js order.

use axum::http::StatusCode;
use axum::response::Response;
use chrono::Utc;
use common::response::{failure, success};
use serde_json::{Value, json};

use super::products::exec::{self, Param, or, or_null, prop, rows, server_error, stringify, write};
use crate::admin::{AdminRequest, Routes, json};
use crate::body::is_optional_string;
use crate::mysql_json::Js;

pub fn register(r: &mut Routes) {
    use crate::admin::{
        Limiter::{AdminRead, AdminWrite},
        Step::*,
    };
    r.post("/coupons", &[Admin, Limit(AdminWrite), Csrf], create);
    r.put("/coupons/:id", &[Admin, Limit(AdminWrite), Csrf], update);
    r.delete("/coupons/:id", &[Admin, Limit(AdminWrite), Csrf], remove);
    r.get("/coupons", &[Admin, Limit(AdminRead)], list);
}

/// Text columns (a number would be written as an ENUM index, and checkout
/// looks codes up as strings).
const TEXT_COLUMNS: [&str; 3] = ["code", "name", "type"];

const ALLOWED_COUPON_COLUMNS: [&str; 12] = [
    "code",
    "name",
    "discount_details",
    "type",
    "value",
    "minimum_order_amount",
    "maximum_discount_amount",
    "usage_limit",
    "usage_limit_per_customer",
    "is_active",
    "starts_at",
    "expires_at",
];

fn field(req: &AdminRequest, key: &str) -> Param {
    prop(Some(&req.body), key)
}

async fn create(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let (code, name, kind) = (
        field(&req, "code"),
        field(&req, "name"),
        field(&req, "type"),
    );
    if ![&code, &name, &kind]
        .iter()
        .all(|v| is_optional_string(v.as_ref()))
    {
        return json(
            StatusCode::BAD_REQUEST,
            failure("code, name and type must be text"),
        );
    }
    let id = match exec::next_id(pool, "DISC").await {
        Ok(id) => id.map_or(Value::Null, Value::String),
        Err(e) => return server_error("admin coupon create", &e),
    };
    let details = or(field(&req, "discount_details"), json!({}));
    let result = write(
        pool,
        "INSERT INTO discount_codes (id, code, name, discount_details, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, usage_limit_per_customer, starts_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        &[
            Some(id.clone()),
            Some(or_null(code)),
            Some(or_null(name)),
            Some(Value::String(stringify(&details))),
            Some(or(kind, json!("percentage"))),
            Some(or(field(&req, "value"), json!(0))),
            Some(or_null(field(&req, "minimum_order_amount"))),
            Some(or_null(field(&req, "maximum_discount_amount"))),
            Some(or_null(field(&req, "usage_limit"))),
            Some(or_null(field(&req, "usage_limit_per_customer"))),
            Some(or_null(field(&req, "starts_at"))),
            Some(or_null(field(&req, "expires_at"))),
            Some(Value::String(req.user().id.clone())),
        ],
    )
    .await;
    match result {
        Ok(_) => json(
            StatusCode::CREATED,
            success("Coupon added successfully", json!([{ "id": id }])),
        ),
        Err(e) if e.contains("Duplicate entry") => {
            tracing::error!(error = %e, "admin coupon create");
            json(
                StatusCode::CONFLICT,
                failure("A coupon with this code already exists"),
            )
        }
        Err(e) => server_error("admin coupon create", &e),
    }
}

async fn update(req: AdminRequest) -> Response {
    let mut fields = Vec::new();
    let mut values: Vec<Param> = Vec::new();
    for (key, value) in exec::entries(&req.body) {
        if !ALLOWED_COUPON_COLUMNS.contains(&key.as_str()) {
            continue;
        }
        if TEXT_COLUMNS.contains(&key.as_str()) && !is_optional_string(Some(&value)) {
            return json(
                StatusCode::BAD_REQUEST,
                failure(&format!("{key} must be text")),
            );
        }
        fields.push(format!("{key} = ?"));
        if key == "discount_details" {
            values.push(Some(Value::String(stringify(&or(Some(value), json!({}))))));
        } else if value == json!("") {
            values.push(Some(Value::Null));
        } else {
            values.push(Some(value));
        }
    }
    if fields.is_empty() {
        return json(
            StatusCode::BAD_REQUEST,
            failure("No valid fields to update"),
        );
    }
    values.push(Some(Value::String(req.param(0).to_owned())));
    let sql = format!(
        "UPDATE discount_codes SET {} WHERE id = ?",
        fields.join(", ")
    );
    match write(&req.state.pool, &sql, &values).await {
        Ok(_) => json(
            StatusCode::OK,
            success("Coupon updated successfully", json!([])),
        ),
        Err(e) => server_error("admin coupon update", &e),
    }
}

async fn remove(req: AdminRequest) -> Response {
    let id = Some(Value::String(req.param(0).to_owned()));
    match write(
        &req.state.pool,
        "DELETE FROM discount_codes WHERE id = ?",
        &[id],
    )
    .await
    {
        Ok(_) => json(
            StatusCode::OK,
            success("Coupon deleted successfully", json!([])),
        ),
        Err(e) => server_error("admin coupon delete", &e),
    }
}

/// `new Date(value)` of a row's date in epoch ms (`None` for null; NaN for
/// an Invalid Date, which every comparison rejects).
fn date_ms(value: Option<&Js>) -> Option<f64> {
    match value {
        Some(Js::Date(Some(d))) => Some(d.and_utc().timestamp_millis() as f64),
        Some(v) if v.truthy() => Some(exec::js_number(Some(v))),
        _ => None,
    }
}

async fn list(req: AdminRequest) -> Response {
    let data = match rows(&req.state.pool, "SELECT * FROM discount_codes", &[]).await {
        Ok(rows) => rows,
        Err(e) => return server_error("admin coupons list", &e),
    };
    let now = Utc::now().timestamp_millis() as f64;
    let coupons: Vec<Value> = data
        .iter()
        .map(|c| {
            let mut status = "Draft";
            if c.get("is_active").is_some_and(Js::truthy) {
                let start = date_ms(c.get("starts_at"));
                let end = date_ms(c.get("expires_at"));
                status = if end.is_some_and(|e| now > e) {
                    "Expired"
                } else if start.is_some_and(|s| now < s) {
                    "Scheduled"
                } else {
                    "Active"
                };
            }
            let mut out = c.to_json();
            out.insert("startDate".into(), exec::js_json(c.get("starts_at")));
            out.insert("endDate".into(), exec::js_json(c.get("expires_at")));
            out.insert("status".into(), json!(status));
            Value::Object(out)
        })
        .collect();
    json(
        StatusCode::OK,
        success(
            "Coupons fetched successfully",
            json!([{ "coupons": coupons }]),
        ),
    )
}
