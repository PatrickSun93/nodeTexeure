//! `/api/cart` — view and edit the shopping cart (port of the first four routes
//! of backend/routes/cartRoutes.js). Signed-in customers get one cart per
//! account; guests get one per `sessionId` cookie, which is issued on first use.
//! Stock reservation and abandonment tracking are still served by Node.

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Duration, Utc};
use common::response::{failure, success};
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::MySqlPool;

use crate::AppState;
use crate::auth::OptionalUser;
use crate::body;
use crate::error::ApiError;
use crate::params::cookie;

const SESSION_COOKIE: &str = "sessionId";
const SESSION_MAX_AGE_DAYS: i64 = 30;
const MAX_QUANTITY: i64 = 999;

/// The caller's cart, plus the guest cookie to set if one was just issued.
struct Cart {
    id: String,
    set_cookie: Option<HeaderValue>,
}

impl Cart {
    fn reply(&self, status: StatusCode, body: Value) -> Response {
        let mut response = (status, Json(body)).into_response();
        if let Some(cookie) = &self.set_cookie {
            response
                .headers_mut()
                .insert(header::SET_COOKIE, cookie.clone());
        }
        response
    }
}

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

/// cookie-parser's value decoding: surrounding quotes dropped, then
/// `decodeURIComponent`, keeping the raw value if that fails.
fn decode_cookie(raw: &str) -> String {
    let v = raw
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .unwrap_or(raw);
    if !v.contains('%') {
        return v.to_owned();
    }
    let bytes = v.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = v
                .get(i + 1..i + 3)
                .and_then(|h| u8::from_str_radix(h, 16).ok());
            match hex {
                Some(b) => {
                    out.push(b);
                    i += 3;
                }
                None => return v.to_owned(),
            }
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| v.to_owned())
}

/// What Express's `res.cookie('sessionId', id, { httpOnly, maxAge: 30d })` sends.
fn session_cookie(id: &str, now: DateTime<Utc>) -> HeaderValue {
    let max_age = Duration::days(SESSION_MAX_AGE_DAYS);
    let expires = (now + max_age).format("%a, %d %b %Y %H:%M:%S GMT");
    let value = format!(
        "{SESSION_COOKIE}={id}; Max-Age={}; Path=/; Expires={expires}; HttpOnly",
        max_age.num_seconds()
    );
    HeaderValue::from_str(&value).expect("hex id and date are valid header text")
}

