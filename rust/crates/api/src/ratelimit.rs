//! Rate limiting, equivalent to the `express-rate-limit` 8 limiters of the Node
//! backend (backend/server.js, routes/userRoutes.js, routes/shippingRoutes.js,
//! routes/admin/limiters.js) with its default `MemoryStore`:
//!
//! * **Fixed window per client.** A client's window starts at its first request
//!   and lasts `window_ms`; a request after the window's end starts a new one at
//!   1 hit. Requests over `limit` get 429 (and still count).
//! * **Response** for a limited request: status 429, the configured message as
//!   the body (`res.send`: a text message is sent as `text/html; charset=utf-8`,
//!   a JSON message as `application/json; charset=utf-8`), plus `Retry-After`
//!   when any rate-limit headers are enabled.
//! * **Headers** on every counted request: `standardHeaders: true` is IETF
//!   draft-6 (`RateLimit-Policy: <limit>;w=<window s>`, `RateLimit-Limit`,
//!   `RateLimit-Remaining`, `RateLimit-Reset: <s until reset>`); the default
//!   legacy headers are `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Date` and
//!   `X-RateLimit-Reset: <epoch s>`.
//! * **Key**: `req.ip` (see [`crate::client_ip`], `TRUST_PROXY`), IPv6 grouped
//!   by /56 and IPv4-mapped IPv6 folded to IPv4 (`ipKeyGenerator`).
//! * **Skip** rules are the Node ones: the auth/shipping/global limiters are off
//!   when `NODE_ENV` is `development`/`test` or `DISABLE_RATE_LIMIT=true`; the
//!   admin limiters have no skip.
//! * **Memory** is bounded like the MemoryStore's: clients live in a `current`
//!   and a `previous` map that rotate every window, so a client idle for two
//!   windows (necessarily expired) is dropped.
//!
//! Use [`RateLimiter::layer`] on a route (`post(handler).layer(l.layer())`),
//! or build the limiter with [`RateLimiter::under`] to count one path prefix; the global `/api` limiter is
//! wired in `lib.rs`. A route limiter runs where Express runs it — after
//! `express.json()` — so a JSON body Express would reject is not counted.

use std::collections::HashMap;
use std::convert::Infallible;
use std::net::{IpAddr, Ipv6Addr};
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use tower::{Layer, Service};

use crate::client_ip::{self, TrustProxy};
use crate::params::js_parse_int;

/// What a limited client gets as the body.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Message {
    /// A string `message`: sent as `text/html; charset=utf-8`.
    Text(String),
    /// An object `message`, as its exact `JSON.stringify` text.
    Json(String),
}

impl Message {
    /// `{ status: 'FAIL', message }` — the shape the backend's limiters use.
    pub fn fail(message: &str) -> Self {
        Self::Json(format!(
            r#"{{"status":"FAIL","message":{}}}"#,
            serde_json::Value::String(message.to_owned())
        ))
    }

    /// express-rate-limit's default message.
    pub fn default_text() -> Self {
        Self::Text("Too many requests, please try again later.".into())
    }
}

/// Which rate-limit headers to send.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Headers {
    /// `standardHeaders: true` (draft-6).
    pub standard: bool,
    /// `legacyHeaders` (default true).
    pub legacy: bool,
}

impl Headers {
    /// `standardHeaders: true, legacyHeaders: false`.
    pub const STANDARD: Self = Self {
        standard: true,
        legacy: false,
    };
    /// The defaults (`standardHeaders: false`, legacy on).
    pub const LEGACY: Self = Self {
        standard: false,
        legacy: true,
    };
}

#[derive(Debug, Clone)]
pub struct Config {
    /// For logs only.
    pub name: &'static str,
    pub window_ms: i64,
    pub limit: i64,
    pub message: Message,
    pub headers: Headers,
    /// `skip()` — evaluated once, from the environment.
    pub skip: bool,
    /// The limiter sits after `express.json()` (route limiters): requests whose
    /// JSON body Express would reject never reach it.
    pub after_body_parser: bool,
}

