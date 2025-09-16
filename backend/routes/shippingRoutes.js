const express = require('express');
const router = express.Router();
const shippingService = require('../services/shippingService');
const ResponseFormatter = require('../utils/responseFormatter');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * @route POST /api/shipping/calculate
 * @desc Calculate shipping costs for given address and items
 * @access Public
 */
router.post('/calculate', async (req, res) => {
  try {
    const { address, items, includeFedEx = true } = req.body;

    // Validate required fields
    if (!address || !address.country) {
      return res.status(400).json(
        ResponseFormatter.failure('Address with country is required')
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json(
        ResponseFormatter.failure('Items array is required')
      );
    }

    // Calculate total weight from items
    const totalWeight = await shippingService.calculateTotalWeight(items);

    // Calculate shipping options with FedEx integration
    const shippingResult = await shippingService.calculateShippingWithFedEx(
      address, 
      items, 
      totalWeight, 
      includeFedEx
    );

    res.json(ResponseFormatter.success('Shipping calculated successfully', shippingResult));
  } catch (error) {
    console.error('Error calculating shipping:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to calculate shipping', { error: error.message })
    );
  }
});

/**
 * @route POST /api/shipping/calculate-weight
 * @desc Calculate total weight for given items
 * @access Public
 */
router.post('/calculate-weight', async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json(
        ResponseFormatter.failure('Items array is required')
      );
    }

    const totalWeight = await shippingService.calculateTotalWeight(items);

    res.json(ResponseFormatter.success('Weight calculated successfully', { 
      totalWeight,
      unit: 'kg'
    }));
  } catch (error) {
    console.error('Error calculating weight:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to calculate weight', { error: error.message })
    );
  }
});

/**
 * @route GET /api/shipping/zones
 * @desc Get all shipping zones
 * @access Private (Admin)
 */
router.get('/zones', protect, admin, async (req, res) => {
  try {
    const zones = await shippingService.getAllShippingZones();
    res.json(ResponseFormatter.success('Shipping zones retrieved successfully', zones));
  } catch (error) {
    console.error('Error getting shipping zones:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to get shipping zones', { error: error.message })
    );
  }
});

/**
 * @route POST /api/shipping/zones
 * @desc Create new shipping zone
 * @access Private (Admin)
 */
router.post('/zones', protect, admin, async (req, res) => {
  try {
    const { name, countries, is_active } = req.body;

    // Validate required fields
    if (!name || !countries || !Array.isArray(countries)) {
      return res.status(400).json(
        ResponseFormatter.failure('Name and countries array are required')
      );
    }

    const zone = await shippingService.createShippingZone({
      name,
      countries,
      is_active
    });

    res.status(201).json(ResponseFormatter.success('Shipping zone created successfully', zone));
  } catch (error) {
    console.error('Error creating shipping zone:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to create shipping zone', { error: error.message })
    );
  }
});

/**
 * @route PUT /api/shipping/zones/:zoneId
 * @desc Update shipping zone
 * @access Private (Admin)
 */
router.put('/zones/:zoneId', protect, admin, async (req, res) => {
  try {
    const { zoneId } = req.params;
    const updateData = req.body;

    const zone = await shippingService.updateShippingZone(zoneId, updateData);
    res.json(ResponseFormatter.success('Shipping zone updated successfully', zone));
  } catch (error) {
    console.error('Error updating shipping zone:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to update shipping zone', { error: error.message })
    );
  }
});

/**
 * @route GET /api/shipping/zones/:zoneId/rates
 * @desc Get shipping rates for a zone
 * @access Private (Admin)
 */
router.get('/zones/:zoneId/rates', protect, admin, async (req, res) => {
  try {
    const { zoneId } = req.params;
    const rates = await shippingService.getZoneRates(zoneId);
    res.json(ResponseFormatter.success('Zone rates retrieved successfully', rates));
  } catch (error) {
    console.error('Error getting zone rates:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to get zone rates', { error: error.message })
    );
  }
});

/**
 * @route POST /api/shipping/rates
 * @desc Create new shipping rate
 * @access Private (Admin)
 */
router.post('/rates', protect, admin, async (req, res) => {
  try {
    const rateData = req.body;

    // Validate required fields
    if (!rateData.zone_id || !rateData.name || rateData.base_rate === undefined) {
      return res.status(400).json(
        ResponseFormatter.failure('Zone ID, name, and base rate are required')
      );
    }

    const rate = await shippingService.createShippingRate(rateData);
    res.status(201).json(ResponseFormatter.success('Shipping rate created successfully', rate));
  } catch (error) {
    console.error('Error creating shipping rate:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to create shipping rate', { error: error.message })
    );
  }
});

