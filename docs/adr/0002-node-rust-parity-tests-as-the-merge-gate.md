# 0002 — Parity tests gate every port step

Status: Accepted (2026-10-29)

## Context

[0001](0001-port-the-backend-to-rust-incrementally.md) moves route groups from
Express to Rust behind a proxy, and clients cannot tell which one answered.
So "done" for a group has to mean that it behaves the same as Node. Same
status, same JSON, same cookies, same error bodies, same
rows written, same 429s. Node has no spec, so there is nothing to test Rust
against except Node.

## Options

1. **Hand-written Rust tests** of the expected responses.
2. **Recorded fixtures**: capture Node's responses once and replay them
   against Rust.
3. **Live differential tests**: send the same request to both services on the
   same database and compare.

## Decision

Option 3 is the merge gate, with option 2 for the pure functions.

`backend/tests/parity.test.js` and one `parity-<group>.test.js` per port step
send each request to both services:

- Node in-process through supertest;
- Rust over HTTP at `RUST_API_URL`.

The suite asserts the same status and the same JSON body. Write sequences run
as two users, one per side, so they do not interfere. The test then compares
the responses and the rows each side wrote.

`parityHelpers.js` also compares `Set-Cookie` headers attribute by attribute
and the rate-limit headers and 429 bodies. For the rate limiters it starts
production-mode servers, because the limiters are skipped in tests.

CI builds the Rust API, starts it, and runs the whole parity suite on every
PR (`.github/workflows/ci.yml`, Rust job). A port PR merges only when it
passes.

Option 2 covers code with no I/O, where a fixture is exact and cheap: tokens,
bcrypt, CSRF, cookie and email-queue output. Its fixtures live in
`rust/crates/api/fixtures/*.json` and come from
`backend/scripts/gen-rust-fixtures.js`.

### What may differ

Only values that differ between any two requests, even on the same service.
`normalizer()` in `parityHelpers.js` replaces them before the comparison:

- generated ids: `WISH…`, `CART…`, `CARTITEM…`, `USER…`, order numbers `NOR-…`;
- UUIDs, ISO timestamps, and per-test email addresses;
- random cookie values, compared by shape. `Expires` may be up to 2 s apart.
- rate-limit reset and `Retry-After`, up to 1 s apart.

Node's 5-minute product cache is bypassed with `nocache=true`. Rust adds an
`X-Served-By: rust-api` header, which the tests do not compare.

Everything else must be deep-equal, including array order. Key order is not
compared. A list whose order
was undefined in Node got a deterministic `ORDER BY` on both sides, for
example addresses ordered by `id DESC`.

## Consequences

- A difference fails the test, which forces a decision: copy Node's behaviour,
  or fix a Node bug on both sides with the parity test pinning the fix. Bugs
  fixed this way during the port include:
  - #29: the wishlist accepted products that do not exist.
  - #34: a coupon bypass and wrong order totals.
- The suite needs both services and a seeded MySQL, which makes CI the
  slowest job, and the tests are serial.
- Known gaps, accepted and documented in `rust/README.md`:
  - The rate-limit budget is per service.
  - JSON stored in TEXT columns comes back with sorted keys on Rust.
  - Rust sends no ETag/304.
- Once Node is retired, the parity files turn into ordinary API tests against
  Rust. The recorded Node responses in the fixtures stay as the spec.
