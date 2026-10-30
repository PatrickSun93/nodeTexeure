# Database

MySQL 8.0, database `bed_texture_ecommerce`. All access goes through
`backend/utils/database.js` (prepared statements).

## Where the schema lives

| Piece | Purpose |
|---|---|
| `docker/mysql/init.sql` | Baseline schema: tables, the `get_next_id()` function, triggers, stored procedures, seed prefixes. Loaded by MySQL on a fresh Docker volume, by `npm run db:init`, and by CI. |
| `backend/migrations/NNN_*.sql` | Every change after the baseline, applied in order by `backend/scripts/migrate.js` and recorded in `schema_migrations`. |

The backend runs `npm run migrate` on every container start (dev and prod), so
deploying new code is enough to bring the schema up to date.

```bash
cd backend
npm run migrate               # apply pending migrations
npm run migrate -- --status   # ✔ applied · pending
npm run db:init               # (repo root) create DB from init.sql + migrate
npm run db:reset              # (repo root) drop + recreate — refused in production
```

**Adding a change:** create the next-numbered file in `backend/migrations/`. Never
edit a migration that has shipped; add another one. MySQL DDL auto-commits, so a
failed migration can leave partial changes — keep each one small and, where it
matters, idempotent (see `010_orders_payment_columns.sql` for the
`information_schema` + `PREPARE` pattern; MySQL 8 has no `ADD COLUMN IF NOT EXISTS`).

Databases created before the runner existed are baselined at migration 008 the
first time it runs.

## Custom IDs

Primary keys are readable prefixed strings: `PREFIX` + 10-digit counter, e.g.
`USER0000000001`, `PROD0000000042`. Generate one with:

```sql
SELECT get_next_id('PROD') AS id;
```

`get_next_id` increments the prefix's row in `transno`. **A prefix must be
registered first**, or the function returns `NULL` and the insert fails:

```sql
INSERT IGNORE INTO transno (prefix, count, details) VALUES ('GIFT', 0, 'Gift message ID counter');
```

Registered prefixes: `ADDR API AUDIT CART CARTITEM CAT DISC EMAIL IMG INV INVMOV
JRNL OITEM ORDER PAY PROD REFRESH REV RMA RMAITEM SHIP STOCK SYS TAX UNSB USER
VAR WISH`. Orders also get a random, non-sequential customer-facing
`order_number`.

## Tables

| Area | Tables |
|---|---|
| Accounts | `users` (role `admin`/`staff`/`customer`, `status`, `token_version`), `user_addresses`, `refresh_tokens` (SHA-256 hashes only) |
| Catalogue | `categories`, `products`, `product_variants`, `product_images`, `product_translations`, `product_bundles`, `bundle_items` |
| Inventory | `inventory` (per variant), `inventory_movements` (audit trail), `stock_reservations` (expire; released every 15 min by the backend) |
| Cart & checkout | `shopping_carts`, `cart_items`, `abandoned_cart_recovery`, `discount_codes`, `discount_code_usage`, `tax_rates`, `shipping_zones`, `shipping_rates` |
| Orders & payments | `orders` (`status` lifecycle + `payment_status`, Stripe ids), `order_items`, `order_status_history`, `payments`, `payment_methods`, `refunds`, `returns`, `return_items` |
| Content & engagement | `product_reviews`, `review_helpful_votes`, `wishlists`, `journal_articles`, `newsletter_subscribers` |
| Email | `email_templates`, `email_queue` (drained by the Rust email daemon, `rust/crates/email-daemon`, the only consumer), `email_unsubscribes` |
| System | `system_settings`, `audit_logs`, `api_rate_limits`, `transno`, `schema_migrations` |

Stored routines: `get_next_id`, `ReserveStock`, `ReleaseExpiredReservations`;
trigger `update_product_search_after_update` keeps product search data in sync.

### Status values

- `orders.status`: `pending → confirmed → processing → shipped → delivered`, or
  `cancelled` / `refunded`. A paid order is `confirmed`; there is no `paid` status.
- `orders.payment_status`: `pending`, `pending_action`, `paid`, `failed`,
  `canceled`, `refunded`, `partially_refunded` (transitions in
  `backend/services/orderPayments.js`).
- `payments.status`: `pending`, `processing`, `completed`, `failed`, `cancelled`,
  `refunded`, `partially_refunded` (not `succeeded`).

## JSON columns

Variable or rarely-queried detail lives in JSON columns rather than extra tables:
`products.product_details`, `products.approval_details`,
`product_variants.variant_details`, `product_reviews.review_details`,
`inventory_movements.movement_details`, `orders.shipping_address_json` /
`billing_address_json`, `order_status_history.status_details`,
`payments.gateway_response`, `refunds.refund_details`,
`discount_codes.discount_details`, `email_templates.template_content`,
`email_queue.email_content` / `template_data`, `user_addresses.address_json`.

Read them with `JSON_EXTRACT`/`->>` in SQL, or parse in JS (mysql2 returns them as
objects). Filter on a JSON field only when it isn't hot; otherwise promote it to
a real column in a migration.

## Gotchas

- `executeQuery` never throws: it returns `{ success, data, affectedRows }` or
  `{ success: false, error }`. Check `success` on writes and read rows with
  `DatabaseUtil.rows()` / `first()`. Several silent bugs came from unchecked writes.
- `LIMIT ?` / `OFFSET ?` can't be bound in MySQL 8 prepared statements; validate as
  integers and inline them.
- Seed data: `npm run seed:rnd` (accounts, catalogue) then `npm run seed:example`
  (orders, reviews, wishlist, images; idempotent).
