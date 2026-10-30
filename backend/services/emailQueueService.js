const logger = require('../utils/logger');
const db = require('../utils/database');
const { isMarketingCategory, isEmailSuppressed } = require('../utils/emailSuppression');

class EmailQueueService {
  constructor() {
    // Producer + queue-maintenance API only. Delivery is done by the separate
    // email daemon (rust/crates/email-daemon), the queue's single consumer.
  }

  /**
   * Add email to queue for reliable delivery
   * @param {string} type - Email type (order_confirmation, status_update, etc.)
   * @param {string} recipient - Recipient email address
   * @param {Object} data - Email data (order info, cart info, etc.)
   * @param {number} priority - Priority level (1-5, 1 being highest)
   * @param {Date} scheduledAt - When to send the email (optional, defaults to now)
   * @returns {Promise<string>} - Queue item ID
   */
  async queueEmail(type, recipient, data, priority = 3, scheduledAt = null) {
    try {
      // Suppression gate — only for MARKETING queue types (e.g. 'abandoned_cart').
      // Transactional types (order_confirmation, shipping_notification, welcome_email,
      // low_stock_alert, email_failure_alert) are never gated. Fail-open: a suppression
      // check error returns false and the email still queues.
      if (isMarketingCategory(type) && (await isEmailSuppressed(recipient))) {
        logger.info('Marketing email suppressed (recipient unsubscribed)', { type, recipient });
        return null;
      }

      const queueId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();
      const sendAt = scheduledAt || now;

      const query = `
        INSERT INTO email_queue (
          id, type, recipient, data, priority, status, 
          attempts, scheduled_at, created_at, to_email, subject, email_content
        ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?)
      `;

      // Generate a temporary subject and content for the queue entry
      const tempSubject = `${type.replace('_', ' ').toUpperCase()} - Queued`;
      const tempContent = { type, data, queued_at: now };

      const result = await db.executeQuery(query, [
        queueId,
        type,
        recipient,
        JSON.stringify(data),
        priority,
        sendAt,
        now,
        recipient, // to_email
        tempSubject, // subject
        JSON.stringify(tempContent) // email_content
      ]);

      if (!result.success) {
        throw new Error(result.error);
      }

      logger.info(`Email queued successfully`, {
        queueId,
        type,
        recipient,
        priority,
        scheduledAt: sendAt
      });

      return queueId;
    } catch (error) {
      logger.error('Failed to queue email', {
        error: error.message,
        type,
        recipient
      });
      throw error;
    }
  }

  /**
   * Queue order confirmation email
   */
  async queueOrderConfirmation(customerEmail, orderData) {
    return await this.queueEmail('order_confirmation', customerEmail, orderData, 1);
  }

  /**
   * Queue order status update email
   */
  async queueOrderStatusUpdate(customerEmail, orderData) {
    return await this.queueEmail('order_status_update', customerEmail, orderData, 2);
  }

  /**
   * Queue shipping notification email
   */
  async queueShippingNotification(customerEmail, orderData) {
    return await this.queueEmail('shipping_notification', customerEmail, orderData, 1);
  }

  /**
   * Queue abandoned cart email with delay
   */
  async queueAbandonedCartEmail(customerEmail, cartData, sequenceStep = 1) {
    const delays = {
      1: 60 * 60 * 1000,      // 1 hour
      2: 24 * 60 * 60 * 1000, // 24 hours
      3: 72 * 60 * 60 * 1000  // 72 hours (3 days)
    };

    const delay = delays[sequenceStep] || delays[1];
    const scheduledAt = new Date(Date.now() + delay);

    const emailData = {
      ...cartData,
      sequenceStep
    };

    return await this.queueEmail('abandoned_cart', customerEmail, emailData, 3, scheduledAt);
  }

  /**
   * Queue welcome email for new users
   */
  async queueWelcomeEmail(customerEmail, userData) {
    return await this.queueEmail('welcome_email', customerEmail, userData, 2);
  }

  /**
   * Queue low stock alert for authorized staff
   */
  async queueLowStockAlert(staffEmails, lowStockProducts) {
    const results = [];
    for (const staffEmail of staffEmails) {
      const queueId = await this.queueEmail('low_stock_alert', staffEmail, { products: lowStockProducts }, 4);
      results.push(queueId);
    }
    return results;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM email_queue 
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY status
    `;
    
    const result = await db.executeQuery(query);
    
    const stats = {
      pending: 0,
      completed: 0,
      failed: 0,
      total: 0
    };

    if (result.success) {
      result.data.forEach(row => {
        stats[row.status] = row.count;
        stats.total += row.count;
      });
    }

    return stats;
  }

  /**
   * Cancel pending email by queue ID
   */
  async cancelEmail(queueId) {
    const query = `
      UPDATE email_queue 
      SET status = 'cancelled', 
          completed_at = NOW() 
      WHERE id = ? AND status = 'pending'
    `;
    
    const result = await db.executeQuery(query, [queueId]);
    return result.success && result.affectedRows > 0;
  }

  /**
   * Cancel all pending abandoned cart emails for a specific customer
   * (useful when customer completes purchase)
   */
  async cancelAbandonedCartEmails(customerEmail) {
    const query = `
      UPDATE email_queue 
      SET status = 'cancelled', 
          completed_at = NOW() 
      WHERE recipient = ? 
      AND type = 'abandoned_cart' 
      AND status = 'pending'
    `;
    
    const result = await db.executeQuery(query, [customerEmail]);
    
    if (result.success) {
      logger.info(`Cancelled ${result.affectedRows} abandoned cart emails for ${customerEmail}`);
      return result.affectedRows;
    } else {
      logger.error(`Failed to cancel abandoned cart emails: ${result.error}`);
      return 0;
    }
  }
}

module.exports = EmailQueueService;