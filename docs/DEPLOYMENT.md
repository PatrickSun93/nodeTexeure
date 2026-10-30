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

The storefront's `/api` proxy target is baked in at build time
(`PRODUCTION_BACKEND_URL`, set to `http://backend:6666` in the compose file).
Route groups listed in `RUST_API_ROUTES` (default `products`) go to the Rust API
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
- [ ] `FRONTEND_URL`, `NEXTAUTH_URL`, `CORS_ORIGINS` use the real domains
- [ ] Stripe live keys + webhook secret; test a purchase and a refund
- [ ] SES sender verified; test password-reset and order-confirmation emails
- [ ] Demo accounts absent (production isn't seeded); first admin created
- [ ] Backups scheduled and a restore tested
- [ ] CI green on the commit being deployed
