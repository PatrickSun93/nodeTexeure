# Comprehensive Testing Documentation

This document outlines the comprehensive testing strategy implemented for the ecommerce platform, covering unit tests, integration tests, end-to-end tests, and performance tests.

## Overview

The testing suite is designed to ensure the reliability, performance, and security of the ecommerce platform. It covers:

- **Unit Tests**: Individual component and service testing
- **Integration Tests**: External API and service integration testing
- **End-to-End Tests**: Complete user flow testing
- **Performance Tests**: High-load and stress testing

## Test Structure

```
├── src/__tests__/                 # Frontend unit tests
│   └── components/               # React component tests
├── backend/__tests__/            # Backend tests
│   ├── services/                # Service unit tests
│   ├── integration/             # Integration tests
│   ├── performance/             # Performance tests
│   └── setup/                   # Test setup utilities
├── e2e/                         # End-to-end tests
├── test-fixtures/               # Test data and fixtures
└── scripts/                     # Test runner scripts
```

## Running Tests

### Quick Start

```bash
# Run all tests
npm run test:all

# Run specific test types
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e          # End-to-end tests only
npm run test:performance  # Performance tests only
```

### Individual Test Commands

```bash
# Frontend unit tests
npm test

# Backend unit tests
cd backend && npm test

# E2E tests with UI
npm run test:e2e:ui

# Create test fixtures
npm run test:fixtures
```

## Test Categories

### 1. Unit Tests

#### Frontend Components (`src/__tests__/components/`)

- **PaymentForm.test.js**: Stripe payment form testing
  - Payment processing validation
  - Error handling
  - Form validation
  - Loading states

- **CouponInput.test.js**: Coupon code functionality
  - Coupon validation
  - Discount application
  - Error handling
  - User interaction

#### Backend Services (`backend/__tests__/services/`)

- **stripeService.test.js**: Payment processing logic
  - Payment intent creation
  - Payment confirmation
  - Refund processing
  - Webhook handling

- **inventoryService.test.js**: Inventory management
  - Stock checking
  - Stock reservation
  - Inventory updates
  - Low stock alerts

- **emailService.test.js**: Email notification system
  - Order confirmation emails
  - Status update emails
  - Abandoned cart emails
  - Email queue processing

### 2. Integration Tests (`backend/__tests__/integration/`)

#### External API Integrations

- **stripe.integration.test.js**: Stripe payment gateway
  - Payment intent creation
  - Webhook processing
  - Refund handling
  - Error scenarios

- **fedex.integration.test.js**: FedEx shipping API
  - Rate calculation
  - Shipment creation
  - Tracking information
  - Address validation

- **email.integration.test.js**: AWS SES email service
  - Email sending
  - Template rendering
  - Queue processing
  - Rate limiting

### 3. End-to-End Tests (`e2e/`)

#### Critical User Flows

- **checkout-flow.spec.js**: Complete purchase process
  - Product selection
  - Cart management
  - Shipping calculation
  - Payment processing
  - Order confirmation

- **product-management.spec.js**: Admin product operations
  - Product upload
  - Approval workflow
  - Bulk operations
  - Image management

- **user-authentication.spec.js**: User account management
  - Registration flow
  - Login/logout
  - Password reset
  - Email verification

### 4. Performance Tests (`backend/__tests__/performance/`)

#### Load Testing

- **load.test.js**: Concurrent request handling
  - API endpoint performance
  - Database query optimization
  - Memory usage monitoring
  - Cache effectiveness

- **stress.test.js**: High-volume scenarios
  - Order processing under load
  - Inventory depletion handling
  - Database connection pooling
  - File system operations

## Test Configuration

### Jest Configuration

#### Frontend (`jest.config.js`)
```javascript
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
}

module.exports = createJestConfig(customJestConfig)
```

#### Backend (`backend/jest.config.js`)
```javascript
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'services/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
}
```

### Playwright Configuration (`playwright.config.js`)

```javascript
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    {
      command: 'npm run dev:frontend',
      url: 'http://localhost:3000',
    },
    {
      command: 'npm run dev:backend',
      url: 'http://localhost:6666/api/health',
    }
  ],
})
```

## Test Data and Fixtures

### Test Fixtures (`test-fixtures/`)

The test suite uses predefined fixtures for consistent testing:

- **Test Products**: Sample bed sheets, pillows, comforters
- **Test Users**: Customer and admin accounts
- **Test Orders**: Various order states and scenarios
- **Test Coupons**: Valid, expired, and restricted coupons
- **Test Images**: Generated product images in various sizes

### Database Setup

Tests use a dedicated test database that is:
- Created before test runs
- Populated with test fixtures
- Cleaned up after tests complete

## Coverage Requirements

### Minimum Coverage Thresholds

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

### Coverage Reports

Coverage reports are generated in HTML format:
- Frontend: `coverage/lcov-report/index.html`
- Backend: `backend/coverage/lcov-report/index.html`

## Performance Benchmarks

### API Response Times
- Product listing: < 500ms
- Search queries: < 300ms
- Payment processing: < 2000ms
- Inventory updates: < 100ms

### Concurrent Load Handling
- 100 concurrent product requests
- 50 concurrent payment processing
- 20 concurrent inventory updates
- 200 concurrent database queries

### Memory Usage
- Memory increase under load: < 100MB
- No memory leaks during extended testing
- Proper garbage collection

## Continuous Integration

### GitHub Actions Workflow

```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          npm ci
          cd backend && npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Run performance tests
        run: npm run test:performance
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines

1. **Descriptive Test Names**: Use clear, descriptive test names
2. **Arrange-Act-Assert**: Follow the AAA pattern
3. **Mock External Dependencies**: Mock APIs, databases, and services
4. **Test Edge Cases**: Include error scenarios and boundary conditions
5. **Keep Tests Independent**: Each test should be able to run in isolation

### Performance Testing Guidelines

1. **Realistic Load**: Use realistic user loads and data volumes
2. **Monitor Resources**: Track memory, CPU, and database usage
3. **Test Degradation**: Verify graceful degradation under extreme load
4. **Recovery Testing**: Ensure system recovers after stress

### E2E Testing Guidelines

1. **User-Centric**: Focus on real user workflows
2. **Data Attributes**: Use data-testid attributes for reliable selectors
3. **Wait Strategies**: Use proper wait strategies for dynamic content
4. **Cross-Browser**: Test across different browsers and devices

## Troubleshooting

### Common Issues

1. **Test Database Connection**: Ensure MySQL is running and accessible
2. **Port Conflicts**: Check that ports 3000 and 6666 are available
3. **Missing Dependencies**: Run `npm install` in both root and backend
4. **Playwright Browsers**: Run `npx playwright install` for E2E tests

### Debug Commands

```bash
# Run tests in debug mode
npm test -- --verbose

# Run specific test file
npm test -- PaymentForm.test.js

# Run E2E tests in headed mode
npx playwright test --headed

# Generate test fixtures
npm run test:fixtures
```

## Maintenance

### Regular Tasks

1. **Update Test Data**: Keep test fixtures current with schema changes
2. **Review Coverage**: Monitor and improve test coverage
3. **Performance Baselines**: Update performance benchmarks as needed
4. **Dependency Updates**: Keep testing dependencies up to date

### Adding New Tests

1. Follow the established directory structure
2. Use appropriate test categories (unit/integration/e2e/performance)
3. Include proper setup and teardown
4. Update this documentation as needed

## Conclusion

This comprehensive testing suite ensures the reliability, performance, and user experience of the ecommerce platform. Regular execution of these tests helps maintain code quality and catch issues early in the development process.