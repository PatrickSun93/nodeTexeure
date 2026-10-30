//! Public catalogue: `GET /api/products`, `/api/products/by-ids`,
//! `/api/products/{id}` — the Rust port of backend/routes/productRoutes.js.
//!
//! Responses match the Node routes field for field (backend/tests/parity.test.js
//! compares the two). Every query is a static `query_as!`, checked against the
//! schema at compile time; optional filters use `(? IS NULL OR ...)` rather than
//! string-built SQL so that stays true.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use common::response::{failure, success};
use serde::Serialize;
use serde_json::{Value, json};

use crate::AppState;
use crate::error::ApiError;
use crate::params::{self, Pairs};

/// A product as listed publicly. Back-office columns (`approval_details`,
/// `created_by`) are deliberately absent.
#[derive(Debug, Serialize)]
pub struct Product {
    pub id: String,
    pub sku: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub short_description: Option<String>,
    pub category_id: String,
    /// DECIMAL as a string ("69.99"), like mysql2.
    pub base_price: String,
    pub product_details: Value,
    pub status: Option<String>,
    pub meta_title: Option<String>,
    pub meta_description: Option<String>,
    pub meta_keywords: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub updated_at: Option<DateTime<Utc>>,
    /// Listing image: the primary product image, else the first by sort order.
    pub image: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Variant {
    pub id: String,
    pub product_id: String,
    pub sku: String,
    pub size: Option<String>,
    pub color: Option<String>,
    pub pattern: Option<String>,
    pub price_adjustment: Option<String>,
    pub weight_adjustment: Option<String>,
    pub is_active: Option<i8>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct Image {
    pub id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    pub original_url: String,
    pub thumbnail_small_url: Option<String>,
    pub thumbnail_medium_url: Option<String>,
    pub thumbnail_large_url: Option<String>,
    pub alt_text: Option<String>,
    pub sort_order: Option<i32>,
    pub is_primary: Option<i8>,
    pub file_size: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Option<DateTime<Utc>>,
}

/// Approved review, without reviewer/moderator ids (feeds the product rating).
#[derive(Debug, Serialize)]
pub struct Review {
    pub id: String,
    pub product_id: String,
    pub rating: u8,
    pub review_details: Value,
    pub is_verified_purchase: Option<i8>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Option<DateTime<Utc>>,
}

/// `GET /api/products` — paginated, filterable, localized listing.
pub async fn list(
    State(state): State<AppState>,
    Query(pairs): Query<Pairs>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let locale = params::locale(&pairs, &headers);
    let limit = params::clamp_int(params::first(&pairs, "limit"), 10, 100);
    let page = params::clamp_int(params::first(&pairs, "page"), 1, i64::MAX);
    let offset = (page - 1).saturating_mul(limit);

    let category = params::first(&pairs, "category");
    let min_price = params::first(&pairs, "min_price");
    let max_price = params::first(&pairs, "max_price");
    let materials = params::materials(&pairs);
    let materials = (!materials.is_empty()).then(|| materials.join(","));
    let search = params::first(&pairs, "search").map(|s| format!("%{s}%"));

    let products = sqlx::query_as!(
        Product,
        r#"SELECT p.id, p.sku,
             COALESCE(pt.name, p.name) AS "name!: String", p.slug,
             COALESCE(pt.description, p.description) AS description,
             COALESCE(pt.short_description, p.short_description) AS "short_description: String",
             p.category_id, CAST(p.base_price AS CHAR) AS "base_price!: String",
             p.product_details, p.status, p.meta_title, p.meta_description, p.meta_keywords,
             p.created_at, p.updated_at,
             (SELECT COALESCE(pi.thumbnail_medium_url, pi.original_url) FROM product_images pi
               WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS "image: String"
           FROM products p
           LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
           WHERE p.status = 'approved'
             AND (? IS NULL OR p.category_id = ?)
             AND (? IS NULL OR p.base_price >= ?)
             AND (? IS NULL OR p.base_price <= ?)
             AND (? IS NULL OR FIND_IN_SET(JSON_UNQUOTE(JSON_EXTRACT(p.product_details, '$.material')), ?) > 0)
             AND (? IS NULL OR p.name LIKE ? OR p.description LIKE ? OR p.short_description LIKE ?
                  OR EXISTS (SELECT 1 FROM product_translations pts
                             WHERE pts.product_id = p.id AND pts.locale = ?
                               AND (pts.name LIKE ? OR pts.description LIKE ?)))
           ORDER BY p.created_at DESC, p.id ASC
           LIMIT ? OFFSET ?"#,
        locale,
        category, category,
        min_price, min_price,
        max_price, max_price,
        materials, materials,
        search, search, search, search, locale, search, search,
        limit, offset,
    )
    .fetch_all(&state.pool)
    .await?;

    let total = sqlx::query_scalar!(
        r#"SELECT COUNT(*) AS "total!: i64" FROM products p
           WHERE p.status = 'approved'
             AND (? IS NULL OR p.category_id = ?)
             AND (? IS NULL OR p.base_price >= ?)
             AND (? IS NULL OR p.base_price <= ?)
             AND (? IS NULL OR FIND_IN_SET(JSON_UNQUOTE(JSON_EXTRACT(p.product_details, '$.material')), ?) > 0)
             AND (? IS NULL OR p.name LIKE ? OR p.description LIKE ? OR p.short_description LIKE ?
                  OR EXISTS (SELECT 1 FROM product_translations pts
                             WHERE pts.product_id = p.id AND pts.locale = ?
                               AND (pts.name LIKE ? OR pts.description LIKE ?)))"#,
        category, category,
        min_price, min_price,
        max_price, max_price,
        materials, materials,
        search, search, search, search, locale, search, search,
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(success(
        "Products fetched successfully",
        json!({ "products": products, "total": total, "page": page, "limit": limit }),
    )))
}

/// `GET /api/products/by-ids?ids=PROD...,PROD...` — approved products in the
/// order requested (used by curated lists such as New Arrivals). Not localized,
/// like the Node route.
pub async fn by_ids(
    State(state): State<AppState>,
    Query(pairs): Query<Pairs>,
) -> Result<Response, ApiError> {
    let ids: Vec<&str> = pairs
        .iter()
        .filter(|(k, _)| k == "ids" || k == "ids[]")
        .flat_map(|(_, v)| v.split(','))
        .map(str::trim)
        .filter(|id| is_product_id(id))
        .collect();
    if ids.is_empty() {
        let body =
            failure("Parameter \"ids\" is required and must contain at least one product id");
        return Ok((StatusCode::BAD_REQUEST, Json(body)).into_response());
    }
    if ids.len() > 100 {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(failure("Too many ids provided (max 100)")),
        )
            .into_response());
    }

    let mut products = sqlx::query_as!(
        Product,
        r#"SELECT p.id, p.sku, p.name, p.slug, p.description,
             p.short_description AS "short_description: String",
             p.category_id, CAST(p.base_price AS CHAR) AS "base_price!: String",
             p.product_details, p.status, p.meta_title, p.meta_description, p.meta_keywords,
             p.created_at, p.updated_at,
             (SELECT COALESCE(pi.thumbnail_medium_url, pi.original_url) FROM product_images pi
               WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS "image: String"
           FROM products p
           WHERE FIND_IN_SET(p.id, ?) > 0 AND p.status = 'approved'"#,
        ids.join(","),
    )
    .fetch_all(&state.pool)
    .await?;
    // Requested order (first occurrence wins), like ORDER BY FIELD(id, ...).
    products.sort_by_key(|p| ids.iter().position(|id| *id == p.id));

    let total = products.len();
    Ok(Json(success(
        "Products fetched by IDs successfully",
        json!({ "products": products, "total": total }),
    ))
    .into_response())
}

/// Custom product ids look like `PROD0000000001`.
fn is_product_id(s: &str) -> bool {
    s.len() == 14 && s.starts_with("PROD") && s[4..].bytes().all(|b| b.is_ascii_digit())
}

/// `GET /api/products/{id}` — one approved product by id or slug, localized,
/// with variants, images and approved reviews.
pub async fn detail(
    State(state): State<AppState>,
    Path(param): Path<String>,
    Query(pairs): Query<Pairs>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let locale = params::locale(&pairs, &headers);
    let product = sqlx::query_as!(
        Product,
        r#"SELECT p.id, p.sku,
             COALESCE(pt.name, p.name) AS "name!: String", p.slug,
             COALESCE(pt.description, p.description) AS description,
             COALESCE(pt.short_description, p.short_description) AS "short_description: String",
             p.category_id, CAST(p.base_price AS CHAR) AS "base_price!: String",
             p.product_details, p.status, p.meta_title, p.meta_description, p.meta_keywords,
             p.created_at, p.updated_at,
             NULL AS "image: String"
           FROM products p
           LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
           WHERE (p.id = ? OR p.slug = ?) AND p.status = 'approved'
           LIMIT 1"#,
        locale,
        param,
        param,
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(product) = product else {
        return Ok((StatusCode::NOT_FOUND, Json(failure("Product not found"))).into_response());
    };

    let variants = sqlx::query_as!(
        Variant,
        r#"SELECT id, product_id, sku, size, color, pattern,
             CAST(price_adjustment AS CHAR) AS "price_adjustment: String",
             CAST(weight_adjustment AS CHAR) AS "weight_adjustment: String",
             is_active AS "is_active: i8", created_at, updated_at
           FROM product_variants WHERE product_id = ?"#,
        product.id
    )
    .fetch_all(&state.pool)
    .await?;

    let images = sqlx::query_as!(
        Image,
        r#"SELECT id, product_id, variant_id, original_url, thumbnail_small_url, thumbnail_medium_url,
             thumbnail_large_url, alt_text, sort_order, is_primary AS "is_primary: i8",
             file_size, width, height, created_at
           FROM product_images WHERE product_id = ? ORDER BY sort_order"#,
        product.id
    )
    .fetch_all(&state.pool)
    .await?;

    let reviews = sqlx::query_as!(
        Review,
        r#"SELECT id, product_id, rating, review_details,
             is_verified_purchase AS "is_verified_purchase: i8", created_at
           FROM product_reviews WHERE product_id = ? AND is_approved = 1
           ORDER BY created_at DESC"#,
        product.id
    )
    .fetch_all(&state.pool)
    .await?;

    // The Node route spreads the product and adds the collections; it has no
    // listing `image` field on the detail payload.
    let mut body = serde_json::to_value(&product)?;
    if let Value::Object(map) = &mut body {
        map.remove("image");
        map.insert("variants".into(), serde_json::to_value(variants)?);
        map.insert("images".into(), serde_json::to_value(images)?);
        map.insert("reviews".into(), serde_json::to_value(reviews)?);
    }
    Ok(Json(success("Product fetched successfully", body)).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_ids_are_prefixed_and_ten_digits() {
        assert!(is_product_id("PROD0000000001"));
        assert!(!is_product_id("PROD000000001"));
        assert!(!is_product_id("prod0000000001"));
        assert!(!is_product_id("PROD000000000x"));
        assert!(!is_product_id("1"));
    }
}
