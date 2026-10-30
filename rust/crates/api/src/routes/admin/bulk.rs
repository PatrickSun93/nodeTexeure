//! Mount `/api/admin/bulk` (behind `protect, admin`):
//! backend/routes/bulkOperationsRoutes.js — the product CSV template, CSV
//! validate / upload (`upload.single('file')`: memory storage, 5 MB, CSV
//! only — see [`crate::multer`]) and the orders / products / customers CSV
//! exports ([`crate::csv`], byte for byte what csvExporter.js writes, with
//! `res.send`'s headers).
//!
//! Every route repeats `protect, admin` after the mount's (Node re-reads the
//! user twice); only the upload checks CSRF, before multer reads the body.

use axum::http::StatusCode;
use axum::response::Response;
use common::response::{failure, failure_with, success};
use serde_json::{Value, json};

use crate::admin::{AdminRequest, Routes, Step::*, json};
use crate::body::is_optional_string;
use crate::csv::{self, Exporter};
use crate::multer::{FileInfo, Limits, Multer, Storage};
use crate::mysql_json;

pub fn register(r: &mut Routes) {
    r.get("/products/template", &[Protect, Admin], template);
    // router.post('/products/validate', protect, admin, upload.single('file'), handler)
    r.post("/products/validate", &[Protect, Admin], validate);
    // router.post('/products/upload', protect, admin, csrfProtection, upload.single('file'), handler)
    r.post("/products/upload", &[Protect, Admin, Csrf], upload);
    r.get("/orders/export", &[Protect, Admin], export_orders);
    r.get("/products/export", &[Protect, Admin], export_products);
    r.get("/customers/export", &[Protect, Admin], export_customers);
}

/// `file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')`.
fn csv_only(file: &FileInfo) -> Result<bool, String> {
    if file.mimetype == "text/csv" || file.originalname.ends_with(".csv") {
        Ok(true)
    } else {
        Err("Only CSV files are allowed".into())
    }
}

/// `multer({ storage: memoryStorage(), limits: { fileSize: 5MB }, fileFilter })`.
const UPLOAD: Multer = Multer {
    storage: Storage::Memory,
    limits: Limits {
        file_size: Some(5 * 1024 * 1024),
        ..Limits::NONE
    },
    file_filter: Some(csv_only),
};

/// The JavaScript TypeError an export hits when its query failed
/// (`CSVExporter.exportX(result.data)` with `data` undefined).
const NO_ROWS: &str = "Cannot read properties of undefined (reading 'map')";

fn export_failed(message: &str) -> Response {
    json(
        StatusCode::INTERNAL_SERVER_ERROR,
        failure_with("Export failed", json!({ "error": message })),
    )
}

/// `GET /api/admin/bulk/products/template`
async fn template(req: AdminRequest) -> Response {
    csv::download(
        "product_template",
        csv::product_template(),
        req.method(),
        req.headers(),
    )
}

/// `upload.single('file')` then the CSV text (`req.file.buffer.toString('utf-8')`);
/// `Err` is the response (multer's error → the error handler's 500, no file → 400).
async fn csv_text(req: &mut AdminRequest) -> Result<String, Response> {
    let file = req
        .multer_single(&UPLOAD, "file")
        .await
        .map_err(|err| err.into_response())?;
    let Some(file) = file else {
        return Err(json(StatusCode::BAD_REQUEST, failure("No file uploaded")));
    };
    Ok(String::from_utf8_lossy(file.buffer.as_deref().unwrap_or_default()).into_owned())
}

/// `POST /api/admin/bulk/products/validate` (multipart `file`)
async fn validate(mut req: AdminRequest) -> Response {
    let text = match csv_text(&mut req).await {
        Ok(text) => text,
        Err(response) => return response,
    };
    let parsed = csv::parse(&text);
    let v = csv::validate_products(&parsed.data);
    let preview: Vec<Value> = v.data.iter().take(5).map(|r| r.to_json()).collect();
    json(
        StatusCode::OK,
        success(
            "Validation complete",
            json!({
                "valid": v.valid,
                "totalRows": v.total_rows,
                "validRows": v.valid_rows,
                "errorCount": v.errors.len(),
                "warningCount": v.warnings.len(),
                "errors": v.errors,
                "warnings": v.warnings,
                "preview": preview,
            }),
        ),
    )
}

