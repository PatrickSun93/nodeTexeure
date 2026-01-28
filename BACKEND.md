# Backend & API Documentation

**Version:** 1.0  
**Last Updated:** January 24, 2025

---

## 📋 Overview

The NodeTexeure backend is a RESTful API built with Express.js, providing endpoints for product management, user authentication, orders, and admin operations.

**Base URL:** `http://localhost:6666/api`  
**Production:** TBD

---

## 🔧 Setup & Configuration

### Environment Variables (.env)

```bash
# Server
PORT=6666
NODE_ENV=development

# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=nodetexture
DB_PORT=3306

# Authentication
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=24h

# AWS (Production)
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=nodetexture-images
AWS_SES_FROM_EMAIL=noreply@nodetexture.com

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Frontend URLs (CORS)
FRONTEND_URL=http://localhost:3000
ADMIN_URL=http://localhost:3005

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
```

### Starting the Backend

```bash
cd backend
npm install
npm run dev
```

Server runs on: http://localhost:6666

---

## 📡 API Response Format

### Standard Response Structure

All API responses follow this format:

```json
{
  "status": "SUCCESS" | "FAIL",
  "message": "Human-readable message",
  "keyValueTable": [
    { "key": "value" }
  ]
}
```

### Success Response Example

```json
{
  "status": "SUCCESS",
  "message": "Products fetched successfully",
  "keyValueTable": {
    "products": [...],
    "total": 50,
    "page": 1,
    "limit": 10
  }
}
```

### Error Response Example

```json
{
  "status": "FAIL",
  "message": "Authentication failed",
  "keyValueTable": {
    "error": "Invalid credentials"
  }
}
```

### HTTP Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing/invalid auth token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate resource
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## 🔐 Authentication

### Register User

**POST** `/api/users/register`

```json
// Request
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}

// Response
{
  "status": "SUCCESS",
  "message": "User registered successfully",
  "keyValueTable": {
    "userId": "USER0000000001",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Login

**POST** `/api/users/login`

```json
// Request
{
  "email": "user@example.com",
  "password": "SecurePass123"
}

