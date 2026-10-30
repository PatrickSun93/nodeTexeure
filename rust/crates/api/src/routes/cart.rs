//! `/api/cart` — the shopping cart (port of backend/routes/cartRoutes.js).
//! Signed-in customers get one cart per account; guests get one per
//! `sessionId` cookie, which is issued on first use.
//!
//! * view / add / update / remove the lines;
//! * `reserve-stock` holds the cart's quantities for an hour
//!   (InventoryService.reserveStock, see [`reserve_stock`]);
//! * `track-abandonment` / `cancel-abandonment` (re)queue or cancel the 3-step
//!   abandoned-cart email sequence (emailQueueService).

use axum::Json;
use axum::body::Body;
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
use crate::cookies;
use crate::email_queue;
use crate::error::ApiError;
use crate::express;

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

/// What Express's `res.cookie('sessionId', id, { httpOnly, maxAge: 30d })` sends.
fn session_cookie(id: &str, now: DateTime<Utc>) -> HeaderValue {
    let options = cookies::CookieOptions {
        http_only: true,
        max_age_ms: Some(Duration::days(SESSION_MAX_AGE_DAYS).num_milliseconds() as f64),
        ..cookies::CookieOptions::default()
    };
    cookies::set_cookie(SESSION_COOKIE, id, &options, now)
        .expect("a hex id and a fixed max-age are a valid cookie")
}

fn new_session_id() -> anyhow::Result<String> {
    crate::tokens::random_hex::<16>()
}

