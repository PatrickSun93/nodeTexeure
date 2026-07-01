'use client';

import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// Initialize Stripe with publishable key
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && 
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY !== 'pk_test_your_stripe_publishable_key' 
    ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    : null;

const StripeProvider = ({ children, options = {} }) => {
  // If Stripe is not configured, show a placeholder
  if (!stripePromise) {
    return (
      <div className="payment-form">
        <div className="checkout-error">
          <svg className="checkout-error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Stripe payment processing is not configured. Please set up your Stripe keys to enable payments.
        </div>
        <button className="payment-submit-btn" disabled>
          Payment Not Available
        </button>
      </div>
    );
  }

  const defaultOptions = {
    mode: 'payment',
    currency: 'usd',
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#2c3e50',
        colorBackground: '#ffffff',
        colorText: '#2c3e50',
        colorDanger: '#e74c3c',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        spacingUnit: '4px',
        borderRadius: '8px',
      },
      rules: {
        '.Input': {
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '16px',
        },
        '.Input:focus': {
          borderColor: '#2c3e50',
          boxShadow: '0 0 0 2px rgba(44, 62, 80, 0.1)',
        },
        '.Label': {
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px',
        },
      },
    },
    ...options,
  };

  return (
    <Elements stripe={stripePromise} options={defaultOptions}>
      {children}
    </Elements>
  );
};

export default StripeProvider;