fn new_session_id() -> anyhow::Result<String> {
    let mut buf = [0u8; 16];
    getrandom::getrandom(&mut buf).map_err(|e| anyhow::anyhow!("no randomness: {e}"))?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

async fn create_cart(
    pool: &MySqlPool,
    user_id: Option<&str>,
    session_id: Option<&str>,
) -> anyhow::Result<String> {
    let id = sqlx::query_scalar!(r#"SELECT get_next_id('CART') AS "id: String""#)
        .fetch_one(pool)
        .await?
        .ok_or_else(|| anyhow::anyhow!("transno prefix CART is not registered"))?;
    sqlx::query!(
        "INSERT INTO shopping_carts (id, user_id, session_id) VALUES (?, ?, ?)",
        id,
        user_id,
        session_id
    )
    .execute(pool)
    .await?;
    Ok(id)
}

/// Node's `getOrCreateCart`.
async fn get_or_create(
    pool: &MySqlPool,
    user: &OptionalUser,
    headers: &HeaderMap,
) -> anyhow::Result<Cart> {
    if let Some(user) = &user.0 {
        let existing = sqlx::query_scalar!(
            "SELECT id FROM shopping_carts WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 1",
            user.id
        )
        .fetch_optional(pool)
        .await?;
        let id = match existing {
            Some(id) => id,
            None => create_cart(pool, Some(&user.id), None).await?,
        };
        return Ok(Cart {
            id,
            set_cookie: None,
        });
    }

    let (session_id, set_cookie) = match cookie(headers, SESSION_COOKIE)
        .map(|raw| decode_cookie(&raw))
        .filter(|s| !s.is_empty())
    {
        Some(s) => (s, None),
        None => {
            let s = new_session_id()?;
            let set = session_cookie(&s, Utc::now());
            (s, Some(set))
        }
    };
    let existing = sqlx::query_scalar!(
        "SELECT id FROM shopping_carts WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT 1",
        session_id
    )
    .fetch_optional(pool)
    .await?;
    let id = match existing {
        Some(id) => id,
        None => create_cart(pool, None, Some(&session_id)).await?,
    };
    Ok(Cart { id, set_cookie })
}

/// Last-activity stamp used by abandoned-cart detection. Failures are logged and
/// ignored, as in Node.
async fn touch(pool: &MySqlPool, cart_id: &str) {
    let done = sqlx::query!(
        "UPDATE shopping_carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        cart_id
    )
    .execute(pool)
    .await;
    if let Err(error) = done {
        tracing::warn!(%error, cart_id, "failed to track cart activity");
    }
}

/// `InventoryService.getAvailability`: (available, in_stock); no row = none.
async fn availability(
    pool: &MySqlPool,
    product_id: &str,
    variant_id: Option<&str>,
) -> anyhow::Result<(u32, bool)> {
    let available = sqlx::query_scalar!(
        "SELECT quantity_available FROM inventory WHERE product_id = ? AND variant_id <=> ? LIMIT 1",
        product_id,
        variant_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(match available {
        Some(n) => (n, n > 0),
        None => (0, false),
    })
}

/// Quantity rules shared by add and update. `Err` is the 400 message.
fn check_quantity(quantity: Option<i64>) -> Result<i64, &'static str> {
    match quantity {
        Some(q) if (1..=MAX_QUANTITY).contains(&q) => Ok(q),
        Some(q) if q > MAX_QUANTITY => Err("Quantity cannot exceed 999"),
        _ => Err("Quantity must be a positive integer"),
    }
}

#[derive(Debug, Serialize)]
pub struct CartItem {
    pub id: String,
    pub cart_id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    pub bundle_id: Option<String>,
    pub quantity: u32,
    pub price: String,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(serialize_with = "common::timestamp::optional")]
    pub updated_at: Option<DateTime<Utc>>,
    pub name: String,
    pub base_price: String,
    pub size: Option<String>,
    pub color: Option<String>,
    pub pattern: Option<String>,
    pub price_adjustment: Option<String>,
    pub variant_sku: Option<String>,
    pub quantity_available: Option<u32>,
    pub quantity_reserved: Option<u32>,
    pub in_stock: bool,
    pub available_quantity: u32,
}

/// `GET /api/cart`
pub async fn get(
    State(state): State<AppState>,
    user: OptionalUser,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let cart = get_or_create(&state.pool, &user, &headers).await?;
    let rows = sqlx::query!(
        r#"SELECT ci.id, ci.cart_id, ci.product_id, ci.variant_id, ci.bundle_id, ci.quantity,
             CAST(ci.price AS CHAR) AS "price!: String", ci.created_at, ci.updated_at,
             p.name, CAST(p.base_price AS CHAR) AS "base_price!: String",
             pv.size AS "size: String", pv.color AS "color: String",
             pv.pattern AS "pattern: String",
             CAST(pv.price_adjustment AS CHAR) AS "price_adjustment: String",
             pv.sku AS "variant_sku: String",
             i.quantity_available AS "quantity_available: u32",
             i.quantity_reserved AS "quantity_reserved: u32"
           FROM cart_items ci
           JOIN products p ON ci.product_id = p.id
           LEFT JOIN product_variants pv ON ci.variant_id = pv.id
           LEFT JOIN inventory i ON ci.product_id = i.product_id AND ci.variant_id <=> i.variant_id
           WHERE ci.cart_id = ?
           ORDER BY ci.created_at ASC, ci.id ASC"#,
        cart.id
    )
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<CartItem> = rows
        .into_iter()
        .map(|r| CartItem {
            // JS: `null >= n` is `0 >= n`; quantities are at least 1.
            in_stock: r.quantity_available.unwrap_or(0) >= r.quantity,
            available_quantity: r.quantity_available.unwrap_or(0),
            id: r.id,
            cart_id: r.cart_id,
            product_id: r.product_id,
            variant_id: r.variant_id,
            bundle_id: r.bundle_id,
            quantity: r.quantity,
            price: r.price,
            created_at: r.created_at,
            updated_at: r.updated_at,
            name: r.name,
            base_price: r.base_price,
            size: r.size,
            color: r.color,
            pattern: r.pattern,
            price_adjustment: r.price_adjustment,
            variant_sku: r.variant_sku,
            quantity_available: r.quantity_available,
            quantity_reserved: r.quantity_reserved,
        })
        .collect();

    touch(&state.pool, &cart.id).await;
    Ok(cart.reply(
        StatusCode::OK,
        success("Cart fetched", json!({ "cartId": cart.id, "items": items })),
    ))
}

/// `req.body.x || null`, then the string check Node applies.
fn optional_id(value: Option<&Value>) -> Result<Option<String>, ()> {
    match value {
        None | Some(Value::Null) | Some(Value::Bool(false)) => Ok(None),
        Some(Value::String(s)) if s.is_empty() => Ok(None),
        Some(Value::Number(n)) if n.as_f64() == Some(0.0) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.clone())),
        Some(_) => Err(()),
    }
}

