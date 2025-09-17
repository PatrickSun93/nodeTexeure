# Comprehensive Error Handling System

This document describes the enhanced error handling system implemented for the e-commerce platform. The system provides robust error handling, retry logic, user-friendly messages, and recovery options across all components.

## Overview

The error handling system consists of several interconnected components:

1. **Backend Error Handling**
   - Centralized error handler middleware
   - Service-specific error enhancement
   - Retry mechanisms with exponential backoff
   - Circuit breaker pattern implementation

2. **Frontend Error Handling**
   - Error boundary components
   - User-friendly error notifications
   - Automatic retry mechanisms
   - Recovery suggestions

3. **Error Monitoring & Logging**
   - Comprehensive error logging
   - Error classification and categorization
   - Performance monitoring
   - Admin alerting system

## Backend Components

### Error Handler Middleware (`errorHandler.js`)

The main error handling middleware that:
- Categorizes errors by type (payment, database, validation, etc.)
- Provides user-friendly error messages
- Suggests recovery actions
- Sets appropriate HTTP status codes

```javascript
// Usage in Express routes
app.use(ErrorHandler.handle);

// Async route wrapper
router.get('/example', ErrorHandler.asyncHandler(async (req, res) => {
  // Your route logic here
}));
```

### Error Utilities (`errorUtils.js`)

Provides advanced error handling utilities:

#### Retry with Exponential Backoff
```javascript
const result = await ErrorUtils.retryWithBackoff(
  async () => await someOperation(),
  3, // maxRetries
  1000, // baseDelay
  5000 // maxDelay
);
```

#### Circuit Breaker Pattern
```javascript
const circuitBreaker = ErrorUtils.createCircuitBreaker(
  operation,
  { failureThreshold: 5, resetTimeout: 60000 }
);
```

#### Graceful Degradation
```javascript
const result = await ErrorUtils.withFallback(
  primaryOperation,
  fallbackOperation,
  { context: 'user_data' }
);
```

#### Batch Error Handling
```javascript
const result = await ErrorUtils.processBatchWithErrorHandling(
  items,
  processor,
  { continueOnError: true, collectErrors: true }
);
```

### Service-Specific Error Handling

Each service has enhanced error handling:

#### Payment Service (Stripe)
- Handles card declines, insufficient funds, expired cards
- Provides specific recovery suggestions
- Implements retry logic for network errors
- Circuit breaker for service availability

#### Inventory Service
- Handles stock conflicts and reservation failures
- Implements row-level locking to prevent race conditions
- Automatic rollback on partial failures
- Low stock alerting system

#### Email Service
- Handles SES errors and rate limiting
- Queue-based delivery with retry logic
- Fallback mechanisms for critical emails
- Admin alerting for delivery failures

## Frontend Components

### Error Boundary (`ErrorBoundary.js`)

React error boundary that catches JavaScript errors:
- Displays user-friendly error messages
- Provides recovery suggestions
- Allows retry attempts
- Reports errors to backend for monitoring

```jsx
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

### Error Notifications (`ErrorNotification.js`)

Displays contextual error messages:
- Multiple notification types (error, warning, info, success)
- Auto-dismiss functionality
- Retry buttons for recoverable errors
- Stacked notifications support

```jsx
const { showError, dismissError } = useErrorNotification();

// Show error
showError({
  message: 'Payment failed',
  type: 'payment_error',
  recoverySuggestions: ['Try a different card', 'Check your details'],
  retryAllowed: true
});
```

### Error Handling Hook (`useErrorHandler.js`)

React hook for comprehensive error handling:

```jsx
const { executeWithErrorHandling, apiCall, handleFormSubmit } = useErrorHandler();

// API call with error handling
const result = await apiCall('/api/orders', {
  method: 'POST',
  body: JSON.stringify(orderData)
}, {
  maxRetries: 3,
  onSuccess: (data) => console.log('Order created:', data),
  onError: (error) => console.error('Order failed:', error)
});

// Form submission with validation
const result = await handleFormSubmit(
  submitOrder,
  formData,
  {
    validationSchema: orderValidationSchema,
    onSuccess: () => router.push('/order-success')
  }
);
```

## Error Types and Handling

### Payment Errors
- **Card Declined**: Suggests trying different payment method
- **Insufficient Funds**: Recommends checking account balance
- **Expired Card**: Prompts for card update
- **Network Issues**: Automatic retry with exponential backoff

### Inventory Errors
- **Insufficient Stock**: Shows available quantity, suggests alternatives
- **Reservation Conflicts**: Automatic retry with updated quantities
- **Database Locks**: Implements proper locking and rollback mechanisms

### Email Errors
- **Invalid Recipients**: Validates email addresses before sending
- **Rate Limiting**: Implements queue-based sending with delays
- **Service Unavailable**: Falls back to alternative notification methods

### Validation Errors
- **Form Validation**: Shows field-specific error messages
- **Data Format**: Provides format examples and suggestions
- **Required Fields**: Highlights missing information

## Configuration

### Environment Variables

```bash
# Error Monitoring
ERROR_MONITORING_ENABLED=true
ERROR_REPORTING_URL=https://your-monitoring-service.com

