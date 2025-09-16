const DatabaseUtil = require('../utils/database');

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
   * Reserve stock for checkout
   * @param {Array} items - Items to reserve [{product_id, variant_id, quantity}]
   * @param {string} cartId - Cart ID
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object>} Reservation result
   */
  static async reserveStock(items, cartId, userId = null) {
    try {
      const reservations = [];
      
      for (const item of items) {
        const { product_id, variant_id, quantity } = item;
        
        // Check available stock
        const stockQuery = `
          SELECT quantity_available, quantity_reserved 
          FROM inventory 
          WHERE product_id = ? AND variant_id ${variant_id ? '= ?' : 'IS NULL'}
        `;
        const stockParams = variant_id ? [product_id, variant_id] : [product_id];
        
        const stockResult = await DatabaseUtil.executeQuery(stockQuery, stockParams);
        if (!stockResult.success || stockResult.data.length === 0) {
          throw new Error(`Inventory not found for product ${product_id}`);
        }
        
        const inventory = stockResult.data[0];
        if (inventory.quantity_available < quantity) {
          throw new Error(`Insufficient stock for product ${product_id}. Available: ${inventory.quantity_available}, Requested: ${quantity}`);
        }
        
        // Create reservation
        const reservationIdResult = await DatabaseUtil.executeQuery('SELECT get_next_id("STOCK") as id');
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
          throw new Error(`Failed to create reservation for product ${product_id}`);
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
          throw new Error(`Failed to update reserved quantity for product ${product_id}`);
        }
        
        reservations.push({
          reservation_id: reservationId,
          product_id,
          variant_id,
          quantity,
          expires_at: expiresAt
        });
      }
      
      return {
        success: true,
        data: reservations
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
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
   * Log inventory movement
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
}

module.exports = InventoryService;