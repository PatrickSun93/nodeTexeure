//! `/api/admin` area: backend/routes/admin/products.js — products (list,
//! detail, create/update incl. variants and their inventory, delete, the
//! approval status), categories, the product image upload (multer disk
//! storage under `uploads/products/<id>/`) and bulk update/delete.
//!
//! Every route sits behind E's `protect, staffOrAdmin, adminLimiter,
//! csrfProtection` (see [`crate::admin`]) plus its own guard, limiter and
//! CSRF steps, registered here in products.js order. Handlers follow the Node
//! code line by line, including what `executeQuery` ignores: a failed variant
//! or inventory insert is not an error, and ids are still drawn from
//! `get_next_id` in the same order (see [`exec`]).

pub mod exec;

use std::path::PathBuf;
use std::sync::Arc;

use axum::http::{StatusCode, header};
use axum::response::Response;
use common::json::js_to_fixed;
use common::response::{failure, failure_with, success};
use serde_json::{Value, json};

use sqlx::MySqlPool;

use crate::admin::{AdminRequest, Routes, json};
use crate::body::{is_non_empty_string, is_string_list, js_string, truthy};
use crate::multer::{DiskStorage, FileInfo, Limits, Multer, Storage};
use exec::{
    Param, js_json, js_number, js_or, or, or_null, prop, rows, server_error, stringify, write,
};

pub fn register(r: &mut Routes) {
    use crate::admin::{
        Limiter::{AdminRead, AdminWrite},
        Step::*,
    };
    r.post(
        "/products",
        &[StaffOrAdmin, Limit(AdminWrite), Csrf],
        create,
    );
    r.put("/products/:id", &[Admin, Limit(AdminWrite), Csrf], update);
    r.delete("/products/:id", &[Admin, Limit(AdminWrite), Csrf], remove);
    r.put(
        "/products/:id/status",
        &[Admin, Limit(AdminWrite), Csrf],
        set_status,
    );
    r.get("/categories", &[Admin, Limit(AdminRead)], categories);
    r.get("/products", &[Admin, Limit(AdminRead)], list);
    r.get("/products/:id", &[Admin, Limit(AdminRead)], detail);
    r.post(
        "/products/:id/image",
        &[Admin, Limit(AdminWrite), Csrf],
        upload_image,
    );
    r.post(
        "/products/bulk-update",
        &[Admin, Limit(AdminWrite), Csrf],
        bulk_update,
    );
    r.post(
        "/products/bulk-delete",
        &[Admin, Limit(AdminWrite), Csrf],
        bulk_delete,
    );
}

/// The columns PUT /products/:id and bulk-update may set.
const ALLOWED_PRODUCT_COLUMNS: [&str; 15] = [
    "name",
    "slug",
    "sku",
    "description",
    "short_description",
    "base_price",
    "sale_price",
    "cost_price",
    "category_id",
    "product_details",
    "status",
    "is_featured",
    "meta_title",
    "meta_description",
    "meta_keywords",
];

fn field(body: &Value, key: &str) -> Param {
    prop(Some(body), key)
}

/// The slug made from a name: lower case, runs of anything but `a-z0-9` as
/// one `-`, no leading or trailing `-`.
fn slugify(name: &str) -> String {
    let lower = crate::express::js_trim(&name.to_lowercase()).to_owned();
    let mut out = String::new();
    let mut dash = false;
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
            dash = false;
        } else if !dash {
            out.push('-');
            dash = true;
        }
    }
    out.trim_matches('-').to_owned()
}

// --- POST /products -----------------------------------------------------------