/// `NODE_ENV` is development/test, or `DISABLE_RATE_LIMIT=true`.
pub fn skip_from_env() -> bool {
    let env = std::env::var("NODE_ENV").unwrap_or_default();
    env == "development"
        || env == "test"
        || std::env::var("DISABLE_RATE_LIMIT").is_ok_and(|v| v == "true")
}

/// `parseInt(process.env[name]) || fallback`.
fn env_int(name: &str, fallback: i64) -> i64 {
    std::env::var(name)
        .ok()
        .and_then(|v| js_parse_int(&v))
        .filter(|n| *n != 0)
        .unwrap_or(fallback)
}

const MINUTE: i64 = 60 * 1000;
const HOUR: i64 = 60 * MINUTE;

/// The Node limiters, by the name they have there.
pub mod presets {
    use super::*;

    fn route(
        name: &'static str,
        window_ms: i64,
        limit: i64,
        message: Message,
        headers: Headers,
    ) -> Config {
        Config {
            name,
            window_ms,
            limit,
            message,
            headers,
            skip: skip_from_env(),
            after_body_parser: true,
        }
    }

    /// backend/server.js `globalLimiter` on `/api`: `RATE_LIMIT_WINDOW_MS`
    /// (60 s) / `RATE_LIMIT_MAX_REQUESTS` (100), draft-6 headers.
    pub fn global() -> Config {
        Config {
            name: "global",
            window_ms: env_int("RATE_LIMIT_WINDOW_MS", MINUTE),
            limit: env_int("RATE_LIMIT_MAX_REQUESTS", 100),
            message: Message::fail("Too many requests, please try again later"),
            headers: Headers::STANDARD,
            skip: skip_from_env(),
            after_body_parser: false,
        }
    }

    /// userRoutes.js `registerLimiter`: 5 per hour.
    pub fn register() -> Config {
        route(
            "register",
            HOUR,
            5,
            Message::fail("Too many registration attempts, please try again later"),
            Headers::LEGACY,
        )
    }

    /// userRoutes.js `refreshLimiter`: 10 per minute.
    pub fn refresh() -> Config {
        route(
            "refresh",
            MINUTE,
            10,
            Message::fail("Too many refresh attempts"),
            Headers::LEGACY,
        )
    }

    /// userRoutes.js `verifyEmailLimiter`: 10 per 15 minutes.
    pub fn verify_email() -> Config {
        route(
            "verify-email",
            15 * MINUTE,
            10,
            Message::fail("Too many verification attempts"),
            Headers::LEGACY,
        )
    }

    /// userRoutes.js `loginLimiter`: `LOGIN_RATE_LIMIT_WINDOW_MS` (15 min) /
    /// `LOGIN_RATE_LIMIT_MAX` (5), plain-text message.
    pub fn login() -> Config {
        route(
            "login",
            env_int("LOGIN_RATE_LIMIT_WINDOW_MS", 15 * MINUTE),
            env_int("LOGIN_RATE_LIMIT_MAX", 5),
            Message::Text(
                "Too many login attempts from this IP, please try again after 15 minutes".into(),
            ),
            Headers::LEGACY,
        )
    }

    /// userRoutes.js `forgotLimiter`: 3 per hour, plain-text message.
    pub fn forgot_password() -> Config {
        route(
            "forgot-password",
            HOUR,
            3,
            Message::Text(
                "Too many password reset attempts from this IP, please try again after an hour"
                    .into(),
            ),
            Headers::LEGACY,
        )
    }

    /// shippingRoutes.js `carrierLimiter`: `SHIPPING_RATE_LIMIT_MAX` (20) per
    /// minute, draft-6 headers.
    pub fn carrier() -> Config {
        route(
            "carrier",
            MINUTE,
            env_int("SHIPPING_RATE_LIMIT_MAX", 20),
            Message::fail("Too many shipping requests, please try again shortly"),
            Headers::STANDARD,
        )
    }

