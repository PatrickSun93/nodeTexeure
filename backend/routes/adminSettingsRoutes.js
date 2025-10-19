const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { validateInput } = require('../middleware/validationMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/admin/settings
 * Get all system settings (admin only)
 */
router.get('/', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { category = '', search = '' } = req.query;

    let whereConditions = ['1=1'];
    let queryParams = [];

    // Category filter
    if (category) {
      whereConditions.push('JSON_EXTRACT(setting_details, "$.category") = ?');
      queryParams.push(category);
    }

    // Search filter
    if (search) {
      whereConditions.push('(setting_key LIKE ? OR JSON_EXTRACT(setting_details, "$.description") LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        id,
        setting_key,
        setting_value,
        setting_type,
        setting_details,
        is_public,
        updated_by,
        updated_at
      FROM system_settings
      WHERE ${whereClause}
      ORDER BY 
        JSON_EXTRACT(setting_details, "$.category") ASC,
        setting_key ASC
    `;

    const result = await DatabaseUtil.executeQuery(query, queryParams);

    if (result.success) {
      // Group settings by category for better organization
      const settingsByCategory = {};
      result.data.forEach(setting => {
        const details = setting.setting_details ? JSON.parse(setting.setting_details) : {};
        const category = details.category || 'General';
        
        if (!settingsByCategory[category]) {
          settingsByCategory[category] = [];
        }
        
        settingsByCategory[category].push({
          ...setting,
          setting_details: details
        });
      });

      const keyValueTable = {
        settings: result.data,
        settingsByCategory,
        totalCount: result.data.length,
        filters: { category, search }
      };

      res.json(ResponseFormatter.success('System settings retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve system settings');
    }
  } catch (error) {
    logger.error('Get system settings error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get system settings', keyValueTable));
  }
});

/**
 * GET /api/admin/settings/:key
 * Get specific system setting by key
 */
router.get('/:key', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { key } = req.params;

    const result = await DatabaseUtil.executeQuery(
      'SELECT * FROM system_settings WHERE setting_key = ?',
      [key]
    );

    if (result.success && result.data.length > 0) {
      const setting = result.data[0];
      const keyValueTable = {
        ...setting,
        setting_details: setting.setting_details ? JSON.parse(setting.setting_details) : {}
      };

      res.json(ResponseFormatter.success('System setting retrieved successfully', keyValueTable));
    } else {
      const keyValueTable = { error: 'Setting not found', settingKey: key };
      res.status(404).json(ResponseFormatter.failure('Setting not found', keyValueTable));
    }
  } catch (error) {
    logger.error('Get system setting error', {
      error: error.message,
      settingKey: req.params.key,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get system setting', keyValueTable));
  }
});

/**
 * PUT /api/admin/settings/:key
 * Update specific system setting
 */
router.put('/:key', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { key } = req.params;
    const { setting_value, setting_type = 'string', setting_details = {} } = req.body;

    if (setting_value === undefined) {
      const keyValueTable = { error: 'setting_value is required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required field', keyValueTable));
    }

    // Validate setting_type
    const validTypes = ['string', 'integer', 'decimal', 'boolean', 'json'];
    if (!validTypes.includes(setting_type)) {
      const keyValueTable = { error: 'Invalid setting_type', validTypes };
      return res.status(400).json(ResponseFormatter.failure('Invalid setting type', keyValueTable));
    }

    // Validate setting_value based on type
    let validatedValue = setting_value;
    try {
      switch (setting_type) {
        case 'integer':
          validatedValue = parseInt(setting_value);
          if (isNaN(validatedValue)) throw new Error('Invalid integer value');
          break;
        case 'decimal':
          validatedValue = parseFloat(setting_value);
          if (isNaN(validatedValue)) throw new Error('Invalid decimal value');
          break;
        case 'boolean':
          validatedValue = setting_value === true || setting_value === 'true' || setting_value === '1';
          break;
        case 'json':
          if (typeof setting_value === 'object') {
            validatedValue = JSON.stringify(setting_value);
          } else {
            JSON.parse(setting_value); // Validate JSON string
            validatedValue = setting_value;
          }
          break;
        default:
          validatedValue = String(setting_value);
      }
    } catch (validationError) {
      const keyValueTable = { error: `Invalid value for type ${setting_type}: ${validationError.message}` };
      return res.status(400).json(ResponseFormatter.failure('Invalid setting value', keyValueTable));
    }

    // Check if setting exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM system_settings WHERE setting_key = ?',
      [key]
    );

    let result;
    if (existingResult.success && existingResult.data.length > 0) {
      // Update existing setting
      result = await DatabaseUtil.executeQuery(
        `UPDATE system_settings 
         SET setting_value = ?, setting_type = ?, setting_details = ?, updated_by = ?, updated_at = NOW()
         WHERE setting_key = ?`,
        [validatedValue, setting_type, JSON.stringify(setting_details), req.user.id, key]
      );
    } else {
      // Create new setting
      const settingId = `SYS${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
      result = await DatabaseUtil.executeQuery(
        `INSERT INTO system_settings (id, setting_key, setting_value, setting_type, setting_details, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [settingId, key, validatedValue, setting_type, JSON.stringify(setting_details), req.user.id]
      );
    }

    if (result.success) {
      // Log the setting change
      logger.info('System setting updated', {
        settingKey: key,
        settingType: setting_type,
        updatedBy: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        settingKey: key,
        settingValue: validatedValue,
        settingType: setting_type,
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('System setting updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update system setting');
    }
  } catch (error) {
    logger.error('Update system setting error', {
      error: error.message,
      settingKey: req.params.key,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update system setting', keyValueTable));
  }
});

/**
 * POST /api/admin/settings/bulk-update
 * Update multiple system settings at once
 */
router.post('/bulk-update', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { settings } = req.body;

    if (!Array.isArray(settings) || settings.length === 0) {
      const keyValueTable = { error: 'settings array is required' };
      return res.status(400).json(ResponseFormatter.failure('Missing required field', keyValueTable));
    }

    const queries = [];
    const updatedSettings = [];

    for (const setting of settings) {
      const { setting_key, setting_value, setting_type = 'string', setting_details = {} } = setting;

      if (!setting_key || setting_value === undefined) {
        const keyValueTable = { error: 'setting_key and setting_value are required for each setting' };
        return res.status(400).json(ResponseFormatter.failure('Invalid setting data', keyValueTable));
      }

      // Validate and convert value based on type
      let validatedValue = setting_value;
      try {
        switch (setting_type) {
          case 'integer':
            validatedValue = parseInt(setting_value);
            if (isNaN(validatedValue)) throw new Error('Invalid integer value');
            break;
          case 'decimal':
            validatedValue = parseFloat(setting_value);
            if (isNaN(validatedValue)) throw new Error('Invalid decimal value');
            break;
          case 'boolean':
            validatedValue = setting_value === true || setting_value === 'true' || setting_value === '1';
            break;
          case 'json':
            if (typeof setting_value === 'object') {
              validatedValue = JSON.stringify(setting_value);
            } else {
              JSON.parse(setting_value); // Validate JSON string
              validatedValue = setting_value;
            }
            break;
          default:
            validatedValue = String(setting_value);
        }
      } catch (validationError) {
        const keyValueTable = { 
          error: `Invalid value for setting ${setting_key} with type ${setting_type}: ${validationError.message}` 
        };
        return res.status(400).json(ResponseFormatter.failure('Invalid setting value', keyValueTable));
      }

      // Use INSERT ... ON DUPLICATE KEY UPDATE for upsert functionality
      queries.push({
        sql: `INSERT INTO system_settings (id, setting_key, setting_value, setting_type, setting_details, updated_by)
              VALUES (?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
              setting_value = VALUES(setting_value),
              setting_type = VALUES(setting_type),
              setting_details = VALUES(setting_details),
              updated_by = VALUES(updated_by),
              updated_at = NOW()`,
        bindParams: [
          `SYS${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
          setting_key,
          validatedValue,
          setting_type,
          JSON.stringify(setting_details),
          req.user.id
        ]
      });

      updatedSettings.push({
        settingKey: setting_key,
        settingValue: validatedValue,
        settingType: setting_type
      });
    }

    const result = await DatabaseUtil.executeTransaction(queries);

    if (result.success) {
      // Log the bulk update
      logger.info('Bulk system settings update', {
        settingsCount: settings.length,
        settingKeys: settings.map(s => s.setting_key),
        updatedBy: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        updatedSettings,
        totalUpdated: settings.length,
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('System settings updated successfully', keyValueTable));
    } else {
      throw new Error('Failed to update system settings');
    }
  } catch (error) {
    logger.error('Bulk update system settings error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to update system settings', keyValueTable));
  }
});

/**
 * DELETE /api/admin/settings/:key
 * Delete system setting (admin only)
 */
router.delete('/:key', protect, requireRole(['admin']), async (req, res) => {
  try {
    const { key } = req.params;

    // Check if setting exists
    const existingResult = await DatabaseUtil.executeQuery(
      'SELECT id FROM system_settings WHERE setting_key = ?',
      [key]
    );

    if (!existingResult.success || existingResult.data.length === 0) {
      const keyValueTable = { error: 'Setting not found', settingKey: key };
      return res.status(404).json(ResponseFormatter.failure('Setting not found', keyValueTable));
    }

    const result = await DatabaseUtil.executeQuery(
      'DELETE FROM system_settings WHERE setting_key = ?',
      [key]
    );

    if (result.success) {
      // Log the setting deletion
      logger.info('System setting deleted', {
        settingKey: key,
        deletedBy: req.user.id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      const keyValueTable = {
        settingKey: key,
        deletedBy: req.user.id,
        deletedAt: new Date().toISOString()
      };

      res.json(ResponseFormatter.success('System setting deleted successfully', keyValueTable));
    } else {
      throw new Error('Failed to delete system setting');
    }
  } catch (error) {
    logger.error('Delete system setting error', {
      error: error.message,
      settingKey: req.params.key,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to delete system setting', keyValueTable));
  }
});

/**
 * GET /api/admin/settings/categories/list
 * Get list of all setting categories
 */
router.get('/categories/list', protect, requireRole(['admin']), async (req, res) => {
  try {
    const result = await DatabaseUtil.executeQuery(`
      SELECT DISTINCT 
        JSON_EXTRACT(setting_details, "$.category") as category,
        COUNT(*) as setting_count
      FROM system_settings 
      WHERE JSON_EXTRACT(setting_details, "$.category") IS NOT NULL
      GROUP BY JSON_EXTRACT(setting_details, "$.category")
      ORDER BY category ASC
    `);

    if (result.success) {
      const categories = result.data.map(row => ({
        name: row.category ? row.category.replace(/"/g, '') : 'General',
        settingCount: row.setting_count
      }));

      const keyValueTable = {
        categories,
        totalCategories: categories.length
      };

      res.json(ResponseFormatter.success('Setting categories retrieved successfully', keyValueTable));
    } else {
      throw new Error('Failed to retrieve setting categories');
    }
  } catch (error) {
    logger.error('Get setting categories error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    const keyValueTable = { error: error.message };
    res.status(500).json(ResponseFormatter.failure('Failed to get setting categories', keyValueTable));
  }
});

module.exports = router;