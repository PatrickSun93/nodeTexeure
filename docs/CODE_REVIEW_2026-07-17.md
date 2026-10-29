# NodeTexeure — Full Review (Unfinished Work · Code Quality · Security)

**Date:** 2026-07-17 · **Scope:** storefront (`src/`), backend (`backend/`), admin (`admin-dashboard/`)
**Method:** 4 parallel read-only review agents (unfinished-work, backend-security, backend-quality, frontend/admin) + manual verification of the top headline findings against source. `path:line` cited throughout. Nothing was modified during the review itself — see **Remediation status** below for the fixes applied afterward.

---

## TL;DR verdict

The **security fundamentals are genuinely strong** — no SQL injection, no IDOR, server-side pricing, pinned JWT algorithm, real CSRF, bcrypt, `.env` git-ignored. The real problems are **correctness and completeness**, dominated by one systemic bug and a lot of half-wired UI:

- **One root-cause bug breaks ~10 features:** routes that treat `executeQuery`'s `{success,data}` wrapper as an array. Refunds, webhooks, returns detail, tax lookup, several admin writes, and the in-process email processor all crash or silently no-op because of it.
- **The purchase funnel has a dead end:** the cart page's "Proceed to Checkout" button has no handler.
- **Email is queued but never delivered** in any provided run flow (the daemon is started nowhere).
- **Several documented services don't exist** (Currency, Tax API, zone-Shipping) — orphaned READMEs.
- **Security to-do #1:** guarantee the production `JWT_SECRET` is a strong random value and add a boot-time check — the committed *local* placeholder must never reach prod.

Severity counts below are indicative, not exhaustive.

| Area | High | Medium | Low |
|---|---|---|---|
| Unfinished / broken features | 8 | 18 | 8 |
| Code correctness | 6 | 8 | 6 |
| Security | 1* | 3 | 12 |

\* The High security item is conditional on the production secret (see §3.1).

---

## ✅ Remediation status — updated 2026-07-17 (same day)

Most of this report has since been **fixed and verified** — storefront `next build` + admin `next build` both pass, backend `node --check` is clean, and the new routes load-test cleanly. Remediation was done in-tree via a batch of manual fixes plus parallel sub-agents with strictly disjoint file ownership.

