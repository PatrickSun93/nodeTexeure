# JSON System Documentation

## Overview

The database schema has been updated to use JSON columns for storing complex data structures instead of separate columns. This approach provides better flexibility, reduces table width, and makes it easier to handle varying data formats. The JSON system is currently used for:

1. **Address Information** - User addresses, order shipping/billing addresses, tax rate locations
2. **Product Details** - Physical attributes, specifications, and care instructions
3. **Transaction Data** - Transaction details and metadata
4. **Customer Interaction** - Reviews, discount codes, and customer feedback
5. **Communication** - Email templates and queue management
6. **System Management** - Settings, audit logs, and configurations

## Affected Tables

### Core Business Data

**Tables with JSON columns:**
- `user_addresses`: `address_json` (address components)
- `orders`: `shipping_address_json`, `billing_address_json` (order addresses)
- `tax_rates`: `location_json` (geographic location data)
- `products`: `product_details` (physical attributes, specifications), `approval_details` (approval workflow, history, compliance)
- `transactions`: `transaction_details` (transaction metadata)
- `product_reviews`: `review_details` (review content and metadata)
- `email_templates`: `template_content` (email content and configuration)
- `discount_codes`: `code_details` (usage limits, restrictions, validity)

### 1. user_addresses
**Old Structure:**
```sql
company VARCHAR(100),
address_line_1 VARCHAR(255) NOT NULL,
address_line_2 VARCHAR(255),
city VARCHAR(100) NOT NULL,
state VARCHAR(100) NOT NULL,
postal_code VARCHAR(20) NOT NULL,
country VARCHAR(2) NOT NULL
```

**New Structure:**
```sql
address_json JSON NOT NULL COMMENT 'Contains: company, address_line_1, address_line_2, city, state, postal_code, country'
```

### 2. orders
**Old Structure:**
```sql
-- Shipping address
shipping_first_name VARCHAR(100) NOT NULL,
shipping_last_name VARCHAR(100) NOT NULL,
shipping_company VARCHAR(100),
shipping_address_line_1 VARCHAR(255) NOT NULL,
-- ... more shipping fields

-- Billing address
billing_first_name VARCHAR(100) NOT NULL,
billing_last_name VARCHAR(100) NOT NULL,
billing_company VARCHAR(100),
billing_address_line_1 VARCHAR(255) NOT NULL,
-- ... more billing fields
```

**New Structure:**
```sql
shipping_address_json JSON NOT NULL COMMENT 'Contains: first_name, last_name, company, address_line_1, address_line_2, city, state, postal_code, country, phone',
billing_address_json JSON NOT NULL COMMENT 'Contains: first_name, last_name, company, address_line_1, address_line_2, city, state, postal_code, country, phone'
```

### 3. tax_rates
**Old Structure:**
```sql
country VARCHAR(2) NOT NULL,
state VARCHAR(100),
city VARCHAR(100),
postal_code VARCHAR(20)
```

**New Structure:**
```sql
location_json JSON NOT NULL COMMENT 'Contains: country, state, city, postal_code'
```

### 4. products
**Old Structure:**
```sql
weight DECIMAL(8,3) NOT NULL, -- in kg
dimensions_length DECIMAL(8,2), -- in cm
dimensions_width DECIMAL(8,2),
dimensions_height DECIMAL(8,2),
material VARCHAR(100),
is_organic BOOLEAN DEFAULT FALSE,
care_instructions TEXT
```

**New Structure:**
```sql
product_details JSON NOT NULL COMMENT 'Contains: weight, dimensions_length, dimensions_width, dimensions_height, material, is_organic, care_instructions'
```

## JSON Structure Examples

### User Address JSON Format
```json
{
  "company": "Acme Corp",
  "address_line_1": "123 Main Street",
  "address_line_2": "Apt 4B",
  "city": "New York",
  "state": "NY",
  "postal_code": "10001",
  "country": "US"
}
```