async fn create(req: AdminRequest) -> Response {
    let body = &req.body;
    let name = field(body, "name");
    let base_price = field(body, "base_price");
    let category_id = field(body, "category_id");
    if !truthy(name.as_ref())
        || base_price.as_ref().is_none_or(Value::is_null)
        || !truthy(category_id.as_ref())
    {
        return json(
            StatusCode::BAD_REQUEST,
            failure("name, base_price and category_id are required"),
        );
    }
    let user_id = req.user().id.clone();
    match create_product(
        &req.state.pool,
        &user_id,
        body,
        name,
        base_price,
        category_id,
    )
    .await
    {
        Ok(id) => json(
            StatusCode::CREATED,
            success("Product added successfully", json!([{ "id": id }])),
        ),
        Err(message) if message.contains("Duplicate entry") => {
            tracing::error!(error = %message, "admin product create");
            json(
                StatusCode::CONFLICT,
                failure("A product with this SKU or slug already exists"),
            )
        }
        Err(message) => server_error("admin product create", &message),
    }
}

/// Generates an id the way the variant/inventory inserts do (`throw` on a
/// failed or empty result).
async fn require_id(pool: &MySqlPool, prefix: &str, what: &str) -> Result<Value, String> {
    match exec::next_id(pool, prefix).await {
        Ok(Some(id)) if !id.is_empty() => Ok(Value::String(id)),
        _ => Err(format!("Failed to generate {what} ID")),
    }
}

/// Inserts one variant row and its inventory row (inserts unchecked, as in
/// Node). `v` must not be null (Node reads `v.sku` and throws).
async fn insert_variant(pool: &MySqlPool, product_id: &Value, v: &Value) -> Result<(), String> {
    let vid = require_id(pool, "VAR", "product variant").await?;
    if v.is_null() {
        return Err("Cannot read properties of null (reading 'sku')".into());
    }
    let v = Some(v);
    let _ = write(
        pool,
        "INSERT INTO product_variants (id, product_id, sku, size, color, price_adjustment) VALUES (?, ?, ?, ?, ?, ?)",
        &[
            Some(vid.clone()),
            Some(product_id.clone()),
            prop(v, "sku"),
            prop(v, "size"),
            prop(v, "color"),
            Some(or(prop(v, "price_adjustment"), json!(0))),
        ],
    )
    .await;
    let inv_id = require_id(pool, "INV", "inventory").await?;
    let _ = write(
        pool,
        "INSERT INTO inventory (id, product_id, variant_id, quantity_available) VALUES (?, ?, ?, ?)",
        &[
            Some(inv_id),
            Some(product_id.clone()),
            Some(vid),
            Some(or(prop(v, "stock"), json!(0))),
        ],
    )
    .await;
    Ok(())
}

async fn create_product(
    pool: &MySqlPool,
    user_id: &str,
    body: &Value,
    name: Param,
    base_price: Param,
    category_id: Param,
) -> Result<Value, String> {
    let id = match exec::next_id(pool, "PROD").await? {
        Some(id) => Value::String(id),
        None => Value::Null,
    };
    let name = name.unwrap_or(Value::Null);
    let slug = field(body, "slug");
    let safe_slug = if truthy(slug.as_ref()) {
        slug.unwrap_or(Value::Null)
    } else {
        Value::String(slugify(&js_string(&name)))
    };
    let details = or(field(body, "product_details"), json!({}));
    write(
        pool,
        "INSERT INTO products (id, sku, name, slug, description, short_description, category_id, base_price, product_details, created_by, meta_title, meta_description, meta_keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        &[
            Some(id.clone()),
            Some(or_null(field(body, "sku"))),
            Some(name),
            Some(safe_slug),
            Some(or_null(field(body, "description"))),
            Some(or_null(field(body, "short_description"))),
            category_id,
            base_price,
            Some(Value::String(stringify(&details))),
            Some(Value::String(user_id.to_owned())),
            Some(or_null(field(body, "meta_title"))),
            Some(or_null(field(body, "meta_description"))),
            Some(or_null(field(body, "meta_keywords"))),
        ],
    )
    .await?;

    let stock = field(body, "stock");
    if truthy(stock.as_ref()) {
        let inv_id = require_id(pool, "INV", "inventory").await?;
        let _ = write(
            pool,
            "INSERT INTO inventory (id, product_id, quantity_available) VALUES (?, ?, ?)",
            &[Some(inv_id), Some(id.clone()), stock],
        )
        .await;
    }

    if let Some(Value::Array(variants)) = field(body, "variants") {
        for v in &variants {
            insert_variant(pool, &id, v).await?;
        }
    }
    Ok(id)
}

