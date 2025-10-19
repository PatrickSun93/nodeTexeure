const { test, expect } = require('@playwright/test')

test.describe('Product Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin user
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'admin@example.com')
    await page.fill('[data-testid="password-input"]', 'admin123')
    await page.click('[data-testid="login-button"]')
    
    // Wait for redirect to admin dashboard
    await page.waitForURL('**/admin/dashboard')
  })

  test('upload and approve new product', async ({ page }) => {
    // Navigate to product upload
    await page.click('[data-testid="products-menu"]')
    await page.click('[data-testid="upload-product-link"]')
    
    // Fill product details
    await page.fill('[data-testid="product-name"]', 'Test Bed Sheet Set')
    await page.fill('[data-testid="product-description"]', 'High quality cotton bed sheet set')
    await page.fill('[data-testid="product-price"]', '99.99')
    await page.fill('[data-testid="product-sku"]', 'BSS001')
    await page.selectOption('[data-testid="product-category"]', 'sheets')
    await page.fill('[data-testid="stock-quantity"]', '50')
    
    // Upload product images
    const fileInput = page.locator('[data-testid="image-upload-input"]')
    await fileInput.setInputFiles([
      'test-fixtures/product-image-1.jpg',
      'test-fixtures/product-image-2.jpg'
    ])
    
    // Wait for image upload
    await page.waitForSelector('[data-testid="uploaded-image"]')
    await expect(page.locator('[data-testid="uploaded-image"]')).toHaveCount(2)
    
    // Add product variants
    await page.click('[data-testid="add-variant-button"]')
    await page.selectOption('[data-testid="variant-type"]', 'size')
    await page.fill('[data-testid="variant-value"]', 'Queen')
    await page.fill('[data-testid="variant-stock"]', '25')
    await page.click('[data-testid="save-variant-button"]')
    
    await page.click('[data-testid="add-variant-button"]')
    await page.selectOption('[data-testid="variant-type"]', 'size')
    await page.fill('[data-testid="variant-value"]', 'King')
    await page.fill('[data-testid="variant-stock"]', '25')
    await page.click('[data-testid="save-variant-button"]')
    
    // Submit product
    await page.click('[data-testid="submit-product-button"]')
    
    // Verify success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible()
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Product uploaded successfully')
    
    // Navigate to pending approvals
    await page.click('[data-testid="pending-approvals-link"]')
    
    // Verify product appears in pending list
    await expect(page.locator('[data-testid="pending-product"]')).toHaveCount.greaterThan(0)
    
    const pendingProduct = page.locator('[data-testid="pending-product"]').first()
    await expect(pendingProduct.locator('[data-testid="product-name"]')).toContainText('Test Bed Sheet Set')
    
    // Approve the product
    await pendingProduct.locator('[data-testid="approve-button"]').click()
    await page.fill('[data-testid="approval-notes"]', 'Product looks good, approved for sale')
    await page.click('[data-testid="confirm-approval-button"]')
    
    // Verify approval success
    await expect(page.locator('[data-testid="approval-success"]')).toBeVisible()
    
    // Verify product is no longer in pending list
    await page.reload()
    const remainingPending = page.locator('[data-testid="pending-product"]')
    await expect(remainingPending.filter({ hasText: 'Test Bed Sheet Set' })).toHaveCount(0)
    
    // Verify product appears on frontend
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const productCards = page.locator('[data-testid="product-card"]')
    await expect(productCards.filter({ hasText: 'Test Bed Sheet Set' })).toHaveCount(1)
  })

  test('reject product with feedback', async ({ page }) => {
    // First upload a product (simplified)
    await page.click('[data-testid="products-menu"]')
    await page.click('[data-testid="upload-product-link"]')
    
    await page.fill('[data-testid="product-name"]', 'Test Rejected Product')
    await page.fill('[data-testid="product-description"]', 'This product will be rejected')
    await page.fill('[data-testid="product-price"]', '49.99')
    await page.fill('[data-testid="product-sku"]', 'REJ001')
    await page.selectOption('[data-testid="product-category"]', 'pillows')
    await page.fill('[data-testid="stock-quantity"]', '10')
    
    await page.click('[data-testid="submit-product-button"]')
    await page.waitForSelector('[data-testid="success-message"]')
    
    // Navigate to pending approvals
    await page.click('[data-testid="pending-approvals-link"]')
    
    const pendingProduct = page.locator('[data-testid="pending-product"]').filter({ hasText: 'Test Rejected Product' })
    
    // Reject the product
    await pendingProduct.locator('[data-testid="reject-button"]').click()
    await page.fill('[data-testid="rejection-reason"]', 'Product description needs more details and better images required')
    await page.click('[data-testid="confirm-rejection-button"]')
    
    // Verify rejection success
    await expect(page.locator('[data-testid="rejection-success"]')).toBeVisible()
    
    // Verify product is marked as rejected
    await page.reload()
    const rejectedProduct = page.locator('[data-testid="rejected-product"]').filter({ hasText: 'Test Rejected Product' })
    await expect(rejectedProduct).toBeVisible()
    await expect(rejectedProduct.locator('[data-testid="rejection-reason"]')).toContainText('Product description needs more details')
    
    // Verify product does not appear on frontend
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const productCards = page.locator('[data-testid="product-card"]')
    await expect(productCards.filter({ hasText: 'Test Rejected Product' })).toHaveCount(0)
  })

  test('bulk product operations', async ({ page }) => {
    // Navigate to product management
    await page.click('[data-testid="products-menu"]')
    await page.click('[data-testid="manage-products-link"]')
    
    // Select multiple products
    await page.check('[data-testid="product-checkbox"]:nth-child(1)')
    await page.check('[data-testid="product-checkbox"]:nth-child(2)')
    await page.check('[data-testid="product-checkbox"]:nth-child(3)')
    
    // Verify bulk actions are enabled
    await expect(page.locator('[data-testid="bulk-actions-dropdown"]')).toBeEnabled()
    
    // Test bulk price update
    await page.selectOption('[data-testid="bulk-actions-dropdown"]', 'update-price')
    await page.fill('[data-testid="bulk-price-input"]', '10')
    await page.selectOption('[data-testid="price-action-type"]', 'increase-percent')
    await page.click('[data-testid="apply-bulk-action-button"]')
    
    // Confirm bulk action
    await page.click('[data-testid="confirm-bulk-action-button"]')
    
    // Verify success message
    await expect(page.locator('[data-testid="bulk-success-message"]')).toBeVisible()
    await expect(page.locator('[data-testid="bulk-success-message"]')).toContainText('3 products updated successfully')
    
    // Test bulk category change
    await page.check('[data-testid="select-all-checkbox"]')
    await page.selectOption('[data-testid="bulk-actions-dropdown"]', 'update-category')
    await page.selectOption('[data-testid="bulk-category-select"]', 'comforters')
    await page.click('[data-testid="apply-bulk-action-button"]')
    await page.click('[data-testid="confirm-bulk-action-button"]')
    
    await expect(page.locator('[data-testid="bulk-success-message"]')).toContainText('products updated successfully')
    
    // Test bulk stock update
    await page.check('[data-testid="product-checkbox"]:nth-child(1)')
    await page.selectOption('[data-testid="bulk-actions-dropdown"]', 'update-stock')
    await page.fill('[data-testid="bulk-stock-input"]', '5')
    await page.selectOption('[data-testid="stock-action-type"]', 'increase')
    await page.click('[data-testid="apply-bulk-action-button"]')
    await page.click('[data-testid="confirm-bulk-action-button"]')
    
    await expect(page.locator('[data-testid="bulk-success-message"]')).toContainText('1 product updated successfully')
  })

  test('manage product variants and inventory', async ({ page }) => {
    // Navigate to a specific product
    await page.click('[data-testid="products-menu"]')
    await page.click('[data-testid="manage-products-link"]')
    
    // Click on first product to edit
    await page.click('[data-testid="product-row"]:first-child [data-testid="edit-button"]')
    
    // Navigate to variants tab
    await page.click('[data-testid="variants-tab"]')
    
    // Add new variant
    await page.click('[data-testid="add-variant-button"]')
    await page.selectOption('[data-testid="variant-type"]', 'color')
    await page.fill('[data-testid="variant-value"]', 'Navy Blue')
    await page.fill('[data-testid="variant-sku"]', 'NB001')
    await page.fill('[data-testid="variant-stock"]', '15')
    await page.fill('[data-testid="variant-price-adjustment"]', '5.00')
    await page.click('[data-testid="save-variant-button"]')
    
    // Verify variant was added
    await expect(page.locator('[data-testid="variant-row"]').filter({ hasText: 'Navy Blue' })).toBeVisible()
    
    // Edit existing variant
    const existingVariant = page.locator('[data-testid="variant-row"]').first()
    await existingVariant.locator('[data-testid="edit-variant-button"]').click()
    
    await page.fill('[data-testid="variant-stock"]', '20')
    await page.click('[data-testid="save-variant-button"]')
    
    // Verify stock was updated
    await expect(existingVariant.locator('[data-testid="variant-stock"]')).toContainText('20')
    
    // Test low stock alert
    await existingVariant.locator('[data-testid="edit-variant-button"]').click()
    await page.fill('[data-testid="variant-stock"]', '2')
    await page.fill('[data-testid="reorder-point"]', '5')
    await page.click('[data-testid="save-variant-button"]')
    
    // Verify low stock warning appears
    await expect(existingVariant.locator('[data-testid="low-stock-warning"]')).toBeVisible()
    
    // Navigate to inventory movements
    await page.click('[data-testid="inventory-tab"]')
    
    // Verify inventory movements are logged
    await expect(page.locator('[data-testid="inventory-movement"]')).toHaveCount.greaterThan(0)
    
    const latestMovement = page.locator('[data-testid="inventory-movement"]').first()
    await expect(latestMovement.locator('[data-testid="movement-type"]')).toContainText('MANUAL_ADJUSTMENT')
    await expect(latestMovement.locator('[data-testid="quantity-change"]')).toContainText('-18')
  })

  test('image management and optimization', async ({ page }) => {
    // Navigate to product with images
    await page.click('[data-testid="products-menu"]')
    await page.click('[data-testid="manage-products-link"]')
    await page.click('[data-testid="product-row"]:first-child [data-testid="edit-button"]')
    
    // Navigate to images tab
    await page.click('[data-testid="images-tab"]')
    
    // Upload new images
    const fileInput = page.locator('[data-testid="image-upload-input"]')
    await fileInput.setInputFiles([
      'test-fixtures/high-res-image.jpg',
      'test-fixtures/product-detail.jpg'
    ])
    
    // Wait for upload and processing
    await page.waitForSelector('[data-testid="image-processing-complete"]')
    
    // Verify thumbnails were generated
    const imageRow = page.locator('[data-testid="image-row"]').first()
    await expect(imageRow.locator('[data-testid="thumbnail-small"]')).toBeVisible()
    await expect(imageRow.locator('[data-testid="thumbnail-medium"]')).toBeVisible()
    await expect(imageRow.locator('[data-testid="thumbnail-large"]')).toBeVisible()
    
    // Test image reordering
    const firstImage = page.locator('[data-testid="image-row"]').first()
    const secondImage = page.locator('[data-testid="image-row"]').nth(1)
    
    await firstImage.locator('[data-testid="move-down-button"]').click()
    
    // Verify order changed
    await expect(page.locator('[data-testid="image-row"]').first()).not.toBe(firstImage)
    
    // Test setting primary image
    await secondImage.locator('[data-testid="set-primary-button"]').click()
    await expect(secondImage.locator('[data-testid="primary-badge"]')).toBeVisible()
    
    // Test image deletion
    const lastImage = page.locator('[data-testid="image-row"]').last()
    await lastImage.locator('[data-testid="delete-image-button"]').click()
    await page.click('[data-testid="confirm-delete-button"]')
    
    // Verify image was removed
    const imageCount = await page.locator('[data-testid="image-row"]').count()
    expect(imageCount).toBeGreaterThan(0)
    
    // Test bulk image operations
    await page.check('[data-testid="image-checkbox"]:nth-child(1)')
    await page.check('[data-testid="image-checkbox"]:nth-child(2)')
    
    await page.selectOption('[data-testid="bulk-image-actions"]', 'optimize')
    await page.click('[data-testid="apply-bulk-image-action"]')
    
    // Wait for optimization
    await page.waitForSelector('[data-testid="optimization-complete"]')
    
    // Verify file sizes were reduced
    const optimizedImages = page.locator('[data-testid="image-row"][data-optimized="true"]')
    await expect(optimizedImages).toHaveCount(2)
  })
})