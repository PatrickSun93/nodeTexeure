//! NodeTexeure HTTP API in Rust. Route groups move here from the Express backend
//! one at a time; the storefront proxy (next.config.mjs, `RUST_API_ROUTES`)
//! decides which groups this service answers.

pub mod auth;
pub mod body;
pub mod client_ip;
pub mod cookies;
pub mod csrf;
pub mod email_queue;
pub mod error;
pub mod params;
pub mod password;
pub mod ratelimit;
pub mod routes;
pub mod tokens;

// unsubscribe, newsletter, contact, status, shipping (wf/misc)
pub mod express;
pub mod fedex;
pub mod qs;

use std::time::Duration;

use axum::Router;
use axum::extract::State;
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
    /// `CSRF_SECRET || JWT_SECRET`.
    pub csrf: csrf::CsrfKey,
    /// `TRUST_PROXY` hops, for `req.ip` (rate limits).
    pub trust_proxy: client_ip::TrustProxy,
}

impl AppState {
    /// State from the environment (`JWT_SECRET`, `CSRF_SECRET`, `TRUST_PROXY`).
    pub fn new(pool: MySqlPool, jwt_secret: Option<&str>) -> Self {
        Self {
            pool,
            jwt: auth::JwtKey::from_secret(jwt_secret),
            csrf: csrf::CsrfKey::from_env(),
            trust_proxy: client_ip::TrustProxy::from_env(),
        }
    }
}

/// `GET /api/orders/<name>` for a POST-only order path: Express treats `name`
/// as an order id (so the answer is "Order not found"), not as 405.
fn get_order_named(name: &'static str) -> axum::routing::MethodRouter<AppState> {
    get(
        move |State(state): State<AppState>, user: auth::OptionalUser| async move {
            routes::orders::detail_of(&state, user, name.to_owned()).await
        },
    )
}

/// The API with the global `/api` rate limiter configured from the
/// environment (`RATE_LIMIT_*`, like backend/server.js).
pub fn router(state: AppState) -> Router {
    let global =
        ratelimit::RateLimiter::under(ratelimit::presets::global(), state.trust_proxy, "/api");
    router_with_limiter(state, global)
}

/// The API with a given global limiter (tests).
pub fn router_with_limiter(state: AppState, global: ratelimit::RateLimiter) -> Router {
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
        .route(
            "/api/orders/create",
            post(routes::checkout::create).merge(get_order_named("create")),
        )
        .route(
            "/api/orders/apply-coupon",
            post(routes::checkout::apply_coupon).merge(get_order_named("apply-coupon")),
        )
        .route(
            "/api/orders/calculate-tax",
            post(routes::checkout::calculate_tax).merge(get_order_named("calculate-tax")),
        )
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
        // unsubscribe, newsletter, contact, status, shipping (wf/misc)
        .merge(routes::unsubscribe::router())
        .merge(routes::newsletter::router())
        .merge(routes::contact::router())
        .merge(routes::status::router())
        .merge(routes::shipping::router(state.trust_proxy))
        .fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                axum::Json(common::response::failure("Endpoint not found")),
            )
        })
        .with_state(state)
        // express-rate-limit on `/api`, before anything else answers.
        .layer(global.layer())
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
