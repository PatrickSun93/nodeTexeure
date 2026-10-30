//! `/api/admin` area: backend/routes/admin/inventory.js — inventory levels,
//! stock adjustments (single and bulk), reorder points and the movement
//! history — plus the parts of backend/services/inventoryService.js they
//! call ([`service`]): `updateInventory`, `updateInventoryWithLogging` with
//! `logMovement`, the low-stock check and its alert emails, and
//! `getMovementHistory`. Registered in inventory.js order.

pub mod service;

use axum::http::StatusCode;
use axum::response::Response;
use common::response::{failure, success};
use serde_json::{Map, Value, json};

use super::products::exec::{self, Param, or_null, prop, rows, server_error, write};
use crate::admin::{AdminRequest, Routes, json};
use crate::body::{is_non_empty_string, is_optional_string, truthy};

pub fn register(r: &mut Routes) {
    use crate::admin::{
        Limiter::{AdminRead, AdminWrite},
        Step::*,
    };
    r.put("/inventory/:id", &[Admin, Limit(AdminWrite), Csrf], update);
    r.post(
        "/inventory/adjust",
        &[Admin, Limit(AdminWrite), Csrf],
        adjust,
    );
    r.post(
        "/inventory/bulk-adjust",
        &[Admin, Limit(AdminWrite), Csrf],
        bulk_adjust,
    );
    r.put(
        "/inventory/:id/reorder-points",
        &[Admin, Limit(AdminWrite), Csrf],
        reorder_points,
    );
    r.get(
        "/inventory/movements",
        &[Admin, Limit(AdminRead)],
        movements,
    );
    r.get("/inventory", &[Admin, Limit(AdminRead)], list);
}

fn field(req: &AdminRequest, key: &str) -> Param {
    prop(Some(&req.body), key)
}

/// `isIdPair`: product/variant ids are strings (a number would compare
/// numerically with them).
fn is_id_pair(product_id: Option<&Value>, variant_id: Option<&Value>) -> bool {
    is_non_empty_string(product_id) && (!truthy(variant_id) || is_non_empty_string(variant_id))
}