### Order Address JSON Format
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "company": "Acme Corp",
  "address_line_1": "123 Main Street",
  "address_line_2": "Apt 4B",
  "city": "New York",
  "state": "NY",
  "postal_code": "10001",
  "country": "US",
  "phone": "+1-555-123-4567"
}
```

### Tax Rate Location JSON Format
```json
{
  "country": "US",
  "state": "NY",
  "city": "New York",
  "postal_code": "10001"
}
```

### Product Details JSON Format
```json
{
  "weight": 2.5,
  "dimensions_length": 200.0,
  "dimensions_width": 150.0,
  "dimensions_height": 5.0,
  "material": "100% Organic Cotton",
  "is_organic": true,
  "care_instructions": "Machine wash cold, tumble dry low, do not bleach"
}
```

### Approval Details JSON Format
```json
{
  "notes": "Product meets all quality standards and organic certification requirements.",
  "approved_by": "USER123",
  "approved_at": "2024-01-15T10:30:00Z",
  "rejection_reason": null,
  "approval_history": [
    {
      "action": "submitted",
      "user_id": "USER456",
      "timestamp": "2024-01-14T14:20:00Z",
      "notes": "Initial submission for approval"
    },
    {
      "action": "approved",
      "user_id": "USER123",
      "timestamp": "2024-01-15T10:30:00Z",
      "notes": "Approved after quality review"
    }
  ],
  "quality_score": 95,
  "compliance_checks": {
    "organic_certification": true,
    "safety_standards": true,
    "labeling_accuracy": true
  }
}
```

### Transaction Details JSON Format
```json
{
  "description": "Order payment processing",
  "notes": "Customer used discount code SAVE20",
  "metadata": {
    "payment_method": "credit_card",
    "gateway": "stripe",
    "currency_conversion": {
      "from": "EUR",
      "to": "USD",
      "rate": 1.08
    }
  },
  "reference_data": {
    "order_items": ["PROD001", "PROD002"],
    "shipping_method": "express"
  },
  "processing_info": {
    "processor_id": "stripe_001",
    "processing_time_ms": 1250,
    "retry_count": 0
  }
}
```

### Review Details JSON Format
```json
{
  "title": "Excellent quality bedsheets!",
  "review_text": "These sheets are incredibly soft and comfortable. The quality is outstanding and they wash beautifully.",
  "pros": [
    "Very soft material",
    "Great color retention",
    "Easy to care for"
  ],
  "cons": [
    "Slightly expensive",
    "Takes time to break in"
  ],
  "recommendation": "Highly recommend for anyone looking for premium bedding",
  "images": [
    {
      "url": "/uploads/reviews/img1.jpg",
      "caption": "Sheets on my bed",
      "uploaded_at": "2024-01-15T10:30:00Z"
    }
  ],
  "helpful_votes": 15,
  "verified_purchase_details": {
    "order_date": "2024-01-01",
    "variant": "Queen, White"
  }
}
```

### Email Template Content JSON Format
```json
{
  "html_content": "<html><body><h1>Welcome {{customer_name}}!</h1><p>Thank you for your order {{order_number}}.</p></body></html>",
  "text_content": "Welcome {{customer_name}}! Thank you for your order {{order_number}}.",
  "variables": {
    "customer_name": "string",
    "order_number": "string",
    "total_amount": "decimal",
    "shipping_address": "object"
  },
  "styling": {
    "theme": "modern",
    "primary_color": "#007bff",
    "font_family": "Arial, sans-serif"
  },
  "attachments": [
    {
      "type": "pdf",
      "template": "invoice_template",
      "filename": "invoice_{{order_number}}.pdf"
    }
  ],
  "metadata": {
    "category": "transactional",
    "priority": "high",
    "tracking_enabled": true
  }
}
```

## Database Queries

### Inserting Data

#### User Address
```sql
INSERT INTO user_addresses (user_id, type, first_name, last_name, phone, address_json) 
VALUES (
  'USER0000000001', 
  'shipping', 
  'John', 
  'Doe', 
  '+1-555-123-4567',
  JSON_OBJECT(
    'company', 'Acme Corp',
    'address_line_1', '123 Main Street',
    'address_line_2', 'Apt 4B',
    'city', 'New York',
    'state', 'NY',
    'postal_code', '10001',
    'country', 'US'
  )
);
```

#### Order with Addresses
```sql
INSERT INTO orders (
  user_id, 
  order_number, 
  status, 
  total_amount, 
  shipping_address_json, 
  billing_address_json
) VALUES (
  'USER0000000001',
  'ORD-2024-001',
  'pending',
  99.99,
  JSON_OBJECT(
    'first_name', 'John',
    'last_name', 'Doe',
    'company', 'Acme Corp',
    'address_line_1', '123 Main Street',
    'address_line_2', 'Apt 4B',
    'city', 'New York',
    'state', 'NY',
    'postal_code', '10001',
    'country', 'US',
    'phone', '+1-555-123-4567'
  ),
  JSON_OBJECT(
    'first_name', 'John',
    'last_name', 'Doe',
    'address_line_1', '456 Billing Ave',
    'city', 'Brooklyn',
    'state', 'NY',
    'postal_code', '11201',
    'country', 'US'
  )
);
```

### Querying Data

#### Extract Specific Fields
```sql
-- Get user addresses with extracted fields
SELECT 
  id,
  first_name,
  last_name,
  address_json->>'$.address_line_1' as street_address,
  address_json->>'$.city' as city,
  address_json->>'$.state' as state,
  address_json->>'$.country' as country
FROM user_addresses
WHERE user_id = 'USER0000000001';
```

#### Search by Address Components
```sql
-- Find orders by shipping country
SELECT order_number, total_amount
FROM orders
WHERE shipping_address_json->>'$.country' = 'US';

-- Find orders by shipping state
SELECT order_number, total_amount
FROM orders
WHERE shipping_address_json->>'$.state' = 'NY';

-- Find tax rates for specific location
SELECT tax_name, tax_rate
FROM tax_rates
WHERE location_json->>'$.country' = 'US'
  AND location_json->>'$.state' = 'NY'
  AND is_active = TRUE;
```

#### Product Details Queries
```sql
-- Insert product with details
INSERT INTO products (
  name, 
  description, 
  category_id, 
  base_price, 
  product_details
) VALUES (
  'Organic Cotton Bed Sheet',
  'Premium organic cotton bed sheet set',
  'CAT0000000001',
  89.99,
  JSON_OBJECT(
    'weight', 2.5,
    'dimensions_length', 200.0,
    'dimensions_width', 150.0,
    'dimensions_height', 5.0,
    'material', '100% Organic Cotton',
    'is_organic', true,
    'care_instructions', 'Machine wash cold, tumble dry low, do not bleach'
  )
);

-- Query products by material
SELECT name, base_price, product_details->>'$.material' as material
FROM products
WHERE product_details->>'$.material' LIKE '%Cotton%';

-- Find organic products
SELECT name, base_price
FROM products
WHERE product_details->>'$.is_organic' = 'true';

-- Get products by weight range
SELECT name, base_price, product_details->>'$.weight' as weight_kg
FROM products
WHERE CAST(product_details->>'$.weight' AS DECIMAL(8,3)) BETWEEN 1.0 AND 3.0;

-- Extract all product details
SELECT 
  name,
  base_price,
  product_details->>'$.weight' as weight_kg,
  product_details->>'$.dimensions_length' as length_cm,
  product_details->>'$.dimensions_width' as width_cm,
  product_details->>'$.dimensions_height' as height_cm,
  product_details->>'$.material' as material,
  product_details->>'$.is_organic' as is_organic,
  product_details->>'$.care_instructions' as care_instructions
FROM products
WHERE status = 'approved';
```

#### Approval Details Queries
```sql
-- Insert product with approval details
INSERT INTO products (
  name, 
  description, 
  category_id, 
  base_price, 
  product_details,
  approval_details
) VALUES (
  'Premium Organic Sheets',
  'High-quality organic cotton sheets',
  'CAT0000000001',
  129.99,
  JSON_OBJECT(
    'weight', 3.0,
    'material', '100% Organic Cotton',
    'is_organic', true
  ),
  JSON_OBJECT(
    'notes', 'Product meets all quality standards and organic certification requirements.',
    'approved_by', 'USER123',
    'approved_at', '2024-01-15T10:30:00Z',
    'quality_score', 95,
    'compliance_checks', JSON_OBJECT(
      'organic_certification', true,
      'safety_standards', true,
      'labeling_accuracy', true
    )
  )
);

-- Find approved products with approval details
SELECT id, name, status,
       approval_details->>'$.approved_by' as approved_by,
       approval_details->>'$.approved_at' as approved_at,
       approval_details->>'$.notes' as approval_notes
FROM products 
WHERE status = 'approved' AND approval_details IS NOT NULL;

-- Find products approved by specific user
SELECT id, name, approval_details->>'$.approved_at' as approved_at
FROM products 
WHERE approval_details->>'$.approved_by' = 'USER123';

