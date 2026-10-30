# Deployment

Production runs as one Docker Compose stack: `docker-compose.prod.yml`
(MySQL + backend + storefront + admin). Put a TLS-terminating reverse proxy
(Caddy, nginx, a cloud load balancer) in front of ports 3000 and 3005.

## 1. Configure

```bash
cp backend/.env.example backend/.env    # integrations: Stripe, SES, S3, FedEx, Sentry, CORS…
```

Then export (or put in a root `.env`, which compose reads automatically):

| Variable | Notes |
|---|---|
| `DB_PASSWORD` | MySQL root password. Required. |
| `JWT_SECRET` | 32+ random chars; the backend refuses to start with a weak one. Required. |
| `NEXTAUTH_SECRET` | Random secret for storefront sessions. Required. |
| `NEXTAUTH_URL` | Public storefront URL, e.g. `https://shop.example.com`. |

In `backend/.env` set at least `FRONTEND_URL` (storefront origin used in emails and
Stripe redirects) and `CORS_ORIGINS` (storefront + admin origins). Leave an
integration's keys unset to disable it; each one degrades gracefully.

### Client IPs and rate limits (`TRUST_PROXY`)

Both APIs rate-limit per client IP (`RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS`
for all of `/api`, plus tighter limits on login, registration, password reset and
shipping quotes). `TRUST_PROXY` — read by the backend (`app.set('trust proxy')`)
and by the Rust `api` — says how many proxy hops in front of the service may set
`X-Forwarded-For`; the client IP is then the entry that many hops back
(Express's rule):

| `TRUST_PROXY` | Client IP | Use when |
|---|---|---|
| `0` (code default) | the TCP peer; `X-Forwarded-For` ignored | clients reach the service directly |
| `1` (compose default) | the right-most `X-Forwarded-For` entry | only the storefront/admin reach it **and** the TLS proxy in front of them sets `X-Forwarded-For` |
| `n` | `n` entries from the right | `n` trusted proxies |

With `0` behind the storefront, every visitor shares the storefront's single
bucket (e.g. 5 logins per 15 minutes for the whole shop). Next.js rewrites (and
the storefront's server-side login call, which forwards the header) pass
`X-Forwarded-For` through **unchanged and never add the client address**
(verified with `next dev` and `next start`, Next 15.5), so the address must come
from the TLS proxy:

- Caddy `reverse_proxy` and cloud load balancers set it by default.
- nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`

If nothing in front sets it, a client can send its own `X-Forwarded-For` and pick
its bucket — use `TRUST_PROXY=0` then. Never expose 6666/7000 publicly with a
non-zero value. The value must be a hop count (`true`, IP lists, etc. are
rejected and treated as `0`).

The storefront's `/api` proxy target is baked in at build time
(`PRODUCTION_BACKEND_URL`, set to `http://backend:6666` in the compose file).
Route groups listed in `RUST_API_ROUTES` (default `products,search,journal,settings/public,wishlist,orders,cart`) go to the Rust API
(`api` service) instead. **Rollback:** build with `RUST_API_ROUTES=` (empty) to
send everything to the Node backend. Rebuild the frontend after changing either.

## 2. Ship

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- First start: MySQL loads `docker/mysql/init.sql`. **No demo data is seeded.**
  Create the first admin:
  `docker compose -f docker-compose.prod.yml exec -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='…' backend npm run create-admin`
  (12+ characters, mixed case and a digit).
- Every start: the backend applies pending migrations (`backend/migrations`), then
  starts the API. The `email-daemon` container (Rust, `rust/`) waits for those
  migrations, then delivers queued email via SES using the `AWS_*` settings in
  `backend/.env`.
- **Upgrading across migration 014** (HTML escaping moved into the email daemon):
  stop the old `email-daemon` first, then deploy the backend (it runs the
  migration), then start the new daemon. An old daemon left running after the
  migration would send names and addresses into email HTML unescaped. Migration
  014 also replaces the `order_confirmation` template; an admin-edited version is
  kept as the inactive `order_confirmation_pre_014` template.
- The backend container is healthy only when `GET /api/status/health` returns
  200, which requires a working DB connection (503 otherwise). Storefront and
  admin wait for it.

## 3. Stripe

Point a Stripe webhook at `https://<storefront>/api/payments/webhook` with the
events `checkout.session.completed`, `payment_intent.succeeded` and
`charge.refunded`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Webhook
handlers return non-2xx if the order can't be updated, so Stripe retries.

## 4. Operate

- **Health / uptime:** monitor `GET /api/status/health` (via the storefront proxy:
  `https://<storefront>/api/status/health`).
- **Errors:** set `SENTRY_DSN` in `backend/.env` to report unhandled backend
  errors (no PII is sent).
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f backend email-daemon`.
- **Email queue:** the admin's Email Queue view shows pending/sending/failed rows;
  failed sends retry with backoff and can be requeued there.
- **Backups:** `database/db-manager.sh backup` / `restore <file>`, or `mysqldump`
  against the `mysql` service. Back up before deploying a migration.
- **Revoking access:** changing a user's role or status, a password reset, or an
  admin logout bumps `users.token_version`, which invalidates that user's tokens
  immediately.

## Pre-launch checklist

- [ ] Strong `JWT_SECRET`, `NEXTAUTH_SECRET`, `DB_PASSWORD`; `backend/.env` not in git
- [ ] `NODE_ENV=production` (rate limits on, raw-SQL endpoint off, secure cookies)
- [ ] HTTPS in front of 3000/3005; MySQL not exposed publicly
- [ ] The TLS proxy sets `X-Forwarded-For` (else `TRUST_PROXY=0`); 6666/7000 not public
- [ ] `FRONTEND_URL`, `NEXTAUTH_URL`, `CORS_ORIGINS` use the real domains
- [ ] Stripe live keys + webhook secret; test a purchase and a refund
- [ ] SES sender verified; test password-reset and order-confirmation emails
- [ ] Demo accounts absent (production isn't seeded); first admin created
- [ ] Backups scheduled and a restore tested
- [ ] CI green on the commit being deployed
