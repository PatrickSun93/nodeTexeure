/**
 * System Settings Routes
 * Defines routes for fetching system settings
 * Handles public system configuration data
 */

const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');

const router = express.Router();

/**
 * GET /api/settings/public
 * Fetch all public system settings for frontend use
 */
router.get('/public', async (req, res) => {
  try {
    const query = `
      SELECT setting_key, setting_value, setting_type 
      FROM system_settings 
      WHERE is_public = 1
      ORDER BY setting_key
    `;
    
    const result = await DatabaseUtil.executeQuery(query);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch system settings');
    }
    
    // Transform the results into a more usable format
    const settings = {};
    result.data.forEach(row => {
      let value = row.setting_value;
      
      // Convert value based on type
      switch (row.setting_type) {
        case 'boolean':
          value = value === 'true' || value === '1' || value === 1;
          break;
        case 'integer':
          value = parseInt(value, 10);
          break;
        case 'decimal':
          value = parseFloat(value);
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch (e) {
            console.warn(`Failed to parse JSON for setting ${row.setting_key}:`, e);
          }
          break;
        // 'string' type remains as is
      }
      
      settings[row.setting_key] = value;
    });
    
    res.json(ResponseFormatter.success('Public system settings retrieved successfully', settings));
  } catch (error) {
    console.error('Error fetching public system settings:', error);
    const keyValueTable = {
      error: error.message,
      timestamp: new Date().toISOString()
    };
    res.status(500).json(ResponseFormatter.failure('Failed to fetch system settings', keyValueTable));
  }
});

/**
 * GET /api/settings/all
 * Fetch all system settings (authorized staff only - requires authentication)
 * This endpoint would be used by internal operations tools
 */
router.get('/all', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware here
    // For now, we'll return an error indicating authentication is required
    
    res.status(401).json(ResponseFormatter.failure('Authentication required', {
      message: 'This endpoint requires authorized staff authentication'
    }));
  } catch (error) {
    console.error('Error fetching all system settings:', error);
    const keyValueTable = {
      error: error.message,
      timestamp: new Date().toISOString()
    };
    res.status(500).json(ResponseFormatter.failure('Failed to fetch system settings', keyValueTable));
  }
});

module.exports = router;