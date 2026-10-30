//! The `/api/admin` subtree, routed exactly the way backend/server.js mounts it:
//!
//! ```text
//! app.use('/api/admin/analytics',       analyticsRoutes)                      // A
//! app.use('/api/admin/email-queue',     emailQueueRoutes)                     // B
//! app.use('/api/admin/bulk',            protect, admin, bulkOperationsRoutes) // C
//! app.use('/api/admin/email-templates', protect, admin, emailTemplateRoutes)  // D
//! app.use('/api/admin',                 protect, staffOrAdmin, adminRouter)   // E
//!   adminRouter: router.use(adminLimiter); router.use(csrfProtection);
//!                POST /logout, then products, coupons, inventory, users,
//!                orders, analytics, settings (each mounted at '/')
//! app.use('*', 404)
//! ```
//!
//! A request walks the mounts in that order. A mount whose path matches
//! (case-insensitively, on a segment boundary) runs its mount-level steps
//! (`protect, admin` for C and D), then its router-level steps (E's limiter
//! and CSRF check — run for *every* request that reaches E, routed or not),
//! then its routes in registration order. No route → the next mount, and after
//! E the app's 404. So `POST /api/admin/nope` from an admin without a CSRF
//! token is E's 403, `GET /api/admin/bulk/nope` from staff is C's admin 403,
//! and `GET /api/admin/analytics/nope` without a token is E's 401.
//!
//! Before any of that, as in Express: OPTIONS is the CORS preflight's 204, and
//! a JSON/urlencoded body that `express.json()`/`express.urlencoded()` rejects
//! is the error handler's 500. A route param that `decodeURIComponent`
//! rejects is the error handler's 500 once its route's path matches.
//!
//! # Plugging in an area
//!
//! Each Node router has its own registration function under
//! `routes/admin/` (see [`BackOffice::new`] for the order); a porter fills in
//! only their own file:
//!
//! ```ignore
//! pub fn register(r: &mut Routes) {
//!     use crate::admin::{Limiter::*, Step::*};
//!     // router.get('/coupons', admin, adminReadLimiter, handler)
//!     r.get("/coupons", &[Admin, Limit(AdminRead)], list);
//!     // router.post('/coupons', admin, adminWriteLimiter, csrfProtection, handler)
//!     r.post("/coupons", &[Admin, Limit(AdminWrite), Csrf], create);
//! }
//! async fn list(req: AdminRequest) -> Response { ... }
//! ```
//!
//! Paths are relative to the mount (E's routes keep their full sub-path, like
//! `/coupons/:id`); the steps are the route's own middleware, in order, and
//! run after the mount's. The handler gets an [`AdminRequest`]: the signed-in
//! user, decoded params, `req.query`, the parsed body (or the unread body for
//! multipart, see [`crate::multer`]). Rate-limit headers set by any limiter on
//! the way are added to whatever the handler answers.

use std::future::Future;
use std::net::IpAddr;
use std::pin::Pin;
use std::sync::Arc;

use axum::Json;
use axum::body::Body;
use axum::extract::{FromRequestParts, Request, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value};

use crate::AppState;
use crate::auth::{AuthError, AuthUser};
use crate::client_ip::TrustProxy;
use crate::express_router::{self, Routed, Verb};
use crate::ratelimit::{self, RateLimiter};

/// Where the subtree is mounted.
pub const PREFIX: &str = "/api/admin";

/// The rate limiters of the admin routes. Each is one store, like one
/// `rateLimit()` instance in Node: `routes/admin/limiters.js` exports one
/// instance of each that every admin area shares, and `emailQueueRoutes.js`
/// creates its own read/write pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Limiter {
    /// limiters.js `adminLimiter` (100/min), E's router-level limiter.
    Admin,
    /// limiters.js `adminReadLimiter` (300/min).
    AdminRead,
    /// limiters.js `adminWriteLimiter` (60/min).
    AdminWrite,
    /// emailQueueRoutes.js's own `adminReadLimiter` (300/min).
    EmailQueueRead,
    /// emailQueueRoutes.js's own `adminWriteLimiter` (60/min).
    EmailQueueWrite,
}

/// One Express middleware in front of a handler.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// `protect`: resolve the token and re-read the user (401s).
    Protect,
    /// `admin`: the user must be an admin (403).
    Admin,
    /// `staffOrAdmin`: admin or staff (403).
    StaffOrAdmin,
    /// A `rateLimit()` instance (429, plus RateLimit-* headers).
    Limit(Limiter),
    /// `csrfProtection` (writes only).
    Csrf,
}