// --- PUT /products/:id ------------------------------------------------------

/// `SET col = ?, …` and the values, from `Object.entries(updates)` limited
/// to the allowed columns. `details_default` is bulk-update's `value || {}`.
fn product_updates(
    updates: &Value,
    skip_variants: bool,
    details_default: bool,
) -> (Vec<String>, Vec<Param>) {
    let mut fields = Vec::new();
    let mut values = Vec::new();
    for (key, value) in exec::entries(updates) {
        if skip_variants && key == "variants" {
            continue;
        }
        if !ALLOWED_PRODUCT_COLUMNS.contains(&key.as_str()) {
            continue;
        }
        fields.push(format!("{key} = ?"));
        if key == "product_details" {
            let value = if details_default {
                or(Some(value), json!({}))
            } else {
                value
            };
            values.push(Some(Value::String(stringify(&value))));
        } else {
            values.push(Some(value));
        }
    }
    (fields, values)
}

async fn update(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let id = req.param(0).to_owned();
    let body = &req.body;
    let variants = field(body, "variants");
    if let Some(v) = variants.as_ref().filter(|v| !v.is_null()) {
        let ok = match v {
            Value::Array(items) => items.iter().all(|item| {
                truthy(Some(item)) && (item.is_object() || item.is_array()) && {
                    let vid = prop(Some(item), "id");
                    !truthy(vid.as_ref()) || is_non_empty_string(vid.as_ref())
                }
            }),
            _ => false,
        };
        if !ok {
            return json(
                StatusCode::BAD_REQUEST,
                failure("variants must be objects with string ids"),
            );
        }
    }

    let (fields, mut values) = product_updates(body, true, false);
    if !fields.is_empty() {
        values.push(Some(Value::String(id.clone())));
        let sql = format!("UPDATE products SET {} WHERE id = ?", fields.join(", "));
        if let Err(e) = write(pool, &sql, &values).await {
            return server_error("admin product update", &e);
        }
    }

    if let Some(Value::Array(variants)) = variants {
        let product_id = Value::String(id.clone());
        for v in &variants {
            let vref = Some(v);
            let vid = prop(vref, "id");
            if truthy(vid.as_ref()) {
                let _ = write(
                    pool,
                    "UPDATE product_variants SET sku = ?, size = ?, color = ?, price_adjustment = ? WHERE id = ?",
                    &[
                        prop(vref, "sku"),
                        prop(vref, "size"),
                        prop(vref, "color"),
                        Some(or(prop(vref, "price_adjustment"), json!(0))),
                        vid.clone(),
                    ],
                )
                .await;
                if let Some(stock) = prop(vref, "stock") {
                    let _ = write(
                        pool,
                        "UPDATE inventory SET quantity_available = ? WHERE variant_id = ?",
                        &[Some(stock), vid],
                    )
                    .await;
                }
            } else if let Err(e) = insert_variant(pool, &product_id, v).await {
                return server_error("admin product update", &e);
            }
        }
    }

    json(
        StatusCode::OK,
        success("Product updated successfully", json!([])),
    )
}

// --- DELETE /products/:id ---------------------------------------------------

async fn remove(req: AdminRequest) -> Response {
    let id = Value::String(req.param(0).to_owned());
    match write(
        &req.state.pool,
        "DELETE FROM products WHERE id = ?",
        &[Some(id)],
    )
    .await
    {
        Ok(_) => json(
            StatusCode::OK,
            success("Product deleted successfully", json!([])),
        ),
        Err(e) => server_error("admin product delete", &e),
    }
}

// --- PUT /products/:id/status -------------------------------------------------

const ALLOWED_STATUSES: [&str; 4] = ["draft", "pending_approval", "approved", "rejected"];