/// A session id this API or Node could have issued: 32 lowercase hex chars.
fn is_session_id(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// The guest's `sessionId` cookie as Express's `req.cookies.sessionId` sees it,
/// kept only when it is a session id we issue (backend/utils/guestSession.js):
/// anything else is no session, so a new one is issued.
pub(crate) fn guest_session(headers: &HeaderMap) -> Option<String> {
    cookies::get_str(headers, SESSION_COOKIE).filter(|s| is_session_id(s))
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

    let (session_id, set_cookie) = match guest_session(headers).filter(|s| !s.is_empty()) {
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
    pub image: Option<String>,
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
             i.quantity_reserved AS "quantity_reserved: u32",
             (SELECT COALESCE(pi.thumbnail_medium_url, pi.original_url) FROM product_images pi
               WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS "image: String"
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
            image: r.image,
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
    body: Body,
) -> Result<Response, ApiError> {
    // express.json() runs before the route: a body it rejects never gets here.
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(rejected) => return Ok(rejected),
    };
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
    body: Body,
) -> Result<Response, ApiError> {
    // express.json() runs before the route: a body it rejects never gets here.
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(rejected) => return Ok(rejected),
    };
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

// --- stock reservation -------------------------------------------------------

/// How long a reservation holds stock (`expires_at`, `expires_in_minutes`).
const RESERVATION_MINUTES: i64 = 60;

/// One reserved cart line, as `InventoryService._reserveSingleItem` returns it.
#[derive(Debug, Serialize)]
pub struct Reservation {
    pub reservation_id: String,
    pub product_id: String,
    pub variant_id: Option<String>,
    pub quantity: u32,
    #[serde(serialize_with = "common::timestamp::required")]
    pub expires_at: DateTime<Utc>,
}

struct ReserveLine {
    product_id: String,
    variant_id: Option<String>,
    quantity: u32,
}

/// Why a line could not be reserved: not enough stock (collected as a
/// conflict) or anything else (stops the whole reservation).
enum LineError {
    Insufficient,
    Failed(anyhow::Error),
}

impl From<sqlx::Error> for LineError {
    fn from(err: sqlx::Error) -> Self {
        Self::Failed(err.into())
    }
}

/// Node builds `variant_id = ?` for a truthy variant and `variant_id IS NULL`
/// otherwise, so an empty string looks up the variant-less stock row.
fn stock_variant(variant_id: Option<&str>) -> Option<&str> {
    variant_id.filter(|v| !v.is_empty())
}

/// `_reserveSingleItem`: check the stock row, insert a `stock_reservations`
/// row (STOCK id, one hour) and add the quantity to `quantity_reserved`. No
/// transaction, like Node (its `FOR UPDATE` runs on an autocommit connection).
async fn reserve_line(
    pool: &MySqlPool,
    line: &ReserveLine,
    cart_id: &str,
    user_id: Option<&str>,
) -> Result<Reservation, LineError> {
    if line.product_id.is_empty() || line.quantity == 0 {
        return Err(LineError::Failed(anyhow::anyhow!(
            "Invalid item data: product_id={}, quantity={}",
            line.product_id,
            line.quantity
        )));
    }
    let variant = stock_variant(line.variant_id.as_deref());
    let available = sqlx::query_scalar!(
        "SELECT quantity_available FROM inventory
         WHERE product_id = ? AND variant_id <=> ? FOR UPDATE",
        line.product_id,
        variant
    )
    .fetch_optional(pool)
    .await?;
    let Some(available) = available else {
        return Err(LineError::Failed(anyhow::anyhow!(
            "Inventory not found for product {}",
            line.product_id
        )));
    };
    if available < line.quantity {
        return Err(LineError::Insufficient);
    }

    let id = sqlx::query_scalar!(r#"SELECT get_next_id('STOCK') AS "id: String""#)
        .fetch_one(pool)
        .await?
        .ok_or_else(|| {
            LineError::Failed(anyhow::anyhow!("transno prefix STOCK is not registered"))
        })?;
    // `new Date(Date.now() + 60 * 60 * 1000)`: millisecond precision.
    let expires_at = DateTime::from_timestamp_millis(
        Utc::now().timestamp_millis() + RESERVATION_MINUTES * 60 * 1000,
    )
    .expect("a current timestamp is in range");
    sqlx::query!(
        "INSERT INTO stock_reservations
           (id, product_id, variant_id, cart_id, user_id, quantity, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        id,
        line.product_id,
        line.variant_id,
        cart_id,
        user_id,
        line.quantity,
        expires_at
    )
    .execute(pool)
    .await?;

    let reserved = sqlx::query!(
        "UPDATE inventory SET quantity_reserved = quantity_reserved + ?
         WHERE product_id = ? AND variant_id <=> ?",
        line.quantity,
        line.product_id,
        variant
    )
    .execute(pool)
    .await;
    if let Err(err) = reserved {
        let _ = sqlx::query!("DELETE FROM stock_reservations WHERE id = ?", id)
            .execute(pool)
            .await;
        return Err(err.into());
    }

    Ok(Reservation {
        reservation_id: id,
        product_id: line.product_id.clone(),
        variant_id: line.variant_id.clone(),
        quantity: line.quantity,
        expires_at,
    })
}

/// `_rollbackReservations`: delete each reservation and give its quantity
/// back. Failures are logged and skipped, as in Node.
async fn release(pool: &MySqlPool, reservations: &[Reservation]) {
    for r in reservations {
        let deleted = sqlx::query!(
            "DELETE FROM stock_reservations WHERE id = ?",
            r.reservation_id
        )
        .execute(pool)
        .await;
        let returned = sqlx::query!(
            "UPDATE inventory SET quantity_reserved = quantity_reserved - ?
             WHERE product_id = ? AND variant_id <=> ?",
            r.quantity,
            r.product_id,
            stock_variant(r.variant_id.as_deref())
        )
        .execute(pool)
        .await;
        if let Err(error) = deleted.and(returned) {
            tracing::error!(%error, reservation_id = r.reservation_id, "failed to roll back reservation");
        }
    }
}

/// `InventoryService.reserveStock(items, cartId, userId)`. Lines without
/// enough stock are collected and then every reservation made is rolled back.
/// Any other failure stops at that line and, as in Node, keeps the
/// reservations already made (they expire after the hour).
async fn reserve_lines(
    pool: &MySqlPool,
    lines: &[ReserveLine],
    cart_id: &str,
    user_id: Option<&str>,
) -> anyhow::Result<Vec<Reservation>> {
    let mut reservations = Vec::with_capacity(lines.len());
    let mut conflicts = 0;
    for line in lines {
        match reserve_line(pool, line, cart_id, user_id).await {
            Ok(reservation) => reservations.push(reservation),
            Err(LineError::Insufficient) => conflicts += 1,
            Err(LineError::Failed(err)) => return Err(err),
        }
    }
    if conflicts > 0 {
        release(pool, &reservations).await;
        anyhow::bail!("Stock conflicts detected ({conflicts} lines)");
    }
    Ok(reservations)
}

/// `POST /api/cart/reserve-stock`
pub async fn reserve_stock(
    State(state): State<AppState>,
    user: OptionalUser,
    headers: HeaderMap,
    body: Body,
) -> Response {
    // The route ignores the body, but express.json() still rejects a bad one first.
    if let Err(rejected) = express::read_body(&headers, body).await {
        return rejected;
    }
    let cart = match get_or_create(&state.pool, &user, &headers).await {
        Ok(cart) => cart,
        Err(err) => return server_error("Failed to reserve stock", &err),
    };
    let lines = sqlx::query_as!(
        ReserveLine,
        "SELECT product_id, variant_id, quantity FROM cart_items WHERE cart_id = ?",
        cart.id
    )
    .fetch_all(&state.pool)
    .await;
    // A failed read is "empty" too (`!itemsResult.success || !length`).
    let lines = match lines {
        Ok(lines) if !lines.is_empty() => lines,
        Ok(_) => return cart.reply(StatusCode::BAD_REQUEST, failure("Cart is empty")),
        Err(error) => {
            tracing::error!(%error, "reserve-stock: reading the cart failed");
            return cart.reply(StatusCode::BAD_REQUEST, failure("Cart is empty"));
        }
    };
    let user_id = user.0.as_ref().map(|u| u.id.as_str());
    match reserve_lines(&state.pool, &lines, &cart.id, user_id).await {
        Ok(reservations) => cart.reply(
            StatusCode::OK,
            success(
                "Stock reserved for checkout",
                json!({ "reservations": reservations, "expires_in_minutes": RESERVATION_MINUTES }),
            ),
        ),
        Err(err) => {
            tracing::warn!(error = %format!("{err:#}"), cart_id = cart.id, "stock reservation failed");
            cart.reply(
                StatusCode::BAD_REQUEST,
                failure("Unable to reserve stock for checkout"),
            )
        }
    }
}

// --- abandoned-cart emails -----------------------------------------------------

/// A 500 with the route's own message (Node's `catch` blocks).
fn server_error(message: &str, err: &anyhow::Error) -> Response {
    tracing::error!(error = %format!("{err:#}"), message);
    reply(StatusCode::INTERNAL_SERVER_ERROR, failure(message))
}

/// JavaScript's `\s` (and what `String.prototype.trim` removes): white space
/// plus line terminators and the BOM. Unlike `char::is_whitespace`, U+0085 is
/// not included.
pub(crate) fn js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// `/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)`: one `@`, no white space, and a dot
/// in the domain with something on both sides of it.
fn email_re(s: &str) -> bool {
    if s.chars().any(js_space) {
        return false;
    }
    let Some((local, domain)) = s.split_once('@') else {
        return false;
    };
    let d = domain.as_bytes();
    !local.is_empty() && !domain.contains('@') && d.len() >= 3 && d[1..d.len() - 1].contains(&b'.')
}

/// cartRoutes' `isGuestEmail`: a non-empty string of at most 255 UTF-16 units
/// that matches `EMAIL_RE`.
fn is_guest_email(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(s)) => !s.is_empty() && s.encode_utf16().count() <= 255 && email_re(s),
        _ => false,
    }
}

/// `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout` (raw, not
/// trimmed: that is what Node reads).
fn checkout_url() -> String {
    let base = std::env::var("FRONTEND_URL")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "http://localhost:3000".into());
    format!("{base}/checkout")
}

/// `POST /api/cart/track-abandonment` `{ guestEmail? }`: cancel the caller's
/// pending abandoned-cart emails and queue the 1 h / 24 h / 72 h sequence for
/// the current cart.
pub async fn track_abandonment(
    State(state): State<AppState>,
    user: OptionalUser,
    headers: HeaderMap,
    body: Body,
) -> Response {
    const FAILED: &str = "Failed to track cart abandonment";
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(rejected) => return rejected,
    };
    let guest_email = body.get("guestEmail");
    if user.0.is_none() && body::truthy(guest_email) && !is_guest_email(guest_email) {
        return reply(
            StatusCode::BAD_REQUEST,
            failure("A valid email is required"),
        );
    }
    let cart = match get_or_create(&state.pool, &user, &headers).await {
        Ok(cart) => cart,
        Err(err) => return server_error(FAILED, &err),
    };

    let lines = sqlx::query!(
        r#"SELECT ci.quantity, CAST(ci.price AS CHAR) AS "price!: String", p.name
           FROM cart_items ci
           JOIN products p ON ci.product_id = p.id
           WHERE ci.cart_id = ?"#,
        cart.id
    )
    .fetch_all(&state.pool)
    .await;
    let lines = match lines {
        Ok(lines) if !lines.is_empty() => lines,
        other => {
            if let Err(error) = other {
                tracing::error!(%error, "track-abandonment: reading the cart failed");
            }
            return cart.reply(
                StatusCode::OK,
                success("No items in cart to track", json!([])),
            );
        }
    };

    // Signed in: the token's email; the token carries no first/last name, so
    // Node's `${firstName || ''} ${lastName || ''}`.trim() is always 'Customer'.
    let (email, customer_name) = match &user.0 {
        Some(u) => (u.email.clone().filter(|e| !e.is_empty()), "Customer"),
        None => (
            guest_email
                .and_then(Value::as_str)
                .filter(|e| !e.is_empty())
                .map(str::to_owned),
            "Guest",
        ),
    };
    let Some(email) = email else {
        return cart.reply(
            StatusCode::OK,
            success(
                "No email available for cart abandonment tracking",
                json!([]),
            ),
        );
    };

    // `totalAmount += item.price * item.quantity`, in row order.
    let mut total = 0.0;
    let items: Vec<email_queue::CartLine> = lines
        .iter()
        .map(|l| {
            total += l.price.parse::<f64>().unwrap_or(f64::NAN) * f64::from(l.quantity);
            email_queue::CartLine {
                name: l.name.clone(),
                quantity: i64::from(l.quantity),
            }
        })
        .collect();
    let item_count = items.len();
    let cart_data = email_queue::AbandonedCart {
        items,
        total_amount: format!("${}", common::json::js_to_fixed(total, 2)),
        checkout_url: Some(checkout_url()),
        customer_name: Some(customer_name.into()),
    };

    email_queue::cancel_abandoned_cart_emails(&state.pool, &email).await;
    let mut queue_ids = Vec::with_capacity(3);
    for step in 1..=3 {
        match email_queue::queue_abandoned_cart_email(
            &state.pool,
            &state.jwt,
            &email,
            &cart_data,
            step,
        )
        .await
        {
            Ok(id) => queue_ids.push(id),
            Err(err) => {
                tracing::error!(error = %format!("{err:#}"), FAILED);
                return cart.reply(StatusCode::INTERNAL_SERVER_ERROR, failure(FAILED));
            }
        }
    }
    tracing::info!(email, ?queue_ids, "abandoned cart email sequence queued");

    cart.reply(
        StatusCode::OK,
        success(
            "Cart abandonment tracking started",
            json!({
                "customerEmail": email,
                "queueIds": queue_ids,
                "totalAmount": cart_data.total_amount,
                "itemCount": item_count,
            }),
        ),
    )
}

