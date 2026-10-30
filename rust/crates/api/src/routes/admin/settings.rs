//! `/api/admin` area: backend/routes/admin/settings.js — the store's general
//! settings, the generic `system_settings` key/value rows, and shipping zones.
//! Admin only, behind E's `protect, staffOrAdmin, adminLimiter,
//! csrfProtection` (see [`crate::admin`]).
//!
//! Client values reach SQL the way mysql2 binds them
//! ([`crate::mysql_json::bind`]: a number as DOUBLE, a boolean as TINY, an
//! object as JSON text), and a value missing from the body is a query mysql2
//! refuses ("Bind parameters must not contain undefined") — which
//! `PUT /settings/general` ignores, so that setting is simply not written.
//!
//! `JSON.stringify` of a client object ([`js_stringify`]) writes numbers the
//! JavaScript way; the parsed body has its object keys sorted, so a nested
//! object's keys can come out in another order than the client sent them.

use axum::http::StatusCode;
use axum::response::Response;
use common::response::{failure, success};
use serde_json::{Value, json};
use sqlx::MySqlPool;

use crate::admin::Limiter::{AdminRead, AdminWrite};
use crate::admin::{AdminRequest, Routes, Step::*, json};
use crate::body::{js_string, truthy};
use crate::express_router::js_json;
use crate::mysql_json::{Js, bind, fetch_rows};

use super::orders::{bad_request, field, or_else, out, row_truthy, server_error};

/// settings.js `ALLOWED_SETTING_TYPES` (the setting_type ENUM).
const ALLOWED_SETTING_TYPES: [&str; 5] = ["string", "integer", "decimal", "boolean", "json"];

pub fn register(r: &mut Routes) {
    // router.get('/settings/general', admin, adminReadLimiter, handler)
    r.get("/settings/general", &[Admin, Limit(AdminRead)], general);
    // router.put('/settings/general', admin, adminWriteLimiter, csrfProtection, handler)
    r.put(
        "/settings/general",
        &[Admin, Limit(AdminWrite), Csrf],
        update_general,
    );
    // router.get('/settings', admin, adminReadLimiter, handler)
    r.get("/settings", &[Admin, Limit(AdminRead)], list);
    // router.post('/settings/bulk-update', admin, adminWriteLimiter, csrfProtection, handler)
    r.post(
        "/settings/bulk-update",
        &[Admin, Limit(AdminWrite), Csrf],
        bulk_update,
    );
    // router.put('/settings/:key', admin, adminWriteLimiter, csrfProtection, handler)
    r.put(
        "/settings/:key",
        &[Admin, Limit(AdminWrite), Csrf],
        update_one,
    );
    // router.get('/shipping/zones', admin, adminReadLimiter, handler)
    r.get("/shipping/zones", &[Admin, Limit(AdminRead)], zones);
    // router.post('/shipping/zones', admin, adminWriteLimiter, csrfProtection, handler)
    r.post(
        "/shipping/zones",
        &[Admin, Limit(AdminWrite), Csrf],
        create_zone,
    );
    // router.put('/shipping/zones/:id', admin, adminWriteLimiter, csrfProtection, handler)
    r.put(
        "/shipping/zones/:id",
        &[Admin, Limit(AdminWrite), Csrf],
        update_zone,
    );
    // router.delete('/shipping/zones/:id', admin, adminWriteLimiter, csrfProtection, handler)
    r.delete(
        "/shipping/zones/:id",
        &[Admin, Limit(AdminWrite), Csrf],
        delete_zone,
    );
}

// --- JSON.stringify -----------------------------------------------------------

/// A JavaScript array index ("0", "17"; not "01" or "4294967295"): such keys
/// come first, ascending, in any object.
fn array_index(key: &str) -> Option<u32> {
    if key.is_empty() || (key.len() > 1 && key.starts_with('0')) {
        return None;
    }
    key.parse::<u32>().ok().filter(|n| *n != u32::MAX)
}

