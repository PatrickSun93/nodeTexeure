# Tax Service Documentation

## Overview

The Tax Service provides comprehensive tax calculation functionality for the e-commerce platform. It calculates taxes based on customer addresses and integrates with the order creation process to ensure accurate tax collection.

## Features

- **Address-based Tax Calculation**: Calculates taxes based on customer billing address
- **Hierarchical Tax Rate Matching**: Supports city, state, and country-level tax rates
- **Multiple Tax Types**: Handles various tax types (sales tax, VAT, GST, etc.)
- **Tax Rate Management**: CRUD operations for tax rates (admin only)
- **Integration with Orders**: Automatically calculates taxes during checkout
- **Tax Reporting**: Provides tax collection summaries and analytics

## API Endpoints

### Public Endpoints

#### Calculate Tax
```http
POST /api/tax/calculate
```

Calculate tax amount for a given address and order details.

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
      "product_id": "PROD001",
      "name": "Product Name",
      "quantity": 2,
      "price": 89.99
    }
  ],
  "subtotal": 329.97
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Tax calculated successfully",
  "keyValueTable": {
    "taxAmount": 23.92,
    "taxRate": "0.072500",
    "breakdown": [
      {
        "name": "California State Tax",
        "rate": "7.25%",
        "amount": "23.92"
      }
    ],
    "details": [
      {
        "taxName": "California State Tax",
        "taxRate": "0.072500",
        "taxAmount": 23.922825,
        "location": {
          "state": "CA",
          "country": "US"
        }
      }
    ]
  }
}
```

#### Get Tax Rates by Location
```http
GET /api/tax/rates/location/{country}?state={state}
```

Get active tax rates for a specific location.

**Example:**
```http
GET /api/tax/rates/location/US?state=CA
```

### Admin Endpoints (Authentication Required)

#### Get All Tax Rates
```http
GET /api/tax/rates
```

#### Get Tax Rate by ID
```http
GET /api/tax/rates/{id}
```

#### Create Tax Rate
```http
POST /api/tax/rates
```

**Request Body:**
```json
{
  "location": {
    "country": "US",
    "state": "CA",
    "city": "Los Angeles"
  },
  "tax_name": "Los Angeles City Tax",
  "tax_rate": 0.0100,
  "is_active": true
}
```

#### Update Tax Rate
```http
PUT /api/tax/rates/{id}
```

#### Delete Tax Rate
```http
DELETE /api/tax/rates/{id}
```

#### Get Tax Summary
```http
GET /api/tax/summary?startDate=2024-01-01&endDate=2024-12-31&country=US
```

## Tax Rate Hierarchy

The system uses a hierarchical approach to match tax rates:

1. **Exact Match**: City + State + Country
2. **State Match**: State + Country (city is NULL)
3. **Country Match**: Country only (state and city are NULL)

### Example Tax Rate Structure

```json
{
  "id": "TAX0000000001",
  "location_json": {
    "country": "US",
    "state": "CA",
    "city": "Los Angeles"
  },
  "tax_name": "Los Angeles City Tax",
  "tax_rate": 0.0100,
  "is_active": true
}
```

## Tax Rate Formats

Tax rates are stored as decimal values between 0 and 1:
- `0.0725` = 7.25%
- `0.0800` = 8.00%
- `0.0000` = 0.00% (no tax)

## Integration with Order System

The tax service is automatically integrated with the order creation process:

1. When an order is created, the system calls `taxService.calculateTax()`
2. Tax is calculated based on the billing address
3. Tax amount is added to the order total
4. Tax details are included in order confirmation emails

## Database Schema

### tax_rates Table

```sql
CREATE TABLE tax_rates (
    id VARCHAR(50) PRIMARY KEY,
    location_json JSON NOT NULL,
    tax_name VARCHAR(100) NOT NULL,
    tax_rate DECIMAL(8,6) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Indexes

```sql
CREATE INDEX idx_tax_rates_country ON tax_rates ((JSON_EXTRACT(location_json, '$.country')));
CREATE INDEX idx_tax_rates_state ON tax_rates ((JSON_EXTRACT(location_json, '$.state')));
CREATE INDEX idx_tax_rates_city ON tax_rates ((JSON_EXTRACT(location_json, '$.city')));
CREATE INDEX idx_tax_rates_active ON tax_rates (is_active);
```

## Sample Tax Rates

The system comes pre-populated with common tax rates:

### United States
- California: 7.25%
- New York: 8.00%
- Texas: 6.25%
- Oregon: 0.00% (no sales tax)

### Canada
- Ontario: 13.00% (HST)
- British Columbia: 12.00% (GST + PST)

### International
- United Kingdom: 20.00% (VAT)
- Germany: 19.00% (VAT)
- Australia: 10.00% (GST)

## Error Handling

The service includes comprehensive error handling:

- **Invalid Address**: Returns 0 tax if no matching rates found
- **Database Errors**: Gracefully handles connection issues
- **Validation Errors**: Validates input parameters
- **Rate Calculation Errors**: Handles edge cases in calculations

## Testing

### Service Testing
```bash
node backend/scripts/test-tax-calculation.js
```

### API Testing
```bash
# Calculate tax for California
curl -X POST http://localhost:6666/api/tax/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "address": {"country": "US", "state": "CA"},
    "subtotal": 100.00
  }'

# Get US tax rates
curl -X GET "http://localhost:6666/api/tax/rates/location/US"
```

## Configuration

Tax rates can be managed through:

1. **Database Direct**: Insert/update records in `tax_rates` table
2. **Admin API**: Use the admin endpoints to manage rates
3. **Migration Scripts**: Use database migrations for bulk updates

## Performance Considerations

- Tax rates are cached in memory for frequently accessed locations
- Database queries use optimized indexes on JSON fields
- Calculation results are rounded to 2 decimal places for currency precision

## Compliance Notes

- Tax rates should be updated regularly to reflect current regulations
- The system supports multiple tax types per location (e.g., state + city tax)
- All tax calculations are logged for audit purposes
- Tax collection reports can be generated for compliance reporting

## Future Enhancements

- **Tax Exemptions**: Support for tax-exempt customers/products
- **Product-specific Rates**: Different tax rates for different product categories
- **Real-time Rate Updates**: Integration with tax rate APIs
- **Multi-currency Support**: Tax calculation in different currencies
- **Advanced Reporting**: Detailed tax analytics and reporting features