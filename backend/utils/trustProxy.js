// Express `trust proxy` from TRUST_PROXY: how many proxy hops in front of the
// backend may set X-Forwarded-For. It decides `req.ip`, which every rate
// limiter keys on.
//
//   0 (default)  req.ip is the socket peer; X-Forwarded-For is ignored. Safe
//                when clients can reach the backend directly, but behind the
//                storefront proxy every customer then shares ONE rate-limit
//                bucket (the storefront's address).
//   1            req.ip is the right-most X-Forwarded-For entry — what the
//                proxy in front of the storefront appended. Use it when the
//                backend is reachable only through the storefront AND a reverse
//                proxy in front of the storefront sets X-Forwarded-For (Next.js
//                rewrites forward the header unchanged; they never add to it).
//   n            n trusted hops, the same rule further down the chain.
//
// Only a hop count is accepted (never `true`, which lets any client pick its own
// address). The Rust API reads the same variable (rust/crates/api/src/client_ip.rs).
// See docs/DEPLOYMENT.md.

/**
 * @param {string|undefined} value - process.env.TRUST_PROXY
 * @returns {number} hop count for app.set('trust proxy', n)
 */
function parseTrustProxy(value) {
  const v = String(value ?? '').trim();
  if (v === '') return 0;
  if (/^\d+$/.test(v)) return Number(v);
  console.warn(`TRUST_PROXY must be a hop count (0, 1, 2, …), got ${JSON.stringify(value)}; trusting no proxy`);
  return 0;
}

module.exports = { parseTrustProxy };
