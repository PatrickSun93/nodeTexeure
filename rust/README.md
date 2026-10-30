# Rust services

The Node/Express backend is being ported to Rust one piece at a time. Each
service talks to the same MySQL database and schema as the Node API, so a piece
can move without the rest noticing.

| Crate | Replaces | Status |
|---|---|---|
| `crates/email-daemon` | `backend/services/emailDaemon.js` | Live: the only consumer of `email_queue` |
| `crates/api` | Express route groups, one at a time | `/api/products/*`, `/api/search/*`, `/api/journal/*`, `/api/settings/public`, `/api/wishlist/*` (signed in), `/api/orders/*` (my orders, detail, tracking, tax, coupons, **order creation**), all of `/api/cart/*` (signed in or guest, incl. reserve-stock and abandonment tracking), `/api/abandoned-cart/*`, all of `/api/users/*` (register, login, refresh, session, CSRF token, password reset, email verification, profile, addresses, admin user management), `/api/reviews/*`, `/api/returns/*`, `/api/unsubscribe/*`, `/api/newsletter/*`, `/api/contact`, `/api/status/*`, `/api/shipping/*` (FedEx rates, labels, tracking) |
| `crates/common` | — | Shared env config, MySQL connection, response envelope, timestamps |

## Why Rust here

- **SQL is checked at compile time.** Every query goes through sqlx's `query!`
  macros, which validate table names, column names and types against the real
  schema. A typo like `claimedAt` for `claimed_at` is a compile error pointing at
  the line, not a silent runtime failure (several Node bugs were exactly that).
- **Errors can't be ignored.** Database calls return `Result`; there is no
  equivalent of `executeQuery` quietly returning `{ success: false }`.
