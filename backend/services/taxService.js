const DatabaseUtil = require('../utils/database');
const logger = require('../utils/logger');

class TaxService {
  /**
   * Calculate tax amount based on customer address and order details
   * @param {Object} address - Customer address object
   * @param {Array} items - Array of order items
   * @param {number} subtotal - Order subtotal
   * @returns {Object} Tax calculation result
   */
  async calculateTax(address, items, subtotal) {
    try {
      logger.info('Calculating tax for address:', { 
        country: address.country, 
        state: address.state, 
        city: address.city,
        subtotal 
      });

      // Get applicable tax rates for the address
      const taxRates = await this.getTaxRates(address);
      
      if (!taxRates || taxRates.length === 0) {
        logger.info('No tax rates found for address', address);
        return {
          taxAmount: 0,
          taxRate: 0,
          taxDetails: [],
          breakdown: []
        };
      }

      let totalTaxAmount = 0;
      const taxDetails = [];
      const breakdown = [];

      // Calculate tax for each applicable rate
      for (const taxRate of taxRates) {
        const taxAmount = subtotal * taxRate.tax_rate;
        totalTaxAmount += taxAmount;
        
        const taxDetail = {
          taxName: taxRate.tax_name,
          taxRate: taxRate.tax_rate,
          taxAmount: taxAmount,
          location: taxRate.location_json
        };
        
        taxDetails.push(taxDetail);
        breakdown.push({
          name: taxRate.tax_name,
          rate: (taxRate.tax_rate * 100).toFixed(2) + '%',
          amount: taxAmount.toFixed(2)
        });
      }

      const result = {
        taxAmount: Math.round(totalTaxAmount * 100) / 100, // Round to 2 decimal places
        taxRate: taxRates.reduce((sum, rate) => sum + rate.tax_rate, 0),
        taxDetails,
        breakdown
      };

      logger.info('Tax calculation completed:', result);
      return result;

    } catch (error) {
      logger.error('Error calculating tax:', error);
      throw new Error('Failed to calculate tax: ' + error.message);
    }
  }

  /**
   * Get applicable tax rates for a given address
   * @param {Object} address - Customer address
   * @returns {Array} Array of applicable tax rates
   */
  async getTaxRates(address) {
    try {
      const { country, state, city, postal_code } = address;
      
      // Build query to find matching tax rates
      // Priority: exact match > state match > country match
      const query = `
        SELECT id, location_json, tax_name, tax_rate, is_active
        FROM tax_rates 
        WHERE is_active = true
        AND (
          (JSON_EXTRACT(location_json, '$.country') = ? 
           AND JSON_EXTRACT(location_json, '$.state') = ?
           AND JSON_EXTRACT(location_json, '$.city') = ?)
          OR
          (JSON_EXTRACT(location_json, '$.country') = ? 
           AND JSON_EXTRACT(location_json, '$.state') = ?
           AND JSON_EXTRACT(location_json, '$.city') IS NULL)
          OR
          (JSON_EXTRACT(location_json, '$.country') = ? 
           AND JSON_EXTRACT(location_json, '$.state') IS NULL
           AND JSON_EXTRACT(location_json, '$.city') IS NULL)
        )
        ORDER BY 
          CASE 
            WHEN JSON_EXTRACT(location_json, '$.city') IS NOT NULL THEN 1
            WHEN JSON_EXTRACT(location_json, '$.state') IS NOT NULL THEN 2
            ELSE 3
          END
      `;

      const params = [
        country, state, city,  // Exact match
        country, state,        // State match
        country               // Country match
      ];

      const result = await DatabaseUtil.executeQuery(query, params);
      const taxRates = result.success ? result.data : [];
      
      logger.info(`Found ${taxRates.length} tax rates for address`, { country, state, city });
      return taxRates;

    } catch (error) {
      logger.error('Error getting tax rates:', error);
      throw new Error('Failed to get tax rates: ' + error.message);
    }
  }

