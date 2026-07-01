# Abandoned Cart Recovery System

## Overview

The Abandoned Cart Recovery System automatically detects when customers leave items in their shopping cart without completing the purchase and sends a sequence of targeted recovery emails to encourage them to complete their order.

## Features

### 🔍 Automatic Detection
- Monitors cart activity and detects abandonment after 30 minutes of inactivity
- Runs detection process every 15 minutes automatically
- Only processes carts with items and available customer email

### 📧 Email Sequence
- **Email 1 (1 hour after abandonment)**: Gentle reminder with benefits
- **Email 2 (24 hours after abandonment)**: Social proof and urgency
- **Email 3 (3 days after abandonment)**: Final notice with strong urgency

### 🎨 Enhanced Email Templates
- Professional, responsive HTML templates
- Progressive urgency design (green → yellow → red)
- Product details with variant information
- Personalized customer messaging
- Unsubscribe links and customer service information

### 📊 Analytics & Tracking
- Recovery rate tracking
- Email sequence performance metrics
- Cart abandonment trends
- Revenue recovery reporting

### 🔄 Smart Recovery
- Automatic cancellation of emails when customer completes purchase
- Recovery token system for secure cart restoration
- Integration with checkout process

## Architecture

### Core Components

1. **AbandonedCartService** (`backend/services/abandonedCartService.js`)
   - Main service handling detection and recovery logic
   - Automatic background processing
   - Analytics and reporting

2. **AbandonedCartEmailTemplates** (`backend/services/abandonedCartEmailTemplates.js`)
   - Enhanced email template generation
   - Progressive urgency design
   - Responsive HTML and plain text versions

3. **EmailQueueService** (`backend/services/emailQueueService.js`)
   - Reliable email delivery with retry logic
   - Scheduled email sending
   - Queue management and monitoring

4. **API Routes** (`backend/routes/abandonedCartRoutes.js`)
   - REST API for cart recovery management
   - Admin analytics endpoints
   - Recovery link handling

### Database Tables

- `abandoned_cart_recovery`: Tracks recovery campaigns
- `email_queue`: Manages email delivery
- `shopping_carts`: Cart data with activity timestamps
- `cart_items`: Cart contents for email templates

## API Endpoints

### Public Endpoints

- `POST /api/abandoned-cart/track` - Track cart activity
- `POST /api/abandoned-cart/recover/:cartId` - Mark cart as recovered
- `GET /api/abandoned-cart/recovery/:token` - Handle recovery links

### Admin Endpoints

- `POST /api/abandoned-cart/detect` - Manually trigger detection
- `GET /api/abandoned-cart/analytics` - Get recovery analytics
- `POST /api/abandoned-cart/cleanup` - Clean up old records

## Configuration

### Environment Variables

```bash
# Email Service (AWS SES)
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
AWS_SES_FROM_NAME=Your Store Name
AWS_SES_REPLY_TO_EMAIL=support@yourdomain.com

# Base URL for recovery links
BASE_URL=https://yourdomain.com
```

### Timing Configuration

```javascript
// In AbandonedCartService constructor
this.abandonmentThreshold = 30 * 60 * 1000; // 30 minutes
this.emailSequenceDelays = {
  1: 60 * 60 * 1000,      // 1 hour
  2: 24 * 60 * 60 * 1000, // 24 hours  
  3: 72 * 60 * 60 * 1000  // 72 hours (3 days)
};
```

## Usage

### Automatic Operation

The system runs automatically once initialized:

```javascript
// In server.js or app initialization
const AbandonedCartService = require('./services/abandonedCartService');
const abandonedCartService = new AbandonedCartService();
// Service starts automatically
```

### Manual Operations

```javascript
// Trigger detection manually
const result = await abandonedCartService.detectAbandonedCarts();

// Get analytics
const analytics = await abandonedCartService.getRecoveryAnalytics(30);

// Mark cart as recovered
await abandonedCartService.markCartRecovered(cartId, orderId);

// Track cart activity
await abandonedCartService.trackCartActivity(cartId, userEmail, sessionId);
```