/// The `app.use` mounts under `/api/admin`, in server.js order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mount {
    /// `/api/admin/analytics` → routes/analyticsRoutes.js.
    Analytics,
    /// `/api/admin/email-queue` → routes/emailQueueRoutes.js.
    EmailQueue,
    /// `/api/admin/bulk` → `protect, admin`, routes/bulkOperationsRoutes.js.
    Bulk,
    /// `/api/admin/email-templates` → `protect, admin`, routes/emailTemplateRoutes.js.
    EmailTemplates,
    /// `/api/admin` → `protect, staffOrAdmin`, routes/admin/index.js.
    Admin,
}

impl Mount {
    pub const ALL: [Mount; 5] = [
        Mount::Analytics,
        Mount::EmailQueue,
        Mount::Bulk,
        Mount::EmailTemplates,
        Mount::Admin,
    ];

    pub fn path(self) -> &'static str {
        match self {
            Mount::Analytics => "/api/admin/analytics",
            Mount::EmailQueue => "/api/admin/email-queue",
            Mount::Bulk => "/api/admin/bulk",
            Mount::EmailTemplates => "/api/admin/email-templates",
            Mount::Admin => "/api/admin",
        }
    }

    /// `app.use(path, ...these, router)`.
    fn mount_steps(self) -> &'static [Step] {
        match self {
            Mount::Analytics | Mount::EmailQueue => &[],
            Mount::Bulk | Mount::EmailTemplates => &[Step::Protect, Step::Admin],
            Mount::Admin => &[Step::Protect, Step::StaffOrAdmin],
        }
    }

    /// `router.use(...)` registered before the routes.
    fn router_steps(self) -> &'static [Step] {
        match self {
            Mount::Admin => &[Step::Limit(Limiter::Admin), Step::Csrf],
            _ => &[],
        }
    }
}

/// The boxed future a handler returns.
pub type HandlerFuture = Pin<Box<dyn Future<Output = Response> + Send>>;
type Handler = Arc<dyn Fn(AdminRequest) -> HandlerFuture + Send + Sync>;

struct Route {
    steps: Vec<Step>,
    handler: Handler,
}

/// A mount's routes while they are registered (see the module docs).
pub struct Routes {
    mount: Mount,
    table: Vec<(Verb, &'static str, usize)>,
    routes: Vec<Route>,
}

impl Routes {
    fn new(mount: Mount) -> Self {
        Self {
            mount,
            table: Vec::new(),
            routes: Vec::new(),
        }
    }

    /// Which mount these routes belong to.
    pub fn mount(&self) -> Mount {
        self.mount
    }

