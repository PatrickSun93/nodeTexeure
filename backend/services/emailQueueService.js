const logger = require('../utils/logger');
const db = require('../utils/database');
const emailQueueProducer = require('./emailQueueProducer');
const { buildUnsubscribeUrl } = require('../utils/emailSuppression');

// email_templates.name used for the abandoned-cart sequence (migration 013).
const ABANDONED_CART_TEMPLATE = 'abandoned_cart';

// "$123.40" or "123.4" -> "123.40"
const formatAmount = (value) => {
  const n = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

class EmailQueueService {
  constructor() {
    // Abandoned-cart producer + queue-maintenance API. Rows are written by
    // emailQueueProducer (the same path as welcome/verification emails) and
    // delivered by the email daemon (rust/crates/email-daemon), the queue's
    // single consumer.
  }

  /**
   * Queue one abandoned cart email of the 3-step sequence.
   * The producer applies the marketing suppression gate (isMarketingCategory /
   * isEmailSuppressed), so unsubscribed recipients get nothing.
   * @param {string} customerEmail
   * @param {Object} cartData - { items: [{ name, quantity }], totalAmount, checkoutUrl, customerName }
   * @param {number} sequenceStep - 1 (1 hour), 2 (24 hours) or 3 (72 hours)
   * @returns {Promise<string|null>} - email_queue id, or null when not queued
   */
  async queueAbandonedCartEmail(customerEmail, cartData, sequenceStep = 1) {
    const delays = {
      1: 60 * 60 * 1000,      // 1 hour
      2: 24 * 60 * 60 * 1000, // 24 hours
      3: 72 * 60 * 60 * 1000  // 72 hours (3 days)
    };

    const delay = delays[sequenceStep] || delays[1];
    const scheduledAt = new Date(Date.now() + delay);

    const items = cartData.items || [];
    // Raw values: the email daemon HTML-escapes every variable it puts into the
    // HTML body (and the text body must show the name as typed), so escaping
    // here would escape twice.
    const variables = {
      customer_name: cartData.customerName || 'Customer',
      item_count: items.length,
      item_summary: items.map((i) => `${i.name} × ${i.quantity}`).join(', '),
      cart_total: formatAmount(cartData.totalAmount),
      recovery_link: cartData.checkoutUrl,
      unsubscribe_link: buildUnsubscribeUrl(customerEmail),
      sequence_step: sequenceStep
    };

    const result = await emailQueueProducer.enqueue(
      customerEmail,
      cartData.customerName || '',
      ABANDONED_CART_TEMPLATE,
      variables,
      scheduledAt
    );

    if (!result.queued) {
      logger.info('Abandoned cart email not queued', { customerEmail, sequenceStep, reason: result.reason });
      return null;
    }
    return result.id;
  }

  /**
   * Cancel all pending abandoned cart emails for a specific customer
   * (useful when customer completes purchase)
   */
  async cancelAbandonedCartEmails(customerEmail) {
    const query = `
      UPDATE email_queue
      SET status = 'cancelled'
      WHERE to_email = ?
      AND template_id IN (SELECT id FROM email_templates WHERE name = ?)
      AND status = 'pending'
    `;

    const result = await db.executeQuery(query, [customerEmail, ABANDONED_CART_TEMPLATE]);

    if (result.success) {
      logger.info(`Cancelled ${result.affectedRows} abandoned cart emails for ${customerEmail}`);
      return result.affectedRows;
    } else {
      logger.error(`Failed to cancel abandoned cart emails: ${result.error}`);
      return 0;
    }
  }
}

EmailQueueService.ABANDONED_CART_TEMPLATE = ABANDONED_CART_TEMPLATE;

module.exports = EmailQueueService;
