# 0001 — Port the backend to Rust one route group at a time

Status: Accepted (2026-10-29). Done in 8 steps, #28 to #35.

## Context

The Express backend (`backend/`) had a class of bugs that kept coming back:

- `DatabaseUtil.executeQuery` never throws, so a failed write that nobody
  checked `result.success` on was silent.
- Column typos (`claimedAt` for `claimed_at`) and wrong ENUM values only
  failed at runtime, on the code path that hit them.
- Business rules were spread across routes and services. A coupon bypass and
  wrong order totals (#34) and wishlist rows for products that do not exist
  (#29) were found while porting.

It also used ~210 MB RSS per process, against 13 MB for the same API in Rust,
and served ~600–830 req/s on the product list against ~1,550 for Rust (see
[rust/README.md](../../rust/README.md)).

The storefront and the admin dashboard depend on the exact JSON shapes,
status codes, cookies and error bodies of ~40 route groups. Nothing has a
typed contract; the contract is whatever Express sends.

## Options

1. **Rewrite** the backend in Rust and switch over in one release.
2. **Strangler**: run Rust next to Node on the same MySQL schema and move route
   groups across behind the existing Next.js `/api` proxy, one group per PR.
3. **Stay on Node** and fix the bug class in place (TypeScript, a query
   builder, stricter linting).

## Decision

Option 2. Both services read and write the same database. The proxies decide
per group who answers:

- the storefront through `RUST_API_ROUTES` in `next.config.mjs`;
- the admin dashboard through `admin-dashboard/rustRoutes.mjs`.

A group that moves only in part lists its moved paths in `partialGroups`, and
everything else in it stays on Node.

The order went from least to most risk:

1. the email daemon (a queue consumer, no HTTP);
2. public read-only APIs;
3. auth and the wishlist;
4. order reads;
5. the cart;
6. checkout;
7. the rest of `/api` and the whole `/api/admin` subtree;
8. the background jobs (the `worker` binary).

Each step had to pass [0002](0002-node-rust-parity-tests-as-the-merge-gate.md).
The Rust code mirrors Express where clients can see the difference, for
example `parseInt` semantics, `qs` parsing, body-parser errors, cookie
attributes and rate-limit headers. It does not copy Node's bugs: each one
found was fixed on both sides in the same PR.

Option 1 was rejected because it needs the whole contract reproduced before
any of it ships, with no way to compare against a running Node. Option 3
fixes types but not the silent-failure wrapper or the compile-time SQL check
(see [0003](0003-sqlx-offline-data-and-live-schema-ci.md)).

## Consequences

- Rollback is a config change: unset a group in `RUST_API_ROUTES` and rebuild
  the proxy, or stop `worker` and drop `BACKGROUND_JOBS=off`. Node keeps every
  route until Rust has run a group for a while.
- For now there are two implementations of every route. A behaviour change has
  to land in both, or the parity suite fails.
- Shared state has to be shared outside the processes. Background jobs use
  MySQL named locks (`backend/utils/jobLock.js` and `rust/crates/api/src/jobs`).
  Rate-limit buckets are still per process, so a client gets the budget once
  per service.
- A lot of Rust exists only to match Express: `express.rs`,
  `express_router.rs`, `qs.rs`, `mysql_json.rs`, `v8_json.rs`. It can be
  simplified once Node is gone and the clients stop depending on those quirks.
- Still on Node: seeds and the `/uploads` static route.