    fn admin_config(name: &'static str, limit: i64) -> Config {
        Config {
            name,
            window_ms: MINUTE,
            limit,
            message: Message::default_text(),
            headers: Headers::STANDARD,
            // routes/admin/limiters.js and emailQueueRoutes.js have no `skip`.
            skip: false,
            after_body_parser: true,
        }
    }

    /// routes/admin/limiters.js `adminLimiter` (all of `/api/admin`): 100/min.
    pub fn admin() -> Config {
        admin_config("admin", 100)
    }

    /// `adminReadLimiter`: 300/min.
    pub fn admin_read() -> Config {
        admin_config("admin-read", 300)
    }

    /// `adminWriteLimiter`: 60/min.
    pub fn admin_write() -> Config {
        admin_config("admin-write", 60)
    }
}

/// `request.rateLimit` after counting a request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Info {
    pub limit: i64,
    pub used: i64,
    pub remaining: i64,
    /// Epoch milliseconds.
    pub reset_ms: i64,
}

impl Info {
    pub fn limited(&self) -> bool {
        self.used > self.limit
    }
}

#[derive(Debug, Clone, Copy)]
struct Client {
    hits: i64,
    reset_ms: i64,
}

/// express-rate-limit's MemoryStore, rotating lazily instead of on a timer
/// (observably the same: a client that sits in `previous` through a rotation
/// has been idle a whole window, so its window had already ended).
#[derive(Debug)]
struct Store {
    window_ms: i64,
    current: HashMap<String, Client>,
    previous: HashMap<String, Client>,
    rotated_at: i64,
}

impl Store {
    fn new(window_ms: i64, now: i64) -> Self {
        Self {
            window_ms,
            current: HashMap::new(),
            previous: HashMap::new(),
            rotated_at: now,
        }
    }

    fn rotate(&mut self, now: i64) {
        let period = self.window_ms.max(1);
        let elapsed = now - self.rotated_at;
        if elapsed < period {
            return;
        }
        if elapsed >= 2 * period {
            self.previous.clear();
            self.current.clear();
        } else {
            self.previous = std::mem::take(&mut self.current);
        }
        self.rotated_at += period * (elapsed / period);
    }

    fn increment(&mut self, key: &str, now: i64) -> Client {
        self.rotate(now);
        let window = self.window_ms;
        if !self.current.contains_key(key) {
            let client = self.previous.remove(key).unwrap_or(Client {
                hits: 0,
                reset_ms: now + window,
            });
            self.current.insert(key.to_owned(), client);
        }
        let client = self.current.get_mut(key).expect("just inserted");
        if client.reset_ms <= now {
            client.hits = 0;
            client.reset_ms = now + window;
        }
        client.hits += 1;
        *client
    }

    fn len(&self) -> usize {
        self.current.len() + self.previous.len()
    }
}

/// `ipKeyGenerator(ip, 56)`: IPv4 as is, IPv4-mapped (and `::a.b.c.d`) IPv6 as
/// the IPv4 address, other IPv6 as its /56 network; anything that isn't an IP
/// address is its own key.
pub fn ip_key(ip: &str) -> String {
    let (addr, _zone) = ip.split_once('%').unwrap_or((ip, ""));
    let Ok(v6) = addr.parse::<Ipv6Addr>() else {
        return ip.to_owned();
    };
    if let Some(v4) = v6.to_ipv4_mapped() {
        return v4.to_string();
    }
    let segments = v6.segments();
    if addr.contains('.') && segments[..6].iter().all(|s| *s == 0) {
        // The deprecated IPv4-compatible notation (`::1.2.3.4`).
        return std::net::Ipv4Addr::from(((segments[6] as u32) << 16) | segments[7] as u32)
            .to_string();
    }
    let masked = u128::from(v6) & (!0u128 << (128 - 56));
    format!("{}/56", Ipv6Addr::from(masked))
}

/// `Date.now()`.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

/// `Math.ceil(ms / 1000)` for the header arithmetic.
fn ceil_seconds(ms: i64) -> i64 {
    (ms as f64 / 1000.0).ceil() as i64
}

