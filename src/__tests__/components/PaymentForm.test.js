import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaymentForm from '../../components/PaymentForm'
import { StripeProvider } from '../../components/StripeProvider'

// Mock Stripe
const mockStripe = {
  elements: jest.fn(() => ({
    create: jest.fn(() => ({
      mount: jest.fn(),
      unmount: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    })),
    getElement: jest.fn()
  })),
  confirmCardPayment: jest.fn(),
  createPaymentMethod: jest.fn()
}

const mockElements = {
  create: jest.fn(() => ({
    mount: jest.fn(),
    unmount: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
    clear: jest.fn(),
    update: jest.fn()
  })),
  getElement: jest.fn()
}

jest.mock('@stripe/react-stripe-js', () => ({
  useStripe: () => mockStripe,
  useElements: () => mockElements,
  CardElement: ({ onChange, onReady, onFocus, onBlur }) => {
    return (
      <div data-testid="stripe-card-element">
        <input
          data-testid="card-input"
          onChange={(e) => onChange && onChange({ complete: e.target.value.length > 10 })}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>
    )
  }
}))

const defaultProps = {
  clientSecret: 'pi_test123_secret_test',
  amount: 2000,
  onSuccess: jest.fn(),
  onError: jest.fn(),
  loading: false
}

const renderPaymentForm = (props = {}) => {
  return render(
    <StripeProvider>
      <PaymentForm {...defaultProps} {...props} />
    </StripeProvider>
  )
}

describe('PaymentForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders payment form correctly', () => {
    renderPaymentForm()
    
    expect(screen.getByTestId('payment-form')).toBeInTheDocument()
    expect(screen.getByTestId('stripe-card-element')).toBeInTheDocument()
    expect(screen.getByTestId('pay-button')).toBeInTheDocument()
    expect(screen.getByText('Pay $20.00')).toBeInTheDocument()
  })

  test('displays loading state correctly', () => {
    renderPaymentForm({ loading: true })
    
    const payButton = screen.getByTestId('pay-button')
    expect(payButton).toBeDisabled()
    expect(screen.getByTestId('payment-loading')).toBeInTheDocument()
  })

  test('handles successful payment', async () => {
    const user = userEvent.setup()
    const onSuccess = jest.fn()
    
    mockStripe.confirmCardPayment.mockResolvedValue({
      paymentIntent: {
        id: 'pi_test123',
        status: 'succeeded'
      }
    })
    
    renderPaymentForm({ onSuccess })
    
    // Fill card details
    const cardInput = screen.getByTestId('card-input')
    await user.type(cardInput, '4242424242424242')
    
    // Submit payment
    const payButton = screen.getByTestId('pay-button')
    await user.click(payButton)
    
    await waitFor(() => {
      expect(mockStripe.confirmCardPayment).toHaveBeenCalledWith(
        'pi_test123_secret_test',
        expect.any(Object)
      )
      expect(onSuccess).toHaveBeenCalledWith({
        id: 'pi_test123',
        status: 'succeeded'
      })
    })
  })

  test('handles payment failure', async () => {
    const user = userEvent.setup()
    const onError = jest.fn()
    
    mockStripe.confirmCardPayment.mockResolvedValue({
      error: {
        type: 'card_error',
        code: 'card_declined',
        message: 'Your card was declined.'
      }
    })
    
    renderPaymentForm({ onError })
    
    const cardInput = screen.getByTestId('card-input')
    await user.type(cardInput, '4000000000000002')
    
    const payButton = screen.getByTestId('pay-button')
    await user.click(payButton)
    
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Your card was declined.')
      expect(screen.getByTestId('payment-error')).toBeInTheDocument()
      expect(screen.getByText('Your card was declined.')).toBeInTheDocument()
    })
  })

  test('validates card completion before submission', async () => {
    const user = userEvent.setup()
    
    renderPaymentForm()
    
    const payButton = screen.getByTestId('pay-button')
    
    // Button should be disabled initially
    expect(payButton).toBeDisabled()
    
    // Type incomplete card number
    const cardInput = screen.getByTestId('card-input')
    await user.type(cardInput, '4242')
    
    // Button should still be disabled
    expect(payButton).toBeDisabled()
    
    // Type complete card number
    await user.clear(cardInput)
    await user.type(cardInput, '4242424242424242')
    
    // Button should be enabled
    await waitFor(() => {
      expect(payButton).not.toBeDisabled()
    })
  })

  test('handles network errors gracefully', async () => {
    const user = userEvent.setup()
    const onError = jest.fn()
    
    mockStripe.confirmCardPayment.mockRejectedValue(
      new Error('Network error')
    )
    
    renderPaymentForm({ onError })
    
    const cardInput = screen.getByTestId('card-input')
    await user.type(cardInput, '4242424242424242')
    
    const payButton = screen.getByTestId('pay-button')
    await user.click(payButton)
    
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Network error occurred. Please try again.')
    })
  })

  test('displays correct amount formatting', () => {
    renderPaymentForm({ amount: 1234 })
    expect(screen.getByText('Pay $12.34')).toBeInTheDocument()
    
    renderPaymentForm({ amount: 5000 })
    expect(screen.getByText('Pay $50.00')).toBeInTheDocument()
  })

  test('handles card element events', async () => {
    const user = userEvent.setup()
    
    renderPaymentForm()
    
    const cardInput = screen.getByTestId('card-input')
    
    // Test focus event
    await user.click(cardInput)
    expect(screen.getByTestId('card-element-focused')).toBeInTheDocument()
    
    // Test blur event
    await user.tab()
    expect(screen.queryByTestId('card-element-focused')).not.toBeInTheDocument()
  })

  test('prevents double submission', async () => {
    const user = userEvent.setup()
    
    mockStripe.confirmCardPayment.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    )
    
    renderPaymentForm()
    
    const cardInput = screen.getByTestId('card-input')
    await user.type(cardInput, '4242424242424242')
    
    const payButton = screen.getByTestId('pay-button')
    
    // Click multiple times rapidly
    await user.click(payButton)
    await user.click(payButton)
    await user.click(payButton)
    
    // Should only call confirmCardPayment once
    expect(mockStripe.confirmCardPayment).toHaveBeenCalledTimes(1)
  })

  test('clears error when user starts typing', async () => {
    const user = userEvent.setup()
    
    // First, trigger an error
    mockStripe.confirmCardPayment.mockResolvedValue({
      error: { message: 'Card declined' }
    })
    
    renderPaymentForm()
    
    const cardInput = screen.getByTestId('card-input')
    await user.type(cardInput, '4000000000000002')
    
    const payButton = screen.getByTestId('pay-button')
    await user.click(payButton)
    
    await waitFor(() => {
      expect(screen.getByTestId('payment-error')).toBeInTheDocument()
    })
    
    // Now type in card input - error should clear
    await user.type(cardInput, '4242424242424242')
    
    expect(screen.queryByTestId('payment-error')).not.toBeInTheDocument()
  })

  test('handles missing client secret', () => {
    renderPaymentForm({ clientSecret: null })
    
    expect(screen.getByTestId('payment-error')).toBeInTheDocument()
    expect(screen.getByText('Payment initialization failed')).toBeInTheDocument()
  })

  test('supports different currencies', () => {
    renderPaymentForm({ amount: 2000, currency: 'EUR' })
    expect(screen.getByText('Pay €20.00')).toBeInTheDocument()
    
    renderPaymentForm({ amount: 2000, currency: 'GBP' })
    expect(screen.getByText('Pay £20.00')).toBeInTheDocument()
  })
})