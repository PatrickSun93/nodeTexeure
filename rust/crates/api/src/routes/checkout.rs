//! `/api/orders` write routes (port of the POST handlers in
//! backend/routes/orderRoutes.js): tax quotes, coupon previews and order
//! creation. Money follows the Node arithmetic step for step (f64, rounded to
//! cents with JavaScript's `Math.round`) so both services store the same totals.

use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use common::json::js_number;
use common::response::{failure, success};
use serde_json::{Map, Value, json};
use sqlx::MySqlPool;

use crate::AppState;
use crate::auth::{AuthUser, OptionalUser};
use crate::body::{self, js_string, js_to_number, truthy};
use crate::email_queue::{self, Enqueued, uuid_v4};
use crate::error::ApiError;
use crate::routes::cart::guest_session;
use crate::tokens::random_bytes;

/// Static shipping rates (`shippingService.DEFAULT_RATES`).
const SHIPPING_RATES: [(&str, f64); 3] =
    [("STANDARD", 9.99), ("EXPRESS", 19.99), ("OVERNIGHT", 34.99)];
/// Subtotal from which STANDARD shipping is free (Express/Overnight are always charged).
const FREE_SHIPPING_FROM: f64 = 100.0;
/// Crockford base32 (no I, L, O, U).
const ORDER_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

fn reply(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

/// JavaScript `Math.round`: nearest integer, halves toward +∞.
fn js_round(x: f64) -> f64 {
    let floor = x.floor();
    if x - floor >= 0.5 { floor + 1.0 } else { floor }
}

/// Node's `cents(n)`.
fn cents(x: f64) -> f64 {
    js_round(x * 100.0) / 100.0
}

/// `parseFloat(process.env.TAX_RATE) || 0.08875`
fn default_tax_rate() -> f64 {
    std::env::var("TAX_RATE")
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|r| *r != 0.0 && !r.is_nan())
        .unwrap_or(0.08875)
}

/// A truthy body value as the string it binds as, else the fallback.
fn bind_or(value: Option<&Value>, fallback: &str) -> String {
    if truthy(value) {
        js_string(value.expect("truthy implies present"))
    } else {
        fallback.to_owned()
    }
}

/// `getTaxRate(state, country)`: the state's rate, else the country-wide rate,
/// else the default. Lookup failures fall back to the default, as in Node.
async fn tax_rate(pool: &MySqlPool, state: Option<&Value>, country: Option<&Value>) -> f64 {
    let country = bind_or(country, "US");
    let state = bind_or(state, "");
    let lookup = async {
        let by_state = sqlx::query_scalar!(
            r#"SELECT CAST(tax_rate AS CHAR) AS "rate!: String" FROM tax_rates
               WHERE is_active = 1
                 AND JSON_UNQUOTE(JSON_EXTRACT(location_json, '$.country')) = ?
                 AND JSON_UNQUOTE(JSON_EXTRACT(location_json, '$.state')) = ?
               ORDER BY id LIMIT 1"#,
            country,
            state
        )
        .fetch_optional(pool)
        .await?;
        if by_state.is_some() {
            return Ok::<_, sqlx::Error>(by_state);
        }
        sqlx::query_scalar!(
            r#"SELECT CAST(tax_rate AS CHAR) AS "rate!: String" FROM tax_rates
               WHERE is_active = 1
                 AND JSON_UNQUOTE(JSON_EXTRACT(location_json, '$.country')) = ?
                 AND (JSON_UNQUOTE(JSON_EXTRACT(location_json, '$.state')) = ''
                      OR JSON_EXTRACT(location_json, '$.state') IS NULL)
               ORDER BY id LIMIT 1"#,
            country
        )
        .fetch_optional(pool)
        .await
    };
    match lookup.await {
        Ok(Some(rate)) => rate.parse().unwrap_or(f64::NAN),
        Ok(None) => default_tax_rate(),
        Err(error) => {
            tracing::warn!(%error, "tax rate lookup failed, using default");
            default_tax_rate()
        }
    }
}

