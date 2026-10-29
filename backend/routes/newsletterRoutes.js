/**
 * Newsletter subscription routes  (PUBLIC — no auth)
 * ==================================================
 * Backs src/components/NewsletterSection.js. POST /api/newsletter/subscribe records
 * an email address in newsletter_subscribers (idempotent upsert on the UNIQUE email),
 * so re-subscribing an existing address is a harmless no-op that still returns success
 * and never reveals whether the address was already on the list.
 *
 * Requires backend/migrations/008_newsletter_subscribers.sql (see report FLAGS —
 * Docker only auto-runs docker/mysql/init.sql, so this migration must be applied or
 * folded into init.sql for the table to exist in a fresh stack).
 *
 * Mount (server.js):  app.use('/api/newsletter', require('./routes/newsletterRoutes'));
 * Proxy (next.config.mjs): 'newsletter' is already in the rewrite allowlist.
 */

const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/newsletter/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!email || email.length > 255 || !EMAIL_RE.test(email)) {
      return res.status(400).json(ResponseFormatter.failure('A valid email address is required'));
    }

    // Idempotent: the UNIQUE(email) makes a repeat signup a harmless no-op. We do not
    // branch on whether the row already existed, so the endpoint cannot be used to
    // probe which addresses are subscribed.
    const result = await DatabaseUtil.executeQuery(
      `INSERT INTO newsletter_subscribers (email, status, created_at)
       VALUES (?, 'subscribed', NOW())
       ON DUPLICATE KEY UPDATE status = 'subscribed'`,
      [email]
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to record subscription');
    }

    return res.json(
      ResponseFormatter.success('Thanks for subscribing — welcome to the Noiraé list.', {
        subscribed: true,
      })
    );
  } catch (error) {
    console.error('Error handling newsletter subscription:', error);
    return res
      .status(500)
      .json(ResponseFormatter.failure('Failed to subscribe. Please try again later.'));
  }
});

module.exports = router;
