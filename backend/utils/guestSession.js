// The guest cart session cookie. Guests own the shopping_carts row whose
// session_id equals this cookie, so the value must never reach SQL as anything
// but a string we could have issued: cookie-parser turns `sessionId=j:1` into the
// number 1 (and `j:true`, `j:[..]`, `j:{..}` into other non-strings), and
// `session_id = 1` matches every session id that starts with "1" followed by a
// non-digit — a stranger's cart. See utils/params.js.
const crypto = require('crypto');

const GUEST_SESSION_COOKIE = 'sessionId';

// 16 random bytes as lowercase hex — what both this backend and the Rust API
// (rust/crates/api/src/routes/cart.rs new_session_id) issue.
const GUEST_SESSION_RE = /^[a-f0-9]{32}$/;

/**
 * The caller's guest session id, or null when the cookie is missing or is not a
 * session id we issue (treat that as no session).
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function guestSessionId(req) {
  const value = req.cookies ? req.cookies[GUEST_SESSION_COOKIE] : undefined;
  return typeof value === 'string' && GUEST_SESSION_RE.test(value) ? value : null;
}

/** A fresh guest session id. */
function newGuestSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { GUEST_SESSION_COOKIE, guestSessionId, newGuestSessionId };
