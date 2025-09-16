# Shipping Service

The Shipping Service handles shipping cost calculations, zone management, and shipping rate management for the e-commerce platform.

## Features

### Core Functionality
- **Shipping Cost Calculation**: Calculate shipping costs based on destination, weight, and shipping zones
- **Zone-based Shipping**: Support for multiple shipping zones with different rates
- **Weight-based Pricing**: Base rate + per-kilogram pricing model
- **Free Shipping Thresholds**: Automatic free shipping for orders above specified amounts
- **Multiple Shipping Options**: Standard, Express, and Heavy Item shipping rates

### Admin Features
- **Zone Management**: Create, update, and manage shipping zones
- **Rate Management**: Create, update, and delete shipping rates
- **Country Assignment**: Assign countries to shipping zones
- **Rate Configuration**: Configure base rates, per-kg rates, and delivery estimates

## API Endpoints

### Public Endpoints

#### Calculate Shipping
```
POST /api/shipping/calculate
```
Calculate shipping options for given address and items.

**Request Body:**
```json
{
  "address": {
    "country": "US",
    "state": "CA",
    "city": "Los Angeles",
    "postal_code": "90210"
  },
  "items": [
    {
      "product_id": "PROD0000000001",
      "variant_id": null,
      "quantity": 2
    }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "zone": "United States",
    "totalWeight": 2.4,
    "options": [
      {
        "id": "SHIP0000000008",
        "name": "Free Standard Shipping",
        "cost": 0.00,
        "estimatedDays": { "min": 5, "max": 7 },
        "zone": "United States"
      },
      {
        "id": "SHIP0000000006",
        "name": "Standard Shipping",
        "cost": 7.24,
        "estimatedDays": { "min": 5, "max": 7 },
        "zone": "United States"
      }
    ]
  }
}
```

#### Calculate Weight
```
POST /api/shipping/calculate-weight
```
Calculate total weight for given items.

#### Find Zone by Country
```
GET /api/shipping/zones/:countryCode/find
```
Find shipping zone for a specific country code.

### Admin Endpoints (Protected)

#### Get All Zones
```
GET /api/shipping/zones
```
Get all shipping zones with countries.

#### Create Zone
```
POST /api/shipping/zones
```
Create a new shipping zone.

#### Update Zone
```
PUT /api/shipping/zones/:zoneId
```
Update an existing shipping zone.

#### Get Zone Rates
```
GET /api/shipping/zones/:zoneId/rates
```
Get all shipping rates for a specific zone.

#### Create Rate
```
POST /api/shipping/rates
```
Create a new shipping rate.

#### Update Rate
```
PUT /api/shipping/rates/:rateId
```
Update an existing shipping rate.

#### Delete Rate
```
DELETE /api/shipping/rates/:rateId
```
Delete a shipping rate.

## Database Schema

### Shipping Zones
```sql
CREATE TABLE shipping_zones (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    countries JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Shipping Rates
```sql
CREATE TABLE shipping_rates (
    id VARCHAR(50) PRIMARY KEY,
    zone_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    min_weight DECIMAL(8,3) DEFAULT 0.000,
    max_weight DECIMAL(8,3) NULL,
    base_rate DECIMAL(10,2) NOT NULL,
    per_kg_rate DECIMAL(10,2) DEFAULT 0.00,
    min_order_amount DECIMAL(10,2) DEFAULT 0.00,
    estimated_days_min INT UNSIGNED,
    estimated_days_max INT UNSIGNED,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (zone_id) REFERENCES shipping_zones(id)
);
```

## Default Shipping Zones

The system comes with pre-configured shipping zones:

1. **United States** (US)
   - Standard Shipping: $5.99 + $0.50/kg (5-7 days)
   - Express Shipping: $12.99 + $1.00/kg (2-3 days)
   - Free Standard Shipping: Free for orders $75+ (5-7 days)
   - Heavy Item Shipping: $15.99 + $2.00/kg for items >10kg (7-10 days)

2. **Canada** (CA)
   - Standard Shipping: $8.99 + $0.75/kg (7-10 days)
   - Express Shipping: $18.99 + $1.50/kg (3-5 days)
   - Free Standard Shipping: Free for orders $100+ (7-10 days)
   - Heavy Item Shipping: $22.99 + $3.00/kg for items >10kg (10-14 days)

3. **Europe** (GB, DE, FR, IT, ES, NL, BE, AT, CH, SE, NO, DK, FI)
   - Standard Shipping: $12.99 + $1.00/kg (10-14 days)
   - Express Shipping: $24.99 + $2.00/kg (5-7 days)
   - Free Standard Shipping: Free for orders $150+ (10-14 days)
   - Heavy Item Shipping: $35.99 + $4.00/kg for items >10kg (14-21 days)

4. **Asia Pacific** (AU, NZ, JP, SG, HK, KR)
   - Standard Shipping: $15.99 + $1.25/kg (14-21 days)
   - Express Shipping: $29.99 + $2.50/kg (7-10 days)
   - Free Standard Shipping: Free for orders $200+ (14-21 days)
   - Heavy Item Shipping: $45.99 + $5.00/kg for items >10kg (21-28 days)

5. **Rest of World** (MX, BR, AR, CL, IN, CN, TH, MY, PH, ID, VN)
   - Standard Shipping: $19.99 + $1.50/kg (21-28 days)
   - Express Shipping: $39.99 + $3.00/kg (10-14 days)
   - Free Standard Shipping: Free for orders $250+ (21-28 days)
   - Heavy Item Shipping: $59.99 + $6.00/kg for items >10kg (28-35 days)

## Usage Examples

### Calculate Shipping in Checkout
```javascript
// Frontend integration
const calculateShipping = async (address, items) => {
  const response = await fetch('/api/shipping/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, items })
  });
  
  const data = await response.json();
  if (data.status === 'success') {
    return data.data.options;
  }
  throw new Error(data.message);
};
```

### Admin Zone Management
```javascript
// Create new shipping zone
const createZone = async (zoneData) => {
  const response = await fetch('/api/shipping/zones', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(zoneData)
  });
  
  return response.json();
};
```

## Testing

Run the shipping service tests:
```bash
node backend/scripts/test-shipping-service.js
```

Run the shipping migration:
```bash
node backend/scripts/run-shipping-migration.js
```

## Integration

The shipping service integrates with:
- **Product Service**: Retrieves product weights for calculation
- **Cart Service**: Calculates shipping for cart items
- **Order Service**: Stores selected shipping method and cost
- **Checkout Process**: Provides shipping options to customers

## Error Handling

The service handles various error scenarios:
- Invalid country codes (no shipping zone found)
- No shipping rates available for weight/zone combination
- Database connection errors
- Invalid product data

All errors are logged and appropriate error messages are returned to the client.

## Performance Considerations

- Database queries are optimized with proper indexing
- JSON country lookups use MySQL's JSON_CONTAINS function
- Weight calculations are cached during the request lifecycle
- Shipping options are sorted by cost (cheapest first)

## Future Enhancements

Potential improvements for the shipping system:
- Integration with real-time shipping APIs (FedEx, UPS, DHL)
- Dynamic pricing based on fuel costs
- Shipping insurance options
- Delivery date estimation based on business days
- Bulk shipping discounts
- Dimensional weight calculations