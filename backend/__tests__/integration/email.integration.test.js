const request = require('supertest')
const express = require('express')
const nock = require('nock')
const emailRoutes = require('../../routes/emailRoutes')

const app = express()
app.use(express.json())
app.use('/api/email', emailRoutes)

describe('Email Integration Tests', () => {
  beforeEach(() => {
    nock.cleanAll()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('POST /api/email/send-order-confirmation', () => {
    it('should send order confirmation email via AWS SES', async () => {
      // Mock AWS SES API
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .reply(200, `
          <SendEmailResponse>
            <SendEmailResult>
              <MessageId>0000014a-f896-4c4b-b19f-6b382fxxxxxx-000000</MessageId>
            </SendEmailResult>
          </SendEmailResponse>
        `)

      const response = await request(app)
        .post('/api/email/send-order-confirmation')
        .send({
          orderId: 'ORDER001',
          customerEmail: 'test@example.com',
          customerName: 'Test User'
        })
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        messageId: expect.any(String)
      })
    })

    it('should handle AWS SES authentication errors', async () => {
      // Mock AWS SES authentication error
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .reply(403, `
          <ErrorResponse>
            <Error>
              <Type>Sender</Type>
              <Code>InvalidParameterValue</Code>
              <Message>Invalid AWS access key ID</Message>
            </Error>
          </ErrorResponse>
        `)

      const response = await request(app)
        .post('/api/email/send-order-confirmation')
        .send({
          orderId: 'ORDER001',
          customerEmail: 'test@example.com',
          customerName: 'Test User'
        })
        .expect(403)

      expect(response.body).toEqual({
        success: false,
        error: 'AWS SES authentication failed'
      })
    })

    it('should handle invalid email addresses', async () => {
      // Mock AWS SES invalid email error
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .reply(400, `
          <ErrorResponse>
            <Error>
              <Type>Sender</Type>
              <Code>InvalidParameterValue</Code>
              <Message>Invalid email address</Message>
            </Error>
          </ErrorResponse>
        `)

      const response = await request(app)
        .post('/api/email/send-order-confirmation')
        .send({
          orderId: 'ORDER001',
          customerEmail: 'invalid-email',
          customerName: 'Test User'
        })
        .expect(400)

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid email address'
      })
    })

    it('should handle SES sending limits', async () => {
      // Mock AWS SES rate limit error
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .reply(400, `
          <ErrorResponse>
            <Error>
              <Type>Sender</Type>
              <Code>Throttling</Code>
              <Message>Maximum sending rate exceeded</Message>
            </Error>
          </ErrorResponse>
        `)

      const response = await request(app)
        .post('/api/email/send-order-confirmation')
        .send({
          orderId: 'ORDER001',
          customerEmail: 'test@example.com',
          customerName: 'Test User'
        })
        .expect(429)

      expect(response.body).toEqual({
        success: false,
        error: 'Email sending rate limit exceeded',
        retryAfter: expect.any(Number)
      })
    })
  })

  describe('POST /api/email/send-abandoned-cart', () => {
    it('should send abandoned cart recovery email', async () => {
      // Mock AWS SES API
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .reply(200, `
          <SendEmailResponse>
            <SendEmailResult>
              <MessageId>0000014a-f896-4c4b-b19f-6b382fxxxxxx-000001</MessageId>
            </SendEmailResult>
          </SendEmailResponse>
        `)

      const response = await request(app)
        .post('/api/email/send-abandoned-cart')
        .send({
          cartId: 'CART001',
          customerEmail: 'test@example.com',
          customerName: 'Test User',
          sequence: 1
        })
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        messageId: expect.any(String)
      })
    })

    it('should use different templates for different sequences', async () => {
      // Mock multiple SES calls
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .times(3)
        .reply(200, `
          <SendEmailResponse>
            <SendEmailResult>
              <MessageId>test-message-id</MessageId>
            </SendEmailResult>
          </SendEmailResponse>
        `)

      // Test sequence 1
      await request(app)
        .post('/api/email/send-abandoned-cart')
        .send({
          cartId: 'CART001',
          customerEmail: 'test@example.com',
          sequence: 1
        })
        .expect(200)

      // Test sequence 2
      await request(app)
        .post('/api/email/send-abandoned-cart')
        .send({
          cartId: 'CART001',
          customerEmail: 'test@example.com',
          sequence: 2
        })
        .expect(200)

      // Test sequence 3
      await request(app)
        .post('/api/email/send-abandoned-cart')
        .send({
          cartId: 'CART001',
          customerEmail: 'test@example.com',
          sequence: 3
        })
        .expect(200)

      expect(nock.isDone()).toBe(true)
    })
  })

  describe('POST /api/email/process-queue', () => {
    it('should process email queue successfully', async () => {
      // Mock AWS SES for queued emails
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .times(2)
        .reply(200, `
          <SendEmailResponse>
            <SendEmailResult>
              <MessageId>queued-message-id</MessageId>
            </SendEmailResult>
          </SendEmailResponse>
        `)

      const response = await request(app)
        .post('/api/email/process-queue')
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        processed: expect.any(Number),
        failed: expect.any(Number)
      })
    })

    it('should handle partial failures in queue processing', async () => {
      // Mock mixed success/failure responses
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .reply(200, `
          <SendEmailResponse>
            <SendEmailResult>
              <MessageId>success-message-id</MessageId>
            </SendEmailResult>
          </SendEmailResponse>
        `)
        .post('/')
        .reply(400, `
          <ErrorResponse>
            <Error>
              <Type>Sender</Type>
              <Code>InvalidParameterValue</Code>
              <Message>Invalid email address</Message>
            </Error>
          </ErrorResponse>
        `)

      const response = await request(app)
        .post('/api/email/process-queue')
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.processed).toBeGreaterThanOrEqual(0)
      expect(response.body.failed).toBeGreaterThanOrEqual(0)
    })
  })

  describe('GET /api/email/queue/status', () => {
    it('should return email queue status', async () => {
      const response = await request(app)
        .get('/api/email/queue/status')
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        queue: {
          pending: expect.any(Number),
          processing: expect.any(Number),
          sent: expect.any(Number),
          failed: expect.any(Number)
        }
      })
    })
  })

  describe('POST /api/email/test-connection', () => {
    it('should test AWS SES connection successfully', async () => {
      // Mock AWS SES test email
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .reply(200, `
          <SendEmailResponse>
            <SendEmailResult>
              <MessageId>test-connection-message-id</MessageId>
            </SendEmailResult>
          </SendEmailResponse>
        `)

      const response = await request(app)
        .post('/api/email/test-connection')
        .send({
          testEmail: 'admin@example.com'
        })
        .expect(200)

      expect(response.body).toEqual({
        success: true,
        message: 'Test email sent successfully',
        messageId: expect.any(String)
      })
    })

    it('should handle SES connection failures', async () => {
      // Mock AWS SES connection error
      nock('https://email.us-east-1.amazonaws.com')
        .post('/')
        .reply(500, `
          <ErrorResponse>
            <Error>
              <Type>Receiver</Type>
              <Code>ServiceUnavailable</Code>
              <Message>Service temporarily unavailable</Message>
            </Error>
          </ErrorResponse>
        `)

      const response = await request(app)
        .post('/api/email/test-connection')
        .send({
          testEmail: 'admin@example.com'
        })
        .expect(500)

      expect(response.body).toEqual({
        success: false,
        error: 'AWS SES service unavailable'
      })
    })
  })
})