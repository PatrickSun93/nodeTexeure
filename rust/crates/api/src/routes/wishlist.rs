//! `/api/wishlist` — the signed-in customer's wishlist (port of
//! backend/routes/wishlistRoutes.js). Every route requires [`AuthUser`].

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use common::json::js_number;
use common::response::{failure, success};
use serde::Serialize;
use serde_json::{Value, json};

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::ApiError;

#[derive(Debug, Serialize)]
pub struct WishlistItem {
    pub id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Option<DateTime<Utc>>,
    pub name: String,
    pub base_price: String,
    pub slug: String,
    pub short_description: Option<String>,
    pub status: Option<String>,
    pub image_url: Option<String>,
    pub variant_size: Option<String>,
    pub variant_color: Option<String>,
    pub variant_price_adjustment: Option<String>,
    /// base + variant adjustment, as a JS number.
    pub price: Value,
}

/// `GET /api/wishlist`
pub async fn list(State(state): State<AppState>, user: AuthUser) -> Result<Json<Value>, ApiError> {
    let rows = sqlx::query!(
        r#"SELECT w.id, w.product_id, w.variant_id, w.created_at,
             p.name, CAST(p.base_price AS CHAR) AS "base_price!: String", p.slug,
             p.short_description AS "short_description: String", p.status,
             (SELECT pi.thumbnail_medium_url FROM product_images pi WHERE pi.product_id = p.id
               ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS "image_url: String",
             pv.size AS "variant_size: String", pv.color AS "variant_color: String",
             CAST(pv.price_adjustment AS CHAR) AS "variant_price_adjustment: String"
           FROM wishlists w
           JOIN products p ON w.product_id = p.id
           LEFT JOIN product_variants pv ON w.variant_id = pv.id
           WHERE w.user_id = ?
           ORDER BY w.created_at DESC, w.id DESC"#,
        user.id
    )
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<WishlistItem> = rows
        .into_iter()
        .map(|r| {
            let base: f64 = r.base_price.parse().unwrap_or(f64::NAN);
            // JS: `adj ? base + adj : base` — any non-null DECIMAL string is truthy.
            let price = match r.variant_price_adjustment.as_deref() {
                Some(adj) => base + adj.parse::<f64>().unwrap_or(f64::NAN),
                None => base,
            };
            WishlistItem {
                id: r.id,
                product_id: r.product_id,
                variant_id: r.variant_id,
                created_at: r.created_at,
                name: r.name,
                base_price: r.base_price,
                slug: r.slug,
                short_description: r.short_description,
                status: r.status,
                image_url: r.image_url,
                variant_size: r.variant_size,
                variant_color: r.variant_color,
                variant_price_adjustment: r.variant_price_adjustment,
                price: js_number(price),
            }
        })
        .collect();
    Ok(Json(success("Wishlist fetched", json!({ "items": items }))))
}

/// Express `req.body`: parsed JSON when the request is JSON, else `{}`.
fn json_body(headers: &HeaderMap, body: &Bytes) -> Value {
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.contains("json"));
    if is_json {
        serde_json::from_slice(body).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    }
}

/// A truthy JS value rendered as the string it binds as; falsy → `None`.
fn truthy_string(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::Null | Value::Bool(false) => None,
        Value::String(s) if s.is_empty() => None,
        Value::Number(n) if n.as_f64() == Some(0.0) => None,
        Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
}

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

/// `POST /api/wishlist` `{ product_id, variant_id? }`
pub async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ApiError> {
    let body = json_body(&headers, &body);
    let Some(product_id) = truthy_string(body.get("product_id")) else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("product_id is required"),
        ));
    };
    let variant_id = truthy_string(body.get("variant_id"));

    let product = sqlx::query_scalar!(
        "SELECT id FROM products WHERE id = ? AND status = 'approved'",
        product_id
    )
    .fetch_optional(&state.pool)
    .await?;
    if product.is_none() {
        return Ok(reply(StatusCode::NOT_FOUND, failure("Product not found")));
    }
    if let Some(variant_id) = &variant_id {
        let variant = sqlx::query_scalar!(
            "SELECT id FROM product_variants WHERE id = ? AND product_id = ?",
            variant_id,
            product_id
        )
        .fetch_optional(&state.pool)
        .await?;
        if variant.is_none() {
            return Ok(reply(
                StatusCode::BAD_REQUEST,
                failure("Variant does not belong to this product"),
            ));
        }
    }

    let existing = sqlx::query_scalar!(
        "SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?
           AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))",
        user.id,
        product_id,
        variant_id,
        variant_id
    )
    .fetch_optional(&state.pool)
    .await?;
    if existing.is_some() {
        return Ok(reply(
            StatusCode::CONFLICT,
            failure("Item already in wishlist"),
        ));
    }

    let wish_id = sqlx::query_scalar!(r#"SELECT get_next_id('WISH') AS "id: String""#)
        .fetch_one(&state.pool)
        .await?
        .ok_or_else(|| anyhow::anyhow!("transno prefix WISH is not registered"))?;

    let inserted = sqlx::query!(
        "INSERT INTO wishlists (id, user_id, product_id, variant_id) VALUES (?, ?, ?, ?)",
        wish_id,
        user.id,
        product_id,
        variant_id
    )
    .execute(&state.pool)
    .await;
    match inserted {
        Ok(_) => Ok(reply(
            StatusCode::CREATED,
            success("Added to wishlist", json!({ "wishlistId": wish_id })),
        )),
        // A concurrent add of the same item hits the unique key.
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => Ok(reply(
            StatusCode::CONFLICT,
            failure("Item already in wishlist"),
        )),
        Err(e) => Err(e.into()),
    }
}

/// `DELETE /api/wishlist/{productId}`
pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(product_id): Path<String>,
) -> Result<Response, ApiError> {
    let done = sqlx::query!(
        "DELETE FROM wishlists WHERE user_id = ? AND product_id = ?",
        user.id,
        product_id
    )
    .execute(&state.pool)
    .await?;
    Ok(if done.rows_affected() == 0 {
        reply(StatusCode::NOT_FOUND, failure("Item not found in wishlist"))
    } else {
        reply(StatusCode::OK, success("Removed from wishlist", json!([])))
    })
}

/// `GET /api/wishlist/check/{productId}`
pub async fn check(
    State(state): State<AppState>,
    user: AuthUser,
    Path(product_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let found = sqlx::query_scalar!(
        "SELECT id FROM wishlists WHERE user_id = ? AND product_id = ? LIMIT 1",
        user.id,
        product_id
    )
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(success(
        "Wishlist check",
        json!({ "isWishlisted": found.is_some() }),
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truthiness_matches_javascript() {
        assert_eq!(
            truthy_string(Some(&json!("PROD1"))).as_deref(),
            Some("PROD1")
        );
        assert_eq!(truthy_string(Some(&json!(""))), None);
        assert_eq!(truthy_string(Some(&json!(0))), None);
        assert_eq!(truthy_string(Some(&json!(null))), None);
        assert_eq!(truthy_string(Some(&json!(false))), None);
        assert_eq!(truthy_string(Some(&json!(7))).as_deref(), Some("7"));
        assert_eq!(truthy_string(None), None);
    }
}
