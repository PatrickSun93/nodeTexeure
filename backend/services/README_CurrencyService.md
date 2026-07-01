# Currency Service Implementation

## Overview

The Currency Service provides comprehensive multi-currency support for the e-commerce platform, including real-time exchange rate updates, currency conversion, location-based currency detection, and localized formatting.

## Features

### 1. Multi-Currency Support
- **Supported Currencies**: USD, CNY, EUR, GBP, JPY, CAD, AUD
- **Base Currency**: USD (all prices stored in USD)
- **Real-time Exchange Rates**: Automatic updates every hour
- **Fallback Rates**: Default rates used when API is unavailable

### 2. Currency Detection
- **IP-based Location Detection**: Automatically detects user's country and suggests appropriate currency
- **Country-to-Currency Mapping**: Intelligent mapping of countries to their primary currencies
- **Fallback Support**: Defaults to USD for unrecognized locations

### 3. Currency Conversion
- **Real-time Conversion**: Convert between any supported currencies
- **Base Currency Conversion**: Convert from USD to any target currency
- **Cross-Currency Conversion**: Direct conversion between non-USD currencies
- **Precision Handling**: Proper decimal handling for different currency types

### 4. Localized Formatting
- **Locale-aware Formatting**: Uses Intl.NumberFormat for proper currency display
- **Symbol Support**: Correct currency symbols for each currency
- **Fallback Formatting**: Custom formatting when Intl API is unavailable

## API Endpoints

### GET /api/currency/rates
Get all supported currencies with current exchange rates.

**Response:**
```json
{
  "status": "SUCCESS",
  "message": {
    "currencies": {
      "USD": {
        "code": "USD",
        "rate": 1,
        "symbol": "$",
        "name": "US Dollar"
      },
      "CNY": {
        "code": "CNY",
        "rate": 7.11,
        "symbol": "¥",
        "name": "Chinese Yuan"
      }
    },
    "baseCurrency": "USD",
    "lastUpdate": "2025-09-17T02:11:03.100Z"
  }
}
```

### POST /api/currency/convert
Convert currency amounts between different currencies.

**Request:**
```json
{
  "amount": 100,
  "fromCurrency": "USD",
  "toCurrency": "CNY"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": {
    "originalAmount": 100,
    "fromCurrency": "USD",
    "toCurrency": "CNY",
    "convertedAmount": 711,
    "exchangeRate": 7.11,
    "timestamp": "2025-09-17T02:11:26.299Z"
  }
}
```

### GET /api/currency/detect
Detect user's currency based on IP location.

**Response:**
```json
{
  "status": "SUCCESS",
  "message": {
    "ip": "127.0.0.1",
    "country": "US",
    "currency": "USD",
    "detected": false,
    "supportedCurrencies": ["USD", "CNY", "EUR", "GBP", "JPY", "CAD", "AUD"]
  }
}
```

### POST /api/currency/format
Format currency amounts with proper symbols and locale.

**Request:**
```json
{
  "amount": 123.45,
  "currency": "USD",
  "locale": "en-US"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": {
    "amount": 123.45,
    "currency": "USD",
    "locale": "en-US",
    "formatted": "$123.45",
    "symbol": "$",
    "name": "US Dollar"
  }
}
```

### POST /api/currency/product-pricing
Get conversion info for product pricing display.

**Request:**
```json
{
  "basePrice": 50,
  "targetCurrency": "CNY",
  "locale": "zh-CN"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": {
    "originalAmount": 50,
    "originalCurrency": "USD",
    "convertedAmount": 355.5,
    "targetCurrency": "CNY",
    "exchangeRate": 7.11,
    "formattedOriginal": "$50.00",
    "formattedConverted": "¥355.50",
    "lastUpdate": "2025-09-17T02:11:03.100Z"
  }
}
```

### POST /api/currency/update-rates
Manually update exchange rates (admin only).

**Response:**
```json
{
  "status": "SUCCESS",
  "message": {
    "message": "Exchange rates updated successfully",
    "lastUpdate": "2025-09-17T02:11:03.100Z",
    "currencies": { ... }
  }
}
```

## Frontend Integration

### Currency Context
The frontend uses a React Context (`CurrencyContext`) to manage currency state across the application.

**Features:**
- Automatic currency detection on app load
- Persistent currency preference in localStorage
- Real-time exchange rate updates
- Currency conversion utilities
- Localized formatting functions

### Currency Components

#### CurrencySelector
- Full currency selector with dropdown
- Compact version for headers/navigation
- Shows currency symbols, codes, and names
- Displays current exchange rates

