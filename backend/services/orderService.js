const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const EmailQueueService = require('./emailQueueService');
const { v4: uuidv4 } = require('uuid');

class OrderService {
  constructor() {
    this.emailQueueService = new EmailQueueService();
  }

  /**
   * Update order status with history tracking
   * @param {string} orderId - Order ID
   * @param {string} newStatus - New status
   * @param {string} notes - Optional notes
   * @param {string} changedBy - User ID who made the change
   * @returns {Promise<Object>} - Update result
   */
  async updateOrderStatus(orderId, newStatus, notes = null, changedBy = null) {
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    
    if (!validStatuses.includes(newStatus)) {
      return ResponseFormatter.failure('Invalid status');
    }

    try {
      // Get current order details
      const orderQuery = `
        SELECT o.*, u.email, u.first_name, u.last_name 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        WHERE o.id = ?
      `;
      const orderResult = await DatabaseUtil.executeQuery(orderQuery, [orderId]);

      if (!orderResult.success || orderResult.data.length === 0) {
        return ResponseFormatter.failure('Order not found');
      }

      const order = orderResult.data[0];
      const oldStatus = order.status;

      // Don't update if status is the same
      if (oldStatus === newStatus) {
        return ResponseFormatter.success('Order status unchanged', { orderId, status: newStatus });
      }

      // Update order status
      const updateResult = await DatabaseUtil.executeQuery(
        'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
        [newStatus, orderId]
      );

      if (!updateResult.success) {
        throw new Error(updateResult.error);
      }

      // Create status history entry
      const historyId = uuidv4();
      const statusDetails = {
        notes: notes,
        previous_status: oldStatus,
        changed_by_name: changedBy ? await this.getUserName(changedBy) : 'System'
      };

      const historyResult = await DatabaseUtil.executeQuery(
        `INSERT INTO order_status_history (id, order_id, status, status_details, changed_by, created_at) 
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [historyId, orderId, newStatus, JSON.stringify(statusDetails), changedBy]
      );

      if (!historyResult.success) {
        console.error('Failed to create status history:', historyResult.error);
      }

      // Queue email notification
      await this.queueStatusUpdateEmail(order, newStatus, notes);

      return ResponseFormatter.success('Order status updated successfully', {
        orderId,
        oldStatus,
        newStatus,
        historyId
      });

    } catch (error) {
      console.error('Error updating order status:', error);
      return ResponseFormatter.failure('Failed to update order status', { error: error.message });
    }
  }

  /**
   * Get order status history
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} - Status history
   */
  async getOrderStatusHistory(orderId) {
    try {
      const historyQuery = `
        SELECT 
          osh.*,
          u.first_name,
          u.last_name,
          u.email as changed_by_email
        FROM order_status_history osh
        LEFT JOIN users u ON osh.changed_by = u.id
        WHERE osh.order_id = ?
        ORDER BY osh.created_at DESC
      `;

      const result = await DatabaseUtil.executeQuery(historyQuery, [orderId]);

      if (!result.success) {
        return ResponseFormatter.failure('Failed to fetch order history');
      }

      const history = result.data.map(entry => ({
        ...entry,
        status_details: entry.status_details || {},
        changed_by_name: entry.first_name ? `${entry.first_name} ${entry.last_name || ''}`.trim() : 'System'
      }));

      return ResponseFormatter.success('Order history fetched successfully', history);

    } catch (error) {
      console.error('Error fetching order history:', error);
      return ResponseFormatter.failure('Failed to fetch order history', { error: error.message });
    }
  }

  /**
   * Cancel order and process refund
   * @param {string} orderId - Order ID
   * @param {string} reason - Cancellation reason
   * @param {string} cancelledBy - User ID who cancelled
   * @returns {Promise<Object>} - Cancellation result
   */
  async cancelOrder(orderId, reason, cancelledBy) {
    try {
      // Get order details
      const orderQuery = `
        SELECT o.*, p.status as payment_status, p.id as payment_id
        FROM orders o
        LEFT JOIN payments p ON o.id = p.order_id
        WHERE o.id = ? AND o.status NOT IN ('cancelled', 'refunded', 'delivered')
      `;
      
      const orderResult = await DatabaseUtil.executeQuery(orderQuery, [orderId]);

      if (!orderResult.success || orderResult.data.length === 0) {
        return ResponseFormatter.failure('Order not found or cannot be cancelled');
      }

      const order = orderResult.data[0];

      // Update order status to cancelled
      const statusResult = await this.updateOrderStatus(orderId, 'cancelled', reason, cancelledBy);
      
      if (!statusResult.success) {
        return statusResult;
      }

      // If payment was completed, initiate refund process
      if (order.payment_status === 'completed') {
        const refundResult = await this.initiateRefund(orderId, order.total_amount, 'customer_request', reason, cancelledBy);
        
        if (!refundResult.success) {
          console.error('Refund initiation failed:', refundResult.message);
          // Don't fail cancellation if refund fails - can be processed manually
        }
      }

      // Restore inventory for cancelled items
      await this.restoreInventoryForOrder(orderId);

      return ResponseFormatter.success('Order cancelled successfully', {
        orderId,
        refundInitiated: order.payment_status === 'completed'
      });

    } catch (error) {
      console.error('Error cancelling order:', error);
      return ResponseFormatter.failure('Failed to cancel order', { error: error.message });
    }
  }

  /**
   * Initiate refund for an order
   * @param {string} orderId - Order ID
   * @param {number} amount - Refund amount
   * @param {string} reason - Refund reason
   * @param {string} reasonNotes - Additional notes
   * @param {string} processedBy - User ID who processed refund
   * @returns {Promise<Object>} - Refund result
   */
  async initiateRefund(orderId, amount, reason, reasonNotes, processedBy) {
    try {
      // Get payment details
      const paymentQuery = `
        SELECT * FROM payments 
        WHERE order_id = ? AND status = 'completed'
        ORDER BY created_at DESC LIMIT 1
      `;
      
      const paymentResult = await DatabaseUtil.executeQuery(paymentQuery, [orderId]);

      if (!paymentResult.success || paymentResult.data.length === 0) {
        return ResponseFormatter.failure('No completed payment found for this order');
      }

      const payment = paymentResult.data[0];

      // Create refund record
      const refundId = uuidv4();
      const refundDetails = {
        reason_notes: reasonNotes,
        original_payment_id: payment.id,
        gateway_transaction_id: payment.gateway_transaction_id
      };

      const refundResult = await DatabaseUtil.executeQuery(
        `INSERT INTO refunds (id, payment_id, order_id, amount, reason, refund_details, status, processed_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
        [refundId, payment.id, orderId, amount, reason, JSON.stringify(refundDetails), processedBy]
      );

      if (!refundResult.success) {
        throw new Error(refundResult.error);
      }

      // TODO: Integrate with payment gateway (Stripe) for actual refund processing
      // For now, mark as processing
      await DatabaseUtil.executeQuery(
        'UPDATE refunds SET status = ?, processed_at = NOW() WHERE id = ?',
        ['processing', refundId]
      );

      return ResponseFormatter.success('Refund initiated successfully', {
        refundId,
        amount,
        status: 'processing'
      });

    } catch (error) {
      console.error('Error initiating refund:', error);
      return ResponseFormatter.failure('Failed to initiate refund', { error: error.message });
    }
  }

  /**
   * Get orders with filtering and pagination
   * @param {Object} filters - Filter options
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} - Orders list
   */
  async getOrdersWithFilters(filters = {}, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      let whereConditions = [];
      let queryParams = [];

      // Build WHERE conditions based on filters
      if (filters.status) {
        whereConditions.push('o.status = ?');
        queryParams.push(filters.status);
      }

      if (filters.dateFrom) {
        whereConditions.push('DATE(o.created_at) >= ?');
        queryParams.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        whereConditions.push('DATE(o.created_at) <= ?');
        queryParams.push(filters.dateTo);
      }

      if (filters.customerEmail) {
        whereConditions.push('(u.email LIKE ? OR o.guest_email LIKE ?)');
        queryParams.push(`%${filters.customerEmail}%`, `%${filters.customerEmail}%`);
      }

      if (filters.orderNumber) {
        whereConditions.push('o.order_number LIKE ?');
        queryParams.push(`%${filters.orderNumber}%`);
      }

      if (filters.minAmount) {
        whereConditions.push('o.total_amount >= ?');
        queryParams.push(parseFloat(filters.minAmount));
      }

      if (filters.maxAmount) {
        whereConditions.push('o.total_amount <= ?');
        queryParams.push(parseFloat(filters.maxAmount));
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ${whereClause}
      `;
      
      const countResult = await DatabaseUtil.executeQuery(countQuery, [...queryParams]);
      const totalOrders = countResult.success ? countResult.data[0].total : 0;

      // Get orders
      const ordersQuery = `
        SELECT 
          o.*,
          COALESCE(CONCAT(u.first_name, ' ', u.last_name), o.guest_email) as customer_name,
          u.email as customer_email,
          u.phone as customer_phone
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const ordersQueryParams = [...queryParams, limit, offset];
      const ordersResult = await DatabaseUtil.executeQuery(ordersQuery, ordersQueryParams);

      if (!ordersResult.success) {
        throw new Error(ordersResult.error);
      }

      const orders = ordersResult.data.map(order => ({
        ...order,
        shipping_address: order.shipping_address_json ? JSON.parse(order.shipping_address_json) : null,
        billing_address: order.billing_address_json ? JSON.parse(order.billing_address_json) : null
      }));

      return ResponseFormatter.success('Orders fetched successfully', {
        orders,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalOrders / limit),
          totalOrders,
          limit
        }
      });

    } catch (error) {
      console.error('Error fetching orders:', error);
      return ResponseFormatter.failure('Failed to fetch orders', { error: error.message });
    }
  }

  /**
   * Get customer order history
   * @param {string} userId - User ID (null for guest)
   * @param {string} guestEmail - Guest email (if userId is null)
   * @returns {Promise<Object>} - Order history
   */
  async getCustomerOrderHistory(userId = null, guestEmail = null) {
    try {
      let query, params;

      if (userId) {
        query = `
          SELECT o.*, 
                 COUNT(oi.id) as item_count
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi.order_id
          WHERE o.user_id = ?
          GROUP BY o.id
          ORDER BY o.created_at DESC
        `;
        params = [userId];
      } else if (guestEmail) {
        query = `
          SELECT o.*, 
                 COUNT(oi.id) as item_count
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi.order_id
          WHERE o.guest_email = ?
          GROUP BY o.id
          ORDER BY o.created_at DESC
        `;
        params = [guestEmail];
      } else {
        return ResponseFormatter.failure('User ID or guest email required');
      }

      const result = await DatabaseUtil.executeQuery(query, params);

      if (!result.success) {
        throw new Error(result.error);
      }

      const orders = result.data.map(order => ({
        ...order,
        shipping_address: order.shipping_address_json ? JSON.parse(order.shipping_address_json) : null,
        billing_address: order.billing_address_json ? JSON.parse(order.billing_address_json) : null
      }));

      return ResponseFormatter.success('Order history fetched successfully', orders);

    } catch (error) {
      console.error('Error fetching customer order history:', error);
      return ResponseFormatter.failure('Failed to fetch order history', { error: error.message });
    }
  }

  /**
   * Helper method to get user name
   * @param {string} userId - User ID
   * @returns {Promise<string>} - User name
   */
  async getUserName(userId) {
    try {
      const result = await DatabaseUtil.executeQuery(
        'SELECT first_name, last_name FROM users WHERE id = ?',
        [userId]
      );
      
      if (result.success && result.data.length > 0) {
        const user = result.data[0];
        return `${user.first_name} ${user.last_name || ''}`.trim();
      }
      
      return 'Unknown User';
    } catch (error) {
      return 'Unknown User';
    }
  }

  /**
   * Queue status update email
   * @param {Object} order - Order object
   * @param {string} newStatus - New status
   * @param {string} notes - Optional notes
   */
  async queueStatusUpdateEmail(order, newStatus, notes) {
    try {
      const customerEmail = order.email || order.guest_email;
      
      if (!customerEmail) {
        return;
      }

      const orderData = {
        orderNumber: order.order_number,
        orderId: order.id,
        status: newStatus,
        totalAmount: `${parseFloat(order.total_amount).toFixed(2)}`,
        customerName: order.first_name ? `${order.first_name} ${order.last_name || ''}`.trim() : 'Guest',
        notes: notes || ''
      };

      if (newStatus === 'shipped') {
        orderData.trackingNumber = order.tracking_number || 'TBD';
        orderData.estimatedDelivery = order.estimated_delivery_date || 'Within 3-5 business days';
        orderData.trackingUrl = order.tracking_number ? `https://www.fedex.com/fedextrack/?trknbr=${order.tracking_number}` : null;
        
        await this.emailQueueService.queueShippingNotification(customerEmail, orderData);
      } else {
        await this.emailQueueService.queueOrderStatusUpdate(customerEmail, orderData);
      }

    } catch (error) {
      console.error('Failed to queue status update email:', error);
    }
  }

  /**
   * Restore inventory for cancelled order
   * @param {string} orderId - Order ID
   */
  async restoreInventoryForOrder(orderId) {
    try {
      const itemsQuery = `
        SELECT product_id, variant_id, quantity
        FROM order_items
        WHERE order_id = ?
      `;
      
      const itemsResult = await DatabaseUtil.executeQuery(itemsQuery, [orderId]);
      
      if (itemsResult.success && itemsResult.data.length > 0) {
        for (const item of itemsResult.data) {
          // Restore inventory
          const updateQuery = `
            UPDATE inventory 
            SET quantity_available = quantity_available + ?,
                quantity_sold = quantity_sold - ?
            WHERE product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))
          `;
          
          await DatabaseUtil.executeQuery(updateQuery, [
            item.quantity, 
            item.quantity, 
            item.product_id, 
            item.variant_id, 
            item.variant_id
          ]);
        }
      }
    } catch (error) {
      console.error('Failed to restore inventory:', error);
    }
  }
}

module.exports = OrderService;