// Response
{
  "status": "SUCCESS",
  "message": "Login successful",
  "keyValueTable": {
    "userId": "USER0000000001",
    "email": "user@example.com",
    "role": "customer",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "isAdmin": false
  }
}
```

### Password Reset

**POST** `/api/users/forgot-password`

```json
{
  "email": "user@example.com"
}
```

**POST** `/api/users/reset-password`

```json
{
  "token": "reset_token_from_email",
  "newPassword": "NewSecurePass123"
}
```

### Protected Routes

Include JWT token in Authorization header:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🛍️ Products API

### List Products

**GET** `/api/products`

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10, max: 100)
- `category` - Filter by category ID
- `min_price` - Minimum price
- `max_price` - Maximum price
- `material` - Filter by material (Cotton, Silk, Cashmere)
- `search` - Full-text search query

```bash
GET /api/products?page=1&limit=20&material=Silk&min_price=100&max_price=500&search=luxury
```

**Response:**

```json
{
  "status": "SUCCESS",
  "message": "Products fetched successfully",
  "keyValueTable": {
    "products": [
      {
        "id": "PROD0000000001",
        "name": "100% Mulberry Silk Sheet Set",
        "slug": "mulberry-silk-sheet-set",
        "base_price": 450,
        "category_name": "Sheets",
        "image": "/uploads/products/prod1.jpg",
        "product_details": {
          "material": "Silk",
          "thread_count": 600,
          "organic": true
        }
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20
  }
}
```

### Get Product Details

**GET** `/api/products/:id`

```json
{
  "status": "SUCCESS",
  "message": "Product fetched successfully",
  "keyValueTable": {
    "id": "PROD0000000001",
    "name": "100% Mulberry Silk Sheet Set",
    "slug": "mulberry-silk-sheet-set",
    "base_price": 450,
    "description": "Luxurious silk bedding...",
    "product_details": {...},
    "variants": [
      {
        "id": "PROD0000000002",
        "size": "Queen",
        "color": "Ivory",
        "price": 450,
        "stock_quantity": 15
      }
    ],
    "images": [
      {
        "id": "PROD0000000003",
        "image_url": "/uploads/products/img1.jpg",
        "sort_order": 1
      }
    ],
    "reviews": [...]
  }
}
```

### Get Products by IDs

**GET** `/api/products/by-ids?ids=PROD0000000001,PROD0000000002`

---

## 🛒 Cart API

### Get Cart

**GET** `/api/cart`

Auth: Optional (guest carts use session)

```json
{
  "status": "SUCCESS",
  "message": "Cart retrieved",
  "keyValueTable": {
    "cartId": "CART0000000001",
    "items": [
      {
        "product_id": "PROD0000000001",
        "variant_id": "PROD0000000002",
        "quantity": 2,
        "price": 450,
        "subtotal": 900
      }
    ],
    "total": 900
  }
}
```

### Add to Cart

**POST** `/api/cart/add`

```json
{
  "product_id": "PROD0000000001",
  "variant_id": "PROD0000000002",
  "quantity": 1
}
```

### Update Cart Item

**PUT** `/api/cart/update/:itemId`

```json
{
  "quantity": 3
}
```

### Remove from Cart

**DELETE** `/api/cart/remove/:itemId`

---

## 📦 Orders API

### Create Order

**POST** `/api/orders/create`

Auth: Optional (guests can checkout)

```json
{
  "shipping_address": {
    "first_name": "John",
    "last_name": "Doe",
    "address_line1": "123 Main St",
    "city": "Los Angeles",
    "state": "CA",
    "postal_code": "90001",
    "country": "US"
  },
  "billing_address": {...},
  "coupon_code": "SAVE20"
}
```

**Response:**

```json
{
  "status": "SUCCESS",
  "message": "Order created successfully",
  "keyValueTable": {
    "orderId": "ORDER0000000001",
    "order_number": "ORD-2025-0001",
    "subtotal": 900,
    "discount": 180,
    "tax": 72,
    "shipping": 15,
    "total": 807,
    "status": "pending"
  }
}
```

### Apply Coupon

**POST** `/api/orders/apply-coupon`

```json
{
  "code": "SAVE20",
  "cart_total": 900
}
```

**Response:**

```json
{
  "status": "SUCCESS",
  "message": "Coupon applied successfully",
  "keyValueTable": {
    "coupon_code": "SAVE20",
    "discount_type": "percentage",
    "discount_value": 20,
    "discount_amount": 180,
    "new_total": 720
  }
}
```

---

## 🔍 Search API ✨ NEW

### Autocomplete

**GET** `/api/search/autocomplete?q=silk`

```json
{
  "status": "SUCCESS",
  "message": "Autocomplete results",
  "keyValueTable": {
    "query": "silk",
    "suggestions": [
      "Silk Sheets",
      "Silk Pillowcase",
      "Mulberry Silk"
    ],
    "products": [
      {
        "id": "PROD0000000001",
        "name": "100% Mulberry Silk Sheet Set",
        "slug": "mulberry-silk-sheet-set",
        "price": 450,
        "image": "/uploads/products/prod1.jpg"
      }
    ],
    "categories": [
      {
        "id": "CAT0000000001",
        "name": "Silk Bedding"
      }
    ]
  }
}
```

### Search Suggestions

**GET** `/api/search/suggestions`

```json
{
  "status": "SUCCESS",
  "message": "Search suggestions",
  "keyValueTable": {
    "popularTerms": [
      "silk sheets",
      "cashmere blanket",
      "queen size"
    ],
    "trending": [
      {
        "id": "PROD0000000001",
        "name": "...",
        "price": 450
      }
    ]
  }
}
```

### Recent Products

**GET** `/api/search/recent?ids=PROD0000000001,PROD0000000002`

---

## 👨‍💼 Admin API

### Authentication Required
All admin routes require:
1. Valid JWT token
2. User role = 'admin' or 'staff'

**Headers:**
```bash
Authorization: Bearer <token>
X-CSRF-Token: <csrf-token>
```

### Products Management

**GET** `/api/admin/products` - List all products  
**GET** `/api/admin/products/:id` - Get product details  
**POST** `/api/admin/products` - Create product  
**PUT** `/api/admin/products/:id` - Update product  
**DELETE** `/api/admin/products/:id` - Delete product  

### Orders Management

**GET** `/api/admin/orders` - List all orders  
**GET** `/api/admin/orders/:id` - Get order details  
**PUT** `/api/admin/orders/:id/status` - Update order status

```json
{
  "status": "shipped",
  "tracking_number": "1Z999AA10123456784"
}
```

### Users Management

**GET** `/api/admin/users` - List all users  
**POST** `/api/admin/users` - Create user  
**PUT** `/api/admin/users/:id` - Update user  
**DELETE** `/api/admin/users/:id` - Delete user

### Coupons Management

**GET** `/api/admin/coupons` - List coupons  
**POST** `/api/admin/coupons` - Create coupon

```json
{
  "code": "SAVE20",
  "discount_type": "percentage",
  "discount_value": 20,
  "min_order_value": 100,
  "max_uses": 1000,
  "valid_from": "2025-01-01",
  "valid_until": "2025-12-31"
}
```

**PUT** `/api/admin/coupons/:id` - Update coupon  
**DELETE** `/api/admin/coupons/:id` - Delete coupon

### Email Templates

**GET** `/api/admin/email-templates` - List templates  
**GET** `/api/admin/email-templates/:id` - Get template  
**POST** `/api/admin/email-templates` - Create template  
**PUT** `/api/admin/email-templates/:id` - Update template  
**DELETE** `/api/admin/email-templates/:id` - Delete template

### Analytics

**GET** `/api/admin/analytics/summary` - Dashboard summary  
**GET** `/api/admin/analytics/revenue` - Revenue data  
**GET** `/api/admin/analytics/sales-by-region` - Regional sales

---

## 🔒 Security

### CSRF Protection

CSRF tokens required for state-changing operations (POST, PUT, DELETE).

**Get CSRF token:**
```bash
GET /api/csrf-token
```

**Use in requests:**
```bash
X-CSRF-Token: <token>
```

### Rate Limiting

**Global limits:**
- 1000 requests per 15 minutes
- 10,000 requests per hour

**Admin endpoints (stricter):**
- Read operations: 500 req/15min
- Write operations: 100 req/15min

**Response when limit exceeded:**
```json
{
  "status": "FAIL",
  "message": "Too many requests",
  "keyValueTable": {
    "retry_after": 300
  }
}
```

---

## 📂 File Uploads

### Product Images

**POST** `/api/admin/products/:id/image`

**Form Data:**
```
Content-Type: multipart/form-data

image: <file>
sort_order: 1
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Image uploaded successfully",
  "keyValueTable": {
    "imageId": "PROD0000000123",
    "url": "/uploads/products/prod1_abc123.jpg",
    "thumbnail_small": "/uploads/products/prod1_abc123_small.jpg",
    "thumbnail_medium": "/uploads/products/prod1_abc123_medium.jpg",
    "thumbnail_large": "/uploads/products/prod1_abc123_large.jpg"
  }
}
```

---

## 🗄️ Custom ID System

All database entities use prefixed IDs instead of auto-increment:

| Prefix | Entity | Example |
|--------|--------|---------|
| USER | Users | USER0000000001 |
| PROD | Products | PROD0000000001 |
| ORDER | Orders | ORDER0000000001 |
| CART | Carts | CART0000000001 |
| PAY | Payments | PAY0000000001 |
| DISC | Discounts | DISC0000000001 |

### Generating IDs

IDs are auto-generated by MySQL:

```sql
SELECT get_next_id('USER') as new_id;
-- Returns: USER0000000001
```

In application code:
```javascript
// Let MySQL handle it (preferred)
INSERT INTO users (email, password_hash) VALUES (?, ?);

// Or generate manually if needed
const idResult = await db.query("SELECT get_next_id('USER') as id");
const newUserId = idResult[0].id;
```

---

## 🧪 Testing API Endpoints

### Using curl

```bash
# Health check
curl http://localhost:6666/api/status/health

# Get products
curl http://localhost:6666/api/products?limit=5

# Login
curl -X POST http://localhost:6666/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Protected endpoint
curl http://localhost:6666/api/admin/users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using Postman

1. Import collection from `/docs/postman/`
2. Set environment variables (base URL, tokens)
3. Run tests

---

## 📊 Logging

All requests are logged with:
- Timestamp
- Method & URL
- Status code
- Response time
- User agent
- IP address

**Log location:** `backend/logs/`

**Log format:**
```
2025-01-24 10:30:45 [INFO] GET /api/products 200 45ms
2025-01-24 10:30:46 [ERROR] POST /api/orders/create 500 123ms
```

---

## 🐛 Error Handling

### Common Errors

**Invalid JSON:**
```json
{
  "status": "FAIL",
  "message": "Invalid JSON in request body"
}
```

**Missing required fields:**
```json
{
  "status": "FAIL",
  "message": "Validation failed",
  "keyValueTable": {
    "errors": [
      { "field": "email", "message": "Email is required" },
      { "field": "password", "message": "Password must be at least 8 characters" }
    ]
  }
}
```

**Database errors:**
```json
{
  "status": "FAIL",
  "message": "Database error",
  "keyValueTable": {
    "error": "Duplicate entry 'user@example.com' for key 'email'"
  }
}
```

---

## 🔧 Utility Endpoints

### Health Check

**GET** `/api/status/health`

```json
{
  "status": "SUCCESS",
  "message": "Backend server is running",
  "keyValueTable": {
    "port": 6666,
    "timestamp": "2025-01-24T18:30:45.793Z"
  }
}
```

### Database Test

**GET** `/api/database/test`

```json
{
  "status": "SUCCESS",
  "message": "Database connection successful",
  "keyValueTable": {
    "connected": true,
    "timestamp": "2025-01-24T18:30:45.793Z"
  }
}
```

---

## 📝 Best Practices

### Request Handling
1. Always validate input
2. Use prepared statements for SQL
3. Return consistent response format
4. Include descriptive error messages
5. Log important operations

### Security
1. Never expose sensitive data
2. Validate JWT on protected routes
3. Use CSRF tokens for mutations
4. Rate limit aggressive
5. Sanitize all inputs

### Performance
1. Use database indexes
2. Paginate large result sets
3. Cache frequently accessed data
4. Optimize SQL queries
5. Compress responses

---

**Last Updated:** January 24, 2025  
**Version:** 1.0