/// `POST /api/orders/calculate-tax` `{ stateCode, countryCode, subtotal }`
pub async fn calculate_tax(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ApiError> {
    let body = body::json(&headers, &body);
    let subtotal = match body.get("subtotal") {
        None | Some(Value::Null) => None,
        Some(v) => Some(js_to_number(v)),
    };
    // `subtotal == null || subtotal < 0`; NaN compares false and goes through.
    let Some(subtotal) = subtotal.filter(|s| s.is_nan() || *s >= 0.0) else {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("subtotal is required"),
        ));
    };
    let rate = tax_rate(&state.pool, body.get("stateCode"), body.get("countryCode")).await;
    let tax = js_round(subtotal * rate * 100.0) / 100.0;
    Ok(reply(
        StatusCode::OK,
        success(
            "Tax calculated",
            json!({ "taxRate": js_number(rate), "taxAmount": js_number(tax) }),
        ),
    ))
}

/// `ownsCart`: the signed-in user's own cart, or a guest cart on this
/// browser's `sessionId`. Missing carts look the same as foreign ones.
async fn owns_cart(
    pool: &MySqlPool,
    cart_id: Option<&Value>,
    user: Option<&AuthUser>,
    headers: &HeaderMap,
) -> Result<bool, sqlx::Error> {
    if !truthy(cart_id) {
        return Ok(false);
    }
    let cart_id = js_string(cart_id.expect("truthy implies present"));
    let cart = sqlx::query!(
        "SELECT user_id, session_id FROM shopping_carts WHERE id = ?",
        cart_id
    )
    .fetch_optional(pool)
    .await?;
    let Some(cart) = cart else { return Ok(false) };
    if let Some(user) = user {
        return Ok(cart.user_id.as_deref() == Some(user.id.as_str()));
    }
    if cart.user_id.as_deref().is_some_and(|u| !u.is_empty()) {
        return Ok(false);
    }
    let session = guest_session(headers).filter(|s| !s.is_empty());
    Ok(session.is_some() && cart.session_id == session)
}

struct Line {
    product_id: String,
    variant_id: Option<String>,
    quantity: u32,
    price: String,
    name: String,
    sku: String,
}

/// `getCartDetails`: the cart's lines with product name and SKU.
async fn cart_lines(pool: &MySqlPool, cart_id: &str) -> Result<Vec<Line>, sqlx::Error> {
    sqlx::query_as!(
        Line,
        r#"SELECT ci.product_id, ci.variant_id, ci.quantity,
             CAST(ci.price AS CHAR) AS "price!: String", p.name,
             COALESCE(pv.sku, p.sku) AS "sku!: String"
           FROM cart_items ci
           JOIN products p ON ci.product_id = p.id
           LEFT JOIN product_variants pv ON ci.variant_id = pv.id
           WHERE ci.cart_id = ?
           ORDER BY ci.created_at ASC, ci.id ASC"#,
        cart_id
    )
    .fetch_all(pool)
    .await
}

fn price(line: &Line) -> f64 {
    line.price.parse().unwrap_or(f64::NAN)
}

/// `cartSubtotal`
fn subtotal(lines: &[Line]) -> f64 {
    cents(
        lines
            .iter()
            .fold(0.0, |sum, l| sum + price(l) * f64::from(l.quantity)),
    )
}

struct Coupon {
    id: String,
    kind: String,
    value: String,
    minimum_order_amount: Option<String>,
    maximum_discount_amount: Option<String>,
    usage_limit_per_customer: Option<u32>,
}

fn decimal(s: Option<&str>) -> f64 {
    s.map_or(0.0, |s| s.parse().unwrap_or(f64::NAN))
}

