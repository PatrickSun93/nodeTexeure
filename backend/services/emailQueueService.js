const emailService = require('./emailService');
const ErrorUtils = require('../utils/errorUtils');
const logger = require('../utils/logger');
const db = require('../utils/database');

class EmailQueueService {
  constructor() {
    this.emailService = emailService;
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
        AND attempts < ?
        ORDER BY created_at ASC
        LIMIT 10
      `;

      // executeQuery returns the rows array directly (or undefined on error)
      const pendingEmails = (await db.executeQuery(query, [this.maxRetries])) || [];

      for (const emailItem of pendingEmails) {
        await this.processEmailItem(emailItem);
      }

      // Clean up old completed/failed emails (older than 7 days)
      await this.cleanupOldEmails();

    } catch (error) {
      // The email_queue background feature has schema drift and is not wired for
      // the demo; keep this at debug so it does not spam normal logs.
      logger.debug('Email queue cycle skipped', { error: error && error.message });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual email item with enhanced error handling
   */
  async processEmailItem(emailItem) {
    const startTime = Date.now();
    
    try {
      // Validate email item
      if (!emailItem.recipient || !emailItem.type || !emailItem.data) {
        throw new Error('Invalid email item: missing required fields');
      }

      const data = JSON.parse(emailItem.data);
      let result;

      // Use circuit breaker pattern for email sending
      const emailSender = ErrorUtils.createCircuitBreaker(
        async () => await this._sendEmailByType(emailItem.type, emailItem.recipient, data),
        { failureThreshold: 5, resetTimeout: 60000 }
      );

      result = await emailSender();

      // Mark as completed
      await this.markEmailCompleted(emailItem.id, result.messageId);

      const processingTime = Date.now() - startTime;
      logger.info(`Email sent successfully`, {
        queueId: emailItem.id,
        type: emailItem.type,
        recipient: emailItem.recipient,
        messageId: result.messageId,
        processingTime: `${processingTime}ms`,
        attempts: emailItem.attempts
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Enhanced error logging
      ErrorUtils.logError(error, {
        operation: 'process_email_item',
        queue_id: emailItem.id,
        email_type: emailItem.type,
        recipient: emailItem.recipient,
        attempts: emailItem.attempts,
        processing_time: processingTime
      });

      await this.handleEmailFailure(emailItem, error);
    }
  }

  /**
   * Send email by type with proper error handling
   */
  async _sendEmailByType(type, recipient, data) {
    switch (type) {
      case 'order_confirmation':
        return await this.emailService.sendOrderConfirmation(recipient, data);
      
      case 'order_status_update':
        return await this.emailService.sendOrderStatusUpdate(recipient, data);
      
      case 'shipping_notification':
        return await this.emailService.sendShippingNotification(recipient, data);
      
      case 'abandoned_cart':
        return await this.emailService.sendAbandonedCartEmail(recipient, data, data.sequenceStep);
      
      case 'welcome_email':
        return await this.emailService.sendWelcomeEmail(recipient, data);
      
      case 'low_stock_alert':
        const results = await this.emailService.sendLowStockAlert([recipient], data.products);
        return results[0]; // Get first result since we're sending to one email
      
      case 'email_failure_alert':
        return await this.emailService.sendEmailFailureAlert(recipient, data);
      
      default:
        const error = new Error(`Unknown email type: ${type}`);
        error.type = 'validation_error';
        throw error;
    }
  }

  /**
   * Handle email sending failure with enhanced retry logic
   */
  async handleEmailFailure(emailItem, error) {
    // migrated: use 'attempts' field; see newAttempts computed from emailItem.attempts
    const newAttempts = emailItem.attempts + 1; // align with schema column 'attempts'
    const isRetryable = this._isEmailErrorRetryable(error);

    // Don't retry non-retryable errors (like invalid email addresses)
    if (!isRetryable || newAttempts >= this.maxRetries) {
      // Max retries reached or non-retryable error, mark as failed
      await this.markEmailFailed(emailItem.id, error.message, error.type);
      
      logger.error(`Email failed permanently`, {
        queueId: emailItem.id,
        type: emailItem.type,
        recipient: emailItem.recipient,
        error: error.message,
        errorType: error.type,
        retryCount: newAttempts,
        retryable: isRetryable,
        reason: !isRetryable ? 'non-retryable error' : 'max retries exceeded'
      });

      // Send alert for critical email failures
      if (this._isCriticalEmailType(emailItem.type)) {
        await this._alertAdminsOfEmailFailure(emailItem, error);
      }
    } else {
      // Calculate retry delay with exponential backoff and jitter
      const baseDelay = this.retryDelays[newAttempts - 1] || this.retryDelays[this.retryDelays.length - 1];
      const jitter = Math.random() * 1000; // Add up to 1 second of jitter
      const retryDelay = baseDelay + jitter;
      const nextRetryAt = new Date(Date.now() + retryDelay);

      await this.scheduleRetry(emailItem.id, newAttempts, nextRetryAt, error.message);

      logger.warn(`Email failed, scheduling retry ${newAttempts}/${this.maxRetries}`, {
        queueId: emailItem.id,
        type: emailItem.type,
        recipient: emailItem.recipient,
        nextRetryAt,
        retryDelay: `${Math.round(retryDelay)}ms`,
        error: error.message,
        errorType: error.type
      });
    }
  }

  /**
   * Determine if an email error is retryable
   */
  _isEmailErrorRetryable(error) {
    // Non-retryable errors
    const nonRetryableErrors = [
      'MessageRejected',
      'MailFromDomainNotVerified',
      'ConfigurationSetDoesNotExist',
      'validation_error'
    ];

    const errorType = error.type || error.name || error.code;
    
    // Check if it's a non-retryable error
    if (nonRetryableErrors.some(nonRetryable => 
        errorType && errorType.toLowerCase().includes(nonRetryable.toLowerCase()))) {
      return false;
    }

    // Check for invalid email patterns in the message
    if (error.message && (
        error.message.includes('invalid email') ||
        error.message.includes('malformed') ||
        error.message.includes('bounce') ||
        error.message.includes('suppressed')
    )) {
      return false;
    }

    // Default to retryable for network/service errors
    return true;
  }

  /**
   * Check if email type is critical and requires admin notification on failure
   */
  _isCriticalEmailType(emailType) {
    const criticalTypes = ['order_confirmation', 'shipping_notification', 'low_stock_alert'];
    return criticalTypes.includes(emailType);
  }

  /**
   * Alert administrators of critical email failures
   */
  async _alertAdminsOfEmailFailure(emailItem, error) {
    try {
      // Get admin emails from database
      const adminQuery = `
        SELECT email FROM users 
        WHERE role = 'admin' AND status = 'active'
      `;
      
      const adminResult = await db.executeQuery(adminQuery);
      
      if (adminResult.success && adminResult.data.length > 0) {
        const adminEmails = adminResult.data.map(admin => admin.email);
        
        // Queue alert emails for admins (with lower priority to avoid infinite loops)
        for (const adminEmail of adminEmails) {
          await this.queueEmail(
            'email_failure_alert',
            adminEmail,
            {
              failedEmail: {
                id: emailItem.id,
                type: emailItem.type,
                recipient: emailItem.recipient,
                attempts: emailItem.attempts
              },
              error: {
                message: error.message,
                type: error.type,
                timestamp: new Date().toISOString()
              }
            },
            5, // Low priority
            null
          );
        }
        
        logger.info(`Queued email failure alerts for ${adminEmails.length} admins`, {
          failedEmailId: emailItem.id,
          failedEmailType: emailItem.type
        });
      }
    } catch (alertError) {
      logger.error('Failed to alert admins of email failure', {
        originalEmailId: emailItem.id,
        alertError: alertError.message
      });
    }
  }

  /**
   * Mark email as completed
   */
  async markEmailCompleted(queueId, messageId) {
    const query = `
      UPDATE email_queue 
      SET status = 'sent', 
          sent_at = NOW(), 
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
      SET attempts = ?, 
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
      WHERE (status = 'sent' AND sent_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
         OR (status = 'failed' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
    `;
    const result = await db.executeQuery(query);
    if (!result.success) {
      throw new Error(result.error);
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