async fn set_status(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let id = req.param(0).to_owned();
    let status = match field(&req.body, "status") {
        Some(Value::String(s)) if ALLOWED_STATUSES.contains(&s.as_str()) => s,
        _ => {
            return json(
                StatusCode::BAD_REQUEST,
                failure(&format!(
                    "Invalid status. Allowed: {}",
                    ALLOWED_STATUSES.join(", ")
                )),
            );
        }
    };
    let notes = field(&req.body, "notes");

    let current = match rows(
        pool,
        "SELECT approval_details FROM products WHERE id = ?",
        &[Some(Value::String(id.clone()))],
    )
    .await
    {
        Ok(rows) => rows,
        Err(e) => return server_error("admin product status", &e),
    };
    let Some(row) = current.first() else {
        return json(StatusCode::NOT_FOUND, failure("Product not found"));
    };

    // The JSON column as mysql2 parsed it; a string is JSON.parse'd again.
    let raw = row.get("approval_details");
    let details: Value = match raw {
        Some(v) if v.truthy() => match v {
            crate::mysql_json::Js::String(s) => serde_json::from_str::<Value>(s)
                .map_or_else(|_| json!({}), crate::express_router::js_json),
            other => other.to_json(),
        },
        _ => json!({}),
    };

    let mut history = match details.get("history") {
        Some(Value::Array(items)) if details.is_object() => items.clone(),
        _ => Vec::new(),
    };
    let changed_at = crate::express::now_iso();
    let notes = or(notes, json!(""));
    let user_id = req.user().id.clone();
    history.push(json!({
        "status": status,
        "notes": notes,
        "changed_by": user_id,
        "changed_at": changed_at,
    }));
    let mut approval = exec::spread(&details);
    approval.insert("status".into(), json!(status));
    approval.insert("notes".into(), notes);
    approval.insert("approved_by".into(), json!(user_id));
    approval.insert("approved_at".into(), json!(changed_at));
    approval.insert("history".into(), Value::Array(history));

    if let Err(e) = write(
        pool,
        "UPDATE products SET status = ?, approval_details = ?, updated_at = NOW() WHERE id = ?",
        &[
            Some(json!(status)),
            Some(Value::String(stringify(&Value::Object(approval)))),
            Some(Value::String(id.clone())),
        ],
    )
    .await
    {
        return server_error("admin product status", &e);
    }
    json(
        StatusCode::OK,
        success(
            "Product status updated",
            json!([{ "id": id, "status": status }]),
        ),
    )
}

// --- GET /categories ----------------------------------------------------------

async fn categories(req: AdminRequest) -> Response {
    match rows(
        &req.state.pool,
        "SELECT * FROM categories ORDER BY sort_order ASC, name ASC",
        &[],
    )
    .await
    {
        Ok(rows) => {
            let list: Vec<Value> = rows.iter().map(|r| Value::Object(r.to_json())).collect();
            json(
                StatusCode::OK,
                success(
                    "Categories fetched successfully",
                    json!([{ "categories": list }]),
                ),
            )
        }
        Err(e) => server_error("admin categories", &e),
    }
}

// --- GET /products ------------------------------------------------------------

const LIST_SQL: &str = "
      SELECT
        p.id as product_id, p.name, p.status, p.base_price, p.sku as product_sku, img.thumbnail_small_url as image_url, p.created_at,
        c.name as category_name,
        v.id as variant_id, v.sku as variant_sku, v.size, v.color, v.price_adjustment,
        i.quantity_available as stock_quantity
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_images img ON p.id = img.product_id AND img.is_primary = 1
      LEFT JOIN product_variants v ON p.id = v.product_id
      LEFT JOIN inventory i ON (p.id = i.product_id AND (i.variant_id = v.id OR (v.id IS NULL AND i.variant_id IS NULL)))
      ORDER BY p.created_at DESC, v.id ASC
    ";

