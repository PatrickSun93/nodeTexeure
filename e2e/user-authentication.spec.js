const { test, expect } = require('@playwright/test')

test.describe('User Authentication', () => {
  test('user registration flow', async ({ page }) => {
    await page.goto('/register')
    
    // Fill registration form
    await page.fill('[data-testid="first-name-input"]', 'John')
    await page.fill('[data-testid="last-name-input"]', 'Doe')
    await page.fill('[data-testid="email-input"]', 'john.doe@example.com')
    await page.fill('[data-testid="password-input"]', 'SecurePass123!')
    await page.fill('[data-testid="confirm-password-input"]', 'SecurePass123!')
    
    // Accept terms and conditions
    await page.check('[data-testid="terms-checkbox"]')
    
    // Submit registration
    await page.click('[data-testid="register-button"]')
    
    // Verify success message
    await expect(page.locator('[data-testid="registration-success"]')).toBeVisible()
    await expect(page.locator('[data-testid="registration-success"]')).toContainText('Please check your email to verify your account')
    
    // Verify redirect to verification page
    await expect(page).toHaveURL('**/verify-email')
  })

  test('user login flow', async ({ page }) => {
    await page.goto('/login')
    
    // Fill login form
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    
    // Submit login
    await page.click('[data-testid="login-button"]')
    
    // Verify successful login
    await expect(page).toHaveURL('**/dashboard')
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
    await expect(page.locator('[data-testid="welcome-message"]')).toContainText('Welcome back')
  })

  test('password reset flow', async ({ page }) => {
    await page.goto('/forgot-password')
    
    // Fill email for password reset
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.click('[data-testid="reset-password-button"]')
    
    // Verify success message
    await expect(page.locator('[data-testid="reset-success"]')).toBeVisible()
    await expect(page.locator('[data-testid="reset-success"]')).toContainText('Password reset email sent')
    
    // Simulate clicking reset link (in real test, this would come from email)
    const resetToken = 'test-reset-token-123'
    await page.goto(`/reset-password?token=${resetToken}`)
    
    // Fill new password
    await page.fill('[data-testid="new-password-input"]', 'NewSecurePass123!')
    await page.fill('[data-testid="confirm-password-input"]', 'NewSecurePass123!')
    
    // Submit new password
    await page.click('[data-testid="update-password-button"]')
    
    // Verify success and redirect to login
    await expect(page.locator('[data-testid="password-updated"]')).toBeVisible()
    await expect(page).toHaveURL('**/login')
    
    // Test login with new password
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'NewSecurePass123!')
    await page.click('[data-testid="login-button"]')
    
    await expect(page).toHaveURL('**/dashboard')
  })

  test('email verification flow', async ({ page }) => {
    // Simulate clicking verification link from email
    const verificationToken = 'test-verification-token-123'
    await page.goto(`/verify-email?token=${verificationToken}`)
    
    // Verify success message
    await expect(page.locator('[data-testid="verification-success"]')).toBeVisible()
    await expect(page.locator('[data-testid="verification-success"]')).toContainText('Email verified successfully')
    
    // Verify redirect to login
    await expect(page).toHaveURL('**/login')
    
    // Test that user can now login
    await page.fill('[data-testid="email-input"]', 'john.doe@example.com')
    await page.fill('[data-testid="password-input"]', 'SecurePass123!')
    await page.click('[data-testid="login-button"]')
    
    await expect(page).toHaveURL('**/dashboard')
  })

  test('form validation', async ({ page }) => {
    await page.goto('/register')
    
    // Test empty form submission
    await page.click('[data-testid="register-button"]')
    
    // Verify validation errors
    await expect(page.locator('[data-testid="first-name-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="last-name-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible()
    
    // Test invalid email
    await page.fill('[data-testid="email-input"]', 'invalid-email')
    await page.click('[data-testid="register-button"]')
    await expect(page.locator('[data-testid="email-error"]')).toContainText('Please enter a valid email')
    
    // Test weak password
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', '123')
    await page.click('[data-testid="register-button"]')
    await expect(page.locator('[data-testid="password-error"]')).toContainText('Password must be at least 8 characters')
    
    // Test password mismatch
    await page.fill('[data-testid="password-input"]', 'SecurePass123!')
    await page.fill('[data-testid="confirm-password-input"]', 'DifferentPass123!')
    await page.click('[data-testid="register-button"]')
    await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText('Passwords do not match')
    
    // Test terms not accepted
    await page.fill('[data-testid="first-name-input"]', 'John')
    await page.fill('[data-testid="last-name-input"]', 'Doe')
    await page.fill('[data-testid="confirm-password-input"]', 'SecurePass123!')
    await page.click('[data-testid="register-button"]')
    await expect(page.locator('[data-testid="terms-error"]')).toContainText('You must accept the terms and conditions')
  })

  test('login validation and error handling', async ({ page }) => {
    await page.goto('/login')
    
    // Test empty form
    await page.click('[data-testid="login-button"]')
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible()
    
    // Test invalid credentials
    await page.fill('[data-testid="email-input"]', 'nonexistent@example.com')
    await page.fill('[data-testid="password-input"]', 'wrongpassword')
    await page.click('[data-testid="login-button"]')
    
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="login-error"]')).toContainText('Invalid email or password')
    
    // Test unverified account
    await page.fill('[data-testid="email-input"]', 'unverified@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    
    await expect(page.locator('[data-testid="verification-required"]')).toBeVisible()
    await expect(page.locator('[data-testid="verification-required"]')).toContainText('Please verify your email address')
    
    // Test resend verification
    await page.click('[data-testid="resend-verification-button"]')
    await expect(page.locator('[data-testid="verification-sent"]')).toBeVisible()
  })

  test('session management', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    
    await expect(page).toHaveURL('**/dashboard')
    
    // Test protected route access
    await page.goto('/profile')
    await expect(page.locator('[data-testid="profile-content"]')).toBeVisible()
    
    // Test logout
    await page.click('[data-testid="user-menu"]')
    await page.click('[data-testid="logout-button"]')
    
    // Verify redirect to home and session cleared
    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-testid="login-link"]')).toBeVisible()
    
    // Test accessing protected route after logout
    await page.goto('/profile')
    await expect(page).toHaveURL('**/login')
    await expect(page.locator('[data-testid="login-required"]')).toContainText('Please log in to access this page')
  })

  test('remember me functionality', async ({ page }) => {
    await page.goto('/login')
    
    // Login with remember me checked
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.check('[data-testid="remember-me-checkbox"]')
    await page.click('[data-testid="login-button"]')
    
    await expect(page).toHaveURL('**/dashboard')
    
    // Close and reopen browser (simulate)
    await page.context().clearCookies()
    await page.reload()
    
    // With remember me, user should still be logged in
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
    
    // Test without remember me
    await page.click('[data-testid="user-menu"]')
    await page.click('[data-testid="logout-button"]')
    
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    // Don't check remember me
    await page.click('[data-testid="login-button"]')
    
    await page.context().clearCookies()
    await page.reload()
    
    // Without remember me, user should be logged out
    await expect(page).toHaveURL('**/login')
  })

  test('account lockout after failed attempts', async ({ page }) => {
    await page.goto('/login')
    
    // Attempt multiple failed logins
    for (let i = 0; i < 5; i++) {
      await page.fill('[data-testid="email-input"]', 'test@example.com')
      await page.fill('[data-testid="password-input"]', 'wrongpassword')
      await page.click('[data-testid="login-button"]')
      
      await page.waitForSelector('[data-testid="login-error"]')
    }
    
    // After 5 failed attempts, account should be locked
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'wrongpassword')
    await page.click('[data-testid="login-button"]')
    
    await expect(page.locator('[data-testid="account-locked"]')).toBeVisible()
    await expect(page.locator('[data-testid="account-locked"]')).toContainText('Account temporarily locked')
    
    // Even correct password should be rejected
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    
    await expect(page.locator('[data-testid="account-locked"]')).toBeVisible()
  })
})