/// `validateCoupon`: `Err` carries the 400 message.
async fn validate_coupon(
    pool: &MySqlPool,
    code: &str,
    subtotal: f64,
) -> Result<Result<Coupon, String>, sqlx::Error> {
    let coupon = sqlx::query_as!(
        Coupon,
        r#"SELECT id, type AS "kind!: String", CAST(value AS CHAR) AS "value!: String",
             CAST(minimum_order_amount AS CHAR) AS "minimum_order_amount: String",
             CAST(maximum_discount_amount AS CHAR) AS "maximum_discount_amount: String",
             usage_limit_per_customer
           FROM discount_codes
           WHERE code = ? AND is_active = 1
             AND (starts_at <= NOW() OR starts_at IS NULL)
             AND (expires_at >= NOW() OR expires_at IS NULL)
           ORDER BY id LIMIT 1"#,
        code
    )
    .fetch_optional(pool)
    .await?;
    let Some(coupon) = coupon else {
        return Ok(Err("Invalid or expired coupon".into()));
    };
    if subtotal < decimal(coupon.minimum_order_amount.as_deref()) {
        let min = coupon.minimum_order_amount.as_deref().unwrap_or("null");
        return Ok(Err(format!("Minimum order amount of {min} required")));
    }
    Ok(Ok(coupon))
}

/// `couponDiscount`: (discount, free shipping).
fn coupon_discount(coupon: &Coupon, subtotal: f64) -> (f64, bool) {
    let value = decimal(Some(&coupon.value));
    let (mut discount, free_shipping) = match coupon.kind.as_str() {
        "percentage" => (subtotal * (value / 100.0), false),
        "fixed_amount" => (value, false),
        "free_shipping" => (0.0, true),
        _ => (0.0, false),
    };
    if coupon.kind == "percentage"
        && let Some(max) = coupon.maximum_discount_amount.as_deref()
    {
        let max = decimal(Some(max));
        if discount > max {
            discount = max;
        }
    }
    (cents(discount.min(subtotal).max(0.0)), free_shipping)
}

/// `POST /api/orders/apply-coupon` `{ cartId, couponCode }`
pub async fn apply_coupon(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ApiError> {
    let body = body::json(&headers, &body);
    let cart_id = body.get("cartId");
    if !owns_cart(&state.pool, cart_id, user.as_ref(), &headers).await? {
        return Ok(reply(StatusCode::FORBIDDEN, failure("Access denied")));
    }
    let lines = cart_lines(&state.pool, &js_string(cart_id.expect("owned cart id"))).await?;
    if lines.is_empty() {
        return Ok(reply(StatusCode::BAD_REQUEST, failure("Cart is empty")));
    }
    let subtotal = subtotal(&lines);

    let code = body.get("couponCode");
    if !truthy(code) {
        return Ok(reply(
            StatusCode::OK,
            success("No coupon applied", json!({ "discount": 0 })),
        ));
    }
    let coupon =
        match validate_coupon(&state.pool, &js_string(code.expect("truthy")), subtotal).await? {
            Ok(c) => c,
            Err(message) => return Ok(reply(StatusCode::BAD_REQUEST, failure(&message))),
        };
    let (discount, free_shipping) = coupon_discount(&coupon, subtotal);
    Ok(reply(
        StatusCode::OK,
        success(
            "Coupon applied",
            json!({ "discount": js_number(discount), "freeShipping": free_shipping }),
        ),
    ))
}

/// `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`
fn is_email(s: &str) -> bool {
    if s.chars().any(|c| c.is_whitespace() || c == '\u{feff}') {
        return false;
    }
    let Some((local, domain)) = s.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.contains('@')
        && domain
            .char_indices()
            .any(|(i, c)| c == '.' && i > 0 && i + 1 < domain.len())
}

fn is_address(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Object(_)))
}

/// `generateOrderNumber`: NOR-XXXXX-XXXXX from ~50 random bits, unique.
async fn order_number(pool: &MySqlPool) -> anyhow::Result<String> {
    for _ in 0..6 {
        let bytes = random_bytes::<10>()?;
        let code: String = bytes
            .iter()
            .map(|b| ORDER_ALPHABET[usize::from(b & 31)] as char)
            .collect();
        let candidate = format!("NOR-{}-{}", &code[..5], &code[5..]);
        let taken = sqlx::query_scalar!(
            "SELECT 1 AS taken FROM orders WHERE order_number = ? LIMIT 1",
            candidate
        )
        .fetch_optional(pool)
        .await?;
        if taken.is_none() {
            return Ok(candidate);
        }
    }
    let extra: String = random_bytes::<6>()?
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect();
    Ok(format!("NOR-{extra}"))
}