/// `POST /api/cart/add` `{ product_id, variant_id?, quantity? }`
pub async fn add(
    State(state): State<AppState>,
    user: OptionalUser,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ApiError> {
    let body = body::json(&headers, &body);
    let Ok(Some(product_id)) = optional_id(body.get("product_id")) else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("product_id is required"),
        ));
    };
    let Ok(variant_id) = optional_id(body.get("variant_id")) else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("Product variant not found"),
        ));
    };
    // `req.body.quantity ?? 1`
    let quantity = match body.get("quantity") {
        None | Some(Value::Null) => Some(1),
        Some(v) => body::parse_int(v),
    };
    let quantity = match check_quantity(quantity) {
        Ok(q) => q,
        Err(message) => return Ok(reply(StatusCode::BAD_REQUEST, failure(message))),
    };

    let price = match &variant_id {
        Some(variant_id) => {
            sqlx::query_scalar!(
                r#"SELECT CAST(p.base_price + COALESCE(pv.price_adjustment, 0) AS CHAR) AS "price!: String"
                   FROM products p JOIN product_variants pv ON p.id = pv.product_id
                   WHERE p.id = ? AND pv.id = ? AND p.status = 'approved'"#,
                product_id,
                variant_id
            )
            .fetch_optional(&state.pool)
            .await?
        }
        None => {
            sqlx::query_scalar!(
                r#"SELECT CAST(base_price AS CHAR) AS "price!: String"
                   FROM products WHERE id = ? AND status = 'approved'"#,
                product_id
            )
            .fetch_optional(&state.pool)
            .await?
        }
    };
    let Some(price) = price else {
        let message = if variant_id.is_some() {
            "Product variant not found"
        } else {
            "Product not found"
        };
        return Ok(reply(StatusCode::BAD_REQUEST, failure(message)));
    };

    let cart = get_or_create(&state.pool, &user, &headers).await?;
    let (available, in_stock) =
        availability(&state.pool, &product_id, variant_id.as_deref()).await?;
    if !in_stock || i64::from(available) < quantity {
        return Ok(cart.reply(
            StatusCode::BAD_REQUEST,
            failure(&format!(
                "Insufficient stock. Available: {available}, Requested: {quantity}"
            )),
        ));
    }

    let existing = sqlx::query!(
        "SELECT id, quantity FROM cart_items
         WHERE cart_id = ? AND product_id = ? AND variant_id <=> ? ORDER BY id LIMIT 1",
        cart.id,
        product_id,
        variant_id
    )
    .fetch_optional(&state.pool)
    .await?;

    match existing {
        Some(line) => {
            let total = i64::from(line.quantity) + quantity;
            if total > i64::from(available) {
                return Ok(cart.reply(
                    StatusCode::BAD_REQUEST,
                    failure(&format!(
                        "Cannot add {quantity} items. Total would be {total}, but only {available} available"
                    )),
                ));
            }
            sqlx::query!(
                "UPDATE cart_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                quantity,
                line.id
            )
            .execute(&state.pool)
            .await?;
        }
        None => {
            let item_id = sqlx::query_scalar!(r#"SELECT get_next_id('CARTITEM') AS "id: String""#)
                .fetch_one(&state.pool)
                .await?
                .ok_or_else(|| anyhow::anyhow!("transno prefix CARTITEM is not registered"))?;
            sqlx::query!(
                "INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, price)
                 VALUES (?, ?, ?, ?, ?, ?)",
                item_id,
                cart.id,
                product_id,
                variant_id,
                quantity,
                price
            )
            .execute(&state.pool)
            .await?;
        }
    }

    touch(&state.pool, &cart.id).await;
    Ok(cart.reply(StatusCode::OK, success("Item added to cart", json!([]))))
}

