# CLAUDE.md — agent guide for NodeTexeure

Guidance for AI agents (Claude Code, Codex, etc.) working in this repo. Humans:
start with [README.md](README.md). Codex/other agents: this file is the source of
truth — [AGENTS.md](AGENTS.md) points here.

## What this is

NodeTexeure is a luxury silk & cashmere bedding e-commerce platform. Pure
JavaScript (no TypeScript in the app), MySQL, three independent apps in one repo.
Design direction: **"Champagne & Charcoal"** (see [docs/DESIGN.md](docs/DESIGN.md)).

| App | Path | Stack | Port |
|-----|------|-------|------|
| Storefront (frontend) | `src/` | Next.js 15, React 19, Tailwind 4 | 3000 |
| Backend API | `backend/` | Express.js, MySQL (`mysql2`), JWT | 6666 |
| Admin dashboard | `admin-dashboard/` | Next.js 14, React 18 | 3005 |

Database: MySQL 8.0, ~42 tables, custom prefixed IDs (`PROD0000000001`), triggers,
and a `get_next_id('PREFIX')` SQL function.

## Running it

**Docker is the primary dev flow (PM2 is deprecated).**

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
  cookie. Middleware: `protect` (auth), `admin` (admin role), `protectOptional`.
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
  `http://localhost:6666` directly. Server-side, use `http.request` (not fetch).
- **`executeQuery` return shape is inconsistent across routes** (some expect a
  rows array, some a `{success, data}` wrapper) — normalize when you touch a
  route (`Array.isArray(r) ? r : r?.data || []`).
- **`payments.status` is a strict ENUM** — valid values include `completed`,
  `refunded`, `pending` (not `succeeded`).
- **The macOS local MySQL CLI can be flaky here** — query via a small `mysql2`
  node script instead (see `seed-example-data.js`).
- **Admin writes need a CSRF token**; a bare `curl` POST returns
  "CSRF token required" — that's correct, not a bug.

## Adding a feature

See [docs/ADD_A_FEATURE.md](docs/ADD_A_FEATURE.md) — the end-to-end path (DB table
+ migration → backend route mounted in `server.js` → frontend page using the
proxy + design tokens → seed example data → smoke test).

## Testing

- `npm run test` — ESLint + production `next build` (the CI gate).
- `npm run smoke` — checks the running stack (frontend pages + backend via proxy).
- Security posture verified: privilege escalation, IDOR, JWT forgery (incl.
  `alg:none`), and SQL injection are all blocked; unauth hits redirect to login.
  Keep it that way — new admin routes go under `protect, admin` (+ CSRF for writes).

## Conventions

- **No TypeScript** in the app (plain JS, ESNext; the admin has one `middleware.ts`).
- Backend is CommonJS (`require`); frontend is ES modules; `@/*` → `src/*`.
- Prepared statements for all user input. Services degrade gracefully when
  integration credentials (Stripe/AWS/FedEx) are absent.
- i18n (multi-language) is **deferred to a `feature/i18n` branch** — it broke the
  app before, so keep it off `main` until verified end-to-end.

## gstack skills (Claude Code)

When a request matches a skill, invoke it first: bugs/errors → `investigate`;
ship/PR → `ship`; QA/test → `qa`; review diff → `review`; design audit →
`design-review`; web browsing/screenshots → `browse` (never the
`mcp__claude-in-chrome__*` tools).
