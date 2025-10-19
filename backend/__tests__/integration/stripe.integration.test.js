const request = require('supertest')
const express = require('express')
const nock = require('nock')
const paymentRoutes = require('../../routes/paymentRoutes')

const app = express()
app.use(express.json())
app.use('/api/payments', paymentRoutes)

describe('Stripe Integration Tests', () => {
  beforeEach(() => {
    nock.cleanAll()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('POST /api/payments/create-intent', () => {
    it('should create payment intent successfully', async () => {
      // Mock Stripe API response
      nock('https://api.stripe.com')
        .post('/v1/payment_intents')
        .reply(200, {
          id: 'pi_test123',
          client_secret: 'pi_test123_secret',
          amount: 2000,
          currency: 'usd',
          status: 'requires_payment_method'
        })

      const response = await request(app)
        .post('/api/payments/create-intent')
        .send({
          amount: 2000,
          currency: 'usd',
          orderId: 'ORDER001'
        })
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        clientSecret: 'pi_test123_secret',
        paymentIntentId: 'pi_test123'
      })
    })

    it('should handle Stripe API errors', async () => {
      // Mock Stripe API error
      nock('https://api.stripe.com')
        .post('/v1/payment_intents')
        .reply(400, {
          error: {
            type: 'card_error',
            code: 'card_declined',
            message: 'Your card was declined.'
          }
        })

      const response = await request(app)
        .post('/api/payments/create-intent')
        .send({
          amount: 2000,
          currency: 'usd',
          orderId: 'ORDER001'
        })
        .expect(400)

      expect(response.body).toEqual({
        success: false,
        error: 'Your card was declined.'
      })
    })

    it('should validate required parameters', async () => {
      const response = await request(app)
        .post('/api/payments/create-intent')
        .send({
          currency: 'usd'
          // Missing amount
        })
        .expect(400)

      expect(response.body).toEqual({
        success: false,
        error: 'Amount is required'
      })
    })
  })

  describe('POST /api/payments/webhook', () => {
    it('should handle payment_intent.succeeded webhook', async () => {
      const webhookPayload = {
        id: 'evt_test123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test123',
            status: 'succeeded',
            amount: 2000,
            metadata: {
              orderId: 'ORDER001'
            }
          }
        }
      }

      // Mock Stripe webhook signature verification
      nock('https://api.stripe.com')
        .post('/v1/webhook_endpoints/construct_event')
        .reply(200, webhookPayload)

      const response = await request(app)
        .post('/api/payments/webhook')
        .set('stripe-signature', 'test_signature')
        .send(webhookPayload)
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        message: 'Webhook processed successfully'
      })
    })

    it('should handle invalid webhook signatures', async () => {
      const response = await request(app)
        .post('/api/payments/webhook')
        .set('stripe-signature', 'invalid_signature')
        .send({})
        .expect(400)

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid webhook signature'
      })
    })
  })

  describe('POST /api/payments/refund', () => {
    it('should process refund successfully', async () => {
      // Mock Stripe refund API
      nock('https://api.stripe.com')
        .post('/v1/refunds')
        .reply(200, {
          id: 're_test123',
          amount: 1000,
          status: 'succeeded',
          payment_intent: 'pi_test123'
        })

      const response = await request(app)
        .post('/api/payments/refund')
        .send({
          paymentIntentId: 'pi_test123',
          amount: 1000,
          reason: 'Customer request'
        })
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        refund: {
          id: 're_test123',
          amount: 1000,
          status: 'succeeded'
        }
      })
    })

    it('should handle refund failures', async () => {
      // Mock Stripe refund error
      nock('https://api.stripe.com')
        .post('/v1/refunds')
        .reply(400, {
          error: {
            type: 'invalid_request_error',
            message: 'This payment intent cannot be refunded'
          }
        })

      const response = await request(app)
        .post('/api/payments/refund')
        .send({
          paymentIntentId: 'pi_test123',
          amount: 1000
        })
        .expect(400)

      expect(response.body).toEqual({
        success: false,
        error: 'This payment intent cannot be refunded'
      })
    })
  })
})