/// What the request asked to buy, already validated and priced.
struct Checkout {
    order_id: String,
    order_number: String,
    user_id: Option<String>,
    guest_email: Option<String>,
    cart_id: String,
    lines: Vec<Line>,
    coupon: Option<Coupon>,
    subtotal: f64,
    discount: f64,
    tax: f64,
    shipping: f64,
    total: f64,
    shipping_method: &'static str,
    shipping_address: String,
    billing_address: String,
    movement_by: Option<String>,
}

/// Write the order in one transaction. `Ok(Err(message))` is a 409: the
/// coupon or stock ran out between the checks and the write.
async fn write_order(pool: &MySqlPool, c: &Checkout) -> anyhow::Result<Result<(), String>> {
    let mut tx = pool.begin().await?;
    let guest_email = if c.user_id.is_some() {
        None
    } else {
        c.guest_email.as_deref()
    };
    sqlx::query!(
        "INSERT INTO orders (id, order_number, user_id, guest_email, status, subtotal, tax_amount,
           shipping_amount, discount_amount, total_amount, shipping_address_json,
           billing_address_json, shipping_method)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)",
        c.order_id,
        c.order_number,
        c.user_id,
        guest_email,
        c.subtotal,
        c.tax,
        c.shipping,
        c.discount,
        c.total,
        c.shipping_address,
        c.billing_address,
        c.shipping_method
    )
    .execute(&mut *tx)
    .await?;

    if let Some(coupon) = &c.coupon {
        // Only counts while under the limit; the row lock serializes redemptions.
        let used = sqlx::query!(
            "UPDATE discount_codes SET usage_count = usage_count + 1
             WHERE id = ? AND (usage_limit IS NULL OR usage_count < usage_limit)",
            coupon.id
        )
        .execute(&mut *tx)
        .await?;
        if used.rows_affected() == 0 {
            return Ok(Err("Coupon usage limit reached".into()));
        }
        if let (Some(user_id), Some(limit)) = (&c.user_id, coupon.usage_limit_per_customer) {
            let count = sqlx::query_scalar!(
                "SELECT COUNT(*) FROM discount_code_usage WHERE discount_code_id = ? AND user_id = ?",
                coupon.id,
                user_id
            )
            .fetch_one(&mut *tx)
            .await?;
            if count >= i64::from(limit) {
                return Ok(Err(
                    "You have already used this coupon the maximum number of times".into(),
                ));
            }
        }
        sqlx::query!(
            "INSERT INTO discount_code_usage (id, discount_code_id, order_id, user_id, discount_amount)
             VALUES (?, ?, ?, ?, ?)",
            uuid_v4()?,
            coupon.id,
            c.order_id,
            c.user_id,
            c.discount
        )
        .execute(&mut *tx)
        .await?;
    }

    for line in &c.lines {
        sqlx::query!(
            "INSERT INTO order_items (id, order_id, product_id, variant_id, product_name,
               product_sku, quantity, unit_price, total_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            uuid_v4()?,
            c.order_id,
            line.product_id,
            line.variant_id,
            line.name,
            line.sku,
            line.quantity,
            line.price,
            cents(price(line) * f64::from(line.quantity))
        )
        .execute(&mut *tx)
        .await?;
    }

    for line in &c.lines {
        // Check-and-decrement in one statement: fails closed on a stock race.
        let taken = sqlx::query!(
            "UPDATE inventory
               SET quantity_available = quantity_available - ?,
                   quantity_sold = quantity_sold + ?,
                   updated_at = CURRENT_TIMESTAMP
             WHERE product_id = ? AND variant_id <=> ? AND quantity_available >= ?",
            line.quantity,
            line.quantity,
            line.product_id,
            line.variant_id,
            line.quantity
        )
        .execute(&mut *tx)
        .await?;
        if taken.rows_affected() == 0 {
            return Ok(Err(format!(
                "Insufficient stock for \"{}\". Another order may have just taken the last units — please review your cart.",
                line.name
            )));
        }
        if let Some(by) = &c.movement_by
            && let Err(error) = log_sale(&mut tx, c, line, by).await
        {
            // Audit trail only — never undo a valid sale over it.
            tracing::warn!(error = %format!("{error:#}"), "inventory movement log failed");
        }
    }

    sqlx::query!("DELETE FROM cart_items WHERE cart_id = ?", c.cart_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query!("DELETE FROM shopping_carts WHERE id = ?", c.cart_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Ok(()))
}

