//! `/api/database` — backend/routes/databaseRoutes.js (connection test, tables,
//! transno, the dev-only raw `SELECT` `/query`; see `crate::mysql_json`).
//!
//! Not ported yet: an empty router, wired into `lib.rs` so the port only has to
//! fill this file in. While the group stays on Node (RUST_API_ROUTES), nothing
//! reaches it.

use crate::AppState;

pub fn router(_state: &AppState) -> axum::Router<AppState> {
    axum::Router::new()
}
