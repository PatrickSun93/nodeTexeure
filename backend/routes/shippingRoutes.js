/**
 * Shipping Routes
 * Handles shipping rate quotes, label creation, and tracking
 */

const express = require('express');
const router = express.Router();
const ResponseFormatter = require('../utils/responseFormatter');
const DatabaseUtil = require('../utils/database');
const shippingService = require('../services/shippingService');
const { protect, admin, protectOptional } = require('../middleware/authMiddleware');
const db = DatabaseUtil; // executeQuery et al. are static — reference the class, not an instance

/**
 * POST /api/shipping/rates
 * Get shipping rate quotes for given address
 * Body: { destination: { postalCode, stateOrProvinceCode, countryCode, city }, items: [{ weight }] }
 */
router.post('/rates', async (req, res) => {
  try {
    const { destination, items } = req.body;

    if (!destination || !destination.postalCode) {
      return res.status(400).json(ResponseFormatter.failure('Destination postal code is required'));
    }

    // Build destination address
    const destAddress = {
      streetLines: destination.streetLines || [''],
      city: destination.city || '',
      stateOrProvinceCode: destination.stateOrProvinceCode || '',
      postalCode: destination.postalCode,
      countryCode: destination.countryCode || 'US',
    };

    // Build packages (default to 2lb if not specified)
    const packages = items && items.length > 0
      ? items.map(item => ({
          weight: item.weight || 2,
          length: item.length || 12,
          width: item.width || 10,
          height: item.height || 4,
        }))
      : [{ weight: 2, length: 12, width: 10, height: 4 }];

    const rates = await shippingService.getRates(destAddress, packages);

    res.json(ResponseFormatter.success('Shipping rates retrieved', {
      rates,
      isFallback: !shippingService.isConfigured,
    }));
  } catch (error) {
    console.error('Error getting shipping rates:', error);
    // Return fallback rates on error
    res.json(ResponseFormatter.success('Shipping rates (fallback)', {
      rates: shippingService.DEFAULT_RATES,
      isFallback: true,
    }));
  }
});

/**
 * POST /api/shipping/create-label
 * Create a shipping label for an order (admin only)
 * Body: { orderId, serviceType }
 */
router.post('/create-label', protect, admin, async (req, res) => {
  try {
    const { orderId, serviceType } = req.body;

    if (!orderId) {
      return res.status(400).json(ResponseFormatter.failure('Order ID is required'));
    }

    // Fetch order details
    const order = db.first(await db.executeQuery('SELECT * FROM orders WHERE id = ?', [orderId]));
    if (!order) {
      return res.status(404).json(ResponseFormatter.failure('Order not found'));
    }

    // Parse shipping address
    let shippingAddress;
    try {
      shippingAddress = typeof order.shipping_address_json === 'string'
        ? JSON.parse(order.shipping_address_json)
        : order.shipping_address_json;
    } catch {
      return res.status(400).json(ResponseFormatter.failure('Invalid shipping address on order'));
    }

    const recipient = {
      streetLines: [shippingAddress.address_line_1 || ''],
      city: shippingAddress.city || '',
      stateOrProvinceCode: shippingAddress.state || '',
      postalCode: shippingAddress.postal_code || '',
      countryCode: shippingAddress.country || 'US',
    };

    const shipment = await shippingService.createShipment({
      recipient,
      recipientName: `${shippingAddress.first_name || ''} ${shippingAddress.last_name || ''}`.trim(),
      recipientPhone: shippingAddress.phone || '',
      serviceType: serviceType || 'FEDEX_GROUND',
      packages: [{ weight: 2 }], // Default weight
    });

    // Update order with tracking info
    await db.executeQuery(
      "UPDATE orders SET tracking_number = ?, shipping_carrier = 'FedEx', status = 'shipped', shipped_at = NOW() WHERE id = ?",
      [shipment.trackingNumber, orderId]
    );

    res.json(ResponseFormatter.success('Shipping label created', {
      trackingNumber: shipment.trackingNumber,
      labelUrl: shipment.labelUrl,
      isMock: shipment.mock || false,
    }));
  } catch (error) {
    console.error('Error creating shipping label:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to create shipping label'));
  }
});

/**
 * GET /api/shipping/track/:trackingNumber
 * Get tracking information for a shipment
 */
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    if (!trackingNumber) {
      return res.status(400).json(ResponseFormatter.failure('Tracking number is required'));
    }

    const tracking = await shippingService.getTracking(trackingNumber);

    res.json(ResponseFormatter.success('Tracking information retrieved', tracking));
  } catch (error) {
    console.error('Error getting tracking info:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to get tracking info'));
  }
});

module.exports = router;
