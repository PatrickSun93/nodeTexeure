const request = require('supertest')
const express = require('express')
const nock = require('nock')
const fedexRoutes = require('../../routes/fedexRoutes')

const app = express()
app.use(express.json())
app.use('/api/fedex', fedexRoutes)

describe('FedEx Integration Tests', () => {
  beforeEach(() => {
    nock.cleanAll()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('POST /api/fedex/rates', () => {
    it('should get shipping rates successfully', async () => {
      // Mock FedEx OAuth token request
      nock('https://apis-sandbox.fedex.com')
        .post('/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'bearer',
          expires_in: 3600
        })

      // Mock FedEx rates API
      nock('https://apis-sandbox.fedex.com')
        .post('/rate/v1/rates/quotes')
        .reply(200, {
          output: {
            rateReplyDetails: [
              {
                serviceType: 'FEDEX_GROUND',
                ratedShipmentDetails: [
                  {
                    totalNetCharge: 15.99,
                    currency: 'USD'
                  }
                ],
                operationalDetail: {
                  transitTime: 'THREE_DAYS'
                }
              },
              {
                serviceType: 'FEDEX_2_DAY',
                ratedShipmentDetails: [
                  {
                    totalNetCharge: 25.99,
                    currency: 'USD'
                  }
                ],
                operationalDetail: {
                  transitTime: 'TWO_DAYS'
                }
              }
            ]
          }
        })

      const response = await request(app)
        .post('/api/fedex/rates')
        .send({
          origin: {
            postalCode: '10001',
            countryCode: 'US'
          },
          destination: {
            postalCode: '90210',
            countryCode: 'US'
          },
          packages: [
            {
              weight: { value: 5, units: 'LB' },
              dimensions: {
                length: 10,
                width: 8,
                height: 6,
                units: 'IN'
              }
            }
          ]
        })
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        rates: [
          {
            service: 'FEDEX_GROUND',
            cost: 15.99,
            currency: 'USD',
            transitTime: 'THREE_DAYS'
          },
          {
            service: 'FEDEX_2_DAY',
            cost: 25.99,
            currency: 'USD',
            transitTime: 'TWO_DAYS'
          }
        ]
      })
    })

    it('should handle FedEx API authentication errors', async () => {
      // Mock failed OAuth token request
      nock('https://apis-sandbox.fedex.com')
        .post('/oauth/token')
        .reply(401, {
          error: 'invalid_client',
          error_description: 'Invalid client credentials'
        })

      const response = await request(app)
        .post('/api/fedex/rates')
        .send({
          origin: { postalCode: '10001', countryCode: 'US' },
          destination: { postalCode: '90210', countryCode: 'US' },
          packages: [{ weight: { value: 5, units: 'LB' } }]
        })
        .expect(401)

      expect(response.body).toEqual({
        success: false,
        error: 'FedEx authentication failed'
      })
    })

    it('should handle invalid shipping addresses', async () => {
      // Mock successful OAuth
      nock('https://apis-sandbox.fedex.com')
        .post('/oauth/token')
        .reply(200, { access_token: 'test_token' })

      // Mock FedEx API error for invalid address
      nock('https://apis-sandbox.fedex.com')
        .post('/rate/v1/rates/quotes')
        .reply(400, {
          errors: [
            {
              code: 'INVALID.POSTAL.CODE',
              message: 'Invalid postal code'
            }
          ]
        })

      const response = await request(app)
        .post('/api/fedex/rates')
        .send({
          origin: { postalCode: '10001', countryCode: 'US' },
          destination: { postalCode: 'INVALID', countryCode: 'US' },
          packages: [{ weight: { value: 5, units: 'LB' } }]
        })
        .expect(400)

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid postal code'
      })
    })
  })

  describe('POST /api/fedex/ship', () => {
    it('should create shipment successfully', async () => {
      // Mock OAuth token
      nock('https://apis-sandbox.fedex.com')
        .post('/oauth/token')
        .reply(200, { access_token: 'test_token' })

      // Mock shipment creation
      nock('https://apis-sandbox.fedex.com')
        .post('/ship/v1/shipments')
        .reply(200, {
          output: {
            transactionShipments: [
              {
                masterTrackingNumber: '1234567890',
                serviceType: 'FEDEX_GROUND',
                shipmentDocuments: [
                  {
                    contentType: 'application/pdf',
                    docType: 'LABEL',
                    encodedLabel: 'base64_encoded_label'
                  }
                ]
              }
            ]
          }
        })

      const response = await request(app)
        .post('/api/fedex/ship')
        .send({
          orderId: 'ORDER001',
          serviceType: 'FEDEX_GROUND',
          shipper: {
            contact: { personName: 'Sender Name' },
            address: {
              streetLines: ['123 Main St'],
              city: 'New York',
              stateOrProvinceCode: 'NY',
              postalCode: '10001',
              countryCode: 'US'
            }
          },
          recipients: [
            {
              contact: { personName: 'Recipient Name' },
              address: {
                streetLines: ['456 Oak Ave'],
                city: 'Los Angeles',
                stateOrProvinceCode: 'CA',
                postalCode: '90210',
                countryCode: 'US'
              }
            }
          ],
          packages: [
            {
              weight: { value: 5, units: 'LB' },
              dimensions: {
                length: 10,
                width: 8,
                height: 6,
                units: 'IN'
              }
            }
          ]
        })
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        trackingNumber: '1234567890',
        serviceType: 'FEDEX_GROUND',
        labelUrl: expect.any(String)
      })
    })
  })

  describe('GET /api/fedex/track/:trackingNumber', () => {
    it('should track shipment successfully', async () => {
      // Mock OAuth token
      nock('https://apis-sandbox.fedex.com')
        .post('/oauth/token')
        .reply(200, { access_token: 'test_token' })

      // Mock tracking API
      nock('https://apis-sandbox.fedex.com')
        .post('/track/v1/trackingnumbers')
        .reply(200, {
          output: {
            completeTrackResults: [
              {
                trackingNumber: '1234567890',
                trackResults: [
                  {
                    trackingNumberInfo: {
                      trackingNumber: '1234567890'
                    },
                    latestStatusDetail: {
                      code: 'DL',
                      description: 'Delivered',
                      scanLocation: {
                        city: 'LOS ANGELES',
                        stateOrProvinceCode: 'CA',
                        countryCode: 'US'
                      }
                    },
                    dateAndTimes: [
                      {
                        type: 'ACTUAL_DELIVERY',
                        dateTime: '2024-01-15T14:30:00-08:00'
                      }
                    ],
                    scanEvents: [
                      {
                        date: '2024-01-15T14:30:00-08:00',
                        eventType: 'DL',
                        eventDescription: 'Delivered',
                        scanLocation: {
                          city: 'LOS ANGELES',
                          stateOrProvinceCode: 'CA'
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        })

      const response = await request(app)
        .get('/api/fedex/track/1234567890')
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        trackingInfo: {
          trackingNumber: '1234567890',
          status: 'Delivered',
          location: 'LOS ANGELES, CA, US',
          deliveryDate: '2024-01-15T14:30:00-08:00',
          events: [
            {
              date: '2024-01-15T14:30:00-08:00',
              status: 'Delivered',
              location: 'LOS ANGELES, CA'
            }
          ]
        }
      })
    })

    it('should handle tracking number not found', async () => {
      // Mock OAuth token
      nock('https://apis-sandbox.fedex.com')
        .post('/oauth/token')
        .reply(200, { access_token: 'test_token' })

      // Mock tracking API error
      nock('https://apis-sandbox.fedex.com')
        .post('/track/v1/trackingnumbers')
        .reply(404, {
          errors: [
            {
              code: 'TRACKING.NUMBER.NOT.FOUND',
              message: 'Tracking number not found'
            }
          ]
        })

      const response = await request(app)
        .get('/api/fedex/track/INVALID123')
        .expect(404)

      expect(response.body).toEqual({
        success: false,
        error: 'Tracking number not found'
      })
    })
  })
})