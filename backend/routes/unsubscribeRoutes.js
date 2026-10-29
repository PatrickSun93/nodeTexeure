/**
 * Unsubscribe / email-suppression routes  (PUBLIC — no auth)
 * ==========================================================
 * These endpoints back the one-click unsubscribe links embedded in marketing /
 * abandoned-cart emails, so they are intentionally UNAUTHENTICATED — the link
 * itself carries a signed HMAC token (see utils/emailSuppression.js) that proves
 * the request is for the address named in the link.
 *
 *   GET  /api/unsubscribe?token=&email=      -> resolve current subscription state
 *   POST /api/unsubscribe                    -> record an opt-out (idempotent upsert)
 *   POST /api/unsubscribe/resubscribe        -> undo an opt-out
 *
 * Anti-enumeration: responses never reveal whether an address is a known customer.
 * A valid signed token is required to actually mutate suppression state; an invalid
 * token on POST returns a generic success-ish response WITHOUT recording anything,
 * so the endpoint can't be used to unsubscribe arbitrary third parties or to probe
 * which addresses exist.
 *
 * Mount (server.js):
 *   app.use('/api/unsubscribe', require('./routes/unsubscribeRoutes'));
 * Proxy (next.config.mjs): add 'unsubscribe' to the routes array.
 */

const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const {
  normalizeEmail,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} = require('../utils/emailSuppression');

const VALID_SCOPES = ['all', 'marketing'];

async function getSuppression(email) {
  const res = await DatabaseUtil.executeQuery(
    'SELECT id, email, scope, reason, unsubscribed_at FROM email_unsubscribes WHERE email = ? LIMIT 1',
    [email]
  );
  return DatabaseUtil.rows(res)[0] || null;
}

/**
 * GET /api/unsubscribe?token=&email=
 * Verify the signed link and report whether the address is currently subscribed.
 */
router.get('/', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    const token = req.query.token;

    if (!email || !token || !verifyUnsubscribeToken(email, token)) {
      // Do not disclose whether the address exists — just that the link is bad.
      return res.status(400).json(
        ResponseFormatter.failure('This unsubscribe link is invalid or has expired.', [
          { valid: false },
        ])
      );
    }

    const suppression = await getSuppression(email);

    return res.json(
      ResponseFormatter.success('Link verified', [
        {
          email,
          valid: true,
          subscribed: !suppression,
          scope: suppression ? suppression.scope : null,
        },
      ])
    );
  } catch (error) {
    console.error('Error resolving unsubscribe link:', error);
    return res
      .status(500)
      .json(ResponseFormatter.failure('Server error', [{ error: error.message }]));
  }
});

/**
 * POST /api/unsubscribe
 * Body: { email, token, scope?, reason? }
 * Records the opt-out. Idempotent (upsert). Anti-enumeration: always resolves
 * success-ish, but only actually suppresses when the signed token is valid.
 */
router.post('/', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const token = req.body.token;
    const scope = VALID_SCOPES.includes(req.body.scope) ? req.body.scope : 'all';
    const reason =
      typeof req.body.reason === 'string' ? req.body.reason.slice(0, 255) : null;

    // Without a valid token we silently no-op but still return a generic success,
    // so the endpoint reveals nothing and can't be abused to unsubscribe others.
    if (!email || !token || !verifyUnsubscribeToken(email, token)) {
      return res.json(
        ResponseFormatter.success('Your email preferences have been updated.', [
          { email: email || null, unsubscribed: true, recorded: false },
        ])
      );
    }

    const idRes = await DatabaseUtil.executeQuery("SELECT get_next_id('UNSB') AS id");
    const id = DatabaseUtil.rows(idRes)[0] && DatabaseUtil.rows(idRes)[0].id;
    if (!id) throw new Error("get_next_id('UNSB') returned NULL — is the UNSB prefix registered in transno?");

    // Upsert: one suppression record per email. Re-unsubscribing refreshes the
    // timestamp / scope / reason without creating duplicates.
    await DatabaseUtil.executeQuery(
      `INSERT INTO email_unsubscribes (id, email, token, scope, reason, unsubscribed_at)
         VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         scope = VALUES(scope),
         reason = COALESCE(VALUES(reason), reason),
         unsubscribed_at = NOW()`,
      [id, email, token, scope, reason]
    );

    return res.json(
      ResponseFormatter.success('You have been unsubscribed from marketing emails.', [
        { email, unsubscribed: true, recorded: true, scope },
      ])
    );
  } catch (error) {
    console.error('Error recording unsubscribe:', error);
    return res
      .status(500)
      .json(ResponseFormatter.failure('Server error', [{ error: error.message }]));
  }
});

/**
 * POST /api/unsubscribe/resubscribe
 * Body: { email, token }
 * Removes an existing opt-out. Idempotent.
 */
router.post('/resubscribe', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const token = req.body.token;

    if (!email || !token || !verifyUnsubscribeToken(email, token)) {
      return res.json(
        ResponseFormatter.success('Your email preferences have been updated.', [
          { email: email || null, subscribed: true, recorded: false },
        ])
      );
    }

    await DatabaseUtil.executeQuery('DELETE FROM email_unsubscribes WHERE email = ?', [email]);

    return res.json(
      ResponseFormatter.success('You have been resubscribed to Noiraé emails.', [
        { email, subscribed: true, recorded: true },
      ])
    );
  } catch (error) {
    console.error('Error processing resubscribe:', error);
    return res
      .status(500)
      .json(ResponseFormatter.failure('Server error', [{ error: error.message }]));
  }
});

module.exports = router;
// Convenience re-export so email-template code can build a link without reaching
// into utils/emailSuppression directly:  require('./routes/unsubscribeRoutes').buildUnsubscribeUrl(email)
module.exports.buildUnsubscribeUrl = buildUnsubscribeUrl;
