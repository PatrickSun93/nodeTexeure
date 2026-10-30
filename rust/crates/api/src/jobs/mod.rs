//! Background jobs, run by the `worker` binary (src/bin/worker.rs) instead of
//! the Node backend's timers:
//!
//! * [`migrate`]: backend/scripts/migrate.js (schema migrations).
//! * [`reservations`]: `InventoryService.releaseExpiredReservations`, every
//!   15 minutes (server.js).
//! * [`abandoned_cart`]: `AbandonedCartService.detectAbandonedCarts`, every
//!   15 minutes (its `startAbandonedCartDetection`).
//!
//! Node and Rust may both be running (Node stays the rollback target), so each
//! job runs under a MySQL named lock ([`with_lock`]); backend/utils/jobLock.js
//! takes the same names. A run that finds the lock held is skipped, not queued.

pub mod abandoned_cart;
pub mod migrate;
pub mod reservations;

use std::future::Future;

use sqlx::MySqlPool;

/// `GET_LOCK` name of the reservation release (backend/utils/jobLock.js).
pub const RELEASE_RESERVATIONS_LOCK: &str = "nodetexeure:release_expired_reservations";
/// `GET_LOCK` name of the abandoned-cart detection.
pub const ABANDONED_CART_LOCK: &str = "nodetexeure:abandoned_cart_detection";
/// `GET_LOCK` name of the migration runner (backend/scripts/migrate.js).
pub const MIGRATIONS_LOCK: &str = "nodetexeure:migrations";

/// Runs `job` while holding the named lock on a dedicated connection, or
/// returns `Ok(None)` without running it when another instance holds it.
/// MySQL drops the lock if this process dies, so it can never stay stuck.
pub async fn with_lock<T, F>(pool: &MySqlPool, name: &str, job: F) -> anyhow::Result<Option<T>>
where
    F: Future<Output = T>,
{
    let mut conn = pool.acquire().await?;
    let got = sqlx::query_scalar!("SELECT GET_LOCK(?, 0)", name)
        .fetch_one(&mut *conn)
        .await?;
    if got != Some(1) {
        return Ok(None);
    }
    let out = job.await;
    // Not fatal: the lock goes when the connection closes anyway.
    if let Err(err) = sqlx::query_scalar!("SELECT RELEASE_LOCK(?)", name)
        .fetch_one(&mut *conn)
        .await
    {
        tracing::warn!(error = %err, lock = name, "RELEASE_LOCK failed; closing the connection");
        let _ = conn.detach();
    }
    Ok(Some(out))
}
