//! `POST /api/admin/logout` (backend/routes/admin/index.js): the back-office
//! logout. Behind E's `protect, staffOrAdmin, adminLimiter, csrfProtection`,
//! plus the route's own `staffOrAdmin`. Revokes the session server-side
//! (`token_version` bump, refresh tokens deleted) so a copied `admin_auth`
//! cookie stops working too, then clears the `admin_auth` and `csrf_token`
//! cookies.
//!
//! The reference port for an `/api/admin` route: registration with the
//! route's own steps, a handler taking [`AdminRequest`], and Node's
//! `executeQuery` semantics (a failed query is logged, never thrown, so the
//! route still answers success).

use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use common::response::{failure, success};
use serde_json::json;

use crate::admin::{AdminRequest, Routes, Step, json};

pub fn register(r: &mut Routes) {
    // router.post('/logout', staffOrAdmin, handler)
    r.post("/logout", &[Step::StaffOrAdmin], logout);
}

async fn logout(req: AdminRequest) -> Response {
    let pool = &req.state.pool;
    let id = &req.user().id;
    // `await DatabaseUtil.executeQuery(...)` never throws: failures are only
    // `{ success: false }`, which the route ignores.
    if let Err(err) = sqlx::query!(
        "UPDATE users SET token_version = token_version + 1 WHERE id = ?",
        id
    )
    .execute(pool)
    .await
    {
        tracing::error!(error = %err, "admin logout: token_version bump failed");
    }
    if let Err(err) = sqlx::query!("DELETE FROM refresh_tokens WHERE user_id = ?", id)
        .execute(pool)
        .await
    {
        tracing::error!(error = %err, "admin logout: refresh token cleanup failed");
    }
    match crate::cookies::logout_cookies(Utc::now()) {
        Ok([auth, csrf]) => {
            let mut response = json(
                StatusCode::OK,
                success("Logged out successfully", json!([])),
            );
            let headers = response.headers_mut();
            headers.append(header::SET_COOKIE, auth);
            headers.append(header::SET_COOKIE, csrf);
            response
        }
        Err(err) => {
            tracing::error!(error = %err, "Admin logout error");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(failure("Logout failed")),
            )
                .into_response()
        }
    }
}
