# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NodeTexeure is a luxury bed texture e-commerce platform (silk/cashmere bedding). It's a JavaScript monorepo with three independent apps:

- **Frontend** (`src/`) - Next.js 15 App Router + React 19 + TailwindCSS 4 on port 3000
- **Backend** (`backend/`) - Express.js REST API on port 6666
- **Admin Dashboard** (`admin-dashboard/`) - Next.js 14 + React 18 on port 3005

Database: MySQL 8.0+ with 44 tables, 66 triggers, and a custom prefixed ID system.

## Commands

### Development
```bash
npm run dev              # Start all 3 apps via PM2
npm run dev:frontend     # Frontend only
npm run dev:backend      # Backend only (nodemon)
npm run pm2:logs         # View PM2 logs
npm run pm2:status       # Check running processes
npm run pm2:stop         # Stop all
```

### Database
```bash
npm run db:test          # Test MySQL connection
npm run db:init          # Initialize schema from database/database_schema.sql
npm run db:reset         # Reset database (dev only)
```

### Backend-specific (run from `backend/`)
```bash
npm run dev              # Nodemon watch mode
npm run seed:rnd         # Seed random test data
npm run email-daemon     # Start email queue processor
```

### Admin Dashboard (run from `admin-dashboard/`)
```bash
npm run dev              # Dev server on port 3005
```

### Linting
```bash
npm run lint             # ESLint (Next.js core web vitals)
```

No test framework is configured (`npm test` is a no-op).

## Architecture

### API Proxy Pattern
The frontend Next.js app proxies API calls to the backend via `next.config.mjs` rewrites. Routes like `/api/users/*`, `/api/products/*`, etc. are rewritten to the Express backend. The frontend `src/lib/api.js` module handles API client logic.

### Backend Structure
- **Routes** (`backend/routes/`) - 18 route files, feature-based (users, products, orders, cart, payments, admin, search, reviews, images, shipping, analytics, returns, wishlist, etc.)
- **Services** (`backend/services/`) - External integrations: Stripe payments, AWS SES email, AWS S3 images, FedEx shipping
- **Middleware** (`backend/middleware/`) - Auth (JWT), CSRF, request logging
- **Utils** (`backend/utils/`) - Database pool, response formatter, logger, CSV tools

### Authentication
- JWT tokens via Authorization header or `admin_auth` HttpOnly cookie
- Three middleware levels: `protect` (auth required), `admin` (admin only), `protectOptional` (works with or without auth)
- NextAuth on the frontend side for session management

### API Response Format
All backend endpoints must use `ResponseFormatter` from `backend/utils/responseFormatter.js`:
```javascript
ResponseFormatter.success("Message", data)   // { status: "SUCCESS", message: "...", keyValueTable: [...] }
ResponseFormatter.failure("Message", data)    // { status: "FAIL", message: "...", keyValueTable: [...] }
```
The data field is always called `keyValueTable` regardless of content shape.

### Database Access
- Uses `mysql2/promise` with connection pooling (10 connections)
- All queries go through `DatabaseUtil.executeQuery()` in `backend/utils/database.js`
- Uses prepared statements (parameterized queries) for all user input
- Custom ID system: `get_next_id('PREFIX')` SQL function generates IDs like `USER0000000001`, `PROD0000000002` (see `database/database_schema.sql`)

### Frontend Structure
- App Router with file-based routing in `src/app/`
- Components in `src/components/` (filters, reviews, analytics, admin subdirs)
- Path alias: `@/*` maps to `src/*`
- Design tokens in `src/styles/design-tokens.css`

### Environment Configuration
Three separate `.env` files:
- Root `.env` - Frontend (NEXTAUTH_SECRET, BACKEND_URL)
- `backend/.env` - Backend (DB_*, JWT_SECRET, AWS_*, STRIPE_*)
- `admin-dashboard/.env.local` - Admin panel

Services degrade gracefully when credentials are missing (e.g., SES falls back to console logging).

## Key Conventions

- **No TypeScript** - Pure JavaScript throughout (ESNext features, JSDoc where present)
- **No Docker** - Local development runs directly on the host
- **Multi-language** - Routes and content support English and Simplified Chinese
- Backend uses CommonJS (`require`/`module.exports`), frontend uses ES modules

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`
