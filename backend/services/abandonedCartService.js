const EmailQueueService = require('./emailQueueService');
const db = require('../utils/database');

// Simple logger wrapper
const logger = {
  info: (message, data) => console.log(`[INFO] ${message}`, data || ''),
  error: (message, data) => console.error(`[ERROR] ${message}`, data || ''),
  warn: (message, data) => console.warn(`[WARN] ${message}`, data || '')
};

class AbandonedCartService {
  /**
   * @param {Object} [opts]
   * @param {boolean} [opts.autoStart] - run detection now and every 15 minutes.
   *   Off under NODE_ENV=test so tests drive detectAbandonedCarts() themselves.
   */
  constructor({ autoStart = process.env.NODE_ENV !== 'test' } = {}) {
    this.emailQueueService = new EmailQueueService();
    this.abandonmentThreshold = 30 * 60 * 1000; // 30 minutes in milliseconds
    this.emailSequenceDelays = {
      1: 60 * 60 * 1000,      // 1 hour
      2: 24 * 60 * 60 * 1000, // 24 hours  
      3: 72 * 60 * 60 * 1000  // 72 hours (3 days)
    };
    
    // Start the abandoned cart detection process
    if (autoStart) this.startAbandonedCartDetection();
  }

  /**
   * Track cart activity - called when user adds/removes items or visits cart
   * @param {string} cartId - Cart ID
   * @param {string} userEmail - User email (if available)
   * @param {string} sessionId - Session ID for guest users
   */
  async trackCartActivity(cartId, userEmail = null, sessionId = null) {
    try {
      // Update cart's last activity timestamp
      const updateQuery = `
        UPDATE shopping_carts 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;
      
      const result = await db.executeQuery(updateQuery, [cartId]);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      logger.info('Cart activity tracked', {
        cartId,
        userEmail,
        sessionId
      });

    } catch (error) {
      logger.error('Failed to track cart activity', {
        error: error.message,
        cartId,
        userEmail
      });
    }
  }

  /**
   * Detect abandoned carts and initiate recovery process
   */
  async detectAbandonedCarts() {
    try {
      // Find carts that haven't been updated in the last 30 minutes and have items
      const abandonedCartsQuery = `
        SELECT DISTINCT
          sc.id as cart_id,
          sc.user_id,
          sc.session_id,
          sc.updated_at as last_activity,
          u.email as user_email,
          u.first_name,
          u.last_name,
          COUNT(ci.id) as item_count,
          SUM(ci.quantity * ci.price) as cart_total
        FROM shopping_carts sc
        LEFT JOIN users u ON sc.user_id = u.id
        INNER JOIN cart_items ci ON sc.id = ci.cart_id
        LEFT JOIN abandoned_cart_recovery acr ON sc.id = acr.cart_id AND acr.recovered_at IS NULL
        WHERE sc.updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        AND acr.id IS NULL  -- Not already in recovery process
        GROUP BY sc.id, sc.user_id, sc.session_id, sc.updated_at, u.email, u.first_name, u.last_name
        HAVING item_count > 0
        ORDER BY sc.updated_at DESC
        LIMIT 50
      `;

      const result = await db.executeQuery(abandonedCartsQuery);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      const abandonedCarts = result.data;
      
      logger.info(`Found ${abandonedCarts.length} abandoned carts to process`);

      for (const cart of abandonedCarts) {
        await this.initiateCartRecovery(cart);
      }

      return {
        success: true,
        processedCarts: abandonedCarts.length
      };

    } catch (error) {
      logger.error('Failed to detect abandoned carts', {
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initiate cart recovery process for a specific cart
   * @param {Object} cartData - Cart data from abandoned cart detection
   */
  async initiateCartRecovery(cartData) {
    try {
      const { cart_id, user_email, first_name, last_name, item_count, cart_total } = cartData;

      // Skip if no email available
      if (!user_email) {
        logger.info('Skipping cart recovery - no email available', { cart_id });
        return;
      }

      // Generate recovery token
      const recoveryToken = this.generateRecoveryToken();

      // Create abandoned cart recovery record
      const recoveryId = `RECOVERY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const insertRecoveryQuery = `
        INSERT INTO abandoned_cart_recovery (
          id, cart_id, email, recovery_token, created_at
        ) VALUES (?, ?, ?, ?, NOW())
      `;

      const insertResult = await db.executeQuery(insertRecoveryQuery, [
        recoveryId,
        cart_id,
        user_email,
        recoveryToken
      ]);

      if (!insertResult.success) {
        throw new Error(insertResult.error);
      }

      // Get cart items for email
      const cartItems = await this.getCartItemsForEmail(cart_id);
      
      if (!cartItems.success || cartItems.data.length === 0) {
        logger.warn('No cart items found for recovery email', { cart_id });
        return;
      }

      // Prepare cart data for email
      const emailCartData = {
        items: cartItems.data.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: parseFloat(item.price).toFixed(2),
          variant_details: item.variant_details
        })),
        totalAmount: parseFloat(cart_total).toFixed(2),
        checkoutUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/cart-recovery?recovery=${recoveryToken}`,
        customerName: `${first_name || ''} ${last_name || ''}`.trim() || 'Customer',
        recoveryToken
      };

      // Cancel any existing abandoned cart emails for this customer
      await this.emailQueueService.cancelAbandonedCartEmails(user_email);

      // Queue the abandoned cart email sequence (3 emails)
      const queueIds = [];
      for (let step = 1; step <= 3; step++) {
        const queueId = await this.emailQueueService.queueAbandonedCartEmail(
          user_email, 
          emailCartData, 
          step
        );
        queueIds.push(queueId);
      }

      // Record how many emails were queued (0 when the recipient unsubscribed)
      const queuedCount = queueIds.filter(Boolean).length;
      const updateRecoveryQuery = `
        UPDATE abandoned_cart_recovery 
        SET email_sent_count = ?, last_email_sent_at = NOW()
        WHERE id = ?
      `;
      
      await db.executeQuery(updateRecoveryQuery, [queuedCount, recoveryId]);

      logger.info('Cart recovery initiated successfully', {
        cart_id,
        user_email,
        recoveryId,
        queueIds,
        itemCount: item_count,
        cartTotal: cart_total
      });

    } catch (error) {
      logger.error('Failed to initiate cart recovery', {
        error: error.message,
        cart_id: cartData.cart_id,
        user_email: cartData.user_email
      });
    }
  }

  /**
   * Get cart items formatted for email
   * @param {string} cartId - Cart ID
   */
  async getCartItemsForEmail(cartId) {
    try {
      const query = `
        SELECT 
          ci.quantity,
          ci.price,
          p.name,
          pv.size,
          pv.color,
          pv.pattern,
          CASE 
            WHEN pv.id IS NOT NULL THEN JSON_OBJECT(
              'size', pv.size,
              'color', pv.color,
              'pattern', pv.pattern
            )
            ELSE NULL
          END as variant_details
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        LEFT JOIN product_variants pv ON ci.variant_id = pv.id
        WHERE ci.cart_id = ?
        ORDER BY ci.created_at ASC
      `;

      const result = await db.executeQuery(query, [cartId]);
      
      return result;

    } catch (error) {
      logger.error('Failed to get cart items for email', {
        error: error.message,
        cartId
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Mark cart as recovered when customer completes purchase
   * @param {string} cartId - Cart ID
   * @param {string} orderId - Order ID
   */
  async markCartRecovered(cartId, orderId) {
    try {
      const updateQuery = `
        UPDATE abandoned_cart_recovery 
        SET recovered_at = NOW(), recovery_order_id = ?
        WHERE cart_id = ? AND recovered_at IS NULL
      `;

      const result = await db.executeQuery(updateQuery, [orderId, cartId]);
      
      if (result.success && result.affectedRows > 0) {
        logger.info('Cart marked as recovered', {
          cartId,
          orderId
        });

        // Cancel any pending abandoned cart emails
        const emailQuery = `
          SELECT email FROM abandoned_cart_recovery 
          WHERE cart_id = ? AND recovered_at IS NOT NULL
          LIMIT 1
        `;
        
        const emailResult = await db.executeQuery(emailQuery, [cartId]);
        
        if (emailResult.success && emailResult.data.length > 0) {
          const customerEmail = emailResult.data[0].email;
          await this.emailQueueService.cancelAbandonedCartEmails(customerEmail);
        }
      }

      return result;

    } catch (error) {
      logger.error('Failed to mark cart as recovered', {
        error: error.message,
        cartId,
        orderId
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get recovery analytics
   */
  async getRecoveryAnalytics(days = 30) {
    try {
      const analyticsQuery = `
        SELECT 
          COUNT(*) as total_abandoned_carts,
          COUNT(CASE WHEN recovered_at IS NOT NULL THEN 1 END) as recovered_carts,
          COUNT(CASE WHEN recovered_at IS NULL THEN 1 END) as pending_recovery,
          ROUND(
            (COUNT(CASE WHEN recovered_at IS NOT NULL THEN 1 END) * 100.0 / COUNT(*)), 2
          ) as recovery_rate_percentage,
          AVG(email_sent_count) as avg_emails_sent
        FROM abandoned_cart_recovery
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `;

      const result = await db.executeQuery(analyticsQuery, [days]);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      const analytics = result.data[0] || {
        total_abandoned_carts: 0,
        recovered_carts: 0,
        pending_recovery: 0,
        recovery_rate_percentage: 0,
        avg_emails_sent: 0
      };

      // Get recovery by email sequence
      const sequenceQuery = `
        SELECT 
          'Email 1 (1 hour)' as email_sequence,
          COUNT(CASE WHEN recovered_at IS NOT NULL AND email_sent_count >= 1 THEN 1 END) as recovered_count
        FROM abandoned_cart_recovery
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        UNION ALL
        SELECT 
          'Email 2 (24 hours)' as email_sequence,
          COUNT(CASE WHEN recovered_at IS NOT NULL AND email_sent_count >= 2 THEN 1 END) as recovered_count
        FROM abandoned_cart_recovery
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        UNION ALL
        SELECT 
          'Email 3 (3 days)' as email_sequence,
          COUNT(CASE WHEN recovered_at IS NOT NULL AND email_sent_count >= 3 THEN 1 END) as recovered_count
        FROM abandoned_cart_recovery
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      `;

      const sequenceResult = await db.executeQuery(sequenceQuery, [days, days, days]);
      
      return {
        success: true,
        data: {
          ...analytics,
          recovery_by_sequence: sequenceResult.success ? sequenceResult.data : []
        }
      };

    } catch (error) {
      logger.error('Failed to get recovery analytics', {
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate a secure recovery token
   */
  generateRecoveryToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Start the abandoned cart detection process (runs every 15 minutes)
   */
  startAbandonedCartDetection() {
    // Run immediately
    this.detectAbandonedCarts();

    // Set up interval to run every 15 minutes
    setInterval(() => {
      this.detectAbandonedCarts();
    }, 15 * 60 * 1000).unref(); // 15 minutes

    logger.info('Abandoned cart detection started - running every 15 minutes');
  }

  /**
   * Clean up old abandoned cart records (older than 30 days)
   */
  async cleanupOldRecords() {
    try {
      const cleanupQuery = `
        DELETE FROM abandoned_cart_recovery 
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
      `;

      const result = await db.executeQuery(cleanupQuery);
      
      if (result.success && result.affectedRows > 0) {
        logger.info(`Cleaned up ${result.affectedRows} old abandoned cart records`);
      }

      return result;

    } catch (error) {
      logger.error('Failed to cleanup old abandoned cart records', {
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Shared singleton. The constructor starts background intervals (abandoned-cart
// detection), so route modules should reuse one
// instance via getShared() instead of each calling `new AbandonedCartService()`
// and multiplying those intervals.
let sharedInstance = null;
AbandonedCartService.getShared = function getShared() {
  if (!sharedInstance) sharedInstance = new AbandonedCartService();
  return sharedInstance;
};

module.exports = AbandonedCartService;