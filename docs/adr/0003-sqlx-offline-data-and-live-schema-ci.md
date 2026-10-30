# 0003 — sqlx offline data for builds, the live schema in CI

Status: Accepted (2026-10-29)

## Context

Moving SQL errors from runtime to compile time was one of the reasons for the
port ([0001](0001-port-the-backend-to-rust-incrementally.md)). Two kinds of
error are involved:

- wrong column names, missing tables and type mismatches;
- nullable columns read as non-null.

sqlx's `query!` macros check every query against a real database when the
crate compiles. That means a compile needs either a running MySQL with the
current schema, or offline query data.

The schema is `docker/mysql/init.sql` plus the numbered files in
`backend/migrations/`. Node and Rust both apply it.

## Options

1. **Runtime queries only** (`sqlx::query` with no macro). Builds need no
   database, but every query becomes unchecked text, which is the Node
   problem again.
2. **Macros, always online.** Every build, including `docker build` and a
   fresh clone, needs a MySQL with the right schema.
3. **Macros with committed offline data.** `cargo sqlx prepare` writes
   `rust/.sqlx/` (one JSON file per query, with the columns, types and
   nullability it saw). Builds with no `DATABASE_URL` read that data. CI checks
   it is current.

## Decision

Option 3:

- **Development** builds against the Docker MySQL. `DATABASE_URL` is exported
  in the same shell as `cargo`, so queries are checked against the live schema.
- **Docker and offline builds** have no `DATABASE_URL`, so sqlx reads
  `.sqlx/`. The image build needs no database.
- **CI**, Rust job:
  1. load the schema from scratch (`init.sql`, migrations, seed) into a MySQL
     service;
  2. run `clippy -D warnings` and the tests against that live schema, so a
     migration that breaks a query fails here;
  3. touch every source file and run
     `SQLX_OFFLINE=true DATABASE_URL= cargo check`, so a query changed without
     a new `cargo sqlx prepare` fails as "stale `.sqlx`".

Dynamic SQL is the exception. Admin lists with `SELECT *`, CSV import and
export, analytics and the dev-only raw `SELECT` endpoint build their query
text at runtime, so they use runtime queries. `mysql_json.rs` maps the result
rows exactly as mysql2 would. That is about 23 call sites against about 233
`query!` macros. Every value still goes in as a bound parameter.

Optional filters stay static with `(? IS NULL OR …)` clauses, so they keep the
compile-time check.

## Consequences

- Each query change is two commits' worth of work: the code, then
  `cargo sqlx prepare --workspace -- --all-targets` and the regenerated
  `.sqlx/` files. CI fails when the second part is missing. That rule is in
  `CLAUDE.md` and `rust/README.md`.
- A build without `DATABASE_URL` and with stale `.sqlx/` fails with hundreds
  of sqlx errors that look unrelated to the edit. The fix is always to export
  `DATABASE_URL` or re-prepare.
- The offline data records nullability as MySQL reported it. A migration that
  makes a column nullable shows up as a compile error in every query that
  reads it, which is the point.
- The runtime-query call sites are the part of the SQL with no compile-time
  check. They are covered by the parity suite instead
  ([0002](0002-node-rust-parity-tests-as-the-merge-gate.md)), and a new one
  needs a reason (dynamic columns or tables).