  /**
   * Get all tax rates with optional filtering
   * @param {Object} filters - Optional filters
   * @returns {Array} Array of tax rates
   */
  async getAllTaxRates(filters = {}) {
    try {
      let query = 'SELECT * FROM tax_rates';
      const params = [];
      const conditions = [];

      if (filters.country) {
        conditions.push("JSON_EXTRACT(location_json, '$.country') = ?");
        params.push(filters.country);
      }

      if (filters.state) {
        conditions.push("JSON_EXTRACT(location_json, '$.state') = ?");
        params.push(filters.state);
      }

      if (filters.isActive !== undefined) {
        conditions.push('is_active = ?');
        params.push(filters.isActive);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY location_json, tax_name';

      const result = await DatabaseUtil.executeQuery(query, params);
      return result.success ? result.data : [];

    } catch (error) {
      logger.error('Error getting all tax rates:', error);
      throw new Error('Failed to get tax rates: ' + error.message);
    }
  }

  /**
   * Create a new tax rate
   * @param {Object} taxRateData - Tax rate data
   * @returns {Object} Created tax rate
   */
  async createTaxRate(taxRateData) {
    try {
      const { location, tax_name, tax_rate, is_active = true } = taxRateData;
      
      // Validate required fields
      if (!location || !tax_name || tax_rate === undefined) {
        throw new Error('Missing required fields: location, tax_name, tax_rate');
      }

      // Validate tax rate is between 0 and 1
      if (tax_rate < 0 || tax_rate > 1) {
        throw new Error('Tax rate must be between 0 and 1 (e.g., 0.08 for 8%)');
      }

      // Generate ID using database function
      const idResult = await DatabaseUtil.executeQuery("SELECT get_next_id('TAX') as id");
      if (!idResult.success || !idResult.data.length) {
        throw new Error('Failed to generate tax rate ID');
      }
      const id = idResult.data[0].id;

      const query = `
        INSERT INTO tax_rates (id, location_json, tax_name, tax_rate, is_active)
        VALUES (?, ?, ?, ?, ?)
      `;

      const insertResult = await DatabaseUtil.executeQuery(query, [
        id,
        JSON.stringify(location),
        tax_name,
        tax_rate,
        is_active
      ]);

      if (!insertResult.success) {
        throw new Error('Failed to insert tax rate: ' + insertResult.error);
      }

      // Return the created tax rate
      const createdTaxRate = await this.getTaxRateById(id);
      logger.info('Tax rate created:', { id, tax_name, tax_rate });
      
      return createdTaxRate;

    } catch (error) {
      logger.error('Error creating tax rate:', error);
      throw new Error('Failed to create tax rate: ' + error.message);
    }
  }

  /**
   * Update an existing tax rate
   * @param {string} id - Tax rate ID
   * @param {Object} updateData - Data to update
   * @returns {Object} Updated tax rate
   */
  async updateTaxRate(id, updateData) {
    try {
      const { location, tax_name, tax_rate, is_active } = updateData;
      
      // Build dynamic update query
      const updateFields = [];
      const params = [];

      if (location) {
        updateFields.push('location_json = ?');
        params.push(JSON.stringify(location));
      }

      if (tax_name) {
        updateFields.push('tax_name = ?');
        params.push(tax_name);
      }

      if (tax_rate !== undefined) {
        if (tax_rate < 0 || tax_rate > 1) {
          throw new Error('Tax rate must be between 0 and 1 (e.g., 0.08 for 8%)');
        }
        updateFields.push('tax_rate = ?');
        params.push(tax_rate);
      }

      if (is_active !== undefined) {
        updateFields.push('is_active = ?');
        params.push(is_active);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const query = `
        UPDATE tax_rates 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;

      const result = await DatabaseUtil.executeQuery(query, params);
      
      if (!result.success) {
        throw new Error('Failed to update tax rate: ' + result.error);
      }
      
      if (result.affectedRows === 0) {
        throw new Error('Tax rate not found');
      }

      // Return the updated tax rate
      const updatedTaxRate = await this.getTaxRateById(id);
      logger.info('Tax rate updated:', { id });
      
      return updatedTaxRate;

    } catch (error) {
      logger.error('Error updating tax rate:', error);
      throw new Error('Failed to update tax rate: ' + error.message);
    }
  }

  /**
   * Delete a tax rate
   * @param {string} id - Tax rate ID
   * @returns {boolean} Success status
   */
  async deleteTaxRate(id) {
    try {
      const query = 'DELETE FROM tax_rates WHERE id = ?';
      const result = await DatabaseUtil.executeQuery(query, [id]);
      
      if (!result.success) {
        throw new Error('Failed to delete tax rate: ' + result.error);
      }
      
      if (result.affectedRows === 0) {
        throw new Error('Tax rate not found');
      }

      logger.info('Tax rate deleted:', { id });
      return true;

    } catch (error) {
      logger.error('Error deleting tax rate:', error);
      throw new Error('Failed to delete tax rate: ' + error.message);
    }
  }

  /**
   * Get tax rate by ID
   * @param {string} id - Tax rate ID
   * @returns {Object} Tax rate
   */
  async getTaxRateById(id) {
    try {
      const query = 'SELECT * FROM tax_rates WHERE id = ?';
      const result = await DatabaseUtil.executeQuery(query, [id]);
      
      if (!result.success) {
        throw new Error('Failed to get tax rate: ' + result.error);
      }
      
      if (result.data.length === 0) {
        throw new Error('Tax rate not found');
      }

      return result.data[0];

    } catch (error) {
      logger.error('Error getting tax rate by ID:', error);
      throw new Error('Failed to get tax rate: ' + error.message);
    }
  }

  /**
   * Get tax summary for reporting
   * @param {Object} filters - Date and location filters
   * @returns {Object} Tax summary data
   */
  async getTaxSummary(filters = {}) {
    try {
      const { startDate, endDate, country, state } = filters;
      
      let query = `
        SELECT 
          tr.tax_name,
          tr.tax_rate,
          tr.location_json,
          COUNT(o.id) as order_count,
          SUM(o.tax_amount) as total_tax_collected,
          AVG(o.tax_amount) as avg_tax_per_order
        FROM tax_rates tr
        LEFT JOIN orders o ON JSON_EXTRACT(o.billing_address_json, '$.country') = JSON_EXTRACT(tr.location_json, '$.country')
      `;

      const params = [];
      const conditions = ['tr.is_active = true'];

      if (startDate && endDate) {
        conditions.push('o.created_at BETWEEN ? AND ?');
        params.push(startDate, endDate);
      }

      if (country) {
        conditions.push("JSON_EXTRACT(tr.location_json, '$.country') = ?");
        params.push(country);
      }

      if (state) {
        conditions.push("JSON_EXTRACT(tr.location_json, '$.state') = ?");
        params.push(state);
      }

      query += ' WHERE ' + conditions.join(' AND ');
      query += ' GROUP BY tr.id ORDER BY total_tax_collected DESC';

      const result = await DatabaseUtil.executeQuery(query, params);
      return result.success ? result.data : [];

    } catch (error) {
      logger.error('Error getting tax summary:', error);
      throw new Error('Failed to get tax summary: ' + error.message);
    }
  }
}

module.exports = new TaxService();