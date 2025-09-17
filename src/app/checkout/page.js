'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import MobileLoading from '../../components/MobileLoading';
import StripeProvider from '../../components/StripeProvider';
import PaymentForm from '../../components/PaymentForm';
import PriceDisplay from '../../components/PriceDisplay';

function CheckoutPage() {
  const [cartItems, setCartItems] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [subtotal, setSubtotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [shippingOptions, setShippingOptions] = useState([]);
  const [selectedShippingOption, setSelectedShippingOption] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [shippingAddress, setShippingAddress] = useState({ 
    first_name: '', last_name: '', address_line_1: '', city: '', 
    state: '', postal_code: '', country: '', phone: '' 
  });
  const [billingAddress, setBillingAddress] = useState({ 
    first_name: '', last_name: '', address_line_1: '', city: '', 
    state: '', postal_code: '', country: '', phone: '' 
  });
  const [guestEmail, setGuestEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { data: session, status } = useSession();
  const isLoggedIn = status === 'authenticated';
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [applyCouponLoading, setApplyCouponLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [sameAsBilling, setSameAsBilling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const router = useRouter();

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (status !== 'loading') {
      fetchCart();
    }
  }, [status]);

  const fetchCart = async () => {
    try {
      setLoading(true);
      setError('');
      
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (session?.accessToken) {
        headers.Authorization = `Bearer ${session.accessToken}`;
      }
      
      const res = await fetch('/api/cart', { headers });
      if (res.ok) {
        const data = await res.json();
        setCartId(data.cartId); // Assuming backend returns cartId
        setCartItems(data.items || []);
        const sub = data.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
        setSubtotal(sub);
        setTax(sub * 0.1); // 10% tax for example
      } else {
        setError('Failed to load cart items');
      }
    } catch (err) {
      setError('Error loading cart');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    
    try {
      setApplyCouponLoading(true);
      setError('');
      setSuccess('');
      
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (session?.accessToken) {
        headers.Authorization = `Bearer ${session.accessToken}`;
      }
      
      const res = await fetch('/api/orders/apply-coupon', {
        method: 'POST',
        headers,
        body: JSON.stringify({ cartId, couponCode })
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setDiscount(data.data.discount);
        setSuccess(`Coupon applied! You saved $${data.data.discount.toFixed(2)}`);
      } else {
        setError(data.message || 'Invalid coupon code');
      }
    } catch (err) {
      setError('Error applying coupon');
    } finally {
      setApplyCouponLoading(false);
    }
  };

  const createOrder = async () => {
    if (!cartId) {
      setError('Cart not found');
      return null;
    }
    
    try {
      setError('');
      
      const payload = {
        cartId,
        shippingAddress,
        billingAddress: sameAsBilling ? shippingAddress : billingAddress,
        couponCode,
        guestEmail: isLoggedIn ? null : guestEmail
      };
      
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (session?.accessToken) {
        headers.Authorization = `Bearer ${session.accessToken}`;
      }
      
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        return data.data.orderId;
      } else {
        setError(data.message || 'Failed to create order');
        return null;
      }
    } catch (err) {
      setError('Error creating order');
      return null;
    }
  };

  const createPaymentIntent = async (orderIdToUse) => {
    try {
      setError('');
      
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (session?.accessToken) {
        headers.Authorization = `Bearer ${session.accessToken}`;
      }
      
      const res = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: total,
          currency: 'usd',
          orderId: orderIdToUse,
          metadata: {
            cartId,
            guestEmail: isLoggedIn ? null : guestEmail
          }
        })
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setClientSecret(data.data.clientSecret);
        setPaymentIntentId(data.data.paymentIntentId);
        return true;
      } else {
        setError(data.message || 'Failed to create payment intent');
        return false;
      }
    } catch (err) {
      setError('Error creating payment intent');
      return false;
    }
  };

  const handlePaymentSuccess = (paymentIntent) => {
    setPaymentProcessing(false);
    // Payment success is handled by Stripe redirect
    // The success page will handle the confirmation
  };

  const handlePaymentError = (error) => {
    setPaymentProcessing(false);
    setError(error.message || 'Payment failed. Please try again.');
  };

  const handlePaymentProcessing = (paymentIntent) => {
    setPaymentProcessing(true);
  };

  // Calculate shipping when address changes
  const calculateShipping = async (address) => {
    if (!address.country || cartItems.length === 0) {
      setShippingOptions([]);
      setSelectedShippingOption(null);
      setShipping(0);
      return;
    }

    try {
      setShippingLoading(true);
      setError('');

      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (session?.accessToken) {
        headers.Authorization = `Bearer ${session.accessToken}`;
      }

      const response = await fetch('/api/shipping/calculate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          address,
          items: cartItems.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            quantity: item.quantity
          }))
        })
      });

      const data = await response.json();

      if (data.status === 'success') {
        setShippingOptions(data.data.options);
        // Auto-select the cheapest option
        if (data.data.options.length > 0) {
          const cheapestOption = data.data.options.reduce((prev, current) => 
            prev.cost < current.cost ? prev : current
          );
          setSelectedShippingOption(cheapestOption);
          setShipping(cheapestOption.cost);
        }
      } else {
        setError(data.message || 'Failed to calculate shipping');
        setShippingOptions([]);
        setSelectedShippingOption(null);
        setShipping(0);
      }
    } catch (err) {
      console.error('Error calculating shipping:', err);
      setError('Error calculating shipping costs');
      setShippingOptions([]);
      setSelectedShippingOption(null);
      setShipping(0);
    } finally {
      setShippingLoading(false);
    }
  };

  // Update shipping when address changes
  useEffect(() => {
    if (shippingAddress.country && shippingAddress.state && shippingAddress.postal_code) {
      calculateShipping(shippingAddress);
    }
  }, [shippingAddress.country, shippingAddress.state, shippingAddress.postal_code, cartItems]);

  const updateTotal = () => {
    setTotal(subtotal + tax + shipping - discount);
  };

  useEffect(updateTotal, [subtotal, tax, shipping, discount]);

  // Step navigation
  const steps = [
    { id: 1, name: 'Information', description: 'Contact & Shipping' },
    { id: 2, name: 'Payment', description: 'Payment Method' }
  ];

  const nextStep = async () => {
    if (currentStep === 1) {
      // Moving from information to payment - create order and payment intent
      setSubmitting(true);
      const newOrderId = await createOrder();
      if (newOrderId) {
        setOrderId(newOrderId);
        const paymentCreated = await createPaymentIntent(newOrderId);
        if (paymentCreated) {
          setCurrentStep(2);
        }
      }
      setSubmitting(false);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  // Form validation
  const validateStep1 = () => {
    if (!isLoggedIn && !guestEmail) return false;
    const required = ['first_name', 'last_name', 'address_line_1', 'city', 'state', 'postal_code', 'country'];
    return required.every(field => shippingAddress[field]?.trim());
  };

  const AddressForm = ({ address, setAddress, title, disabled = false }) => (
    <div className="checkout-address-form">
      <h3 className="checkout-form-title">{title}</h3>
      <div className="checkout-form-grid">
        <div className="checkout-form-row">
          <input 
            type="text" 
            value={address.first_name} 
            onChange={e => setAddress({...address, first_name: e.target.value})} 
            placeholder="First Name *" 
            className="checkout-input"
            disabled={disabled}
            required
          />
          <input 
            type="text" 
            value={address.last_name} 
            onChange={e => setAddress({...address, last_name: e.target.value})} 
            placeholder="Last Name *" 
            className="checkout-input"
            disabled={disabled}
            required
          />
        </div>
        <input 
          type="text" 
          value={address.address_line_1} 
          onChange={e => setAddress({...address, address_line_1: e.target.value})} 
          placeholder="Address Line 1 *" 
          className="checkout-input"
          disabled={disabled}
          required
        />
        <div className="checkout-form-row">
          <input 
            type="text" 
            value={address.city} 
            onChange={e => setAddress({...address, city: e.target.value})} 
            placeholder="City *" 
            className="checkout-input"
            disabled={disabled}
            required
          />
          <input 
            type="text" 
            value={address.state} 
            onChange={e => setAddress({...address, state: e.target.value})} 
            placeholder="State *" 
            className="checkout-input"
            disabled={disabled}
            required
          />
        </div>
        <div className="checkout-form-row">
          <input 
            type="text" 
            value={address.postal_code} 
            onChange={e => setAddress({...address, postal_code: e.target.value})} 
            placeholder="Postal Code *" 
            className="checkout-input"
            disabled={disabled}
            required
          />
          <input 
            type="text" 
            value={address.country} 
            onChange={e => setAddress({...address, country: e.target.value})} 
            placeholder="Country *" 
            className="checkout-input"
            disabled={disabled}
            required
          />
        </div>
        <input 
          type="tel" 
          value={address.phone} 
          onChange={e => setAddress({...address, phone: e.target.value})} 
          placeholder="Phone Number" 
          className="checkout-input"
          disabled={disabled}
        />
      </div>
    </div>
  );

  const OrderSummary = ({ isCollapsible = false }) => {
    const [isExpanded, setIsExpanded] = useState(!isCollapsible);
    
    return (
      <div className="checkout-summary">
        <div className="checkout-summary-header">
          <h3 className="checkout-summary-title">
            Order Summary
            {isMobile && (
              <span className="checkout-summary-total-mobile">
                <PriceDisplay price={total} size="lg" />
              </span>
            )}
          </h3>
          {isCollapsible && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="checkout-summary-toggle"
              aria-label={isExpanded ? 'Collapse order summary' : 'Expand order summary'}
            >
              <svg 
                className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        
        {loading ? (
          <div className="checkout-loading">
            <div className="checkout-spinner"></div>
            <p>Loading cart items...</p>
          </div>
        ) : (
          <>
            {isExpanded && (
              <div className="checkout-items">
                {cartItems.map(item => (
                  <div key={item.id} className="checkout-item">
                    <div className="checkout-item-image">
                      <img src={item.image || '/api/placeholder/60/60'} alt={item.name} />
                      <span className="checkout-item-quantity">{item.quantity}</span>
                    </div>
                    <div className="checkout-item-details">
                      <h4>{item.name}</h4>
                      <p className="checkout-item-variant">{item.variant}</p>
                    </div>
                    <div className="checkout-item-price">
                      ${(item.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}

          <div className="checkout-coupon">
            <div className="checkout-coupon-input">
              <input 
                type="text" 
                value={couponCode} 
                onChange={e => setCouponCode(e.target.value)} 
                placeholder="Discount code" 
                className="checkout-input"
              />
              <button 
                onClick={handleApplyCoupon} 
                disabled={applyCouponLoading || !couponCode.trim()}
                className="checkout-coupon-btn"
              >
                {applyCouponLoading ? 'Applying...' : 'Apply'}
              </button>
            </div>
            {success && <p className="checkout-success">{success}</p>}
          </div>

          <div className="checkout-totals">
            <div className="checkout-total-row">
              <span>Subtotal</span>
              <span><PriceDisplay price={subtotal} /></span>
            </div>
            <div className="checkout-total-row">
              <span>
                Shipping
                {selectedShippingOption && (
                  <span className="checkout-shipping-method">
                    ({selectedShippingOption.name})
                  </span>
                )}
              </span>
              <span>
                {shipping === 0 ? 'Free' : <PriceDisplay price={shipping} />}
              </span>
            </div>
            <div className="checkout-total-row">
              <span>Tax</span>
              <span><PriceDisplay price={tax} /></span>
            </div>
            {discount > 0 && (
              <div className="checkout-total-row checkout-discount">
                <span>Discount</span>
                <span>-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="checkout-total-row checkout-total-final">
              <span>Total</span>
              <span><PriceDisplay price={total} size="lg" /></span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="checkout-loading-page">
          {isMobile ? (
            <MobileLoading message="Loading checkout..." size="large" />
          ) : (
            <>
              <div className="checkout-spinner"></div>
              <p>Loading checkout...</p>
            </>
          )}
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="aesop-page">
      <Header />
      
      <div className="checkout-container">
        <div className="checkout-header">
          <h1 className="checkout-title">Checkout</h1>
          
          {/* Progress Steps */}
          <div className="checkout-steps">
            {steps.map((step, index) => (
              <div key={step.id} className={`checkout-step ${currentStep >= step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}>
                <div className="checkout-step-number">
                  {currentStep > step.id ? '✓' : step.id}
                </div>
                <div className="checkout-step-info">
                  <div className="checkout-step-name">{step.name}</div>
                  <div className="checkout-step-description">{step.description}</div>
                </div>
                {index < steps.length - 1 && <div className="checkout-step-connector"></div>}
              </div>
            ))}
          </div>
        </div>

        <div className="checkout-content">
          <div className="checkout-main">
            {error && (
              <div className="checkout-error">
                <svg className="checkout-error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Step 1: Information */}
            {currentStep === 1 && (
              <div className="checkout-step-content">
                <div className="checkout-section">
                  <h2 className="checkout-section-title">Contact Information</h2>
                  {!isLoggedIn && (
                    <input 
                      type="email" 
                      value={guestEmail} 
                      onChange={e => setGuestEmail(e.target.value)} 
                      placeholder="Email address *" 
                      className="checkout-input"
                      required
                    />
                  )}
                </div>

                <div className="checkout-section">
                  <AddressForm 
                    address={shippingAddress} 
                    setAddress={setShippingAddress} 
                    title="Shipping Address" 
                  />
                </div>

                {/* Shipping Options */}
                {shippingOptions.length > 0 && (
                  <div className="checkout-section">
                    <h3 className="checkout-form-title">Shipping Method</h3>
                    <div className="checkout-shipping-options">
                      {shippingOptions.map((option) => (
                        <div key={option.id} className="checkout-shipping-option">
                          <input
                            type="radio"
                            id={`shipping-${option.id}`}
                            name="shipping"
                            value={option.id}
                            checked={selectedShippingOption?.id === option.id}
                            onChange={() => {
                              setSelectedShippingOption(option);
                              setShipping(option.cost);
                            }}
                          />
                          <label htmlFor={`shipping-${option.id}`} className="checkout-shipping-label">
                            <div className="checkout-shipping-info">
                              <div className="checkout-shipping-name">{option.name}</div>
                              <div className="checkout-shipping-time">
                                {option.estimatedDays.min === option.estimatedDays.max 
                                  ? `${option.estimatedDays.min} days`
                                  : `${option.estimatedDays.min}-${option.estimatedDays.max} days`
                                }
                              </div>
                            </div>
                            <div className="checkout-shipping-price">
                              ${option.cost.toFixed(2)}
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                    {shippingLoading && (
                      <div className="checkout-shipping-loading">
                        <div className="checkout-spinner"></div>
                        <span>Calculating shipping rates...</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="checkout-section">
                  <div className="checkout-checkbox">
                    <input 
                      type="checkbox" 
                      id="sameAsBilling" 
                      checked={sameAsBilling} 
                      onChange={e => setSameAsBilling(e.target.checked)}
                    />
                    <label htmlFor="sameAsBilling">Billing address is the same as shipping address</label>
                  </div>
                  
                  {!sameAsBilling && (
                    <AddressForm 
                      address={billingAddress} 
                      setAddress={setBillingAddress} 
                      title="Billing Address" 
                    />
                  )}
                </div>

                <div className="checkout-actions">
                  <button 
                    onClick={nextStep}
                    disabled={!validateStep1()}
                    className="checkout-btn-primary"
                  >
                    Continue to Payment
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Payment */}
            {currentStep === 2 && (
              <div className="checkout-step-content">
                <div className="checkout-section">
                  <h2 className="checkout-section-title">Payment Method</h2>
                  {clientSecret ? (
                    <StripeProvider options={{ clientSecret }}>
                      <PaymentForm
                        clientSecret={clientSecret}
                        onPaymentSuccess={handlePaymentSuccess}
                        onPaymentError={handlePaymentError}
                        onPaymentProcessing={handlePaymentProcessing}
                        disabled={paymentProcessing}
                        returnUrl={typeof window !== 'undefined' ? `${window.location.origin}/checkout/success` : '/checkout/success'}
                      />
                    </StripeProvider>
                  ) : error ? (
                    <div className="checkout-error">
                      <svg className="checkout-error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {error}
                    </div>
                  ) : (
                    <div className="checkout-loading">
                      <div className="checkout-spinner"></div>
                      <p>Setting up payment...</p>
                    </div>
                  )}
                </div>

                <div className="checkout-actions">
                  <button 
                    onClick={prevStep} 
                    className="checkout-btn-secondary"
                    disabled={paymentProcessing}
                  >
                    Back to Information
                  </button>
                </div>
              </div>
            )}


          </div>

          <div className="checkout-sidebar">
            <OrderSummary isCollapsible={isMobile} />
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}

export default CheckoutPage;