#[derive(Debug)]
struct Inner {
    config: Config,
    trust: TrustProxy,
    prefix: Option<String>,
    store: Mutex<Store>,
}

/// One limiter (one store). Cheap to clone; clones share the counts.
#[derive(Debug, Clone)]
pub struct RateLimiter(Arc<Inner>);

impl RateLimiter {
    pub fn new(config: Config, trust: TrustProxy) -> Self {
        let store = Store::new(config.window_ms, now_ms());
        Self(Arc::new(Inner {
            config,
            trust,
            prefix: None,
            store: Mutex::new(store),
        }))
    }

    /// A limiter that only counts paths under `prefix`, matched like Express's
    /// `app.use(prefix, …)` (case-insensitive, whole segments).
    pub fn under(config: Config, trust: TrustProxy, prefix: &str) -> Self {
        let store = Store::new(config.window_ms, now_ms());
        Self(Arc::new(Inner {
            config,
            trust,
            prefix: Some(prefix.trim_end_matches('/').to_ascii_lowercase()),
            store: Mutex::new(store),
        }))
    }

    pub fn config(&self) -> &Config {
        &self.0.config
    }

    /// The store key for a request.
    pub fn key(&self, headers: &HeaderMap, peer: Option<IpAddr>) -> String {
        ip_key(&client_ip::client_ip(headers, peer, self.0.trust))
    }

    /// Count one request for `key` at `now` (epoch ms).
    pub fn hit(&self, key: &str, now: i64) -> Info {
        let client = self
            .0
            .store
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .increment(key, now);
        let limit = self.0.config.limit;
        Info {
            limit,
            used: client.hits,
            remaining: (limit - client.hits).max(0),
            reset_ms: client.reset_ms,
        }
    }