/// `PUT /api/cart/update/{itemId}` `{ quantity }`
pub async fn update(
    State(state): State<AppState>,
    user: OptionalUser,
    headers: HeaderMap,
    Path(item_id): Path<String>,
    body: Bytes,
) -> Result<Response, ApiError> {
    let body = body::json(&headers, &body);
    let quantity = body.get("quantity").and_then(body::parse_int);
    let quantity = match check_quantity(quantity) {
        Ok(q) => q,
        Err(message) => return Ok(reply(StatusCode::BAD_REQUEST, failure(message))),
    };

    let cart = get_or_create(&state.pool, &user, &headers).await?;
    let item = sqlx::query!(
        "SELECT product_id, variant_id FROM cart_items WHERE id = ? AND cart_id = ?",
        item_id,
        cart.id
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(item) = item else {
        return Ok(cart.reply(StatusCode::NOT_FOUND, failure("Item not found")));
    };

    let (available, in_stock) =
        availability(&state.pool, &item.product_id, item.variant_id.as_deref()).await?;
    if !in_stock || i64::from(available) < quantity {
        return Ok(cart.reply(
            StatusCode::BAD_REQUEST,
            failure(&format!(
                "Insufficient stock. Available: {available}, Requested: {quantity}"
            )),
        ));
    }

    let done = sqlx::query!(
        "UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND cart_id = ?",
        quantity,
        item_id,
        cart.id
    )
    .execute(&state.pool)
    .await?;
    Ok(if done.rows_affected() > 0 {
        cart.reply(StatusCode::OK, success("Item updated", json!([])))
    } else {
        cart.reply(StatusCode::NOT_FOUND, failure("Item not found"))
    })
}

/// `DELETE /api/cart/remove/{itemId}`
pub async fn remove(
    State(state): State<AppState>,
    user: OptionalUser,
    headers: HeaderMap,
    Path(item_id): Path<String>,
) -> Result<Response, ApiError> {
    let cart = get_or_create(&state.pool, &user, &headers).await?;
    let done = sqlx::query!(
        "DELETE FROM cart_items WHERE id = ? AND cart_id = ?",
        item_id,
        cart.id
    )
    .execute(&state.pool)
    .await?;
    Ok(if done.rows_affected() > 0 {
        cart.reply(StatusCode::OK, success("Item removed", json!([])))
    } else {
        cart.reply(StatusCode::NOT_FOUND, failure("Item not found"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn cookie_matches_express() {
        let now = Utc.with_ymd_and_hms(2026, 10, 30, 6, 0, 0).unwrap();
        assert_eq!(
            session_cookie("abc123", now),
            "sessionId=abc123; Max-Age=2592000; Path=/; Expires=Sun, 29 Nov 2026 06:00:00 GMT; HttpOnly"
        );
    }

    #[test]
    fn cookie_values_decode_like_cookie_parser() {
        assert_eq!(decode_cookie("abc"), "abc");
        assert_eq!(decode_cookie("\"abc\""), "abc");
        assert_eq!(decode_cookie("a%20b"), "a b");
        assert_eq!(decode_cookie("100%"), "100%");
        assert_eq!(decode_cookie("%ff"), "%ff");
    }

    #[test]
    fn session_ids_are_random_hex() {
        let a = new_session_id().unwrap();
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, new_session_id().unwrap());
    }

    #[test]
    fn quantity_rules() {
        assert_eq!(check_quantity(Some(1)), Ok(1));
        assert_eq!(check_quantity(Some(999)), Ok(999));
        assert_eq!(
            check_quantity(Some(1000)),
            Err("Quantity cannot exceed 999")
        );
        assert_eq!(
            check_quantity(Some(0)),
            Err("Quantity must be a positive integer")
        );
        assert_eq!(
            check_quantity(None),
            Err("Quantity must be a positive integer")
        );
    }

    #[test]
    fn ids_follow_or_null_then_string_check() {
        assert_eq!(optional_id(Some(&json!("P1"))), Ok(Some("P1".into())));
        assert_eq!(optional_id(Some(&json!(""))), Ok(None));
        assert_eq!(optional_id(Some(&json!(0))), Ok(None));
        assert_eq!(optional_id(None), Ok(None));
        assert_eq!(optional_id(Some(&json!(5))), Err(()));
        assert_eq!(optional_id(Some(&json!(["P1"]))), Err(()));
    }
}
