# FedEx Service Documentation

## Overview

The FedEx Service provides integration with FedEx APIs for shipping rate calculation, shipment creation, and package tracking. This service handles all FedEx-related operations for the e-commerce platform.

## Features

- **Rate Calculation**: Get shipping rates for different FedEx services
- **Shipment Creation**: Create shipments and generate shipping labels
- **Package Tracking**: Track packages and update delivery status
- **Database Integration**: Store shipment details and tracking events
- **OAuth Authentication**: Secure API authentication with FedEx

## Configuration

### Environment Variables

Add the following environment variables to your `.env` file:

```env
# FedEx API Configuration
FEDEX_API_URL=https://apis-sandbox.fedex.com  # Use https://apis.fedex.com for production
FEDEX_API_KEY=your_fedex_api_key
FEDEX_SECRET_KEY=your_fedex_secret_key
FEDEX_ACCOUNT_NUMBER=your_fedex_account_number
FEDEX_METER_NUMBER=your_fedex_meter_number
```

### FedEx Developer Account Setup

1. **Create FedEx Developer Account**:
   - Visit [FedEx Developer Portal](https://developer.fedex.com/)
   - Sign up for a developer account
   - Create a new application

2. **Get API Credentials**:
   - API Key (Client ID)
   - Secret Key (Client Secret)
   - Account Number (your FedEx account)
   - Meter Number (assigned by FedEx)

3. **Test Environment**:
   - Use sandbox URLs for development
   - Switch to production URLs for live environment

## Database Schema

### Tables Created

1. **fedex_shipments**: Stores shipment details
2. **fedex_tracking_events**: Stores tracking event history

### Migration

Run the migration to add FedEx tables:

```sql
-- Run database/migrations/add_fedex_tracking.sql
```

## API Methods

### Rate Calculation

```javascript
const rates = await fedexService.getRates({
  origin: {
    postalCode: '12345',
    countryCode: 'US',
    stateCode: 'NY'
  },
  destination: {
    postalCode: '90210',
    countryCode: 'US',
    stateCode: 'CA',
    city: 'Beverly Hills'
  },
  weight: 5.0, // pounds
  dimensions: {
    length: 12,
    width: 8,
    height: 6 // inches
  }
});
```

### Create Shipment

```javascript
const shipment = await fedexService.createShipment('ORDER0000000001', {
  shipper: {
    name: 'Your Company',
    company: 'Bed Texture Store',
    phone: '555-123-4567',
    address1: '123 Main St',
    city: 'New York',
    state: 'NY',
    postalCode: '12345',
    countryCode: 'US'
  },
  recipient: {
    firstName: 'John',
    lastName: 'Doe',
    phone: '555-987-6543',
    address1: '456 Oak Ave',
    city: 'Los Angeles',
    state: 'CA',
    postalCode: '90210',
    countryCode: 'US'
  },
  serviceType: 'FEDEX_GROUND',
  weight: 5.0,
  dimensions: {
    length: 12,
    width: 8,
    height: 6
  },
  declaredValue: 100.00
});
```

### Track Shipment

```javascript
const tracking = await fedexService.trackShipment('1234567890');
```

## Service Types

Common FedEx service types:

- `FEDEX_GROUND`: Ground delivery
- `FEDEX_EXPRESS_SAVER`: Express Saver (3 business days)
- `FEDEX_2_DAY`: 2-day delivery
- `FEDEX_STANDARD_OVERNIGHT`: Next business day
- `PRIORITY_OVERNIGHT`: Next business day by 10:30 AM

## Error Handling

The service includes comprehensive error handling:

- **Authentication Errors**: Invalid API credentials
- **Rate Errors**: Invalid addresses or package details
- **Shipment Errors**: Missing required fields
- **Tracking Errors**: Invalid tracking numbers

## Integration with Order Management

### Order Status Updates

When a shipment is created:
1. Order status changes to "shipped"
2. Tracking number is added to order
3. Shipped timestamp is recorded

### Tracking Updates

Tracking information is automatically updated:
1. Fetch latest tracking events
2. Update database with new events
3. Trigger email notifications if needed

## Testing

### Test Credentials

FedEx provides test credentials for sandbox environment:
- Use sandbox API URL
- Test account numbers and meter numbers
- No actual shipments are created

### Test Scenarios

1. **Rate Calculation**: Test with various addresses and package sizes
2. **Shipment Creation**: Create test shipments with valid addresses
3. **Tracking**: Track test shipments using provided tracking numbers

## Production Deployment

### Checklist

1. **Update Environment Variables**:
   - Change API URL to production
   - Use production credentials
   - Verify account numbers

2. **Database Migration**:
   - Run migration on production database
   - Verify table creation

3. **Testing**:
   - Test with small shipments first
   - Verify tracking functionality
   - Check email notifications

## Monitoring and Logging

### Logs

All FedEx operations are logged:
- API requests and responses
- Error conditions
- Tracking updates

### Monitoring

Monitor these metrics:
- API response times
- Success/failure rates
- Tracking update frequency

## Troubleshooting

### Common Issues

1. **Authentication Failures**:
   - Verify API credentials
   - Check token expiration
   - Ensure account is active

2. **Rate Calculation Errors**:
   - Validate addresses
   - Check package dimensions
   - Verify service availability

3. **Shipment Creation Failures**:
   - Ensure all required fields
   - Validate addresses
   - Check account permissions

4. **Tracking Issues**:
   - Verify tracking number format
   - Check shipment status
   - Ensure tracking is activated

## Support

For FedEx API issues:
- Check FedEx Developer Portal documentation
- Contact FedEx technical support
- Review API status page

For service implementation issues:
- Check application logs
- Verify database connections
- Review error messages