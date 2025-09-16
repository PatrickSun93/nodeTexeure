const express = require('express');
const router = express.Router();
const fedexService = require('../services/fedexService');
const shippingService = require('../services/shippingService');
const ResponseFormatter = require('../utils/responseFormatter');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

/**
 * GET /api/fedex/rates
 * Get FedEx shipping rates for given parameters
 */
router.post('/rates', async (req, res) => {
  try {
    const { origin, destination, weight, dimensions } = req.body;

    // Validate required fields
    if (!destination || !weight) {
      return res.status(400).json(
        ResponseFormatter.error('Missing required fields: destination and weight')
      );
    }

    const shipmentDetails = {
      origin: origin || {
        postalCode: process.env.COMPANY_POSTAL_CODE || '12345',
        countryCode: process.env.COMPANY_COUNTRY_CODE || 'US',
        stateCode: process.env.COMPANY_STATE_CODE || 'NY'
      },
      destination,
      weight,
      dimensions: dimensions || { length: 12, width: 8, height: 6 }
    };

    const rates = await fedexService.getRates(shipmentDetails);

    res.json(ResponseFormatter.success(rates, 'FedEx rates retrieved successfully'));
  } catch (error) {
    console.error('Error getting FedEx rates:', error);
    res.status(500).json(
      ResponseFormatter.error('Failed to get FedEx rates', error.message)
    );
  }
});

/**
 * POST /api/fedex/shipments
 * Create a FedEx shipment for an order
 * Requires admin or staff role
 */
router.post('/shipments', authenticateToken, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { orderId, serviceType } = req.body;

    if (!orderId) {
      return res.status(400).json(
        ResponseFormatter.error('Order ID is required')
      );
    }

    const shipmentResult = await shippingService.createFedExShipment(orderId, {
      serviceType: serviceType || 'FEDEX_GROUND'
    });

    res.json(ResponseFormatter.success(shipmentResult, 'FedEx shipment created successfully'));
  } catch (error) {
    console.error('Error creating FedEx shipment:', error);
    res.status(500).json(
      ResponseFormatter.error('Failed to create FedEx shipment', error.message)
    );
  }
});

/**
 * GET /api/fedex/track/:trackingNumber
 * Track a FedEx shipment
 */
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    if (!trackingNumber) {
      return res.status(400).json(
        ResponseFormatter.error('Tracking number is required')
      );
    }

    const trackingInfo = await fedexService.trackShipment(trackingNumber);

    res.json(ResponseFormatter.success(trackingInfo, 'Tracking information retrieved successfully'));
  } catch (error) {
    console.error('Error tracking FedEx shipment:', error);
    res.status(500).json(
      ResponseFormatter.error('Failed to track shipment', error.message)
    );
  }
});

/**
 * GET /api/fedex/shipments/order/:orderId
 * Get shipment details for an order
 */
router.get('/shipments/order/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;

    const shipmentDetails = await shippingService.getShipmentDetails(orderId);

    if (!shipmentDetails) {
      return res.status(404).json(
        ResponseFormatter.error('Shipment not found for this order')
      );
    }

    res.json(ResponseFormatter.success(shipmentDetails, 'Shipment details retrieved successfully'));
  } catch (error) {
    console.error('Error getting shipment details:', error);
    res.status(500).json(
      ResponseFormatter.error('Failed to get shipment details', error.message)
    );
  }
});

/**
 * GET /api/fedex/tracking-events/:trackingNumber
 * Get detailed tracking events for a tracking number
 */
router.get('/tracking-events/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const trackingEvents = await shippingService.getTrackingEvents(trackingNumber);

    res.json(ResponseFormatter.success(trackingEvents, 'Tracking events retrieved successfully'));
  } catch (error) {
    console.error('Error getting tracking events:', error);
    res.status(500).json(
      ResponseFormatter.error('Failed to get tracking events', error.message)
    );
  }
});

/**
 * POST /api/fedex/validate-credentials
 * Validate FedEx API credentials
 * Requires admin role
 */
router.post('/validate-credentials', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const isValid = await fedexService.validateCredentials();

    res.json(ResponseFormatter.success(
      { valid: isValid },
      isValid ? 'FedEx credentials are valid' : 'FedEx credentials are invalid'
    ));
  } catch (error) {
    console.error('Error validating FedEx credentials:', error);
    res.status(500).json(
      ResponseFormatter.error('Failed to validate credentials', error.message)
    );
  }
});

/**
 * POST /api/fedex/refresh-tracking/:trackingNumber
 * Manually refresh tracking information for a shipment
 * Requires admin or staff role
 */
router.post('/refresh-tracking/:trackingNumber', authenticateToken, requireRole(['admin', 'staff']), async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    // Force refresh tracking information
    const trackingInfo = await fedexService.trackShipment(trackingNumber);

    res.json(ResponseFormatter.success(trackingInfo, 'Tracking information refreshed successfully'));
  } catch (error) {
    console.error('Error refreshing tracking information:', error);
    res.status(500).json(
      ResponseFormatter.error('Failed to refresh tracking information', error.message)
    );
  }
});

module.exports = router;