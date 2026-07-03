# NodeTexeure

A full-stack luxury bedding e-commerce platform (silk & cashmere) — customer
storefront, REST API, and admin dashboard. Pure JavaScript, MySQL. Design
direction: **"Champagne & Charcoal"** (warm, editorial, with a light + dark theme).

![Home](docs/screenshots/01-home.png)

> Full page gallery: **[docs/screenshots/](docs/screenshots/)** · design language:
> **[docs/DESIGN.md](docs/DESIGN.md)** · all 30 redesign mockups: **[design/](design/)**

---

## What's inside

| App | Path | Stack | Port |
|-----|------|-------|------|
| **Storefront** | `src/` | Next.js 15, React 19, Tailwind 4 | 3000 |
| **Backend API** | `backend/` | Express.js, MySQL, JWT | 6666 |
| **Admin dashboard** | `admin-dashboard/` | Next.js 14, React 18 | 3005 |

The frontend never touches the DB directly — it proxies `/api/*` to the backend.
The DB (MySQL 8.0) is seeded with **real example data** (orders, reviews, product
images) — no mock data.

---

## Multi-language

The storefront ships in four languages — **English**, **中文**, **Français**, and
**Español** — switched from a `LanguageSwitcher` in the header. Localization is
cookie-based `next-intl`: the switcher sets a `NEXT_LOCALE` cookie that's read
server-side, so there's deliberately **no `[locale]` URL segment**. Product copy is
localized too — the backend serves translated names and descriptions from the
`product_translations` table. (Transactional emails stay English by design.)

---

## Quick start

### With Docker (recommended)

```bash
docker compose up
```

That's it. On first run it creates the schema and seeds demo + example data. Open
**http://localhost:3000** (admin at **http://localhost:3005**). Hot-reload is on.

### Without Docker

Requires Node 18+ and a local MySQL 8.0.

```bash
npm install && (cd backend && npm install) && (cd admin-dashboard && npm install)
cp .env.example .env && cp backend/.env.example backend/.env   # set DB_PASSWORD in backend/.env
npm run db:init                                                 # create schema
cd backend && npm run seed:rnd && npm run seed:example && cd .. # demo + example data
npm run dev:frontend    # storefront (:3000)
npm run dev:backend     # backend (:6666), in another terminal
```

Verify: `npm run test` (lint + build) and `npm run smoke` (stack health).

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Customer | `alice.customer@example.com` | `Customer@123` |
| Admin | `admin@example.com` | `Admin@123` |
| Staff | `staff@example.com` | `Staff@123` |

---

## Commands

```bash
docker compose up            # full dev stack (mysql + 3 apps, hot-reload)
docker compose exec backend npm run seed:example   # re-seed example data
docker compose -f docker-compose.prod.yml up -d --build   # production stack

npm run test     # ESLint + production build (CI gate)
npm run smoke    # health-check the running stack
npm run db:reset # drop + recreate schema (dev only)
```

---

## The design — Champagne & Charcoal

Warm champagne surfaces, charcoal ink, gold accents; Cormorant Garamond display
type over Jost. A full **dark mode** ("Charcoal & Candlelight") ships via the theme
toggle in the header. Everything is driven by `--noirae-*` design tokens, so one
token block re-skins the whole app. Palette, fonts, and theming details:
**[docs/DESIGN.md](docs/DESIGN.md)**.

|  |  |
|---|---|
| ![Light](docs/screenshots/champagne-light.png) | Light (champagne) |

---

## Architecture

```
Browser ─► Storefront (Next.js, :3000)
                │  rewrites /api/* ─► Backend (Express, :6666) ─► MySQL
            Admin dashboard (Next.js, :3005) ─► Backend
```

- **API proxy:** the browser only talks to `:3000`; the backend port `6666` is a
  browser-blocked port, so all API access goes through the proxy.
- **Auth:** JWT + an `admin_auth` cookie; three middleware levels; admin writes
  require a CSRF token.
- **IDs:** human-readable prefixed IDs (`PROD0000000001`) via a `get_next_id` SQL
  function.

---

## Documentation

- **[CLAUDE.md](CLAUDE.md)** / **[AGENTS.md](AGENTS.md)** — guide for AI agents
  (Claude Code, Codex): architecture, gotchas, conventions.
- **[docs/DESIGN.md](docs/DESIGN.md)** — the Champagne & Charcoal design system.
- **[docs/ADD_A_FEATURE.md](docs/ADD_A_FEATURE.md)** — how to add a feature end-to-end.
- **[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)** — honest state + process.
- **[BACKEND.md](BACKEND.md)** · **[FRONTEND.md](FRONTEND.md)** ·
  **[DATABASE.md](DATABASE.md)** · **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**.

---

## Troubleshooting

**Backend `:6666` unreachable in a browser** — expected; 6666 is a browser
blocked-port. Use the storefront proxy (`:3000/api/*`).

**MySQL / DB issues** — `npm run db:test`; with Docker, `docker compose logs mysql`.

**Port already in use** — `lsof -ti:3000 | xargs kill -9` (or `:6666`, `:3005`).

**Stale build** — `npm run clean`.
