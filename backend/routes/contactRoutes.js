/**
 * Contact-form routes  (PUBLIC — no auth)
 * =======================================
 * Backs the storefront contact page (src/app/contact/page.js), which POSTs to
 * /api/contact. We validate the payload and ENQUEUE a message to the store's
 * support address in the email_queue table so it is durably captured (and can be
 * picked up by the email pipeline), rather than sending it inline.
 *
 * NOTE (email_queue schema drift): EmailQueueService.queueEmail() INSERTs the
 * columns type / recipient / data / priority, which exist only after
 * database/migrations/add_email_queue.sql is applied — they are NOT in the
 * ground-truth docker/mysql/init.sql email_queue. To work against the ground-truth
 * schema we INSERT here using only the columns init.sql guarantees (id, to_email,
 * to_name, subject, email_content, status, scheduled_at, created_at). See report FLAGS.
 *
 * Mount (server.js):  app.use('/api/contact', require('./routes/contactRoutes'));
 * Proxy (next.config.mjs): 'contact' is already in the rewrite allowlist.
 */

const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Resolve the support inbox: system_settings.support_email, then env, then a default
// (mirrors the fallback used by the admin settings route).
async function getSupportEmail() {
  try {
    const result = await DatabaseUtil.executeQuery(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'support_email' LIMIT 1"
    );
    const row = DatabaseUtil.first(result);
    if (row && row.setting_value) return row.setting_value;
  } catch (err) {
    console.error('Contact: support_email lookup failed, using fallback:', err.message);
  }
  return process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || 'support@nodetexture.com';
}

// POST /api/contact
router.post('/', async (req, res) => {
  try {
    // The storefront form field is `fullName`; accept `name` as a fallback.
    const fullName =
      typeof req.body.fullName === 'string'
        ? req.body.fullName.trim()
        : typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';

    // Validate (public endpoint — never trust the client).
    if (!fullName || fullName.length > 200) {
      return res.status(400).json(ResponseFormatter.failure('A valid name is required'));
    }
    if (!email || email.length > 255 || !EMAIL_RE.test(email)) {
      return res.status(400).json(ResponseFormatter.failure('A valid email address is required'));
    }
    if (!message || message.length < 2 || message.length > 5000) {
      return res
        .status(400)
        .json(ResponseFormatter.failure('A message is required (max 5000 characters)'));
    }
    if (subject.length > 200) {
      return res.status(400).json(ResponseFormatter.failure('Subject is too long'));
    }

    const supportEmail = await getSupportEmail();

    // Custom email-queue ID (the EMAIL prefix is registered in transno).
    const idResult = await DatabaseUtil.executeQuery("SELECT get_next_id('EMAIL') AS id");
    const idRow = DatabaseUtil.first(idResult);
    const queueId = idRow && idRow.id;
    if (!queueId) throw new Error("get_next_id('EMAIL') returned NULL");

    // email_content is JSON NOT NULL — carry the full message payload so support can
    // read it and a correctly-wired dispatcher can render / forward it.
    const emailContent = {
      type: 'contact_form',
      from_name: fullName,
      from_email: email,
      subject: subject || '(no subject)',
      message,
      submitted_at: new Date().toISOString(),
    };

    const insertResult = await DatabaseUtil.executeQuery(
      `INSERT INTO email_queue (id, to_email, to_name, subject, email_content, status, scheduled_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [
        queueId,
        supportEmail,
        'Support',
        `Contact form: ${subject || 'New message'}`.slice(0, 255),
        JSON.stringify(emailContent),
      ]
    );

    if (!insertResult.success) {
      throw new Error(insertResult.error || 'Failed to enqueue contact message');
    }

    return res.json(
      ResponseFormatter.success(
        "Thanks for reaching out — we've received your message and will reply by email shortly.",
        { received: true }
      )
    );
  } catch (error) {
    console.error('Error handling contact submission:', error);
    return res
      .status(500)
      .json(ResponseFormatter.failure('Failed to send your message. Please try again later.'));
  }
});

module.exports = router;