/// `variant_id || null` of a checked id pair.
fn variant_of(variant_id: Option<&Value>) -> Option<String> {
    match variant_id {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

// --- PUT /inventory/:id -------------------------------------------------------

async fn update(req: AdminRequest) -> Response {
    let params = [
        field(&req, "quantity_available"),
        field(&req, "quantity_reserved"),
        field(&req, "reorder_point"),
        field(&req, "reorder_quantity"),
        Some(Value::String(req.param(0).to_owned())),
    ];
    match write(
        &req.state.pool,
        "UPDATE inventory SET quantity_available = ?, quantity_reserved = ?, reorder_point = ?, reorder_quantity = ? WHERE id = ?",
        &params,
    )
    .await
    {
        Ok(_) => json(
            StatusCode::OK,
            success("Inventory updated successfully", json!([])),
        ),
        Err(e) => server_error("admin inventory update", &e),
    }
}

// --- POST /inventory/adjust -----------------------------------------------------

fn details(reason: Value, notes: Value) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("reason".into(), reason);
    m.insert("notes".into(), notes);
    m
}

async fn adjust(req: AdminRequest) -> Response {
    let product_id = field(&req, "product_id");
    let variant_id = field(&req, "variant_id");
    let change = field(&req, "quantity_change");
    let qty = exec::number(change.as_ref());
    if !is_id_pair(product_id.as_ref(), variant_id.as_ref())
        || change.as_ref().is_none_or(Value::is_null)
        || qty.is_nan()
    {
        return json(
            StatusCode::BAD_REQUEST,
            failure("product_id and a numeric quantity_change are required"),
        );
    }
    let product_id = product_id
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default();
    let result = service::update_inventory_with_logging(
        &req.state.pool,
        &product_id,
        variant_of(variant_id.as_ref()).as_deref(),
        qty,
        &req.user().id,
        details(
            or_null(field(&req, "reason")),
            or_null(field(&req, "notes")),
        ),
    )
    .await;
    match result {
        Ok(data) => json(
            StatusCode::OK,
            success(
                "Stock adjusted successfully",
                json!([{ "adjustment": data }]),
            ),
        ),
        Err(e) => {
            let message = if e.is_empty() {
                "Stock adjustment failed".to_owned()
            } else {
                e
            };
            json(StatusCode::BAD_REQUEST, failure(&message))
        }
    }
}

// --- POST /inventory/bulk-adjust ------------------------------------------------

async fn bulk_adjust(req: AdminRequest) -> Response {
    let adjustments = match field(&req, "adjustments") {
        Some(Value::Array(items)) if !items.is_empty() => items,
        _ => {
            return json(
                StatusCode::BAD_REQUEST,
                failure("adjustments must be a non-empty array"),
            );
        }
    };
    let reason = field(&req, "reason");
    let notes = field(&req, "notes");
    let mut results = Vec::new();
    for adj in &adjustments {
        // `Number(adj.quantity_change)` runs first: a null entry throws.
        if adj.is_null() {
            return server_error(
                "admin inventory bulk-adjust",
                "Cannot read properties of null (reading 'quantity_change')",
            );
        }
        let a = Some(adj);
        let product_id = prop(a, "product_id");
        let variant_id = prop(a, "variant_id");
        let qty = exec::number(prop(a, "quantity_change").as_ref());
        if !truthy(a) || !is_id_pair(product_id.as_ref(), variant_id.as_ref()) || qty.is_nan() {
            let shown = if truthy(a) {
                or_null(product_id)
            } else {
                Value::Null
            };
            results.push(json!({
                "product_id": shown,
                "success": false,
                "error": "Invalid adjustment (product_id and numeric quantity_change required)",
            }));
            continue;
        }
        let pick =
            |own: Param, shared: &Param| exec::or(own, exec::or(shared.clone(), Value::Null));
        let product = product_id
            .clone()
            .and_then(|v| v.as_str().map(str::to_owned))
            .unwrap_or_default();
        let result = service::update_inventory_with_logging(
            &req.state.pool,
            &product,
            variant_of(variant_id.as_ref()).as_deref(),
            qty,
            &req.user().id,
            details(
                pick(prop(a, "reason"), &reason),
                pick(prop(a, "notes"), &notes),
            ),
        )
        .await;
        let (ok, error) = match &result {
            Ok(_) => (true, Value::Null),
            Err(e) if e.is_empty() => (false, Value::Null),
            Err(e) => (false, json!(e)),
        };
        results.push(json!({
            "product_id": product_id,
            "variant_id": or_null(variant_id),
            "success": ok,
            "error": error,
        }));
    }
    let successful = results
        .iter()
        .filter(|r| r["success"] == json!(true))
        .count();
    let failed = results.len() - successful;
    json(
        StatusCode::OK,
        success(
            "Bulk stock adjustment processed",
            json!([{
                "successful": successful,
                "failed": failed,
                "total": results.len(),
                "results": results,
            }]),
        ),
    )
}

// --- PUT /inventory/:id/reorder-points ------------------------------------------

async fn reorder_points(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let id = req.param(0).to_owned();
    let current = match rows(
        pool,
        "SELECT quantity_available, quantity_reserved FROM inventory WHERE id = ?",
        &[Some(json!(id))],
    )
    .await
    {
        Ok(rows) => rows,
        Err(e) => return server_error("admin inventory reorder points", &e),
    };
    let Some(current) = current.first() else {
        return json(StatusCode::NOT_FOUND, failure("Inventory record not found"));
    };
    let result = service::update_inventory(
        pool,
        &id,
        [
            Some(exec::js_json(current.get("quantity_available"))),
            Some(exec::js_json(current.get("quantity_reserved"))),
            field(&req, "reorder_point"),
            field(&req, "reorder_quantity"),
        ],
    )
    .await;
    match result {
        Ok(()) => json(
            StatusCode::OK,
            success("Reorder points updated successfully", json!([{ "id": id }])),
        ),
        Err(e) => {
            let message = if e.is_empty() {
                "Failed to update reorder points".to_owned()
            } else {
                e
            };
            json(StatusCode::BAD_REQUEST, failure(&message))
        }
    }
}

// --- GET /inventory/movements ----------------------------------------------------

async fn movements(req: AdminRequest) -> Response {
    let query = req.query();
    let get = |k: &str| query.get(k).cloned();
    let filters = [
        get("inventory_id"),
        get("product_id"),
        get("movement_type"),
        get("reference_type"),
        get("date_from"),
        get("date_to"),
    ];
    if !filters.iter().all(|v| is_optional_string(v.as_ref())) {
        return json(
            StatusCode::BAD_REQUEST,
            failure("Filters must be single values"),
        );
    }
    let [
        inventory_id,
        product_id,
        movement_type,
        reference_type,
        date_from,
        date_to,
    ] = filters;
    let history = service::movement_history(
        &req.state.pool,
        service::Filters {
            inventory_id,
            product_id,
            movement_type,
            reference_type,
            date_from,
            date_to,
            limit: get("limit"),
        },
    )
    .await;
    match history {
        Ok(rows) => {
            let list: Vec<Value> = rows.iter().map(|r| Value::Object(r.to_json())).collect();
            json(
                StatusCode::OK,
                success(
                    "Inventory movements fetched successfully",
                    json!([{ "movements": list }]),
                ),
            )
        }
        Err(e) => server_error("admin inventory movements", &e),
    }
}

// --- GET /inventory ----------------------------------------------------------------

async fn list(req: AdminRequest) -> Response {
    match rows(&req.state.pool, "SELECT * FROM inventory", &[]).await {
        Ok(rows) => {
            let list: Vec<Value> = rows.iter().map(|r| Value::Object(r.to_json())).collect();
            json(
                StatusCode::OK,
                success(
                    "Inventory fetched successfully",
                    json!([{ "inventory": list }]),
                ),
            )
        }
        Err(e) => server_error("admin inventory list", &e),
    }
}
