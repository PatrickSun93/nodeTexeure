# CLAUDE.md — agent guide for NodeTexeure

Guidance for AI agents (Claude Code, Codex, etc.) working in this repo. Humans:
start with [README.md](README.md). Codex/other agents: this file is the source of
truth — [AGENTS.md](AGENTS.md) points here.

## What this is

NodeTexeure is a luxury silk & cashmere bedding e-commerce platform. JavaScript
storefront and Express backend, a TypeScript admin dashboard, Rust services,
MySQL, three independent apps in one repo.
Design direction: **"Champagne & Charcoal"** (see [docs/DESIGN.md](docs/DESIGN.md)).

| App | Path | Stack | Port |
|-----|------|-------|------|
| Storefront (frontend) | `src/` | Next.js 15, React 19, Tailwind 4 | 3000 |
| Backend API | `backend/` | Express.js, MySQL (`mysql2`), JWT | 6666 |
| Admin dashboard | `admin-dashboard/` | Next.js 15, React 19, TypeScript (strict) | 3005 |
| Rust API | `rust/crates/api` | Axum, sqlx | 7000 |
| Email daemon | `rust/crates/email-daemon` | Rust, sqlx, AWS SES v2 | — |
| Background worker | `rust/crates/api` (`worker` bin) | Rust, sqlx | — |

The backend is being ported to Rust piece by piece (`rust/`, see
[rust/README.md](rust/README.md)): the email daemon and every `/api` group
`server.js` mounts are done — the public read-only APIs (`products`, `search`,
`journal`), all of `settings`, `wishlist`, all of `orders` (incl. checkout/order
creation), all of `cart` and `abandoned-cart`, all of `users` (auth + account +
admin user management), `reviews`, `returns`, `unsubscribe`, `newsletter`,
`contact`, `status`, `shipping`, `payments` (Stripe), `images`, `database`, and
the whole `/api/admin` subtree (dispatcher `admin.rs`, one
`routes/admin/<area>.rs` per Node router), plus the `worker` binary
(`src/bin/worker.rs`, `src/jobs/`): migrations, expired stock-reservation
release and abandoned-cart detection, under MySQL named locks shared with
`backend/utils/jobLock.js` (the backend's timers are off with
`BACKGROUND_JOBS=off`). Still on Node: seeds and the `/uploads` static route;
the Node routes and jobs stay as the rollback target. Shared Rust building blocks: `ratelimit.rs` + `client_ip.rs`
(express-rate-limit / `TRUST_PROXY`), `password.rs` (bcryptjs), `tokens.rs`
(JWT/refresh), `csrf.rs` (`Csrf<Admin>`), `cookies.rs`, `email_queue.rs`,
`express.rs` / `express_router.rs` / `qs.rs` (Express body parsing, 404/error
handler, routing, qs), and for the back office `multer.rs`, `mysql_json.rs`
(mysql2 rows for dynamic SQL), `csv.rs`, `express_send.rs`, `js_date.rs`,
`stripe.rs`, `s3.rs`, `imaging.rs`, `v8_json.rs`.
Rust auth (`rust/crates/api/src/auth.rs`: `AuthUser`, `OptionalUser`,
`StaffOrAdmin`, `Admin` extractors) mirrors `protect`/`admin` exactly. The storefront proxy sends the groups in `RUST_API_ROUTES` to the Rust API,
and the admin dashboard does the same with its own list
(`admin-dashboard/rustRoutes.mjs`; `ADMIN_RUST_API_ROUTES` in prod compose);
a ported group must pass `backend/tests/parity.test.js` / its `parity-<group>.test.js` (identical JSON to Node).
Write new public endpoints in `rust/crates/api`. New Rust queries use
sqlx `query!` macros — refresh `rust/.sqlx` with `cargo sqlx prepare --workspace
-- --all-targets` after changing one, or CI fails.

