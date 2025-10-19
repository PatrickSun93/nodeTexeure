const StripeService = require('../../services/stripeService')
const stripe = require('stripe')

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn(() => ({
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      confirm: jest.fn(),
      cancel: jest.fn()
    },
    refunds: {
      create: jest.fn()
    },
    webhooks: {
      constructEvent: jest.fn()
    },
    customers: {
      create: jest.fn(),
      retrieve: jest.fn()
    }
  }))
})

describe('StripeService', () => {
  let stripeService
  let mockStripe

  beforeEach(() => {
    mockStripe = stripe()
    stripeService = new StripeService()
    stripeService.stripe = mockStripe
  })

  describe('createPaymentIntent', () => {
    it('should create a payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_test123',
        client_secret: 'pi_test123_secret',
        amount: 2000,
        currency: 'usd',
        status: 'requires_payment_method'
      }

      mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent)

      const result = await stripeService.createPaymentIntent({
        amount: 2000,
        currency: 'usd',
        orderId: 'order123',
        customerId: 'cust123'
      })

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 2000,
        currency: 'usd',
        metadata: {
          orderId: 'order123',
          customerId: 'cust123'
        },
        automatic_payment_methods: {
          enabled: true
        }
      })

      expect(result).toEqual({
        success: true,
        paymentIntent: mockPaymentIntent
      })
    })

    it('should handle payment intent creation errors', async () => {
      const error = new Error('Card declined')
      mockStripe.paymentIntents.create.mockRejectedValue(error)

      const result = await stripeService.createPaymentIntent({
        amount: 2000,
        currency: 'usd'
      })

      expect(result).toEqual({
        success: false,
        error: 'Card declined'
      })
    })

    it('should validate required parameters', async () => {
      const result = await stripeService.createPaymentIntent({})

      expect(result).toEqual({
        success: false,
        error: 'Amount and currency are required'
      })
    })
  })

  describe('confirmPayment', () => {
    it('should confirm payment successfully', async () => {
      const mockConfirmedIntent = {
        id: 'pi_test123',
        status: 'succeeded',
        amount: 2000
      }

      mockStripe.paymentIntents.confirm.mockResolvedValue(mockConfirmedIntent)

      const result = await stripeService.confirmPayment('pi_test123', 'pm_test456')

      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith('pi_test123', {
        payment_method: 'pm_test456'
      })

      expect(result).toEqual({
        success: true,
        paymentIntent: mockConfirmedIntent
      })
    })

    it('should handle payment confirmation failures', async () => {
      const error = new Error('Your card was declined')
      mockStripe.paymentIntents.confirm.mockRejectedValue(error)

      const result = await stripeService.confirmPayment('pi_test123', 'pm_test456')

      expect(result).toEqual({
        success: false,
        error: 'Your card was declined'
      })
    })
  })

  describe('createRefund', () => {
    it('should create refund successfully', async () => {
      const mockRefund = {
        id: 're_test123',
        amount: 1000,
        status: 'succeeded'
      }

      mockStripe.refunds.create.mockResolvedValue(mockRefund)

      const result = await stripeService.createRefund('pi_test123', 1000, 'Customer request')

      expect(mockStripe.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_test123',
        amount: 1000,
        reason: 'requested_by_customer',
        metadata: {
          reason: 'Customer request'
        }
      })

      expect(result).toEqual({
        success: true,
        refund: mockRefund
      })
    })

    it('should handle refund creation errors', async () => {
      const error = new Error('Refund failed')
      mockStripe.refunds.create.mockRejectedValue(error)

      const result = await stripeService.createRefund('pi_test123', 1000)

      expect(result).toEqual({
        success: false,
        error: 'Refund failed'
      })
    })
  })

  describe('handleWebhook', () => {
    it('should handle webhook events successfully', async () => {
      const mockEvent = {
        id: 'evt_test123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test123',
            status: 'succeeded',
            metadata: { orderId: 'order123' }
          }
        }
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent)

      const result = await stripeService.handleWebhook('raw_body', 'signature')

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        'raw_body',
        'signature',
        process.env.STRIPE_WEBHOOK_SECRET
      )

      expect(result).toEqual({
        success: true,
        event: mockEvent
      })
    })

    it('should handle webhook signature verification errors', async () => {
      const error = new Error('Invalid signature')
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw error
      })

      const result = await stripeService.handleWebhook('raw_body', 'invalid_signature')

      expect(result).toEqual({
        success: false,
        error: 'Invalid signature'
      })
    })
  })

  describe('createCustomer', () => {
    it('should create customer successfully', async () => {
      const mockCustomer = {
        id: 'cus_test123',
        email: 'test@example.com'
      }

      mockStripe.customers.create.mockResolvedValue(mockCustomer)

      const result = await stripeService.createCustomer({
        email: 'test@example.com',
        name: 'Test User'
      })

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User'
      })

      expect(result).toEqual({
        success: true,
        customer: mockCustomer
      })
    })
  })
})