### Frontend Integration

```javascript
// Track cart activity (in cart components)
await fetch('/api/abandoned-cart/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cartId, userEmail, sessionId })
});

// Mark as recovered (in order completion)
await fetch(`/api/abandoned-cart/recover/${cartId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId })
});
```

## Email Templates

### Template Structure

Each email includes:
- Personalized greeting
- Cart contents with product details
- Progressive urgency messaging
- Call-to-action buttons
- Benefits/social proof (varies by sequence)
- Customer service information
- Unsubscribe options

### Customization

Templates can be customized by modifying:
- `AbandonedCartEmailTemplates.renderAbandonedCartTemplate()`
- CSS styles within templates
- Messaging and urgency levels
- Brand colors and fonts

## Analytics

### Key Metrics

- **Total Abandoned Carts**: Number of carts that entered recovery
- **Recovered Carts**: Number of carts that completed purchase
- **Recovery Rate**: Percentage of successful recoveries
- **Email Performance**: Recovery by email sequence step

### Reporting

```javascript
const analytics = await abandonedCartService.getRecoveryAnalytics(30);
console.log(`Recovery rate: ${analytics.recovery_rate_percentage}%`);
console.log(`Total recovered: ${analytics.recovered_carts}`);
```

## Testing

### Test Script

Run the comprehensive test suite:

```bash
node backend/scripts/test-abandoned-cart.js
```

### Test Coverage

- Cart creation and abandonment simulation
- Detection algorithm
- Email template generation
- Recovery process
- Analytics calculation
- Cleanup functionality

## Monitoring

### Health Checks

- Detection process runs every 15 minutes
- Email queue processes every 30 seconds
- Failed emails retry with exponential backoff
- Old records cleaned up automatically

### Logging

All operations are logged with structured data:
- Cart abandonment detection
- Email queue operations
- Recovery events
- Error conditions

## Performance

### Optimization Features

- Batch processing of abandoned carts (50 at a time)
- Efficient database queries with proper indexing
- Email queue with retry logic
- Automatic cleanup of old records

### Scalability

- Stateless service design
- Database-driven state management
- Configurable processing intervals
- Horizontal scaling support

## Security

### Data Protection

- Recovery tokens are cryptographically secure
- Email addresses are validated
- No sensitive data in email templates
- Secure unsubscribe handling

### Access Control

- Authorized staff-only endpoints protected
- Rate limiting on public endpoints
- Input validation and sanitization
- CSRF protection

## Troubleshooting

### Common Issues

1. **No emails being sent**
   - Check AWS SES configuration
   - Verify email queue is processing
   - Check for failed email records

2. **Detection not working**
   - Verify cart activity tracking
   - Check abandonment threshold settings
   - Review database connectivity

3. **Recovery links not working**
   - Verify BASE_URL configuration
   - Check recovery token generation
   - Review frontend routing

### Debug Commands

```bash
# Check email queue status
curl -X GET "http://localhost:6666/api/emails/queue/stats"

# Trigger manual detection
curl -X POST "http://localhost:6666/api/abandoned-cart/detect"

# View analytics
curl -X GET "http://localhost:6666/api/abandoned-cart/analytics?days=7"
```

## Future Enhancements

### Planned Features

- A/B testing for email templates
- SMS recovery notifications
- Personalized discount codes
- Machine learning for optimal timing
- Multi-language support
- Advanced segmentation

### Integration Opportunities

- CRM system integration
- Marketing automation platforms
- Customer support ticketing
- Business intelligence tools
- Push notification services

## Support

For technical support or questions about the abandoned cart recovery system:

1. Check the logs for error messages
2. Run the test script to verify functionality
3. Review the analytics dashboard for insights
4. Consult the API documentation for integration details

## License

This abandoned cart recovery system is part of the Bed Texture E-commerce Platform and follows the same licensing terms.