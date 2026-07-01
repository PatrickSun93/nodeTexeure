# Stripe Payment Integration Service

## Overview

The StripeService provides a comprehensive integration with Stripe payment processing for the bed texture e-commerce platform. This service handles payment intents, customer management, refunds, and webhook processing.

## Features

- **Payment Intent Management**: Create, confirm, and retrieve payment intents
- **Customer Management**: Create and manage Stripe customers
- **Refund Processing**: Handle full and partial refunds
- **Webhook Processing**: Secure webhook event handling
- **Error Handling**: Comprehensive error logging and handling
- **Metadata Support**: Rich metadata for order tracking

## Environment Variables

Add these variables to your `backend/.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key-here
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key-here
STRIPE_WEBHOOK_SECRET=whsec_your-stripe-webhook-secret-here
```

## API Endpoints

### Payment Intent Endpoints

#### Create Payment Intent
```http
POST /api/payments/create-intent
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "amount": 29.99,
  "currency": "usd",
  "orderId": "ORDER0000000001",
  "metadata": {
    "productIds": ["PROD001", "PROD002"],
    "customerNote": "Rush delivery"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment intent created successfully",
  "data": {
    "clientSecret": "pi_xxx_secret_xxx",
    "paymentIntentId": "pi_xxx",
    "amount": 2999,
    "currency": "usd"
  }
}
```

#### Confirm Payment
```http
POST /api/payments/confirm
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "paymentIntentId": "pi_xxx",
  "paymentMethodId": "pm_xxx"
}
```

#### Retrieve Payment Intent
```http
GET /api/payments/intent/:id
Authorization: Bearer <jwt_token>
```

### Webhook Endpoint

#### Stripe Webhook
```http
POST /api/payments/webhook
Stripe-Signature: <stripe_signature>
Content-Type: application/json

# Raw Stripe webhook payload
```

**Note**: This endpoint does NOT require authentication as it's called by Stripe.

## Webhook Events Handled

The service automatically handles these Stripe webhook events:

- `payment_intent.succeeded` - Updates order status to confirmed
- `payment_intent.payment_failed` - Updates order status to payment failed
- `payment_intent.canceled` - Updates order status to canceled
- `payment_intent.requires_action` - Updates order status to pending action

## Database Integration

### Tables Updated

1. **orders**
   - `payment_status` - Tracks payment status separately from order status
   - `stripe_payment_intent_id` - Links order to Stripe payment intent

2. **payments**
   - `stripe_payment_intent_id` - Stripe payment intent ID
   - `stripe_payment_method_id` - Stripe payment method ID
   - `stripe_customer_id` - Stripe customer ID

3. **users**
   - `stripe_customer_id` - Links user to Stripe customer

## Service Methods

### StripeService Methods

#### `createPaymentIntent(amount, currency, metadata)`
Creates a new payment intent for processing payment.

**Parameters:**
- `amount` (number): Amount in dollars (will be converted to cents)
- `currency` (string): Currency code (default: 'usd')
- `metadata` (object): Additional metadata for the payment

**Returns:** Stripe PaymentIntent object

#### `confirmPayment(paymentIntentId, paymentMethodId)`
Confirms a payment intent with a payment method.

**Parameters:**
- `paymentIntentId` (string): Payment intent ID
- `paymentMethodId` (string): Payment method ID

**Returns:** Confirmed PaymentIntent object

#### `createRefund(paymentIntentId, amount, reason)`
Creates a refund for a payment.

**Parameters:**
- `paymentIntentId` (string): Payment intent ID to refund
- `amount` (number): Amount to refund in dollars (optional, full refund if not specified)
- `reason` (string): Reason for refund (default: 'requested_by_customer')

**Returns:** Stripe Refund object

#### `retrievePaymentIntent(paymentIntentId)`
Retrieves a payment intent by ID.

**Parameters:**
- `paymentIntentId` (string): Payment intent ID

**Returns:** Stripe PaymentIntent object

#### `handleWebhook(signature, payload)`
Handles and validates Stripe webhook events.

**Parameters:**
- `signature` (string): Stripe signature header
- `payload` (string): Raw request body

**Returns:** Stripe Event object

#### `createCustomer(email, name, metadata)`
Creates a new Stripe customer.

**Parameters:**
- `email` (string): Customer email
- `name` (string): Customer name
- `metadata` (object): Additional customer metadata

**Returns:** Stripe Customer object

#### `updatePaymentIntentMetadata(paymentIntentId, metadata)`
Updates payment intent metadata.

**Parameters:**
- `paymentIntentId` (string): Payment intent ID
- `metadata` (object): Metadata to update

**Returns:** Updated PaymentIntent object

## Testing

### Run Integration Tests
```bash
cd backend
node scripts/test-stripe-integration.js
```

### Test with Stripe CLI
1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:6666/api/payments/webhook`
4. Test webhook: `stripe trigger payment_intent.succeeded`

## Frontend Integration

### Install Stripe.js
```bash
npm install @stripe/stripe-js
```

### Basic Payment Form
```javascript
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe('pk_test_your_publishable_key');

// Create payment intent
const response = await fetch('/api/payments/create-intent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    amount: 29.99,
    orderId: 'ORDER001'
  })
});

const { clientSecret } = await response.json();

// Confirm payment
const stripe = await stripePromise;
const result = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: {
      name: 'Customer Name'
    }
  }
});
```

## Security Considerations

1. **API Keys**: Never expose secret keys in frontend code
2. **Webhook Signatures**: Always verify webhook signatures
3. **HTTPS**: Use HTTPS in production for all Stripe communications
4. **PCI Compliance**: Never store card data on your servers
5. **Rate Limiting**: Implement rate limiting on payment endpoints

## Error Handling

The service includes comprehensive error handling for:

- Invalid API keys
- Network timeouts
- Card declined errors
- Insufficient funds
- Webhook signature validation failures
- Database connection issues

All errors are logged with appropriate context for debugging.

## Production Deployment

1. Replace test API keys with live keys
2. Set up webhook endpoints in Stripe Dashboard
3. Configure proper SSL certificates
4. Set up monitoring and alerting
5. Test with small amounts before going live

## Support

For Stripe-specific issues:
- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com

For integration issues, check the logs in the backend service.