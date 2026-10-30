//! NodeTexeure HTTP API in Rust. Route groups move here from the Express backend
//! one at a time; the storefront proxy (next.config.mjs, `RUST_API_ROUTES`)
//! decides which groups this service answers.

pub mod auth;
pub mod body;
pub mod error;
pub mod params;
pub mod routes;

use std::time::Duration;

use axum::Router;
use axum::http::{HeaderName, HeaderValue, StatusCode, header};
use axum::routing::{delete, get, post, put};
use sqlx::MySqlPool;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
pub struct AppState {
    pub pool: MySqlPool,
    pub jwt: auth::JwtKey,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(routes::health::health))
        .route("/api/products", get(routes::products::list))
        .route("/api/products/by-ids", get(routes::products::by_ids))
        .route("/api/products/{id}", get(routes::products::detail))
        .route(
            "/api/search/autocomplete",
            get(routes::search::autocomplete),
        )
        .route("/api/search/suggestions", get(routes::search::suggestions))
        .route("/api/search/recent", get(routes::search::recent))
        .route("/api/journal", get(routes::journal::list))
        .route("/api/journal/{id_or_slug}", get(routes::journal::detail))
        .route("/api/settings/public", get(routes::settings::public))
        .route("/api/cart", get(routes::cart::get))
        .route("/api/cart/add", post(routes::cart::add))
        .route("/api/cart/update/{item_id}", put(routes::cart::update))
        .route("/api/cart/remove/{item_id}", delete(routes::cart::remove))
        .route("/api/orders/my-orders", get(routes::orders::my_orders))
        .route(
            "/api/orders/track/{order_number}",
            get(routes::orders::track),
        )
        .route("/api/orders/{id}", get(routes::orders::detail))
        .route(
            "/api/wishlist",
            get(routes::wishlist::list).post(routes::wishlist::add),
        )
        .route(
            "/api/wishlist/check/{product_id}",
            get(routes::wishlist::check),
        )
        .route(
            "/api/wishlist/{product_id}",
            delete(routes::wishlist::remove),
        )
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
