const { test, expect } = require('@playwright/test')

test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/')
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle')
  })

  test('complete checkout flow with Stripe payment', async ({ page }) => {
    // Add product to cart
    await page.click('[data-testid="product-card"]:first-child')
    await page.waitForLoadState('networkidle')
    
    await page.click('[data-testid="add-to-cart-button"]')
    await expect(page.locator('[data-testid="cart-notification"]')).toBeVisible()

    // Go to cart
    await page.click('[data-testid="cart-icon"]')
    await page.waitForLoadState('networkidle')
    
    // Verify cart contents
    await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(1)
    
    // Proceed to checkout
    await page.click('[data-testid="checkout-button"]')
    await page.waitForLoadState('networkidle')

    // Fill shipping information
    await page.fill('[data-testid="shipping-name"]', 'Test User')
    await page.fill('[data-testid="shipping-email"]', 'test@example.com')
    await page.fill('[data-testid="shipping-address"]', '123 Test Street')
    await page.fill('[data-testid="shipping-city"]', 'Test City')
    await page.fill('[data-testid="shipping-state"]', 'CA')
    await page.fill('[data-testid="shipping-zip"]', '90210')
    await page.selectOption('[data-testid="shipping-country"]', 'US')

    // Calculate shipping
    await page.click('[data-testid="calculate-shipping-button"]')
    await page.waitForSelector('[data-testid="shipping-options"]')
    
    // Select shipping option
    await page.click('[data-testid="shipping-option"]:first-child')

    // Apply coupon (if available)
    await page.fill('[data-testid="coupon-input"]', 'TEST10')
    await page.click('[data-testid="apply-coupon-button"]')
    
    // Wait for coupon validation
    await page.waitForTimeout(1000)

    // Proceed to payment
    await page.click('[data-testid="proceed-to-payment-button"]')
    await page.waitForLoadState('networkidle')

    // Fill Stripe payment form
    const stripeFrame = page.frameLocator('[data-testid="stripe-card-element"] iframe')
    await stripeFrame.locator('[name="cardnumber"]').fill('4242424242424242')
    await stripeFrame.locator('[name="exp-date"]').fill('12/25')
    await stripeFrame.locator('[name="cvc"]').fill('123')
    await stripeFrame.locator('[name="postal"]').fill('90210')

    // Submit payment
    await page.click('[data-testid="submit-payment-button"]')
    
    // Wait for payment processing
    await page.waitForSelector('[data-testid="payment-success"]', { timeout: 30000 })
    
    // Verify success page
    await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible()
    await expect(page.locator('[data-testid="order-number"]')).toBeVisible()
    
    // Verify order details
    const orderNumber = await page.locator('[data-testid="order-number"]').textContent()
    expect(orderNumber).toMatch(/ORDER\d+/)
  })

  test('handle payment failure gracefully', async ({ page }) => {
    // Add product to cart and proceed to checkout
    await page.click('[data-testid="product-card"]:first-child')
    await page.click('[data-testid="add-to-cart-button"]')
    await page.click('[data-testid="cart-icon"]')
    await page.click('[data-testid="checkout-button"]')

    // Fill shipping information
    await page.fill('[data-testid="shipping-name"]', 'Test User')
    await page.fill('[data-testid="shipping-email"]', 'test@example.com')
    await page.fill('[data-testid="shipping-address"]', '123 Test Street')
    await page.fill('[data-testid="shipping-city"]', 'Test City')
    await page.fill('[data-testid="shipping-state"]', 'CA')
    await page.fill('[data-testid="shipping-zip"]', '90210')

    await page.click('[data-testid="calculate-shipping-button"]')
    await page.waitForSelector('[data-testid="shipping-options"]')
    await page.click('[data-testid="shipping-option"]:first-child')
    await page.click('[data-testid="proceed-to-payment-button"]')

    // Use declined card number
    const stripeFrame = page.frameLocator('[data-testid="stripe-card-element"] iframe')
    await stripeFrame.locator('[name="cardnumber"]').fill('4000000000000002')
    await stripeFrame.locator('[name="exp-date"]').fill('12/25')
    await stripeFrame.locator('[name="cvc"]').fill('123')
    await stripeFrame.locator('[name="postal"]').fill('90210')

    // Submit payment
    await page.click('[data-testid="submit-payment-button"]')
    
    // Verify error handling
    await expect(page.locator('[data-testid="payment-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="payment-error"]')).toContainText('Your card was declined')
    
    // Verify user can retry
    await expect(page.locator('[data-testid="submit-payment-button"]')).toBeEnabled()
  })

  test('validate required fields in checkout', async ({ page }) => {
    // Add product to cart and proceed to checkout
    await page.click('[data-testid="product-card"]:first-child')
    await page.click('[data-testid="add-to-cart-button"]')
    await page.click('[data-testid="cart-icon"]')
    await page.click('[data-testid="checkout-button"]')

    // Try to proceed without filling required fields
    await page.click('[data-testid="calculate-shipping-button"]')
    
    // Verify validation errors
    await expect(page.locator('[data-testid="name-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="address-error"]')).toBeVisible()
    
    // Fill invalid email
    await page.fill('[data-testid="shipping-email"]', 'invalid-email')
    await page.click('[data-testid="calculate-shipping-button"]')
    
    await expect(page.locator('[data-testid="email-error"]')).toContainText('Please enter a valid email')
  })

  test('apply and remove coupon codes', async ({ page }) => {
    // Add product to cart and proceed to checkout
    await page.click('[data-testid="product-card"]:first-child')
    await page.click('[data-testid="add-to-cart-button"]')
    await page.click('[data-testid="cart-icon"]')
    await page.click('[data-testid="checkout-button"]')

    // Fill required shipping info
    await page.fill('[data-testid="shipping-name"]', 'Test User')
    await page.fill('[data-testid="shipping-email"]', 'test@example.com')
    await page.fill('[data-testid="shipping-address"]', '123 Test Street')
    await page.fill('[data-testid="shipping-city"]', 'Test City')
    await page.fill('[data-testid="shipping-state"]', 'CA')
    await page.fill('[data-testid="shipping-zip"]', '90210')

    // Get original total
    const originalTotal = await page.locator('[data-testid="order-total"]').textContent()
    
    // Apply valid coupon
    await page.fill('[data-testid="coupon-input"]', 'TEST10')
    await page.click('[data-testid="apply-coupon-button"]')
    
    await expect(page.locator('[data-testid="coupon-success"]')).toBeVisible()
    await expect(page.locator('[data-testid="discount-amount"]')).toBeVisible()
    
    // Verify total is reduced
    const discountedTotal = await page.locator('[data-testid="order-total"]').textContent()
    expect(discountedTotal).not.toBe(originalTotal)
    
    // Remove coupon
    await page.click('[data-testid="remove-coupon-button"]')
    
    await expect(page.locator('[data-testid="discount-amount"]')).not.toBeVisible()
    
    // Verify total is restored
    const restoredTotal = await page.locator('[data-testid="order-total"]').textContent()
    expect(restoredTotal).toBe(originalTotal)
    
    // Try invalid coupon
    await page.fill('[data-testid="coupon-input"]', 'INVALID')
    await page.click('[data-testid="apply-coupon-button"]')
    
    await expect(page.locator('[data-testid="coupon-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="coupon-error"]')).toContainText('Invalid coupon code')
  })

  test('calculate shipping costs correctly', async ({ page }) => {
    // Add multiple products to cart
    await page.click('[data-testid="product-card"]:first-child')
    await page.click('[data-testid="add-to-cart-button"]')
    await page.goto('/')
    await page.click('[data-testid="product-card"]:nth-child(2)')
    await page.click('[data-testid="add-to-cart-button"]')
    
    await page.click('[data-testid="cart-icon"]')
    await page.click('[data-testid="checkout-button"]')

    // Fill shipping information for different zones
    await page.fill('[data-testid="shipping-name"]', 'Test User')
    await page.fill('[data-testid="shipping-email"]', 'test@example.com')
    await page.fill('[data-testid="shipping-address"]', '123 Test Street')
    await page.fill('[data-testid="shipping-city"]', 'New York')
    await page.fill('[data-testid="shipping-state"]', 'NY')
    await page.fill('[data-testid="shipping-zip"]', '10001')

    await page.click('[data-testid="calculate-shipping-button"]')
    await page.waitForSelector('[data-testid="shipping-options"]')
    
    // Verify shipping options are displayed
    const shippingOptions = page.locator('[data-testid="shipping-option"]')
    await expect(shippingOptions).toHaveCount.greaterThan(0)
    
    // Verify shipping costs are reasonable
    const firstOption = shippingOptions.first()
    const shippingCost = await firstOption.locator('[data-testid="shipping-cost"]').textContent()
    expect(shippingCost).toMatch(/\$\d+\.\d{2}/)
    
    // Test different shipping address (different zone)
    await page.fill('[data-testid="shipping-city"]', 'Los Angeles')
    await page.fill('[data-testid="shipping-state"]', 'CA')
    await page.fill('[data-testid="shipping-zip"]', '90210')
    
    await page.click('[data-testid="calculate-shipping-button"]')
    await page.waitForSelector('[data-testid="shipping-options"]')
    
    // Verify shipping costs may be different for different zones
    const newShippingCost = await firstOption.locator('[data-testid="shipping-cost"]').textContent()
    expect(newShippingCost).toMatch(/\$\d+\.\d{2}/)
  })
})