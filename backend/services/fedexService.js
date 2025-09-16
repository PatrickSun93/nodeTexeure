const axios = require('axios');
const db = require('../utils/database');
const logger = require('../utils/logger');

class FedExService {
  constructor() {
    // FedEx API configuration
    this.baseURL = process.env.FEDEX_API_URL || 'https://apis-sandbox.fedex.com'; // Use sandbox for development
    this.apiKey = process.env.FEDEX_API_KEY;
    this.secretKey = process.env.FEDEX_SECRET_KEY;
    this.accountNumber = process.env.FEDEX_ACCOUNT_NUMBER;
    this.meterNumber = process.env.FEDEX_METER_NUMBER;
    
    // OAuth token for API authentication
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get OAuth access token for FedEx API
   * @returns {Promise<string>} - Access token
   */
  async getAccessToken() {
    try {
      // Check if current token is still valid
      if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.accessToken;
      }

      const response = await axios.post(`${this.baseURL}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: this.apiKey,
        client_secret: this.secretKey
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      // Set expiry to 5 minutes before actual expiry for safety
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);
      
      return this.accessToken;
    } catch (error) {
      logger.error('Error getting FedEx access token:', error);
      throw new Error('Failed to authenticate with FedEx API');
    }
  }

  /**
   * Get shipping rates from FedEx
   * @param {Object} shipmentDetails - Shipment details
   * @returns {Promise<Array>} - Array of shipping rates
   */
  async getRates(shipmentDetails) {
    try {
      const token = await this.getAccessToken();
      
      const rateRequest = {
        accountNumber: {
          value: this.accountNumber
        },
        requestedShipment: {
          shipper: {
            address: {
              postalCode: shipmentDetails.origin.postalCode,
              countryCode: shipmentDetails.origin.countryCode,
              stateOrProvinceCode: shipmentDetails.origin.stateCode
            }
          },
          recipient: {
            address: {
              postalCode: shipmentDetails.destination.postalCode,
              countryCode: shipmentDetails.destination.countryCode,
              stateOrProvinceCode: shipmentDetails.destination.stateCode,
              city: shipmentDetails.destination.city
            }
          },
          pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
          rateRequestType: ['ACCOUNT', 'LIST'],
          requestedPackageLineItems: [{
            weight: {
              units: 'LB',
              value: shipmentDetails.weight
            },
            dimensions: {
              length: shipmentDetails.dimensions.length,
              width: shipmentDetails.dimensions.width,
              height: shipmentDetails.dimensions.height,
              units: 'IN'
            }
          }]
        }
      };

      const response = await axios.post(`${this.baseURL}/rate/v1/rates/quotes`, rateRequest, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US'
        }
      });

      if (response.data.output && response.data.output.rateReplyDetails) {
        return response.data.output.rateReplyDetails.map(rate => ({
          serviceType: rate.serviceType,
          serviceName: rate.serviceName,
          totalNetCharge: parseFloat(rate.ratedShipmentDetails[0].totalNetCharge),
          currency: rate.ratedShipmentDetails[0].currency,
          transitTime: rate.operationalDetail?.transitTime,
          deliveryDate: rate.operationalDetail?.deliveryDate,
          deliveryDay: rate.operationalDetail?.deliveryDay
        }));
      }

      return [];
    } catch (error) {
      logger.error('Error getting FedEx rates:', error);
      throw new Error('Failed to get shipping rates from FedEx');
    }
  }

  /**
   * Create a shipment with FedEx
   * @param {string} orderId - Order ID
   * @param {Object} shipmentData - Shipment data
   * @returns {Promise<Object>} - Shipment creation result
   */
  async createShipment(orderId, shipmentData) {
    try {
      const token = await this.getAccessToken();
      
      const shipmentRequest = {
        labelResponseOptions: 'URL_ONLY',
        requestedShipment: {
          shipper: {
            contact: {
              personName: shipmentData.shipper.name,
              phoneNumber: shipmentData.shipper.phone,
              companyName: shipmentData.shipper.company || 'Bed Texture Store'
            },
            address: {
              streetLines: [shipmentData.shipper.address1, shipmentData.shipper.address2].filter(Boolean),
              city: shipmentData.shipper.city,
              stateOrProvinceCode: shipmentData.shipper.state,
              postalCode: shipmentData.shipper.postalCode,
              countryCode: shipmentData.shipper.countryCode
            }
          },
          recipients: [{
            contact: {
              personName: `${shipmentData.recipient.firstName} ${shipmentData.recipient.lastName}`,
              phoneNumber: shipmentData.recipient.phone
            },
            address: {
              streetLines: [shipmentData.recipient.address1, shipmentData.recipient.address2].filter(Boolean),
              city: shipmentData.recipient.city,
              stateOrProvinceCode: shipmentData.recipient.state,
              postalCode: shipmentData.recipient.postalCode,
              countryCode: shipmentData.recipient.countryCode
            }
          }],
          shipDatestamp: new Date().toISOString().split('T')[0],
          serviceType: shipmentData.serviceType || 'FEDEX_GROUND',
          packagingType: 'YOUR_PACKAGING',
          pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
          blockInsightVisibility: false,
          shippingChargesPayment: {
            paymentType: 'SENDER'
          },
          labelSpecification: {
            imageType: 'PDF',
            labelStockType: 'PAPER_85X11_TOP_HALF_LABEL'
          },
          requestedPackageLineItems: [{
            weight: {
              units: 'LB',
              value: shipmentData.weight
            },
            dimensions: {
              length: shipmentData.dimensions.length,
              width: shipmentData.dimensions.width,
              height: shipmentData.dimensions.height,
              units: 'IN'
            }
          }]
        },
        accountNumber: {
          value: this.accountNumber
        }
      };

      const response = await axios.post(`${this.baseURL}/ship/v1/shipments`, shipmentRequest, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US'
        }
      });

      if (response.data.output && response.data.output.transactionShipments) {
        const shipment = response.data.output.transactionShipments[0];
        const trackingNumber = shipment.pieceResponses[0].trackingNumber;
        const shipmentId = shipment.masterTrackingNumber || trackingNumber;

        // Store shipment details in database
        await this.storeShipmentDetails(orderId, {
          shipmentId,
          trackingNumber,
          serviceType: shipmentData.serviceType || 'FEDEX_GROUND',
          packageDetails: {
            weight: shipmentData.weight,
            dimensions: shipmentData.dimensions,
            declaredValue: shipmentData.declaredValue || 0,
            packageCount: 1
          },
          shippingAddress: shipmentData.recipient,
          fedexResponse: response.data
        });

        // Update order with tracking information
        await this.updateOrderTracking(orderId, trackingNumber, shipmentId);

        return {
          success: true,
          trackingNumber,
          shipmentId,
          labelUrl: shipment.pieceResponses[0].packageDocuments[0].url,
          estimatedDelivery: shipment.serviceDetail?.commitDate
        };
      }

      throw new Error('Invalid response from FedEx API');
    } catch (error) {
      logger.error('Error creating FedEx shipment:', error);
      throw new Error('Failed to create shipment with FedEx');
    }
  }

  /**
   * Track a shipment using FedEx tracking API
   * @param {string} trackingNumber - FedEx tracking number
   * @returns {Promise<Object>} - Tracking information
   */
  async trackShipment(trackingNumber) {
    try {
      const token = await this.getAccessToken();
      
      const trackingRequest = {
        includeDetailedScans: true,
        trackingInfo: [{
          trackingNumberInfo: {
            trackingNumber: trackingNumber
          }
        }]
      };

      const response = await axios.post(`${this.baseURL}/track/v1/trackingnumbers`, trackingRequest, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US'
        }
      });

      if (response.data.output && response.data.output.completeTrackResults) {
        const trackResult = response.data.output.completeTrackResults[0];
        const trackDetails = trackResult.trackResults[0];

        // Update tracking events in database
        if (trackDetails.scanEvents) {
          await this.updateTrackingEvents(trackingNumber, trackDetails.scanEvents);
        }

        return {
          success: true,
          trackingNumber,
          status: trackDetails.latestStatusDetail?.description || 'Unknown',
          statusCode: trackDetails.latestStatusDetail?.code,
          estimatedDelivery: trackDetails.estimatedDeliveryTimeWindow?.window?.ends,
          actualDelivery: trackDetails.actualDeliveryTimestamp,
          location: trackDetails.latestStatusDetail?.scanLocation,
          events: trackDetails.scanEvents?.map(event => ({
            timestamp: event.date,
            description: event.eventDescription,
            location: event.scanLocation,
            eventType: event.eventType
          })) || []
        };
      }

      throw new Error('No tracking information found');
    } catch (error) {
      logger.error('Error tracking FedEx shipment:', error);
      throw new Error('Failed to track shipment');
    }
  }

  /**
   * Store shipment details in database
   * @param {string} orderId - Order ID
   * @param {Object} shipmentData - Shipment data
   * @returns {Promise<void>}
   */
  async storeShipmentDetails(orderId, shipmentData) {
    try {
      const shipmentId = await this.getNextId('FEDX');
      
      const query = `
        INSERT INTO fedex_shipments (
          id, order_id, shipment_id, tracking_number, service_type,
          package_details, shipping_address, fedex_response
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await db.executeQuery(query, [
        shipmentId,
        orderId,
        shipmentData.shipmentId,
        shipmentData.trackingNumber,
        shipmentData.serviceType,
        JSON.stringify(shipmentData.packageDetails),
        JSON.stringify(shipmentData.shippingAddress),
        JSON.stringify(shipmentData.fedexResponse)
      ]);
    } catch (error) {
      logger.error('Error storing shipment details:', error);
      throw error;
    }
  }

  /**
   * Update order with tracking information
   * @param {string} orderId - Order ID
   * @param {string} trackingNumber - Tracking number
   * @param {string} shipmentId - FedEx shipment ID
   * @returns {Promise<void>}
   */
  async updateOrderTracking(orderId, trackingNumber, shipmentId) {
    try {
      const query = `
        UPDATE orders 
        SET fedex_tracking_number = ?, 
            fedex_shipment_id = ?,
            tracking_number = ?,
            carrier_name = 'FedEx',
            status = 'shipped',
            shipped_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await db.executeQuery(query, [trackingNumber, shipmentId, trackingNumber, orderId]);
    } catch (error) {
      logger.error('Error updating order tracking:', error);
      throw error;
    }
  }

  /**
   * Update tracking events in database
   * @param {string} trackingNumber - Tracking number
   * @param {Array} events - Array of tracking events
   * @returns {Promise<void>}
   */
  async updateTrackingEvents(trackingNumber, events) {
    try {
      // Get shipment ID from tracking number
      const shipmentQuery = 'SELECT id FROM fedex_shipments WHERE tracking_number = ?';
      const shipmentResult = await db.executeQuery(shipmentQuery, [trackingNumber]);
      
      if (!shipmentResult.success || shipmentResult.data.length === 0) {
        return;
      }

      const shipmentId = shipmentResult.data[0].id;

      // Clear existing events and insert new ones
      await db.executeQuery('DELETE FROM fedex_tracking_events WHERE shipment_id = ?', [shipmentId]);

      for (const event of events) {
        const eventId = await this.getNextId('FEVT');
        const insertQuery = `
          INSERT INTO fedex_tracking_events (
            id, shipment_id, event_type, event_description, 
            event_location, event_timestamp
          ) VALUES (?, ?, ?, ?, ?, ?)
        `;

        await db.executeQuery(insertQuery, [
          eventId,
          shipmentId,
          event.eventType || 'UNKNOWN',
          event.eventDescription || '',
          JSON.stringify(event.scanLocation || {}),
          new Date(event.date)
        ]);
      }
    } catch (error) {
      logger.error('Error updating tracking events:', error);
      throw error;
    }
  }

  /**
   * Get shipment details by order ID
   * @param {string} orderId - Order ID
   * @returns {Promise<Object|null>} - Shipment details
   */
  async getShipmentByOrderId(orderId) {
    try {
      const query = `
        SELECT fs.*, o.order_number
        FROM fedex_shipments fs
        JOIN orders o ON fs.order_id = o.id
        WHERE fs.order_id = ?
      `;

      const result = await db.executeQuery(query, [orderId]);
      
      if (result.success && result.data.length > 0) {
        const shipment = result.data[0];
        return {
          ...shipment,
          package_details: JSON.parse(shipment.package_details),
          shipping_address: JSON.parse(shipment.shipping_address)
        };
      }

      return null;
    } catch (error) {
      logger.error('Error getting shipment by order ID:', error);
      throw error;
    }
  }

  /**
   * Get tracking events for a shipment
   * @param {string} trackingNumber - Tracking number
   * @returns {Promise<Array>} - Array of tracking events
   */
  async getTrackingEvents(trackingNumber) {
    try {
      const query = `
        SELECT fte.*
        FROM fedex_tracking_events fte
        JOIN fedex_shipments fs ON fte.shipment_id = fs.id
        WHERE fs.tracking_number = ?
        ORDER BY fte.event_timestamp DESC
      `;

      const result = await db.executeQuery(query, [trackingNumber]);
      
      if (result.success) {
        return result.data.map(event => ({
          ...event,
          event_location: JSON.parse(event.event_location || '{}')
        }));
      }

      return [];
    } catch (error) {
      logger.error('Error getting tracking events:', error);
      throw error;
    }
  }

  /**
   * Validate FedEx API credentials
   * @returns {Promise<boolean>} - True if credentials are valid
   */
  async validateCredentials() {
    try {
      const token = await this.getAccessToken();
      return !!token;
    } catch (error) {
      return false;
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
      logger.error('Error getting next ID:', error);
      throw error;
    }
  }
}

module.exports = new FedExService();