/// `POST /api/cart/cancel-abandonment` `{ guestEmail? }`: cancel the pending
/// abandoned-cart emails of the signed-in customer, or of `guestEmail`.
///
/// Known issue kept for parity: a guest can name any address and cancel its
/// pending reminders (see the port notes).
pub async fn cancel_abandonment(
    State(state): State<AppState>,
    user: OptionalUser,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let body = match express::read_body(&headers, body).await {
        Ok(body) => body,
        Err(rejected) => return rejected,
    };
    let email = match &user.0 {
        Some(u) => u.email.clone().filter(|e| !e.is_empty()),
        None => {
            let guest_email = body.get("guestEmail");
            if !body::truthy(guest_email) {
                None
            } else if is_guest_email(guest_email) {
                guest_email.and_then(Value::as_str).map(str::to_owned)
            } else {
                return reply(
                    StatusCode::BAD_REQUEST,
                    failure("A valid email is required"),
                );
            }
        }
    };
    let Some(email) = email else {
        return reply(
            StatusCode::OK,
            success("No email to cancel abandonment tracking", json!([])),
        );
    };
    let cancelled = email_queue::cancel_abandoned_cart_emails(&state.pool, &email).await;
    reply(
        StatusCode::OK,
        success(
            "Abandoned cart emails cancelled",
            json!({ "customerEmail": email, "cancelledCount": cancelled }),
        ),
    )
}

