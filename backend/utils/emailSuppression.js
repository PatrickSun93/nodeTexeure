/**
 * Email Suppression + Unsubscribe helpers
 * ========================================
 * Shared logic for the Unsubscribe compliance feature:
 *   - buildUnsubscribeToken / verifyUnsubscribeToken : stateless HMAC token scheme
 *     so one-click email links are self-verifying (no per-recipient token stored).
 *   - buildUnsubscribeUrl : the URL that marketing/abandoned-cart email templates
 *     should embed in their footer (see docs note in unsubscribeRoutes.js).
 *   - isEmailSuppressed : has this recipient opted out of marketing?
 *   - isMarketingCategory : does a template/queue-type name look like marketing
 *     (as opposed to a transactional email that must ALWAYS send)?
 *
 * Token scheme: base64url( HMAC-SHA256( "unsubscribe:" + normalized_email, JWT_SECRET ) ).
 * Deterministic per email, so it can be regenerated at email-send time and verified
 * on the click without any DB lookup. Because it is keyed on JWT_SECRET, an attacker
 * cannot forge a valid link for an address they don't already know.
 *
 * IMPORTANT: every suppression check is fail-open — if the DB check throws we return
 * `false` (not suppressed) so a transient error can NEVER block an email from sending.
 * The marketing/transactional split is the only gate that decides suppression.
 */

const crypto = require('crypto');
const DatabaseUtil = require('./database');

// Template names / queue types that contain any of these markers are treated as
// marketing (suppressible). Everything else — order_confirmation, welcome_user,
// email_verification, password_reset, shipping_notification, low_stock_alert,
// email_failure_alert — is transactional and is NEVER suppressed.
const MARKETING_MARKERS = [
  'abandon',      // abandoned_cart
  'marketing',
  'newsletter',
  'promo',        // promo / promotion / promotional
  'campaign',
  'win_back',
  'winback',
  're_engage',
  'reengage',
  'digest',
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function secret() {
  // No fallback: a hardcoded default would let anyone forge unsubscribe /
  // resubscribe tokens. Every running environment must set JWT_SECRET (the same
  // secret signs auth JWTs and the CSRF HMAC; the server refuses to boot in
  // production without it). Throw rather than silently sign with a weak key.
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error('JWT_SECRET is not set — refusing to build/verify unsubscribe tokens with a fallback secret');
  }
  return s;
}

/**
 * Build a stateless unsubscribe token for an email address.
 * @param {string} email
 * @returns {string} base64url HMAC token
 */
function buildUnsubscribeToken(email) {
  return crypto
    .createHmac('sha256', secret())
    .update(`unsubscribe:${normalizeEmail(email)}`)
    .digest('base64url');
}

/**
 * Constant-time verification that `token` matches `email`.
 * @returns {boolean}
 */
function verifyUnsubscribeToken(email, token) {
  if (!email || !token) return false;
  const expected = buildUnsubscribeToken(email);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Build the full one-click unsubscribe URL for an email address.
 * Marketing / abandoned-cart email templates should inject this into their footer.
 * @param {string} email
 * @param {object} [opts]
 * @param {string} [opts.baseUrl] - storefront origin (defaults to env or localhost)
 * @returns {string}
 */
function buildUnsubscribeUrl(email, opts = {}) {
  // Must resolve to the STOREFRONT origin (port 3000), never the backend. NOTE:
  // BASE_URL is deliberately NOT used here — in this repo it is set to the backend
  // (http://localhost:6666), which browsers block. Mirror the verify-email /
  // reset-password links, which use NEXTAUTH_URL for the storefront origin.
  const base = (
    opts.baseUrl ||
    process.env.FRONTEND_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const params = new URLSearchParams({
    email: normalizeEmail(email),
    token: buildUnsubscribeToken(email),
  });
  return `${base}/unsubscribe?${params.toString()}`;
}

/**
 * Is a template name / queue type a suppressible marketing email?
 * @param {string} name - e.g. 'abandoned_cart', 'order_confirmation'
 * @returns {boolean}
 */
function isMarketingCategory(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return MARKETING_MARKERS.some((m) => n.includes(m));
}

/**
 * Has this recipient opted out of marketing email?
 * Fail-open: returns false on any error so email delivery is never blocked by a
 * suppression-check failure.
 * @param {string} email
 * @returns {Promise<boolean>}
 */
async function isEmailSuppressed(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  try {
    const res = await DatabaseUtil.executeQuery(
      'SELECT 1 FROM email_unsubscribes WHERE email = ? LIMIT 1',
      [normalized]
    );
    // executeQuery return shape is inconsistent across the codebase — normalize.
    const rows = Array.isArray(res) ? res : (res && res.data) || [];
    return rows.length > 0;
  } catch {
    return false; // fail-open
  }
}

module.exports = {
  normalizeEmail,
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  isMarketingCategory,
  isEmailSuppressed,
  MARKETING_MARKERS,
};