- **Faster and smaller.** Product API under load (50 concurrent): ~1,550 req/s for
  the list and ~1,000 for detail vs ~600–830 / ~570 from Express doing the same
  queries (Rust matches Node's *cached* responses without caching), p99 roughly a
  third, 13 MB vs 210 MB RSS. The email daemon is DB-bound, so same wall time, but
  11 MB vs 82 MB and ~30% less CPU.

## Working on it

```bash
cd rust
export DATABASE_URL=mysql://root:noirae_dev@127.0.0.1:3307/bed_texture_ecommerce  # Docker MySQL

cargo build                                   # queries checked against the live schema
cargo clippy --all-targets -- -D warnings
cargo test -- --include-ignored --test-threads=1   # unit + MySQL integration tests
cargo run -p email-daemon                     # reads DB_* / AWS_* like the Node backend
```

Without `DATABASE_URL`, builds use the committed **`.sqlx/`** query data (this is
how Docker and offline builds work). **After adding or changing a query, refresh
it and commit the result** — CI fails if it's stale:

```bash
cargo install sqlx-cli --no-default-features --features mysql,rustls   # once
cargo sqlx prepare --workspace -- --all-targets
```

The schema itself is still owned by the Node side: `docker/mysql/init.sql` plus
`backend/migrations/` (applied by `npm run migrate`). A Rust service that needs a
schema change adds the next numbered migration there and waits for it at start
(see `queue::REQUIRED_MIGRATION`).

## email-daemon

Polls `email_queue`, claims due rows (`status = 'processing'`, `claimed_at`),
renders `{{ variable }}` placeholders (using the linked `email_templates` body
when the row has variables), sends via **AWS SES v2**, and records the outcome in
`processing_details`.

- **At-least-once:** a row is claimed atomically before sending, so two daemons
  never send the same row; a claim left by a crash is returned to the queue after
  `EMAIL_DAEMON_STALE_CLAIM_SECS` (default 900).
- **Retries back off:** 60 s, 120 s, 240 s … (capped at 1 h) up to the row's
  `max_attempts`, then `failed`. Admins can requeue from the dashboard.
- **No SES keys → outbox:** each email is written as an HTML file to
  `EMAIL_OUTBOX_DIR` (default `email-outbox/`). `EMAIL_TRANSPORT=ses|outbox`
  forces a choice.
- **Graceful stop:** SIGINT/SIGTERM finish the current email, then exit.

| Variable | Default |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (or `DATABASE_URL`) | localhost:3306, root |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_REGION` / `AWS_REGION` | — / us-east-1 |
| `AWS_SES_FROM_EMAIL`, `AWS_SES_FROM_NAME`, `AWS_SES_REPLY_TO_EMAIL` | placeholders |
| `EMAIL_DAEMON_POLL_MS`, `EMAIL_DAEMON_BATCH_SIZE` | 5000, 10 |
| `EMAIL_DAEMON_RETRY_BASE_SECS`, `EMAIL_DAEMON_STALE_CLAIM_SECS` | 60, 900 |
| `EMAIL_TRANSPORT`, `EMAIL_OUTBOX_DIR` | auto, `email-outbox` |
| `RUST_LOG` | `info` |

Runs as the `email-daemon` service in both compose files (image: `rust/Dockerfile`, `command: ["email-daemon"]`).

## api

Axum + sqlx HTTP service (port `API_PORT`, default 7000; `GET /health` checks the
DB). It answers only the route groups the storefront proxy sends it:

```bash
# next.config.mjs reads these (baked in at `next build` for production)
RUST_API_URL=http://api:7000
RUST_API_ROUTES=products,search,journal,settings/public,wishlist,orders,cart,users,reviews,returns,abandoned-cart,unsubscribe,newsletter,contact,status,shipping
# comma-separated groups; an entry with a slash moves one path; unset = all Node
# a partly ported group moves only its ported paths — see partialGroups in next.config.mjs (none today)
```

Unsetting `RUST_API_ROUTES` (and rebuilding the frontend) sends everything back
to Express — the Node routes stay in place until a group has been on Rust for a
while. Responses carry `X-Served-By: rust-api`.

**Parity is tested, not assumed.** `backend/tests/parity.test.js` sends the same
requests (pagination edge cases, filters, search incl. SQL-injection strings,
locales via query and cookie, slugs, unknown ids, bad input) to Node and Rust and
requires identical status and JSON. Each later group has its own
`backend/tests/parity-<group>.test.js` (users_auth, users_account,
reviews_returns, cart_rest, misc), which also compares Set-Cookie headers, the
rows written, and rate-limit headers/429 bodies against production-mode servers
(shared helpers: `backend/tests/parityHelpers.js`). CI runs them against a fresh
API build.

Notes on the port:
- Optional filters are one static query with `(? IS NULL OR …)` clauses, so the
  whole query stays compile-time checked (no string-built SQL).
- Query parsing mirrors Express exactly (`parseInt` semantics, `qs` arrays for
  `materials[]`, `NEXT_LOCALE` cookie) — see `src/params.rs`.
- No response cache yet: Rust without a cache is as fast as Node with its
  5-minute cache, and never serves stale data.
- Rate limiting mirrors express-rate-limit (`src/ratelimit.rs`): the global
  `/api` limiter plus the per-route presets (login, register, refresh,
  forgot-password, verify-email, carrier), keyed on the client IP from
  `TRUST_PROXY` hops exactly like Express's `req.ip` (`src/client_ip.rs`).
  Buckets are in memory per service, so a client gets the budget once on Node
  and once on Rust.
- Shared foundation modules: `password.rs` (bcryptjs-compatible), `tokens.rs`
  (access JWTs byte-identical to Node's, refresh tokens), `csrf.rs` (`Csrf<G>`
  double-submit guard, Node-compatible tokens), `cookies.rs` (cookie-parser /
  `res.cookie`), `email_queue.rs` (the queue producer, abandoned-cart emails,
  unsubscribe tokens). Behaviour is pinned to recorded Node output in
  `crates/api/fixtures/*.json` (`backend/scripts/gen-rust-fixtures.js`,
  `gen-misc-fixtures.js`).
- Express emulation: `express.rs` (body parsers with body-parser's errors, the
  app's 404 `{ path, timestamp }` and error handler, `decode_param`, JS string
  helpers), `express_router.rs` (Express Router matching for whole-group
  dispatchers: case-insensitive literals, trailing slash, registration order),
  `qs.rs` (qs 6.16 for `req.query` and urlencoded bodies), `fedex.rs` (the
  FedEx client, via `reqwest` with rustls).

### Porting the next route group

1. Read the Express route; write a `src/routes/<group>.rs` with `query_as!`
   structs that list the public columns explicitly.
2. Add its URLs to `backend/tests/parity.test.js` and make them pass.
3. `cargo sqlx prepare --workspace -- --all-targets`, commit `.sqlx`.
4. Add the group to `RUST_API_ROUTES` (compose + production build).

Done so far: the public read-only groups, `wishlist`, all of `orders` (incl.
checkout: one transaction for order + coupon redemption + stock decrement +
cart removal, then a queued confirmation email), all of `cart` and
`abandoned-cart`, all of `users` (auth half in `routes/users_auth.rs`, account
half and admin user management in `routes/users_account.rs`), `reviews`,
`returns`, `unsubscribe`, `newsletter`, `contact`, `status` and `shipping`. A
group can move in parts: `partialGroups` in `next.config.mjs` (mirrored in
`src/lib/server/apiTarget.js` for NextAuth's server-side login/refresh calls)
lists the paths of a partly ported group (Next path patterns, regex allowed).
None is partial today. The admin dashboard still proxies everything to Node.
**Auth** lives in `src/auth.rs`: handlers take `AuthUser` / `OptionalUser` /
`StaffOrAdmin` / `Admin` extractors, which mirror Node's `protect` /
`protectOptional` / `staffOrAdmin` / `admin` — Bearer header then `admin_auth`
cookie, HS256 only, `exp`/`nbf` with no leeway, user row re-read per request
(status + `token_version` revocation), identical 401/403 bodies. The parity test
covers forged/expired/`alg:none`/revoked/deactivated tokens. Admin writes use
`Csrf<Admin>`. Next: payments (Stripe checkout session + webhook), then the
admin groups.
