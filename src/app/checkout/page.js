'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentCancelled = searchParams.get('cancelled') === 'true';

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');

  // Cart state
  const [cartItems, setCartItems] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [subtotal, setSubtotal] = useState(0);

  // Pricing
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [total, setTotal] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);

  // Shipping rates
  const [shippingRates, setShippingRates] = useState([]);
  const [selectedShipping, setSelectedShipping] = useState('');
  const [loadingRates, setLoadingRates] = useState(false);

  // Addresses
  const [shippingAddress, setShippingAddress] = useState({
    first_name: '', last_name: '', address_line_1: '', address_line_2: '',
    city: '', state: '', postal_code: '', country: 'US', phone: '',
  });
  const [billingAddress, setBillingAddress] = useState({
    first_name: '', last_name: '', address_line_1: '', address_line_2: '',
    city: '', state: '', postal_code: '', country: 'US', phone: '',
  });
  const [sameAsShipping, setSameAsShipping] = useState(true);

  // UI state
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1); // 1=info, 2=shipping, 3=payment
  const [pageLoading, setPageLoading] = useState(true);

  const [taxRate, setTaxRate] = useState(0.08875);

  // Check auth & fetch cart
  useEffect(() => {
    const init = async () => {
      try {
        const profileData = await apiRequest('/users/profile');
        if (profileData?.status === 'SUCCESS') {
          setIsLoggedIn(true);
          const kvt = profileData.keyValueTable || {};
          setShippingAddress(prev => ({
            ...prev,
            first_name: kvt.first_name || '',
            last_name: kvt.last_name || '',
          }));
        }
      } catch { setIsLoggedIn(false); }

      try {
        const cartData = await apiRequest('/cart');
        if (cartData?.status === 'SUCCESS') {
          const kvt = cartData.keyValueTable || {};
          setCartId(kvt.cartId || kvt.cart_id);
          const items = kvt.items || [];
          setCartItems(items);
          const sub = items.reduce((acc, item) => acc + (Number(item.price) || 0) * (item.quantity || 1), 0);
          setSubtotal(sub);
        }
      } catch (err) {
        console.error('Cart fetch error:', err);
      }
      setPageLoading(false);
    };
    init();
  }, []);

  // Fetch tax rate from backend when shipping address changes
  useEffect(() => {
    const fetchTaxRate = async () => {
      if (!shippingAddress.state && !shippingAddress.country) return;
      try {
        const data = await apiRequest('/orders/calculate-tax', {
          method: 'POST',
          body: JSON.stringify({
            stateCode: shippingAddress.state,
            countryCode: shippingAddress.country,
            subtotal: Math.max(0, subtotal - discount),
          }),
        });
        if (data?.status === 'SUCCESS') {
          const kvt = data.keyValueTable || {};
          setTaxRate(kvt.taxRate ?? 0.08875);
        }
      } catch { /* keep current rate */ }
    };
    fetchTaxRate();
  }, [shippingAddress.state, shippingAddress.country]);

  // Recalculate total
  useEffect(() => {
    const taxable = subtotal - discount;
    const newTax = Math.round(Math.max(0, taxable) * taxRate * 100) / 100;
    setTax(newTax);
    const freeShipping = subtotal >= 100;
    const shippingCost = freeShipping ? 0 : shipping;
    setTotal(subtotal + newTax + shippingCost - discount);
  }, [subtotal, discount, shipping, taxRate]);

  // Fetch shipping rates
  const fetchShippingRates = useCallback(async () => {
    if (!shippingAddress.postal_code || !shippingAddress.country) return;
    setLoadingRates(true);
    try {
      const data = await apiRequest('/shipping/rates', {
        method: 'POST',
        body: JSON.stringify({
          destination: {
            postalCode: shippingAddress.postal_code,
            countryCode: shippingAddress.country,
            stateOrProvinceCode: shippingAddress.state,
          },
          packages: [{ weight: { value: 2, units: 'LB' } }],
        }),
      });
      if (data?.status === 'SUCCESS') {
        const rates = data.keyValueTable?.rates || [];
        setShippingRates(rates);
        if (rates.length > 0 && !selectedShipping) {
          setSelectedShipping(rates[0].serviceType);
          setShipping(rates[0].rate);
        }
      }
    } catch (err) {
      // Fall back to default rates
      const defaultRates = [
        { serviceType: 'STANDARD', serviceName: 'Standard Shipping', rate: 9.99, estimatedDays: '5-7 business days' },
        { serviceType: 'EXPRESS', serviceName: 'Express Shipping', rate: 19.99, estimatedDays: '2-3 business days' },
        { serviceType: 'OVERNIGHT', serviceName: 'Overnight Shipping', rate: 34.99, estimatedDays: '1 business day' },
      ];
      setShippingRates(defaultRates);
      if (!selectedShipping) {
        setSelectedShipping('STANDARD');
        setShipping(9.99);
      }
    } finally {
      setLoadingRates(false);
    }
  }, [shippingAddress.postal_code, shippingAddress.country, shippingAddress.state, selectedShipping]);

  // Validate step
  const validateStep = (stepNum) => {
    const newErrors = {};

    if (stepNum === 1) {
      if (!isLoggedIn && !guestEmail) newErrors.guestEmail = 'Email is required';
      if (!isLoggedIn && guestEmail && !/\S+@\S+\.\S+/.test(guestEmail)) newErrors.guestEmail = 'Invalid email';
      if (!shippingAddress.first_name) newErrors.first_name = 'First name is required';
      if (!shippingAddress.last_name) newErrors.last_name = 'Last name is required';
      if (!shippingAddress.address_line_1) newErrors.address_line_1 = 'Address is required';
      if (!shippingAddress.city) newErrors.city = 'City is required';
      if (!shippingAddress.state) newErrors.state = 'State is required';
      if (!shippingAddress.postal_code) newErrors.postal_code = 'Postal code is required';
      if (!shippingAddress.country) newErrors.country = 'Country is required';

      if (!sameAsShipping) {
        if (!billingAddress.first_name) newErrors.billing_first_name = 'First name is required';
        if (!billingAddress.last_name) newErrors.billing_last_name = 'Last name is required';
        if (!billingAddress.address_line_1) newErrors.billing_address = 'Address is required';
        if (!billingAddress.city) newErrors.billing_city = 'City is required';
        if (!billingAddress.state) newErrors.billing_state = 'State is required';
        if (!billingAddress.postal_code) newErrors.billing_postal_code = 'Postal code is required';
      }
    }

    if (stepNum === 2) {
      if (!selectedShipping) newErrors.shipping = 'Please select a shipping method';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = async () => {
    if (!validateStep(step)) return;
    if (step === 1) {
      await fetchShippingRates();
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const data = await apiRequest('/orders/apply-coupon', {
        method: 'POST',
        body: JSON.stringify({ cartId, couponCode }),
      });
      if (data?.status === 'SUCCESS') {
        const d = data.keyValueTable?.discount ?? 0;
        setDiscount(d);
        setCouponApplied(true);
      }
    } catch (err) {
      setErrors(prev => ({ ...prev, coupon: err.message }));
    }
  };

  const handlePlaceOrder = async () => {
    if (!cartId || submitting) return;
    setSubmitting(true);
    setErrors({});

    try {
      const payload = {
        cartId,
        shippingAddress,
        billingAddress: sameAsShipping ? shippingAddress : billingAddress,
        couponCode: couponApplied ? couponCode : '',
        shippingMethod: selectedShipping,
        guestEmail: isLoggedIn ? null : guestEmail,
      };

      const data = await apiRequest('/orders/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (data?.status === 'SUCCESS') {
        const kvt = data.keyValueTable || {};
        const orderId = kvt.orderId || kvt.orderNumber;
        // Dispatch cart update event
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('cart:updated'));

        // Attempt Stripe Checkout redirect
        try {
          const paymentData = await apiRequest('/payments/create-checkout-session', {
            method: 'POST',
            body: JSON.stringify({ orderId }),
          });
          if (paymentData?.status === 'SUCCESS' && paymentData.keyValueTable?.url) {
            window.location.href = paymentData.keyValueTable.url;
            return;
          }
        } catch (stripeErr) {
          // Stripe not configured — fall through to confirmation page
          console.warn('Stripe checkout unavailable, proceeding to confirmation:', stripeErr.message);
        }

        // Fallback: go directly to confirmation (for when Stripe is not configured)
        router.push(`/order/confirmation/${orderId}`);
      } else {
        setErrors({ submit: data?.message || 'Order creation failed' });
      }
    } catch (err) {
      setErrors({ submit: err.message || 'Something went wrong' });
    } finally {
      setSubmitting(false);
    }
  };

  const updateShippingField = (field, value) => {
    setShippingAddress(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const updateBillingField = (field, value) => {
    setBillingAddress(prev => ({ ...prev, [field]: value }));
  };

  if (pageLoading) {
    return (
      <div className="aesop-page"><Header />
        <main className="nt-checkout-page"><div className="aesop-container">
          <div className="nt-loading-state"><div className="aesop-loading-spinner"></div><p>Loading checkout...</p></div>
        </div></main><Footer />
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="aesop-page"><Header />
        <main className="nt-checkout-page"><div className="aesop-container">
          <div className="nt-empty-state">
            <div className="nt-empty-icon">🛒</div><h2>Your cart is empty</h2>
            <p>Add items to your cart before checking out.</p>
            <Link href="/shop" className="nt-btn nt-btn-primary">Browse Products</Link>
          </div>
        </div></main><Footer />
      </div>
    );
  }

  const freeShipping = subtotal >= 100;

  return (
    <div className="aesop-page">
      <Header />
      <main className="nt-checkout-page">
        <div className="aesop-container">
          {/* Breadcrumb */}
          <nav className="nt-breadcrumb">
            <Link href="/">Home</Link><span className="nt-breadcrumb-sep">/</span>
            <Link href="/cart">Cart</Link><span className="nt-breadcrumb-sep">/</span>
            <span>Checkout</span>
          </nav>

          <h1 className="nt-page-title">Checkout</h1>

          {/* Progress Steps */}
          <div className="nt-checkout-steps">
            {['Information', 'Shipping', 'Payment'].map((label, idx) => (
              <div key={label} className={`nt-checkout-step ${step > idx ? 'nt-step-done' : ''} ${step === idx + 1 ? 'nt-step-active' : ''}`}>
                <div className="nt-step-number">{step > idx + 1 ? '✓' : idx + 1}</div>
                <span>{label}</span>
              </div>
            ))}
          </div>

          {paymentCancelled && <div className="nt-error-banner" style={{ backgroundColor: '#fef3cd', borderColor: '#ffc107', color: '#856404' }}>Payment was cancelled. You can try again when ready.</div>}
          {errors.submit && <div className="nt-error-banner">{errors.submit}</div>}

          <div className="nt-checkout-grid">
            {/* Left: Form */}
            <div className="nt-checkout-form">
              {/* Step 1: Information */}
              {step === 1 && (
                <div className="nt-checkout-section">
                  {!isLoggedIn && (
                    <div className="nt-form-section">
                      <h2>Contact Information</h2>
                      <p className="nt-form-hint">Already have an account? <Link href="/login?redirect=/checkout">Log in</Link></p>
                      <div className="nt-form-group">
                        <label>Email *</label>
                        <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                          placeholder="your@email.com" className={errors.guestEmail ? 'nt-input-error' : ''} />
                        {errors.guestEmail && <span className="nt-field-error">{errors.guestEmail}</span>}
                      </div>
                    </div>
                  )}

                  <div className="nt-form-section">
                    <h2>Shipping Address</h2>
                    <div className="nt-form-row">
                      <div className="nt-form-group">
                        <label>First Name *</label>
                        <input type="text" value={shippingAddress.first_name} onChange={e => updateShippingField('first_name', e.target.value)}
                          className={errors.first_name ? 'nt-input-error' : ''} />
                        {errors.first_name && <span className="nt-field-error">{errors.first_name}</span>}
                      </div>
                      <div className="nt-form-group">
                        <label>Last Name *</label>
                        <input type="text" value={shippingAddress.last_name} onChange={e => updateShippingField('last_name', e.target.value)}
                          className={errors.last_name ? 'nt-input-error' : ''} />
                        {errors.last_name && <span className="nt-field-error">{errors.last_name}</span>}
                      </div>
                    </div>
                    <div className="nt-form-group">
                      <label>Address *</label>
                      <input type="text" value={shippingAddress.address_line_1} onChange={e => updateShippingField('address_line_1', e.target.value)}
                        className={errors.address_line_1 ? 'nt-input-error' : ''} />
                      {errors.address_line_1 && <span className="nt-field-error">{errors.address_line_1}</span>}
                    </div>
                    <div className="nt-form-group">
                      <label>Apartment, suite, etc.</label>
                      <input type="text" value={shippingAddress.address_line_2} onChange={e => updateShippingField('address_line_2', e.target.value)} />
                    </div>
                    <div className="nt-form-row nt-form-row-3">
                      <div className="nt-form-group">
                        <label>City *</label>
                        <input type="text" value={shippingAddress.city} onChange={e => updateShippingField('city', e.target.value)}
                          className={errors.city ? 'nt-input-error' : ''} />
                        {errors.city && <span className="nt-field-error">{errors.city}</span>}
                      </div>
                      <div className="nt-form-group">
                        <label>State *</label>
                        <input type="text" value={shippingAddress.state} onChange={e => updateShippingField('state', e.target.value)}
                          className={errors.state ? 'nt-input-error' : ''} />
                        {errors.state && <span className="nt-field-error">{errors.state}</span>}
                      </div>
                      <div className="nt-form-group">
                        <label>Zip Code *</label>
                        <input type="text" value={shippingAddress.postal_code} onChange={e => updateShippingField('postal_code', e.target.value)}
                          className={errors.postal_code ? 'nt-input-error' : ''} />
                        {errors.postal_code && <span className="nt-field-error">{errors.postal_code}</span>}
                      </div>
                    </div>
                    <div className="nt-form-row">
                      <div className="nt-form-group">
                        <label>Country *</label>
                        <select value={shippingAddress.country} onChange={e => updateShippingField('country', e.target.value)}>
                          <option value="US">United States</option>
                          <option value="CA">Canada</option>
                          <option value="GB">United Kingdom</option>
                        </select>
                      </div>
                      <div className="nt-form-group">
                        <label>Phone</label>
                        <input type="tel" value={shippingAddress.phone} onChange={e => updateShippingField('phone', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Same as shipping toggle */}
                  <div className="nt-form-section">
                    <label className="nt-checkbox-label">
                      <input type="checkbox" checked={sameAsShipping} onChange={e => setSameAsShipping(e.target.checked)} />
                      <span>Billing address same as shipping</span>
                    </label>
                  </div>

                  {/* Billing Address (if different) */}
                  {!sameAsShipping && (
                    <div className="nt-form-section">
                      <h2>Billing Address</h2>
                      <div className="nt-form-row">
                        <div className="nt-form-group">
                          <label>First Name *</label>
                          <input type="text" value={billingAddress.first_name} onChange={e => updateBillingField('first_name', e.target.value)}
                            className={errors.billing_first_name ? 'nt-input-error' : ''} />
                        </div>
                        <div className="nt-form-group">
                          <label>Last Name *</label>
                          <input type="text" value={billingAddress.last_name} onChange={e => updateBillingField('last_name', e.target.value)}
                            className={errors.billing_last_name ? 'nt-input-error' : ''} />
                        </div>
                      </div>
                      <div className="nt-form-group">
                        <label>Address *</label>
                        <input type="text" value={billingAddress.address_line_1} onChange={e => updateBillingField('address_line_1', e.target.value)}
                          className={errors.billing_address ? 'nt-input-error' : ''} />
                      </div>
                      <div className="nt-form-row nt-form-row-3">
                        <div className="nt-form-group">
                          <label>City *</label>
                          <input type="text" value={billingAddress.city} onChange={e => updateBillingField('city', e.target.value)} />
                        </div>
                        <div className="nt-form-group">
                          <label>State *</label>
                          <input type="text" value={billingAddress.state} onChange={e => updateBillingField('state', e.target.value)} />
                        </div>
                        <div className="nt-form-group">
                          <label>Zip Code *</label>
                          <input type="text" value={billingAddress.postal_code} onChange={e => updateBillingField('postal_code', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  <button className="nt-btn nt-btn-primary nt-btn-full" onClick={handleNextStep}>
                    Continue to Shipping
                  </button>
                </div>
              )}

              {/* Step 2: Shipping */}
              {step === 2 && (
                <div className="nt-checkout-section">
                  <div className="nt-form-section">
                    <h2>Shipping Method</h2>
                    {freeShipping && (
                      <div className="nt-free-shipping-banner">🎉 You qualify for free shipping!</div>
                    )}
                    {loadingRates ? (
                      <div className="nt-loading-state"><div className="aesop-loading-spinner"></div></div>
                    ) : (
                      <div className="nt-shipping-options">
                        {shippingRates.map((rate) => (
                          <label key={rate.serviceType} className={`nt-shipping-option ${selectedShipping === rate.serviceType ? 'nt-option-selected' : ''}`}>
                            <input type="radio" name="shipping" value={rate.serviceType}
                              checked={selectedShipping === rate.serviceType}
                              onChange={() => { setSelectedShipping(rate.serviceType); setShipping(freeShipping ? 0 : rate.rate); }}
                            />
                            <div className="nt-option-details">
                              <span className="nt-option-name">{rate.serviceName}</span>
                              <span className="nt-option-est">{rate.estimatedDays || rate.estimatedDelivery}</span>
                            </div>
                            <span className="nt-option-price">{freeShipping ? 'Free' : `$${rate.rate.toFixed(2)}`}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {errors.shipping && <span className="nt-field-error">{errors.shipping}</span>}
                  </div>

                  <div className="nt-step-nav">
                    <button className="nt-btn nt-btn-secondary" onClick={() => setStep(1)}>← Back</button>
                    <button className="nt-btn nt-btn-primary" onClick={handleNextStep}>Continue to Payment</button>
                  </div>
                </div>
              )}

              {/* Step 3: Payment & Review */}
              {step === 3 && (
                <div className="nt-checkout-section">
                  <div className="nt-form-section">
                    <h2>Review & Pay</h2>

                    <div className="nt-review-summary">
                      <div className="nt-review-row">
                        <span className="nt-review-label">Ship to</span>
                        <span>{shippingAddress.first_name} {shippingAddress.last_name}, {shippingAddress.address_line_1}, {shippingAddress.city} {shippingAddress.state} {shippingAddress.postal_code}</span>
                        <button className="nt-change-btn" onClick={() => setStep(1)}>Change</button>
                      </div>
                      <div className="nt-review-row">
                        <span className="nt-review-label">Method</span>
                        <span>{shippingRates.find(r => r.serviceType === selectedShipping)?.serviceName || selectedShipping}</span>
                        <button className="nt-change-btn" onClick={() => setStep(2)}>Change</button>
                      </div>
                    </div>
                  </div>

                  {/* Coupon */}
                  <div className="nt-form-section">
                    <h3>Discount Code</h3>
                    <div className="nt-coupon-row">
                      <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)}
                        placeholder="Enter coupon code" disabled={couponApplied} />
                      <button className="nt-btn nt-btn-secondary" onClick={handleApplyCoupon} disabled={couponApplied}>
                        {couponApplied ? 'Applied ✓' : 'Apply'}
                      </button>
                    </div>
                    {errors.coupon && <span className="nt-field-error">{errors.coupon}</span>}
                  </div>

                  <div className="nt-form-section">
                    <p className="nt-payment-note">
                      💳 Payment will be processed securely. Your order will be created and you will receive a confirmation email.
                    </p>
                  </div>

                  <div className="nt-step-nav">
                    <button className="nt-btn nt-btn-secondary" onClick={() => setStep(2)}>← Back</button>
                    <button className="nt-btn nt-btn-primary nt-btn-lg" onClick={handlePlaceOrder} disabled={submitting}>
                      {submitting ? 'Processing...' : `Place Order — $${total.toFixed(2)}`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Order Summary */}
            <aside className="nt-checkout-summary">
              <h2>Order Summary</h2>
              <div className="nt-summary-items">
                {cartItems.map((item, idx) => (
                  <div key={idx} className="nt-summary-item">
                    <div className="nt-summary-item-image">
                      <img src={item.image || item.thumbnail_small_url || '/api/placeholder/60/60'} alt={item.name || item.product_name} />
                      <span className="nt-summary-item-qty">{item.quantity}</span>
                    </div>
                    <div className="nt-summary-item-info">
                      <span className="nt-summary-item-name">{item.name || item.product_name}</span>
                      {item.variant_name && <span className="nt-summary-item-variant">{item.variant_name}</span>}
                    </div>
                    <span className="nt-summary-item-price">${(Number(item.price) * (item.quantity || 1)).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="nt-summary-totals">
                <div className="nt-summary-row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="nt-summary-row"><span>Tax</span><span>${tax.toFixed(2)}</span></div>
                <div className="nt-summary-row">
                  <span>Shipping</span>
                  <span>{freeShipping ? 'Free' : shipping > 0 ? `$${shipping.toFixed(2)}` : '—'}</span>
                </div>
                {discount > 0 && (
                  <div className="nt-summary-row nt-discount"><span>Discount</span><span>-${discount.toFixed(2)}</span></div>
                )}
                <div className="nt-summary-row nt-summary-total">
                  <span>Total</span><span>${total.toFixed(2)}</span>
                </div>
              </div>

              {subtotal < 100 && (
                <div className="nt-free-shipping-hint">
                  Add ${(100 - subtotal).toFixed(2)} more for free shipping!
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}