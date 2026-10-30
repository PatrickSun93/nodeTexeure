//! NodeTexeure HTTP API in Rust. Route groups move here from the Express backend
//! one at a time; the storefront proxy (next.config.mjs, `RUST_API_ROUTES`)
//! decides which groups this service answers.

pub mod error;
pub mod params;
pub mod routes;

use std::time::Duration;

use axum::Router;
use axum::http::{HeaderName, HeaderValue, StatusCode, header};
use axum::routing::get;
use sqlx::MySqlPool;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
pub struct AppState {
    pub pool: MySqlPool,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(routes::health::health))
        .route("/api/products", get(routes::products::list))
        .route("/api/products/by-ids", get(routes::products::by_ids))
        .route("/api/products/{id}", get(routes::products::detail))
        .fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                axum::Json(common::response::failure("Endpoint not found")),
            )
        })
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::with_status_code(
            StatusCode::GATEWAY_TIMEOUT,
            Duration::from_secs(30),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        // Which service answered — useful while route groups move over.
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("x-served-by"),
            HeaderValue::from_static("rust-api"),
        ))
}
