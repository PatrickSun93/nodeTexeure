'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../../../components/Header';
import Footer from '../../../../components/Footer';
import OrderStatusTimeline from '../../../../components/OrderStatusTimeline';
import { apiRequest } from '../../../../lib/api';
import { formatAddress } from '../../../orders/orderFormat';

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
      <OrderConfirmationContent />
    </Suspense>
  );
}

function OrderConfirmationContent() {
  const t = useTranslations('OrderConfirmation');
  const { data: session, status } = useSession();
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params.id;
  const sessionId = searchParams.get('session_id');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentVerified, setPaymentVerified] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    // Wait for the session to resolve so account orders are fetched with the owner's
    // token; guest orders resolve with no token via their unguessable link.
    if (status === 'loading') return;
    const authHeaders = session?.accessToken
      ? { Authorization: `Bearer ${session.accessToken}` }
      : {};

    const fetchOrder = async () => {
      try {
        // If returning from Stripe, verify the payment session
        if (sessionId) {
          try {
            const paymentData = await apiRequest(`/payments/session/${sessionId}`, { headers: authHeaders });
            if (paymentData?.status === 'SUCCESS') {
              setPaymentVerified(true);
            }
          } catch (e) {
            console.warn('Payment verification check failed:', e.message);
          }
        }

        const data = await apiRequest(`/orders/${orderId}`, { headers: authHeaders });
        if (data?.status === 'SUCCESS') {
          const extracted = data.keyValueTable?.order || data.keyValueTable;
          setOrder(extracted);
        } else {
          setError(t('errorOrderNotFound'));
        }
      } catch (err) {
        setError(err.message || t('failedToLoad'));
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderId, status, session]);

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <main className="nt-confirmation-page">
          <div className="aesop-container">
            <div className="nt-loading-state">
              <div className="aesop-loading-spinner"></div>
              <p>{t('loadingOrder')}</p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="aesop-page">
        <Header />
        <main className="nt-confirmation-page">
          <div className="aesop-container">
            <div className="nt-error-state">
              <h1>{t('orderNotFoundTitle')}</h1>
              <p>{error || t('orderNotFoundBody')}</p>
              <Link href="/shop" className="nt-btn nt-btn-primary">{t('continueShopping')}</Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const shippingAddr = formatAddress(order.shipping_address_json);
  const items = order.items || [];

  return (
    <div className="aesop-page">
      <Header />
      <main className="nt-confirmation-page">
        <div className="aesop-container">
          {/* Success Banner */}
          <div className="nt-confirmation-banner">
            <div className="nt-confirmation-icon">✓</div>
            <h1>{t('thankYou')}</h1>
            <p className="nt-order-number">{t('orderNumber', { number: order.order_number })}</p>
            <p className="nt-confirmation-sub">{t('confirmationEmail')}</p>
          </div>

          {/* Status Timeline */}
          <OrderStatusTimeline status={order.status} style={{ marginBottom: '3rem' }} />

          <div className="nt-confirmation-grid">
            {/* Order Items */}
            <div className="nt-confirmation-items">
              <h2>{t('orderItems')}</h2>
              <div className="nt-items-list">
                {items.map((item, idx) => (
                  <div key={idx} className="nt-order-item">
                    <div className="nt-item-image">
                      <img src={item.image_url || '/api/placeholder/80/80'} alt={item.product_name} />
                    </div>
                    <div className="nt-item-details">
                      <h4>{item.product_name}</h4>
                      <p>{t('qty', { quantity: item.quantity })}</p>
                    </div>
                    <div className="nt-item-price">${Number(item.total_price).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* Price Summary */}
              <div className="nt-price-summary">
                <div className="nt-price-row"><span>{t('subtotal')}</span><span>${Number(order.subtotal).toFixed(2)}</span></div>
                <div className="nt-price-row"><span>{t('tax')}</span><span>${Number(order.tax_amount).toFixed(2)}</span></div>
                <div className="nt-price-row"><span>{t('shipping')}</span><span>{Number(order.shipping_amount) === 0 ? t('free') : `$${Number(order.shipping_amount).toFixed(2)}`}</span></div>
                {Number(order.discount_amount) > 0 && (
                  <div className="nt-price-row nt-discount"><span>{t('discount')}</span><span>-${Number(order.discount_amount).toFixed(2)}</span></div>
                )}
                <div className="nt-price-row nt-price-total"><span>{t('total')}</span><span>${Number(order.total_amount).toFixed(2)}</span></div>
              </div>
            </div>

            {/* Shipping & Info */}
            <div className="nt-confirmation-sidebar">
              {shippingAddr && (
                <div className="nt-info-card">
                  <h3>{t('shippingAddress')}</h3>
                  {shippingAddr.name && <p>{shippingAddr.name}</p>}
                  {shippingAddr.lines.map((line, i) => <p key={i}>{line}</p>)}
                </div>
              )}

              {order.tracking_number && (
                <div className="nt-info-card">
                  <h3>{t('tracking')}</h3>
                  <p className="nt-tracking-number">{order.tracking_number}</p>
                </div>
              )}

              <div className="nt-info-card">
                <h3>{t('orderDate')}</h3>
                <p>{new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="nt-confirmation-actions">
            <Link href="/orders" className="nt-btn nt-btn-secondary">{t('viewAllOrders')}</Link>
            <Link href="/shop" className="nt-btn nt-btn-primary">{t('continueShopping')}</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
