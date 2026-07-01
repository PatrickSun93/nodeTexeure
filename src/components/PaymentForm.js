'use client';

import { useState, useEffect } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';

const PaymentForm = ({ 
  clientSecret, 
  onPaymentSuccess, 
  onPaymentError, 
  onPaymentProcessing,
  disabled = false,
  returnUrl 
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!stripe) {
      return;
    }

    if (!clientSecret) {
      return;
    }

    stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
      switch (paymentIntent.status) {
        case 'succeeded':
          setMessage('Payment succeeded!');
          if (onPaymentSuccess) {
            onPaymentSuccess(paymentIntent);
          }
          break;
        case 'processing':
          setMessage('Your payment is processing.');
          if (onPaymentProcessing) {
            onPaymentProcessing(paymentIntent);
          }
          break;
        case 'requires_payment_method':
          setMessage('Your payment was not successful, please try again.');
          break;
        default:
          setMessage('Something went wrong.');
          break;
      }
    });
  }, [stripe, clientSecret, onPaymentSuccess, onPaymentProcessing]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded.
      return;
    }

    setIsLoading(true);
    setMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl || `${window.location.origin}/checkout/success`,
      },
      redirect: 'if_required',
    });

    if (error) {
      if (error.type === 'card_error' || error.type === 'validation_error') {
        setMessage(error.message);
      } else {
        setMessage('An unexpected error occurred.');
      }
      
      if (onPaymentError) {
        onPaymentError(error);
      }
    } else {
      // Payment succeeded
      if (onPaymentSuccess) {
        onPaymentSuccess();
      }
    }

    setIsLoading(false);
  };

  const paymentElementOptions = {
    layout: 'tabs',
    paymentMethodOrder: ['card', 'apple_pay', 'google_pay'],
  };

  return (
    <form id="payment-form" onSubmit={handleSubmit} className="payment-form">
      <div className="payment-element-container">
        <PaymentElement 
          id="payment-element" 
          options={paymentElementOptions}
        />
      </div>
      
      <button 
        disabled={isLoading || !stripe || !elements || disabled} 
        id="submit"
        className="payment-submit-btn"
      >
        <span id="button-text">
          {isLoading ? (
            <div className="payment-spinner">
              <div className="spinner"></div>
              Processing...
            </div>
          ) : (
            'Pay now'
          )}
        </span>
      </button>
      
      {/* Show any error or success messages */}
      {message && (
        <div 
          id="payment-message" 
          className={`payment-message ${
            message.includes('succeeded') ? 'success' : 'error'
          }`}
        >
          {message}
        </div>
      )}
    </form>
  );
};

export default PaymentForm;