**Fixed & verified**
- **§2.1 `executeQuery` crash class** — added `DatabaseUtil.rows()`/`first()` helpers and fixed every crash site (refunds, Stripe webhooks, returns detail/list, admin label, image upload/delete, tax lookup).
- **§2.2 Reviews subsystem** — rewritten to the real `review_details` JSON schema; create no longer silently drops data; moderation via `is_approved`; "helpful" is auth-gated + one-vote-per-user (new `review_helpful_votes` table, folded into `init.sql`).
- **§2.3** Stripe webhook raw body preserved; **§2.4** tax lookup now reads the table; **§2.5** low-stock `ReferenceError` fixed.
- **§1.1** dead **checkout button**, **contact form**, **abandoned-cart recovery** (endpoint built + link path fixed), **email daemon** now starts (dev+prod) so transactional/contact mail dispatches.
- **§1.3/1.4** free-shipping coupons, per-customer coupon limit, admin dead buttons (delete / add-customer / add-staff / pagination / category filter / tracking persistence), honest `metrics`/`health`.
- **§3** JWT boot-guard, reviewer-email PII removed, NextAuth credential/token logs removed, reset-password strength, password-change re-auth, CSV-injection, unsubscribe-secret fallback, `error.message` leakage (~43 spots), dead `localStorage`-token components deleted.
- **§4** email subsystem runs (#3), `executeQuery` root-cause helper (#2), login-page + storefront consolidation (#4, partial).

**Still open (tracked)**
- Net-new admin surface: **bulk actions**, **customer-detail** and **settings / shipping-zone** endpoints *(in progress)*.
- §4 larger items: **test layer + CI (#1)**, admin **design-token adoption / monolith split (#5)**, **orphaned service READMEs (#6)**.
- Redundant in-process email processor still auto-starts (harmless — the daemon does the real send) — safe to delete.
- **Production `JWT_SECRET`** must be set to a strong value (the boot-guard now enforces this).

Per-item status is in the Appendix checklist.

---

# 1. What's not finished

### 1.1 Highest-impact gaps

1. **Cart "Proceed to Checkout" button is dead** — `src/app/cart/page.js:263`. Bare `<button>` with no `onClick`/`Link` (the sibling "Continue Shopping" is a real `<Link>`). `/checkout` exists; the cart just doesn't reach it. **[High]** *(verified)*
2. **Transactional email is never delivered** — the producer enqueues welcome/verify/reset/order-confirmation, but the consumer `backend/services/emailDaemon.js` is only started by `npm run email-daemon`, which neither `backend/docker-entrypoint.sh:24` / `docker-entrypoint.prod.sh` nor `docker-compose.yml` ever runs. Mail piles up in the queue. **[High]**
3. **Abandoned-cart recovery link 404s** — `src/components/CartRecovery.js:34` calls `/api/abandoned-cart/recovery/:token`, which has no route or mount. Detection + send works; redemption is missing. **[High]**
4. **Currency service is documented but has zero code** — `backend/services/README_CurrencyService.md` describes a service, 6 `/api/currency/*` routes, and frontend `CurrencyContext`/`CurrencySelector`/`PriceDisplay`. None exist. **[High]**
5. **Contact form is faked** — `src/app/contact/page.js:53-63` runs a `setTimeout` (`// Simulate form submission`) and discards the message; no backend route. **[High]**

### 1.2 Storefront dead buttons / links / stubs

- **[Medium]** Newsletter signup is faked (no fetch, no `/api/subscribe`) — `src/components/NewsletterSection.js:20-28`. (Note: `/api/unsubscribe` *is* fully built.)
- **[Medium]** Customer `/dashboard` shows "Order management coming soon" + disabled "View Orders" even though `/orders` works — `src/app/dashboard/page.js:126-130`. Page is also hardcoded English (no i18n) on legacy `aesop-*` classes.
- **[Medium]** Dead links: `/blog` (site uses `/journal`) — `src/app/new-arrive/page.js:268`; `/privacy` (only `/terms` exists) — `src/app/register/page.js:196`.
- **[Medium]** Profile email field permanently `disabled` — users can never change email — `src/app/profile/page.js:399`.
- **[Low-Med]** Duplicate customer login pages: `src/app/login/page.js` (no i18n) vs `src/app/signin/page.js` (i18n, `?redirect=`). NextAuth points at `/login`; `/signin` is a drifted twin.
- **[Low-Med]** Hardcoded homepage data with `/api/placeholder` images — `src/app/page.js:51,209`; new-arrivals image join never wired (`// No listing image in API yet`) — `src/app/new-arrive/page.js:39-40`.

### 1.3 Backend — documented-but-missing / half-built

- **[Medium]** **Tax Service API absent** — `README_TaxService.md` claims `/api/tax/calculate` + rate CRUD; reality is a private `getTaxRate()` with a hardcoded NY fallback — `backend/routes/orderRoutes.js:15-44`. (And it never actually reads the `tax_rates` table — see §2.4.)
- **[Medium]** **Zone/weight shipping API absent** — `README_ShippingService.md` claims `/api/shipping/calculate` + `/zones`; `shipping_zones`/`shipping_rates` are seeded but read by no code. Orders use a static "$100 → free" rule — `orderRoutes.js:256-267`.
- **[Medium]** **Free-shipping coupons have no effect** — admin can create `type='free_shipping'`, but pricing only branches on `percentage`/`fixed_amount` — `orderRoutes.js:237-247`.
- **[Medium]** **Per-customer coupon limit never enforced** — explicit `TODO`, needs a schema change — `orderRoutes.js:319-321`.
- **[Medium]** **Low-stock alerts never fire** — `queueLowStockAlert` has zero callers — `backend/services/emailQueueService.js:142`. (And it would crash anyway — see §2.5.)
- **[Medium]** "Popular search terms" are a hardcoded array — `backend/routes/searchRoutes.js:130-138`.
- **[Medium]** Product variant/inventory rows use ad-hoc IDs (`VAR-${Date.now()}-…`) instead of `get_next_id()` — `backend/routes/adminRoutes.js:186,193`.
- **[Medium]** `cleanup-expired-reservations.js` (releases inventory holds) is scheduled nowhere.
- **[Low]** `/api/inventory/*` REST endpoints from `README_EnhancedInventoryManagement.md` not mounted (logic exists under `/api/admin/inventory/*`).

### 1.4 Admin dashboard — dead handlers & mock views (backends mostly exist)

- **[High]** Product delete (`dashboard/page.js:716`) and "Add New Customer" (`:831`) have **no `onClick`**; "Add New Staff" passes `{}` → `PUT /api/admin/users/undefined` + a `.split()` crash (`:1199`, `src/components/StaffDetailView.js:6,49`).
- **[High]** `CustomerDetailView` is mostly static mock (addresses, phone, member-since); only the order list is real; every edit button inert — `src/components/CustomerDetailView.js`.
- **[Medium]** Order tracking number captured but `handleSave` PUTs only `status` — tracking discarded — `src/components/OrderDetailView.js:231-237`.
- **[Medium]** Bulk-select checkboxes have no `onChange`/bulk actions — `dashboard/page.js:439,461,669,691`; Orders pagination buttons have no `onClick` — `:495-500`.
- **[Medium]** `SettingsView` shipping-zones table + payment-gateway toggles are hardcoded, never persisted — `src/components/SettingsView.js:224-243`.
- **[Medium]** Products category filter compares hardcoded English labels to `category_id` → never matches — `dashboard/page.js:646-647`.
- **[Medium]** Admin `api/metrics` returns hardcoded zeros (`note: 'not implemented'`) — `src/app/api/metrics/route.js:84-116`; admin `api/health` DB check always "healthy" — `src/app/api/health/route.js:99-111`.
- **[Medium]** Product image upload unreachable from UI (decorative dropzone, no file input) though `POST /api/admin/products/:id/image` exists — `src/components/ProductDetailView.js:188-197`.
- **[Medium]** Staff permissions matrix disabled + never sent in save payload — `src/components/StaffDetailView.js:212-221`.
- **[Low]** Dead code in tree: `ExportButton.js`, `components/charts/*`, `IntegrationTest.js`, `PerformanceMonitor.js`.

### 1.5 Intended graceful degradation — NOT gaps (verified)

Stripe / FedEx / AWS SES / S3 all make real calls and fall back cleanly when creds are absent (503 / static rates / `email-outbox` sink / local disk). i18n is genuinely complete — full key parity across `messages/{en,zh,fr,es}.json`. Abandoned-cart *detection* is real and booted. (One caveat: FedEx returns `mock:true` tracking when unconfigured — a `MOCK…` number can surface to customers — `shippingService.js:166-172`.)

---

# 2. Code quality & correctness

### 2.1 The root-cause bug — `executeQuery` wrapper treated as an array

`DatabaseUtil.executeQuery()` **always** returns `{ success, data, affectedRows, insertId }` on success (or `{ success:false, error, code, sqlState }` on failure). It **never** returns a bare array and **never throws** (`backend/utils/database.js:75-118`, verified). Any route written as if it returns rows is buggy:

- `const [x] = await executeQuery(...)` → **`TypeError: object is not iterable`** (hard crash).
- `result.length` / `result[0]` → `undefined` → guards mis-fire, feature silently degrades.
- **Correct access is always `result.data`, after checking `result.success`.**

A single shared helper (e.g. `DatabaseUtil.rows(r)` returning `r.success ? r.data : []`, or throwing on `!success`) would eliminate the entire class. Concrete crash sites:

1. **[High]** Refund + **all** webhook order-status updates crash — `const [order] = …` — `paymentRoutes.js:186,209,230,272`. Every `/refund` 500s before Stripe is called; webhook cases never mark orders paid/refunded. *(verified at :272)*
2. **[High]** `GET /api/returns/:id` always 500s; `GET /api/returns/admin/all` sends the wrapper object as the list, `total` always 0 — `returnRoutes.js:129-133,237-238`.
3. **[High]** Admin create-label, product-image upload, image delete all 500 via array-destructure — `shippingRoutes.js:76`, `imageRoutes.js:76,89,135`.
4. **[Med]** In-process email queue processor throws "not iterable" every 30s (caught + silenced at `debug`) — `emailQueueService.js:174-175`.

> The same files normalize *correctly* in other handlers (e.g. `paymentRoutes.js:41`, `reviewRoutes.js:70` uses `countResult.data[0]`), which is why this reads as drift, not ignorance.

### 2.2 Reviews subsystem written against a non-existent schema — **[High]**

Runtime `product_reviews` (`docker/mysql/init.sql:249-271`, matched by the seed) is `review_details JSON NOT NULL` + `is_approved` — with **no** `status`, `title`, `review_text`, or `helpful_count` columns. But `reviewRoutes.js`:
- `POST /create` inserts `title, review_text, …, status` and omits the `NOT NULL` `review_details` → INSERT fails, `.success` unchecked → user gets **`201 "Review submitted successfully"` with nothing saved** (silent data loss) — `:149-158`.
- `admin/pending` filters `WHERE pr.status='pending'` and `sort=helpful` orders by `pr.helpful_count` → Unknown-column 500 — `:317-331`, `:22`.
- Moderation writes `status`; the public read filters `is_approved` (`:48`) — two different columns, so approving could never surface a review.

Fix: rewrite the route to the real schema (pack title/text into `review_details`, moderate via `is_approved`) and check `.success` on every write.

### 2.3 Stripe webhook body is consumed before signature check — **[Medium]** (if Stripe enabled)

`paymentRoutes.js` mounts `express.raw()` on the webhook route, but `server.js:48` applies `express.json()` globally first, so Stripe receives a parsed body and signature verification fails (400). Combined with §2.1, auto-marking orders paid can't work. Mount the raw parser for that path *before* the global JSON parser. (Security-positive: it fails *closed* — never falsely marks paid.)

### 2.4 `getTaxRate` never reads `tax_rates` — **[Medium]**

`orderRoutes.js:26,38` test `result.length` on the wrapper (always `undefined`), so both lookups are skipped and every order falls through to the hardcoded 8.875% default. The `tax_rates` table is dead. Fix: `if (result.success && result.data.length) …`.

### 2.5 `ReferenceError` in low-stock alert — **[Medium]**

`inventoryService.js:908` loops `adminResult.data`, but the variable is `staffResult` (`:864`). Throws before enqueuing → low-stock alerts never send (also blocked by §1.3's missing caller).

### 2.6 Other correctness / lifecycle

- **[Med]** Cart abandonment tracking selects nonexistent `p.price` (`products` has `base_price`); failure misread as empty cart → `/track-abandonment` never queues — `cartRoutes.js:299`.
- **[Med]** Refresh tokens never persist: `REFRESH` id prefix isn't in `transno` (→ `get_next_id` returns NULL) and `refresh_tokens` table is never created; login's INSERT fails unchecked, `/refresh` always 401 — `userRoutes.js:233-236,318`.
- **[Low-Med]** `setInterval`s started inside service *constructors* (`AbandonedCartService:22`, `EmailQueueService:16`); merely requiring `cartRoutes.js` spins up ≥2 unbounded timers (also in CLI scripts, before DB is ready). Prefer an explicit `.start()` from `server.js`.
- **[Low-Med]** `getOrCreateCart` check-then-insert race + unchecked INSERT — `cartRoutes.js:20-42`. (Order creation itself is correctly transactional — `orderRoutes.js:293-398` — good.)
- **[Low]** Dead: `returnRoutes.js:8` `new DatabaseUtil()` (all-static class); `abandonedCartService.markCartRecovered` never called.
- **Systemic:** most route `catch` blocks return `{ error: error.message }` directly, bypassing the global handler — a consistency *and* security issue (see §3.3).

---

# 3. Security audit

**Bottom line: the core is solid.** Verified clean: **no SQL injection** (LIMIT/OFFSET are `parseInt`-clamped; `IN()`/`FIELD()` use generated `?` placeholders; `ORDER BY` whitelisted; dynamic `SET` uses column allowlists; `multipleStatements:false`), **no IDOR** (ownership enforced on orders/cart/addresses/reviews/returns/wishlist/payments), **server-side pricing** (cart price from `products.base_price`, totals recomputed, discounts clamped, webhook verifies `paid ≥ expected`), **no mass-assignment** role escalation, **JWT HS256 pinned** (blocks `alg:none`/confusion) with 24h expiry, **CSRF** HMAC-signed + user-bound + `SameSite=strict`, **bcrypt** cost 10, **helmet** on, **CORS** an explicit allowlist, **rate limiting** on login/register/forgot, **`.env` git-ignored** (no secrets committed).

The findings are the edges:

### 3.1 [HIGH — conditional] `JWT_SECRET` is a guessable placeholder with no boot validation

Local `.env` uses `your-super-secret-jwt-key-here-…-min-32-chars`; nothing validates it at startup, and the same secret keys the CSRF HMAC. **If production reuses the placeholder**, anyone can forge an admin JWT (`{isAdmin:true}`) → full takeover. `.env` is git-ignored so the prod value can't be seen here. **Action:** set a 32-byte random secret in prod and add a boot check that refuses to start if `JWT_SECRET` is missing/short/equals a known placeholder. *(local weakness confirmed; prod impact NEEDS VERIFICATION)*

### 3.2 [MEDIUM] Public reviews endpoint leaks reviewer emails (PII)

`GET /api/reviews/product/:productId` has no auth yet selects `u.email` and returns it — harvest every reviewer's email for any product — `reviewRoutes.js:12,35,73`. Fix: drop `u.email` from the public SELECT. *(verified)*

### 3.3 [MEDIUM] Systemic info disclosure via raw `error.message`

The global handler redacts in prod (`server.js:170-178`), but individual route catches return `{ error: error.message }` directly, leaking DB/driver/S3 error text (schema, SQL fragments) even in production — nearly every route file (e.g. `userRoutes.js:307`, `paymentRoutes.js:108`, `databaseRoutes.js:200-203` also echoes the query). Fix: `next(error)` / generic messages; gate detail behind non-prod.

### 3.4 [MEDIUM] Product-image upload doesn't whitelist extension (stored-XSS sink)

`s3Service.uploadProductImage` keeps the client extension unchecked (the sibling `POST /upload` correctly whitelists — the inconsistency is the bug); multer only checks the spoofable client MIME. `express.static('/uploads')` then serves `evil.html`/`.svg` same-origin as the API — `s3Service.js:103,108`, `imageRoutes.js`. Admin-gated + needs direct navigation (an `<img>` won't run it), so impact is bounded. Fix: whitelist to image extensions + validate magic bytes; serve `/uploads` with `X-Content-Type-Options: nosniff` + `Content-Disposition: attachment`.

### 3.5 [MEDIUM — frontend] NextAuth route logs plaintext credentials + tokens

`src/app/api/auth/[...nextauth]/route.js:84,104` logs the raw credentials object (email + **password**) and the full backend response (access/refresh tokens) — 13 `console.*` in one file. Fix: delete/redact and gate behind a debug flag.

### 3.6 [LOW] (consolidated)

Hardcoded fallback unsubscribe secret (`utils/emailSuppression.js:48`) → forgeable unsubscribe tokens if `JWT_SECRET` unset · CSV formula injection in exports (`utils/csvExporter.js:15-30`) · `reset-password` skips the strength check registration enforces (`userRoutes.js:834-860`) · password change requires no current password (`userRoutes.js:430-453`) · unlimited unauthenticated "helpful" votes (`reviewRoutes.js:248`) · open image upload for any authed user (`imageRoutes.js:35`) · no per-account login lockout (IP-only, `userRoutes.js:173`) · a few writes miss CSRF for defense-in-depth (`imageRoutes.js:67,130`, `shippingRoutes.js:67`, `wishlistRoutes.js:46,83` — largely mitigated by `SameSite=strict`) · `deleteFile` local branch lacks the traversal guard `saveLocally` has (`s3Service.js:138`) · `DB_PASSWORD || ''` empty-password fallback (`database.js:15`).

### 3.7 [LOW — admin] client-side patterns

Dead orphaned storefront components store JWT/CSRF in `localStorage` (XSS-exposed, and contradict the app's own convention) — `src/components/admin/BulkUploadView.js:37,102`, `src/components/analytics/AnalyticsDashboard.js:37` (both dead — delete them). Admin `middleware.ts:23-28` guard is presence-only (any forged `admin_auth` cookie passes the edge check; real enforcement is backend — acceptable but worth a comment). `dangerouslySetInnerHTML` on journal body (`src/app/journal/[id]/page.js:112`) and admin email-template preview (`EmailTemplatesView.js:260`) — confirm server-side sanitization on write.

---

# 4. What else to improve (strategic)

Beyond the specific bugs, the highest-leverage investments:

1. **Add a test layer + CI.** `npm test` is only lint+build; `smoke` is shallow; there are effectively no unit/integration tests. Minimal `supertest` coverage over each route would have caught the *entire* §2.1 crash class, the dead checkout button, and the reviews-schema mismatch. Wire lint+build+integration+smoke into CI so regressions are caught before merge.
2. **Kill the `executeQuery` bug class at the root.** Add one `DatabaseUtil.rows(result)` helper (or make it throw on `success:false` so failures surface instead of returning a silent wrapper), then sweep every route to use `.data`/`.success`. One change retires ~10 latent bugs.
3. **Make the email subsystem actually run.** Start `emailDaemon` from the Docker entrypoint / compose (or fold the processor into server boot with a proper lifecycle), and delete the redundant in-process processor that throws every 30s.
4. **De-duplicate.** One customer login page (delete the other), one admin login flow, one admin API client (the non-CSRF `lib/api` should go), and remove the cross-app duplicated/dead components. Duplication is already causing drift bugs (e.g. `updateProfile` reading `response.success` vs `status:'SUCCESS'` — `admin AuthContext.js:148`).
5. **Refactor the admin monolith + adopt the design system.** `admin-dashboard/src/app/dashboard/page.js` is ~1,250 lines holding every view inline; split per view. The admin bypasses the `--noirae-*` tokens almost entirely (~1,206 raw Tailwind color utils, hardcoded brand hex) — align it with the storefront's token system.
6. **Reconcile docs with code.** Delete or re-implement the orphaned service READMEs (Currency, Tax API, zone-Shipping, `/api/inventory/*`) — they already misled this review. Consider generating an endpoint list from `server.js` mounts as the source of truth.
7. **Standardize error handling & logging.** Route all catches through the global handler; return generic messages in prod; strip credential/token `console.log`s; add structured logging and *real* health/metrics (both admin endpoints are stubbed).
8. **Schema/code alignment gate.** The reviews mismatch means seed + schema + code have drifted. A CI step that boots the seeded DB and hits each endpoint would catch this permanently.

---

## Appendix — suggested fix order (quick wins first)

1. ✅ **Done** — Cart "Proceed to Checkout" now links to `/checkout` (`cart/page.js:263`).
2. ✅ **Done** — `DatabaseUtil.rows()`/`first()` added; all §2.1 array-destructure crash sites fixed (refunds, webhooks, returns, admin label/image, tax lookup).
3. ✅ **Done** — public reviews SELECT no longer returns `u.email`.
4. ✅ **Done (code)** — `JWT_SECRET` boot-time validation added in `server.js`. ⚠️ **Ops still required:** set a strong secret in the production environment.
5. ✅ **Done** — NextAuth credential/token `console.log`s removed.
6. ✅ **Done** — `emailDaemon` now starts from both Docker entrypoints (dev + prod).
7. ✅ **Done** — reviews subsystem rewritten to the real schema with `.success` checks (+ `review_helpful_votes` table).
8. ✅ **Done** — dead `localStorage`-token components deleted; login pages consolidated onto `/login`.
9. ✅ **Done** — `inventoryService` `staffResult`, `getTaxRate` `.data`, and cart `p.price` all fixed.
10. ✅ **Done** — Stripe raw-body parser now runs before the global JSON parser.

**Beyond the original quick-wins (also completed):** contact/newsletter endpoints + wiring, abandoned-cart recovery endpoint + link-path fix, free-shipping & per-customer coupons, admin dead-button wiring, honest metrics/health, reset-password strength, password-change re-auth, CSV-injection, unsubscribe-secret. **In progress:** net-new admin bulk / customer-detail / settings endpoints.