Database: MySQL 8.0 (schema migrations in `backend/migrations/`, applied on
backend start via `npm run migrate`), ~42 tables, custom prefixed IDs (`PROD0000000001`), triggers,
and a `get_next_id('PREFIX')` SQL function.

## Running it

**Docker is the primary dev flow.**

```bash
docker compose up            # mysql + backend + frontend + admin, hot-reload
# first run auto-creates the schema and seeds demo + example data
# open http://localhost:3000   (admin: http://localhost:3005)
```

Manual (no Docker) fallback: MySQL running locally, then
`npm install` (root, `backend/`, `admin-dashboard/`), `npm run db:init`,
`cd backend && npm run seed:rnd && npm run seed:example`, then
`npm run dev:frontend` + `npm run dev:backend`.

Verify: `npm run test` (lint + build) and `npm run smoke` (stack health).

### Demo accounts (from the seed)
`admin@example.com` / `Admin@123` · `alice.customer@example.com` / `Customer@123`
(staff: `staff@example.com` / `Staff@123`).

## Architecture

- **API proxy.** The browser only talks to `:3000`; `next.config.mjs` rewrites
  `/api/<route>/*` to the backend. **The rewrite target is baked in at
  `next build`** — change `BACKEND_URL`/`PRODUCTION_BACKEND_URL` then rebuild.
- **Auth.** JWT via `Authorization: Bearer` header or an `admin_auth` HttpOnly
  cookie. `protect` re-reads role/status/`token_version` from `users` on each
  request, so bumping `token_version` revokes a user's tokens immediately. Middleware: `protect` (auth), `protectOptional`, `staffOrAdmin`, `admin`.
  Admin write endpoints also require a CSRF token (`X-CSRF-Token`). Customer and
  admin auth flows are separate.
- **Response format.** Every endpoint returns
  `{ status: 'SUCCESS'|'FAIL', message, keyValueTable }` via
  `backend/utils/responseFormatter.js`. `keyValueTable` shape varies (often an
  array wrapping named objects, e.g. `[{ users: [...] }]`).
- **DB access.** All queries go through `backend/utils/database.js`
  (`DatabaseUtil.executeQuery`, prepared statements). Custom IDs via
  `SELECT get_next_id('PREFIX')` — the prefix must exist in the `transno` table
  (register with `INSERT IGNORE INTO transno (prefix,count,details) VALUES (...)`).

## Design system — Champagne & Charcoal

All styling flows through CSS custom properties in `src/styles/design-tokens.css`
(`--noirae-*`). **Never hardcode colors/fonts — use the tokens**, so light + dark
both work from one source. Fonts: Cormorant Garamond (display), Jost (body),
EB Garamond (editorial). Dark mode = a `[data-theme='dark']` token block +
`ThemeToggle` (header) + a no-flash script in `layout.js`. Full reference and the
palette table: [docs/DESIGN.md](docs/DESIGN.md).

## Data is real, not mock

The DB is seeded with real example data (`backend/scripts/seed-example-data.js`:
orders, payments, reviews, wishlist, product images). **Do not add mock/hardcoded
data to code** — wire features to the DB and seed example rows instead. Product
imagery is served from the `product_images` table (`public/images/bedding/*.jpg`).

## Gotchas (hard-won — read before debugging)

- **Port 6666 is a browser-blocked "bad port."** Browsers and Node `fetch`
  refuse it. Client code must call `/api/*` (relative, via the proxy), never
  `http://localhost:6666` directly. Server-side, use `getBackendJson()` from
  `src/lib/server/backend.js` (it uses `http.request`; Node's fetch refuses the port).
- **`executeQuery` never throws and always returns `{ success, data, affectedRows,
  insertId }`** (`{ success: false, error }` on failure). Read rows with
  `DatabaseUtil.rows(result)` / `DatabaseUtil.first(result)` — never index the
  wrapper — and check `result.success` on writes, or failures are silent.
- **`payments.status` is a strict ENUM** — valid values include `completed`,
  `refunded`, `pending` (not `succeeded`).
- **The macOS local MySQL CLI can be flaky here** — query via a small `mysql2`
  node script instead (see `seed-example-data.js`).
- **Admin writes need a CSRF token**; a bare `curl` POST returns
  "CSRF token required" — that's correct, not a bug.

## Docs map

[docs/DATABASE.md](docs/DATABASE.md) (schema, IDs, migrations) ·
[docs/adr/](docs/adr/) (architecture decisions: the Rust port, parity, sqlx) ·
[docs/API.md](docs/API.md) (generated — run `node scripts/gen-api-docs.js` after
changing routes) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) ·
[backend/README.md](backend/README.md).