    /// Clients currently held in memory.
    pub fn tracked_clients(&self) -> usize {
        self.0.store.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    fn applies_to(&self, path: &str) -> bool {
        match &self.0.prefix {
            None => true,
            Some(prefix) => {
                let lower = path.to_ascii_lowercase();
                lower == *prefix
                    || lower
                        .strip_prefix(prefix.as_str())
                        .is_some_and(|rest| rest.starts_with('/'))
            }
        }
    }

    /// The rate-limit headers for `info`, in the order Node sets them.
    pub fn headers(&self, info: &Info, now: i64) -> Vec<(HeaderName, HeaderValue)> {
        let mut out = Vec::new();
        let num = |n: i64| HeaderValue::from(n);
        let config = &self.0.config;
        if config.headers.legacy {
            out.push((
                HeaderName::from_static("x-ratelimit-limit"),
                num(info.limit),
            ));
            out.push((
                HeaderName::from_static("x-ratelimit-remaining"),
                num(info.remaining),
            ));
            let date = chrono::DateTime::from_timestamp_millis(now).unwrap_or_default();
            if let Ok(v) = HeaderValue::from_str(&crate::cookies::utc_string(&date)) {
                out.push((header::DATE, v));
            }
            out.push((
                HeaderName::from_static("x-ratelimit-reset"),
                num(ceil_seconds(info.reset_ms)),
            ));
        }
        if config.headers.standard {
            let policy = format!("{};w={}", info.limit, ceil_seconds(config.window_ms));
            out.push((
                HeaderName::from_static("ratelimit-policy"),
                HeaderValue::from_str(&policy).expect("digits"),
            ));
            out.push((HeaderName::from_static("ratelimit-limit"), num(info.limit)));
            out.push((
                HeaderName::from_static("ratelimit-remaining"),
                num(info.remaining),
            ));
            out.push((
                HeaderName::from_static("ratelimit-reset"),
                num(reset_seconds(info, now)),
            ));
        }
        out
    }

    /// The 429 response for a limited request.
    pub fn rejection(&self, info: &Info, now: i64) -> Response {
        let config = &self.0.config;
        let (content_type, body) = match &config.message {
            Message::Text(text) => ("text/html; charset=utf-8", text.clone()),
            Message::Json(json) => ("application/json; charset=utf-8", json.clone()),
        };
        let mut response = (StatusCode::TOO_MANY_REQUESTS, body).into_response();
        let headers = response.headers_mut();
        headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        for (name, value) in self.headers(info, now) {
            headers.insert(name, value);
        }
        if config.headers.legacy || config.headers.standard {
            headers.insert(
                header::RETRY_AFTER,
                HeaderValue::from(reset_seconds(info, now)),
            );
        }
        response
    }

    /// The limiter as a tower layer for one route (`MethodRouter::layer`) or a
    /// whole router (`Router::layer`).
    pub fn layer(&self) -> RateLimitLayer {
        RateLimitLayer(self.clone())
    }
}

/// See [`RateLimiter::layer`].
#[derive(Debug, Clone)]
pub struct RateLimitLayer(RateLimiter);

impl<S> Layer<S> for RateLimitLayer {
    type Service = RateLimitService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        RateLimitService {
            limiter: self.0.clone(),
            inner,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RateLimitService<S> {
    limiter: RateLimiter,
    inner: S,
}

impl<S> Service<Request> for RateLimitService<S>
where
    S: Service<Request, Response = Response, Error = Infallible> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response;
    type Error = Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Response, Infallible>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Infallible>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request) -> Self::Future {
        // Use the service that was polled ready; leave a fresh clone behind.
        let clone = self.inner.clone();
        let inner = std::mem::replace(&mut self.inner, clone);
        let limiter = self.limiter.clone();
        Box::pin(async move { Ok(run(limiter, req, inner).await) })
    }
}

/// `getResetSeconds`: seconds until the window ends, never negative.
fn reset_seconds(info: &Info, now: i64) -> i64 {
    ceil_seconds(info.reset_ms - now).max(0)
}

/// Express's `express.json()` would fail this request (bad JSON, strict-mode
/// violation, non-UTF charset, over 100kb), so a limiter mounted after it is
/// never reached.
pub fn express_json_rejects(headers: &HeaderMap, body: &[u8]) -> bool {
    let Some(content_type) = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
    else {
        return false;
    };
    let mut parts = content_type.split(';');
    let mime = parts.next().unwrap_or("").trim().to_ascii_lowercase();
    if mime != "application/json" {
        return false;
    }
    let charset = parts.find_map(|p| {
        let (k, v) = p.split_once('=')?;
        (k.trim().eq_ignore_ascii_case("charset"))
            .then(|| v.trim().trim_matches('"').to_ascii_lowercase())
    });
    if charset.is_some_and(|c| !c.starts_with("utf-")) {
        return true;
    }
    if body.len() > 100 * 1024 {
        return true;
    }
    if body.is_empty() {
        return false;
    }
    let body = body.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(body);
    let first = body
        .iter()
        .find(|b| !matches!(b, b' ' | b'\t' | b'\n' | b'\r'));
    if !matches!(first, Some(b'{' | b'[')) {
        return true;
    }
    serde_json::from_slice::<serde::de::IgnoredAny>(body).is_err()
}

/// Largest body buffered to decide [`express_json_rejects`]; beyond it the
/// request is over Express's 100kb limit anyway.
const BODY_PEEK_LIMIT: usize = 2 * 1024 * 1024;

async fn run<S>(limiter: RateLimiter, req: Request, mut inner: S) -> Response
where
    S: Service<Request, Response = Response, Error = Infallible>,
{
    let config = &limiter.0.config;
    if config.skip || !limiter.applies_to(req.uri().path()) {
        return call(&mut inner, req).await;
    }
    let (parts, body) = req.into_parts();
    let req = if config.after_body_parser && is_json(&parts.headers) {
        let bytes = match axum::body::to_bytes(body, BODY_PEEK_LIMIT).await {
            Ok(bytes) => bytes,
            Err(_) => {
                return (StatusCode::PAYLOAD_TOO_LARGE, "length limit exceeded").into_response();
            }
        };
        if express_json_rejects(&parts.headers, &bytes) {
            return call(&mut inner, Request::from_parts(parts, Body::from(bytes))).await;
        }
        Request::from_parts(parts, Body::from(bytes))
    } else {
        Request::from_parts(parts, body)
    };

    let peer = req
        .extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|c| c.0.ip());
    let key = limiter.key(req.headers(), peer);
    let now = now_ms();
    let info = limiter.hit(&key, now);
    if info.limited() {
        tracing::info!(limiter = config.name, %key, "rate limit exceeded");
        return limiter.rejection(&info, now);
    }
    let mut response = call(&mut inner, req).await;
    let headers = response.headers_mut();
    for (name, value) in limiter.headers(&info, now) {
        // Node sets these before the handler runs, so the handler's own win.
        headers.entry(name).or_insert(value);
    }
    response
}

