'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

function CheckoutPage() {
  const [cartItems, setCartItems] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [subtotal, setSubtotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [shipping, setShipping] = useState(10); // Fixed shipping for now
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
  const [isLoggedIn, setIsLoggedIn] = useState(false); // TODO: Check auth
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [applyCouponLoading, setApplyCouponLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [sameAsBilling, setSameAsBilling] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchCart();
  }, []);

  const fetchCart = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/cart');
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
      
      const res = await fetch('/api/orders/apply-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cartId) return setError('Cart not found');
    
    try {
      setSubmitting(true);
      setError('');
      
      const payload = {
        cartId,
        shippingAddress,
        billingAddress: sameAsBilling ? shippingAddress : billingAddress,
        couponCode,
        guestEmail: isLoggedIn ? null : guestEmail
      };
      
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        router.push(`/order/confirmation/${data.data.orderId}`);
      } else {
        setError(data.message || 'Failed to create order');
      }
    } catch (err) {
      setError('Error processing order');
    } finally {
      setSubmitting(false);
    }
  };

  const updateTotal = () => {
    setTotal(subtotal + tax + shipping - discount);
  };

  useEffect(updateTotal, [subtotal, tax, shipping, discount]);

  // Step navigation
  const steps = [
    { id: 1, name: 'Information', description: 'Contact & Shipping' },
    { id: 2, name: 'Payment', description: 'Payment Method' },
    { id: 3, name: 'Review', description: 'Order Review' }
  ];

  const nextStep = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
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

  const OrderSummary = () => (
    <div className="checkout-summary">
      <h3 className="checkout-summary-title">Order Summary</h3>
      
      {loading ? (
        <div className="checkout-loading">
          <div className="checkout-spinner"></div>
          <p>Loading cart items...</p>
        </div>
      ) : (
        <>
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
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="checkout-total-row">
              <span>Shipping</span>
              <span>${shipping.toFixed(2)}</span>
            </div>
            <div className="checkout-total-row">
              <span>Tax</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="checkout-total-row checkout-discount">
                <span>Discount</span>
                <span>-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="checkout-total-row checkout-total-final">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="checkout-loading-page">
          <div className="checkout-spinner"></div>
          <p>Loading checkout...</p>
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
                  <div className="checkout-payment-placeholder">
                    <p>Payment integration will be implemented in a future task.</p>
                    <p>For now, you can proceed to review your order.</p>
                  </div>
                </div>

                <div className="checkout-actions">
                  <button onClick={prevStep} className="checkout-btn-secondary">
                    Back to Information
                  </button>
                  <button onClick={nextStep} className="checkout-btn-primary">
                    Continue to Review
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {currentStep === 3 && (
              <div className="checkout-step-content">
                <div className="checkout-section">
                  <h2 className="checkout-section-title">Order Review</h2>
                  
                  <div className="checkout-review-section">
                    <h3>Contact Information</h3>
                    <p>{isLoggedIn ? 'Logged in user' : guestEmail}</p>
                  </div>

                  <div className="checkout-review-section">
                    <h3>Shipping Address</h3>
                    <div className="checkout-address-display">
                      <p>{shippingAddress.first_name} {shippingAddress.last_name}</p>
                      <p>{shippingAddress.address_line_1}</p>
                      <p>{shippingAddress.city}, {shippingAddress.state} {shippingAddress.postal_code}</p>
                      <p>{shippingAddress.country}</p>
                      {shippingAddress.phone && <p>{shippingAddress.phone}</p>}
                    </div>
                  </div>

                  {!sameAsBilling && (
                    <div className="checkout-review-section">
                      <h3>Billing Address</h3>
                      <div className="checkout-address-display">
                        <p>{billingAddress.first_name} {billingAddress.last_name}</p>
                        <p>{billingAddress.address_line_1}</p>
                        <p>{billingAddress.city}, {billingAddress.state} {billingAddress.postal_code}</p>
                        <p>{billingAddress.country}</p>
                        {billingAddress.phone && <p>{billingAddress.phone}</p>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="checkout-actions">
                  <button onClick={prevStep} className="checkout-btn-secondary">
                    Back to Payment
                  </button>
                  <button 
                    onClick={handleSubmit} 
                    disabled={submitting}
                    className="checkout-btn-primary"
                  >
                    {submitting ? 'Placing Order...' : 'Place Order'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="checkout-sidebar">
            <OrderSummary />
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}

export default CheckoutPage;