fn stringify_into(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => match n.as_f64() {
            Some(f) if f.is_finite() => out.push_str(&common::json::js_number_string(f)),
            _ => out.push_str("null"),
        },
        Value::String(s) => out.push_str(&Value::String(s.clone()).to_string()),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                stringify_into(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut indexed: Vec<(u32, (&String, &Value))> = map
                .iter()
                .filter_map(|e| array_index(e.0).map(|i| (i, e)))
                .collect();
            indexed.sort_by_key(|(i, _)| *i);
            let entries = indexed
                .into_iter()
                .map(|(_, e)| e)
                .chain(map.iter().filter(|e| array_index(e.0).is_none()));
            out.push('{');
            for (i, (k, v)) in entries.enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&Value::String(k.clone()).to_string());
                out.push(':');
                stringify_into(v, out);
            }
            out.push('}');
        }
    }
}

/// `JSON.stringify(value)` of a parsed request value: JavaScript number
/// formatting (`1.0` → `1`, `1e21` → `1e+21`) and array-index keys first.
pub(crate) fn js_stringify(value: &Value) -> String {
    let mut out = String::new();
    stringify_into(value, &mut out);
    out
}

// --- settings -------------------------------------------------------------------

/// `GET /settings/general`: four settings with their defaults.
async fn general(req: AdminRequest) -> Response {
    let rows = match fetch_rows(&req.state.pool, "SELECT * FROM system_settings", &[]).await {
        Ok(rows) => rows,
        // `result.data.forEach` of a failed query throws.
        Err(err) => return server_error("admin general settings", err),
    };
    // `settings[s.setting_key] = s.setting_value` (a later row wins).
    let mut values: Vec<(String, Js)> = Vec::new();
    for s in &rows {
        let key = s.get("setting_key").map(Js::js_string).unwrap_or_default();
        let value = s.get("setting_value").cloned().unwrap_or(Js::Null);
        match values.iter_mut().find(|(k, _)| *k == key) {
            Some(slot) => slot.1 = value,
            None => values.push((key, value)),
        }
    }
    let get = |k: &str| values.iter().find(|(key, _)| key == k).map(|(_, v)| v);
    let general = json!({
        "storeName": or_else(get("store_name"), json!("NodeTexture")),
        "supportEmail": or_else(get("support_email"), json!("support@nodetexture.com")),
        "currency": or_else(get("currency"), json!("USD")),
        "timezone": or_else(get("timezone"), json!("UTC")),
    });
    json(
        StatusCode::OK,
        success("General settings fetched", json!([{ "general": general }])),
    )
}

/// `PUT /settings/general` `{ storeName, supportEmail, currency, timezone }`:
/// four upserts whose results are ignored.
async fn update_general(req: AdminRequest) -> Response {
    const SQL: [(&str, &str); 4] = [
        (
            "storeName",
            "INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'store_name', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?",
        ),
        (
            "supportEmail",
            "INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'support_email', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?",
        ),
        (
            "currency",
            "INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'currency', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?",
        ),
        (
            "timezone",
            "INSERT INTO system_settings (id, setting_key, setting_value, setting_type) VALUES (UUID(), 'timezone', ?, 'string') ON DUPLICATE KEY UPDATE setting_value = ?",
        ),
    ];
    // Node runs them with Promise.all; they touch different rows, so one
    // after the other is the same.
    let pool = &req.state.pool;
    for (name, sql) in SQL {
        // mysql2 refuses an `undefined` parameter: that query fails.
        let Some(value) = field(&req.body, name) else {
            continue;
        };
        let query = bind(bind(sqlx::query(sql), value), value);
        if let Err(err) = query.execute(pool).await {
            tracing::error!(error = %err, setting = name, "general setting upsert failed");
        }
    }
    json(StatusCode::OK, success("Settings updated", json!([])))
}

/// settings.js `normalizeSettingValue(v)`: TEXT column form.
fn normalize_setting_value(v: Option<&Value>) -> Option<String> {
    match v {
        None | Some(Value::Null) => None,
        Some(v @ (Value::Object(_) | Value::Array(_))) => Some(js_stringify(v)),
        Some(v) => Some(js_string(v)),
    }
}

