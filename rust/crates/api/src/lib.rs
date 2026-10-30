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
// Express Router matching + qs for whole-group dispatchers (reviews, returns).
pub mod express_router;
pub mod params;
pub mod password;
pub mod ratelimit;
pub mod routes;
pub mod tokens;

// unsubscribe, newsletter, contact, status, shipping (wf/misc)
pub mod express;
pub mod fedex;
pub mod qs;

// Wave B foundation: the /api/admin dispatcher, multer, mysql2-style rows,
// CSV (papaparse) and Express's res.send.
pub mod admin;
pub mod csv;
pub mod express_send;
pub mod multer;
pub mod mysql_json;

// /api/payments and /api/images (wf/payments_images): the Stripe client and
// webhook verification, S3 / local upload storage, sharp-style thumbnails,
// and V8's JSON.parse (its exact error messages).
pub mod imaging;
pub mod s3;
pub mod stripe;
pub mod v8_json;

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
    /// The `/api/admin` routes and their limiter stores (see [`admin`]).
    pub back_office: std::sync::Arc<admin::BackOffice>,
}

impl AppState {
    /// State from the environment (`JWT_SECRET`, `CSRF_SECRET`, `TRUST_PROXY`).
    pub fn new(pool: MySqlPool, jwt_secret: Option<&str>) -> Self {
        let trust_proxy = client_ip::TrustProxy::from_env();
        Self {
            pool,
            jwt: auth::JwtKey::from_secret(jwt_secret),
            csrf: csrf::CsrfKey::from_env(),
            trust_proxy,
            back_office: std::sync::Arc::new(admin::BackOffice::new(trust_proxy)),
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
        // The whole /api/cart and /api/abandoned-cart groups. Another method on
        // a known path, or an unknown sub-path, gets Express's 404 (never 405).
        .route("/api/cart", routes::cart::express(get(routes::cart::get)))
        .route(
            "/api/cart/add",
            routes::cart::express(post(routes::cart::add)),
        )
        .route(
            "/api/cart/update/{item_id}",
            routes::cart::express(put(routes::cart::update)),
        )
        .route(
            "/api/cart/remove/{item_id}",
            routes::cart::express(delete(routes::cart::remove)),
        )
        .route(
            "/api/cart/reserve-stock",
            routes::cart::express(post(routes::cart::reserve_stock)),
        )
        .route(
            "/api/cart/track-abandonment",
            routes::cart::express(post(routes::cart::track_abandonment)),
        )
        .route(
            "/api/cart/cancel-abandonment",
            routes::cart::express(post(routes::cart::cancel_abandonment)),
        )
        .route(
            "/api/cart/{*rest}",
            axum::routing::any(routes::cart::express_not_found),
        )
        .route(
            "/api/abandoned-cart/recovery/{token}",
            routes::cart::express(get(routes::abandoned_cart::recovery)),
        )
        .route(
            "/api/abandoned-cart",
            axum::routing::any(routes::cart::express_not_found),
        )
        .route(
            "/api/abandoned-cart/{*rest}",
            axum::routing::any(routes::cart::express_not_found),
        )
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
        // /api/users auth half (routes/users_auth.rs), each route behind its
        // Node rate limiter.
        .merge(routes::users_auth::router(state.trust_proxy))
        // /api/users account routes (profile, addresses, admin users) and the
        // group's Express 404s. The auth paths (login, register, …) are exact
        // routes and take precedence over this catch-all.
        .route(
            "/api/users",
            axum::routing::any(routes::users_account::dispatch),
        )
        .route(
            "/api/users/",
            axum::routing::any(routes::users_account::dispatch),
        )
        .route(
            "/api/users/{*rest}",
            axum::routing::any(routes::users_account::dispatch),
        )
        // reviews + returns: every path under their mount points, routed the
        // way the Express router does it (crate::express_router).
        .merge(routes::reviews::router())
        .merge(routes::returns::router())
        // unsubscribe, newsletter, contact, status, shipping (wf/misc)
        .merge(routes::unsubscribe::router())
        .merge(routes::newsletter::router())
        .merge(routes::contact::router())
        .merge(routes::status::router())
        .merge(routes::shipping::router(state.trust_proxy))
        // Wave B: the whole /api/admin subtree (crate::admin), and the groups
        // being ported next (empty until their port lands).
        .merge(admin::router())
        .merge(routes::database::router(&state))
        .merge(routes::payments::router(&state))
        .merge(routes::images::router(&state))
        .fallback(
            |State(state): State<AppState>, req: axum::extract::Request| async move {
                // Express mounts match case-insensitively: `/API/Admin/…` is
                // still the admin subtree.
                if admin::is_admin_path(req.uri().path()) {
                    return admin::dispatch(State(state), req).await;
                }
                axum::response::IntoResponse::into_response((
                    StatusCode::NOT_FOUND,
                    axum::Json(common::response::failure("Endpoint not found")),
                ))
            },
        )
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