/// One row's `get_next_id` + INSERT; `Err` is the error message Node records.
async fn insert_product(
    pool: &sqlx::MySqlPool,
    user_id: &str,
    product: &csv::ProductRow,
) -> Result<(), String> {
    // `idResult.data[0].id` on a failed query is a TypeError.
    let id = sqlx::query_scalar!(r#"SELECT get_next_id('PROD') AS "id: String""#)
        .fetch_one(pool)
        .await
        .map_err(|err| {
            tracing::error!(error = %err, "bulk upload: get_next_id failed");
            "Cannot read properties of undefined (reading '0')".to_owned()
        })?;
    // Bound as mysql2 binds the JS values: numbers DOUBLE, the boolean TINY.
    sqlx::query(
        "
                    INSERT INTO products (
                        id, sku, name, slug, short_description, description,
                        category_name, base_price, sale_price, cost_price,
                        stock_quantity, low_stock_threshold, status, is_featured,
                        meta_title, meta_description, product_details,
                        created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ",
    )
    .bind(id)
    .bind(&product.sku)
    .bind(&product.name)
    .bind(&product.slug)
    .bind(&product.short_description)
    .bind(&product.description)
    .bind(&product.category_name)
    .bind(product.base_price)
    .bind(product.sale_price)
    .bind(product.cost_price)
    .bind(product.stock_quantity)
    .bind(product.low_stock_threshold)
    .bind(&product.status)
    .bind(i8::from(product.is_featured))
    .bind(&product.meta_title)
    .bind(&product.meta_description)
    .bind(product.product_details_json())
    .bind(user_id)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|err| mysql_json::error_message(&err))
}

/// `POST /api/admin/bulk/products/upload` (multipart `file`): validate, then
/// insert row by row, counting what failed.
async fn upload(mut req: AdminRequest) -> Response {
    let text = match csv_text(&mut req).await {
        Ok(text) => text,
        Err(response) => return response,
    };
    let parsed = csv::parse(&text);
    let v = csv::validate_products(&parsed.data);
    if !v.valid {
        return json(
            StatusCode::BAD_REQUEST,
            failure_with(
                "Validation failed",
                json!({ "errors": v.errors, "warnings": v.warnings }),
            ),
        );
    }
    let pool = req.state.pool.clone();
    let user_id = req.user().id.clone();
    let mut successful = 0u64;
    let mut failed = 0u64;
    let mut errors = Vec::new();
    for row in &v.data {
        let product = csv::transform_product_row(&row.row);
        match insert_product(&pool, &user_id, &product).await {
            Ok(()) => successful += 1,
            Err(message) => {
                failed += 1;
                errors.push(json!({
                    "row": row.row_number,
                    "sku": row.row.get("sku"),
                    "error": message,
                }));
            }
        }
    }
    json(
        StatusCode::CREATED,
        success(
            "Bulk upload complete",
            json!({
                "total": v.valid_rows,
                "successful": successful,
                "failed": failed,
                "errors": errors,
            }),
        ),
    )
}

/// The `?status[]=a` / `?status[a]=b` guard: single values only (`None`
/// when one isn't); the truthy ones, in order.
fn single_values(req: &AdminRequest, keys: &[&str]) -> Option<Vec<Option<String>>> {
    let query = req.query();
    if !keys.iter().all(|k| is_optional_string(query.get(*k))) {
        return None;
    }
    Some(
        keys.iter()
            .map(|k| match query.get(*k) {
                Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
                _ => None,
            })
            .collect(),
    )
}

fn not_single() -> Response {
    json(
        StatusCode::BAD_REQUEST,
        failure("Filters must be single values"),
    )
}

/// `GET /api/admin/bulk/orders/export?start_date=&end_date=&status=`
async fn export_orders(req: AdminRequest) -> Response {
    let Some(filters) = single_values(&req, &["start_date", "end_date", "status"]) else {
        return not_single();
    };
    // `o.total_amount AS total`: orders has no `total` column; exportOrders
    // reads `order.total` (it was "NaN" in every row).
    let mut sql = "
            SELECT
                o.*,
                o.total_amount AS total,
                u.email as user_email
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE 1=1
        "
    .to_owned();
    let mut params = Vec::new();
    for (value, clause) in filters.into_iter().zip([
        " AND o.created_at >= ?",
        " AND o.created_at <= ?",
        " AND o.status = ?",
    ]) {
        if let Some(v) = value {
            sql.push_str(clause);
            params.push(Value::String(v));
        }
    }
    sql.push_str(" ORDER BY o.created_at DESC");
    match mysql_json::fetch_rows(&req.state.pool, &sql, &params).await {
        Ok(rows) => csv::download(
            "orders",
            Exporter::export_orders(&rows),
            req.method(),
            req.headers(),
        ),
        Err(err) => {
            tracing::error!(error = %err, "Error exporting orders");
            export_failed(NO_ROWS)
        }
    }
}

/// `GET /api/admin/bulk/products/export?category=&status=`
async fn export_products(req: AdminRequest) -> Response {
    let Some(filters) = single_values(&req, &["category", "status"]) else {
        return not_single();
    };
    let mut sql = "SELECT * FROM products WHERE 1=1".to_owned();
    let mut params = Vec::new();
    for (value, clause) in filters
        .into_iter()
        .zip([" AND category_name = ?", " AND status = ?"])
    {
        if let Some(v) = value {
            sql.push_str(clause);
            params.push(Value::String(v));
        }
    }
    sql.push_str(" ORDER BY created_at DESC");
    match mysql_json::fetch_rows(&req.state.pool, &sql, &params).await {
        Ok(rows) => csv::download(
            "products",
            Exporter::export_products(&rows),
            req.method(),
            req.headers(),
        ),
        Err(err) => {
            tracing::error!(error = %err, "Error exporting products");
            export_failed(NO_ROWS)
        }
    }
}

/// `GET /api/admin/bulk/customers/export`
async fn export_customers(req: AdminRequest) -> Response {
    // `o.total_amount`: orders has no `total` column (the query always failed).
    let sql = "
            SELECT
                u.*,
                COUNT(o.id) as total_orders,
                SUM(CASE WHEN o.status NOT IN ('cancelled', 'refunded') THEN o.total_amount ELSE 0 END) as lifetime_value
            FROM users u
            LEFT JOIN orders o ON u.id = o.user_id
            WHERE u.role = 'customer'
            GROUP BY u.id
            ORDER BY u.created_at DESC
        ";
    match mysql_json::fetch_rows(&req.state.pool, sql, &[]).await {
        Ok(rows) => csv::download(
            "customers",
            Exporter::export_customers(&rows),
            req.method(),
            req.headers(),
        ),
        Err(err) => {
            tracing::error!(error = %err, "Error exporting customers");
            export_failed(NO_ROWS)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info(mimetype: &str, originalname: &str) -> FileInfo {
        FileInfo {
            fieldname: "file".into(),
            originalname: originalname.into(),
            encoding: "7bit".into(),
            mimetype: mimetype.into(),
        }
    }

    #[test]
    fn only_csv_files_pass_the_filter() {
        assert_eq!(csv_only(&info("text/csv", "a.txt")), Ok(true));
        assert_eq!(csv_only(&info("text/plain", "a.csv")), Ok(true));
        assert_eq!(
            csv_only(&info("text/plain", "a.CSV")),
            Err("Only CSV files are allowed".into())
        );
    }
}
