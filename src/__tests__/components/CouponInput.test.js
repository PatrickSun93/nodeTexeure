import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CouponInput from '../../components/CouponInput'

// Mock fetch
global.fetch = jest.fn()

const defaultProps = {
  onCouponApplied: jest.fn(),
  onCouponRemoved: jest.fn(),
  orderTotal: 100.00
}

describe('CouponInput', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetch.mockClear()
  })

  test('renders coupon input correctly', () => {
    render(<CouponInput {...defaultProps} />)
    
    expect(screen.getByTestId('coupon-input')).toBeInTheDocument()
    expect(screen.getByTestId('apply-coupon-button')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter coupon code')).toBeInTheDocument()
  })

  test('applies valid coupon successfully', async () => {
    const user = userEvent.setup()
    const onCouponApplied = jest.fn()
    
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        coupon: {
          code: 'TEST10',
          discount_type: 'percentage',
          discount_value: 10,
          discount_amount: 10.00
        }
      })
    })
    
    render(<CouponInput {...defaultProps} onCouponApplied={onCouponApplied} />)
    
    const input = screen.getByTestId('coupon-input')
    const button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'TEST10')
    await user.click(button)
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'TEST10',
          orderTotal: 100.00
        })
      })
      
      expect(onCouponApplied).toHaveBeenCalledWith({
        code: 'TEST10',
        discount_type: 'percentage',
        discount_value: 10,
        discount_amount: 10.00
      })
    })
    
    // Should show success state
    expect(screen.getByTestId('coupon-success')).toBeInTheDocument()
    expect(screen.getByText('Coupon applied: 10% off')).toBeInTheDocument()
    expect(screen.getByTestId('remove-coupon-button')).toBeInTheDocument()
  })

  test('handles invalid coupon code', async () => {
    const user = userEvent.setup()
    
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Invalid coupon code'
      })
    })
    
    render(<CouponInput {...defaultProps} />)
    
    const input = screen.getByTestId('coupon-input')
    const button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'INVALID')
    await user.click(button)
    
    await waitFor(() => {
      expect(screen.getByTestId('coupon-error')).toBeInTheDocument()
      expect(screen.getByText('Invalid coupon code')).toBeInTheDocument()
    })
  })

  test('handles expired coupon', async () => {
    const user = userEvent.setup()
    
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Coupon has expired'
      })
    })
    
    render(<CouponInput {...defaultProps} />)
    
    const input = screen.getByTestId('coupon-input')
    const button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'EXPIRED')
    await user.click(button)
    
    await waitFor(() => {
      expect(screen.getByTestId('coupon-error')).toBeInTheDocument()
      expect(screen.getByText('Coupon has expired')).toBeInTheDocument()
    })
  })

  test('handles minimum order amount not met', async () => {
    const user = userEvent.setup()
    
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Minimum order amount of $150.00 required'
      })
    })
    
    render(<CouponInput {...defaultProps} orderTotal={50.00} />)
    
    const input = screen.getByTestId('coupon-input')
    const button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'BIGORDER')
    await user.click(button)
    
    await waitFor(() => {
      expect(screen.getByTestId('coupon-error')).toBeInTheDocument()
      expect(screen.getByText('Minimum order amount of $150.00 required')).toBeInTheDocument()
    })
  })

  test('removes applied coupon', async () => {
    const user = userEvent.setup()
    const onCouponRemoved = jest.fn()
    
    // First apply a coupon
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        coupon: {
          code: 'TEST10',
          discount_type: 'percentage',
          discount_value: 10,
          discount_amount: 10.00
        }
      })
    })
    
    render(<CouponInput {...defaultProps} onCouponRemoved={onCouponRemoved} />)
    
    const input = screen.getByTestId('coupon-input')
    const applyButton = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'TEST10')
    await user.click(applyButton)
    
    await waitFor(() => {
      expect(screen.getByTestId('coupon-success')).toBeInTheDocument()
    })
    
    // Now remove the coupon
    const removeButton = screen.getByTestId('remove-coupon-button')
    await user.click(removeButton)
    
    expect(onCouponRemoved).toHaveBeenCalled()
    expect(screen.queryByTestId('coupon-success')).not.toBeInTheDocument()
    expect(screen.getByTestId('coupon-input')).toHaveValue('')
  })

  test('shows loading state during validation', async () => {
    const user = userEvent.setup()
    
    // Mock a delayed response
    fetch.mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true, coupon: {} })
        }), 1000)
      )
    )
    
    render(<CouponInput {...defaultProps} />)
    
    const input = screen.getByTestId('coupon-input')
    const button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'TEST10')
    await user.click(button)
    
    // Should show loading state
    expect(screen.getByTestId('coupon-loading')).toBeInTheDocument()
    expect(button).toBeDisabled()
  })

  test('prevents empty coupon submission', async () => {
    const user = userEvent.setup()
    
    render(<CouponInput {...defaultProps} />)
    
    const button = screen.getByTestId('apply-coupon-button')
    
    // Button should be disabled when input is empty
    expect(button).toBeDisabled()
    
    await user.click(button)
    
    // Should not make API call
    expect(fetch).not.toHaveBeenCalled()
  })

  test('trims whitespace from coupon code', async () => {
    const user = userEvent.setup()
    
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        coupon: { code: 'TEST10' }
      })
    })
    
    render(<CouponInput {...defaultProps} />)
    
    const input = screen.getByTestId('coupon-input')
    const button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, '  TEST10  ')
    await user.click(button)
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'TEST10',
          orderTotal: 100.00
        })
      })
    })
  })

  test('converts coupon code to uppercase', async () => {
    const user = userEvent.setup()
    
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        coupon: { code: 'TEST10' }
      })
    })
    
    render(<CouponInput {...defaultProps} />)
    
    const input = screen.getByTestId('coupon-input')
    const button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'test10')
    await user.click(button)
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'TEST10',
          orderTotal: 100.00
        })
      })
    })
  })

  test('handles network errors', async () => {
    const user = userEvent.setup()
    
    fetch.mockRejectedValueOnce(new Error('Network error'))
    
    render(<CouponInput {...defaultProps} />)
    
    const input = screen.getByTestId('coupon-input')
    const button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'TEST10')
    await user.click(button)
    
    await waitFor(() => {
      expect(screen.getByTestId('coupon-error')).toBeInTheDocument()
      expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument()
    })
  })

  test('displays different discount types correctly', async () => {
    const user = userEvent.setup()
    
    // Test percentage discount
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        coupon: {
          code: 'PERCENT10',
          discount_type: 'percentage',
          discount_value: 10,
          discount_amount: 10.00
        }
      })
    })
    
    render(<CouponInput {...defaultProps} />)
    
    let input = screen.getByTestId('coupon-input')
    let button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'PERCENT10')
    await user.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Coupon applied: 10% off')).toBeInTheDocument()
    })
    
    // Remove coupon and test fixed amount
    await user.click(screen.getByTestId('remove-coupon-button'))
    
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        coupon: {
          code: 'FIXED20',
          discount_type: 'fixed_amount',
          discount_value: 20,
          discount_amount: 20.00
        }
      })
    })
    
    await user.type(input, 'FIXED20')
    await user.click(button)
    
    await waitFor(() => {
      expect(screen.getByText('Coupon applied: $20.00 off')).toBeInTheDocument()
    })
  })

  test('clears error when user starts typing', async () => {
    const user = userEvent.setup()
    
    // First trigger an error
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Invalid coupon'
      })
    })
    
    render(<CouponInput {...defaultProps} />)
    
    const input = screen.getByTestId('coupon-input')
    const button = screen.getByTestId('apply-coupon-button')
    
    await user.type(input, 'INVALID')
    await user.click(button)
    
    await waitFor(() => {
      expect(screen.getByTestId('coupon-error')).toBeInTheDocument()
    })
    
    // Clear input and start typing - error should disappear
    await user.clear(input)
    await user.type(input, 'NEW')
    
    expect(screen.queryByTestId('coupon-error')).not.toBeInTheDocument()
  })
})