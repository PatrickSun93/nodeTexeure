const EmailService = require('../../services/emailService')
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')
const db = require('../../utils/database')

jest.mock('@aws-sdk/client-ses')
jest.mock('../../utils/database')

describe('EmailService', () => {
  let emailService
  let mockSESClient

  beforeEach(() => {
    mockSESClient = {
      send: jest.fn()
    }
    SESClient.mockImplementation(() => mockSESClient)
    
    emailService = new EmailService()
    jest.clearAllMocks()
  })

  describe('sendOrderConfirmation', () => {
    it('should send order confirmation email successfully', async () => {
      const mockOrder = {
        id: 'ORDER001',
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        total_amount: 99.99,
        items: [
          { name: 'Product 1', quantity: 2, price: 49.99 }
        ]
      }

      db.query.mockResolvedValue([mockOrder])
      mockSESClient.send.mockResolvedValue({ MessageId: 'msg123' })

      const result = await emailService.sendOrderConfirmation('ORDER001')

      expect(mockSESClient.send).toHaveBeenCalledWith(
        expect.any(SendEmailCommand)
      )

      expect(result).toEqual({
        success: true,
        messageId: 'msg123'
      })
    })

    it('should handle order not found', async () => {
      db.query.mockResolvedValue([])

      const result = await emailService.sendOrderConfirmation('NONEXISTENT')

      expect(result).toEqual({
        success: false,
        error: 'Order not found'
      })
    })

    it('should handle SES sending errors', async () => {
      const mockOrder = {
        id: 'ORDER001',
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        total_amount: 99.99
      }

      db.query.mockResolvedValue([mockOrder])
      mockSESClient.send.mockRejectedValue(new Error('SES error'))

      const result = await emailService.sendOrderConfirmation('ORDER001')

      expect(result).toEqual({
        success: false,
        error: 'SES error'
      })
    })
  })

  describe('sendStatusUpdate', () => {
    it('should send status update email successfully', async () => {
      const mockOrder = {
        id: 'ORDER001',
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        status: 'shipped',
        tracking_number: 'TRACK123'
      }

      db.query.mockResolvedValue([mockOrder])
      mockSESClient.send.mockResolvedValue({ MessageId: 'msg124' })

      const result = await emailService.sendStatusUpdate('ORDER001', 'shipped')

      expect(result).toEqual({
        success: true,
        messageId: 'msg124'
      })
    })
  })

  describe('sendAbandonedCartEmail', () => {
    it('should send abandoned cart recovery email', async () => {
      const mockCart = {
        id: 'CART001',
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        items: [
          { name: 'Product 1', quantity: 1, price: 99.99 }
        ],
        total: 99.99
      }

      db.query.mockResolvedValue([mockCart])
      mockSESClient.send.mockResolvedValue({ MessageId: 'msg125' })

      const result = await emailService.sendAbandonedCartEmail('CART001', 1)

      expect(result).toEqual({
        success: true,
        messageId: 'msg125'
      })
    })

    it('should use different templates for different sequences', async () => {
      const mockCart = {
        id: 'CART001',
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        items: [],
        total: 99.99
      }

      db.query.mockResolvedValue([mockCart])
      mockSESClient.send.mockResolvedValue({ MessageId: 'msg126' })

      // Test sequence 1 (1 hour)
      await emailService.sendAbandonedCartEmail('CART001', 1)
      
      // Test sequence 2 (24 hours)
      await emailService.sendAbandonedCartEmail('CART001', 2)
      
      // Test sequence 3 (3 days)
      await emailService.sendAbandonedCartEmail('CART001', 3)

      expect(mockSESClient.send).toHaveBeenCalledTimes(3)
    })
  })

  describe('queueEmail', () => {
    it('should queue email for later sending', async () => {
      db.query.mockResolvedValue({ insertId: 'QUEUE001' })

      const result = await emailService.queueEmail({
        to: 'test@example.com',
        subject: 'Test Email',
        template: 'test-template',
        data: { name: 'Test User' },
        priority: 'high'
      })

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO email_queue'),
        expect.arrayContaining(['test@example.com', 'Test Email'])
      )

      expect(result).toEqual({
        success: true,
        queueId: 'QUEUE001'
      })
    })
  })

  describe('processEmailQueue', () => {
    it('should process queued emails', async () => {
      const mockQueuedEmails = [
        {
          id: 'QUEUE001',
          recipient_email: 'test@example.com',
          subject: 'Test Email',
          template_name: 'test-template',
          template_data: JSON.stringify({ name: 'Test User' }),
          attempts: 0
        }
      ]

      db.query
        .mockResolvedValueOnce(mockQueuedEmails) // Get queued emails
        .mockResolvedValue({ affectedRows: 1 })  // Update operations

      mockSESClient.send.mockResolvedValue({ MessageId: 'msg127' })

      const result = await emailService.processEmailQueue()

      expect(result).toEqual({
        success: true,
        processed: 1,
        failed: 0
      })
    })

    it('should handle failed email sending with retry logic', async () => {
      const mockQueuedEmails = [
        {
          id: 'QUEUE001',
          recipient_email: 'test@example.com',
          subject: 'Test Email',
          template_name: 'test-template',
          template_data: JSON.stringify({ name: 'Test User' }),
          attempts: 2
        }
      ]

      db.query
        .mockResolvedValueOnce(mockQueuedEmails)
        .mockResolvedValue({ affectedRows: 1 })

      mockSESClient.send.mockRejectedValue(new Error('Temporary failure'))

      const result = await emailService.processEmailQueue()

      expect(result).toEqual({
        success: true,
        processed: 0,
        failed: 1
      })

      // Should increment attempts
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE email_queue SET attempts = attempts + 1'),
        expect.arrayContaining(['QUEUE001'])
      )
    })

    it('should mark emails as failed after max attempts', async () => {
      const mockQueuedEmails = [
        {
          id: 'QUEUE001',
          recipient_email: 'test@example.com',
          subject: 'Test Email',
          template_name: 'test-template',
          template_data: JSON.stringify({ name: 'Test User' }),
          attempts: 3 // Max attempts reached
        }
      ]

      db.query
        .mockResolvedValueOnce(mockQueuedEmails)
        .mockResolvedValue({ affectedRows: 1 })

      mockSESClient.send.mockRejectedValue(new Error('Permanent failure'))

      await emailService.processEmailQueue()

      // Should mark as failed
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE email_queue SET status = ?'),
        expect.arrayContaining(['failed', 'QUEUE001'])
      )
    })
  })

  describe('getEmailTemplate', () => {
    it('should render email template with data', () => {
      const template = emailService.getEmailTemplate('order-confirmation', {
        customerName: 'Test User',
        orderId: 'ORDER001',
        orderTotal: 99.99
      })

      expect(template).toContain('Test User')
      expect(template).toContain('ORDER001')
      expect(template).toContain('$99.99')
    })

    it('should handle missing template', () => {
      const template = emailService.getEmailTemplate('nonexistent-template', {})

      expect(template).toContain('Template not found')
    })
  })
})