async fn list(req: AdminRequest) -> Response {
    let data = match rows(&req.state.pool, LIST_SQL, &[]).await {
        Ok(rows) => rows,
        Err(e) => return server_error("admin products list", &e),
    };
    let products: Vec<Value> = data
        .iter()
        .map(|row| {
            let mut display = row
                .get("name")
                .map_or("undefined".into(), |n| n.js_string());
            let attributes: Vec<String> = ["size", "color"]
                .iter()
                .filter_map(|k| row.get(k).filter(|v| v.truthy()).map(|v| v.js_string()))
                .collect();
            if !attributes.is_empty() {
                display.push_str(&format!(" ({})", attributes.join(" / ")));
            }
            let adjustment = match row.get("price_adjustment") {
                Some(v) if v.truthy() => js_number(Some(v)),
                _ => 0.0,
            };
            let price = js_number(row.get("base_price")) + adjustment;
            let status = match row.get("status") {
                Some(crate::mysql_json::Js::String(s)) if s == "approved" => "Active",
                Some(crate::mysql_json::Js::String(s)) if s == "draft" => "Draft",
                _ => "Out of Stock",
            };
            json!({
                "id": js_or(row.get("variant_id"), js_json(row.get("product_id"))),
                "product_id": js_json(row.get("product_id")),
                "name": display,
                "sku": js_or(row.get("variant_sku"), js_json(row.get("product_sku"))),
                "category": js_or(row.get("category_name"), json!("Uncategorized")),
                "price": js_to_fixed(price, 2),
                "stock": js_or(row.get("stock_quantity"), json!(0)),
                "status": status,
                "image": js_json(row.get("image_url")),
            })
        })
        .collect();
    json(
        StatusCode::OK,
        success(
            "Products fetched successfully",
            json!([{ "products": products }]),
        ),
    )
}

// --- GET /products/:id ----------------------------------------------------------

async fn detail(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let id = Some(Value::String(req.param(0).to_owned()));
    let product = match rows(
        pool,
        "SELECT * FROM products WHERE id = ?",
        std::slice::from_ref(&id),
    )
    .await
    {
        Ok(rows) if !rows.is_empty() => rows.into_iter().next().unwrap_or_default(),
        _ => return json(StatusCode::NOT_FOUND, failure("Product not found")),
    };
    let variant_sql = "
      SELECT v.*, i.quantity_available as stock
      FROM product_variants v
      LEFT JOIN inventory i ON (v.id = i.variant_id)
      WHERE v.product_id = ?
    ";
    let variants = rows(pool, variant_sql, std::slice::from_ref(&id))
        .await
        .unwrap_or_default();
    let base_stock = match rows(
        pool,
        "SELECT quantity_available FROM inventory WHERE product_id = ? AND variant_id IS NULL",
        std::slice::from_ref(&id),
    )
    .await
    {
        Ok(rows) if !rows.is_empty() => js_json(rows[0].get("quantity_available")),
        _ => json!(0),
    };
    let base_price = js_number(product.get("base_price"));
    let variants: Vec<Value> = variants
        .iter()
        .map(|v| {
            let mut out = v.to_json();
            let price = base_price + js_number(v.get("price_adjustment"));
            out.insert("price".into(), json!(js_to_fixed(price, 2)));
            out.insert("stock".into(), js_or(v.get("stock"), json!(0)));
            Value::Object(out)
        })
        .collect();
    let mut out = product.to_json();
    out.insert("stock".into(), base_stock);
    out.insert("variants".into(), Value::Array(variants));
    json(
        StatusCode::OK,
        success("Product details fetched", json!([{ "product": out }])),
    )
}

// --- POST /products/:id/image -------------------------------------------------

/// Where `/uploads` is served from: backend/uploads (server.js's static
/// mount). `UPLOADS_DIR`, else `uploads` under the working directory (the
/// backend directory when run next to it).
pub fn uploads_root() -> PathBuf {
    common::env::var("UPLOADS_DIR").map_or_else(|| PathBuf::from("uploads"), PathBuf::from)
}

/// `path.basename(name)` (POSIX).
fn basename(name: &str) -> &str {
    let trimmed = name.trim_end_matches('/');
    trimmed.rsplit('/').next().unwrap_or("")
}