async fn call<S>(inner: &mut S, req: Request) -> Response
where
    S: Service<Request, Response = Response, Error = Infallible>,
{
    match inner.call(req).await {
        Ok(response) => response,
        Err(never) => match never {},
    }
}

fn is_json(headers: &HeaderMap) -> bool {
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|ct| ct.split(';').next())
        .is_some_and(|m| m.trim().eq_ignore_ascii_case("application/json"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Router;
    use axum::extract::ConnectInfo;
    use axum::routing::{get, post};
    use std::net::SocketAddr;
    use tower::ServiceExt;

    fn config(limit: i64, window_ms: i64, headers: Headers, message: Message) -> Config {
        Config {
            name: "test",
            window_ms,
            limit,
            message,
            headers,
            skip: false,
            after_body_parser: true,
        }
    }

    #[test]
    fn fixed_window_counts_and_resets() {
        let l = RateLimiter::new(
            config(2, 1000, Headers::STANDARD, Message::default_text()),
            TrustProxy(0),
        );
        let t0 = 1_000_000;
        let a = l.hit("a", t0);
        assert_eq!((a.used, a.remaining, a.reset_ms), (1, 1, t0 + 1000));
        assert!(!l.hit("a", t0 + 10).limited());
        let third = l.hit("a", t0 + 999);
        assert!(third.limited());
        assert_eq!(third.remaining, 0);
        assert_eq!(third.reset_ms, t0 + 1000, "the window does not slide");
        assert!(!l.hit("b", t0 + 999).limited(), "keys are independent");
        let next = l.hit("a", t0 + 1000);
        assert_eq!(
            (next.used, next.reset_ms),
            (1, t0 + 2000),
            "a new window starts at the first request after the old one ended"
        );
    }

    #[test]
    fn idle_clients_are_evicted_after_two_windows() {
        let l = RateLimiter::new(
            config(5, 1000, Headers::STANDARD, Message::default_text()),
            TrustProxy(0),
        );
        let t0 = l.0.store.lock().unwrap().rotated_at;
        for i in 0..100 {
            l.hit(&format!("c{i}"), t0 + 1);
        }
        assert_eq!(l.tracked_clients(), 100);
        l.hit("x", t0 + 1001); // first rotation: the 100 move to `previous`
        assert_eq!(l.tracked_clients(), 101);
        let back = l.hit("c7", t0 + 1500); // a returning client comes back…
        assert_eq!(back.used, 1, "…with a fresh window, its old one has ended");
        l.hit("x", t0 + 2001); // second rotation drops the idle ones
        assert_eq!(l.tracked_clients(), 2);
        l.hit("y", t0 + 9000); // long idle: everything rotates out
        assert_eq!(l.tracked_clients(), 1);
    }

    #[test]
    fn ip_keys_match_ip_key_generator() {
        let fx = crate::cookies::tests::fixtures();
        for case in fx["ip_key"].as_array().unwrap() {
            assert_eq!(
                ip_key(case[0].as_str().unwrap()),
                case[1].as_str().unwrap(),
                "{case}"
            );
        }
    }

    #[test]
    fn presets_read_the_node_env_rules() {
        // Values come from the environment exactly like `parseInt(x) || d`.
        assert_eq!(presets::register().limit, 5);
        assert_eq!(presets::register().window_ms, HOUR);
        assert_eq!(presets::forgot_password().limit, 3);
        assert!(!presets::admin().skip, "the admin limiters have no skip");
        assert_eq!(presets::global().headers, Headers::STANDARD);
        assert_eq!(presets::login().headers, Headers::LEGACY);
        assert_eq!(
            presets::refresh().message,
            Message::Json(r#"{"status":"FAIL","message":"Too many refresh attempts"}"#.into())
        );
    }

    #[test]
    fn json_body_rejections_follow_body_parser() {
        let mut h = HeaderMap::new();
        h.insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
        assert!(!express_json_rejects(&h, b""));
        assert!(!express_json_rejects(&h, b" {\"a\":1}"));
        assert!(!express_json_rejects(&h, b"[1]"));
        assert!(express_json_rejects(&h, b"{bad"));
        assert!(express_json_rejects(&h, b"1"), "strict mode");
        assert!(express_json_rejects(&h, b"   "));
        h.insert(
            header::CONTENT_TYPE,
            "application/json; charset=latin1".parse().unwrap(),
        );
        assert!(express_json_rejects(&h, b"{}"));
        h.insert(header::CONTENT_TYPE, "text/plain".parse().unwrap());
        assert!(!express_json_rejects(&h, b"{bad"));
    }

    fn router(limiter: &RateLimiter) -> Router {
        Router::new()
            .route("/api/x", get(|| async { "ok" }))
            .route("/api/y", post(|| async { "posted" }))
            .route("/health", get(|| async { "up" }))
            .layer(limiter.layer())
    }

    async fn send(app: &Router, uri: &str, from: &str, xff: Option<&str>) -> Response {
        let mut req = Request::get(uri).body(Body::empty()).unwrap();
        let addr = SocketAddr::new(from.parse().unwrap(), 5555);
        req.extensions_mut().insert(ConnectInfo(addr));
        if let Some(xff) = xff {
            req.headers_mut()
                .insert("x-forwarded-for", xff.parse().unwrap());
        }
        app.clone().oneshot(req).await.unwrap()
    }

    fn h<'a>(r: &'a Response, name: &str) -> Option<&'a str> {
        r.headers().get(name).and_then(|v| v.to_str().ok())
    }

    #[tokio::test]
    async fn standard_headers_and_json_429() {
        let limiter = RateLimiter::under(
            config(2, 60_000, Headers::STANDARD, Message::fail("Too many")),
            TrustProxy(0),
            "/api",
        );
        let app = router(&limiter);
        let r = send(&app, "/api/x", "10.0.0.1", None).await;
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(h(&r, "ratelimit-policy"), Some("2;w=60"));
        assert_eq!(h(&r, "ratelimit-limit"), Some("2"));
        assert_eq!(h(&r, "ratelimit-remaining"), Some("1"));
        assert_eq!(h(&r, "ratelimit-reset"), Some("60"));
        assert_eq!(h(&r, "x-ratelimit-limit"), None);
        send(&app, "/API/x", "10.0.0.1", None).await; // Express paths ignore case
        let r = send(&app, "/api/nope", "10.0.0.1", None).await;
        assert_eq!(r.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(
            h(&r, "content-type"),
            Some("application/json; charset=utf-8")
        );
        assert_eq!(h(&r, "retry-after"), Some("60"));
        assert_eq!(h(&r, "ratelimit-remaining"), Some("0"));
        let body = axum::body::to_bytes(r.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], br#"{"status":"FAIL","message":"Too many"}"#);
        // Outside the prefix: not counted, no headers.
        let r = send(&app, "/health", "10.0.0.1", None).await;
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(h(&r, "ratelimit-limit"), None);
        // Another client has its own bucket.
        assert_eq!(
            send(&app, "/api/x", "10.0.0.2", None).await.status(),
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn legacy_headers_and_text_429() {
        let limiter = RateLimiter::new(
            config(
                1,
                900_000,
                Headers::LEGACY,
                Message::Text("slow down".into()),
            ),
            TrustProxy(0),
        );
        let app = router(&limiter);
        let before = now_ms();
        let r = send(&app, "/api/x", "10.0.0.1", None).await;
        assert_eq!(h(&r, "x-ratelimit-limit"), Some("1"));
        assert_eq!(h(&r, "x-ratelimit-remaining"), Some("0"));
        let reset: i64 = h(&r, "x-ratelimit-reset").unwrap().parse().unwrap();
        assert!(
            (ceil_seconds(before + 900_000)..=ceil_seconds(now_ms() + 900_000)).contains(&reset)
        );
        assert!(h(&r, "date").unwrap().ends_with(" GMT"));
        assert_eq!(h(&r, "ratelimit-limit"), None);
        let r = send(&app, "/api/x", "10.0.0.1", None).await;
        assert_eq!(r.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(h(&r, "content-type"), Some("text/html; charset=utf-8"));
        assert_eq!(h(&r, "retry-after"), Some("900"));
        let body = axum::body::to_bytes(r.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"slow down");
    }

    #[tokio::test]
    async fn keys_on_the_trusted_forwarded_address() {
        // Behind one proxy: each X-Forwarded-For client gets its own bucket.
        let limiter = RateLimiter::new(
            config(1, 60_000, Headers::STANDARD, Message::default_text()),
            TrustProxy(1),
        );
        let app = router(&limiter);
        let proxy = "172.18.0.5";
        assert_eq!(
            send(&app, "/api/x", proxy, Some("1.1.1.1")).await.status(),
            200
        );
        assert_eq!(
            send(&app, "/api/x", proxy, Some("2.2.2.2")).await.status(),
            200
        );
        assert_eq!(
            send(&app, "/api/x", proxy, Some("9.9.9.9, 1.1.1.1"))
                .await
                .status(),
            429,
            "only the entry the trusted proxy appended counts"
        );
        // Without trusted hops the header is ignored: one bucket per socket.
        let limiter = RateLimiter::new(
            config(1, 60_000, Headers::STANDARD, Message::default_text()),
            TrustProxy(0),
        );
        let app = router(&limiter);
        assert_eq!(
            send(&app, "/api/x", proxy, Some("1.1.1.1")).await.status(),
            200
        );
        assert_eq!(
            send(&app, "/api/x", proxy, Some("2.2.2.2")).await.status(),
            429
        );
        // IPv6 clients share a /56.
        assert_eq!(
            send(&app, "/api/x", "2001:db8:1:200::1", None)
                .await
                .status(),
            200
        );
        assert_eq!(
            send(&app, "/api/x", "2001:db8:1:2ff::9", None)
                .await
                .status(),
            429
        );
    }

    #[tokio::test]
    async fn skip_and_bad_json_are_not_counted() {
        let mut c = config(1, 60_000, Headers::LEGACY, Message::default_text());
        c.skip = true;
        let app = router(&RateLimiter::new(c.clone(), TrustProxy(0)));
        for _ in 0..3 {
            let r = send(&app, "/api/x", "10.0.0.1", None).await;
            assert_eq!(r.status(), 200);
            assert_eq!(h(&r, "x-ratelimit-limit"), None);
        }
        c.skip = false;
        let limiter = RateLimiter::new(c, TrustProxy(0));
        let app = router(&limiter);
        let post = |body: &'static str| {
            let mut req = Request::post("/api/y")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .unwrap();
            req.extensions_mut()
                .insert(ConnectInfo("10.0.0.1:1".parse::<SocketAddr>().unwrap()));
            app.clone().oneshot(req)
        };
        for _ in 0..3 {
            let r = post("{oops").await.unwrap();
            assert_eq!(
                r.status(),
                200,
                "Express rejects the body before the limiter"
            );
            assert_eq!(h(&r, "x-ratelimit-limit"), None);
        }
        let r = post("{\"a\":1}").await.unwrap();
        assert_eq!(r.status(), 200);
        let body = axum::body::to_bytes(r.into_body(), 1024).await.unwrap();
        assert_eq!(
            &body[..],
            b"posted",
            "the buffered body still reaches the handler"
        );
        assert_eq!(post("{}").await.unwrap().status(), 429);
    }
}
