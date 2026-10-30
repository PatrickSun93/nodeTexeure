/**
 * Admin Email Queue routes
 *
 * Read + operational endpoints for the `email_queue` table that backs the
 * transactional email pipeline (producer: services/emailQueueProducer.js,
 * consumer: services/emailDaemon.js).
 *
 * Authoritative schema (docker/mysql/init.sql):
 *   email_queue(
 *     id, to_email, to_name, subject, email_content(JSON), template_id,
 *     template_data(JSON),
 *     status ENUM('pending','sent','failed','cancelled') DEFAULT 'pending',
 *     attempts, max_attempts, processing_details(JSON), scheduled_at,
 *     sent_at, created_at
 *   )
 *
 * The daemon additionally sets status='processing' while a mail is in flight and
 * writes { error_message, failed_at, attempt_number } into processing_details on
 * failure, so the error text is read out of that JSON column.
 *
 * UI status vocabulary -> DB status:
 *   queued -> pending, sending -> processing, sent -> sent, failed -> failed,
 *   cancelled -> cancelled
 *
 * Every read is `protect, admin`; every write also requires `csrfProtection`.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect, admin } = require('../middleware/authMiddleware');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');

const router = express.Router();

// Read/write rate limiters, mirroring adminRoutes.js
const adminReadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const adminWriteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// UI bucket -> DB status value
const UI_TO_DB_STATUS = {
  queued: 'pending',
  sending: 'processing',
  sent: 'sent',
  failed: 'failed',
  cancelled: 'cancelled',
};

// DB status value -> UI bucket (reverse map + tolerant defaults)
function dbStatusToBucket(raw) {
  switch (String(raw || '').toLowerCase()) {
    case 'pending':
      return 'queued';
    case 'processing':
    case '': // strict-mode truncation of an out-of-enum 'processing'
      return 'sending';
    case 'sent':
      return 'sent';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return null; // still counted in total, no dedicated bucket
  }
}

// processing_details is a JSON column (mysql2 returns it parsed) but tolerate a
// raw string too.
function extractError(processingDetails) {
  if (!processingDetails) return null;
  let obj = processingDetails;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return processingDetails; // opaque string — surface as-is
    }
  }
  if (obj && typeof obj === 'object') {
    return obj.error_message || obj.error || null;
  }
  return null;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Aggregate status counts across the whole table.
 * @returns {Promise<{counts:Object,total:number}>}
 */
