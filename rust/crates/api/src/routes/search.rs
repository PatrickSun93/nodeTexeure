//! `GET /api/search/{autocomplete,suggestions,recent}` — port of
//! backend/routes/searchRoutes.js (header search box).

use axum::Json;
use axum::extract::{Query, State};
use common::response::success;
use serde::Serialize;
use serde_json::{Value, json};

use crate::AppState;
use crate::error::ApiError;
use crate::params::{self, Pairs};

/// Compact product card used by the search dropdown.
#[derive(Debug, Serialize)]
pub struct SearchProduct {
    pub id: String,
    pub name: String,
    pub slug: String,
    /// DECIMAL as a string, like mysql2.
    pub price: String,
    pub image: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchCategory {
    pub id: String,
    pub name: String,
}

/// Curated starter terms shown before the user types.
const POPULAR_TERMS: [&str; 6] = [
    "silk sheets",
    "cashmere blanket",
    "queen size",
    "king size",
    "luxury bedding",
    "organic cotton",
];

/// `GET /api/search/autocomplete?q=` — up to 10 products ranked by where the
/// term matches, plus matching categories that have approved products.
pub async fn autocomplete(
    State(state): State<AppState>,
    Query(pairs): Query<Pairs>,
) -> Result<Json<Value>, ApiError> {
    let term = params::first(&pairs, "q").map(str::trim).unwrap_or("");
    // JS `.length` counts UTF-16 units; same as chars for the BMP text users type.
    if term.encode_utf16().count() < 2 {
        return Ok(Json(success(
            "Autocomplete results",
            json!({ "suggestions": [], "products": [], "categories": [] }),
        )));
    }
    let starts_with = format!("{term}%");
    let contains = format!("%{term}%");

    let products = sqlx::query_as!(
        SearchProduct,
        r#"SELECT id, name, slug, CAST(base_price AS CHAR) AS "price!: String",
             (SELECT pi.thumbnail_small_url FROM product_images pi
               WHERE pi.product_id = products.id
               ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS "image: String"
           FROM products
           WHERE status = 'approved'
             AND (name LIKE ? OR description LIKE ? OR short_description LIKE ?
                  OR JSON_UNQUOTE(JSON_EXTRACT(product_details, '$.material')) LIKE ?)
           ORDER BY CASE
                      WHEN name LIKE ? THEN 100
                      WHEN name LIKE ? THEN 90
                      WHEN name LIKE ? THEN 80
                      WHEN description LIKE ? THEN 50
                      ELSE 30
                    END DESC, name ASC, id ASC
           LIMIT 10"#,
        contains,
        contains,
        contains,
        contains,
        term,
        starts_with,
        contains,
        contains,
    )
    .fetch_all(&state.pool)
    .await?;

    let categories = sqlx::query_as!(
        SearchCategory,
        r#"SELECT DISTINCT c.id, c.name
           FROM categories c
           JOIN products p ON p.category_id = c.id AND p.status = 'approved'
           WHERE c.is_active = 1 AND c.name LIKE ?
           ORDER BY c.name ASC, c.id ASC
           LIMIT 5"#,
        contains
    )
    .fetch_all(&state.pool)
    .await?;

    let suggestions: Vec<&str> = products.iter().take(5).map(|p| p.name.as_str()).collect();
    Ok(Json(success(
        "Autocomplete results",
        json!({ "query": term, "suggestions": suggestions, "products": products, "categories": categories }),
    )))
}

/// `GET /api/search/suggestions` — starter terms and the six newest products.
pub async fn suggestions(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let trending = sqlx::query_as!(
        SearchProduct,
        r#"SELECT id, name, slug, CAST(base_price AS CHAR) AS "price!: String",
             (SELECT pi.thumbnail_small_url FROM product_images pi
               WHERE pi.product_id = products.id
               ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS "image: String"
           FROM products
           WHERE status = 'approved'
           ORDER BY created_at DESC, id ASC
           LIMIT 6"#
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(success(
        "Search suggestions",
        json!({ "popularTerms": POPULAR_TERMS, "trending": trending }),
    )))
}

/// `GET /api/search/recent?ids=PROD...,PROD...` — recently viewed products
/// (ids kept client-side), approved only, in the order given, max 10.
pub async fn recent(
    State(state): State<AppState>,
    Query(pairs): Query<Pairs>,
) -> Result<Json<Value>, ApiError> {
    let mut ids: Vec<&str> = Vec::new();
    for id in params::first(&pairs, "ids")
        .unwrap_or("")
        .split(',')
        .map(str::trim)
    {
        if params::is_product_id(id) && !ids.contains(&id) {
            ids.push(id);
        }
    }
    ids.truncate(10);
    if ids.is_empty() {
        return Ok(Json(success("Recent products", json!({ "products": [] }))));
    }

    let mut products = sqlx::query_as!(
        SearchProduct,
        r#"SELECT id, name, slug, CAST(base_price AS CHAR) AS "price!: String",
             (SELECT pi.thumbnail_small_url FROM product_images pi
               WHERE pi.product_id = products.id
               ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS "image: String"
           FROM products
           WHERE FIND_IN_SET(id, ?) > 0 AND status = 'approved'"#,
        ids.join(",")
    )
    .fetch_all(&state.pool)
    .await?;
    products.sort_by_key(|p| ids.iter().position(|id| *id == p.id));
    Ok(Json(success(
        "Recent products",
        json!({ "products": products }),
    )))
}
