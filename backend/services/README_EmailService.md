# Email Service Documentation

## Overview

The Email Service provides comprehensive email functionality for the e-commerce platform using AWS SES (Simple Email Service). It includes reliable email delivery with queue management, retry logic, and template rendering.

## Components

### 1. EmailService (`emailService.js`)
Core service for sending emails through AWS SES with built-in template rendering.

### 2. EmailQueueService (`emailQueueService.js`)
Queue management system for reliable email delivery with retry logic and failure handling.

### 3. Email Routes (`emailRoutes.js`)
API endpoints for managing email operations.

## Features

- **AWS SES Integration**: Direct integration with Amazon Simple Email Service
- **Email Queue System**: Reliable delivery with retry logic and failure handling
- **Template Rendering**: Built-in HTML and text templates for all email types
- **Multiple Email Types**: Support for order confirmations, status updates, shipping notifications, abandoned cart recovery, welcome emails, and admin alerts
- **Retry Logic**: Automatic retry with exponential backoff for failed deliveries
- **Queue Management**: Priority-based email queue with scheduling capabilities
- **Admin Controls**: Queue statistics, email cancellation, and monitoring

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# AWS SES Configuration
AWS_SES_REGION=us-east-1
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
AWS_SES_FROM_NAME=Bed Texture Store
AWS_SES_REPLY_TO_EMAIL=support@yourdomain.com

# AWS Credentials (shared with S3)
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1
```

### AWS SES Setup

1. **Verify Domain**: Verify your sending domain in AWS SES console
2. **Verify Email Addresses**: For testing, verify individual email addresses
3. **Request Production Access**: Move out of sandbox mode for production use
4. **Configure DKIM**: Set up DomainKeys Identified Mail for better deliverability
5. **Set up SPF/DMARC**: Configure DNS records for email authentication

## Database Schema

The email system uses the following tables:

### email_queue
Stores queued emails for reliable delivery:
- `id`: Unique queue item identifier
- `type`: Email type (order_confirmation, status_update, etc.)
- `recipient`: Recipient email address
- `data`: JSON data for email content
- `priority`: Priority level (1-5, 1 being highest)
- `status`: Current status (pending, completed, failed, cancelled)
- `retry_count`: Number of retry attempts
- `scheduled_at`: When to send the email
- `created_at`: When the email was queued
- `completed_at`: When the email was sent/failed
- `message_id`: AWS SES message ID
- `error_message`: Error details for failed emails

### email_templates
Stores email templates for future customization:
- `id`: Template identifier
- `name`: Template name
- `subject`: Email subject template
- `html_content`: HTML email content
- `text_content`: Plain text content
- `variables`: Available template variables
- `is_active`: Whether template is active

### email_logs
Audit trail for sent emails:
- `id`: Log entry identifier
- `queue_id`: Reference to queue item
- `type`: Email type
- `recipient`: Recipient email
- `subject`: Email subject
- `status`: Delivery status
- `message_id`: AWS SES message ID
- `sent_at`: When email was sent

### email_preferences
User email preferences:
- `user_id`: User identifier
- `email`: User email address
- `order_confirmations`: Preference for order confirmation emails
- `order_updates`: Preference for order update emails
- `shipping_notifications`: Preference for shipping notifications
- `marketing_emails`: Preference for marketing emails
- `abandoned_cart_emails`: Preference for abandoned cart emails

## Usage Examples

### Basic Email Sending

```javascript
const EmailService = require('./services/emailService');
const emailService = new EmailService();

// Send simple email
await emailService.sendEmail(
  'customer@example.com',
  'Test Subject',
  '<h1>Hello World</h1>',
  'Hello World'
);
```

### Queue Management

```javascript
const EmailQueueService = require('./services/emailQueueService');
const emailQueueService = new EmailQueueService();

// Queue order confirmation
await emailQueueService.queueOrderConfirmation(
  'customer@example.com',
  {
    orderNumber: 'ORD-12345',
    totalAmount: '99.99',
    items: [
      { name: 'Product 1', quantity: 2, price: 49.99 }
    ],
    createdAt: new Date()
  }
);