async function getStatusCounts() {
  const res = await DatabaseUtil.executeQuery(
    'SELECT status, COUNT(*) AS count FROM email_queue GROUP BY status'
  );
  const counts = { queued: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
  let total = 0;
  for (const row of DatabaseUtil.rows(res)) {
    const n = toNum(row.count);
    total += n;
    const bucket = dbStatusToBucket(row.status);
    if (bucket && bucket in counts) counts[bucket] += n;
  }
  return { counts, total };
}

/**
 * Best-effort worker/daemon health derived purely from the table, since the
 * consumer (services/emailDaemon.js) is a separate process we cannot introspect
 * directly.
 */
async function getWorkerStatus() {
  const res = await DatabaseUtil.executeQuery(
    `SELECT
        SUM(status = 'pending') AS pending_total,
        SUM(status = 'pending' AND scheduled_at <= NOW()) AS pending_ready,
        SUM(status = 'processing') AS sending_total,
        SUM(status = 'failed') AS failed_total,
        TIMESTAMPDIFF(SECOND, MIN(CASE WHEN status = 'pending' THEN created_at END), NOW()) AS oldest_pending_age_seconds,
        MAX(sent_at) AS last_sent_at,
        SUM(status = 'sent' AND sent_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) AS sent_last_hour
     FROM email_queue`
  );
  const row = DatabaseUtil.rows(res)[0] || {};
  const pendingTotal = toNum(row.pending_total);
  const sendingTotal = toNum(row.sending_total);
  const oldestAge =
    row.oldest_pending_age_seconds == null ? null : toNum(row.oldest_pending_age_seconds);
  const lastSentAt = row.last_sent_at || null;
  const sentLastHour = toNum(row.sent_last_hour);

  const lastSentMs = lastSentAt ? new Date(lastSentAt).getTime() : null;
  const recentlyActive = lastSentMs != null && Date.now() - lastSentMs < 5 * 60 * 1000;

  // Health heuristic (best-effort):
  //   idle    -> nothing waiting
  //   active  -> a send completed in the last 5 minutes (daemon clearly alive)
  //   backlog -> oldest pending has waited > 10 minutes (daemon may be down)
  //   waiting -> pending work but no strong signal either way
  let health;
  if (pendingTotal === 0 && sendingTotal === 0) health = 'idle';
  else if (recentlyActive) health = 'active';
  else if (oldestAge != null && oldestAge > 600) health = 'backlog';
  else health = 'waiting';

  return {
    health,
    pendingCount: pendingTotal,
    sendingCount: sendingTotal,
    oldestQueuedAgeSeconds: oldestAge,
    lastSentAt,
    sentLastHour,
  };
}

/**
 * GET /api/admin/email-queue
 * Recent queue entries (paginated) + status counts + worker status.
 * Query params: status (queued|sending|sent|failed|cancelled|all), limit, offset
 */
router.get('/', protect, admin, adminReadLimiter, async (req, res) => {
  try {
    const rawStatus = String(req.query.status || 'all').toLowerCase();
    const dbStatus = UI_TO_DB_STATUS[rawStatus];
    const hasFilter = rawStatus !== 'all' && !!dbStatus;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const where = hasFilter ? 'WHERE eq.status = ?' : '';
    const params = hasFilter ? [dbStatus] : [];
    // LIMIT/OFFSET are inlined from the sanitized integers above — mysql2 rejects
    // bound params for LIMIT/OFFSET ("Incorrect arguments to mysqld_stmt_execute").
    const listRes = await DatabaseUtil.executeQuery(
      `SELECT eq.id, eq.to_email, eq.to_name, eq.subject, eq.template_id,
              eq.status, eq.attempts, eq.max_attempts, eq.scheduled_at,
              eq.sent_at, eq.created_at, eq.processing_details,
              t.name AS template_name
         FROM email_queue eq
         LEFT JOIN email_templates t ON eq.template_id = t.id
         ${where}
         ORDER BY eq.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    if (listRes && listRes.success === false) {
      throw new Error(listRes.error || 'Failed to load email queue');
    }

    const emails = DatabaseUtil.rows(listRes).map((row) => ({
      id: row.id,
      to: row.to_email,
      toName: row.to_name || null,
      subject: row.subject || null,
      template: row.template_name || row.template_id || null,
      status: dbStatusToBucket(row.status) || String(row.status || 'unknown'),
      rawStatus: row.status,
      attempts: toNum(row.attempts),
      maxAttempts: toNum(row.max_attempts) || 3,
      scheduledAt: row.scheduled_at || null,
      sentAt: row.sent_at || null,
      createdAt: row.created_at || null,
      error: extractError(row.processing_details),
    }));

    const { counts, total } = await getStatusCounts();
    const worker = await getWorkerStatus();

    const totalMatching = hasFilter ? counts[rawStatus] || 0 : total;

    return res.json(
      ResponseFormatter.success('Email queue loaded', [
        { emails },
        { counts: { ...counts, total } },
        { worker },
        {
          pagination: {
            limit,
            offset,
            returned: emails.length,
            totalMatching,
            filter: hasFilter ? rawStatus : 'all',
          },
        },
      ])
    );
  } catch (error) {
    console.error('Email queue list error:', error);
    return res
      .status(500)
      .json(ResponseFormatter.failure('Failed to load email queue', { error: error.message }));
  }
});

/**
 * GET /api/admin/email-queue/worker-status
 * Best-effort daemon health derived from the table (see getWorkerStatus).
 */
router.get('/worker-status', protect, admin, adminReadLimiter, async (req, res) => {
  try {
    const worker = await getWorkerStatus();
    return res.json(ResponseFormatter.success('Worker status', [{ worker }]));
  } catch (error) {
    console.error('Email queue worker-status error:', error);
    return res
      .status(500)
      .json(ResponseFormatter.failure('Failed to load worker status', { error: error.message }));
  }
});

/**
 * POST /api/admin/email-queue/retry-failed
 * Requeue every failed entry: status -> pending, attempts -> 0, scheduled now,
 * error cleared. Bounded by `status = 'failed'`. The daemon then re-picks them
 * (it requires status='pending' AND scheduled_at<=NOW() AND attempts<max_attempts).
 */
router.post('/retry-failed', protect, admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery(
      `UPDATE email_queue
          SET status = 'pending', attempts = 0, scheduled_at = NOW(), processing_details = NULL
        WHERE status = 'failed'`
    );
    if (!result.success) {
      throw new Error(result.error || 'Retry failed');
    }
    const requeued = toNum(result.affectedRows);
    return res.json(
      ResponseFormatter.success(`Requeued ${requeued} failed email(s)`, [{ requeued }])
    );
  } catch (error) {
    console.error('Email queue retry-failed error:', error);
    return res
      .status(500)
      .json(ResponseFormatter.failure('Failed to requeue emails', { error: error.message }));
  }
});

/**
 * POST /api/admin/email-queue/:id/retry
 * Requeue a single failed/cancelled entry the same way as retry-failed.
 */
router.post('/:id/retry', protect, admin, adminWriteLimiter, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(ResponseFormatter.failure('Email id is required'));
    }

    const result = await DatabaseUtil.executeQuery(
      `UPDATE email_queue
          SET status = 'pending', attempts = 0, scheduled_at = NOW(), processing_details = NULL
        WHERE id = ? AND status IN ('failed', 'cancelled')`,
      [id]
    );
    if (!result.success) {
      throw new Error(result.error || 'Retry failed');
    }

    if (toNum(result.affectedRows) === 0) {
      return res
        .status(404)
        .json(
          ResponseFormatter.failure('Email not found or not in a retryable state', [{ id }])
        );
    }

    return res.json(ResponseFormatter.success('Email requeued', [{ id }]));
  } catch (error) {
    console.error('Email queue single retry error:', error);
    return res
      .status(500)
      .json(ResponseFormatter.failure('Failed to requeue email', { error: error.message }));
  }
});

module.exports = router;