/// `timestamp-originalName`, sanitized like products.js's `filename`:
/// every UTF-16 unit outside `[a-zA-Z0-9_.-]` becomes `_`.
fn upload_filename(info: &FileInfo) -> String {
    let mut safe = String::new();
    for c in basename(&info.originalname).chars() {
        if c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-') {
            safe.push(c);
        } else {
            for _ in 0..c.len_utf16() {
                safe.push('_');
            }
        }
    }
    format!("{}-{safe}", chrono::Utc::now().timestamp_millis())
}

fn image_filter(info: &FileInfo) -> Result<bool, String> {
    const ALLOWED: [&str; 4] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if ALLOWED.contains(&info.mimetype.as_str()) {
        Ok(true)
    } else {
        Err("Invalid file type. Only images are allowed.".into())
    }
}

/// `req.protocol`: `X-Forwarded-Proto` (first entry) when the socket peer is
/// a trusted proxy (`TRUST_PROXY` ≥ 1 hop), else `http`.
fn protocol(req: &AdminRequest) -> String {
    if req.state.trust_proxy.0 == 0 {
        return "http".into();
    }
    let header = req
        .headers()
        .get_all("x-forwarded-proto")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .collect::<Vec<_>>()
        .join(", ");
    let header = if header.is_empty() {
        "http".to_owned()
    } else {
        header
    };
    match header.find(',') {
        Some(i) => crate::express::js_trim(&header[..i]).to_owned(),
        None => crate::express::js_trim(&header).to_owned(),
    }
}

fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

async fn upload_image(mut req: AdminRequest) -> Response {
    let product_id = req.param(0).to_owned();
    if !is_safe_id(&product_id) {
        return json(StatusCode::BAD_REQUEST, failure("Invalid product id"));
    }
    match sqlx::query_scalar!("SELECT id FROM products WHERE id = ? LIMIT 1", product_id)
        .fetch_optional(&req.state.pool)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => return json(StatusCode::NOT_FOUND, failure("Product not found")),
        Err(e) => return server_error("admin product image", &e.to_string()),
    }

    let dest = uploads_root().join("products").join(&product_id);
    // ensureDirSync: errors ignored.
    let _ = std::fs::create_dir_all(&dest);
    let multer = Multer {
        storage: Storage::Disk(DiskStorage {
            destination: dest,
            filename: Arc::new(upload_filename),
        }),
        limits: Limits {
            file_size: Some(5 * 1024 * 1024),
            ..Limits::NONE
        },
        file_filter: Some(image_filter),
    };
    let file = match req.multer_single(&multer, "image").await {
        Ok(file) => file,
        Err(err) => {
            return json(
                StatusCode::BAD_REQUEST,
                failure_with("Upload failed", json!({ "error": err.message() })),
            );
        }
    };
    let Some(file) = file else {
        return json(
            StatusCode::BAD_REQUEST,
            failure("No file uploaded. Expect field name \"image\""),
        );
    };
    let filename = file.filename.unwrap_or_default();
    let host = req.headers().get(header::HOST).map_or_else(
        || "undefined".to_owned(),
        |h| String::from_utf8_lossy(h.as_bytes()).into_owned(),
    );
    let public_url = format!(
        "{}://{host}/uploads/products/{product_id}/{}",
        protocol(&req),
        encode_uri_component(&filename)
    );
    if let Err(e) = write(
        &req.state.pool,
        "UPDATE products SET thumbnail_small_url = ?, updated_at = NOW() WHERE id = ?",
        &[Some(json!(public_url)), Some(json!(product_id))],
    )
    .await
    {
        return json(
            StatusCode::INTERNAL_SERVER_ERROR,
            failure_with("Failed to update product image", json!({ "error": e })),
        );
    }
    json(
        StatusCode::OK,
        success(
            "Image uploaded and product updated",
            json!([{ "url": public_url }, { "field": "thumbnail_small_url" }]),
        ),
    )
}