-- Find products with high quality scores
SELECT id, name,
       CAST(approval_details->>'$.quality_score' AS UNSIGNED) as quality_score
FROM products 
WHERE CAST(approval_details->>'$.quality_score' AS UNSIGNED) >= 90;

-- Find rejected products with rejection reasons
SELECT id, name, approval_details->>'$.rejection_reason' as rejection_reason
FROM products 
WHERE status = 'rejected' AND approval_details->>'$.rejection_reason' IS NOT NULL;

-- Update approval details
UPDATE products 
SET approval_details = JSON_OBJECT(
    'approved_by', 'USER123',
    'approved_at', NOW(),
    'notes', 'Product meets all quality standards',
    'quality_score', 92
),
status = 'approved'
WHERE id = 'PROD001';

-- Add approval history entry
UPDATE products 
SET approval_details = JSON_SET(
    COALESCE(approval_details, '{}'),
    '$.approval_history',
    JSON_ARRAY(
        JSON_OBJECT(
            'action', 'approved',
            'user_id', 'USER123',
            'timestamp', NOW(),
            'notes', 'Final approval after review'
        )
    )
)
WHERE id = 'PROD001';

-- Check compliance status
SELECT id, name,
       approval_details->>'$.compliance_checks.organic_certification' as organic_certified,
       approval_details->>'$.compliance_checks.safety_standards' as safety_compliant
FROM products
WHERE approval_details->>'$.compliance_checks.organic_certification' = 'true'
  AND approval_details->>'$.compliance_checks.safety_standards' = 'true';
```

#### Transaction Details Queries
```sql
-- Insert transaction with details
INSERT INTO transactions (
  transaction_type, 
  reference_id, 
  amount, 
  transaction_details
) VALUES (
  'payment',
  'ORDER-12345',
  99.99,
  JSON_OBJECT(
    'description', 'Order payment processing',
    'notes', 'Customer used discount code SAVE20',
    'metadata', JSON_OBJECT(
      'payment_method', 'credit_card',
      'gateway', 'stripe',
      'currency_conversion', JSON_OBJECT(
        'from', 'EUR',
        'to', 'USD',
        'rate', 1.08
      )
    ),
    'processing_info', JSON_OBJECT(
      'processor_id', 'stripe_001',
      'processing_time_ms', 1250,
      'retry_count', 0
    )
  )
);

-- Query transactions by payment method
SELECT id, reference_id, amount
FROM transactions
WHERE transaction_details->>'$.metadata.payment_method' = 'credit_card';

-- Find transactions with processing issues
SELECT id, reference_id, 
       transaction_details->>'$.processing_info.retry_count' as retry_count
FROM transactions
WHERE CAST(transaction_details->>'$.processing_info.retry_count' AS UNSIGNED) > 0;

-- Get transactions by gateway
SELECT reference_id, amount,
       transaction_details->>'$.metadata.gateway' as gateway
FROM transactions
WHERE transaction_details->>'$.metadata.gateway' = 'stripe';
```

#### Review Details Queries
```sql
-- Insert product review with details
INSERT INTO product_reviews (
  product_id, 
  user_id, 
  rating, 
  review_details
) VALUES (
  'PROD-001',
  'USER-123',
  5,
  JSON_OBJECT(
    'title', 'Excellent quality bedsheets!',
    'review_text', 'These sheets are incredibly soft and comfortable.',
    'pros', JSON_ARRAY('Very soft material', 'Great color retention', 'Easy to care for'),
    'cons', JSON_ARRAY('Slightly expensive', 'Takes time to break in'),
    'recommendation', 'Highly recommend for anyone looking for premium bedding',
    'helpful_votes', 15,
    'verified_purchase_details', JSON_OBJECT(
      'order_date', '2024-01-01',
      'variant', 'Queen, White'
    )
  )
);

-- Query reviews by rating and recommendation
SELECT product_id, rating,
       review_details->>'$.title' as title
FROM product_reviews
WHERE rating >= 4 
  AND review_details->>'$.recommendation' LIKE '%recommend%';

-- Find reviews with specific pros
SELECT product_id, 
       review_details->>'$.title' as title,
       review_details->>'$.pros' as pros
FROM product_reviews
WHERE JSON_SEARCH(review_details->>'$.pros', 'one', '%soft%') IS NOT NULL;

-- Get verified purchase reviews
SELECT product_id, rating,
       review_details->>'$.verified_purchase_details.variant' as variant
FROM product_reviews
WHERE review_details->>'$.verified_purchase_details' IS NOT NULL;
```

#### Email Template Queries
```sql
-- Insert email template with content
INSERT INTO email_templates (
  name, 
  subject, 
  template_content
) VALUES (
  'welcome_email',
  'Welcome to Our Store!',
  JSON_OBJECT(
    'html_content', '<html><body><h1>Welcome {{customer_name}}!</h1><p>Thank you for your order {{order_number}}.</p></body></html>',
    'text_content', 'Welcome {{customer_name}}! Thank you for your order {{order_number}}.',
    'variables', JSON_OBJECT(
      'customer_name', 'string',
      'order_number', 'string',
      'total_amount', 'decimal'
    ),
    'styling', JSON_OBJECT(
      'theme', 'modern',
      'primary_color', '#007bff',
      'font_family', 'Arial, sans-serif'
    ),
    'metadata', JSON_OBJECT(
      'category', 'transactional',
      'priority', 'high',
      'tracking_enabled', true
    )
  )
);

-- Query templates by theme
SELECT name, subject
FROM email_templates
WHERE template_content->>'$.styling.theme' = 'modern';

-- Find templates with specific variables
SELECT name, 
       JSON_KEYS(template_content->>'$.variables') as available_variables
FROM email_templates
WHERE template_content->>'$.variables.customer_name' IS NOT NULL;

-- Get high priority templates
SELECT name, subject,
       template_content->>'$.metadata.priority' as priority
