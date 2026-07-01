# API Documentation

## Overview

This document provides comprehensive API documentation for the bed texture e-commerce platform. The API follows RESTful principles and returns JSON responses.

**Base URL:** `https://api.yourdomain.com/api/v1`

## Authentication

### JWT Token Authentication

Most endpoints require authentication using JWT tokens.

**Login Endpoint:**
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "USER001",
    "email": "user@example.com",
    "role": "customer"
  }
}
```

**Using the Token:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Products API

### Get All Products

```http
GET /products
```

**Query Parameters:**
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20, max: 100)
- `category` (string): Filter by category
- `search` (string): Search in product name and description
- `sort` (string): Sort by `name`, `price`, `created_at` (default: `created_at`)
- `order` (string): `asc` or `desc` (default: `desc`)
- `status` (string): Filter by status (`approved`, `pending`, `draft`)

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "PROD001",
        "name": "Luxury Bed Sheet Set",
        "description": "Premium cotton bed sheets...",
        "price": 89.99,
        "currency": "USD",
        "category": "bed-sheets",
        "images": [
          {
            "id": "IMG001",
            "url": "https://cdn.example.com/products/prod001/main.jpg",
            "alt": "Luxury Bed Sheet Set",
            "is_primary": true
          }
        ],
        "inventory": {
          "quantity": 50,
          "low_stock_threshold": 10,
          "is_low_stock": false
        },
        "variants": [
          {
            "id": "VAR001",
            "size": "Queen",
            "color": "White",
            "price": 89.99,
            "inventory": 25
          }
        ],
        "status": "approved",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 5,
      "total_items": 100,
      "items_per_page": 20
    }
  }
}
```

### Get Single Product

```http
GET /products/{id}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "product": {
      "id": "PROD001",
      "name": "Luxury Bed Sheet Set",
      "description": "Premium cotton bed sheets with 400 thread count...",
      "price": 89.99,
      "currency": "USD",
      "category": "bed-sheets",
      "images": [...],
      "inventory": {...},
      "variants": [...],
      "specifications": {
        "material": "100% Cotton",
        "thread_count": 400,
        "care_instructions": "Machine wash cold"
      },
      "seo": {
        "meta_title": "Luxury Bed Sheet Set - Premium Cotton",
        "meta_description": "Experience ultimate comfort...",
        "keywords": ["bed sheets", "cotton", "luxury"]
      }
    }
  }
}
```

### Create Product (Authorized staff only - RBAC)

```http
POST /products
Authorization: Bearer {staff_token}
Content-Type: application/json

{
  "name": "New Product Name",
  "description": "Product description",
  "price": 99.99,
  "currency": "USD",
  "category": "category-slug",
  "inventory": {
    "quantity": 100,
    "low_stock_threshold": 10
  },
  "variants": [
    {
      "size": "Queen",
      "color": "Blue",
      "price": 99.99,
      "inventory": 50
    }
  ],
  "specifications": {
    "material": "Cotton",
    "thread_count": 300
  }
}
```

## Orders API

### Create Order

```http
POST /orders
Authorization: Bearer {token}
Content-Type: application/json

{
  "items": [
    {
      "product_id": "PROD001",
      "variant_id": "VAR001",
      "quantity": 2,
      "price": 89.99
    }
  ],
  "shipping_address": {
    "first_name": "John",
    "last_name": "Doe",
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip_code": "10001",
    "country": "US"
  },
  "billing_address": {
    // Same structure as shipping_address
  },
  "coupon_code": "SAVE10",
  "payment_method": "stripe"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "ORD001",
      "order_number": "E2024-001",
      "status": "pending",
      "items": [...],
      "subtotal": 179.98,
      "tax_amount": 14.40,
      "shipping_cost": 9.99,
      "discount_amount": 18.00,
      "total": 186.37,
      "currency": "USD",
      "payment_intent_id": "pi_1234567890",
      "created_at": "2024-01-15T10:30:00Z"
    }
  }
}
```

### Get Order

```http
GET /orders/{id}
Authorization: Bearer {token}
```

### Update Order Status (Authorized staff only - RBAC)

```http
PATCH /orders/{id}/status
Authorization: Bearer {staff_token}
Content-Type: application/json

{
  "status": "processing",
  "notes": "Order is being prepared for shipment"
}
```

## Payments API

### Create Payment Intent

```http
POST /payments/create-intent
Authorization: Bearer {token}
Content-Type: application/json

{
  "order_id": "ORD001",
  "amount": 18637,
  "currency": "usd",
  "payment_method_types": ["card"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "client_secret": "pi_1234567890_secret_abcdef",
    "payment_intent_id": "pi_1234567890"
  }
}
```

### Confirm Payment

```http
POST /payments/confirm
Authorization: Bearer {token}
Content-Type: application/json

{
  "payment_intent_id": "pi_1234567890",
  "payment_method_id": "pm_1234567890"
}
```

## Cart API

### Get Cart

```http
GET /cart
Authorization: Bearer {token}
```

### Add to Cart

```http
POST /cart/items
Authorization: Bearer {token}
Content-Type: application/json

{
  "product_id": "PROD001",
  "variant_id": "VAR001",
  "quantity": 2
}
```

### Update Cart Item

```http
PATCH /cart/items/{item_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "quantity": 3
}
```

### Remove from Cart

```http
DELETE /cart/items/{item_id}
Authorization: Bearer {token}
```

## Shipping API

### Calculate Shipping

