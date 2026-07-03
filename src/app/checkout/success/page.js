'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';

function CheckoutSuccessContent() {
  const t = useTranslations('CheckoutSuccess');
  const [orderDetails, setOrderDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const searchParams = useSearchParams();
  const router = useRouter();

  const paymentIntent = searchParams.get('payment_intent');
  const paymentIntentClientSecret = searchParams.get('payment_intent_client_secret');
  const redirectStatus = searchParams.get('redirect_status');

  useEffect(() => {
    if (paymentIntent && redirectStatus === 'succeeded') {
      fetchOrderDetails();
    } else if (redirectStatus === 'failed') {
      setError(t('paymentFailed'));
      setLoading(false);
    } else {
      setError(t('invalidStatus'));
      setLoading(false);
    }
  }, [paymentIntent, redirectStatus]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/payments/intent/${paymentIntent}`);
      const data = await res.json();
      
      if (data.status === 'success') {
        setOrderDetails(data.data);
      } else {
        setError(t('loadFailed'));
      }
    } catch (err) {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleContinueShopping = () => {
    router.push('/shop');
  };

  const handleViewOrder = () => {
    if (orderDetails?.metadata?.orderId) {
      router.push(`/orders/${orderDetails.metadata.orderId}`);
    }
  };

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="checkout-loading-page">
          <div className="checkout-spinner"></div>
          <p>{t('loadingDetails')}</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="checkout-container">
          <div className="checkout-error-page">
            <div className="checkout-error-icon">
              <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1>{t('paymentError')}</h1>
            <p>{error}</p>
            <div className="checkout-error-actions">
              <button onClick={() => router.push('/checkout')} className="checkout-btn-primary">
                {t('tryAgain')}
              </button>
              <button onClick={handleContinueShopping} className="checkout-btn-secondary">
                {t('continueShopping')}
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="aesop-page">
      <Header />
      <div className="checkout-container">
        <div className="checkout-success-page">
          <div className="checkout-success-icon">
            <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <h1>{t('paymentSuccessful')}</h1>
          <p className="checkout-success-message">
            {t('successMessage')}
          </p>

          {orderDetails && (
            <div className="checkout-success-details">
              <div className="checkout-success-card">
                <h3>{t('orderDetails')}</h3>
                <div className="checkout-success-info">
                  <div className="checkout-success-row">
                    <span>{t('paymentId')}</span>
                    <span>{orderDetails.paymentIntentId}</span>
                  </div>
                  <div className="checkout-success-row">
                    <span>{t('amount')}</span>
                    <span>${(orderDetails.amount / 100).toFixed(2)} {orderDetails.currency.toUpperCase()}</span>
                  </div>
                  <div className="checkout-success-row">
                    <span>{t('status')}</span>
                    <span className="checkout-success-status">{orderDetails.status}</span>
                  </div>
                  {orderDetails.metadata?.orderId && (
                    <div className="checkout-success-row">
                      <span>{t('orderId')}</span>
                      <span>{orderDetails.metadata.orderId}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="checkout-success-actions">
            {orderDetails?.metadata?.orderId && (
              <button onClick={handleViewOrder} className="checkout-btn-primary">
                {t('viewOrder')}
              </button>
            )}
            <button onClick={handleContinueShopping} className="checkout-btn-secondary">
              {t('continueShopping')}
            </button>
          </div>

          <div className="checkout-success-next-steps">
            <h3>{t('whatsNext')}</h3>
            <ul>
              <li>{t('nextStep1')}</li>
              <li>{t('nextStep2')}</li>
              <li>{t('nextStep3')}</li>
            </ul>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function CheckoutSuccessPage() {
  const t = useTranslations('CheckoutSuccess');
  return (
    <Suspense fallback={
      <div className="aesop-page">
        <Header />
        <div className="checkout-loading-page">
          <div className="checkout-spinner"></div>
          <p>{t('loading')}</p>
        </div>
        <Footer />
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}

export default CheckoutSuccessPage;