FROM email_templates
WHERE template_content->>'$.metadata.priority' = 'high';
```

#### Discount Code Queries
```sql
-- Insert discount code with details
INSERT INTO discount_codes (
  code, 
  discount_type, 
  discount_value, 
  code_details
) VALUES (
  'SAVE20',
  'percentage',
  20.00,
  JSON_OBJECT(
    'description', '20% off sitewide promotion',
    'usage_limits', JSON_OBJECT(
      'max_uses', 1000,
      'max_uses_per_customer', 1,
      'current_uses', 45
    ),
    'restrictions', JSON_OBJECT(
      'minimum_order_amount', 50.00,
      'excluded_categories', JSON_ARRAY('CAT001', 'CAT002'),
      'customer_groups', JSON_ARRAY('premium', 'vip')
    ),
    'validity', JSON_OBJECT(
      'start_date', '2024-01-01',
      'end_date', '2024-12-31',
      'timezone', 'UTC'
    )
  )
);

-- Find active discount codes
SELECT code, discount_value,
       code_details->>'$.validity.end_date' as end_date
FROM discount_codes
WHERE STR_TO_DATE(code_details->>'$.validity.end_date', '%Y-%m-%d') >= CURDATE()
  AND STR_TO_DATE(code_details->>'$.validity.start_date', '%Y-%m-%d') <= CURDATE();

-- Check usage limits
SELECT code,
       CAST(code_details->>'$.usage_limits.current_uses' AS UNSIGNED) as current_uses,
       CAST(code_details->>'$.usage_limits.max_uses' AS UNSIGNED) as max_uses
FROM discount_codes
WHERE CAST(code_details->>'$.usage_limits.current_uses' AS UNSIGNED) < 
      CAST(code_details->>'$.usage_limits.max_uses' AS UNSIGNED);
```

#### Complex Queries
```sql
-- Get full shipping address as concatenated string
SELECT 
  order_number,
  CONCAT(
    shipping_address_json->>'$.first_name', ' ',
    shipping_address_json->>'$.last_name', '\n',
    COALESCE(CONCAT(shipping_address_json->>'$.company', '\n'), ''),
    shipping_address_json->>'$.address_line_1', '\n',
    COALESCE(CONCAT(shipping_address_json->>'$.address_line_2', '\n'), ''),
    shipping_address_json->>'$.city', ', ',
    shipping_address_json->>'$.state', ' ',
    shipping_address_json->>'$.postal_code', '\n',
    shipping_address_json->>'$.country'
  ) as full_shipping_address
FROM orders;

-- Advanced product search with multiple JSON criteria
SELECT 
  p.name,
  p.base_price,
  p.product_details->>'$.material' as material,
  p.product_details->>'$.weight' as weight,
  AVG(pr.rating) as avg_rating,
  COUNT(pr.id) as review_count
FROM products p
LEFT JOIN product_reviews pr ON p.id = pr.product_id
WHERE p.product_details->>'$.is_organic' = 'true'
  AND CAST(p.product_details->>'$.weight' AS DECIMAL(8,3)) BETWEEN 1.0 AND 3.0
  AND p.product_details->>'$.material' LIKE '%Cotton%'
GROUP BY p.id, p.name, p.base_price
HAVING AVG(pr.rating) >= 4.0 OR COUNT(pr.id) = 0
ORDER BY avg_rating DESC, review_count DESC;

-- Email template usage analytics
SELECT 
  et.name,
  et.template_content->>'$.metadata.category' as category,
  COUNT(eq.id) as times_sent,
  AVG(CASE WHEN eq.status = 'delivered' THEN 1 ELSE 0 END) * 100 as delivery_rate
FROM email_templates et
LEFT JOIN email_queue eq ON et.id = eq.template_id
WHERE et.template_content->>'$.metadata.tracking_enabled' = 'true'
GROUP BY et.id, et.name
ORDER BY times_sent DESC;

-- Transaction analysis with JSON aggregation
SELECT 
  DATE(created_at) as transaction_date,
  transaction_details->>'$.metadata.gateway' as gateway,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount,
  AVG(CAST(transaction_details->>'$.processing_info.processing_time_ms' AS UNSIGNED)) as avg_processing_time