```http
POST /shipping/calculate
Content-Type: application/json

{
  "items": [
    {
      "product_id": "PROD001",
      "quantity": 2,
      "weight": 1.5
    }
  ],
  "destination": {
    "country": "US",
    "state": "NY",
    "zip_code": "10001"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shipping_options": [
      {
        "service": "standard",
        "name": "Standard Shipping",
        "cost": 9.99,
        "estimated_days": "5-7",
        "carrier": "FedEx"
      },
      {
        "service": "express",
        "name": "Express Shipping",
        "cost": 19.99,
        "estimated_days": "2-3",
        "carrier": "FedEx"
      }
    ]
  }
}
```

## Coupons API

### Validate Coupon

```http
POST /coupons/validate
Content-Type: application/json

{
  "code": "SAVE10",
  "order_total": 100.00,
  "customer_id": "USER001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "coupon": {
      "id": "COUP001",
      "code": "SAVE10",
      "type": "percentage",
      "value": 10,
      "discount_amount": 10.00,
      "is_valid": true
    }
  }
}
```

### Apply Coupon

```http
POST /coupons/apply
Authorization: Bearer {token}
Content-Type: application/json

{
  "code": "SAVE10",
  "order_id": "ORD001"
}
```

## Inventory API

### Get Inventory Status

```http
GET /inventory/{product_id}
Authorization: Bearer {staff_token}
```

### Update Inventory

```http
PATCH /inventory/{product_id}
Authorization: Bearer {staff_token}
Content-Type: application/json

{
  "quantity": 50,
  "reason": "Restock from supplier",
  "variant_id": "VAR001"
}
```

## Search API

### Search Products

```http
GET /search
```

**Query Parameters:**
- `q` (string): Search query
- `category` (string): Filter by category
- `min_price` (number): Minimum price filter
- `max_price` (number): Maximum price filter
- `sort` (string): Sort by `relevance`, `price`, `name`
- `page` (integer): Page number
- `limit` (integer): Items per page

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [...],
    "suggestions": ["bed sheets", "pillowcases", "comforters"],
    "filters": {
      "categories": [
        {"slug": "bed-sheets", "name": "Bed Sheets", "count": 25}
      ],
      "price_ranges": [
        {"min": 0, "max": 50, "count": 10},
        {"min": 50, "max": 100, "count": 15}
      ]
    },
    "pagination": {...}
  }
}
```

## User Management API

### Register User

```http
POST /auth/register
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "phone": "+1234567890"
}
```

### Get User Profile

```http
GET /users/profile
Authorization: Bearer {token}
```

### Update User Profile

```http
PATCH /users/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Smith",
  "phone": "+1234567890"
}
```

## Internal Operations (RBAC-protected)

Note: The legacy Admin API endpoints have been deprecated in favor of integrated internal operations tools within the main application. Privileged actions are protected by role-based access control (RBAC).

- Previous examples using `/admin/*` endpoints and `{admin_token}` have been removed.
- Use the standard API endpoints (e.g., `/orders`, `/inventory`, `/users`) with appropriate roles/permissions in the access token (`{staff_token}`).
- See `backend/routes/README.md` and `backend/middleware/README_Security.md` for the current patterns and best practices.

If you need guidance for operations workflows, consult the Internal Operations Tools documentation (archived admin materials have been migrated).
## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      }
    ]
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR` (400): Invalid input data
- `UNAUTHORIZED` (401): Authentication required
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Resource conflict
- `RATE_LIMITED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error

## Rate Limiting

### Limits

- **General API**: 1000 requests per 15 minutes
- **Authentication**: 5 login attempts per minute
- **Search**: 100 requests per minute
- **Admin API**: 2000 requests per 15 minutes

### Headers

Rate limit information is included in response headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Webhooks

### Stripe Webhooks

```http
POST /webhooks/stripe
Content-Type: application/json
Stripe-Signature: t=1640995200,v1=signature...

{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_1234567890",
      "status": "succeeded",
      "metadata": {
        "order_id": "ORD001"
      }
    }
  }
}
```

### Supported Events

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.dispute.created`
- `invoice.payment_succeeded`

## SDKs and Libraries

### JavaScript/Node.js

```javascript
const EcommerceAPI = require('@yourcompany/ecommerce-api');

const client = new EcommerceAPI({
  baseURL: 'https://api.yourdomain.com/api/v1',
  apiKey: 'your-api-key'
});

// Get products
const products = await client.products.list({
  category: 'bed-sheets',
  limit: 10
});
```

### Python

```python
from ecommerce_api import EcommerceClient

client = EcommerceClient(
    base_url='https://api.yourdomain.com/api/v1',
    api_key='your-api-key'
)

# Get products
products = client.products.list(category='bed-sheets', limit=10)
```

## Testing

### Test Environment

**Base URL:** `https://api-staging.yourdomain.com/api/v1`

### Test Data

Test credit cards for Stripe integration:
- Success: `4242424242424242`
- Decline: `4000000000000002`
- Insufficient funds: `4000000000009995`

### Postman Collection

Import our Postman collection for easy API testing:
[Download Collection](./postman/ecommerce-api.json)

## Changelog

### Version 1.2.0 (2024-01-15)
- Added multi-language support
- Enhanced search functionality
- Improved error handling

### Version 1.1.0 (2024-01-01)
- Added coupon system
- Implemented inventory management
- Enhanced order tracking

### Version 1.0.0 (2023-12-01)
- Initial API release
- Basic CRUD operations
- Stripe payment integration