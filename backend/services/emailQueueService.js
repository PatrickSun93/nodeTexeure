const EmailService = require('./emailService');
// Simple logger wrapper for email service
const logger = {
  info: (message, data) => console.log(`[INFO] ${message}`, data || ''),
  error: (message, data) => console.error(`[ERROR] ${message}`, data || ''),
  warn: (message, data) => console.warn(`[WARN] ${message}`, data || '')
};
const db = require('../utils/database');

class EmailQueueService {
  constructor() {
    this.emailService = new EmailService();
    this.isProcessing = false;
    this.maxRetries = 3;
    this.retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s
    this.processingInterval = 30000; // Process queue every 30 seconds
    
    // Start processing queue
    this.startQueueProcessor();
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
      const queueId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();
      const sendAt = scheduledAt || now;

      const query = `
        INSERT INTO email_queue (
          id, type, recipient, data, priority, status, 
          retry_count, scheduled_at, created_at, to_email, subject, email_content
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
   * Queue low stock alert for admin users
   */
  async queueLowStockAlert(adminEmails, lowStockProducts) {
    const results = [];
    for (const adminEmail of adminEmails) {
      const queueId = await this.queueEmail('low_stock_alert', adminEmail, { products: lowStockProducts }, 4);
      results.push(queueId);
    }
    return results;
  }

  /**
   * Process pending emails in the queue
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get pending emails that are ready to be sent
      const query = `
        SELECT * FROM email_queue 
        WHERE status = 'pending' 
        AND scheduled_at <= NOW() 
        AND retry_count < ?
        ORDER BY priority ASC, created_at ASC 
        LIMIT 10
      `;

      const result = await db.executeQuery(query, [this.maxRetries]);
      if (!result.success) {
        throw new Error(result.error);
      }
      const pendingEmails = result.data;

      for (const emailItem of pendingEmails) {
        await this.processEmailItem(emailItem);
      }

      // Clean up old completed/failed emails (older than 7 days)
      await this.cleanupOldEmails();

    } catch (error) {
      logger.error('Error processing email queue', { error: error.message });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual email item
   */
  async processEmailItem(emailItem) {
    try {
      const data = JSON.parse(emailItem.data);
      let result;

      // Send email based on type
      switch (emailItem.type) {
        case 'order_confirmation':
          result = await this.emailService.sendOrderConfirmation(emailItem.recipient, data);
          break;
        case 'order_status_update':
          result = await this.emailService.sendOrderStatusUpdate(emailItem.recipient, data);
          break;
        case 'shipping_notification':
          result = await this.emailService.sendShippingNotification(emailItem.recipient, data);
          break;
        case 'abandoned_cart':
          result = await this.emailService.sendAbandonedCartEmail(emailItem.recipient, data, data.sequenceStep);
          break;
        case 'welcome_email':
          result = await this.emailService.sendWelcomeEmail(emailItem.recipient, data);
          break;
        case 'low_stock_alert':
          result = await this.emailService.sendLowStockAlert([emailItem.recipient], data.products);
          result = result[0]; // Get first result since we're sending to one email
          break;
        default:
          throw new Error(`Unknown email type: ${emailItem.type}`);
      }

      // Mark as completed
      await this.markEmailCompleted(emailItem.id, result.messageId);

      logger.info(`Email sent successfully`, {
        queueId: emailItem.id,
        type: emailItem.type,
        recipient: emailItem.recipient,
        messageId: result.messageId
      });

    } catch (error) {
      await this.handleEmailFailure(emailItem, error);
    }
  }

  /**
   * Handle email sending failure with retry logic
   */
  async handleEmailFailure(emailItem, error) {
    const newRetryCount = emailItem.retry_count + 1;

    if (newRetryCount >= this.maxRetries) {
      // Max retries reached, mark as failed
      await this.markEmailFailed(emailItem.id, error.message);
      
      logger.error(`Email failed permanently after ${this.maxRetries} attempts`, {
        queueId: emailItem.id,
        type: emailItem.type,
        recipient: emailItem.recipient,
        error: error.message
      });
    } else {
      // Schedule retry with exponential backoff
      const retryDelay = this.retryDelays[newRetryCount - 1] || this.retryDelays[this.retryDelays.length - 1];
      const nextRetryAt = new Date(Date.now() + retryDelay);

      await this.scheduleRetry(emailItem.id, newRetryCount, nextRetryAt, error.message);

      logger.warn(`Email failed, scheduling retry ${newRetryCount}/${this.maxRetries}`, {
        queueId: emailItem.id,
        type: emailItem.type,
        recipient: emailItem.recipient,
        nextRetryAt,
        error: error.message
      });
    }
  }

  /**
   * Mark email as completed
   */
  async markEmailCompleted(queueId, messageId) {
    const query = `
      UPDATE email_queue 
      SET status = 'completed', 
          completed_at = NOW(), 
          message_id = ?,
          error_message = NULL
      WHERE id = ?
    `;
    const result = await db.executeQuery(query, [messageId, queueId]);
    if (!result.success) {
      throw new Error(result.error);
    }
  }

  /**
   * Mark email as failed
   */
  async markEmailFailed(queueId, errorMessage) {
    const query = `
      UPDATE email_queue 
      SET status = 'failed', 
          completed_at = NOW(), 
          error_message = ?
      WHERE id = ?
    `;
    const result = await db.executeQuery(query, [errorMessage, queueId]);
    if (!result.success) {
      throw new Error(result.error);
    }
  }

  /**
   * Schedule email retry
   */
  async scheduleRetry(queueId, retryCount, nextRetryAt, errorMessage) {
    const query = `
      UPDATE email_queue 
      SET retry_count = ?, 
          scheduled_at = ?, 
          error_message = ?
      WHERE id = ?
    `;
    const result = await db.executeQuery(query, [retryCount, nextRetryAt, errorMessage, queueId]);
    if (!result.success) {
      throw new Error(result.error);
    }
  }

  /**
   * Clean up old completed/failed emails
   */
  async cleanupOldEmails() {
    const query = `
      DELETE FROM email_queue 
      WHERE status IN ('completed', 'failed') 
      AND completed_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    `;
    const result = await db.executeQuery(query);
    
    if (result.success && result.affectedRows > 0) {
      logger.info(`Cleaned up ${result.affectedRows} old email records`);
    }
  }

  /**
   * Start the queue processor
   */
  startQueueProcessor() {
    // Process queue immediately
    this.processQueue();

    // Set up interval to process queue regularly
    setInterval(() => {
      this.processQueue();
    }, this.processingInterval);

    logger.info('Email queue processor started', {
      processingInterval: this.processingInterval,
      maxRetries: this.maxRetries
    });
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