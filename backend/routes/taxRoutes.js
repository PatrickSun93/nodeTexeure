const express = require('express');
const router = express.Router();
const taxService = require('../services/taxService');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');
const ResponseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');

/**
 * @route POST /api/tax/calculate
 * @desc Calculate tax for given address and items
 * @access Public (needed for checkout)
 */
router.post('/calculate', async (req, res) => {
  try {
    const { address, items, subtotal } = req.body;

    // Validate required fields
    if (!address || !subtotal) {
      return res.status(400).json(ResponseFormatter.failure('Address and subtotal are required'));
    }

    // Validate address has required fields
    const requiredAddressFields = ['country'];
    const missingFields = requiredAddressFields.filter(field => !address[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json(ResponseFormatter.failure(`Missing required address fields: ${missingFields.join(', ')}`));
    }

    // Validate subtotal is a positive number
    if (typeof subtotal !== 'number' || subtotal < 0) {
      return res.status(400).json(ResponseFormatter.failure('Subtotal must be a positive number'));
    }

    const taxCalculation = await taxService.calculateTax(address, items || [], subtotal);

    res.json(ResponseFormatter.success('Tax calculated successfully', {
      taxAmount: taxCalculation.taxAmount,
      taxRate: taxCalculation.taxRate,
      breakdown: taxCalculation.breakdown,
      details: taxCalculation.taxDetails
    }));

  } catch (error) {
    logger.error('Error calculating tax:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to calculate tax'));
  }
});

/**
 * @route GET /api/tax/rates
 * @desc Get all tax rates (admin only)
 * @access Private (Admin)
 */
router.get('/rates', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { country, state, isActive } = req.query;
    
    const filters = {};
    if (country) filters.country = country;
    if (state) filters.state = state;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const taxRates = await taxService.getAllTaxRates(filters);

    res.json(ResponseFormatter.success('Tax rates retrieved successfully', {
      taxRates,
      count: taxRates.length
    }));

  } catch (error) {
    logger.error('Error getting tax rates:', error);
    res.status(500).json(ResponseFormatter.failure('Failed to get tax rates'));
  }
});

/**
 * @route GET /api/tax/rates/:id
 * @desc Get tax rate by ID (admin only)
 * @access Private (Admin)
 */
router.get('/rates/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const taxRate = await taxService.getTaxRateById(id);

    res.json(ResponseFormatter.success('Tax rate retrieved successfully', taxRate));

  } catch (error) {
    logger.error('Error getting tax rate:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(ResponseFormatter.failure('Tax rate not found'));
    } else {
      res.status(500).json(ResponseFormatter.failure('Failed to get tax rate'));
    }
  }
});

/**
 * @route POST /api/tax/rates
 * @desc Create new tax rate (admin only)
 * @access Private (Admin)
 */
router.post('/rates', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { location, tax_name, tax_rate, is_active } = req.body;

    // Validate required fields
    if (!location || !tax_name || tax_rate === undefined) {
      return res.status(400).json(ResponseFormatter.failure( 'Location, tax_name, and tax_rate are required'));
    }

    // Validate location has required country field
    if (!location.country) {
      return res.status(400).json(ResponseFormatter.failure( 'Location must include country'));
    }

    // Validate tax_rate is a number between 0 and 1
    if (typeof tax_rate !== 'number' || tax_rate < 0 || tax_rate > 1) {
      return res.status(400).json(ResponseFormatter.failure( 'Tax rate must be a number between 0 and 1 (e.g., 0.08 for 8%)'));
    }

    const newTaxRate = await taxService.createTaxRate({
      location,
      tax_name,
      tax_rate,
      is_active
    });

    res.status(201).json(ResponseFormatter.success( 'Tax rate created successfully', newTaxRate));

  } catch (error) {
    logger.error('Error creating tax rate:', error);
    res.status(500).json(ResponseFormatter.failure( error.message || 'Failed to create tax rate'));
  }
});

/**
 * @route PUT /api/tax/rates/:id
 * @desc Update tax rate (admin only)
 * @access Private (Admin)
 */
router.put('/rates/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate tax_rate if provided
    if (updateData.tax_rate !== undefined) {
      if (typeof updateData.tax_rate !== 'number' || updateData.tax_rate < 0 || updateData.tax_rate > 1) {
        return res.status(400).json(ResponseFormatter.failure( 'Tax rate must be a number between 0 and 1 (e.g., 0.08 for 8%)'));
      }
    }

    // Validate location if provided
    if (updateData.location && !updateData.location.country) {
      return res.status(400).json(ResponseFormatter.failure( 'Location must include country'));
    }

    const updatedTaxRate = await taxService.updateTaxRate(id, updateData);

    res.json(ResponseFormatter.success( 'Tax rate updated successfully', updatedTaxRate));

  } catch (error) {
    logger.error('Error updating tax rate:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(ResponseFormatter.failure( 'Tax rate not found'));
    } else {
      res.status(500).json(ResponseFormatter.failure( error.message || 'Failed to update tax rate'));
    }
  }
});

/**
 * @route DELETE /api/tax/rates/:id
 * @desc Delete tax rate (admin only)
 * @access Private (Admin)
 */
router.delete('/rates/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await taxService.deleteTaxRate(id);

    res.json(ResponseFormatter.success( 'Tax rate deleted successfully'));

  } catch (error) {
    logger.error('Error deleting tax rate:', error);
    if (error.message.includes('not found')) {
      res.status(404).json(ResponseFormatter.failure( 'Tax rate not found'));
    } else {
      res.status(500).json(ResponseFormatter.failure( 'Failed to delete tax rate'));
    }
  }
});

/**
 * @route GET /api/tax/summary
 * @desc Get tax collection summary (admin only)
 * @access Private (Admin)
 */
router.get('/summary', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { startDate, endDate, country, state } = req.query;
    
    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (country) filters.country = country;
    if (state) filters.state = state;

    const summary = await taxService.getTaxSummary(filters);

    res.json(ResponseFormatter.success( 'Tax summary retrieved successfully', {
      summary,
      filters
    }));

  } catch (error) {
    logger.error('Error getting tax summary:', error);
    res.status(500).json(ResponseFormatter.failure( 'Failed to get tax summary'));
  }
});

/**
 * @route GET /api/tax/rates/location/:country
 * @desc Get tax rates for a specific country (public for checkout)
 * @access Public
 */
router.get('/rates/location/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const { state } = req.query;

    const filters = { country, isActive: true };
    if (state) filters.state = state;

    const taxRates = await taxService.getAllTaxRates(filters);

    res.json(ResponseFormatter.success( 'Tax rates retrieved successfully', {
      taxRates: taxRates.map(rate => ({
        id: rate.id,
        tax_name: rate.tax_name,
        tax_rate: rate.tax_rate,
        location: rate.location_json
      })),
      country,
      state
    }));

  } catch (error) {
    logger.error('Error getting tax rates by location:', error);
    res.status(500).json(ResponseFormatter.failure( 'Failed to get tax rates'));
  }
});

module.exports = router;