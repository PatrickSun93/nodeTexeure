const db = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const fedexService = require('./fedexService');

class ShippingService {
  /**
   * Calculate shipping cost based on address, items, and weight
   * @param {Object} address - Shipping address with country, state, city, postal_code
   * @param {Array} items - Array of cart items with product details
   * @param {number} totalWeight - Total weight in kg
   * @returns {Promise<Object>} - Shipping calculation result
   */
  async calculateShipping(address, items, totalWeight) {
    try {
      // Find shipping zone for the address
      const zone = await this.findShippingZone(address.country);
      if (!zone) {
        throw new Error(`No shipping zone found for country: ${address.country}`);
      }

      // Get available shipping rates for the zone and weight
      const rates = await this.getShippingRates(zone.id, totalWeight);
      if (!rates || rates.length === 0) {
        throw new Error(`No shipping rates available for zone: ${zone.name}, weight: ${totalWeight}kg`);
      }

      // Calculate shipping cost for each available rate
      const shippingOptions = rates.map(rate => {
        const baseCost = parseFloat(rate.base_rate);
        const weightCost = parseFloat(rate.per_kg_rate) * totalWeight;
        const totalCost = baseCost + weightCost;

        return {
          id: rate.id,
          name: rate.name,
          cost: totalCost,
          estimatedDays: {
            min: rate.estimated_days_min,
            max: rate.estimated_days_max
          },
          zone: zone.name
        };
      });

      return {
        success: true,
        zone: zone.name,
        totalWeight,
        options: shippingOptions
      };
    } catch (error) {
      console.error('Error calculating shipping:', error);
      throw error;
    }
  }

  /**
   * Find shipping zone by country code
   * @param {string} countryCode - ISO country code (e.g., 'US', 'CA')
   * @returns {Promise<Object|null>} - Shipping zone or null
   */
  async findShippingZone(countryCode) {
    try {
      const query = `
        SELECT id, name, countries, is_active
        FROM shipping_zones 
        WHERE is_active = TRUE
        AND JSON_CONTAINS(countries, JSON_QUOTE(?))
      `;
      
      const result = await db.executeQuery(query, [countryCode]);
      if (result.success && result.data.length > 0) {
        return result.data[0];
      }
      return null;
    } catch (error) {
      console.error('Error finding shipping zone:', error);
      throw error;
    }
  }

  /**
   * Get shipping rates for a zone and weight
   * @param {string} zoneId - Shipping zone ID
   * @param {number} weight - Total weight in kg
   * @returns {Promise<Array>} - Array of shipping rates
   */
  async getShippingRates(zoneId, weight) {
    try {
      const query = `
        SELECT id, name, min_weight, max_weight, base_rate, per_kg_rate, 
               min_order_amount, estimated_days_min, estimated_days_max
        FROM shipping_rates 
        WHERE zone_id = ? 
        AND is_active = TRUE
        AND min_weight <= ?
        AND (max_weight IS NULL OR max_weight >= ?)
        ORDER BY base_rate ASC
      `;
      
      const result = await db.executeQuery(query, [zoneId, weight, weight]);
      return result.success ? result.data : [];
    } catch (error) {
      console.error('Error getting shipping rates:', error);
      throw error;
    }
  }