## Adding a feature

See [docs/ADD_A_FEATURE.md](docs/ADD_A_FEATURE.md) — the end-to-end path (DB table
+ migration → backend route mounted in `server.js` → frontend page using the
proxy + design tokens → seed example data → smoke test).

## Testing

- `npm run test` — storefront ESLint + production `next build`.
- `cd admin-dashboard && npm run lint && npm run typecheck && npm run build` — the
  admin's checks (strict `tsc --noEmit`).
- `cd backend && npm test` — Jest + supertest API tests against a real, seeded
  MySQL (`tests/*.test.js`: auth, revocation, CSRF, IDOR, checkout, SQLi). Point
  `DB_HOST`/`DB_PORT` at the Docker MySQL (`DB_PORT=3307`).
- `npm run smoke` — checks the running stack (frontend pages + backend via proxy).
- `cd rust && cargo test -- --include-ignored --test-threads=1` — Rust unit +
  MySQL integration tests (needs `DATABASE_URL`).
- CI (`.github/workflows/ci.yml`) runs all of the above for both Next apps, the
  backend and `rust/` (MySQL service → `init.sql` → `migrate` → seed → tests; plus
  rustfmt, clippy, the `.sqlx` freshness check and the image build) plus `npm audit`.
- Security posture is enforced by those tests: privilege escalation, IDOR, JWT
  forgery (incl. `alg:none`), revoked sessions, and SQL injection are blocked.
  Keep it that way — new admin routes go in `backend/routes/admin/` with an `admin` or
  `staffOrAdmin` guard (+ CSRF for writes)
  and get a test. Role denials are 403; missing/invalid auth is 401.

## Conventions

- **TypeScript only in the admin dashboard.** The storefront and backend are plain JS
  (ESNext). `admin-dashboard/src` is all `.ts`/`.tsx` under `strict` with
  `allowJs: false`; `npm run typecheck` (`tsc --noEmit`) runs in CI. Response
  shapes live in `admin-dashboard/src/types/api.ts`: type the `apiFetch<T>` call
  instead of casting the result.
- Backend is CommonJS (`require`); frontend is ES modules; `@/*` → `src/*`.
- Prepared statements for all user input. Services degrade gracefully when
  integration credentials (Stripe/AWS/FedEx) are absent.
- **i18n (multi-language)** is implemented with **cookie-based `next-intl`** in both
  Next.js apps — a `NEXT_LOCALE` cookie read server-side in `src/i18n/request.js`
  (per app), a `LanguageSwitcher` that sets the cookie + `router.refresh()`, and
  namespace-per-page message catalogs under `messages/{en,zh,fr,es}.json`. There is
  deliberately **no `[locale]` URL segment** — URL-based routing is what broke i18n
  before. Keep every locale in per-namespace key parity. Transactional emails stay
  English by design. Backend serves translated product copy via
  `product_translations` (`LEFT JOIN` + `COALESCE`, keyed off `resolveLocale(req)`).

## gstack skills (Claude Code)

When a request matches a skill, invoke it first: bugs/errors → `investigate`;
ship/PR → `ship`; QA/test → `qa`; review diff → `review`; design audit →
`design-review`; web browsing/screenshots → `browse` (never the
`mcp__claude-in-chrome__*` tools).
