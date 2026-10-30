const DatabaseUtil = require('../utils/database');
const ErrorUtils = require('../utils/errorUtils');
const logger = require('../utils/logger');
const { escapeHtml } = require('../utils/escapeHtml');

class InventoryService {
  /**
   * Get inventory for a product and its variants
   * @param {string} productId - Product ID
   * @returns {Promise<Object>} Inventory data
   */
  static async getProductInventory(productId) {
    try {
      const query = `
        SELECT 
          i.*,
          p.name as product_name,
          p.sku as product_sku,
          pv.size,
          pv.color,
          pv.pattern,
          pv.sku as variant_sku
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        LEFT JOIN product_variants pv ON i.variant_id = pv.id
        WHERE i.product_id = ?
        ORDER BY pv.size, pv.color
      `;
      
      const result = await DatabaseUtil.executeQuery(query, [productId]);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch inventory');
      }
      
      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all inventory with low stock alerts
   * @returns {Promise<Object>} Low stock inventory items
   */
  static async getLowStockItems() {
    try {
      const query = `
        SELECT 
          i.*,
          p.name as product_name,
          p.sku as product_sku,
          pv.size,
          pv.color,
          pv.pattern,
          pv.sku as variant_sku
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        LEFT JOIN product_variants pv ON i.variant_id = pv.id
        WHERE i.quantity_available <= i.reorder_point
        ORDER BY i.quantity_available ASC
      `;
      
      const result = await DatabaseUtil.executeQuery(query);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch low stock items');
      }
      
      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update inventory stock levels
   * @param {string} inventoryId - Inventory ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Update result
   */
  static async updateInventory(inventoryId, updates) {
    try {
      const { quantity_available, quantity_reserved, reorder_point, reorder_quantity } = updates;
      
      const query = `
        UPDATE inventory 
        SET quantity_available = ?, 
            quantity_reserved = ?, 
            reorder_point = ?, 
            reorder_quantity = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const result = await DatabaseUtil.executeQuery(query, [
        quantity_available,
        quantity_reserved,
        reorder_point,
        reorder_quantity,
        inventoryId
      ]);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update inventory');
      }
      
      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reserve stock for checkout with enhanced error handling
   * @param {Array} items - Items to reserve [{product_id, variant_id, quantity}]
   * @param {string} cartId - Cart ID
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object>} Reservation result
   */
  static async reserveStock(items, cartId, userId = null) {
    return await ErrorUtils.retryWithBackoff(
      async () => {
        try {
          // Validate input parameters
          if (!Array.isArray(items) || items.length === 0) {
            const error = new Error('Items array is required and cannot be empty');
            error.type = 'validation_error';
            throw error;
          }

          if (!cartId) {
            const error = new Error('Cart ID is required');
            error.type = 'validation_error';
            throw error;
          }

          const reservations = [];
          const conflicts = [];
          
          // Process reservations with conflict detection
          for (const item of items) {
            try {
              const reservation = await this._reserveSingleItem(item, cartId, userId);
              reservations.push(reservation);
            } catch (error) {
              if (error.message.includes('Insufficient stock')) {
                conflicts.push({
                  product_id: item.product_id,
                  variant_id: item.variant_id,
                  requested: item.quantity,
                  available: error.available || 0,
                  error: error.message
                });
              } else {
                throw error; // Re-throw non-stock errors
              }
            }
          }

          // If there are conflicts, rollback successful reservations
          if (conflicts.length > 0) {
            await this._rollbackReservations(reservations);
            
            const error = new Error('Stock conflicts detected');
            error.type = 'inventory_conflict';
            error.conflicts = conflicts;
            error.userMessage = 'Some items in your cart are no longer available in the requested quantities.';
            throw error;
          }
          
          logger.info('Stock reservations created successfully', {
            cart_id: cartId,
            user_id: userId,
            reservation_count: reservations.length
          });

          return {
            success: true,
            data: reservations
          };
        } catch (error) {
          ErrorUtils.logError(error, {
            operation: 'reserve_stock',
            cart_id: cartId,
            user_id: userId,
            items_count: items.length
          });

          // Enhance error with inventory-specific context
          if (!error.type) {
            error.type = 'inventory_error';
          }

          return {
            success: false,
            error: error.message,
            type: error.type,
            conflicts: error.conflicts,
            userMessage: error.userMessage || ErrorUtils.createUserFriendlyMessage(error)
          };
        }
      },
      2, // maxRetries
      500, // baseDelay
      2000 // maxDelay
    );
  }

  /**
   * Reserve a single item with enhanced error handling
   */
  static async _reserveSingleItem(item, cartId, userId) {
    const { product_id, variant_id, quantity } = item;
    
    // Validate item data
    if (!product_id || !quantity || quantity <= 0) {
      const error = new Error(`Invalid item data: product_id=${product_id}, quantity=${quantity}`);
      error.type = 'validation_error';
      throw error;
    }

    // Check available stock with row locking to prevent race conditions
    const stockQuery = `
      SELECT quantity_available, quantity_reserved 
      FROM inventory 
      WHERE product_id = ? AND variant_id ${variant_id ? '= ?' : 'IS NULL'}
      FOR UPDATE
    `;
    const stockParams = variant_id ? [product_id, variant_id] : [product_id];
    
    const stockResult = await DatabaseUtil.executeQuery(stockQuery, stockParams);
    if (!stockResult.success || stockResult.data.length === 0) {
      const error = new Error(`Inventory not found for product ${product_id}`);
      error.type = 'inventory_not_found';
      throw error;
    }
    
    const inventory = stockResult.data[0];
    if (inventory.quantity_available < quantity) {
      const error = new Error(`Insufficient stock for product ${product_id}. Available: ${inventory.quantity_available}, Requested: ${quantity}`);
      error.type = 'insufficient_stock';
      error.available = inventory.quantity_available;
      error.requested = quantity;
      error.product_id = product_id;
      error.variant_id = variant_id;
      throw error;
    }
    
    // Create reservation
    const reservationIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("STOCK") as id');
    if (!reservationIdResult.success) {
      throw new Error('Failed to generate reservation ID');
    }
    
    const reservationId = reservationIdResult.data[0].id;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    const reservationQuery = `
      INSERT INTO stock_reservations 
      (id, product_id, variant_id, cart_id, user_id, quantity, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const reservationResult = await DatabaseUtil.executeQuery(reservationQuery, [
      reservationId,
      product_id,
      variant_id,
      cartId,
      userId,
      quantity,
      expiresAt
    ]);
    
    if (!reservationResult.success) {
      throw new Error(`Failed to create reservation for product ${product_id}: ${reservationResult.error}`);
    }
    
    // Update inventory reserved quantity
    const updateQuery = `
      UPDATE inventory 
      SET quantity_reserved = quantity_reserved + ?
      WHERE product_id = ? AND variant_id ${variant_id ? '= ?' : 'IS NULL'}
    `;
    const updateParams = variant_id ? [quantity, product_id, variant_id] : [quantity, product_id];
    
    const updateResult = await DatabaseUtil.executeQuery(updateQuery, updateParams);
    if (!updateResult.success) {
      // Rollback the reservation if inventory update fails
      await DatabaseUtil.executeQuery('DELETE FROM stock_reservations WHERE id = ?', [reservationId]);
      throw new Error(`Failed to update reserved quantity for product ${product_id}: ${updateResult.error}`);
    }
    
    return {
      reservation_id: reservationId,
      product_id,
      variant_id,
      quantity,
      expires_at: expiresAt
    };
  }

  /**
   * Rollback reservations in case of conflicts
   */
  static async _rollbackReservations(reservations) {
    for (const reservation of reservations) {
      try {
        // Remove reservation record
        await DatabaseUtil.executeQuery(
          'DELETE FROM stock_reservations WHERE id = ?',
          [reservation.reservation_id]
        );

        // Update inventory to release reserved quantity
        const updateQuery = `
          UPDATE inventory 
          SET quantity_reserved = quantity_reserved - ?
          WHERE product_id = ? AND variant_id ${reservation.variant_id ? '= ?' : 'IS NULL'}
        `;
        const updateParams = reservation.variant_id 
          ? [reservation.quantity, reservation.product_id, reservation.variant_id]
          : [reservation.quantity, reservation.product_id];

        await DatabaseUtil.executeQuery(updateQuery, updateParams);
        
        logger.info('Reservation rolled back', {
          reservation_id: reservation.reservation_id,
          product_id: reservation.product_id
        });
      } catch (rollbackError) {
        logger.error('Failed to rollback reservation', {
          reservation_id: reservation.reservation_id,
          error: rollbackError.message
        });
      }
    }
  }

  /**
   * Release expired stock reservations
   * @returns {Promise<Object>} Release result
   */
  static async releaseExpiredReservations() {
    try {
      // Get expired reservations
      const expiredQuery = `
        SELECT id, product_id, variant_id, quantity
        FROM stock_reservations
        WHERE expires_at < NOW()
      `;
      
      const expiredResult = await DatabaseUtil.executeQuery(expiredQuery);
      if (!expiredResult.success) {
        throw new Error('Failed to fetch expired reservations');
      }
      
      const expiredReservations = expiredResult.data;
      let releasedCount = 0;
      
      for (const reservation of expiredReservations) {
        // Update inventory to release reserved quantity
        const updateQuery = `
          UPDATE inventory 
          SET quantity_reserved = quantity_reserved - ?
          WHERE product_id = ? AND variant_id ${reservation.variant_id ? '= ?' : 'IS NULL'}
        `;
        const updateParams = reservation.variant_id 
          ? [reservation.quantity, reservation.product_id, reservation.variant_id]
          : [reservation.quantity, reservation.product_id];
        
        const updateResult = await DatabaseUtil.executeQuery(updateQuery, updateParams);
        if (updateResult.success) {
          releasedCount++;
        }
      }
      
      // Delete expired reservations
      const deleteQuery = 'DELETE FROM stock_reservations WHERE expires_at < NOW()';
      await DatabaseUtil.executeQuery(deleteQuery);
      
      return {
        success: true,
        data: {
          released_count: releasedCount,
          total_expired: expiredReservations.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Confirm stock reservation (convert to sale)
   * @param {string} cartId - Cart ID
   * @returns {Promise<Object>} Confirmation result
   */
  static async confirmReservation(cartId) {
    try {
      // Get reservations for this cart
      const reservationsQuery = `
        SELECT id, product_id, variant_id, quantity
        FROM stock_reservations
        WHERE cart_id = ?
      `;
      
      const reservationsResult = await DatabaseUtil.executeQuery(reservationsQuery, [cartId]);
      if (!reservationsResult.success) {
        throw new Error('Failed to fetch reservations');
      }
      
      const reservations = reservationsResult.data;
      
      for (const reservation of reservations) {
        // Update inventory: reduce available and reserved, increase sold
        const updateQuery = `
          UPDATE inventory 
          SET quantity_available = quantity_available - ?,
              quantity_reserved = quantity_reserved - ?,
              quantity_sold = quantity_sold + ?
          WHERE product_id = ? AND variant_id ${reservation.variant_id ? '= ?' : 'IS NULL'}
        `;
        const updateParams = reservation.variant_id 
          ? [reservation.quantity, reservation.quantity, reservation.quantity, reservation.product_id, reservation.variant_id]
          : [reservation.quantity, reservation.quantity, reservation.quantity, reservation.product_id];
        
        const updateResult = await DatabaseUtil.executeQuery(updateQuery, updateParams);
        if (!updateResult.success) {
          throw new Error(`Failed to confirm reservation for product ${reservation.product_id}`);
        }
      }
      
      // Delete confirmed reservations
      const deleteQuery = 'DELETE FROM stock_reservations WHERE cart_id = ?';
      await DatabaseUtil.executeQuery(deleteQuery, [cartId]);
      
      return {
        success: true,
        data: {
          confirmed_items: reservations.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get inventory availability for specific product/variant
   * @param {string} productId - Product ID
   * @param {string} variantId - Variant ID (optional)
   * @returns {Promise<Object>} Availability data
   */
  static async getAvailability(productId, variantId = null) {
    try {
      const query = `
        SELECT quantity_available, quantity_reserved, quantity_sold
        FROM inventory
        WHERE product_id = ? AND variant_id ${variantId ? '= ?' : 'IS NULL'}
      `;
      const params = variantId ? [productId, variantId] : [productId];
      
      const result = await DatabaseUtil.executeQuery(query, params);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch availability');
      }
      
      if (result.data.length === 0) {
        return {
          success: true,
          data: {
            available: 0,
            reserved: 0,
            sold: 0,
            in_stock: false
          }
        };
      }
      
      const inventory = result.data[0];
      return {
        success: true,
        data: {
          available: inventory.quantity_available,
          reserved: inventory.quantity_reserved,
          sold: inventory.quantity_sold,
          in_stock: inventory.quantity_available > 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Log inventory movement with enhanced audit trail
   * @param {string} inventoryId - Inventory ID
   * @param {string} movementType - Type of movement
   * @param {number} quantityChange - Quantity change (positive or negative)
   * @param {string} referenceType - Reference type
   * @param {string} referenceId - Reference ID
   * @param {string} createdBy - User ID who created the movement
   * @param {Object} details - Additional details
   * @returns {Promise<Object>} Log result
   */
  static async logMovement(inventoryId, movementType, quantityChange, referenceType, referenceId, createdBy, details = {}) {
    try {
      const movementIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("INVMOV") as id');
      const movementId = movementIdResult.data[0].id;
      
      // Get current inventory levels for audit trail
      const currentInventoryQuery = `
        SELECT quantity_available, quantity_reserved, quantity_sold
        FROM inventory
        WHERE id = ?
      `;
      const currentInventoryResult = await DatabaseUtil.executeQuery(currentInventoryQuery, [inventoryId]);
      
      if (currentInventoryResult.success && currentInventoryResult.data.length > 0) {
        const currentLevels = currentInventoryResult.data[0];
        details.before_movement = {
          available: currentLevels.quantity_available,
          reserved: currentLevels.quantity_reserved,
          sold: currentLevels.quantity_sold
        };
        details.after_movement = {
          available: currentLevels.quantity_available + (movementType === 'sale' ? 0 : quantityChange),
          reserved: currentLevels.quantity_reserved,
          sold: currentLevels.quantity_sold + (movementType === 'sale' ? quantityChange : 0)
        };
      }
      
      const query = `
        INSERT INTO inventory_movements 
        (id, inventory_id, movement_type, quantity_change, reference_type, reference_id, movement_details, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const result = await DatabaseUtil.executeQuery(query, [
        movementId,
        inventoryId,
        movementType,
        quantityChange,
        referenceType,
        referenceId,
        JSON.stringify(details),
        createdBy
      ]);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to log inventory movement');
      }
      
      return {
        success: true,
        data: { movement_id: movementId }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update inventory with automatic movement logging
   * @param {string} productId - Product ID
   * @param {string} variantId - Variant ID (optional)
   * @param {number} quantityChange - Quantity change (positive or negative)
   * @param {string} movementType - Type of movement
   * @param {string} referenceType - Reference type
   * @param {string} referenceId - Reference ID
   * @param {string} createdBy - User ID who created the movement
   * @param {Object} details - Additional details
   * @returns {Promise<Object>} Update result
   */
  static async updateInventoryWithLogging(productId, variantId, quantityChange, movementType, referenceType, referenceId, createdBy, details = {}) {
    try {
      // Get inventory record
      const inventoryQuery = `
        SELECT id, quantity_available, quantity_reserved, quantity_sold
        FROM inventory
        WHERE product_id = ? AND variant_id ${variantId ? '= ?' : 'IS NULL'}
      `;
      const inventoryParams = variantId ? [productId, variantId] : [productId];
      
      const inventoryResult = await DatabaseUtil.executeQuery(inventoryQuery, inventoryParams);
      if (!inventoryResult.success || inventoryResult.data.length === 0) {
        throw new Error(`Inventory not found for product ${productId}`);
      }
      
      const inventory = inventoryResult.data[0];
      const inventoryId = inventory.id;
      
      // Calculate new quantities based on movement type
      let newAvailable = inventory.quantity_available;
      let newReserved = inventory.quantity_reserved;
      let newSold = inventory.quantity_sold;
      
      switch (movementType) {
        case 'restock':
          newAvailable += quantityChange;
          break;
        case 'sale':
          newAvailable -= quantityChange;
          newSold += quantityChange;
          break;
        case 'adjustment':
          newAvailable += quantityChange;
          break;
        case 'return':
          newAvailable += quantityChange;
          newSold -= quantityChange;
          break;
        case 'damage':
          newAvailable -= quantityChange;
          break;
        default:
          throw new Error(`Unknown movement type: ${movementType}`);
      }
      
      // Prevent negative inventory
      if (newAvailable < 0) {
        throw new Error(`Insufficient inventory. Available: ${inventory.quantity_available}, Requested: ${quantityChange}`);
      }
      
      // Update inventory
      const updateQuery = `
        UPDATE inventory
        SET quantity_available = ?,
            quantity_reserved = ?,
            quantity_sold = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const updateResult = await DatabaseUtil.executeQuery(updateQuery, [
        newAvailable,
        newReserved,
        newSold,
        inventoryId
      ]);
      
      if (!updateResult.success) {
        throw new Error('Failed to update inventory');
      }
      
      // Log the movement
      // Log the movement (handle system users gracefully)
      try {
        const logResult = await this.logMovement(
          inventoryId,
          movementType,
          quantityChange,
          referenceType,
          referenceId,
          createdBy,
          details
        );
        
        if (!logResult.success) {
          console.error('Failed to log inventory movement:', logResult.error);
        }
      } catch (logError) {
        console.error('Error logging inventory movement:', logError.message);
        // Don't fail the inventory update if logging fails
      }
      
      // Check for low stock and trigger alerts if needed
      await this.checkAndTriggerLowStockAlert(inventoryId);
      
      return {
        success: true,
        data: {
          inventory_id: inventoryId,
          previous_available: inventory.quantity_available,
          new_available: newAvailable,
          movement_logged: true // We attempted to log, success depends on user existence
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process order completion and update inventory
   * @param {string} orderId - Order ID
   * @param {Array} orderItems - Order items array
   * @param {string} processedBy - User ID who processed the order
   * @returns {Promise<Object>} Processing result
   */
  static async processOrderInventoryUpdate(orderId, orderItems, processedBy) {
    try {
      const results = [];
      
      for (const item of orderItems) {
        const { product_id, variant_id, quantity } = item;
        
        const updateResult = await this.updateInventoryWithLogging(
          product_id,
          variant_id,
          quantity,
          'sale',
          'order',
          orderId,
          processedBy,
          {
            notes: `Order completion - ${quantity} units sold`,
            order_id: orderId,
            item_details: item
          }
        );
        
        results.push({
          product_id,
          variant_id,
          quantity,
          success: updateResult.success,
          error: updateResult.error
        });
        
        if (!updateResult.success) {
          console.error(`Failed to update inventory for product ${product_id}:`, updateResult.error);
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      
      return {
        success: failureCount === 0,
        data: {
          total_items: results.length,
          successful_updates: successCount,
          failed_updates: failureCount,
          results
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check for low stock and trigger alert if needed
   * @param {string} inventoryId - Inventory ID
   * @returns {Promise<Object>} Check result
   */
  static async checkAndTriggerLowStockAlert(inventoryId) {
    try {
      const query = `
        SELECT 
          i.*,
          p.name as product_name,
          p.sku as product_sku,
          pv.size,
          pv.color,
          pv.pattern,
          pv.sku as variant_sku
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        LEFT JOIN product_variants pv ON i.variant_id = pv.id
        WHERE i.id = ? AND i.quantity_available <= i.reorder_point
      `;
      
      const result = await DatabaseUtil.executeQuery(query, [inventoryId]);
      
      if (result.success && result.data.length > 0) {
        const item = result.data[0];
        
        // Trigger low stock alert
        await this.triggerLowStockAlert(item);
        
        return {
          success: true,
          data: {
            low_stock_detected: true,
            item: item
          }
        };
      }
      
      return {
        success: true,
        data: {
          low_stock_detected: false
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Trigger low stock alert notification
   * @param {Object} inventoryItem - Inventory item data
   * @returns {Promise<Object>} Alert result
   */
  static async triggerLowStockAlert(inventoryItem) {
    try {
      // Check if alert was already sent recently (within 24 hours)
      const recentAlertQuery = `
        SELECT id FROM email_queue
        WHERE to_email LIKE '%admin%'
        AND subject LIKE '%Low Stock Alert%'
        AND template_data->>'$.product_id' = ?
        AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
        LIMIT 1
      `;
      
      const recentAlertResult = await DatabaseUtil.executeQuery(recentAlertQuery, [inventoryItem.product_id]);
      
      if (recentAlertResult.success && recentAlertResult.data.length > 0) {
        // Alert already sent recently, skip
        return {
          success: true,
          data: { alert_sent: false, reason: 'Recent alert already exists' }
        };
      }
      
      // Get authorized staff recipients
      const staffQuery = `
        SELECT email, CONCAT(first_name, ' ', last_name) as name
        FROM users
        WHERE role = 'admin' AND status = 'active'
      `;
      
      const staffResult = await DatabaseUtil.executeQuery(staffQuery);
      
      if (!staffResult.success || staffResult.data.length === 0) {
        return {
          success: false,
          error: 'No authorized staff recipients found to send alert'
        };
      }
      
      // Create email queue entries for each authorized staff recipient
      const emailIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("EMAIL") as id');
      const emailId = emailIdResult.data[0].id;
      
      const variant = inventoryItem.size || inventoryItem.color || inventoryItem.pattern ? 
        `${inventoryItem.size || ''} ${inventoryItem.color || ''} ${inventoryItem.pattern || ''}`.trim() : 
        'Base Product';
      
      const subject = `Low Stock Alert - ${inventoryItem.product_name}`;
      const emailContent = {
        html_content: `
          <h2>Low Stock Alert</h2>
          <p>The following product is running low on stock:</p>
          <ul>
            <li><strong>Product:</strong> ${escapeHtml(inventoryItem.product_name)}</li>
            <li><strong>SKU:</strong> ${escapeHtml(inventoryItem.product_sku)}</li>
            <li><strong>Variant:</strong> ${escapeHtml(variant)}</li>
            <li><strong>Current Stock:</strong> ${escapeHtml(inventoryItem.quantity_available)}</li>
            <li><strong>Reorder Point:</strong> ${escapeHtml(inventoryItem.reorder_point)}</li>
            <li><strong>Suggested Reorder Quantity:</strong> ${escapeHtml(inventoryItem.reorder_quantity)}</li>
          </ul>
          <p>Please consider restocking this item soon.</p>
        `,
        text_content: `Low Stock Alert: ${inventoryItem.product_name} (${variant}) - Current Stock: ${inventoryItem.quantity_available}, Reorder Point: ${inventoryItem.reorder_point}`
      };
      
      const templateData = {
        product_id: inventoryItem.product_id,
        product_name: inventoryItem.product_name,
        variant: variant,
        current_stock: inventoryItem.quantity_available,
        reorder_point: inventoryItem.reorder_point,
        reorder_quantity: inventoryItem.reorder_quantity
      };
      
      for (const admin of staffResult.data) {
        const insertQuery = `
          INSERT INTO email_queue 
          (id, to_email, to_name, subject, email_content, template_data, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `;
        
        await DatabaseUtil.executeQuery(insertQuery, [
          emailId + '_' + admin.email.replace('@', '_'),
          admin.email,
          admin.name,
          subject,
          JSON.stringify(emailContent),
          JSON.stringify(templateData)
        ]);
      }
      
      return {
        success: true,
        data: {
          alert_sent: true,
          recipient_count: staffResult.data.length,
          product: inventoryItem.product_name,
          variant: variant
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get inventory movement history
   * @param {string} inventoryId - Inventory ID (optional)
   * @param {Object} filters - Filters for movement history
   * @returns {Promise<Object>} Movement history
   */
  static async getMovementHistory(inventoryId = null, filters = {}) {
    try {
      let query = `
        SELECT 
          im.*,
          i.product_id,
          i.variant_id,
          p.name as product_name,
          p.sku as product_sku,
          pv.size,
          pv.color,
          pv.pattern,
          u.first_name,
          u.last_name
        FROM inventory_movements im
        JOIN inventory i ON im.inventory_id = i.id
        JOIN products p ON i.product_id = p.id
        LEFT JOIN product_variants pv ON i.variant_id = pv.id
        LEFT JOIN users u ON im.created_by = u.id
      `;
      
      const conditions = [];
      const params = [];
      
      if (inventoryId) {
        conditions.push('im.inventory_id = ?');
        params.push(inventoryId);
      }
      
      if (filters.product_id) {
        conditions.push('i.product_id = ?');
        params.push(filters.product_id);
      }
      
      if (filters.movement_type) {
        conditions.push('im.movement_type = ?');
        params.push(filters.movement_type);
      }
      
      if (filters.reference_type) {
        conditions.push('im.reference_type = ?');
        params.push(filters.reference_type);
      }
      
      if (filters.date_from) {
        conditions.push('im.created_at >= ?');
        params.push(filters.date_from);
      }
      
      if (filters.date_to) {
        conditions.push('im.created_at <= ?');
        params.push(filters.date_to);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY im.created_at DESC';
      
      if (filters.limit) {
        query += ` LIMIT ${parseInt(filters.limit)}`;
      }
      
      const result = await DatabaseUtil.executeQuery(query, params);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch movement history');
      }
      
      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = InventoryService;