# Backend API

Express + MySQL API on port 6666. Repo-wide setup is in the root
[README](../README.md); agent notes in [CLAUDE.md](../CLAUDE.md).

| Path | What |
|---|---|
| `server.js` | App setup, middleware, route mounts |
| `routes/` | One router per resource; `routes/admin/` holds the back-office API |
| `middleware/authMiddleware.js` | `protect`, `protectOptional`, `admin`, `staffOrAdmin` |
| `middleware/csrfMiddleware.js` | Double-submit CSRF for admin writes |
| `services/` | Stripe, SES email + queue, S3 images, FedEx/shipping, inventory, abandoned carts |
| `services/emailDaemon.js` | Separate process that delivers `email_queue` |
| `migrations/` + `scripts/migrate.js` | Schema migrations ([docs/DATABASE.md](../docs/DATABASE.md)) |
| `tests/` | Jest + supertest API tests |

```bash
npm run dev            # nodemon
npm run migrate        # apply schema migrations
npm run seed:rnd       # demo accounts + catalogue
npm run seed:example   # orders, reviews, wishlist, images
npm test               # API tests (needs the seeded MySQL; see below)
npm run email-daemon   # deliver queued email
npm run create-admin   # ADMIN_EMAIL=… ADMIN_PASSWORD=… create/promote an admin
```

Tests run against a real MySQL. With the Docker stack up:

```bash
DB_HOST=127.0.0.1 DB_PORT=3307 DB_PASSWORD=noirae_dev npm test
```

Endpoints: [docs/API.md](../docs/API.md) (generated; run `node scripts/gen-api-docs.js`
from the repo root after changing routes). Environment variables:
[`.env.example`](.env.example).
