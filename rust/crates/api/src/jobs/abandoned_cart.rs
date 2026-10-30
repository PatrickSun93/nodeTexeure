//! `AbandonedCartService.detectAbandonedCarts()` and `initiateCartRecovery()`:
//! up to 50 carts with items, idle for 30+ minutes and not already in a
//! recovery, get an `abandoned_cart_recovery` row and (for a customer with an
//! email) the 3-step `abandoned_cart` email sequence.
//!
//! Same queries, ids, token, variables and order as the Node service; the
//! emails go through [`crate::email_queue`] like the cart routes' manual
//! `track-abandonment`. A failure for one cart is logged and the others go on,
//! as in Node.

use sqlx::MySqlPool;

use crate::auth::JwtKey;
use crate::email_queue::{self, AbandonedCart, CartLine};
use crate::tokens::{hex, random_bytes};

/// One candidate from the detection query.
struct Candidate {
    cart_id: String,
    user_email: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    cart_total: Option<String>,
}

/// `{ processedCarts }`: how many candidates the run found (each was
/// attempted, as Node counts them).
pub async fn detect(pool: &MySqlPool, key: &JwtKey) -> anyhow::Result<usize> {
    // sc.updated_at stays selected: DISTINCT needs the ORDER BY column.
    let carts = sqlx::query!(
        r#"SELECT DISTINCT
             sc.id AS cart_id,
             sc.updated_at AS last_activity,
             u.email AS user_email,
             u.first_name,
             u.last_name,
             CAST(SUM(ci.quantity * ci.price) AS CHAR) AS cart_total
           FROM shopping_carts sc
           LEFT JOIN users u ON sc.user_id = u.id
           INNER JOIN cart_items ci ON sc.id = ci.cart_id
           LEFT JOIN abandoned_cart_recovery acr ON sc.id = acr.cart_id AND acr.recovered_at IS NULL
           WHERE sc.updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
           AND acr.id IS NULL
           GROUP BY sc.id, sc.user_id, sc.session_id, sc.updated_at, u.email, u.first_name, u.last_name
           HAVING COUNT(ci.id) > 0
           ORDER BY sc.updated_at DESC
           LIMIT 50"#
    )
    .fetch_all(pool)
    .await?;
    let carts: Vec<Candidate> = carts
        .into_iter()
        .map(|c| Candidate {
            cart_id: c.cart_id,
            user_email: c.user_email,
            first_name: c.first_name,
            last_name: c.last_name,
            cart_total: c.cart_total,
        })
        .collect();
    tracing::info!("Found {} abandoned carts to process", carts.len());
    for cart in &carts {
        if let Err(err) = initiate_recovery(pool, key, cart).await {
            tracing::error!(error = %err, cart_id = %cart.cart_id, "Failed to initiate cart recovery");
        }
    }
    Ok(carts.len())
}

/// `RECOVERY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`.
fn recovery_id() -> anyhow::Result<String> {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let suffix: String = random_bytes::<9>()?
        .iter()
        .map(|b| char::from(DIGITS[usize::from(*b) % 36]))
        .collect();
    Ok(format!(
        "RECOVERY_{}_{suffix}",
        chrono::Utc::now().timestamp_millis()
    ))
}

async fn initiate_recovery(pool: &MySqlPool, key: &JwtKey, cart: &Candidate) -> anyhow::Result<()> {
    let Some(email) = cart.user_email.as_deref().filter(|e| !e.is_empty()) else {
        tracing::info!(cart_id = %cart.cart_id, "Skipping cart recovery - no email available");
        return Ok(());
    };
    // crypto.randomBytes(32).toString('hex').
    let token = hex(&random_bytes::<32>()?);
    let id = recovery_id()?;
    sqlx::query!(
        "INSERT INTO abandoned_cart_recovery (
           id, cart_id, email, recovery_token, created_at
         ) VALUES (?, ?, ?, ?, NOW())",
        id,
        cart.cart_id,
        email,
        token
    )
    .execute(pool)
    .await?;

    let items = sqlx::query!(
        "SELECT ci.quantity, p.name
         FROM cart_items ci
         JOIN products p ON ci.product_id = p.id
         LEFT JOIN product_variants pv ON ci.variant_id = pv.id
         WHERE ci.cart_id = ?
         ORDER BY ci.created_at ASC",
        cart.cart_id
    )
    .fetch_all(pool)
    .await?;
    if items.is_empty() {
        tracing::warn!(cart_id = %cart.cart_id, "No cart items found for recovery email");
        return Ok(());
    }

    let name = format!(
        "{} {}",
        cart.first_name.as_deref().unwrap_or(""),
        cart.last_name.as_deref().unwrap_or("")
    );
    let name = match name.trim() {
        "" => "Customer".to_owned(),
        n => n.to_owned(),
    };
    // parseFloat(cart_total).toFixed(2) (NaN for a NULL total, as Node).
    let total = cart
        .cart_total
        .as_deref()
        .and_then(|t| t.parse::<f64>().ok())
        .unwrap_or(f64::NAN);
    let data = AbandonedCart {
        items: items
            .into_iter()
            .map(|i| CartLine {
                name: i.name,
                quantity: i64::from(i.quantity),
            })
            .collect(),
        total_amount: common::json::js_to_fixed(total, 2),
        checkout_url: Some(format!("{}/cart-recovery?recovery={token}", frontend_url())),
        customer_name: Some(name),
    };

    email_queue::cancel_abandoned_cart_emails(pool, email).await;
    let mut queued = 0u32;
    for step in 1..=3 {
        if email_queue::queue_abandoned_cart_email(pool, key, email, &data, step)
            .await?
            .is_some()
        {
            queued += 1;
        }
    }
    sqlx::query!(
        "UPDATE abandoned_cart_recovery
         SET email_sent_count = ?, last_email_sent_at = NOW()
         WHERE id = ?",
        queued,
        id
    )
    .execute(pool)
    .await?;
    tracing::info!(cart_id = %cart.cart_id, recovery_id = %id, queued, "Cart recovery initiated successfully");
    Ok(())
}

/// `process.env.FRONTEND_URL || 'http://localhost:3000'` (no NEXTAUTH_URL
/// fallback and no trailing-slash trim here, unlike the unsubscribe links).
fn frontend_url() -> String {
    std::env::var("FRONTEND_URL")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "http://localhost:3000".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_ids_look_like_node() {
        let id = recovery_id().unwrap();
        let rest = id.strip_prefix("RECOVERY_").unwrap();
        let (ms, suffix) = rest.split_once('_').unwrap();
        assert!(ms.parse::<i64>().is_ok());
        assert_eq!(suffix.len(), 9);
        assert!(
            suffix
                .bytes()
                .all(|b| b.is_ascii_digit() || b.is_ascii_lowercase())
        );
        assert!(id.len() <= 50); // abandoned_cart_recovery.id is VARCHAR(50)
    }
}