FROM transactions
WHERE transaction_type = 'payment'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at), transaction_details->>'$.metadata.gateway'
ORDER BY transaction_date DESC, total_amount DESC;
```

## Application Integration

### Node.js/Express Examples

#### Creating User Address
```javascript
// POST /api/user/addresses
app.post('/api/user/addresses', async (req, res) => {
  const { userId, type, firstName, lastName, phone, address } = req.body;
  
  const addressJson = {
    company: address.company || null,
    address_line_1: address.addressLine1,
    address_line_2: address.addressLine2 || null,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    country: address.country
  };
  
  const query = `
    INSERT INTO user_addresses (user_id, type, first_name, last_name, phone, address_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  await db.execute(query, [
    userId, type, firstName, lastName, phone, JSON.stringify(addressJson)
  ]);
});
```

#### Retrieving User Addresses
```javascript
// GET /api/user/:userId/addresses
app.get('/api/user/:userId/addresses', async (req, res) => {
  const { userId } = req.params;
  
  const query = `
    SELECT 
      id,
      type,
      first_name,
      last_name,
      phone,
      address_json,
      is_default
    FROM user_addresses 
    WHERE user_id = ?
  `;
  
  const [rows] = await db.execute(query, [userId]);
  
  const addresses = rows.map(row => ({
    id: row.id,
    type: row.type,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    address: JSON.parse(row.address_json),
    isDefault: row.is_default
  }));
  
  res.json(addresses);
});
```

#### Creating Order with Addresses
```javascript
// POST /api/orders
app.post('/api/orders', async (req, res) => {
  const { userId, items, shippingAddress, billingAddress } = req.body;
  
  const shippingJson = {
    first_name: shippingAddress.firstName,
    last_name: shippingAddress.lastName,
    company: shippingAddress.company || null,
    address_line_1: shippingAddress.addressLine1,
    address_line_2: shippingAddress.addressLine2 || null,
    city: shippingAddress.city,
    state: shippingAddress.state,
    postal_code: shippingAddress.postalCode,
    country: shippingAddress.country,
    phone: shippingAddress.phone || null
  };
  
  const billingJson = {
    first_name: billingAddress.firstName,
    last_name: billingAddress.lastName,
    company: billingAddress.company || null,
    address_line_1: billingAddress.addressLine1,
    address_line_2: billingAddress.addressLine2 || null,
    city: billingAddress.city,
    state: billingAddress.state,
    postal_code: billingAddress.postalCode,
    country: billingAddress.country,
    phone: billingAddress.phone || null
  };
  
  const orderQuery = `
    INSERT INTO orders (
      user_id, order_number, status, total_amount, 
      shipping_address_json, billing_address_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  await db.execute(orderQuery, [
    userId, orderNumber, 'pending', totalAmount,
    JSON.stringify(shippingJson), JSON.stringify(billingJson)
  ]);
});
```

#### Product Management with Details
```javascript
// POST /api/products
app.post('/api/products', async (req, res) => {
  const { name, description, categoryId, basePrice, details } = req.body;
  
  const productDetailsJson = {
    weight: details.weight,
    dimensions_length: details.dimensionsLength,
    dimensions_width: details.dimensionsWidth,
    dimensions_height: details.dimensionsHeight,
    material: details.material,
    is_organic: details.isOrganic || false,
    care_instructions: details.careInstructions
  };
  
  const query = `
    INSERT INTO products (name, description, category_id, base_price, product_details)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  await db.execute(query, [
    name, description, categoryId, basePrice, JSON.stringify(productDetailsJson)
  ]);
});

// GET /api/products/:productId
app.get('/api/products/:productId', async (req, res) => {
  const { productId } = req.params;
  
  const query = `
    SELECT 
      id, name, description, category_id, base_price, product_details, status
    FROM products 
    WHERE id = ?
  `;
  
  const [rows] = await db.execute(query, [productId]);
  
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  
  const product = rows[0];
  const details = JSON.parse(product.product_details);
  
  res.json({
    id: product.id,
    name: product.name,
    description: product.description,
    categoryId: product.category_id,
    basePrice: product.base_price,
    status: product.status,
    details: {
      weight: details.weight,
      dimensionsLength: details.dimensions_length,
      dimensionsWidth: details.dimensions_width,
      dimensionsHeight: details.dimensions_height,
      material: details.material,
      isOrganic: details.is_organic,
      careInstructions: details.care_instructions
    }
  });
});

// GET /api/products/search
app.get('/api/products/search', async (req, res) => {
  const { material, isOrganic, minWeight, maxWeight } = req.query;
  
  let query = `
    SELECT id, name, base_price, product_details
    FROM products
    WHERE status = 'approved'
  `;
  const params = [];
  
  if (material) {
    query += ` AND product_details->>'$.material' LIKE ?`;
    params.push(`%${material}%`);
  }
  
  if (isOrganic !== undefined) {
    query += ` AND product_details->>'$.is_organic' = ?`;
    params.push(isOrganic === 'true' ? 'true' : 'false');
  }
  
  if (minWeight || maxWeight) {
    if (minWeight) {
      query += ` AND CAST(product_details->>'$.weight' AS DECIMAL(8,3)) >= ?`;
      params.push(parseFloat(minWeight));
    }
    if (maxWeight) {
      query += ` AND CAST(product_details->>'$.weight' AS DECIMAL(8,3)) <= ?`;
      params.push(parseFloat(maxWeight));
    }
  }
  
  const [rows] = await db.execute(query, params);
  
  const products = rows.map(row => ({
    id: row.id,
    name: row.name,
    basePrice: row.base_price,
    details: JSON.parse(row.product_details)
  }));
  
  res.json(products);
});
```

### React Frontend Examples

#### Address Form Component
```jsx
import React, { useState } from 'react';

const AddressForm = ({ onSubmit, initialData = {} }) => {
  const [address, setAddress] = useState({
    firstName: initialData.firstName || '',
    lastName: initialData.lastName || '',
    company: initialData.address?.company || '',
    addressLine1: initialData.address?.address_line_1 || '',
    addressLine2: initialData.address?.address_line_2 || '',
    city: initialData.address?.city || '',
    state: initialData.address?.state || '',
    postalCode: initialData.address?.postal_code || '',
    country: initialData.address?.country || 'US',
    phone: initialData.phone || ''
  });
  
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      firstName: address.firstName,
      lastName: address.lastName,
      phone: address.phone,
      address: {
        company: address.company,
        address_line_1: address.addressLine1,
        address_line_2: address.addressLine2,
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: address.country
      }
    });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="First Name"
        value={address.firstName}
        onChange={(e) => setAddress({...address, firstName: e.target.value})}
        required
      />
      <input
        type="text"
        placeholder="Last Name"
        value={address.lastName}
        onChange={(e) => setAddress({...address, lastName: e.target.value})}
        required
      />
      <input
        type="text"
        placeholder="Company (Optional)"
        value={address.company}
        onChange={(e) => setAddress({...address, company: e.target.value})}
      />
      <input
        type="text"
        placeholder="Address Line 1"
        value={address.addressLine1}
        onChange={(e) => setAddress({...address, addressLine1: e.target.value})}
        required
      />
      <input
        type="text"
        placeholder="Address Line 2 (Optional)"
        value={address.addressLine2}
        onChange={(e) => setAddress({...address, addressLine2: e.target.value})}
      />
      <input
        type="text"
        placeholder="City"
        value={address.city}
        onChange={(e) => setAddress({...address, city: e.target.value})}
        required
      />
      <input
        type="text"
        placeholder="State/Province"
        value={address.state}
        onChange={(e) => setAddress({...address, state: e.target.value})}
        required
      />
      <input
        type="text"
        placeholder="Postal Code"
        value={address.postalCode}
        onChange={(e) => setAddress({...address, postalCode: e.target.value})}
        required
      />
      <select
        value={address.country}
        onChange={(e) => setAddress({...address, country: e.target.value})}
        required
      >
        <option value="US">United States</option>
        <option value="CA">Canada</option>
        <option value="GB">United Kingdom</option>
        {/* Add more countries */}
      </select>
      <input
        type="tel"
        placeholder="Phone Number"
        value={address.phone}
        onChange={(e) => setAddress({...address, phone: e.target.value})}
      />
      <button type="submit">Save Address</button>
    </form>
  );
};

export default AddressForm;
```

#### Product Details Form Component
```jsx
import React, { useState } from 'react';

const ProductDetailsForm = ({ onSubmit, initialData = {} }) => {
  const [details, setDetails] = useState({
    weight: initialData.details?.weight || '',
    dimensionsLength: initialData.details?.dimensionsLength || '',
    dimensionsWidth: initialData.details?.dimensionsWidth || '',
    dimensionsHeight: initialData.details?.dimensionsHeight || '',
    material: initialData.details?.material || '',
    isOrganic: initialData.details?.isOrganic || false,
    careInstructions: initialData.details?.careInstructions || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      weight: parseFloat(details.weight),
      dimensionsLength: parseFloat(details.dimensionsLength),
      dimensionsWidth: parseFloat(details.dimensionsWidth),
      dimensionsHeight: parseFloat(details.dimensionsHeight),
      material: details.material,
      isOrganic: details.isOrganic,
      careInstructions: details.careInstructions
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Weight (kg):</label>
        <input
          type="number"
          step="0.1"
          value={details.weight}
          onChange={(e) => setDetails({...details, weight: e.target.value})}
          required
        />
      </div>
      
      <div>
        <label>Dimensions (cm):</label>
        <input
          type="number"
          step="0.1"
          placeholder="Length"
          value={details.dimensionsLength}
          onChange={(e) => setDetails({...details, dimensionsLength: e.target.value})}
        />
        <input
          type="number"
          step="0.1"
          placeholder="Width"
          value={details.dimensionsWidth}
          onChange={(e) => setDetails({...details, dimensionsWidth: e.target.value})}
        />
        <input
          type="number"
          step="0.1"
          placeholder="Height"
          value={details.dimensionsHeight}
          onChange={(e) => setDetails({...details, dimensionsHeight: e.target.value})}
        />
      </div>
      
      <div>
        <label>Material:</label>
        <input
          type="text"
          value={details.material}
          onChange={(e) => setDetails({...details, material: e.target.value})}
          placeholder="e.g., 100% Organic Cotton"
        />
      </div>
      
      <div>
        <label>
          <input
            type="checkbox"
            checked={details.isOrganic}
            onChange={(e) => setDetails({...details, isOrganic: e.target.checked})}
          />
          Organic Product
        </label>
      </div>
      
      <div>
        <label>Care Instructions:</label>
        <textarea
          value={details.careInstructions}
          onChange={(e) => setDetails({...details, careInstructions: e.target.value})}
          placeholder="Machine wash cold, tumble dry low..."
          rows={3}
        />
      </div>
      
      <button type="submit">Save Product Details</button>
    </form>
  );
};

export default ProductDetailsForm;
```

## Benefits of JSON System

### Address System Benefits
1. **Flexibility**: Easy to add new address fields without schema changes
2. **Internationalization**: Can handle different address formats for different countries
3. **Reduced Table Width**: Fewer columns in the database tables
4. **Atomic Updates**: Address information is updated as a single unit
5. **Schema Evolution**: Easy to modify address structure over time

### Product Details System Benefits
1. **Extensibility**: Easy to add new product attributes (texture, thread count, etc.)
2. **Consistency**: Standardized structure across all products
3. **Maintainability**: Single column for all physical product specifications
4. **Flexibility**: Different product types can have different detail structures
5. **Performance**: Reduced JOIN operations for product information

### Overall JSON System Benefits
1. **Query Performance**: Indexed JSON fields provide excellent query performance
2. **Storage Efficiency**: More compact storage compared to multiple columns
3. **Application Simplicity**: Easier to work with in modern web applications
4. **Future-Proof**: Easy to evolve schema without database migrations
5. **Type Safety**: JSON validation ensures data integrity

## Performance Considerations

1. **Indexing**: Use functional indexes on frequently queried JSON fields
2. **Validation**: Implement application-level validation for JSON structure
3. **Size Limits**: JSON columns can store up to 1GB, but keep addresses reasonable
4. **Query Optimization**: Use JSON functions efficiently in WHERE clauses

## Migration Strategy

If migrating from the old column-based structure:

### Address Migration
```sql
-- Example migration script for addresses
UPDATE user_addresses SET address_json = JSON_OBJECT(
  'company', company,
  'address_line_1', address_line_1,
  'address_line_2', address_line_2,
  'city', city,
  'state', state,
  'postal_code', postal_code,
  'country', country
) WHERE address_json IS NULL;

-- After verifying data, drop old columns
-- ALTER TABLE user_addresses DROP COLUMN company;
-- ALTER TABLE user_addresses DROP COLUMN address_line_1;
-- ... etc
```

### Product Details Migration
```sql
-- Example migration script for product details
UPDATE products SET product_details = JSON_OBJECT(
  'weight', weight,
  'dimensions_length', dimensions_length,
  'dimensions_width', dimensions_width,
  'dimensions_height', dimensions_height,
  'material', material,
  'is_organic', is_organic,
  'care_instructions', care_instructions
) WHERE product_details IS NULL;

-- After verifying data, drop old columns
-- ALTER TABLE products DROP COLUMN weight;
-- ALTER TABLE products DROP COLUMN dimensions_length;
-- ALTER TABLE products DROP COLUMN dimensions_width;
-- ALTER TABLE products DROP COLUMN dimensions_height;
-- ALTER TABLE products DROP COLUMN material;
-- ALTER TABLE products DROP COLUMN is_organic;
-- ALTER TABLE products DROP COLUMN care_instructions;
```

### Approval Details Migration
```sql
-- Example migration script for approval details
UPDATE products SET approval_details = JSON_OBJECT(
  'notes', COALESCE(approval_notes, ''),
  'approved_by', approved_by,
  'approved_at', CASE 
    WHEN approved_at IS NOT NULL THEN DATE_FORMAT(approved_at, '%Y-%m-%dT%H:%i:%sZ')
    ELSE NULL 
  END,
  'rejection_reason', CASE 
    WHEN status = 'rejected' THEN COALESCE(approval_notes, 'No reason provided')
    ELSE NULL 
  END,
  'approval_history', JSON_ARRAY(
    JSON_OBJECT(
      'action', CASE 
        WHEN status = 'approved' THEN 'approved'
        WHEN status = 'rejected' THEN 'rejected'
        ELSE 'submitted'
      END,
      'user_id', COALESCE(approved_by, created_by),
      'timestamp', CASE 
        WHEN approved_at IS NOT NULL THEN DATE_FORMAT(approved_at, '%Y-%m-%dT%H:%i:%sZ')
        ELSE DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ')
      END,
      'notes', COALESCE(approval_notes, 'Initial submission')
    )
  ),
  'quality_score', CASE 
    WHEN status = 'approved' THEN 85
    ELSE NULL 
  END,
  'compliance_checks', JSON_OBJECT(
    'organic_certification', COALESCE(JSON_EXTRACT(product_details, '$.is_organic'), false),
    'safety_standards', true,
    'labeling_accuracy', true
  )
) WHERE approval_details IS NULL;

-- After verifying data, drop old columns
-- ALTER TABLE products DROP COLUMN approval_notes;
-- ALTER TABLE products DROP COLUMN approved_by;
-- ALTER TABLE products DROP COLUMN approved_at;
```

### Transaction Details Migration
```sql
-- Migrate existing transaction details to JSON
UPDATE transno 
SET transaction_details = JSON_OBJECT(
    'description', COALESCE(details, 'Transaction record'),
    'notes', '',
    'metadata', JSON_OBJECT(),
    'reference_data', JSON_OBJECT(),
    'processing_info', JSON_OBJECT(
        'migrated_at', NOW(),
        'migration_version', '1.0'
    )
)
WHERE transaction_details IS NULL;

-- Drop old column after migration
ALTER TABLE transno DROP COLUMN details;
```

### Review Details Migration
```sql
-- Migrate existing review data to JSON
UPDATE product_reviews 
SET review_details = JSON_OBJECT(
    'title', COALESCE(title, ''),
    'review_text', COALESCE(review_text, ''),
    'pros', JSON_ARRAY(),
    'cons', JSON_ARRAY(),
    'recommendation', '',
    'images', JSON_ARRAY(),
    'helpful_votes', 0,
    'verified_purchase_details', CASE 
        WHEN is_verified_purchase = TRUE 
        THEN JSON_OBJECT('verified', true)
        ELSE NULL
    END
)
WHERE review_details IS NULL;

-- Drop old columns after migration
ALTER TABLE product_reviews 
DROP COLUMN title,
DROP COLUMN review_text;
```

### Email Template Migration
```sql
-- Migrate existing email template data to JSON
UPDATE email_templates 
SET template_content = JSON_OBJECT(
    'html_content', COALESCE(html_content, ''),
    'text_content', COALESCE(text_content, ''),
    'variables', COALESCE(variables, JSON_OBJECT()),
    'styling', JSON_OBJECT(
        'theme', 'default',
        'primary_color', '#007bff',
        'font_family', 'Arial, sans-serif'
    ),
    'attachments', JSON_ARRAY(),
    'metadata', JSON_OBJECT(
        'category', 'general',
        'priority', 'normal',
        'tracking_enabled', false,
        'migrated_at', NOW()
    )
)
WHERE template_content IS NULL;

-- Drop old columns after migration
ALTER TABLE email_templates 
DROP COLUMN html_content,
DROP COLUMN text_content,
DROP COLUMN variables;
```

### Discount Code Migration
```sql
-- Migrate existing discount code data to JSON
UPDATE discount_codes 
SET code_details = JSON_OBJECT(
    'description', COALESCE(description, ''),
    'usage_limits', JSON_OBJECT(
        'max_uses', COALESCE(max_uses, 0),
        'max_uses_per_customer', COALESCE(max_uses_per_customer, 1),
        'current_uses', COALESCE(current_uses, 0)
    ),
    'restrictions', JSON_OBJECT(
        'minimum_order_amount', COALESCE(minimum_order_amount, 0),
        'excluded_categories', JSON_ARRAY(),
        'customer_groups', JSON_ARRAY()
    ),
    'validity', JSON_OBJECT(
        'start_date', COALESCE(start_date, CURDATE()),
        'end_date', COALESCE(end_date, DATE_ADD(CURDATE(), INTERVAL 1 YEAR)),
        'timezone', 'UTC'
    )
)
WHERE code_details IS NULL;

-- Drop old columns after migration
ALTER TABLE discount_codes 
DROP COLUMN description,
DROP COLUMN max_uses,
DROP COLUMN max_uses_per_customer,
DROP COLUMN current_uses,
DROP COLUMN minimum_order_amount,
DROP COLUMN start_date,
DROP COLUMN end_date;
```

### Comprehensive Migration Script
```sql
-- Complete migration script for all JSON consolidations
START TRANSACTION;

-- 1. Transaction details migration
UPDATE transno 
SET transaction_details = JSON_OBJECT(
    'description', COALESCE(details, 'Transaction record'),
    'migrated_at', NOW()
)
WHERE transaction_details IS NULL;

-- 2. Inventory movements migration
UPDATE inventory_movements 
SET movement_details = JSON_OBJECT(
    'notes', COALESCE(notes, ''),
    'migrated_at', NOW()
)
WHERE movement_details IS NULL;

-- 3. Order status history migration
UPDATE order_status_history 
SET status_details = JSON_OBJECT(
    'notes', COALESCE(notes, ''),
    'migrated_at', NOW()
)
WHERE status_details IS NULL;

-- 4. Refunds migration
UPDATE refunds 
SET refund_details = JSON_OBJECT(
    'reason_notes', COALESCE(reason_notes, ''),
    'migrated_at', NOW()
)
WHERE refund_details IS NULL;

-- 5. Discount codes migration
UPDATE discount_codes 
SET code_details = JSON_OBJECT(
    'description', COALESCE(description, ''),
    'migrated_at', NOW()
)
WHERE code_details IS NULL;

-- 6. Email queue migration
UPDATE email_queue 
SET email_content = JSON_OBJECT(
    'html_content', COALESCE(html_content, ''),
    'text_content', COALESCE(text_content, ''),
    'migrated_at', NOW()
),
processing_details = JSON_OBJECT(
    'error_message', COALESCE(error_message, ''),
    'migrated_at', NOW()
)
WHERE email_content IS NULL OR processing_details IS NULL;

-- 7. System settings migration
UPDATE system_settings 
SET setting_details = JSON_OBJECT(
    'description', COALESCE(description, ''),
    'migrated_at', NOW()
)
WHERE setting_details IS NULL;

-- 8. Audit logs migration
UPDATE audit_logs 
SET session_details = JSON_OBJECT(
    'ip_address', COALESCE(ip_address, ''),
    'user_agent', COALESCE(user_agent, ''),
    'migrated_at', NOW()
)
WHERE session_details IS NULL;

COMMIT;

-- Verify migration results
SELECT 
    'transno' as table_name,
    COUNT(*) as total_rows,
    COUNT(transaction_details) as migrated_rows
FROM transno
UNION ALL
SELECT 
    'product_reviews' as table_name,
    COUNT(*) as total_rows,
    COUNT(review_details) as migrated_rows
FROM product_reviews
UNION ALL
SELECT 
    'email_templates' as table_name,
    COUNT(*) as total_rows,
    COUNT(template_content) as migrated_rows
FROM email_templates;
```

## Best Practices

### General JSON System Practices
1. **Validation**: Always validate JSON structure in application code using JSON_VALID()
2. **Null Handling**: Use COALESCE or IFNULL for optional fields
3. **Consistent Structure**: Maintain consistent JSON key names across tables
4. **Documentation**: Keep JSON structure well-documented for each domain
5. **Testing**: Test JSON queries thoroughly, especially with NULL values
6. **Backup**: Always backup before schema changes
7. **Version Control**: Include version fields in JSON for schema evolution
8. **Error Handling**: Implement robust error handling for JSON operations

### Address-Specific Practices
1. **Country Codes**: Use ISO 3166-1 alpha-2 country codes (US, CA, GB)
2. **Phone Formatting**: Store phone numbers in international format
3. **Address Validation**: Implement address validation services for accuracy
4. **Postal Code Formats**: Handle different postal code formats per country
5. **Geocoding**: Store latitude/longitude for mapping features when needed

### Product Details Practices
1. **Unit Consistency**: Always use consistent units (kg for weight, cm for dimensions)
2. **Decimal Precision**: Maintain appropriate precision for measurements
3. **Material Standards**: Use standardized material descriptions
4. **Care Instructions**: Follow industry-standard care symbols and descriptions
5. **Organic Certification**: Validate organic claims with proper certification
6. **Multimedia**: Support image and video references in product details

### Approval Workflow Practices
1. **History Tracking**: Always maintain complete approval history with timestamps
2. **User Attribution**: Record which user performed each approval action
3. **Reason Documentation**: Require detailed notes for rejections and approvals
4. **Quality Metrics**: Include quality scores and compliance checks
5. **Audit Trail**: Ensure all approval actions are logged and immutable
6. **Status Consistency**: Keep approval_details in sync with product status
7. **Compliance Validation**: Validate all compliance checks before approval

### Transaction & Operations Practices
1. **Audit Trail**: Include timestamp and user information in transaction details
2. **Reference Integrity**: Maintain references to related entities
3. **Error Logging**: Store detailed error information for troubleshooting
4. **Processing Metrics**: Track processing times and performance data
5. **Retry Logic**: Include retry count and failure reasons

### Customer Interaction Practices
1. **Content Moderation**: Validate and sanitize user-generated content
2. **Rich Media**: Support images, videos, and attachments in reviews
3. **Sentiment Analysis**: Store sentiment scores and analysis results
4. **Engagement Metrics**: Track helpful votes, shares, and interactions
5. **Verification**: Link reviews to verified purchases when possible

### Communication & Notifications Practices
1. **Template Versioning**: Version email templates for A/B testing
2. **Personalization**: Support dynamic content and personalization
3. **Delivery Tracking**: Track open rates, click rates, and bounces
4. **Compliance**: Ensure templates comply with email regulations
5. **Fallback Content**: Always provide text alternatives to HTML content

### System Management Practices
1. **Configuration Validation**: Validate system settings before applying
2. **Change Tracking**: Log all configuration changes with timestamps
3. **Environment Separation**: Use different settings for dev/staging/prod
4. **Security**: Encrypt sensitive configuration values
5. **Documentation**: Document all settings and their impact

### Performance Optimization
1. **Functional Indexes**: Create indexes on frequently queried JSON paths
2. **Query Patterns**: Use JSON_EXTRACT() for better performance in complex queries
3. **Data Types**: Cast JSON values to appropriate types in WHERE clauses
4. **Caching**: Cache frequently accessed JSON data in application layer

#### Recommended Indexes for JSON Queries
```sql
-- Address-based indexes
CREATE INDEX idx_user_addresses_country ON user_addresses ((address_json->>'$.country'));
CREATE INDEX idx_user_addresses_state ON user_addresses ((address_json->>'$.state'));
CREATE INDEX idx_orders_shipping_country ON orders ((shipping_address_json->>'$.country'));
CREATE INDEX idx_tax_rates_location ON tax_rates ((location_json->>'$.country'), (location_json->>'$.state'));

-- Product-based indexes
CREATE INDEX idx_products_material ON products ((product_details->>'$.material'));
CREATE INDEX idx_products_organic ON products ((product_details->>'$.is_organic'));
CREATE INDEX idx_products_weight ON products ((CAST(product_details->>'$.weight' AS DECIMAL(8,3))));

-- Transaction-based indexes
CREATE INDEX idx_transactions_gateway ON transactions ((transaction_details->>'$.metadata.gateway'));
CREATE INDEX idx_transactions_payment_method ON transactions ((transaction_details->>'$.metadata.payment_method'));

-- Review-based indexes
CREATE INDEX idx_reviews_verified ON product_reviews ((CASE WHEN review_details->>'$.verified_purchase_details' IS NOT NULL THEN 1 ELSE 0 END));

-- Email template indexes
CREATE INDEX idx_email_templates_category ON email_templates ((template_content->>'$.metadata.category'));
CREATE INDEX idx_email_templates_priority ON email_templates ((template_content->>'$.metadata.priority'));

-- Discount code indexes
CREATE INDEX idx_discount_codes_end_date ON discount_codes ((STR_TO_DATE(code_details->>'$.validity.end_date', '%Y-%m-%d')));
CREATE INDEX idx_discount_codes_usage ON discount_codes ((CAST(code_details->>'$.usage_limits.current_uses' AS UNSIGNED)));
```

#### JSON Query Optimization Tips
```sql
-- Use JSON_VALID() to ensure data integrity
SELECT COUNT(*) as invalid_json_count
FROM products
WHERE NOT JSON_VALID(product_details);

-- Use JSON_LENGTH() for array operations
SELECT product_id, 
       JSON_LENGTH(review_details->>'$.pros') as pros_count,
       JSON_LENGTH(review_details->>'$.cons') as cons_count
FROM product_reviews
WHERE JSON_LENGTH(review_details->>'$.pros') > 2;

-- Optimize JSON path expressions
-- Instead of: product_details->>'$.dimensions.length'
-- Use: product_details->>'$.dimensions_length' (flattened structure)

-- Use JSON_CONTAINS for complex matching
SELECT code
FROM discount_codes
WHERE JSON_CONTAINS(code_details->>'$.restrictions.customer_groups', '"premium"');

-- Batch JSON updates for better performance
UPDATE products 
SET product_details = JSON_SET(
  product_details,
  '$.last_updated', NOW(),
  '$.version', COALESCE(CAST(product_details->>'$.version' AS UNSIGNED), 0) + 1
)
WHERE status = 'approved';
```

This comprehensive JSON system provides a modern, flexible approach to handling both address and product data while maintaining excellent performance and query capabilities.