#### PriceDisplay
- Automatic currency conversion for prices
- Support for discounted prices
- Price range display
- Conversion info display
- Multiple size options

### Usage Examples

```jsx
// Basic price display
<PriceDisplay price={99.99} />

// Discounted price with percentage
<DiscountedPriceDisplay 
  originalPrice={129.99}
  discountedPrice={99.99}
  showPercentage={true}
/>

// Currency selector
<CurrencySelector />

// Compact currency selector for header
<CompactCurrencySelector />
```

## Configuration

### Supported Currencies
Currently supported currencies can be modified in the `CurrencyService` constructor:

```javascript
this.supportedCurrencies = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
```

### Exchange Rate API
The service uses exchangerate-api.com for real-time rates. The API endpoint can be configured:

```javascript
const response = await axios.get(
  `https://api.exchangerate-api.com/v4/latest/${this.baseCurrency}`,
  { timeout: 10000 }
);
```

### Update Frequency
Exchange rates are updated every hour by default:

```javascript
this.updateInterval = 60 * 60 * 1000; // 1 hour
```

### Default Exchange Rates
Fallback rates are used when the API is unavailable:

```javascript
this.defaultRates = {
  'USD': 1,
  'CNY': 7.2,
  'EUR': 0.85,
  'GBP': 0.73,
  'JPY': 110,
  'CAD': 1.25,
  'AUD': 1.35
};
```

## Error Handling

### Service Level
- Graceful fallback to default rates when API fails
- Automatic retry mechanism for failed requests
- Comprehensive error logging
- Validation of currency codes and amounts

### API Level
- Input validation for all endpoints
- Proper HTTP status codes
- Structured error responses
- Request timeout handling

### Frontend Level
- Loading states during currency operations
- Error boundaries for currency components
- Fallback formatting when Intl API fails
- Graceful degradation for unsupported browsers

## Testing

### Backend Testing
Run the currency service tests:

```bash
node backend/scripts/test-currency-service.js
```

### API Testing
Test individual endpoints:

```bash
# Get exchange rates
curl -X GET http://localhost:6666/api/currency/rates

# Convert currency
curl -X POST http://localhost:6666/api/currency/convert \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "fromCurrency": "USD", "toCurrency": "CNY"}'

# Detect currency
curl -X GET http://localhost:6666/api/currency/detect
```

## Performance Considerations

### Caching
- Exchange rates cached in memory
- Periodic updates to minimize API calls
- Fallback rates for offline scenarios

### Frontend Optimization
- Currency preferences stored in localStorage
- Debounced API calls for real-time conversion
- Lazy loading of currency data

### API Rate Limits
- Respects external API rate limits
- Implements exponential backoff for retries
- Uses free tier of exchangerate-api.com

## Security

### Input Validation
- All currency codes validated against supported list
- Amount validation for numeric values and ranges
- Sanitization of user inputs

### API Security
- No sensitive data exposed in responses
- Proper error handling without information leakage
- Rate limiting on currency endpoints

## Internationalization

### Locale Support
- Automatic locale detection based on currency
- Support for multiple locale formats
- Fallback to English for unsupported locales

### Translation Integration
- Currency names translated in multiple languages
- Integration with next-intl for consistent translations
- Support for RTL languages (future enhancement)

## Future Enhancements

### Planned Features
1. **Cryptocurrency Support**: Add Bitcoin, Ethereum, etc.
2. **Historical Rates**: Store and display historical exchange rates
3. **Rate Alerts**: Notify users of significant rate changes
4. **Custom Rate Sources**: Support multiple exchange rate providers
5. **Offline Mode**: Enhanced offline currency support
6. **Analytics**: Track currency usage and conversion patterns

### Performance Improvements
1. **Redis Caching**: Implement Redis for distributed caching
2. **CDN Integration**: Cache static currency data on CDN
3. **WebSocket Updates**: Real-time rate updates via WebSocket
4. **Service Worker**: Offline currency conversion support

## Troubleshooting

### Common Issues

1. **Exchange Rate API Failures**
   - Check internet connectivity
   - Verify API endpoint availability
   - Review API rate limits

2. **Currency Conversion Errors**
   - Validate currency codes
   - Check amount format and range
   - Verify exchange rates are loaded

3. **Frontend Display Issues**
   - Check browser Intl API support
   - Verify locale format
   - Review currency context provider setup

### Debug Mode
Enable debug logging by setting environment variable:

```bash
export CURRENCY_DEBUG=true
```

This will provide detailed logging of all currency operations and API calls.