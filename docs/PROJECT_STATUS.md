# Project status & process

Honest snapshot of what works, how the project was brought to a demoable state,
and how to reproduce each step.

## Current state

**Runs end-to-end locally.** Frontend build passes (37 routes), backend boots
against seeded MySQL, and the smoke test is green.

| Area | Status |
|------|--------|
| Storefront (browse, product detail, collections, static pages) | ✅ Working |
| Auth (register, login, NextAuth session, profile) | ✅ Working |
| Product catalog + search + reviews API | ✅ Working |
| Cart / checkout / orders / wishlist / returns pages | ✅ Render; start empty for the demo account |
| Admin dashboard (`:3005`) | ✅ Separate app, runs independently |
| Stripe / AWS SES / AWS S3 / FedEx | ⚙️ Wired, but need real credentials; degrade to console logging without them |

### Known limitations

- **Empty demo data on account pages.** The seeded customer has no cart/orders,
  so cart, checkout, and orders show empty states. The pages are correct; the data
  is just empty. Product stock is variant-level, so populating a cart needs a
  variant with inventory.
- **Product images are placeholders.** No real product imagery is seeded; the app
  serves gray `600x600` placeholders via `/api/placeholder`.
- **Reviews widget** can briefly show "Network error" before falling back to
  "No reviews yet" on the product page.
- **Backend port 6666** is on the browser "bad ports" list — reach the backend
  through the storefront proxy (`:3000/api/*`), not directly in a browser.
- **Git history** still contains an old localhost MySQL dev password and an
  expired local JWT (both localhost-only, low risk). Rotate the local DB password
  if you consider it sensitive, or scrub history before publishing.

## How this was built (repeatable process)

The project was assembled from several divergent branches and stabilized in five
steps. Each is reproducible.

### 1. Review

Inspect the branches and the diff before merging:

```bash
git branch -a
git log main..HEAD --oneline
git diff main...HEAD --stat
```

### 2. Merge

`feature/immediate-fixes` fast-forwards cleanly into `main`. `featurePayment` had
diverged into a parallel rewrite (different design system, its own admin backend,
~98k lines) and was merged with conflicts resolved in favor of the current, QA'd
app, then curated: dead/duplicate code from the divergent branch was pruned using
dependency-reachability analysis (only files unreachable from real entry points
were removed).

### 3. Test

```bash
npm run test     # ESLint + production build (the CI gate)
npm run smoke    # health-check the running stack via the API proxy
```

There is no unit-test suite: the merged codebase's services did not match the
divergent branch's stale tests, so those were removed in favor of the build gate
plus the runtime smoke test.

### 4. Screenshots

With the stack running and the DB seeded, capture every page (see the tools you
prefer; these were captured headless at 1440px). Output lives in
[`screenshots/`](screenshots/). Authenticated pages are captured after logging in
as `alice.customer@example.com` / `Customer@123`.

### 5. Public-readiness

- Secrets scrub: removed a tracked cookie file, converted `.env.production` files
  to `.example` templates, added `backend/.env.example`, and hardened
  `.gitignore`. No production/cloud secrets were ever committed.
- Docs consolidated into this README + reference docs.

## Reference docs

- [`../README.md`](../README.md) — setup and commands
- [`../BACKEND.md`](../BACKEND.md) — API & backend
- [`../FRONTEND.md`](../FRONTEND.md) — frontend structure
- [`../DATABASE.md`](../DATABASE.md) — schema & design
- [`../CUSTOM_ID_SYSTEM.md`](../CUSTOM_ID_SYSTEM.md) — the prefixed-ID system
- [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) — common issues
