/**
 * FedEx Shipping Service
 * Handles shipping rate calculation, label generation, and tracking
 * Falls back to static rates when FedEx is not configured
 */

const FEDEX_API_URL = process.env.FEDEX_API_URL || 'https://apis-sandbox.fedex.com';
const FEDEX_CLIENT_ID = process.env.FEDEX_CLIENT_ID;
const FEDEX_CLIENT_SECRET = process.env.FEDEX_CLIENT_SECRET;
const FEDEX_ACCOUNT_NUMBER = process.env.FEDEX_ACCOUNT_NUMBER;

let isConfigured = false;
let cachedToken = null;
let tokenExpiry = 0;

// Check if FedEx is configured with real keys
if (FEDEX_CLIENT_ID && FEDEX_CLIENT_SECRET && !FEDEX_CLIENT_ID.includes('your-fedex')) {
  isConfigured = true;
  console.log('✅ FedEx shipping service initialized');
} else {
  console.warn('⚠️  FedEx not configured (placeholder keys). Using static shipping rates.');
}

// Default static rates (fallback)
const DEFAULT_RATES = [
  {
    serviceType: 'STANDARD',
    serviceName: 'Standard Shipping',
    deliveryDays: '5-7 business days',
    rate: 9.99,
    currency: 'USD',
  },
  {
    serviceType: 'EXPRESS',
    serviceName: 'Express Shipping',
    deliveryDays: '2-3 business days',
    rate: 19.99,
    currency: 'USD',
  },
  {
    serviceType: 'OVERNIGHT',
    serviceName: 'Overnight Shipping',
    deliveryDays: '1 business day',
    rate: 34.99,
    currency: 'USD',
  },
];

// Default origin address (store location)
const ORIGIN_ADDRESS = {
  streetLines: ['123 Store Street'],
  city: 'New York',
  stateOrProvinceCode: 'NY',
  postalCode: '10001',
  countryCode: 'US',
};

/**
 * Authenticate with FedEx API and get OAuth token
 */
