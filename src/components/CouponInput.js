'use client';

import { useState } from 'react';

const CouponInput = ({ 
  cartId, 
  onCouponApplied, 
  onCouponRemoved, 
  disabled = false,
  className = '' 
}) => {
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setError('Please enter a coupon code');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const response = await fetch('/api/orders/apply-coupon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          cartId, 
          couponCode: couponCode.trim().toUpperCase() 
        })
      });

      const data = await response.json();

      if (data.status === 'success') {
        const discountAmount = data.data.discount;
        const couponInfo = data.data.coupon;
        
        setAppliedCoupon({
          code: couponCode.trim().toUpperCase(),
          discount: discountAmount,
          ...couponInfo
        });
        
        setSuccess(`Coupon applied! You saved $${discountAmount.toFixed(2)}`);
        setCouponCode('');
        
        // Notify parent component
        if (onCouponApplied) {
          onCouponApplied({
            code: couponCode.trim().toUpperCase(),
            discount: discountAmount,
            coupon: couponInfo
          });
        }
      } else {
        setError(data.message || 'Invalid coupon code');
      }
    } catch (err) {
      console.error('Error applying coupon:', err);
      setError('Error applying coupon. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setSuccess('');
    setError('');
    setCouponCode('');
    
    // Notify parent component
    if (onCouponRemoved) {
      onCouponRemoved();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApplyCoupon();
    }
  };

  return (
    <div className={`coupon-input-container ${className}`}>
      {!appliedCoupon ? (
        <div className="coupon-input-section">
          <div className="coupon-input-wrapper">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="Enter discount code"
              className="coupon-input"
              disabled={disabled || loading}
              maxLength={50}
            />
            <button
              onClick={handleApplyCoupon}
              disabled={disabled || loading || !couponCode.trim()}
              className="coupon-apply-btn"
            >
              {loading ? (
                <div className="coupon-spinner"></div>
              ) : (
                'Apply'
              )}
            </button>
          </div>
          
          {error && (
            <div className="coupon-message coupon-error">
              <svg className="coupon-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="coupon-applied-section">
          <div className="coupon-applied-info">
            <div className="coupon-applied-header">
              <svg className="coupon-success-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="coupon-applied-code">{appliedCoupon.code}</span>
              <button
                onClick={handleRemoveCoupon}
                className="coupon-remove-btn"
                disabled={disabled}
                aria-label="Remove coupon"
              >
                <svg className="coupon-remove-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="coupon-applied-details">
              <span className="coupon-applied-name">{appliedCoupon.name}</span>
              <span className="coupon-applied-discount">-${appliedCoupon.discount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {success && !appliedCoupon && (
        <div className="coupon-message coupon-success">
          <svg className="coupon-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {success}
        </div>
      )}

      <style jsx>{`
        .coupon-input-container {
          margin: 1rem 0;
        }

        .coupon-input-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .coupon-input-wrapper {
          display: flex;
          gap: 0.5rem;
          align-items: stretch;
        }

        .coupon-input {
          flex: 1;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          transition: border-color 0.2s, box-shadow 0.2s;
          text-transform: uppercase;
        }

        .coupon-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .coupon-input:disabled {
          background-color: #f9fafb;
          color: #6b7280;
          cursor: not-allowed;
        }

        .coupon-apply-btn {
          padding: 0.75rem 1.5rem;
          background-color: #1f2937;
          color: white;
          border: none;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 80px;
        }

        .coupon-apply-btn:hover:not(:disabled) {
          background-color: #374151;
        }

        .coupon-apply-btn:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }

        .coupon-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .coupon-applied-section {
          background-color: #f0f9ff;
          border: 1px solid #0ea5e9;
          border-radius: 0.5rem;
          padding: 1rem;
        }

        .coupon-applied-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .coupon-applied-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .coupon-success-icon {
          width: 20px;
          height: 20px;
          color: #059669;
          flex-shrink: 0;
        }

        .coupon-applied-code {
          font-weight: 600;
          color: #1f2937;
          font-family: monospace;
          font-size: 0.875rem;
          flex: 1;
        }

        .coupon-remove-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 0.25rem;
          color: #6b7280;
          transition: color 0.2s, background-color 0.2s;
        }

        .coupon-remove-btn:hover:not(:disabled) {
          color: #ef4444;
          background-color: #fef2f2;
        }

        .coupon-remove-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .coupon-remove-icon {
          width: 16px;
          height: 16px;
        }

        .coupon-applied-details {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-left: 1.75rem;
        }

        .coupon-applied-name {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .coupon-applied-discount {
          font-weight: 600;
          color: #059669;
          font-size: 0.875rem;
        }

        .coupon-message {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .coupon-error {
          background-color: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        .coupon-success {
          background-color: #f0fdf4;
          color: #16a34a;
          border: 1px solid #bbf7d0;
        }

        .coupon-icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        /* Mobile responsive */
        @media (max-width: 640px) {
          .coupon-input-wrapper {
            flex-direction: column;
          }

          .coupon-apply-btn {
            width: 100%;
            justify-content: center;
          }

          .coupon-applied-details {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
            margin-left: 1.75rem;
          }
        }
      `}</style>
    </div>
  );
};

export default CouponInput;