# Retry Configuration
DEFAULT_MAX_RETRIES=3
DEFAULT_RETRY_DELAY=1000
DEFAULT_MAX_DELAY=10000

# Circuit Breaker Configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT=60000

# Email Error Handling
EMAIL_RETRY_ATTEMPTS=3
EMAIL_QUEUE_PROCESSING_INTERVAL=30000
```

### Database Tables

The system uses several database tables for error tracking:

```sql
-- Email queue with retry logic
CREATE TABLE email_queue (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  retry_count INT DEFAULT 0,
  error_message TEXT,
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL
);

-- Stock reservations for inventory conflicts
CREATE TABLE stock_reservations (
  id VARCHAR(255) PRIMARY KEY,
  product_id VARCHAR(255) NOT NULL,
  variant_id VARCHAR(255),
  cart_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  quantity INT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Testing

### Running Error Handling Tests

```bash
# Run comprehensive error handling tests
node backend/scripts/test-error-handling.js

# Test specific error types
npm run test:errors:payment
npm run test:errors:inventory
npm run test:errors:email
```

### Test Coverage

The test suite covers:
- Retry mechanisms with various failure scenarios
- Circuit breaker state transitions
- Error classification accuracy
- Batch processing with mixed success/failure
- Graceful degradation scenarios
- User-friendly message generation

## Monitoring and Alerting

### Error Metrics

The system tracks:
- Error rates by type and service
- Retry success rates
- Circuit breaker state changes
- User-facing error frequency
- Recovery action effectiveness

### Admin Alerts

Administrators are notified for:
- Critical email delivery failures
- High error rates in payment processing
- Inventory system conflicts
- Circuit breaker activations
- Unusual error patterns

### Health Checks

```bash
# Check system health
curl /api/errors/health

# Get error statistics (admin only)
curl /api/errors/stats -H "Authorization: Bearer <admin-token>"
```

## Best Practices

### For Developers

1. **Always use error handling wrappers**:
   ```javascript
   // Good
   router.get('/api/data', ErrorHandler.asyncHandler(async (req, res) => {
     const data = await service.getData();
     res.json(ResponseFormatter.success('Data retrieved', data));
   }));
   
   // Avoid
   router.get('/api/data', async (req, res) => {
     try {
       const data = await service.getData();
       res.json(data);
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   });
   ```

2. **Provide context in error handling**:
   ```javascript
   await ErrorUtils.retryWithBackoff(
     operation,
     3,
     1000,
     5000,
     { context: { userId, operation: 'checkout' } }
   );
   ```

3. **Use appropriate error types**:
   ```javascript
   const error = new Error('Invalid email format');
   error.type = 'validation_error';
   error.field = 'email';
   throw error;
   ```

### For Frontend Components

1. **Wrap components in error boundaries**:
   ```jsx
   <ErrorBoundary>
     <CriticalComponent />
   </ErrorBoundary>
   ```

2. **Use error handling hooks**:
   ```jsx
   const { executeWithErrorHandling } = useErrorHandler();
   
   const handleSubmit = async (data) => {
     await executeWithErrorHandling(
       () => submitForm(data),
       {
         onSuccess: () => showSuccess('Form submitted!'),
         context: { form: 'checkout' }
       }
     );
   };
   ```

3. **Provide meaningful error messages**:
   ```jsx
   showError({
     message: 'Unable to process payment',
     userMessage: 'Your card was declined. Please try a different payment method.',
     recoverySuggestions: [
       'Check your card details',
       'Try a different card',
       'Contact your bank'
     ]
   });
   ```

## Troubleshooting

### Common Issues

1. **High retry rates**: Check service health and network connectivity
2. **Circuit breaker frequently open**: Investigate underlying service issues
3. **Email delivery failures**: Verify SES configuration and recipient validity
4. **Inventory conflicts**: Review concurrent access patterns and locking mechanisms

### Debug Mode

Enable debug logging:
```bash
DEBUG=error-handling npm start
```

This provides detailed logs for:
- Error categorization decisions
- Retry attempt details
- Circuit breaker state changes
- Recovery suggestion generation

## Future Enhancements

1. **Machine Learning Error Prediction**: Predict likely errors based on user behavior
2. **Advanced Analytics**: Detailed error pattern analysis and reporting
3. **A/B Testing**: Test different error message strategies
4. **Integration with External Monitoring**: Sentry, DataDog, New Relic integration
5. **Automated Recovery**: Self-healing mechanisms for common error scenarios

## Support

For questions or issues with the error handling system:
- Check the logs in `/logs` directory
- Run the test suite to verify system health
- Review error statistics in the admin dashboard
- Contact the development team with specific error IDs for investigation