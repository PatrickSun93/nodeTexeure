# AGENTS.md

Agent instructions for **NodeTexeure**. This repo is designed to be worked by any
coding agent (Claude Code, Codex, Cursor, …). **The full guide is
[CLAUDE.md](CLAUDE.md) — read it first.** This file is the 30-second orientation.

## Orientation
- Three apps in one repo: storefront (`src/`, Next 15, :3000), backend API
  (`backend/`, Express, :6666), admin (`admin-dashboard/`, Next 14, :3005) + MySQL.
- Run it all: `docker compose up` (auto-creates schema, seeds demo + example data),
  then open http://localhost:3000 (admin :3005).
- Verify a change: `npm run test` (ESLint + `next build`) and `npm run smoke`
  (stack health).
- Demo login: `alice.customer@example.com` / `Customer@123` ·
  `admin@example.com` / `Admin@123`.

## Rules that bite if ignored
- **Style only via `--noirae-*` design tokens** (`src/styles/design-tokens.css`).
  Light and dark both come from these — never hardcode colors/fonts.
- **No mock/hardcoded data.** Wire features to the DB; add example rows to
  `backend/scripts/seed-example-data.js`.
- **Client code calls `/api/*`** (relative, via the Next proxy) — never
  `http://localhost:6666` (it's a browser-blocked port).
- **Admin routes** use `protect, admin` middleware; admin writes require a CSRF
  token.

Architecture, the design system, the gotchas, and how to add a feature are all in
**[CLAUDE.md](CLAUDE.md)**, [docs/DESIGN.md](docs/DESIGN.md), and
[docs/ADD_A_FEATURE.md](docs/ADD_A_FEATURE.md).