  /**
   * Check if order qualifies for free shipping
   * @param {number} orderAmount - Order subtotal
   * @param {string} zoneId - Shipping zone ID
   * @returns {Promise<boolean>} - True if qualifies for free shipping
   */
  async checkFreeShipping(orderAmount, zoneId) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM shipping_rates 
        WHERE zone_id = ? 
        AND is_active = TRUE
        AND min_order_amount > 0
        AND min_order_amount <= ?
      `;
      
      const result = await db.executeQuery(query, [zoneId, orderAmount]);
      return result.success && result.data[0].count > 0;
    } catch (error) {
      console.error('Error checking free shipping:', error);
      return false;
    }
  }

  /**
   * Get all shipping zones (admin function)
   * @returns {Promise<Array>} - Array of shipping zones
   */
  async getAllShippingZones() {
    try {
      const query = `
        SELECT id, name, countries, is_active, created_at, updated_at
        FROM shipping_zones 
        ORDER BY name ASC
      `;
      
      const result = await db.executeQuery(query);
      if (result.success) {
        return result.data.map(zone => ({
          ...zone,
          countries: Array.isArray(zone.countries) ? zone.countries : JSON.parse(zone.countries)
        }));
      }
      return [];
    } catch (error) {
      console.error('Error getting shipping zones:', error);
      throw error;
    }
  }

  /**
   * Create new shipping zone (admin function)
   * @param {Object} zoneData - Zone data with name, countries array
   * @returns {Promise<Object>} - Created zone
   */
  async createShippingZone(zoneData) {
    try {
      const zoneId = await this.getNextId('SHIP');
      const query = `
        INSERT INTO shipping_zones (id, name, countries, is_active)
        VALUES (?, ?, ?, ?)
      `;
      
      const result = await db.executeQuery(query, [
        zoneId,
        zoneData.name,
        JSON.stringify(zoneData.countries),
        zoneData.is_active !== undefined ? zoneData.is_active : true
      ]);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        id: zoneId,
        name: zoneData.name,
        countries: zoneData.countries,
        is_active: zoneData.is_active !== undefined ? zoneData.is_active : true
      };
    } catch (error) {
      console.error('Error creating shipping zone:', error);
      throw error;
    }
  }

  /**
   * Update shipping zone (admin function)
   * @param {string} zoneId - Zone ID to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} - Updated zone
   */
  async updateShippingZone(zoneId, updateData) {
    try {
      const updates = [];
      const values = [];

      if (updateData.name) {
        updates.push('name = ?');
        values.push(updateData.name);
      }
      if (updateData.countries) {
        updates.push('countries = ?');
        values.push(JSON.stringify(updateData.countries));
      }
      if (updateData.is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(updateData.is_active);
      }

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(zoneId);
      const query = `
        UPDATE shipping_zones 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const updateResult = await db.executeQuery(query, values);
      if (!updateResult.success) {
        throw new Error(updateResult.error);
      }
      
      // Return updated zone
      const selectResult = await db.executeQuery('SELECT * FROM shipping_zones WHERE id = ?', [zoneId]);
      if (!selectResult.success || selectResult.data.length === 0) {
        throw new Error('Zone not found after update');
      }

