const { test, expect } = require('@playwright/test');

test.describe('Complete E-commerce User Flow', () => {
  test('Complete purchase flow from registration to order completion', async ({ page }) => {
    // 1. User Registration
    await page.goto('/register');
    await page.fill('[name="firstName"]', 'Test');
    await page.fill('[name="lastName"]', 'User');
    await page.fill('[name="email"]', `test${Date.now()}@example.com`);
    await page.fill('[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    
    // Verify registration success
    await expect(page).toHaveURL('/verify-email');
    
    // 2. Product Browsing and Search
    await page.goto('/shop');
    await page.fill('[data-testid="search-input"]', 'bed texture');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // Verify search results
    await expect(page.locator('[data-testid="product-card"]')).toHaveCount({ min: 1 });
    
    // 3. Product Detail and Add to Cart
    await page.click('[data-testid="product-card"]').first();
    await page.click('[data-testid="add-to-cart"]');
    
    // Verify cart update
    await expect(page.locator('[data-testid="cart-count"]')).toContainText('1');
    
    // 4. Apply Coupon
    await page.goto('/cart');
    await page.fill('[data-testid="coupon-input"]', 'TEST10');
    await page.click('[data-testid="apply-coupon"]');
    
    // Verify discount applied
    await expect(page.locator('[data-testid="discount-amount"]')).toBeVisible();
    
    // 5. Checkout Process
    await page.click('[data-testid="checkout-button"]');
    
    // Fill shipping information
    await page.fill('[name="address"]', '123 Test Street');
    await page.fill('[name="city"]', 'Test City');
    await page.fill('[name="state"]', 'CA');
    await page.fill('[name="zipCode"]', '12345');
    await page.selectOption('[name="country"]', 'US');
    
    // Verify shipping calculation
    await expect(page.locator('[data-testid="shipping-cost"]')).toBeVisible();
    await expect(page.locator('[data-testid="tax-amount"]')).toBeVisible();
    
    // 6. Payment Processing
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="card-expiry"]', '12/25');
    await page.fill('[data-testid="card-cvc"]', '123');
    
    await page.click('[data-testid="place-order"]');
    
    // Verify order success
    await expect(page).toHaveURL(/\/checkout\/success/);
    await expect(page.locator('[data-testid="order-number"]')).toBeVisible();
    
    // 7. Order Tracking
    const orderNumber = await page.locator('[data-testid="order-number"]').textContent();
    await page.goto('/orders');
    await expect(page.locator(`[data-testid="order-${orderNumber}"]`)).toBeVisible();
  });

  test('Admin workflow - Product approval and order management', async ({ page }) => {
    // Login as admin
    await page.goto('/admin/login');
    await page.fill('[name="email"]', 'admin@example.com');
    await page.fill('[name="password"]', 'AdminPassword123!');
    await page.click('button[type="submit"]');
    
    // 1. Product Approval Workflow
    await page.goto('/admin/products/pending');
    await page.click('[data-testid="approve-product"]').first();
    await page.fill('[data-testid="approval-notes"]', 'Product approved - meets quality standards');
    await page.click('[data-testid="confirm-approval"]');
    
    // Verify approval
    await expect(page.locator('[data-testid="success-message"]')).toContainText('approved');
    
    // 2. Order Management
    await page.goto('/admin/orders');
    await page.click('[data-testid="order-row"]').first();
    
    // Update order status
    await page.selectOption('[data-testid="status-select"]', 'processing');
    await page.fill('[data-testid="status-notes"]', 'Order is being prepared for shipment');
    await page.click('[data-testid="update-status"]');
    
    // Verify status update
    await expect(page.locator('[data-testid="current-status"]')).toContainText('processing');
    
    // 3. Inventory Management
    await page.goto('/admin/inventory');
    await page.click('[data-testid="low-stock-alert"]').first();
    await page.fill('[data-testid="restock-quantity"]', '50');
    await page.click('[data-testid="update-inventory"]');
    
    // Verify inventory update
    await expect(page.locator('[data-testid="success-message"]')).toContainText('updated');
  });

  test('Multi-language and currency support', async ({ page }) => {
    // Test language switching
    await page.goto('/');
    await page.click('[data-testid="language-selector"]');
    await page.click('[data-testid="language-zh"]');
    
    // Verify Chinese content
    await expect(page.locator('h1')).toContainText('床品纹理');
    
    // Test currency switching
    await page.click('[data-testid="currency-selector"]');
    await page.click('[data-testid="currency-cny"]');
    
    // Verify currency display
    await expect(page.locator('[data-testid="price"]').first()).toContainText('¥');
    
    // Test search in Chinese
    await page.fill('[data-testid="search-input"]', '床单');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // Verify Chinese search results
    await expect(page.locator('[data-testid="product-card"]')).toHaveCount({ min: 1 });
  });

  test('Email notification system', async ({ page }) => {
    // This test would typically require email testing infrastructure
    // For now, we'll test the API endpoints that trigger emails
    
    const response = await page.request.post('/api/test/email-notifications', {
      data: {
        type: 'order_confirmation',
        orderId: 'TEST_ORDER_001',
        email: 'test@example.com'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.emailQueued).toBe(true);
  });

  test('Performance and error handling', async ({ page }) => {
    // Test error handling
    await page.goto('/products/non-existent-product');
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Product not found');
    
    // Test rate limiting (would need to make multiple requests)
    const responses = await Promise.all([
      page.request.get('/api/products'),
      page.request.get('/api/products'),
      page.request.get('/api/products')
    ]);
    
    responses.forEach(response => {
      expect(response.ok()).toBeTruthy();
    });
    
    // Test offline functionality
    await page.context().setOffline(true);
    await page.goto('/offline');
    await expect(page.locator('[data-testid="offline-message"]')).toBeVisible();
    
    await page.context().setOffline(false);
  });
});