    fn add<H, F>(&mut self, verb: Verb, path: &'static str, steps: &[Step], handler: H)
    where
        H: Fn(AdminRequest) -> F + Send + Sync + 'static,
        F: Future<Output = Response> + Send + 'static,
    {
        assert!(
            path.starts_with('/'),
            "admin route {path:?} must start with '/'"
        );
        // Every handler reads `req.user`: some `protect` must run first.
        let protected = self.mount.mount_steps().first() == Some(&Step::Protect)
            || steps.first() == Some(&Step::Protect);
        assert!(
            protected,
            "admin route {verb:?} {path} on {:?} has no `protect` before its handler",
            self.mount
        );
        let handler: Handler = Arc::new(move |req| Box::pin(handler(req)));
        self.table.push((verb, path, self.routes.len()));
        self.routes.push(Route {
            steps: steps.to_vec(),
            handler,
        });
    }

    /// `router.get(path, ...steps, handler)` (also answers HEAD).
    pub fn get<H, F>(&mut self, path: &'static str, steps: &[Step], handler: H)
    where
        H: Fn(AdminRequest) -> F + Send + Sync + 'static,
        F: Future<Output = Response> + Send + 'static,
    {
        self.add(Verb::Get, path, steps, handler);
    }

    /// `router.post(path, ...steps, handler)`.
    pub fn post<H, F>(&mut self, path: &'static str, steps: &[Step], handler: H)
    where
        H: Fn(AdminRequest) -> F + Send + Sync + 'static,
        F: Future<Output = Response> + Send + 'static,
    {
        self.add(Verb::Post, path, steps, handler);
    }

    /// `router.put(path, ...steps, handler)`.
    pub fn put<H, F>(&mut self, path: &'static str, steps: &[Step], handler: H)
    where
        H: Fn(AdminRequest) -> F + Send + Sync + 'static,
        F: Future<Output = Response> + Send + 'static,
    {
        self.add(Verb::Put, path, steps, handler);
    }

    /// `router.delete(path, ...steps, handler)`.
    pub fn delete<H, F>(&mut self, path: &'static str, steps: &[Step], handler: H)
    where
        H: Fn(AdminRequest) -> F + Send + Sync + 'static,
        F: Future<Output = Response> + Send + 'static,
    {
        self.add(Verb::Delete, path, steps, handler);
    }

    /// How many routes are registered.
    pub fn len(&self) -> usize {
        self.routes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.routes.is_empty()
    }
}

/// The whole subtree: every mount's routes and the limiter stores. Built once
/// per [`AppState`].
pub struct BackOffice {
    mounts: Vec<Routes>,
    admin: RateLimiter,
    admin_read: RateLimiter,
    admin_write: RateLimiter,
    email_queue_read: RateLimiter,
    email_queue_write: RateLimiter,
}

impl std::fmt::Debug for BackOffice {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BackOffice")
            .field(
                "routes",
                &self
                    .mounts
                    .iter()
                    .map(|m| (m.mount, m.len()))
                    .collect::<Vec<_>>(),
            )
            .finish_non_exhaustive()
    }
}

impl BackOffice {
    /// Registers every area in server.js / routes/admin/index.js order.
    pub fn new(trust: TrustProxy) -> Self {
        use crate::routes::admin as area;
        let mut mounts = Vec::new();
        for mount in Mount::ALL {
            let mut r = Routes::new(mount);
            match mount {
                Mount::Analytics => area::analytics_routes::register(&mut r),
                Mount::EmailQueue => area::email_queue::register(&mut r),
                Mount::Bulk => area::bulk::register(&mut r),
                Mount::EmailTemplates => area::email_templates::register(&mut r),
                Mount::Admin => {
                    area::logout::register(&mut r);
                    area::products::register(&mut r);
                    area::coupons::register(&mut r);
                    area::inventory::register(&mut r);
                    area::users::register(&mut r);
                    area::orders::register(&mut r);
                    area::analytics::register(&mut r);
                    area::settings::register(&mut r);
                }
            }
            mounts.push(r);
        }
        let limiter = |config| RateLimiter::new(config, trust);
        Self {
            mounts,
            admin: limiter(ratelimit::presets::admin()),
            admin_read: limiter(ratelimit::presets::admin_read()),
            admin_write: limiter(ratelimit::presets::admin_write()),
            email_queue_read: limiter(ratelimit::presets::admin_read()),
            email_queue_write: limiter(ratelimit::presets::admin_write()),
        }
    }

    /// The store behind a [`Limiter`].
    pub fn limiter(&self, which: Limiter) -> &RateLimiter {
        match which {
            Limiter::Admin => &self.admin,
            Limiter::AdminRead => &self.admin_read,
            Limiter::AdminWrite => &self.admin_write,
            Limiter::EmailQueueRead => &self.email_queue_read,
            Limiter::EmailQueueWrite => &self.email_queue_write,
        }
    }

    /// The registered `(method, path)` pairs of a mount, in order.
    pub fn routes_of(&self, mount: Mount) -> Vec<(Verb, &'static str)> {
        self.mounts
            .iter()
            .find(|m| m.mount == mount)
            .map(|m| m.table.iter().map(|(v, p, _)| (*v, *p)).collect())
            .unwrap_or_default()
    }
}

/// What a handler gets: `req` after the middleware ran.
pub struct AdminRequest {
    pub state: AppState,
    /// Method, URI (`req.originalUrl`), headers and extensions.
    pub parts: Parts,
    /// The route's params, `decodeURIComponent`-ed, in path order.
    pub params: Vec<String>,
    /// `req.body` after `express.json()` / `express.urlencoded()`: `{}` when
    /// neither parsed it (e.g. multipart — see [`AdminRequest::take_body`]).
    pub body: Value,
    raw: Option<Body>,
    user: Option<AuthUser>,
}

impl AdminRequest {
    /// `req.user` (every admin route runs `protect` first; checked when the
    /// route is registered).
    pub fn user(&self) -> &AuthUser {
        self.user
            .as_ref()
            .expect("admin routes always run `protect` before the handler")
    }

    pub fn method(&self) -> &Method {
        &self.parts.method
    }

    pub fn uri(&self) -> &Uri {
        &self.parts.uri
    }

    pub fn headers(&self) -> &HeaderMap {
        &self.parts.headers
    }

    /// Param `i` (`req.params[name]` in path order).
    pub fn param(&self, i: usize) -> &str {
        self.params.get(i).map_or("", String::as_str)
    }

    /// `req.query` (qs, Express's "extended" parser).
    pub fn query(&self) -> Map<String, Value> {
        crate::qs::query(&self.parts.uri)
    }

    /// The socket peer (`req.ip` without a trusted proxy).
    pub fn peer(&self) -> Option<IpAddr> {
        crate::client_ip::peer(&self.parts)
    }

    /// `req.ip` as Express computes it (`TRUST_PROXY`).
    pub fn ip(&self) -> String {
        crate::client_ip::client_ip(&self.parts.headers, self.peer(), self.state.trust_proxy)
    }

    /// The request body as it arrived, for a body the JSON/urlencoded parsers
    /// left alone (multipart uploads: hand it to [`crate::multer`]). Empty if
    /// it was parsed or already taken.
    pub fn take_body(&mut self) -> Body {
        self.raw.take().unwrap_or_else(Body::empty)
    }

    /// `upload.single(field)` as route middleware: parses a multipart body
    /// and, if it was multipart, replaces [`AdminRequest::body`] with the
    /// fields (as multer replaces `req.body`). `Err` goes to `next(err)`:
    /// answer it with [`crate::multer::MulterError::into_response`].
    pub async fn multer_single(
        &mut self,
        multer: &crate::multer::Multer,
        field: &str,
    ) -> Result<Option<crate::multer::File>, crate::multer::MulterError> {
        let body = self.take_body();
        let upload = multer.single(field, &self.parts.headers, body).await?;
        if let Some(fields) = upload.body {
            self.body = fields;
        }
        Ok(upload.file)
    }
}

/// `parseInt(String(v), 10)` (NaN for a missing value), for pagination like
/// `Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)`.
pub fn parse_int(v: Option<&Value>) -> f64 {
    v.map_or(f64::NAN, express_router::parse_int)
}

/// `parseInt(v, 10) || fallback`: NaN and 0 fall back.
pub fn int_or(v: Option<&Value>, fallback: f64) -> f64 {
    let n = parse_int(v);
    if n.is_nan() || n == 0.0 { fallback } else { n }
}

/// `Math.min(Math.max(parseInt(v, 10) || fallback, min), max)`.
pub fn clamp_int(v: Option<&Value>, fallback: f64, min: f64, max: f64) -> f64 {
    int_or(v, fallback).max(min).min(max)
}

/// analyticsRoutes.js `safeLimit(value, fallback, max)`: `parseInt(value, 10)`,
/// the fallback when not finite or below 1, capped at `max`.
pub fn safe_limit(v: Option<&Value>, fallback: f64, max: f64) -> f64 {
    let n = parse_int(v);
    if !n.is_finite() || n < 1.0 {
        fallback
    } else {
        n.min(max)
    }
}

/// `res.status(status).json(body)`.
pub fn json(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

/// The part of `path` below an `app.use(mount, …)` mount point, or `None` when
/// the mount doesn't match: `^<mount>\/?(?=\/|$)`, case-insensitive (so one
/// extra slash belongs to the mount: `/api/admin//x` is `/x`).
pub fn strip_mount<'a>(path: &'a str, mount: &str) -> Option<&'a str> {
    let head = path.get(..mount.len())?;
    if !head.eq_ignore_ascii_case(mount) {
        return None;
    }
    let rest = &path[mount.len()..];
    if rest.is_empty() {
        return Some("/");
    }
    if !rest.starts_with('/') {
        return None;
    }
    Some(if rest.starts_with("//") {
        &rest[1..]
    } else {
        rest
    })
}

/// Is `path` under `/api/admin` (case-insensitive, like Express)?
pub fn is_admin_path(path: &str) -> bool {
    strip_mount(path, PREFIX).is_some()
}

/// The axum routes that send the subtree to [`dispatch`]. Paths in another
/// case reach it through the app's fallback (see `lib.rs`).
pub fn router() -> axum::Router<AppState> {
    let all = axum::routing::any(dispatch);
    axum::Router::new()
        .route(PREFIX, all.clone())
        .route(&format!("{PREFIX}/"), all.clone())
        .route(&format!("{PREFIX}/{{*rest}}"), all)
}

/// The media type `express.json()` / `express.urlencoded()` would parse.
fn parsed_by_body_parsers(headers: &HeaderMap) -> bool {
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|ct| ct.split(';').next())
        .map(|m| m.trim().to_ascii_lowercase())
        .is_some_and(|m| m == "application/json" || m == "application/x-www-form-urlencoded")
}

/// The middleware state of one request while it walks the mounts.
struct Chain {
    user: Option<AuthUser>,
    /// Rate-limit headers set so far (`res.setHeader`, so a later limiter's
    /// value replaces an earlier one's).
    headers: Vec<(HeaderName, HeaderValue)>,
}

impl Chain {
    fn set_headers(&mut self, headers: Vec<(HeaderName, HeaderValue)>) {
        for (name, value) in headers {
            match self.headers.iter_mut().find(|(n, _)| *n == name) {
                Some(slot) => slot.1 = value,
                None => self.headers.push((name, value)),
            }
        }
    }

    /// Headers the middleware set before the response: the response's own win.
    fn finish(&self, mut response: Response) -> Response {
        let headers = response.headers_mut();
        for (name, value) in &self.headers {
            headers.entry(name.clone()).or_insert_with(|| value.clone());
        }
        response
    }
}

/// Runs `steps` in order; `Err` is the response that ends the request.
async fn run_steps(
    steps: &[Step],
    chain: &mut Chain,
    state: &AppState,
    parts: &mut Parts,
) -> Result<(), Response> {
    for step in steps {
        match step {
            Step::Protect => {
                let user = AuthUser::from_request_parts(parts, state)
                    .await
                    .map_err(IntoResponse::into_response)?;
                chain.user = Some(user);
            }
            Step::Admin => match &chain.user {
                Some(u) if u.is_admin() => {}
                Some(_) => {
                    return Err(AuthError::Forbidden(
                        "Not authorized as an admin",
                        "Admin access required",
                    )
                    .into_response());
                }
                None => return Err(admin_without_user()),
            },
            Step::StaffOrAdmin => match &chain.user {
                Some(u) if u.is_admin() || u.is_staff() => {}
                Some(_) => {
                    return Err(AuthError::Forbidden(
                        "Not authorized as staff or admin",
                        "Staff or admin access required",
                    )
                    .into_response());
                }
                None => return Err(admin_without_user()),
            },
            Step::Limit(which) => {
                let limiter = state.back_office.limiter(*which);
                let key = limiter.key(&parts.headers, crate::client_ip::peer(parts));
                let now = ratelimit::now_ms();
                let info = limiter.hit(&key, now);
                if info.limited() {
                    return Err(limiter.rejection(&info, now));
                }
                chain.set_headers(limiter.headers(&info, now));
            }
            Step::Csrf => {
                crate::csrf::check(
                    &state.csrf,
                    &parts.method,
                    &parts.headers,
                    chain.user.as_ref(),
                    chrono::Utc::now().timestamp_millis(),
                )
                .map_err(IntoResponse::into_response)?;
            }
        }
    }
    Ok(())
}

/// `admin` / `staffOrAdmin` without `req.user` (unreachable behind `protect`).
fn admin_without_user() -> Response {
    json(
        StatusCode::UNAUTHORIZED,
        common::response::failure_with(
            "Not authorized as an admin",
            serde_json::json!({ "error": "Admin access required" }),
        ),
    )
}

/// Every request under `/api/admin`.
pub async fn dispatch(State(state): State<AppState>, req: Request) -> Response {
    let head = req.method() == Method::HEAD;
    let response = handle(state, req).await;
    if head {
        let (parts, _) = response.into_parts();
        return Response::from_parts(parts, Body::empty());
    }
    response
}

async fn handle(state: AppState, req: Request) -> Response {
    let (mut parts, body) = req.into_parts();
    // cors() answers every preflight before anything else runs.
    if parts.method == Method::OPTIONS {
        return StatusCode::NO_CONTENT.into_response();
    }
    // express.json() / express.urlencoded() run before any route; other
    // bodies (multipart) stay unread for the route's multer.
    let (parsed, raw) = if parsed_by_body_parsers(&parts.headers) {
        match crate::express::read_body(&parts.headers, body).await {
            Ok(value) => (value, None),
            Err(response) => return response,
        }
    } else {
        (Value::Object(Map::new()), Some(body))
    };

    let uri = parts.uri.clone();
    let path = uri.path().to_owned();
    let mut chain = Chain {
        user: None,
        headers: Vec::new(),
    };
    let back_office = state.back_office.clone();
    for routes in &back_office.mounts {
        let Some(sub) = strip_mount(&path, routes.mount.path()) else {
            continue;
        };
        if let Err(response) =
            run_steps(routes.mount.mount_steps(), &mut chain, &state, &mut parts).await
        {
            return chain.finish(response);
        }
        if let Err(response) =
            run_steps(routes.mount.router_steps(), &mut chain, &state, &mut parts).await
        {
            return chain.finish(response);
        }
        match express_router::route(&routes.table, &parts.method, sub) {
            Routed::Route(index, params) => {
                let route = &routes.routes[index];
                if let Err(response) = run_steps(&route.steps, &mut chain, &state, &mut parts).await
                {
                    return chain.finish(response);
                }
                let request = AdminRequest {
                    state: state.clone(),
                    parts,
                    params,
                    body: parsed,
                    raw,
                    user: chain.user.clone(),
                };
                let response = (route.handler)(request).await;
                return chain.finish(response);
            }
            Routed::Error(message) => return chain.finish(express_router::error(&message)),
            Routed::NotFound => {}
        }
    }
    chain.finish(crate::express::not_found(&uri))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mounts_match_like_app_use() {
        assert_eq!(strip_mount("/api/admin", PREFIX), Some("/"));
        assert_eq!(strip_mount("/api/admin/", PREFIX), Some("/"));
        assert_eq!(strip_mount("/api/admin/logout", PREFIX), Some("/logout"));
        assert_eq!(strip_mount("/API/Admin/logout", PREFIX), Some("/logout"));
        assert_eq!(strip_mount("/api/admin//logout", PREFIX), Some("/logout"));
        assert_eq!(strip_mount("/api/admin//", PREFIX), Some("/"));
        assert_eq!(strip_mount("/api/adminx", PREFIX), None);
        assert_eq!(strip_mount("/api/admi", PREFIX), None);
        assert_eq!(
            strip_mount("/api/admin/bulk/x", Mount::Bulk.path()),
            Some("/x")
        );
        assert_eq!(strip_mount("/api/admin/bulkx", Mount::Bulk.path()), None);
        // Multi-byte text right at the cut is not a char boundary: no match.
        assert_eq!(strip_mount("/api/admé", PREFIX), None);
    }

    #[test]
    fn pagination_helpers_follow_javascript() {
        let v = |s: &str| Value::String(s.into());
        assert_eq!(clamp_int(Some(&v("500")), 50.0, 1.0, 200.0), 200.0);
        assert_eq!(clamp_int(Some(&v("0")), 50.0, 1.0, 200.0), 50.0);
        assert_eq!(clamp_int(Some(&v("-5")), 50.0, 1.0, 200.0), 1.0);
        assert_eq!(clamp_int(Some(&v("abc")), 50.0, 1.0, 200.0), 50.0);
        assert_eq!(clamp_int(None, 50.0, 1.0, 200.0), 50.0);
        assert_eq!(
            clamp_int(Some(&Value::Array(vec![v("7"), v("9")])), 50.0, 1.0, 200.0),
            7.0
        );
        assert_eq!(safe_limit(Some(&v("0")), 10.0, 100.0), 10.0);
        assert_eq!(safe_limit(Some(&v("12x")), 10.0, 100.0), 12.0);
        assert_eq!(safe_limit(Some(&v("1000")), 10.0, 100.0), 100.0);
        assert_eq!(parse_int(Some(&v("-0"))), 0.0);
    }

    #[test]
    fn every_area_registers_behind_protect() {
        // Building it runs every registration's `protect` assertion.
        let office = BackOffice::new(TrustProxy(0));
        assert_eq!(
            office.routes_of(Mount::Admin).first(),
            Some(&(Verb::Post, "/logout"))
        );
    }
}
