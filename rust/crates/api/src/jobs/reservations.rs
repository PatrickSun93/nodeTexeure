//! `InventoryService.releaseExpiredReservations()`: every stock reservation
//! past `expires_at` gives its quantity back to `inventory.quantity_reserved`
//! and is deleted.
//!
//! Unlike the original Node loop (update all, then one `DELETE … WHERE
//! expires_at < NOW()`), each reservation is deleted by id and released in the
//! same transaction, and only when that delete removed it. So a run never
//! releases a reservation twice, never deletes one it didn't release (one that
//! expired between the SELECT and the DELETE), and a failed update leaves the
//! reservation for the next run. backend/services/inventoryService.js does the
//! same now.

use sqlx::MySqlPool;

/// `{ released_count, total_expired }`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Released {
    pub released_count: u64,
    pub total_expired: u64,
}

pub async fn release_expired(pool: &MySqlPool) -> anyhow::Result<Released> {
    let expired = sqlx::query!(
        "SELECT id, product_id, variant_id, quantity
         FROM stock_reservations
         WHERE expires_at < NOW()"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| anyhow::anyhow!("Failed to fetch expired reservations: {e}"))?;

    let mut released = Released {
        released_count: 0,
        total_expired: expired.len() as u64,
    };
    for r in expired {
        match release_one(
            pool,
            &r.id,
            &r.product_id,
            r.variant_id.as_deref(),
            r.quantity,
        )
        .await
        {
            Ok(true) => released.released_count += 1,
            Ok(false) => {}
            Err(err) => {
                tracing::error!(error = %err, reservation = %r.id, "failed to release reservation");
            }
        }
    }
    Ok(released)
}

/// Deletes one reservation and returns its stock; `false` when another run
/// already did.
async fn release_one(
    pool: &MySqlPool,
    id: &str,
    product_id: &str,
    variant_id: Option<&str>,
    quantity: u32,
) -> anyhow::Result<bool> {
    let mut tx = pool.begin().await?;
    let deleted = sqlx::query!(
        "DELETE FROM stock_reservations WHERE id = ? AND expires_at < NOW()",
        id
    )
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if deleted == 0 {
        tx.rollback().await?;
        return Ok(false);
    }
    // `variant_id = ?`, or `IS NULL` for a falsy one (Node's
    // `reservation.variant_id ? '= ?' : 'IS NULL'`). The column is unsigned:
    // clamp at 0 rather than fail with "out of range" forever.
    let variant = variant_id.filter(|v| !v.is_empty());
    sqlx::query!(
        "UPDATE inventory
         SET quantity_reserved = GREATEST(CAST(quantity_reserved AS SIGNED) - CAST(? AS SIGNED), 0)
         WHERE product_id = ? AND variant_id <=> ?",
        quantity,
        product_id,
        variant
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(true)
}