/// settings.js `upsertSetting(key, value, type, userId)`; `type` is a valid
/// setting type or `None` (a new row is then a 'string' and an existing row
/// keeps its type).
async fn upsert_setting(
    pool: &MySqlPool,
    user_id: &str,
    key: &Value,
    value: Option<&Value>,
    setting_type: Option<&str>,
) -> Result<(), sqlx::Error> {
    let val = normalize_setting_value(value).map_or(Value::Null, Value::String);
    let user = Value::String(user_id.to_owned());
    let query = match setting_type {
        Some(t) => {
            let t = Value::String(t.to_owned());
            let q = sqlx::query(
                "INSERT INTO system_settings (id, setting_key, setting_value, setting_type, updated_by)
                 VALUES (UUID(), ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = ?, setting_type = ?, updated_by = ?",
            );
            [key, &val, &t, &user, &val, &t, &user]
                .into_iter()
                .fold(q, bind)
        }
        None => {
            let q = sqlx::query(
                "INSERT INTO system_settings (id, setting_key, setting_value, setting_type, updated_by)
                 VALUES (UUID(), ?, ?, 'string', ?)
                 ON DUPLICATE KEY UPDATE setting_value = ?, updated_by = ?",
            );
            [key, &val, &user, &val, &user].into_iter().fold(q, bind)
        }
    };
    query.execute(pool).await.map(|_| ())
}

/// `type && !ALLOWED_SETTING_TYPES.includes(type)`: `Err` for a truthy value
/// that isn't one of the types; `Ok(None)` for a falsy one.
fn setting_type(v: Option<&Value>) -> Result<Option<&str>, ()> {
    if !truthy(v) {
        return Ok(None);
    }
    match v.and_then(Value::as_str) {
        Some(t) if ALLOWED_SETTING_TYPES.contains(&t) => Ok(Some(t)),
        _ => Err(()),
    }
}

/// `GET /settings`: every setting, by key.
async fn list(req: AdminRequest) -> Response {
    let rows = match sqlx::query!(
        r#"SELECT setting_key, setting_value, setting_type AS "setting_type: String"
           FROM system_settings ORDER BY setting_key ASC"#
    )
    .fetch_all(&req.state.pool)
    .await
    {
        Ok(rows) => rows,
        Err(err) => return server_error("admin settings list", err),
    };
    let settings: Vec<Value> = rows
        .into_iter()
        .map(|s| {
            json!({
                "setting_key": s.setting_key,
                "setting_value": s.setting_value,
                "setting_type": s.setting_type,
            })
        })
        .collect();
    json(
        StatusCode::OK,
        success(
            "Settings fetched successfully",
            json!([{ "settings": settings }]),
        ),
    )
}

/// `POST /settings/bulk-update` `{ settings: [{ key, value, type? }] }`:
/// entries without a key or with an unknown type are skipped.
async fn bulk_update(req: AdminRequest) -> Response {
    let settings = match field(&req.body, "settings") {
        Some(Value::Array(items)) if !items.is_empty() => items.clone(),
        _ => return bad_request("settings must be a non-empty array"),
    };
    let mut updated = 0u64;
    for s in &settings {
        // `!s || !s.key`: only an object with a truthy key.
        let key = field(s, "key");
        if !truthy(key) {
            continue;
        }
        let Ok(t) = setting_type(field(s, "type")) else {
            continue;
        };
        let key = key.cloned().unwrap_or(Value::Null);
        match upsert_setting(&req.state.pool, &req.user().id, &key, field(s, "value"), t).await {
            Ok(()) => updated += 1,
            Err(err) => tracing::error!(error = %err, "setting upsert failed"),
        }
    }
    json(
        StatusCode::OK,
        success(
            "Settings updated successfully",
            json!([{ "result": { "updated": updated } }]),
        ),
    )
}

/// `PUT /settings/:key` `{ value, type? }` (`PUT /settings/general`, registered
/// first, still wins for that path).
async fn update_one(req: AdminRequest) -> Response {
    let key = req.param(0).to_owned();
    if key.is_empty() {
        return bad_request("Setting key is required");
    }
    let value = field(&req.body, "value");
    let Ok(t) = setting_type(field(&req.body, "type")) else {
        return bad_request(&format!(
            "Invalid setting type. Allowed: {}",
            ALLOWED_SETTING_TYPES.join(", ")
        ));
    };
    let key_value = Value::String(key.clone());
    if let Err(err) = upsert_setting(&req.state.pool, &req.user().id, &key_value, value, t).await {
        return server_error("admin setting update", err);
    }
    json(
        StatusCode::OK,
        success(
            "Setting updated successfully",
            json!([{ "setting": {
                "setting_key": key,
                "setting_value": normalize_setting_value(value),
            } }]),
        ),
    )
}

// --- shipping zones ---------------------------------------------------------------

/// A zone's `countries` as the list shows it: the parsed column (a string is
/// parsed again), `[]` unless that is an array.
fn zone_countries(raw: Option<&Js>) -> Value {
    if !row_truthy(raw) {
        return json!([]);
    }
    let countries = match raw {
        Some(Js::Json(Value::String(s)) | Js::String(s)) => {
            serde_json::from_str::<Value>(s).map_or(json!([]), js_json)
        }
        Some(Js::Json(v)) => v.clone(),
        _ => json!([]),
    };
    if countries.is_array() {
        countries
    } else {
        json!([])
    }
}

/// `GET /shipping/zones`.
async fn zones(req: AdminRequest) -> Response {
    let rows = match fetch_rows(
        &req.state.pool,
        "SELECT id, name, countries, is_active FROM shipping_zones ORDER BY name ASC",
        &[],
    )
    .await
    {
        Ok(rows) => rows,
        Err(err) => return server_error("admin shipping zones list", err),
    };
    let zones: Vec<Value> = rows
        .iter()
        .map(|z| {
            json!({
                "id": out(z.get("id")),
                "name": out(z.get("name")),
                "countries": zone_countries(z.get("countries")),
                "is_active": row_truthy(z.get("is_active")),
            })
        })
        .collect();
    json(
        StatusCode::OK,
        success(
            "Shipping zones fetched successfully",
            json!([{ "zones": zones }]),
        ),
    )
}

fn countries_error() -> Response {
    bad_request("countries must be an array of country codes")
}

/// `POST /shipping/zones` `{ name, countries, is_active? }` (id from the
/// 'SHIP' transno prefix).
async fn create_zone(req: AdminRequest) -> Response {
    let body = &req.body;
    let name = match field(body, "name") {
        Some(Value::String(s)) if !crate::express::js_trim(s).is_empty() => {
            crate::express::js_trim(s).to_owned()
        }
        _ => return bad_request("name is required"),
    };
    let Some(countries @ Value::Array(_)) = field(body, "countries") else {
        return countries_error();
    };
    let pool = &req.state.pool;
    let id = match sqlx::query_scalar!(r#"SELECT get_next_id('SHIP') AS "id: String""#)
        .fetch_one(pool)
        .await
    {
        Ok(Some(id)) if !id.is_empty() => id,
        Ok(_) => return server_error("admin zone create", "Failed to generate shipping zone ID"),
        Err(err) => return server_error("admin zone create", err),
    };
    // `is_active === undefined ? 1 : (is_active ? 1 : 0)`.
    let active = field(body, "is_active").is_none_or(|v| truthy(Some(v)));
    let active_val = i8::from(active);
    if let Err(err) = sqlx::query!(
        "INSERT INTO shipping_zones (id, name, countries, is_active) VALUES (?, ?, ?, ?)",
        id,
        name,
        js_stringify(countries),
        active_val
    )
    .execute(pool)
    .await
    {
        return server_error("admin zone create", err);
    }
    json(
        StatusCode::CREATED,
        success(
            "Shipping zone created successfully",
            json!([{ "zone": {
                "id": id,
                "name": name,
                "countries": js_json(countries.clone()),
                "is_active": active,
            } }]),
        ),
    )
}

/// `PUT /shipping/zones/:id`: name / countries / is_active, those present.
async fn update_zone(req: AdminRequest) -> Response {
    let id = req.param(0).to_owned();
    let pool = &req.state.pool;
    match sqlx::query_scalar!("SELECT id FROM shipping_zones WHERE id = ?", id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => return json(StatusCode::NOT_FOUND, failure("Shipping zone not found")),
        Err(err) => return server_error("admin zone update", err),
    }
    let body = &req.body;
    let mut fields: Vec<&str> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    if let Some(name) = field(body, "name") {
        let trimmed = js_string(name);
        let trimmed = crate::express::js_trim(&trimmed);
        if !truthy(Some(name)) || trimmed.is_empty() {
            return bad_request("name cannot be empty");
        }
        fields.push("name = ?");
        values.push(Value::String(trimmed.to_owned()));
    }
    if let Some(countries) = field(body, "countries") {
        if !countries.is_array() {
            return countries_error();
        }
        fields.push("countries = ?");
        values.push(Value::String(js_stringify(countries)));
    }
    if let Some(active) = field(body, "is_active") {
        fields.push("is_active = ?");
        values.push(json!(i8::from(truthy(Some(active)))));
    }
    if fields.is_empty() {
        return bad_request("No valid fields to update");
    }
    values.push(Value::String(id.clone()));
    let sql = format!(
        "UPDATE shipping_zones SET {} WHERE id = ?",
        fields.join(", ")
    );
    let query = values.iter().fold(sqlx::query(&sql), bind);
    if let Err(err) = query.execute(pool).await {
        return server_error("admin zone update", err);
    }
    json(
        StatusCode::OK,
        success("Shipping zone updated successfully", json!([{ "id": id }])),
    )
}

/// `DELETE /shipping/zones/:id`: its rates first (no ON DELETE CASCADE).
async fn delete_zone(req: AdminRequest) -> Response {
    let id = req.param(0).to_owned();
    let pool = &req.state.pool;
    if let Err(err) = sqlx::query!("DELETE FROM shipping_rates WHERE zone_id = ?", id)
        .execute(pool)
        .await
    {
        return server_error("admin zone delete: rates", err);
    }
    match sqlx::query!("DELETE FROM shipping_zones WHERE id = ?", id)
        .execute(pool)
        .await
    {
        Err(err) => server_error("admin zone delete", err),
        Ok(done) if done.rows_affected() == 0 => {
            json(StatusCode::NOT_FOUND, failure("Shipping zone not found"))
        }
        Ok(_) => json(
            StatusCode::OK,
            success("Shipping zone deleted successfully", json!([{ "id": id }])),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stringify_like_javascript() {
        assert_eq!(
            js_stringify(&json!({"b": 1.0, "a": [1e21, -0.0, 0.5]})),
            r#"{"a":[1e+21,0,0.5],"b":1}"#
        );
        assert_eq!(
            js_stringify(&json!({"x": 1, "10": 2, "2": 3})),
            r#"{"2":3,"10":2,"x":1}"#
        );
        assert_eq!(js_stringify(&json!("a\"\n\u{1}")), r#""a\"\n\u0001""#);
        assert_eq!(
            js_stringify(&json!([null, true, "é"])),
            r#"[null,true,"é"]"#
        );
    }

    #[test]
    fn setting_values_normalize_like_node() {
        assert_eq!(normalize_setting_value(None), None);
        assert_eq!(normalize_setting_value(Some(&Value::Null)), None);
        assert_eq!(
            normalize_setting_value(Some(&json!(true))).as_deref(),
            Some("true")
        );
        assert_eq!(
            normalize_setting_value(Some(&json!(1.5))).as_deref(),
            Some("1.5")
        );
        assert_eq!(
            normalize_setting_value(Some(&json!(2.0))).as_deref(),
            Some("2")
        );
        assert_eq!(
            normalize_setting_value(Some(&json!([1, "a"]))).as_deref(),
            Some(r#"[1,"a"]"#)
        );
        assert_eq!(
            normalize_setting_value(Some(&json!(""))).as_deref(),
            Some("")
        );
    }

    #[test]
    fn setting_types_like_includes() {
        assert_eq!(setting_type(None), Ok(None));
        assert_eq!(setting_type(Some(&json!(""))), Ok(None));
        assert_eq!(setting_type(Some(&json!(0))), Ok(None));
        assert_eq!(setting_type(Some(&json!("json"))), Ok(Some("json")));
        assert_eq!(setting_type(Some(&json!("JSON"))), Err(()));
        assert_eq!(setting_type(Some(&json!(["json"]))), Err(()));
    }

    #[test]
    fn zone_countries_like_the_list() {
        let c = |v: Value| zone_countries(Some(&Js::Json(v)));
        assert_eq!(c(json!(["US", "CA"])), json!(["US", "CA"]));
        assert_eq!(c(json!(r#"["FR", 1.0]"#)), json!(["FR", 1]));
        assert_eq!(c(json!("nope")), json!([]));
        assert_eq!(c(json!({"a": 1})), json!([]));
        assert_eq!(zone_countries(Some(&Js::Null)), json!([]));
    }
}
