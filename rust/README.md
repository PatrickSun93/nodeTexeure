# Rust services

The Node/Express backend is being ported to Rust one piece at a time. Each
service talks to the same MySQL database and schema as the Node API, so a piece
can move without the rest noticing.

| Crate | Replaces | Status |
|---|---|---|
| `crates/email-daemon` | `backend/services/emailDaemon.js` | Live: the only consumer of `email_queue` |

## Why Rust here

- **SQL is checked at compile time.** Every query goes through sqlx's `query!`
  macros, which validate table names, column names and types against the real
  schema. A typo like `claimedAt` for `claimed_at` is a compile error pointing at
  the line, not a silent runtime failure (several Node bugs were exactly that).
- **Errors can't be ignored.** Database calls return `Result`; there is no
  equivalent of `executeQuery` quietly returning `{ success: false }`.
- **Small footprint.** Draining 2,000 queued emails: ~11 MB peak RSS and ~30% less
  CPU than the Node daemon (82 MB). Wall time was the same — that job is bound by
  database round-trips.

## Working on it

```bash
cd rust
export DATABASE_URL=mysql://root:noirae_dev@127.0.0.1:3307/bed_texture_ecommerce  # Docker MySQL

cargo build                                   # queries checked against the live schema
cargo clippy --all-targets -- -D warnings
cargo test -- --include-ignored --test-threads=1   # unit + MySQL integration tests
cargo run -p email-daemon                     # reads DB_* / AWS_* like the Node backend
```

Without `DATABASE_URL`, builds use the committed **`.sqlx/`** query data (this is
how Docker and offline builds work). **After adding or changing a query, refresh
it and commit the result** — CI fails if it's stale:

```bash
cargo install sqlx-cli --no-default-features --features mysql,rustls   # once
cargo sqlx prepare --workspace -- --all-targets
```

The schema itself is still owned by the Node side: `docker/mysql/init.sql` plus
`backend/migrations/` (applied by `npm run migrate`). A Rust service that needs a
schema change adds the next numbered migration there and waits for it at start
(see `queue::REQUIRED_MIGRATION`).

## email-daemon

Polls `email_queue`, claims due rows (`status = 'processing'`, `claimed_at`),
renders `{{ variable }}` placeholders (using the linked `email_templates` body
when the row has variables), sends via **AWS SES v2**, and records the outcome in
`processing_details`.

- **At-least-once:** a row is claimed atomically before sending, so two daemons
  never send the same row; a claim left by a crash is returned to the queue after
  `EMAIL_DAEMON_STALE_CLAIM_SECS` (default 900).
- **Retries back off:** 60 s, 120 s, 240 s … (capped at 1 h) up to the row's
  `max_attempts`, then `failed`. Admins can requeue from the dashboard.
- **No SES keys → outbox:** each email is written as an HTML file to
  `EMAIL_OUTBOX_DIR` (default `email-outbox/`). `EMAIL_TRANSPORT=ses|outbox`
  forces a choice.
- **Graceful stop:** SIGINT/SIGTERM finish the current email, then exit.

| Variable | Default |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (or `DATABASE_URL`) | localhost:3306, root |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_REGION` / `AWS_REGION` | — / us-east-1 |
| `AWS_SES_FROM_EMAIL`, `AWS_SES_FROM_NAME`, `AWS_SES_REPLY_TO_EMAIL` | placeholders |
| `EMAIL_DAEMON_POLL_MS`, `EMAIL_DAEMON_BATCH_SIZE` | 5000, 10 |
| `EMAIL_DAEMON_RETRY_BASE_SECS`, `EMAIL_DAEMON_STALE_CLAIM_SECS` | 60, 900 |
| `EMAIL_TRANSPORT`, `EMAIL_OUTBOX_DIR` | auto, `email-outbox` |
| `RUST_LOG` | `info` |

Runs as the `email-daemon` service in both compose files (image: `rust/Dockerfile`).

## Porting the API next

The plan for the Express routes (154 endpoints, see `docs/API.md`):

1. Add an `api` crate on **Axum + sqlx**, sharing a small `db`/`auth` crate
   (JWT with `token_version` checks, the response envelope, CSRF).
2. Move one route group at a time. The storefront's `/api/*` proxy is configured
   per route in `next.config.mjs`, so e.g. `/api/products` can point at the Rust
   service while the rest stays on Express.
3. The backend's Jest/supertest suite tests behaviour over HTTP — point it at the
   Rust service's URL and a ported group must pass the same tests before its
   proxy route switches over.
