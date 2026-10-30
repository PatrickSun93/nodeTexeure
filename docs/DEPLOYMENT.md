# Deployment

Two ways to run production, both with the same images and the same settings:

- **Kubernetes (the default): a single-node k3s cluster on one VM, deployed by
  GitHub Actions.** Terraform creates the server (`infra/terraform`). Every
  green push to `main` then builds the images, pushes them to GHCR, rolls the
  cluster forward, checks `https://shop.<domain>/health` for the new commit,
  and rolls back if any of that fails (`.github/workflows/deploy.yml`). Setup,
  secrets and operations: **[infra/README.md](../infra/README.md)**. The
  reasoning: [adr/0004](adr/0004-single-node-k3s-with-in-cluster-mysql.md).
- **Docker Compose** on any host: `docker-compose.prod.yml` (MySQL + backend +
  storefront + admin + the Rust `api`, `worker` and `email-daemon`) behind a
  TLS-terminating reverse proxy (Caddy, nginx, a cloud load balancer) in front
  of ports 3000 and 3005.

The rest of this page applies to both. For Kubernetes:

- the variables below go into the `APP_ENV` secret (dotenv format) instead of
  `.env` files;
- Traefik is the TLS proxy;
- MySQL is the `mysql` StatefulSet;
- run one-off commands with `kubectl -n nodetexeure exec deploy/backend -- …`
  in place of `docker compose exec backend …`.

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
| `0` (default) | the TCP peer; `X-Forwarded-For` ignored | clients reach the service directly, or nothing in front sets `X-Forwarded-For` |
| `1` | the right-most `X-Forwarded-For` entry | only the storefront/admin reach it **and** 3000/3005 are reachable only through a TLS proxy that sets `X-Forwarded-For` |
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
its bucket — or lock someone else out of theirs — so the compose files don't
set it: put `TRUST_PROXY=1` in `backend/.env` (read by both `backend` and
`api`) only once the TLS proxy is in place **and** 3000/3005 can't be reached
around it (e.g. publish them as `127.0.0.1:3000:3000`). Never expose 6666/7000
publicly with a non-zero value. The value must be a hop count (`true`, IP lists, etc. are
rejected and treated as `0`).

On the k3s cluster, Traefik is that proxy. It keeps the client address
(`externalTrafficPolicy: Local`, set by cloud-init) and sets
`X-Forwarded-For`, and the app Services are ClusterIP only, so put
`TRUST_PROXY=1` in `APP_ENV`.

The storefront's `/api` proxy target is baked in at build time
(`PRODUCTION_BACKEND_URL`, set to `http://backend:6666` in the compose file).
Route groups listed in `RUST_API_ROUTES` (default `products,search,journal,settings,wishlist,orders,cart,users,reviews,returns,abandoned-cart,unsubscribe,newsletter,contact,status,shipping,admin,database,payments,images`) go to the Rust API
(`api` service) instead. The admin dashboard does the same with its own list,
`ADMIN_RUST_API_ROUTES` (default `admin,database,settings,payments,images,users`;
`BACKEND_URL` for the rest). **Rollback:** build with `RUST_API_ROUTES=` /
`ADMIN_RUST_API_ROUTES=` (empty) to send everything to the Node backend. Rebuild
the frontend / admin after changing either.

Both `backend` and `api` mount the `uploads_prod_data` volume at `/app/uploads`
(`UPLOADS_DIR` on the api): local image uploads written by Rust are served by
Node's `/uploads` route. The api also gets the backend's `STRIPE_SECRET_KEY` and
`AWS_*` values, since `/api/payments` and `/api/images` now run there.

## 2. Ship

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- First start: MySQL loads `docker/mysql/init.sql`. **No demo data is seeded.**
  Create the first admin:
  `docker compose -f docker-compose.prod.yml exec -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='…' backend npm run create-admin`
  (12+ characters, mixed case and a digit).
- Every start: the backend applies pending migrations (`backend/migrations`), then
  starts the API. The `worker` container (Rust) runs the same migrations (a MySQL
  lock lets only one runner apply them), then releases expired stock
  reservations and queues abandoned-cart emails every 15 minutes; the backend's
  own timers are off (`BACKGROUND_JOBS=off`). **Rollback:** stop `worker` and
  remove `BACKGROUND_JOBS` from the backend's environment. The `email-daemon` container (Rust, `rust/`) waits for those
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
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f backend worker email-daemon`.
- **Migrations:** `docker compose -f docker-compose.prod.yml exec worker worker migrate --status`.
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
- [ ] `TRUST_PROXY=1` in `backend/.env` only if the TLS proxy sets `X-Forwarded-For` and 3000/3005 are reachable only through it; 6666/7000 not public
- [ ] `FRONTEND_URL`, `NEXTAUTH_URL`, `CORS_ORIGINS` use the real domains
- [ ] Stripe live keys + webhook secret; test a purchase and a refund
- [ ] SES sender verified; test password-reset and order-confirmation emails
- [ ] Demo accounts absent (production isn't seeded); first admin created
- [ ] Backups scheduled and a restore tested
- [ ] CI green on the commit being deployed