// Queue abandoned cart email with delay
await emailQueueService.queueAbandonedCartEmail(
  'customer@example.com',
  {
    items: [{ name: 'Product 1', quantity: 1, price: 99.99 }],
    totalAmount: '99.99',
    checkoutUrl: 'https://example.com/checkout'
  },
  1 // First email in sequence
);
```

### API Usage

```javascript
// Queue order confirmation via API
const response = await fetch('/api/emails/queue/order-confirmation', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    customerEmail: 'customer@example.com',
    orderData: {
      orderNumber: 'ORD-12345',
      totalAmount: '99.99',
      items: [...]
    }
  })
});

// Get queue statistics
const stats = await fetch('/api/emails/queue/stats', {
  headers: { 'Authorization': 'Bearer ' + adminToken }
});
```

## Email Types

### 1. Order Confirmation
- **Trigger**: When order is placed
- **Content**: Order details, items, total amount
- **Priority**: High (1)

### 2. Order Status Update
- **Trigger**: When order status changes
- **Content**: New status, tracking info (if available)
- **Priority**: Medium (2)

### 3. Shipping Notification
- **Trigger**: When order is shipped
- **Content**: Tracking number, estimated delivery
- **Priority**: High (1)

### 4. Abandoned Cart Recovery
- **Trigger**: Cart abandoned for specified time
- **Content**: Cart items, checkout link
- **Priority**: Low (3)
- **Sequence**: 3 emails (1 hour, 24 hours, 3 days)

### 5. Welcome Email
- **Trigger**: New user registration
- **Content**: Welcome message, account details
- **Priority**: Medium (2)

### 6. Low Stock Alert
- **Trigger**: Product inventory below threshold
- **Content**: List of low stock products
- **Priority**: Low (4)
- **Recipients**: Authorized staff only

## Queue Processing

The email queue is processed automatically every 30 seconds with the following logic:

1. **Fetch Pending Emails**: Get emails ready to be sent (scheduled_at <= now)
2. **Priority Ordering**: Process high priority emails first
3. **Send Email**: Attempt to send via AWS SES
4. **Handle Success**: Mark as completed, log message ID
5. **Handle Failure**: Increment retry count, schedule retry with backoff
6. **Max Retries**: Mark as failed after 3 attempts
7. **Cleanup**: Remove old completed/failed emails after 7 days

### Retry Logic

- **Attempt 1**: Immediate retry after 1 second
- **Attempt 2**: Retry after 5 seconds
- **Attempt 3**: Retry after 15 seconds
- **After 3 attempts**: Mark as permanently failed

## Monitoring and Troubleshooting

### Queue Statistics

Monitor email queue health:

```javascript
const stats = await emailQueueService.getQueueStats();
// Returns: { pending: 5, completed: 100, failed: 2, total: 107 }
```

### Common Issues

1. **AWS SES Sandbox Mode**
   - Can only send to verified email addresses
   - Request production access for unrestricted sending

2. **Domain Verification**
   - Ensure sending domain is verified in AWS SES
   - Set up proper DNS records (DKIM, SPF, DMARC)

3. **Rate Limits**
   - AWS SES has sending rate limits
   - Monitor bounce and complaint rates

4. **Email Deliverability**
   - Use proper from addresses
   - Include unsubscribe links
   - Monitor reputation metrics

### Logs and Debugging

Check application logs for email-related issues:

```bash
# Check email service logs
grep "Email" logs/$(date +%Y-%m-%d).txt

# Check queue processing
grep "queue" logs/$(date +%Y-%m-%d).txt
```

## Security Considerations

1. **AWS Credentials**: Store securely, use IAM roles in production
2. **Email Content**: Sanitize user-generated content in emails
3. **Rate Limiting**: Implement API rate limiting for email endpoints
4. **Authentication**: Require authentication for all email operations
5. **Data Privacy**: Handle customer email preferences and unsubscribe requests

## Performance Optimization

1. **Batch Processing**: Process multiple emails in parallel
2. **Connection Pooling**: Reuse AWS SES connections
3. **Template Caching**: Cache rendered templates
4. **Database Indexing**: Optimize queue table queries
5. **Cleanup Jobs**: Regular cleanup of old email records

## Future Enhancements

1. **Template Management UI**: Admin interface for email templates
2. **A/B Testing**: Support for email template variations
3. **Analytics**: Email open/click tracking
4. **Personalization**: Advanced template personalization
5. **Multi-language**: Localized email templates
6. **Webhook Integration**: Real-time delivery status updates