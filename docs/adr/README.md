# Architecture decision records

One page each: context, options, decision, consequences. Numbered in the order
they were made; a superseded record stays and links to its replacement.

| # | Decision | Status |
|---|---|---|
| [0001](0001-port-the-backend-to-rust-incrementally.md) | Port the Express backend to Rust one route group at a time (strangler), not as a rewrite | Accepted |
| [0002](0002-node-rust-parity-tests-as-the-merge-gate.md) | Node ↔ Rust parity tests (same request, same JSON) gate every port step | Accepted |
| [0003](0003-sqlx-offline-data-and-live-schema-ci.md) | Compile-checked sqlx queries: committed `.sqlx` data for builds, live schema in CI | Accepted |
