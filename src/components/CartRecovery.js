'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * CartRecovery component handles cart recovery from abandoned cart email links
 * Automatically processes recovery tokens and restores cart state
 */
export default function CartRecovery() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [recoveryStatus, setRecoveryStatus] = useState('processing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const recoveryToken = searchParams.get('recovery');
    const cartId = searchParams.get('cart');

    if (recoveryToken && cartId) {
      handleCartRecovery(recoveryToken, cartId);
    } else {
      setRecoveryStatus('error');
      setMessage('Invalid recovery link. Please check your email and try again.');
    }
  }, [searchParams]);

  const handleCartRecovery = async (recoveryToken, cartId) => {
    try {
      setRecoveryStatus('processing');
      setMessage('Restoring your cart...');

      // Validate recovery token with backend
      const response = await fetch(`/api/abandoned-cart/recovery/${recoveryToken}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        // Recovery successful - redirect to checkout
        setRecoveryStatus('success');
        setMessage('Your cart has been restored! Redirecting to checkout...');
        
        setTimeout(() => {
          router.push('/checkout');
        }, 2000);
      } else {
        const errorData = await response.json();
        setRecoveryStatus('error');
        setMessage(errorData.message || 'Failed to restore your cart. The link may have expired.');
      }
    } catch (error) {
      console.error('Cart recovery error:', error);
      setRecoveryStatus('error');
      setMessage('An error occurred while restoring your cart. Please try again.');
    }
  };

  const getStatusIcon = () => {
    switch (recoveryStatus) {
      case 'processing':
        return (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderBottomColor: 'var(--noirae-accent-gold)' }}></div>
        );
      case 'success':
        return (
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full" style={{ background: 'var(--noirae-success-bg)' }}>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--noirae-success)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full" style={{ background: 'var(--noirae-error-bg)' }}>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--noirae-error)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (recoveryStatus) {
      case 'processing':
        return 'var(--noirae-info)';
      case 'success':
        return 'var(--noirae-success)';
      case 'error':
        return 'var(--noirae-error)';
      default:
        return 'var(--noirae-text-secondary)';
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8" style={{ background: 'var(--noirae-bg-cream)' }}>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="py-8 px-4 shadow sm:rounded-lg sm:px-10" style={{ background: 'var(--noirae-bg-white)' }}>
          <div className="text-center">
            {getStatusIcon()}
            
            <h2 className="mt-6 text-center text-3xl font-extrabold" style={{ color: 'var(--noirae-charcoal)' }}>
              Cart Recovery
            </h2>
            
            <p className="mt-4 text-sm" style={{ color: getStatusColor() }}>
              {message}
            </p>

            {recoveryStatus === 'error' && (
              <div className="mt-6 space-y-4">
                <button
                  onClick={() => router.push('/cart')}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{ background: 'var(--noirae-charcoal)', color: 'var(--noirae-bg-white)' }}
                >
                  View Current Cart
                </button>
                
                <button
                  onClick={() => router.push('/shop')}
                  className="w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{ background: 'var(--noirae-bg-white)', color: 'var(--noirae-charcoal)', borderColor: 'var(--noirae-border-medium)' }}
                >
                  Continue Shopping
                </button>
              </div>
            )}

            {recoveryStatus === 'processing' && (
              <div className="mt-6">
                <p className="text-xs" style={{ color: 'var(--noirae-text-muted)' }}>
                  Please wait while we restore your cart...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}