/**
 * @route PUT /api/shipping/rates/:rateId
 * @desc Update shipping rate
 * @access Private (Admin)
 */
router.put('/rates/:rateId', protect, admin, async (req, res) => {
  try {
    const { rateId } = req.params;
    const updateData = req.body;

    const rate = await shippingService.updateShippingRate(rateId, updateData);
    res.json(ResponseFormatter.success('Shipping rate updated successfully', rate));
  } catch (error) {
    console.error('Error updating shipping rate:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to update shipping rate', { error: error.message })
    );
  }
});

/**
 * @route DELETE /api/shipping/rates/:rateId
 * @desc Delete shipping rate
 * @access Private (Admin)
 */
router.delete('/rates/:rateId', protect, admin, async (req, res) => {
  try {
    const { rateId } = req.params;
    const success = await shippingService.deleteShippingRate(rateId);
    
    if (success) {
      res.json(ResponseFormatter.success('Shipping rate deleted successfully'));
    } else {
      res.status(404).json(ResponseFormatter.failure('Shipping rate not found'));
    }
  } catch (error) {
    console.error('Error deleting shipping rate:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to delete shipping rate', { error: error.message })
    );
  }
});

/**
 * @route GET /api/shipping/zones/:countryCode/find
 * @desc Find shipping zone by country code
 * @access Public
 */
router.get('/zones/:countryCode/find', async (req, res) => {
  try {
    const { countryCode } = req.params;
    const zone = await shippingService.findShippingZone(countryCode);
    
    if (zone) {
      res.json(ResponseFormatter.success('Shipping zone found', zone));
    } else {
      res.status(404).json(ResponseFormatter.failure('No shipping zone found for this country'));
    }
  } catch (error) {
    console.error('Error finding shipping zone:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to find shipping zone', { error: error.message })
    );
  }
});

/**
 * @route POST /api/shipping/fedex/create-shipment
 * @desc Create FedEx shipment for an order
 * @access Private (Admin/Staff)
 */
router.post('/fedex/create-shipment', protect, admin, async (req, res) => {
  try {
    const { orderId, serviceType } = req.body;

    if (!orderId) {
      return res.status(400).json(
        ResponseFormatter.failure('Order ID is required')
      );
    }

    const shipmentResult = await shippingService.createFedExShipment(orderId, {
      serviceType: serviceType || 'FEDEX_GROUND'
    });

    res.json(ResponseFormatter.success('FedEx shipment created successfully', shipmentResult));
  } catch (error) {
    console.error('Error creating FedEx shipment:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to create FedEx shipment', { error: error.message })
    );
  }
});

/**
 * @route GET /api/shipping/track/:trackingNumber
 * @desc Track a shipment using tracking number
 * @access Public
 */
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    if (!trackingNumber) {
      return res.status(400).json(
        ResponseFormatter.failure('Tracking number is required')
      );
    }

    const trackingInfo = await shippingService.trackFedExShipment(trackingNumber);

    res.json(ResponseFormatter.success('Tracking information retrieved successfully', trackingInfo));
  } catch (error) {
    console.error('Error tracking shipment:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to track shipment', { error: error.message })
    );
  }
});

/**
 * @route GET /api/shipping/shipments/order/:orderId
 * @desc Get shipment details for an order
 * @access Private
 */
router.get('/shipments/order/:orderId', protect, async (req, res) => {
  try {
    const { orderId } = req.params;

    const shipmentDetails = await shippingService.getShipmentDetails(orderId);

    if (!shipmentDetails) {
      return res.status(404).json(
        ResponseFormatter.failure('Shipment not found for this order')
      );
    }

    res.json(ResponseFormatter.success('Shipment details retrieved successfully', shipmentDetails));
  } catch (error) {
    console.error('Error getting shipment details:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to get shipment details', { error: error.message })
    );
  }
});

/**
 * @route GET /api/shipping/tracking-events/:trackingNumber
 * @desc Get detailed tracking events for a tracking number
 * @access Public
 */
router.get('/tracking-events/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const trackingEvents = await shippingService.getTrackingEvents(trackingNumber);

    res.json(ResponseFormatter.success('Tracking events retrieved successfully', trackingEvents));
  } catch (error) {
    console.error('Error getting tracking events:', error);
    res.status(500).json(
      ResponseFormatter.failure('Failed to get tracking events', { error: error.message })
    );
  }
});

module.exports = router;