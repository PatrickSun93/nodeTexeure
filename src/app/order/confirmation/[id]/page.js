'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../../../components/Header';
import Footer from '../../../../components/Footer';
import { apiRequest } from '../../../../lib/api';

const STATUS_STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

function getStatusIndex(status) {
  const idx = STATUS_STEPS.indexOf(status);
  return idx >= 0 ? idx : 0;
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
      <OrderConfirmationContent />
    </Suspense>
  );
}

function OrderConfirmationContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params.id;
  const sessionId = searchParams.get('session_id');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentVerified, setPaymentVerified] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        // If returning from Stripe, verify the payment session
        if (sessionId) {
          try {
            const paymentData = await apiRequest(`/payments/session/${sessionId}`);
            if (paymentData?.status === 'SUCCESS') {
              setPaymentVerified(true);
            }
          } catch (e) {
            console.warn('Payment verification check failed:', e.message);
          }
        }

        const data = await apiRequest(`/orders/${orderId}`);
        if (data?.status === 'SUCCESS') {
          const extracted = data.keyValueTable?.order || data.keyValueTable;
          setOrder(extracted);
        } else {
          setError('Order not found');
        }
      } catch (err) {
        setError(err.message || 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };
    if (orderId) fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <main className="nt-confirmation-page">
          <div className="aesop-container">
            <div className="nt-loading-state">
              <div className="aesop-loading-spinner"></div>
              <p>Loading your order...</p>
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
              <h1>Order Not Found</h1>
              <p>{error || 'We could not find this order.'}</p>
              <Link href="/shop" className="nt-btn nt-btn-primary">Continue Shopping</Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const shippingAddr = typeof order.shipping_address_json === 'string'
    ? JSON.parse(order.shipping_address_json)
    : order.shipping_address_json || {};

  const statusIdx = getStatusIndex(order.status);
  const items = order.items || [];

  return (
    <div className="aesop-page">
      <Header />
      <main className="nt-confirmation-page">
        <div className="aesop-container">
          {/* Success Banner */}
          <div className="nt-confirmation-banner">
            <div className="nt-confirmation-icon">✓</div>
            <h1>Thank You for Your Order!</h1>
            <p className="nt-order-number">Order #{order.order_number}</p>
            <p className="nt-confirmation-sub">A confirmation email has been sent to your email address.</p>
          </div>

          {/* Status Timeline */}
          <div className="nt-status-timeline">
            {STATUS_STEPS.map((step, idx) => (
              <div key={step} className={`nt-timeline-step ${idx <= statusIdx ? 'nt-step-active' : ''} ${idx === statusIdx ? 'nt-step-current' : ''}`}>
                <div className="nt-timeline-dot">{idx < statusIdx ? '✓' : idx + 1}</div>
                <span className="nt-timeline-label">{step.charAt(0).toUpperCase() + step.slice(1)}</span>
              </div>
            ))}
          </div>

          <div className="nt-confirmation-grid">
            {/* Order Items */}
            <div className="nt-confirmation-items">
              <h2>Order Items</h2>
              <div className="nt-items-list">
                {items.map((item, idx) => (
                  <div key={idx} className="nt-order-item">
                    <div className="nt-item-image">
                      <img src={item.image_url || '/api/placeholder/80/80'} alt={item.product_name} />
                    </div>
                    <div className="nt-item-details">
                      <h4>{item.product_name}</h4>
                      <p>Qty: {item.quantity}</p>
                    </div>
                    <div className="nt-item-price">${Number(item.total_price).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* Price Summary */}
              <div className="nt-price-summary">
                <div className="nt-price-row"><span>Subtotal</span><span>${Number(order.subtotal).toFixed(2)}</span></div>
                <div className="nt-price-row"><span>Tax</span><span>${Number(order.tax_amount).toFixed(2)}</span></div>
                <div className="nt-price-row"><span>Shipping</span><span>{Number(order.shipping_amount) === 0 ? 'Free' : `$${Number(order.shipping_amount).toFixed(2)}`}</span></div>
                {Number(order.discount_amount) > 0 && (
                  <div className="nt-price-row nt-discount"><span>Discount</span><span>-${Number(order.discount_amount).toFixed(2)}</span></div>
                )}
                <div className="nt-price-row nt-price-total"><span>Total</span><span>${Number(order.total_amount).toFixed(2)}</span></div>
              </div>
            </div>

            {/* Shipping & Info */}
            <div className="nt-confirmation-sidebar">
              <div className="nt-info-card">
                <h3>Shipping Address</h3>
                <p>{shippingAddr.first_name} {shippingAddr.last_name}</p>
                <p>{shippingAddr.address_line_1}</p>
                {shippingAddr.address_line_2 && <p>{shippingAddr.address_line_2}</p>}
                <p>{shippingAddr.city}, {shippingAddr.state} {shippingAddr.postal_code}</p>
                <p>{shippingAddr.country}</p>
              </div>

              {order.tracking_number && (
                <div className="nt-info-card">
                  <h3>Tracking</h3>
                  <p className="nt-tracking-number">{order.tracking_number}</p>
                </div>
              )}

              <div className="nt-info-card">
                <h3>Order Date</h3>
                <p>{new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="nt-confirmation-actions">
            <Link href="/orders" className="nt-btn nt-btn-secondary">View All Orders</Link>
            <Link href="/shop" className="nt-btn nt-btn-primary">Continue Shopping</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