/// `encodeURIComponent` (the upload filename is already `[A-Za-z0-9_.-]`).
pub fn encode_uri_component(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

// --- POST /products/bulk-update -------------------------------------------------

async fn bulk_update(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let ids = field(&req.body, "productIds");
    if !is_string_list(ids.as_ref()) {
        return json(
            StatusCode::BAD_REQUEST,
            failure("productIds must be a non-empty array"),
        );
    }
    let updates = match field(&req.body, "updates") {
        Some(u @ Value::Object(_)) => u,
        _ => {
            return json(
                StatusCode::BAD_REQUEST,
                failure("updates object is required"),
            );
        }
    };
    let (fields, values) = product_updates(&updates, false, true);
    if fields.is_empty() {
        return json(
            StatusCode::BAD_REQUEST,
            failure("No valid fields to update"),
        );
    }
    let sql = format!("UPDATE products SET {} WHERE id = ?", fields.join(", "));
    let mut updated = 0u64;
    for id in ids.as_ref().and_then(Value::as_array).into_iter().flatten() {
        let mut params = values.clone();
        params.push(Some(id.clone()));
        if matches!(write(pool, &sql, &params).await, Ok(n) if n > 0) {
            updated += 1;
        }
    }
    json(
        StatusCode::OK,
        success(
            "Products updated successfully",
            json!([{ "result": { "updated": updated } }]),
        ),
    )
}

// --- POST /products/bulk-delete -------------------------------------------------

async fn bulk_delete(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let ids = field(&req.body, "productIds");
    if !is_string_list(ids.as_ref()) {
        return json(
            StatusCode::BAD_REQUEST,
            failure("productIds must be a non-empty array"),
        );
    }
    let mut deleted = 0u64;
    for id in ids.as_ref().and_then(Value::as_array).into_iter().flatten() {
        let param = [Some(id.clone())];
        let count = rows(
            pool,
            "SELECT COUNT(*) AS cnt FROM order_items WHERE product_id = ?",
            &param,
        )
        .await
        .ok()
        .and_then(|rows| rows.into_iter().next())
        .map_or(f64::NAN, |row| js_number(row.get("cnt")));
        let result = if count > 0.0 {
            write(
                pool,
                "UPDATE products SET status = 'discontinued', updated_at = NOW() WHERE id = ?",
                &param,
            )
            .await
        } else {
            write(pool, "DELETE FROM products WHERE id = ?", &param).await
        };
        if matches!(result, Ok(n) if n > 0) {
            deleted += 1;
        }
    }
    json(
        StatusCode::OK,
        success(
            "Products deleted successfully",
            json!([{ "result": { "deleted": deleted } }]),
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_like_products_js() {
        assert_eq!(slugify("  Silk Sheet Set!  "), "silk-sheet-set");
        assert_eq!(slugify("Été — 2024"), "t-2024");
        assert_eq!(slugify("---"), "");
        assert_eq!(slugify("5"), "5");
    }

    #[test]
    fn upload_names() {
        assert_eq!(basename("a/b.png"), "b.png");
        assert_eq!(basename("dir/"), "dir");
        assert_eq!(basename("///"), "");
        let info = |name: &str| FileInfo {
            fieldname: "image".into(),
            originalname: name.into(),
            encoding: "7bit".into(),
            mimetype: "image/png".into(),
        };
        let name = upload_filename(&info("my photo😀.png"));
        let (ts, rest) = name.split_once('-').unwrap();
        assert!(ts.bytes().all(|b| b.is_ascii_digit()));
        assert_eq!(rest, "my_photo__.png");
        assert!(image_filter(&info("x")).is_ok());
        assert!(is_safe_id("PROD0000000001"));
        assert!(!is_safe_id("a.b"));
        assert_eq!(encode_uri_component("1-a_b.png"), "1-a_b.png");
    }

    #[test]
    fn update_columns_follow_the_allowlist() {
        let body = json!({ "name": "N", "variants": [], "id": "x", "product_details": null, "sale_price": 3 });
        let (fields, values) = product_updates(&body, true, false);
        assert_eq!(
            fields,
            ["name = ?", "product_details = ?", "sale_price = ?"]
        );
        assert_eq!(values[1], Some(json!("null")));
        let (_, values) = product_updates(&body, false, true);
        assert_eq!(values[1], Some(json!("{}")));
        assert!(product_updates(&json!(["name"]), true, false).0.is_empty());
    }
}