async fn log_sale(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    c: &Checkout,
    line: &Line,
    by: &str,
) -> anyhow::Result<()> {
    let inventory_id = sqlx::query_scalar!(
        "SELECT id FROM inventory WHERE product_id = ? AND variant_id <=> ? LIMIT 1",
        line.product_id,
        line.variant_id
    )
    .fetch_optional(&mut **tx)
    .await?;
    let Some(inventory_id) = inventory_id else {
        return Ok(());
    };
    let id = sqlx::query_scalar!(r#"SELECT get_next_id('INVMOV') AS "id: String""#)
        .fetch_one(&mut **tx)
        .await?
        .ok_or_else(|| anyhow::anyhow!("transno prefix INVMOV is not registered"))?;
    let details = json!({
        "order_number": c.order_number,
        "product_name": line.name,
        "quantity": line.quantity,
    })
    .to_string();
    sqlx::query!(
        "INSERT INTO inventory_movements
           (id, inventory_id, movement_type, quantity_change, reference_type, reference_id,
            movement_details, created_by)
         VALUES (?, ?, 'sale', ?, 'order', ?, ?, ?)",
        id,
        inventory_id,
        -i64::from(line.quantity),
        c.order_id,
        details,
        by
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// `Number(n).toFixed(2)` for the cents-rounded amounts used here.
fn money(x: f64) -> String {
    format!("{x:.2}")
}

/// `addressPart`: strings and numbers as `String(v)`, anything else dropped.
fn address_part(value: Option<&Value>) -> String {
    match value {
        Some(v @ (Value::String(_) | Value::Number(_))) => js_string(v),
        _ => String::new(),
    }
}

/// `joinParts`: non-empty parts joined with `sep`.
fn join_parts<const N: usize>(parts: [String; N], sep: &str) -> String {
    parts
        .into_iter()
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join(sep)
}

/// `addressLines`: name / street / street 2 / "city, state zip" / country.
fn address_lines(address: &Value) -> Vec<String> {
    let part = |key: &str| address_part(address.get(key));
    let locality = join_parts([part("state"), part("postal_code")], " ");
    [
        join_parts([part("first_name"), part("last_name")], " "),
        part("address_line_1"),
        part("address_line_2"),
        join_parts([part("city"), locality], ", "),
        part("country"),
    ]
    .into_iter()
    .filter(|l| !l.is_empty())
    .collect()
}

/// `emailQueueProducer.orderConfirmationVariables`: the order_confirmation
/// template's variables (migration 014). Raw values — the email daemon escapes
/// them for the HTML body.
fn confirmation_variables(
    c: &Checkout,
    name: &Value,
    shipping_address: &Value,
) -> Map<String, Value> {
    let items: Vec<Value> = c
        .lines
        .iter()
        .map(|l| {
            json!({
                "name": l.name,
                "sku": l.sku,
                "quantity": l.quantity,
                "unit_price": money(price(l)),
                "line_total": money(cents(price(l) * f64::from(l.quantity))),
            })
        })
        .collect();
    let mut variables = Map::new();
    variables.insert("order_number".into(), json!(c.order_number));
    variables.insert("customer_name".into(), name.clone());
    variables.insert("items".into(), Value::Array(items));
    variables.insert("subtotal".into(), json!(money(c.subtotal)));
    variables.insert("has_discount".into(), json!(c.discount > 0.0));
    variables.insert("discount_amount".into(), json!(money(c.discount)));
    variables.insert("shipping_amount".into(), json!(money(c.shipping)));
    variables.insert("tax_amount".into(), json!(money(c.tax)));
    variables.insert("total_amount".into(), json!(money(c.total)));
    variables.insert(
        "shipping_address_lines".into(),
        json!(address_lines(shipping_address)),
    );
    variables
}

/// `POST /api/orders/create`
pub async fn create(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ApiError> {
    let body = body::json(&headers, &body);
    let shipping_address = body.get("shippingAddress");
    let billing_address = body.get("billingAddress");
    if !is_address(shipping_address) || !is_address(billing_address) {
        return Ok(reply(
            StatusCode::BAD_REQUEST,
            failure("Shipping and billing addresses are required"),
        ));
    }
    let shipping_address = shipping_address.expect("checked");
    // `req.body.guestEmail || null`
    let guest_email = body.get("guestEmail").filter(|v| truthy(Some(v)));
    let guest_email = match (&user, guest_email) {
        (None, Some(Value::String(e))) if is_email(e) => Some(e.clone()),
        (None, _) => {
            return Ok(reply(
                StatusCode::BAD_REQUEST,
                failure("A valid email is required for guest checkout"),
            ));
        }
        (Some(_), v) => v.map(js_string),
    };

    let cart_id = body.get("cartId");
    if !owns_cart(&state.pool, cart_id, user.as_ref(), &headers).await? {
        return Ok(reply(StatusCode::FORBIDDEN, failure("Access denied")));
    }
    let cart_id = js_string(cart_id.expect("owned cart id"));
    let lines = cart_lines(&state.pool, &cart_id).await?;
    if lines.is_empty() {
        return Ok(reply(StatusCode::BAD_REQUEST, failure("Cart is empty")));
    }

    for line in &lines {
        let available = sqlx::query_scalar!(
            r#"SELECT CAST(COALESCE(SUM(quantity_available), 0) AS SIGNED) AS "available!: i64"
               FROM inventory WHERE product_id = ? AND variant_id <=> ?"#,
            line.product_id,
            line.variant_id
        )
        .fetch_one(&state.pool)
        .await?;
        if available < i64::from(line.quantity) {
            return Ok(reply(
                StatusCode::BAD_REQUEST,
                failure(&format!(
                    "Insufficient stock for \"{}\". Available: {available}, Requested: {}",
                    line.name, line.quantity
                )),
            ));
        }
    }

    let subtotal = subtotal(&lines);
    let mut discount = 0.0;
    let mut free_shipping = false;
    let mut coupon = None;
    let code = body.get("couponCode");
    if truthy(code) {
        match validate_coupon(&state.pool, &js_string(code.expect("truthy")), subtotal).await? {
            Ok(c) => {
                (discount, free_shipping) = coupon_discount(&c, subtotal);
                coupon = Some(c);
            }
            Err(message) => return Ok(reply(StatusCode::BAD_REQUEST, failure(&message))),
        }
    }

    let rate = tax_rate(
        &state.pool,
        shipping_address.get("state"),
        shipping_address.get("country"),
    )
    .await;
    let tax = cents((subtotal - discount) * rate);

    let (mut shipping_method, mut shipping) = SHIPPING_RATES[0];
    if truthy(body.get("shippingMethod"))
        && let Some(Value::String(wanted)) = body.get("shippingMethod")
        && let Some(&(name, rate)) = SHIPPING_RATES.iter().find(|(n, _)| n == wanted)
    {
        (shipping_method, shipping) = (name, rate);
    }
    if (subtotal >= FREE_SHIPPING_FROM && shipping_method == "STANDARD") || free_shipping {
        shipping = 0.0;
    }
    let total = cents((subtotal + tax + shipping - discount).max(0.0));

    let movement_by = match &user {
        Some(u) => Some(u.id.clone()),
        None => {
            sqlx::query_scalar!(
                "SELECT id FROM users WHERE role = 'admin' AND status = 'active'
                 ORDER BY created_at ASC LIMIT 1"
            )
            .fetch_optional(&state.pool)
            .await?
        }
    };

    let checkout = Checkout {
        order_id: uuid_v4()?,
        order_number: order_number(&state.pool).await?,
        user_id: user.as_ref().map(|u| u.id.clone()),
        guest_email,
        cart_id,
        lines,
        coupon,
        subtotal,
        discount,
        tax,
        shipping,
        total,
        shipping_method,
        shipping_address: shipping_address.to_string(),
        billing_address: billing_address.expect("checked").to_string(),
        movement_by,
    };
    if let Err(message) = write_order(&state.pool, &checkout).await? {
        return Ok(reply(StatusCode::CONFLICT, failure(&message)));
    }

    let to = match &user {
        Some(u) => u.email.clone(),
        None => checkout.guest_email.clone(),
    };
    let name = ["first_name", "firstName"]
        .iter()
        .filter_map(|k| shipping_address.get(*k))
        .find(|v| truthy(Some(v)))
        .cloned()
        .unwrap_or_else(|| json!("Valued Customer"));
    let variables = confirmation_variables(&checkout, &name, shipping_address);
    match to {
        Some(to) => {
            let queued = email_queue::enqueue(
                &state.pool,
                &to,
                &js_string(&name),
                "order_confirmation",
                &variables,
                None,
            )
            .await;
            if let Enqueued::NotQueued { reason } = queued {
                tracing::error!(reason, "order confirmation not queued");
            }
        }
        None => tracing::error!("order confirmation not queued: no email"),
    }

    Ok(reply(
        StatusCode::OK,
        success(
            "Order created successfully",
            json!({ "orderId": checkout.order_id, "orderNumber": checkout.order_number }),
        ),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounding_matches_javascript() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert_eq!(cents(39.99 * 3.0), 119.97);
        assert_eq!(cents(1.005), 1.0); // 1.005 * 100 = 100.49999999999999
    }

    #[test]
    fn email_shape() {
        assert!(is_email("a@b.co"));
        assert!(is_email("a.b@c.d.e"));
        assert!(!is_email("nope"));
        assert!(!is_email("a@b"));
        assert!(!is_email("a@.b"));
        assert!(!is_email("a@b."));
        assert!(!is_email("a b@c.d"));
        assert!(!is_email("a@b@c.d"));
    }

    #[test]
    fn coupon_math() {
        let c = |kind: &str, value: &str, max: Option<&str>| Coupon {
            id: "X".into(),
            kind: kind.into(),
            value: value.into(),
            minimum_order_amount: None,
            maximum_discount_amount: max.map(Into::into),
            usage_limit_per_customer: None,
        };
        assert_eq!(
            coupon_discount(&c("percentage", "10.00", Some("50.00")), 119.97),
            (12.0, false)
        );
        assert_eq!(
            coupon_discount(&c("percentage", "10.00", Some("5.00")), 119.97),
            (5.0, false)
        );
        assert_eq!(
            coupon_discount(&c("fixed_amount", "20.00", None), 15.0),
            (15.0, false)
        );
        assert_eq!(
            coupon_discount(&c("free_shipping", "0.00", None), 60.0),
            (0.0, true)
        );
    }

    #[test]
    fn address_lines_skip_blanks_like_node() {
        let a = json!({ "first_name": "Ada", "last_name": "", "address_line_1": "1 Silk Way",
            "address_line_2": "", "city": "Austin", "state": "TX", "postal_code": 73301,
            "country": "US", "phone": "555" });
        assert_eq!(
            address_lines(&a),
            ["Ada", "1 Silk Way", "Austin, TX 73301", "US"]
        );
        let b = json!({ "first_name": ["x"], "city": "", "state": "", "postal_code": "10001" });
        assert_eq!(address_lines(&b), ["10001"]);
        assert!(address_lines(&json!({})).is_empty());
    }

    #[test]
    fn money_has_two_decimals() {
        assert_eq!(money(0.0), "0.00");
        assert_eq!(money(9.99), "9.99");
        assert_eq!(money(cents(39.99 * 3.0)), "119.97");
        assert_eq!(money(12.5), "12.50");
    }
}
