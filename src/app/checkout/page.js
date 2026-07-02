'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

// Champagne & Charcoal theme overrides, scoped to the checkout route so the
// existing nt-* class markup (styled with legacy grays in checkout-orders.css)
// renders in the Noiraé palette without touching any component logic.
const CHECKOUT_STYLES = `
  .nt-checkout-page { background: var(--noirae-bg-cream); color: var(--noirae-text-primary); font-family: var(--noirae-font-sans); }

  .nt-checkout-page .nt-breadcrumb { color: var(--noirae-text-secondary); }
  .nt-checkout-page .nt-breadcrumb a { color: var(--noirae-text-muted); }
  .nt-checkout-page .nt-breadcrumb a:hover { color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-breadcrumb-sep { color: var(--noirae-border-dark); }

  .nt-checkout-page .nt-page-title { font-family: var(--noirae-font-serif); font-weight: 600; color: var(--noirae-text-primary); }

  /* Buttons */
  .nt-checkout-page .nt-btn { border-radius: 0; text-transform: uppercase; letter-spacing: 0.1em; font-family: var(--noirae-font-sans); }
  .nt-checkout-page .nt-btn-primary { background: var(--noirae-charcoal); color: var(--noirae-bg-cream); }
  .nt-checkout-page .nt-btn-primary:hover { background: var(--noirae-accent-gold); }
  .nt-checkout-page .nt-btn-primary:disabled { background: var(--noirae-text-muted); color: var(--noirae-bg-cream); }
  .nt-checkout-page .nt-btn-secondary { background: transparent; color: var(--noirae-text-primary); border: 1px solid var(--noirae-charcoal); }
  .nt-checkout-page .nt-btn-secondary:hover { background: var(--noirae-charcoal); color: var(--noirae-bg-cream); border-color: var(--noirae-charcoal); }
  .nt-checkout-page .nt-btn-secondary:disabled { color: var(--noirae-text-muted); border-color: var(--noirae-border-medium); }

  /* Loading / empty / error states */
  .nt-checkout-page .nt-loading-state { color: var(--noirae-text-secondary); }
  .nt-checkout-page .nt-empty-state h2 { font-family: var(--noirae-font-serif); color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-empty-state p { color: var(--noirae-text-secondary); }
  .nt-checkout-page .nt-error-banner { background: var(--noirae-error-bg); border-color: var(--noirae-error); color: var(--noirae-error); border-radius: 0; }

  /* Progress steps */
  .nt-checkout-page .nt-checkout-steps { border-bottom-color: var(--noirae-border-medium); }
  .nt-checkout-page .nt-checkout-step { color: var(--noirae-text-muted); }
  .nt-checkout-page .nt-checkout-step:not(:last-child)::after { color: var(--noirae-border-dark); }
  .nt-checkout-page .nt-checkout-step.nt-step-active { color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-checkout-step.nt-step-done { color: var(--noirae-success); }
  .nt-checkout-page .nt-step-number { border-color: var(--noirae-border-dark); color: var(--noirae-text-muted); }
  .nt-checkout-page .nt-step-active .nt-step-number { border-color: var(--noirae-charcoal); background: var(--noirae-charcoal); color: var(--noirae-bg-cream); }
  .nt-checkout-page .nt-step-done .nt-step-number { border-color: var(--noirae-success); background: var(--noirae-success); color: var(--noirae-bg-white); }

  /* Forms */
  .nt-checkout-page .nt-form-section h2 { font-family: var(--noirae-font-serif); color: var(--noirae-text-primary); font-size: 1.35rem; font-weight: 600; letter-spacing: 0; }
  .nt-checkout-page .nt-form-section h3 { font-family: var(--noirae-font-serif); color: var(--noirae-text-primary); font-size: 1.15rem; font-weight: 600; }
  .nt-checkout-page .nt-form-hint { color: var(--noirae-text-secondary); }
  .nt-checkout-page .nt-form-hint a { color: var(--noirae-accent-gold); text-decoration: none; border-bottom: 1px solid var(--noirae-accent-gold-light); }
  .nt-checkout-page .nt-form-group label { color: var(--noirae-text-muted); }
  .nt-checkout-page .nt-form-group input,
  .nt-checkout-page .nt-form-group select { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-dark); border-radius: 0; color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-form-group input:focus,
  .nt-checkout-page .nt-form-group select:focus { border-color: var(--noirae-accent-gold); }
  .nt-checkout-page input::placeholder { color: var(--noirae-text-muted); }
  .nt-checkout-page .nt-input-error { border-color: var(--noirae-error) !important; }
  .nt-checkout-page .nt-field-error { color: var(--noirae-error); }
  .nt-checkout-page .nt-checkbox-label { color: var(--noirae-text-secondary); }
  .nt-checkout-page .nt-checkbox-label input[type="checkbox"] { accent-color: var(--noirae-accent-gold); }

  /* Shipping options */
  .nt-checkout-page .nt-shipping-option { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-dark); border-radius: 0; }
  .nt-checkout-page .nt-shipping-option:hover { border-color: var(--noirae-text-muted); }
  .nt-checkout-page .nt-shipping-option.nt-option-selected { border-color: var(--noirae-charcoal); background: var(--noirae-bg-light-gray); }
  .nt-checkout-page .nt-shipping-option input[type="radio"] { accent-color: var(--noirae-accent-gold); }
  .nt-checkout-page .nt-option-name { color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-option-est { color: var(--noirae-text-secondary); }
  .nt-checkout-page .nt-option-price { color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-free-shipping-banner { background: var(--noirae-success-bg); border-color: var(--noirae-success); color: var(--noirae-success); border-radius: 0; }

  /* Review & coupon */
  .nt-checkout-page .nt-review-summary { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); border-radius: 0; }
  .nt-checkout-page .nt-review-row { border-bottom-color: var(--noirae-border-light); color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-review-label { color: var(--noirae-text-muted); }
  .nt-checkout-page .nt-change-btn { color: var(--noirae-text-secondary); }
  .nt-checkout-page .nt-change-btn:hover { color: var(--noirae-accent-gold); }
  .nt-checkout-page .nt-coupon-row input { background: var(--noirae-bg-cream); border: 1px solid var(--noirae-border-dark); border-radius: 0; color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-coupon-row input:focus { border-color: var(--noirae-accent-gold); outline: none; }
  .nt-checkout-page .nt-payment-note { background: var(--noirae-bg-light-gray); border: 1px solid var(--noirae-border-medium); border-radius: 0; color: var(--noirae-text-secondary); }

  /* Order summary sidebar */
  .nt-checkout-page .nt-checkout-summary { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); border-radius: 0; }
  .nt-checkout-page .nt-checkout-summary h2 { font-family: var(--noirae-font-serif); font-size: 1.25rem; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-summary-items { border-bottom-color: var(--noirae-border-medium); }
  .nt-checkout-page .nt-summary-item-image { border: 1px solid var(--noirae-border-dark); border-radius: 0; background: var(--noirae-bg-sand); }
  .nt-checkout-page .nt-summary-item-qty { background: var(--noirae-text-secondary); color: var(--noirae-bg-cream); }
  .nt-checkout-page .nt-summary-item-name { color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-summary-item-variant { color: var(--noirae-text-muted); }
  .nt-checkout-page .nt-summary-item-price { color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-summary-row { color: var(--noirae-text-secondary); }
  .nt-checkout-page .nt-summary-row span:last-child { color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-summary-row.nt-discount span:last-child { color: var(--noirae-success); }
  .nt-checkout-page .nt-summary-row.nt-summary-total { border-top-color: var(--noirae-border-medium); align-items: baseline; color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-summary-row.nt-summary-total span:last-child { font-family: var(--noirae-font-serif); font-size: 1.75rem; font-weight: 600; color: var(--noirae-text-primary); }
  .nt-checkout-page .nt-free-shipping-hint { background: var(--noirae-warning-bg); border-color: var(--noirae-warning); color: var(--noirae-warning); border-radius: 0; }
`;

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const t = useTranslations('Checkout');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const paymentCancelled = searchParams.get('cancelled') === 'true';

  // When signed in, forward the bearer token so the cart/profile/order tie to the
  // account (all these routes are protectOptional — no token just means guest).
  const authHeaders = session?.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : {};

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
        const profileData = await apiRequest('/users/profile', { headers: authHeaders });
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
        const cartData = await apiRequest('/cart', { headers: authHeaders });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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
        { serviceType: 'STANDARD', serviceName: t('shipStandard'), rate: 9.99, estimatedDays: t('shipStandardEst') },
        { serviceType: 'EXPRESS', serviceName: t('shipExpress'), rate: 19.99, estimatedDays: t('shipExpressEst') },
        { serviceType: 'OVERNIGHT', serviceName: t('shipOvernight'), rate: 34.99, estimatedDays: t('shipOvernightEst') },
      ];
      setShippingRates(defaultRates);
      if (!selectedShipping) {
        setSelectedShipping('STANDARD');
        setShipping(9.99);
      }
    } finally {
      setLoadingRates(false);
    }
  }, [shippingAddress.postal_code, shippingAddress.country, shippingAddress.state, selectedShipping, t]);

  // Validate step
  const validateStep = (stepNum) => {
    const newErrors = {};

    if (stepNum === 1) {
      if (!isLoggedIn && !guestEmail) newErrors.guestEmail = t('errEmailRequired');
      if (!isLoggedIn && guestEmail && !/\S+@\S+\.\S+/.test(guestEmail)) newErrors.guestEmail = t('errEmailInvalid');
      if (!shippingAddress.first_name) newErrors.first_name = t('errFirstNameRequired');
      if (!shippingAddress.last_name) newErrors.last_name = t('errLastNameRequired');
      if (!shippingAddress.address_line_1) newErrors.address_line_1 = t('errAddressRequired');
      if (!shippingAddress.city) newErrors.city = t('errCityRequired');
      if (!shippingAddress.state) newErrors.state = t('errStateRequired');
      if (!shippingAddress.postal_code) newErrors.postal_code = t('errPostalCodeRequired');
      if (!shippingAddress.country) newErrors.country = t('errCountryRequired');

      if (!sameAsShipping) {
        if (!billingAddress.first_name) newErrors.billing_first_name = t('errFirstNameRequired');
        if (!billingAddress.last_name) newErrors.billing_last_name = t('errLastNameRequired');
        if (!billingAddress.address_line_1) newErrors.billing_address = t('errAddressRequired');
        if (!billingAddress.city) newErrors.billing_city = t('errCityRequired');
        if (!billingAddress.state) newErrors.billing_state = t('errStateRequired');
        if (!billingAddress.postal_code) newErrors.billing_postal_code = t('errPostalCodeRequired');
      }
    }

    if (stepNum === 2) {
      if (!selectedShipping) newErrors.shipping = t('errShippingRequired');
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
        headers: authHeaders,
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
            headers: authHeaders,
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
        setErrors({ submit: data?.message || t('errOrderCreationFailed') });
      }
    } catch (err) {
      setErrors({ submit: err.message || t('errSomethingWrong') });
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
        <style>{CHECKOUT_STYLES}</style>
        <main className="nt-checkout-page"><div className="aesop-container">
          <div className="nt-loading-state"><div className="aesop-loading-spinner"></div><p>{t('loading')}</p></div>
        </div></main><Footer />
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="aesop-page"><Header />
        <style>{CHECKOUT_STYLES}</style>
        <main className="nt-checkout-page"><div className="aesop-container">
          <div className="nt-empty-state">
            <div className="nt-empty-icon">🛒</div><h2>{t('emptyTitle')}</h2>
            <p>{t('emptyDesc')}</p>
            <Link href="/shop" className="nt-btn nt-btn-primary">{t('browseProducts')}</Link>
          </div>
        </div></main><Footer />
      </div>
    );
  }

  const freeShipping = subtotal >= 100;

  return (
    <div className="aesop-page">
      <Header />
      <style>{CHECKOUT_STYLES}</style>
      <main className="nt-checkout-page">
        <div className="aesop-container">
          {/* Breadcrumb */}
          <nav className="nt-breadcrumb">
            <Link href="/">{t('breadcrumbHome')}</Link><span className="nt-breadcrumb-sep">/</span>
            <Link href="/cart">{t('breadcrumbCart')}</Link><span className="nt-breadcrumb-sep">/</span>
            <span>{t('breadcrumbCheckout')}</span>
          </nav>

          <h1 className="nt-page-title">{t('title')}</h1>

          {/* Progress Steps */}
          <div className="nt-checkout-steps">
            {['stepInformation', 'stepShipping', 'stepPayment'].map((stepKey, idx) => (
              <div key={stepKey} className={`nt-checkout-step ${step > idx ? 'nt-step-done' : ''} ${step === idx + 1 ? 'nt-step-active' : ''}`}>
                <div className="nt-step-number">{step > idx + 1 ? '✓' : idx + 1}</div>
                <span>{t(stepKey)}</span>
              </div>
            ))}
          </div>

          {paymentCancelled && <div className="nt-error-banner" style={{ backgroundColor: 'var(--noirae-warning-bg)', borderColor: 'var(--noirae-warning)', color: 'var(--noirae-warning)' }}>{t('paymentCancelled')}</div>}
          {errors.submit && <div className="nt-error-banner">{errors.submit}</div>}

          <div className="nt-checkout-grid">
            {/* Left: Form */}
            <div className="nt-checkout-form">
              {/* Step 1: Information */}
              {step === 1 && (
                <div className="nt-checkout-section">
                  {!isLoggedIn && (
                    <div className="nt-form-section">
                      <h2>{t('contactInfo')}</h2>
                      <p className="nt-form-hint">{t('alreadyHaveAccount')} <Link href="/signin?redirect=/checkout">{t('logIn')}</Link></p>
                      <div className="nt-form-group">
                        <label>{t('email')} *</label>
                        <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                          placeholder={t('emailPlaceholder')} className={errors.guestEmail ? 'nt-input-error' : ''} />
                        {errors.guestEmail && <span className="nt-field-error">{errors.guestEmail}</span>}
                      </div>
                    </div>
                  )}

                  <div className="nt-form-section">
                    <h2>{t('shippingAddress')}</h2>
                    <div className="nt-form-row">
                      <div className="nt-form-group">
                        <label>{t('firstName')} *</label>
                        <input type="text" value={shippingAddress.first_name} onChange={e => updateShippingField('first_name', e.target.value)}
                          className={errors.first_name ? 'nt-input-error' : ''} />
                        {errors.first_name && <span className="nt-field-error">{errors.first_name}</span>}
                      </div>
                      <div className="nt-form-group">
                        <label>{t('lastName')} *</label>
                        <input type="text" value={shippingAddress.last_name} onChange={e => updateShippingField('last_name', e.target.value)}
                          className={errors.last_name ? 'nt-input-error' : ''} />
                        {errors.last_name && <span className="nt-field-error">{errors.last_name}</span>}
                      </div>
                    </div>
                    <div className="nt-form-group">
                      <label>{t('address')} *</label>
                      <input type="text" value={shippingAddress.address_line_1} onChange={e => updateShippingField('address_line_1', e.target.value)}
                        className={errors.address_line_1 ? 'nt-input-error' : ''} />
                      {errors.address_line_1 && <span className="nt-field-error">{errors.address_line_1}</span>}
                    </div>
                    <div className="nt-form-group">
                      <label>{t('apartment')}</label>
                      <input type="text" value={shippingAddress.address_line_2} onChange={e => updateShippingField('address_line_2', e.target.value)} />
                    </div>
                    <div className="nt-form-row nt-form-row-3">
                      <div className="nt-form-group">
                        <label>{t('city')} *</label>
                        <input type="text" value={shippingAddress.city} onChange={e => updateShippingField('city', e.target.value)}
                          className={errors.city ? 'nt-input-error' : ''} />
                        {errors.city && <span className="nt-field-error">{errors.city}</span>}
                      </div>
                      <div className="nt-form-group">
                        <label>{t('state')} *</label>
                        <input type="text" value={shippingAddress.state} onChange={e => updateShippingField('state', e.target.value)}
                          className={errors.state ? 'nt-input-error' : ''} />
                        {errors.state && <span className="nt-field-error">{errors.state}</span>}
                      </div>
                      <div className="nt-form-group">
                        <label>{t('zipCode')} *</label>
                        <input type="text" value={shippingAddress.postal_code} onChange={e => updateShippingField('postal_code', e.target.value)}
                          className={errors.postal_code ? 'nt-input-error' : ''} />
                        {errors.postal_code && <span className="nt-field-error">{errors.postal_code}</span>}
                      </div>
                    </div>
                    <div className="nt-form-row">
                      <div className="nt-form-group">
                        <label>{t('country')} *</label>
                        <select value={shippingAddress.country} onChange={e => updateShippingField('country', e.target.value)}>
                          <option value="US">{t('countryUS')}</option>
                          <option value="CA">{t('countryCA')}</option>
                          <option value="GB">{t('countryGB')}</option>
                        </select>
                      </div>
                      <div className="nt-form-group">
                        <label>{t('phone')}</label>
                        <input type="tel" value={shippingAddress.phone} onChange={e => updateShippingField('phone', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Same as shipping toggle */}
                  <div className="nt-form-section">
                    <label className="nt-checkbox-label">
                      <input type="checkbox" checked={sameAsShipping} onChange={e => setSameAsShipping(e.target.checked)} />
                      <span>{t('billingSameAsShipping')}</span>
                    </label>
                  </div>

                  {/* Billing Address (if different) */}
                  {!sameAsShipping && (
                    <div className="nt-form-section">
                      <h2>{t('billingAddress')}</h2>
                      <div className="nt-form-row">
                        <div className="nt-form-group">
                          <label>{t('firstName')} *</label>
                          <input type="text" value={billingAddress.first_name} onChange={e => updateBillingField('first_name', e.target.value)}
                            className={errors.billing_first_name ? 'nt-input-error' : ''} />
                        </div>
                        <div className="nt-form-group">
                          <label>{t('lastName')} *</label>
                          <input type="text" value={billingAddress.last_name} onChange={e => updateBillingField('last_name', e.target.value)}
                            className={errors.billing_last_name ? 'nt-input-error' : ''} />
                        </div>
                      </div>
                      <div className="nt-form-group">
                        <label>{t('address')} *</label>
                        <input type="text" value={billingAddress.address_line_1} onChange={e => updateBillingField('address_line_1', e.target.value)}
                          className={errors.billing_address ? 'nt-input-error' : ''} />
                      </div>
                      <div className="nt-form-row nt-form-row-3">
                        <div className="nt-form-group">
                          <label>{t('city')} *</label>
                          <input type="text" value={billingAddress.city} onChange={e => updateBillingField('city', e.target.value)} />
                        </div>
                        <div className="nt-form-group">
                          <label>{t('state')} *</label>
                          <input type="text" value={billingAddress.state} onChange={e => updateBillingField('state', e.target.value)} />
                        </div>
                        <div className="nt-form-group">
                          <label>{t('zipCode')} *</label>
                          <input type="text" value={billingAddress.postal_code} onChange={e => updateBillingField('postal_code', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  <button className="nt-btn nt-btn-primary nt-btn-full" onClick={handleNextStep}>
                    {t('continueToShipping')}
                  </button>
                </div>
              )}

              {/* Step 2: Shipping */}
              {step === 2 && (
                <div className="nt-checkout-section">
                  <div className="nt-form-section">
                    <h2>{t('shippingMethod')}</h2>
                    {freeShipping && (
                      <div className="nt-free-shipping-banner">🎉 {t('freeShippingQualify')}</div>
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
                            <span className="nt-option-price">{freeShipping ? t('free') : `$${rate.rate.toFixed(2)}`}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {errors.shipping && <span className="nt-field-error">{errors.shipping}</span>}
                  </div>

                  <div className="nt-step-nav">
                    <button className="nt-btn nt-btn-secondary" onClick={() => setStep(1)}>← {t('back')}</button>
                    <button className="nt-btn nt-btn-primary" onClick={handleNextStep}>{t('continueToPayment')}</button>
                  </div>
                </div>
              )}

              {/* Step 3: Payment & Review */}
              {step === 3 && (
                <div className="nt-checkout-section">
                  <div className="nt-form-section">
                    <h2>{t('reviewAndPay')}</h2>

                    <div className="nt-review-summary">
                      <div className="nt-review-row">
                        <span className="nt-review-label">{t('shipTo')}</span>
                        <span>{shippingAddress.first_name} {shippingAddress.last_name}, {shippingAddress.address_line_1}, {shippingAddress.city} {shippingAddress.state} {shippingAddress.postal_code}</span>
                        <button className="nt-change-btn" onClick={() => setStep(1)}>{t('change')}</button>
                      </div>
                      <div className="nt-review-row">
                        <span className="nt-review-label">{t('method')}</span>
                        <span>{shippingRates.find(r => r.serviceType === selectedShipping)?.serviceName || selectedShipping}</span>
                        <button className="nt-change-btn" onClick={() => setStep(2)}>{t('change')}</button>
                      </div>
                    </div>
                  </div>

                  {/* Coupon */}
                  <div className="nt-form-section">
                    <h3>{t('discountCode')}</h3>
                    <div className="nt-coupon-row">
                      <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)}
                        placeholder={t('couponPlaceholder')} disabled={couponApplied} />
                      <button className="nt-btn nt-btn-secondary" onClick={handleApplyCoupon} disabled={couponApplied}>
                        {couponApplied ? t('applied') : t('apply')}
                      </button>
                    </div>
                    {errors.coupon && <span className="nt-field-error">{errors.coupon}</span>}
                  </div>

                  <div className="nt-form-section">
                    <p className="nt-payment-note">
                      💳 {t('paymentNote')}
                    </p>
                  </div>

                  <div className="nt-step-nav">
                    <button className="nt-btn nt-btn-secondary" onClick={() => setStep(2)}>← {t('back')}</button>
                    <button className="nt-btn nt-btn-primary nt-btn-lg" onClick={handlePlaceOrder} disabled={submitting}>
                      {submitting ? t('processing') : t('placeOrder', { amount: total.toFixed(2) })}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Order Summary */}
            <aside className="nt-checkout-summary">
              <h2>{t('orderSummary')}</h2>
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
                <div className="nt-summary-row"><span>{t('subtotal')}</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="nt-summary-row"><span>{t('tax')}</span><span>${tax.toFixed(2)}</span></div>
                <div className="nt-summary-row">
                  <span>{t('shipping')}</span>
                  <span>{freeShipping ? t('free') : shipping > 0 ? `$${shipping.toFixed(2)}` : '—'}</span>
                </div>
                {discount > 0 && (
                  <div className="nt-summary-row nt-discount"><span>{t('discount')}</span><span>-${discount.toFixed(2)}</span></div>
                )}
                <div className="nt-summary-row nt-summary-total">
                  <span>{t('total')}</span><span>${total.toFixed(2)}</span>
                </div>
              </div>

              {subtotal < 100 && (
                <div className="nt-free-shipping-hint">
                  {t('freeShippingHint', { amount: (100 - subtotal).toFixed(2) })}
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