async function authenticate() {
  if (!isConfigured) {
    throw new Error('FedEx is not configured');
  }

  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const response = await fetch(`${FEDEX_API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: FEDEX_CLIENT_ID,
      client_secret: FEDEX_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`FedEx authentication failed: ${error}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 60s early

  return cachedToken;
}

/**
 * Get shipping rate quotes
 * @param {Object} destination - { streetLines, city, stateOrProvinceCode, postalCode, countryCode }
 * @param {Array} packages - Array of { weight (lbs), length, width, height (inches) }
 * @returns {Array} Shipping rate options
 */
async function getRates(destination, packages = [{ weight: 2, length: 12, width: 10, height: 4 }]) {
  // Fallback to static rates
  if (!isConfigured) {
    console.log('📦 Using static shipping rates (FedEx not configured)');
    return DEFAULT_RATES;
  }

  try {
    const token = await authenticate();

    const requestBody = {
      accountNumber: { value: FEDEX_ACCOUNT_NUMBER },
      requestedShipment: {
        shipper: { address: ORIGIN_ADDRESS },
        recipient: { address: destination },
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        rateRequestType: ['ACCOUNT', 'LIST'],
        requestedPackageLineItems: packages.map(pkg => ({
          weight: { units: 'LB', value: pkg.weight },
          dimensions: {
            length: pkg.length,
            width: pkg.width,
            height: pkg.height,
            units: 'IN',
          },
        })),
      },
    };

    const response = await fetch(`${FEDEX_API_URL}/rate/v1/rates/quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-locale': 'en_US',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.warn('FedEx rate API error, falling back to static rates');
      return DEFAULT_RATES;
    }

    const data = await response.json();
    const rateReplyDetails = data.output?.rateReplyDetails || [];

    return rateReplyDetails.map(detail => ({
      serviceType: detail.serviceType,
      serviceName: detail.serviceName || detail.serviceType,
      deliveryDays: detail.commit?.dateDetail?.dayFormat || 'N/A',
      rate: parseFloat(detail.ratedShipmentDetails?.[0]?.totalNetCharge || 0),
      currency: detail.ratedShipmentDetails?.[0]?.currency || 'USD',
    }));
  } catch (err) {
    console.error('FedEx rate lookup error, using fallback:', err.message);
    return DEFAULT_RATES;
  }
}

/**
 * Create a shipment and get tracking number
 * @param {Object} shipmentDetails - { recipient, packages, serviceType }
 * @returns {Object} { trackingNumber, labelUrl }
 */
async function createShipment(shipmentDetails) {
  if (!isConfigured) {
    // Return mock shipment data
    const mockTracking = 'MOCK' + Date.now().toString().slice(-10);
    console.log(`📦 [MOCK SHIPMENT] Tracking: ${mockTracking}`);
    return {
      trackingNumber: mockTracking,
      labelUrl: null,
      mock: true,
    };
  }

  try {
    const token = await authenticate();

    const requestBody = {
      accountNumber: { value: FEDEX_ACCOUNT_NUMBER },
      labelResponseOptions: 'URL_ONLY',
      requestedShipment: {
        shipper: {
          address: ORIGIN_ADDRESS,
          contact: { personName: 'Store Admin', phoneNumber: '1234567890' },
        },
        recipients: [{
          address: shipmentDetails.recipient,
          contact: {
            personName: shipmentDetails.recipientName || 'Customer',
            phoneNumber: shipmentDetails.recipientPhone || '0000000000',
          },
        }],
        serviceType: shipmentDetails.serviceType || 'FEDEX_GROUND',
        packagingType: 'YOUR_PACKAGING',
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        shippingChargesPayment: { paymentType: 'SENDER' },
        labelSpecification: {
          labelFormatType: 'COMMON2D',
          imageType: 'PDF',
          labelStockType: 'PAPER_4X6',
        },
        requestedPackageLineItems: (shipmentDetails.packages || [{ weight: 2 }]).map(pkg => ({
          weight: { units: 'LB', value: pkg.weight },
        })),
      },
    };

    const response = await fetch(`${FEDEX_API_URL}/ship/v1/shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-locale': 'en_US',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`FedEx shipment creation failed: ${err}`);
    }

    const data = await response.json();
    const shipmentResult = data.output?.transactionShipments?.[0];
    const piece = shipmentResult?.pieceResponses?.[0];

    return {
      trackingNumber: piece?.trackingNumber || shipmentResult?.masterTrackingNumber?.trackingNumber,
      labelUrl: piece?.packageDocuments?.[0]?.url || null,
      mock: false,
    };
  } catch (err) {
    console.error('FedEx shipment creation error:', err.message);
    throw err;
  }
}

/**
 * Get tracking information
 * @param {string} trackingNumber
 * @returns {Object} Tracking details
 */
async function getTracking(trackingNumber) {
  if (!isConfigured) {
    return {
      trackingNumber,
      status: 'MOCK_IN_TRANSIT',
      statusDescription: 'Package is in transit (mock)',
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      events: [
        { timestamp: new Date().toISOString(), description: 'Shipment information sent to FedEx (mock)', location: 'New York, NY' },
      ],
      mock: true,
    };
  }

  try {
    const token = await authenticate();

    const response = await fetch(`${FEDEX_API_URL}/track/v1/trackingnumbers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-locale': 'en_US',
      },
      body: JSON.stringify({
        includeDetailedScans: true,
        trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
      }),
    });

    if (!response.ok) {
      throw new Error('FedEx tracking lookup failed');
    }

    const data = await response.json();
    const trackResult = data.output?.completeTrackResults?.[0]?.trackResults?.[0];

    return {
      trackingNumber,
      status: trackResult?.latestStatusDetail?.code || 'UNKNOWN',
      statusDescription: trackResult?.latestStatusDetail?.description || 'Unknown',
      estimatedDelivery: trackResult?.estimatedDeliveryTimeWindow?.window?.ends || null,
      events: (trackResult?.scanEvents || []).map(event => ({
        timestamp: event.date,
        description: event.eventDescription,
        location: event.scanLocation ? `${event.scanLocation.city}, ${event.scanLocation.stateOrProvinceCode}` : 'N/A',
      })),
      mock: false,
    };
  } catch (err) {
    console.error('FedEx tracking error:', err.message);
    throw err;
  }
}

module.exports = {
  isConfigured,
  getRates,
  createShipment,
  getTracking,
  DEFAULT_RATES,
};
