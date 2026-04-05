'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

const STATUS_COLORS = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  processing: '#8b5cf6',
  shipped: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
  refunded: '#6b7280',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const data = await apiRequest('/orders/my-orders');
        if (data?.status === 'SUCCESS') {
          const extracted = data.keyValueTable?.orders || [];
          setOrders(extracted);
        }
      } catch (err) {
        if (err.message?.includes('401') || err.message?.includes('Unauthorized') || err.message?.includes('Not authorized') || err.message?.includes('no token')) {
          router.push('/signin?redirect=/orders');
          return;
        }
        setError(err.message || 'Failed to load orders');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [router]);

  return (
    <div className="aesop-page">
      <Header />
      <main className="nt-orders-page">
        <div className="aesop-container">
          {/* Breadcrumb */}
          <nav className="nt-breadcrumb">
            <Link href="/">Home</Link>
            <span className="nt-breadcrumb-sep">/</span>
            <span>My Orders</span>
          </nav>

          <h1 className="nt-page-title">My Orders</h1>

          {loading ? (
            <div className="nt-loading-state">
              <div className="aesop-loading-spinner"></div>
              <p>Loading your orders...</p>
            </div>
          ) : error ? (
            <div className="nt-error-state">
              <p>{error}</p>
              <Link href="/shop" className="nt-btn nt-btn-primary">Continue Shopping</Link>
            </div>
          ) : orders.length === 0 ? (
            <div className="nt-empty-state">
              <div className="nt-empty-icon">📦</div>
              <h2>No orders yet</h2>
              <p>When you place an order, it will appear here.</p>
              <Link href="/shop" className="nt-btn nt-btn-primary">Start Shopping</Link>
            </div>
          ) : (
            <div className="nt-orders-list">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/order/confirmation/${order.id}`}
                  className="nt-order-card"
                >
                  <div className="nt-order-card-header">
                    <div>
                      <span className="nt-order-card-number">#{order.order_number}</span>
                      <span className="nt-order-card-date">
                        {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <span
                      className="nt-status-badge"
                      style={{ backgroundColor: STATUS_COLORS[order.status] || '#6b7280' }}
                    >
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </div>
                  <div className="nt-order-card-body">
                    <div className="nt-order-card-total">
                      <span className="nt-order-card-label">Total</span>
                      <span className="nt-order-card-amount">${Number(order.total_amount).toFixed(2)}</span>
                    </div>
                    {order.tracking_number && (
                      <div className="nt-order-card-tracking">
                        <span className="nt-order-card-label">Tracking</span>
                        <span>{order.tracking_number}</span>
                      </div>
                    )}
                  </div>
                  <div className="nt-order-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="nt-view-details">View Details →</span>
                    {order.status === 'delivered' && (
                      <Link
                        href={`/returns/request/${order.id || order.order_number}`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: '0.8rem', color: '#dc2626', textDecoration: 'none' }}
                      >
                        Request Return
                      </Link>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