// --- Express's answers for paths the group doesn't route -------------------------

/// `routes` with Express's answer for the methods it doesn't route: the 404
/// below, where axum would send 405 (and an `Allow` header).
pub fn express(
    routes: axum::routing::MethodRouter<AppState>,
) -> axum::routing::MethodRouter<AppState> {
    axum::routing::any(
        move |State(state): State<AppState>, req: axum::extract::Request| async move {
            use tower::ServiceExt;
            let uri = req.uri().clone();
            let response = match routes.with_state(state).oneshot(req).await {
                Ok(response) => response,
                Err(never) => match never {},
            };
            if response.status() == StatusCode::METHOD_NOT_ALLOWED {
                express_not_found(uri).await
            } else {
                response
            }
        },
    )
}

/// backend/server.js's 404 handler: `{ path: req.originalUrl, timestamp }`.
/// Express never answers 405, so a known path with another method lands here too.
pub async fn express_not_found(uri: axum::http::Uri) -> Response {
    let path = uri
        .path_and_query()
        .map_or_else(|| uri.path().to_owned(), |pq| pq.as_str().to_owned());
    reply(
        StatusCode::NOT_FOUND,
        common::response::failure_with(
            "Endpoint not found",
            json!({ "path": path, "timestamp": common::timestamp::format(&Utc::now()) }),
        ),
    )
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
    fn session_ids_are_random_hex() {
        let a = new_session_id().unwrap();
        assert!(is_session_id(&a));
        assert_ne!(a, new_session_id().unwrap());
    }

    #[test]
    fn only_issued_session_ids_count() {
        let id = "0123456789abcdef0123456789abcdef";
        let session = |cookie: &str| {
            let mut headers = HeaderMap::new();
            headers.insert(header::COOKIE, HeaderValue::from_str(cookie).unwrap());
            guest_session(&headers)
        };
        assert_eq!(session(&format!("sessionId={id}")).as_deref(), Some(id));
        assert_eq!(session(&format!("sessionId=\"{id}\"")).as_deref(), Some(id));
        assert_eq!(
            session(&format!("sessionId=j:\"{id}\"")).as_deref(),
            Some(id)
        );
        assert_eq!(
            session(&format!("sessionId=j:%22{id}%22")).as_deref(),
            Some(id)
        );
        for bad in [
            "j:1",
            "j:true",
            "j:[1]",
            "j:{}",
            "abc",
            "1",
            "",
            "0123456789ABCDEF0123456789ABCDEF",
            "0123456789abcdef0123456789abcdef0",
        ] {
            assert_eq!(session(&format!("sessionId={bad}")), None, "{bad}");
        }
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

    #[test]
    fn guest_email_is_email_re_on_a_short_string() {
        for ok in [
            "a@b.co",
            "a.b@c.d.e",
            "a@.b.c",
            "a@b..c",
            "a\u{85}b@c.d",
            "é@ü.de",
        ] {
            assert!(is_guest_email(Some(&json!(ok))), "{ok:?}");
        }
        for bad in [
            "",
            "nope",
            "a@b",
            "a@.co",
            "a@b.",
            "@b.co",
            "a@b@c.d",
            "a b@c.d",
            "a\u{a0}b@c.d",
            "a\u{2028}@c.d",
            "a\u{feff}@c.d",
            "a@b.c\n",
        ] {
            assert!(!is_guest_email(Some(&json!(bad))), "{bad:?}");
        }
        // 255 UTF-16 units at most (an emoji counts two).
        let at_limit = format!("{}@b.co", "x".repeat(250));
        assert!(is_guest_email(Some(&json!(at_limit))));
        assert!(!is_guest_email(Some(&json!(format!("x{at_limit}")))));
        let emoji = format!("{}@b.co", "😀".repeat(125));
        assert_eq!(emoji.encode_utf16().count(), 255);
        assert!(is_guest_email(Some(&json!(emoji))));
        assert!(!is_guest_email(Some(&json!(format!("x{emoji}")))));
        for not_string in [
            json!(42),
            json!(true),
            json!([]),
            json!(["a@b.co"]),
            json!({}),
        ] {
            assert!(!is_guest_email(Some(&not_string)), "{not_string}");
        }
        assert!(!is_guest_email(None));
    }

    #[test]
    fn empty_variant_reads_the_variant_less_stock_row() {
        assert_eq!(stock_variant(Some("V1")), Some("V1"));
        assert_eq!(stock_variant(Some("")), None);
        assert_eq!(stock_variant(None), None);
    }

    #[test]
    fn reservations_serialize_like_node() {
        let r = Reservation {
            reservation_id: "STOCK0000000001".into(),
            product_id: "P1".into(),
            variant_id: None,
            quantity: 2,
            expires_at: Utc.with_ymd_and_hms(2026, 10, 30, 7, 0, 0).unwrap()
                + Duration::milliseconds(5),
        };
        assert_eq!(
            serde_json::to_value(&r).unwrap(),
            json!({ "reservation_id": "STOCK0000000001", "product_id": "P1", "variant_id": null,
                    "quantity": 2, "expires_at": "2026-10-30T07:00:00.005Z" })
        );
    }

    #[tokio::test]
    async fn other_methods_and_paths_get_the_express_404() {
        use tower::ServiceExt;
        let pool = sqlx::MySqlPool::connect_lazy("mysql://nobody@127.0.0.1:1/none").unwrap();
        let app = crate::router(AppState::new(pool, Some("x")));
        for (method, uri) in [
            ("GET", "/api/cart/add"),
            ("POST", "/api/cart"),
            ("GET", "/api/cart/reserve-stock?a=1"),
            ("PATCH", "/api/cart/update/1"),
            ("GET", "/api/cart/nope/deeper"),
            ("POST", "/api/abandoned-cart/recovery/0123456789abcdef"),
            ("GET", "/api/abandoned-cart"),
            ("GET", "/api/abandoned-cart/other"),
        ] {
            let req = axum::http::Request::builder()
                .method(method)
                .uri(uri)
                .body(axum::body::Body::empty())
                .unwrap();
            let res = app.clone().oneshot(req).await.unwrap();
            assert_eq!(res.status(), StatusCode::NOT_FOUND, "{method} {uri}");
            assert!(res.headers().get(header::ALLOW).is_none(), "{method} {uri}");
            let body = axum::body::to_bytes(res.into_body(), 1 << 16)
                .await
                .unwrap();
            let body: Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(body["message"], "Endpoint not found");
            assert_eq!(body["keyValueTable"]["path"], uri);
        }
    }
}