      const zone = selectResult.data[0];
      return {
        ...zone,
        countries: Array.isArray(zone.countries) ? zone.countries : JSON.parse(zone.countries)
      };
    } catch (error) {
      console.error('Error updating shipping zone:', error);
      throw error;
    }
  }

  /**
   * Get shipping rates for a zone (admin function)
   * @param {string} zoneId - Zone ID
   * @returns {Promise<Array>} - Array of shipping rates
   */
  async getZoneRates(zoneId) {
    try {
      const query = `
        SELECT sr.*, sz.name as zone_name
        FROM shipping_rates sr
        JOIN shipping_zones sz ON sr.zone_id = sz.id
        WHERE sr.zone_id = ?
        ORDER BY sr.min_weight ASC, sr.base_rate ASC
      `;
      
      const result = await db.executeQuery(query, [zoneId]);
      return result.success ? result.data : [];
    } catch (error) {
      console.error('Error getting zone rates:', error);
      throw error;
    }
  }

  /**
   * Create shipping rate (admin function)
   * @param {Object} rateData - Rate data
   * @returns {Promise<Object>} - Created rate
   */
  async createShippingRate(rateData) {
    try {
      const rateId = await this.getNextId('SHIP');
      const query = `
        INSERT INTO shipping_rates (
          id, zone_id, name, min_weight, max_weight, base_rate, per_kg_rate,
          min_order_amount, estimated_days_min, estimated_days_max, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const result = await db.executeQuery(query, [
        rateId,
        rateData.zone_id,
        rateData.name,
        rateData.min_weight || 0,
        rateData.max_weight || null,
        rateData.base_rate,
        rateData.per_kg_rate || 0,
        rateData.min_order_amount || 0,
        rateData.estimated_days_min || null,
        rateData.estimated_days_max || null,
        rateData.is_active !== undefined ? rateData.is_active : true
      ]);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        id: rateId,
        ...rateData
      };
    } catch (error) {
      console.error('Error creating shipping rate:', error);
      throw error;
    }
  }

  /**
   * Update shipping rate (admin function)
   * @param {string} rateId - Rate ID to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} - Updated rate
   */
  async updateShippingRate(rateId, updateData) {
    try {
      const updates = [];
      const values = [];

      const allowedFields = [
        'name', 'min_weight', 'max_weight', 'base_rate', 'per_kg_rate',
        'min_order_amount', 'estimated_days_min', 'estimated_days_max', 'is_active'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(updateData[field]);
        }
      });

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(rateId);
      const query = `
        UPDATE shipping_rates 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const updateResult = await db.executeQuery(query, values);
      if (!updateResult.success) {
        throw new Error(updateResult.error);
      }
      
      // Return updated rate
      const selectResult = await db.executeQuery('SELECT * FROM shipping_rates WHERE id = ?', [rateId]);
      if (!selectResult.success || selectResult.data.length === 0) {
        throw new Error('Rate not found after update');
      }

      return selectResult.data[0];
    } catch (error) {
      console.error('Error updating shipping rate:', error);
      throw error;
    }
  }

  /**
   * Delete shipping rate (admin function)
   * @param {string} rateId - Rate ID to delete
   * @returns {Promise<boolean>} - Success status
   */
  async deleteShippingRate(rateId) {
    try {
      const query = 'DELETE FROM shipping_rates WHERE id = ?';
      const result = await db.executeQuery(query, [rateId]);
      return result.success && result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting shipping rate:', error);
      throw error;
    }
  }

  /**
   * Calculate total weight from cart items
   * @param {Array} items - Array of cart items
   * @returns {Promise<number>} - Total weight in kg
   */
  async calculateTotalWeight(items) {
    try {
      let totalWeight = 0;

      for (const item of items) {
        // Get product weight from database
        const query = `
          SELECT p.product_details, pv.weight_adjustment
          FROM products p
          LEFT JOIN product_variants pv ON pv.id = ?
          WHERE p.id = ?
        `;
        
        const result = await db.executeQuery(query, [item.variant_id, item.product_id]);
        if (result.success && result.data.length > 0) {
          const productDetails = result.data[0].product_details;
          const baseWeight = parseFloat(productDetails.weight || 0);
          const weightAdjustment = parseFloat(result.data[0].weight_adjustment || 0);
          const itemWeight = (baseWeight + weightAdjustment) * item.quantity;
          totalWeight += itemWeight;
        }
      }

      return totalWeight;
    } catch (error) {
      console.error('Error calculating total weight:', error);
      throw error;
    }
  }

  /**
   * Get FedEx shipping rates for comparison
   * @param {Object} address - Shipping address
   * @param {Array} items - Cart items
   * @param {number} totalWeight - Total weight in kg
   * @returns {Promise<Array>} - Array of FedEx shipping options
   */
  async getFedExRates(address, items, totalWeight) {
    try {
      // Convert weight from kg to pounds for FedEx API
      const weightInPounds = totalWeight * 2.20462;
      
      // Calculate package dimensions (simplified - could be enhanced)
      const dimensions = this.calculatePackageDimensions(items);
      
      const shipmentDetails = {
        origin: {
          postalCode: process.env.COMPANY_POSTAL_CODE || '12345',
          countryCode: process.env.COMPANY_COUNTRY_CODE || 'US',
          stateCode: process.env.COMPANY_STATE_CODE || 'NY'
        },
        destination: {
          postalCode: address.postal_code,
          countryCode: address.country,
          stateCode: address.state,
          city: address.city
        },
        weight: weightInPounds,
        dimensions: dimensions
      };

      const fedexRates = await fedexService.getRates(shipmentDetails);
      
      return fedexRates.map(rate => ({
        id: `fedex_${rate.serviceType.toLowerCase()}`,
        name: `FedEx ${rate.serviceName}`,
        cost: rate.totalNetCharge,
        estimatedDays: {
          min: rate.transitTime ? parseInt(rate.transitTime) : null,
          max: rate.transitTime ? parseInt(rate.transitTime) : null
        },
        zone: 'FedEx',
        serviceType: rate.serviceType,
        deliveryDate: rate.deliveryDate,
        carrier: 'FedEx'
      }));
    } catch (error) {
      console.error('Error getting FedEx rates:', error);
      // Return empty array if FedEx rates fail - don't break the entire shipping calculation
      return [];
    }
  }

  /**
   * Calculate package dimensions based on items
   * @param {Array} items - Cart items
   * @returns {Object} - Package dimensions in inches
   */
  calculatePackageDimensions(items) {
    // Simplified calculation - in production, this would be more sophisticated
    // based on actual product dimensions and packing algorithms
    let totalVolume = 0;
    
    items.forEach(item => {
      // Assume average bedding dimensions if not specified
      const itemVolume = 12 * 8 * 6; // inches cubed
      totalVolume += itemVolume * item.quantity;
    });
    
    // Calculate box dimensions from volume (cube root approximation)
    const sideLength = Math.cbrt(totalVolume);
    
    return {
      length: Math.max(12, Math.ceil(sideLength)),
      width: Math.max(8, Math.ceil(sideLength * 0.8)),
      height: Math.max(6, Math.ceil(sideLength * 0.6))
    };
  }

  /**
   * Enhanced shipping calculation that includes FedEx rates
   * @param {Object} address - Shipping address
   * @param {Array} items - Array of cart items
   * @param {number} totalWeight - Total weight in kg
   * @param {boolean} includeFedEx - Whether to include FedEx rates
   * @returns {Promise<Object>} - Enhanced shipping calculation result
   */
  async calculateShippingWithFedEx(address, items, totalWeight, includeFedEx = true) {
    try {
      // Get standard shipping rates
      const standardRates = await this.calculateShipping(address, items, totalWeight);
      
      if (!includeFedEx) {
        return standardRates;
      }

      // Get FedEx rates
      const fedexRates = await this.getFedExRates(address, items, totalWeight);
      
      // Combine all shipping options
      const allOptions = [...standardRates.options, ...fedexRates];
      
      // Sort by cost
      allOptions.sort((a, b) => a.cost - b.cost);

      return {
        success: true,
        zone: standardRates.zone,
        totalWeight,
        options: allOptions,
        fedexAvailable: fedexRates.length > 0
      };
    } catch (error) {
      console.error('Error calculating shipping with FedEx:', error);
      // Fall back to standard shipping if FedEx integration fails
      return await this.calculateShipping(address, items, totalWeight);
    }
  }

  /**
   * Create FedEx shipment for an order
   * @param {string} orderId - Order ID
   * @param {Object} shippingData - Shipping data including service type
   * @returns {Promise<Object>} - Shipment creation result
   */
  async createFedExShipment(orderId, shippingData) {
    try {
      // Get order details
      const orderQuery = `
        SELECT o.*, 
               JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_json, '$.first_name')) as ship_first_name,
               JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_json, '$.last_name')) as ship_last_name,
               JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_json, '$.phone')) as ship_phone,
               JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_json, '$.address_line_1')) as ship_address1,
               JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_json, '$.address_line_2')) as ship_address2,
               JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_json, '$.city')) as ship_city,
               JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_json, '$.state')) as ship_state,
               JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_json, '$.postal_code')) as ship_postal,
               JSON_UNQUOTE(JSON_EXTRACT(o.shipping_address_json, '$.country')) as ship_country
        FROM orders o 
        WHERE o.id = ?
      `;
      
      const orderResult = await db.executeQuery(orderQuery, [orderId]);
      if (!orderResult.success || orderResult.data.length === 0) {
        throw new Error('Order not found');
      }
      
      const order = orderResult.data[0];
      
      // Calculate total weight for the order
      const itemsQuery = `
        SELECT oi.*, p.product_details, pv.weight_adjustment
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        LEFT JOIN product_variants pv ON oi.variant_id = pv.id
        WHERE oi.order_id = ?
      `;
      
      const itemsResult = await db.executeQuery(itemsQuery, [orderId]);
      if (!itemsResult.success) {
        throw new Error('Failed to get order items');
      }
      
      let totalWeight = 0;
      itemsResult.data.forEach(item => {
        const productDetails = JSON.parse(item.product_details || '{}');
        const baseWeight = parseFloat(productDetails.weight || 1);
        const weightAdjustment = parseFloat(item.weight_adjustment || 0);
        totalWeight += (baseWeight + weightAdjustment) * item.quantity;
      });
      
      // Convert weight from kg to pounds
      const weightInPounds = totalWeight * 2.20462;
      
      // Calculate dimensions
      const dimensions = this.calculatePackageDimensions(itemsResult.data);
      
      const shipmentData = {
        shipper: {
          name: process.env.COMPANY_NAME || 'Bed Texture Store',
          company: process.env.COMPANY_NAME || 'Bed Texture Store',
          phone: process.env.COMPANY_PHONE || '555-123-4567',
          address1: process.env.COMPANY_ADDRESS || '123 Main St',
          address2: process.env.COMPANY_ADDRESS2 || '',
          city: process.env.COMPANY_CITY || 'New York',
          state: process.env.COMPANY_STATE || 'NY',
          postalCode: process.env.COMPANY_POSTAL_CODE || '12345',
          countryCode: process.env.COMPANY_COUNTRY_CODE || 'US'
        },
        recipient: {
          firstName: order.ship_first_name,
          lastName: order.ship_last_name,
          phone: order.ship_phone,
          address1: order.ship_address1,
          address2: order.ship_address2 || '',
          city: order.ship_city,
          state: order.ship_state,
          postalCode: order.ship_postal,
          countryCode: order.ship_country
        },
        serviceType: shippingData.serviceType || 'FEDEX_GROUND',
        weight: weightInPounds,
        dimensions: dimensions,
        declaredValue: parseFloat(order.total_amount)
      };
      
      return await fedexService.createShipment(orderId, shipmentData);
    } catch (error) {
      console.error('Error creating FedEx shipment:', error);
      throw error;
    }
  }

  /**
   * Track FedEx shipment
   * @param {string} trackingNumber - FedEx tracking number
   * @returns {Promise<Object>} - Tracking information
   */
  async trackFedExShipment(trackingNumber) {
    try {
      return await fedexService.trackShipment(trackingNumber);
    } catch (error) {
      console.error('Error tracking FedEx shipment:', error);
      throw error;
    }
  }

  /**
   * Get shipment details by order ID
   * @param {string} orderId - Order ID
   * @returns {Promise<Object|null>} - Shipment details
   */
  async getShipmentDetails(orderId) {
    try {
      return await fedexService.getShipmentByOrderId(orderId);
    } catch (error) {
      console.error('Error getting shipment details:', error);
      throw error;
    }
  }

  /**
   * Get tracking events for a tracking number
   * @param {string} trackingNumber - Tracking number
   * @returns {Promise<Array>} - Array of tracking events
   */
  async getTrackingEvents(trackingNumber) {
    try {
      return await fedexService.getTrackingEvents(trackingNumber);
    } catch (error) {
      console.error('Error getting tracking events:', error);
      throw error;
    }
  }

  /**
   * Get next ID using the transno system
   * @param {string} prefix - ID prefix
   * @returns {Promise<string>} - Next ID
   */
  async getNextId(prefix) {
    try {
      const result = await db.executeQuery('SELECT get_next_id(?) as next_id', [prefix]);
      if (result.success && result.data.length > 0) {
        return result.data[0].next_id;
      }
      throw new Error('Failed to get next ID');
    } catch (error) {
      console.error('Error getting next ID:', error);
      throw error;
    }
  }
}

module.exports = new ShippingService();