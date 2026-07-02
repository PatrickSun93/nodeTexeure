'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

// Champagne & Charcoal semantic status colors (hex mirrors of --noirae-* tokens
// so we can derive a soft tinted pill background via alpha concatenation)
const STATUS_COLORS = {
  pending: '#8C7A3F',    // --noirae-warning
  confirmed: '#4A5578',  // --noirae-info
  processing: '#4A5578', // --noirae-info
  shipped: '#A8863F',    // --noirae-accent-gold
  delivered: '#4A7A46',  // --noirae-success
  cancelled: '#B5654D',  // --noirae-error
  refunded: '#9C9284',   // --noirae-text-muted
};

export default function OrdersPage() {
  const t = useTranslations('Orders');
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/signin?redirect=/orders');
      return;
    }
    const fetchOrders = async () => {
      try {
        const data = await apiRequest('/orders/my-orders', {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
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
  }, [status, session, router]);

  return (
    <div className="aesop-page" style={{ background: 'var(--noirae-bg-cream)', minHeight: '100vh' }}>
      <Header />
      <main className="nt-orders-page">
        <style>{`
          .nt-orders-page{background:var(--noirae-bg-cream);font-family:var(--noirae-font-sans);padding:44px 0 72px;}
          .nt-orders-page .aesop-container{max-width:1040px;align-items:stretch;}
          .nt-orders-page .nt-breadcrumb{color:var(--noirae-text-muted);font-size:12px;letter-spacing:0.04em;}
          .nt-orders-page .nt-breadcrumb a{color:var(--noirae-text-secondary);transition:color .2s ease;}
          .nt-orders-page .nt-breadcrumb a:hover{color:var(--noirae-accent-gold);}
          .nt-orders-page .nt-breadcrumb-sep{color:var(--noirae-border-dark);}
          .nt-orders-page .nt-page-title{font-family:var(--noirae-font-serif);font-weight:500;font-size:38px;letter-spacing:-0.01em;color:var(--noirae-text-primary);margin:6px 0 30px;}
          .nt-orders-page .nt-orders-list{gap:20px;}
          .nt-orders-page .nt-order-card{background:var(--noirae-bg-white);border:1px solid var(--noirae-border-medium);border-radius:0;padding:0;transition:border-color .25s ease,box-shadow .25s ease;}
          .nt-orders-page .nt-order-card:hover{border-color:var(--noirae-border-dark);box-shadow:0 6px 22px rgba(42,38,33,0.07);}
          .nt-orders-page .nt-order-card-header{margin:0;padding:18px 24px;border-bottom:1px solid var(--noirae-border-light);gap:12px;flex-wrap:wrap;}
          .nt-orders-page .nt-order-card-number{font-family:var(--noirae-font-sans);font-size:14px;font-weight:500;color:var(--noirae-text-primary);margin-right:14px;letter-spacing:0.01em;}
          .nt-orders-page .nt-order-card-date{font-size:12px;color:var(--noirae-text-muted);letter-spacing:0.02em;}
          .nt-orders-page .nt-status-badge{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:30px;font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;}
          .nt-orders-page .nt-status-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
          .nt-orders-page .nt-order-card-body{gap:44px;margin:0;padding:20px 24px;}
          .nt-orders-page .nt-order-card-label{font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--noirae-text-muted);margin-bottom:4px;}
          .nt-orders-page .nt-order-card-amount{font-size:14px;font-weight:500;color:var(--noirae-text-primary);}
          .nt-orders-page .nt-order-card-tracking span:last-child{font-size:14px;color:var(--noirae-text-primary);}
          .nt-orders-page .nt-order-card-footer{padding:0 24px 20px;}
          .nt-orders-page .nt-view-details{display:inline-flex;align-items:center;gap:6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--noirae-bg-cream);background:var(--noirae-text-primary);padding:10px 18px;transition:background .2s ease,color .2s ease;}
          .nt-orders-page .nt-order-card:hover .nt-view-details{background:var(--noirae-accent-gold);color:var(--noirae-bg-white);}
          .nt-orders-page .nt-return-link{display:inline-flex;align-items:center;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--noirae-text-primary);background:transparent;border:1px solid var(--noirae-border-dark);padding:9px 18px;text-decoration:none;transition:border-color .2s ease,color .2s ease;}
          .nt-orders-page .nt-return-link:hover{border-color:var(--noirae-error);color:var(--noirae-error);}
          .nt-orders-page .nt-btn-primary{background:var(--noirae-text-primary);color:var(--noirae-bg-cream);border-radius:0;font-family:var(--noirae-font-sans);font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;padding:14px 30px;}
          .nt-orders-page .nt-btn-primary:hover{background:var(--noirae-accent-gold);color:var(--noirae-bg-white);}
          .nt-orders-page .nt-empty-state h2{font-family:var(--noirae-font-serif);font-weight:500;color:var(--noirae-text-primary);font-size:28px;}
          .nt-orders-page .nt-empty-state p,.nt-orders-page .nt-error-state p,.nt-orders-page .nt-loading-state p{color:var(--noirae-text-secondary);}
          .nt-orders-page .nt-empty-icon{opacity:0.7;}
          .nt-orders-page .aesop-loading-spinner{border:2px solid var(--noirae-border-medium);border-top:2px solid var(--noirae-accent-gold);}
        `}</style>
        <div className="aesop-container">
          {/* Breadcrumb */}
          <nav className="nt-breadcrumb">
            <Link href="/">{t('home')}</Link>
            <span className="nt-breadcrumb-sep">/</span>
            <span>{t('myOrders')}</span>
          </nav>

          <h1 className="nt-page-title">{t('myOrders')}</h1>

          {loading ? (
            <div className="nt-loading-state">
              <div className="aesop-loading-spinner"></div>
              <p>{t('loading')}</p>
            </div>
          ) : error ? (
            <div className="nt-error-state">
              <p>{error}</p>
              <Link href="/shop" className="nt-btn nt-btn-primary">{t('continueShopping')}</Link>
            </div>
          ) : orders.length === 0 ? (
            <div className="nt-empty-state">
              <div className="nt-empty-icon">📦</div>
              <h2>{t('empty')}</h2>
              <p>{t('emptyDesc')}</p>
              <Link href="/shop" className="nt-btn nt-btn-primary">{t('startShopping')}</Link>
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
                      style={{
                        backgroundColor: `${STATUS_COLORS[order.status] || '#9C9284'}22`,
                        color: STATUS_COLORS[order.status] || '#9C9284',
                      }}
                    >
                      <span
                        className="nt-status-dot"
                        style={{ backgroundColor: STATUS_COLORS[order.status] || '#9C9284' }}
                      />
                      {t.has(`statuses.${order.status}`) ? t(`statuses.${order.status}`) : (order.status.charAt(0).toUpperCase() + order.status.slice(1))}
                    </span>
                  </div>
                  <div className="nt-order-card-body">
                    <div className="nt-order-card-total">
                      <span className="nt-order-card-label">{t('total')}</span>
                      <span className="nt-order-card-amount">${Number(order.total_amount).toFixed(2)}</span>
                    </div>
                    {order.tracking_number && (
                      <div className="nt-order-card-tracking">
                        <span className="nt-order-card-label">{t('tracking')}</span>
                        <span>{order.tracking_number}</span>
                      </div>
                    )}
                  </div>
                  <div className="nt-order-card-footer" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
                    {order.status === 'delivered' && (
                      <Link
                        href={`/returns/request/${order.id || order.order_number}`}
                        onClick={e => e.stopPropagation()}
                        className="nt-return-link"
                      >
                        {t('requestReturn')}
                      </Link>
                    )}
                    <span className="nt-view-details">{t('viewDetails')} →</span>
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
