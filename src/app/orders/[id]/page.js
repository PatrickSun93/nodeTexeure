'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import OrderTracking from '../../../components/OrderTracking';
import OrderStatusTimeline, { ORDER_STATUS_STEPS } from '../../../components/OrderStatusTimeline';
import { apiRequest } from '../../../lib/api';
import { money, parseJsonField, formatAddress } from '../orderFormat';

// Same semantic status colours as the /orders list badges.
const STATUS_COLORS = {
  pending: 'var(--noirae-warning)',
  confirmed: 'var(--noirae-info)',
  processing: 'var(--noirae-info)',
  shipped: 'var(--noirae-accent-gold)',
  delivered: 'var(--noirae-success)',
  cancelled: 'var(--noirae-error)',
  refunded: 'var(--noirae-text-muted)',
};

// Scoped, unlayered rules. Tailwind's margin/padding utilities lose to the
// global reset in aesop-design-system.css, so spacing lives here.
const DETAIL_CSS = `
  .nt-order-detail{background:var(--noirae-bg-cream);color:var(--noirae-text-primary);font-family:var(--noirae-font-sans);padding:44px 0 72px;min-height:70vh;}
  .nt-order-detail .aesop-container{max-width:1040px;align-items:stretch;}
  .nt-order-detail p{margin:0;color:inherit;}
  .nt-order-detail .nt-breadcrumb{color:var(--noirae-text-muted);font-size:12px;letter-spacing:0.04em;flex-wrap:wrap;}
  .nt-order-detail .nt-breadcrumb a{color:var(--noirae-text-secondary);transition:color .2s ease;}
  .nt-order-detail .nt-breadcrumb a:hover{color:var(--noirae-accent-gold);}
  .nt-order-detail .nt-breadcrumb-sep{color:var(--noirae-border-dark);}
  .nt-order-detail .od-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin:6px 0 32px;}
  .nt-order-detail .od-title{font-family:var(--noirae-font-serif);font-weight:500;font-size:38px;line-height:1.1;letter-spacing:-0.01em;color:var(--noirae-text-primary);}
  .nt-order-detail .od-placed{margin-top:8px;font-size:13px;color:var(--noirae-text-muted);letter-spacing:0.02em;}
  .nt-order-detail .od-badge{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:30px;font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;}
  .nt-order-detail .od-badge-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
  .nt-order-detail .od-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start;}
  .nt-order-detail .od-col{display:flex;flex-direction:column;gap:24px;min-width:0;}
  .nt-order-detail .od-card{background:var(--noirae-bg-white);border:1px solid var(--noirae-border-medium);}
  .nt-order-detail .od-card-title{padding:18px 24px;border-bottom:1px solid var(--noirae-border-light);font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--noirae-text-secondary);}
  .nt-order-detail .od-card-body{padding:20px 24px;}
  .nt-order-detail .od-item{display:flex;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid var(--noirae-border-light);}
  .nt-order-detail .od-item:first-child{padding-top:0;}
  .nt-order-detail .od-item:last-child{padding-bottom:0;border-bottom:none;}
  .nt-order-detail .od-item-img{width:72px;height:72px;flex-shrink:0;object-fit:cover;background:var(--noirae-bg-sand);}
  .nt-order-detail .od-item-info{flex:1;min-width:0;}
  .nt-order-detail .od-item-name{font-size:14px;font-weight:500;color:var(--noirae-text-primary);}
  .nt-order-detail .od-item-name a{color:inherit;transition:color .2s ease;}
  .nt-order-detail .od-item-name a:hover{color:var(--noirae-accent-gold);}
  .nt-order-detail .od-item-meta{margin-top:4px;font-size:12px;color:var(--noirae-text-muted);}
  .nt-order-detail .od-item-price{text-align:right;font-size:13px;color:var(--noirae-text-secondary);white-space:nowrap;}
  .nt-order-detail .od-item-total{margin-top:4px;font-size:14px;font-weight:500;color:var(--noirae-text-primary);}
  .nt-order-detail .od-row{display:flex;justify-content:space-between;gap:12px;font-size:14px;color:var(--noirae-text-secondary);padding:5px 0;}
  .nt-order-detail .od-row span:last-child{color:var(--noirae-text-primary);}
  .nt-order-detail .od-row-discount span{color:var(--noirae-success) !important;}
  .nt-order-detail .od-row-total{margin-top:10px;padding-top:14px;border-top:1px solid var(--noirae-border-medium);font-size:16px;font-weight:500;color:var(--noirae-text-primary);}
  .nt-order-detail .od-address{font-size:14px;line-height:1.7;color:var(--noirae-text-secondary);}
  .nt-order-detail .od-address-name{color:var(--noirae-text-primary);font-weight:500;}
  .nt-order-detail .od-label{margin-top:14px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--noirae-text-muted);}
  .nt-order-detail .od-history{list-style:none;}
  .nt-order-detail .od-history li{position:relative;padding:0 0 18px 22px;}
  .nt-order-detail .od-history li:last-child{padding-bottom:0;}
  .nt-order-detail .od-history li::before{content:'';position:absolute;left:0;top:6px;width:8px;height:8px;border-radius:50%;background:var(--noirae-accent-gold);}
  .nt-order-detail .od-history li:not(:last-child)::after{content:'';position:absolute;left:3.5px;top:18px;bottom:0;width:1px;background:var(--noirae-border-medium);}
  .nt-order-detail .od-history-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:14px;}
  .nt-order-detail .od-history-status{font-weight:500;color:var(--noirae-text-primary);}
  .nt-order-detail .od-history-date{font-size:12px;color:var(--noirae-text-muted);}
  .nt-order-detail .od-history-note{margin-top:4px;font-size:13px;color:var(--noirae-text-secondary);}
  .nt-order-detail .od-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:32px;}
  .nt-order-detail .od-btn{display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;padding:12px 22px;border:1px solid var(--noirae-text-primary);transition:background .2s ease,color .2s ease,border-color .2s ease;cursor:pointer;font-family:var(--noirae-font-sans);}
  .nt-order-detail .od-btn-primary{background:var(--noirae-text-primary);color:var(--noirae-bg-cream);}
  .nt-order-detail .od-btn-primary:hover{background:var(--noirae-accent-gold);border-color:var(--noirae-accent-gold);color:var(--noirae-bg-white);}
  .nt-order-detail .od-btn-secondary{background:transparent;color:var(--noirae-text-primary);border-color:var(--noirae-border-dark);}
  .nt-order-detail .od-btn-secondary:hover{border-color:var(--noirae-text-primary);}
  .nt-order-detail .od-state{text-align:center;padding:64px 24px;background:var(--noirae-bg-white);border:1px solid var(--noirae-border-medium);}
  .nt-order-detail .od-state h2{font-family:var(--noirae-font-serif);font-weight:500;font-size:28px;color:var(--noirae-text-primary);}
  .nt-order-detail .od-state p{margin-top:8px;color:var(--noirae-text-secondary);}
  .nt-order-detail .od-state .od-actions{justify-content:center;margin-top:24px;}
  .nt-order-detail .nt-loading-state p{color:var(--noirae-text-secondary);}
  .nt-order-detail .aesop-loading-spinner{border:2px solid var(--noirae-border-medium);border-top:2px solid var(--noirae-accent-gold);}
  @media (max-width: 860px){
    .nt-order-detail .od-grid{grid-template-columns:minmax(0,1fr);}
    .nt-order-detail .od-title{font-size:30px;}
  }
`;

const formatDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  : '');

export default function OrderDetailsPage() {
  const t = useTranslations('OrderDetail');
  const tOrders = useTranslations('Orders');
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const orderId = params.id;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  const accessToken = session?.accessToken;

  const fetchOrderDetails = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      // Every endpoint answers { status, message, keyValueTable }; apiRequest
      // throws on FAIL / non-2xx with the server's message.
      const data = await apiRequest(`/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const found = data?.keyValueTable?.order;
      if (found) {
        setOrder(found);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      const msg = err?.message || '';
      if (/401|unauthori[sz]ed|not authorized|no token/i.test(msg)) {
        router.push(`/signin?redirect=/orders/${encodeURIComponent(orderId)}`);
        return;
      }
      // 404 and 403 both mean "not an order you can see" to the customer.
      if (/not found|access denied/i.test(msg)) {
        setNotFound(true);
      } else {
        setError(t('fetchFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [orderId, accessToken, router, t]);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push(`/signin?redirect=/orders/${encodeURIComponent(orderId || '')}`);
      return;
    }
    if (orderId) fetchOrderDetails();
  }, [status, session, router, orderId, fetchOrderDetails]);

  const statusLabel = (value) => (
    tOrders.has(`statuses.${value}`)
      ? tOrders(`statuses.${value}`)
      : (value ? value.charAt(0).toUpperCase() + value.slice(1) : '')
  );

  const renderBody = () => {
    if (status === 'loading' || loading) {
      return (
        <div className="nt-loading-state">
          <div className="aesop-loading-spinner"></div>
          <p>{t('loading')}</p>
        </div>
      );
    }

    if (error || notFound || !order) {
      return (
        <div className="od-state">
          <h2>{error ? t('error') : t('orderNotFound')}</h2>
          <p>{error || t('notFoundBody')}</p>
          <div className="od-actions">
            {error && (
              <button type="button" onClick={fetchOrderDetails} className="od-btn od-btn-primary">
                {t('tryAgain')}
              </button>
            )}
            <Link href="/orders" className="od-btn od-btn-secondary">{t('backToOrders')}</Link>
          </div>
        </div>
      );
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const address = formatAddress(order.shipping_address_json);
    const color = STATUS_COLORS[order.status] || 'var(--noirae-text-muted)';
    const shippingAmount = Number(order.shipping_amount) || 0;
    const discountAmount = Number(order.discount_amount) || 0;

    // Recorded status changes when there are any; otherwise the milestones the
    // order row itself carries (placed / shipped / delivered timestamps).
    const history = Array.isArray(order.status_history) && order.status_history.length > 0
      ? order.status_history.map((entry, idx) => ({
        key: `${entry.status}-${entry.created_at}-${idx}`,
        label: statusLabel(entry.status),
        date: entry.created_at,
        notes: parseJsonField(entry.status_details)?.notes,
        by: entry.changed_by_name,
      }))
      : [
        { key: 'placed', label: t('orderPlaced'), date: order.created_at },
        order.shipped_at && { key: 'shipped', label: statusLabel('shipped'), date: order.shipped_at },
        order.delivered_at && { key: 'delivered', label: statusLabel('delivered'), date: order.delivered_at },
      ].filter(Boolean);

    return (
      <>
        <div className="od-head">
          <div>
            <h1 className="od-title">{t('orderNumber', { number: order.order_number })}</h1>
            <p className="od-placed">{t('placedOn', { date: formatDate(order.created_at) })}</p>
          </div>
          <span
            className="od-badge"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`, color }}
          >
            <span className="od-badge-dot" style={{ backgroundColor: color }} />
            {statusLabel(order.status)}
          </span>
        </div>

        {ORDER_STATUS_STEPS.includes(order.status) && (
          <OrderStatusTimeline status={order.status} style={{ marginBottom: '40px' }} />
        )}

        <div className="od-grid">
          <div className="od-col">
            <section className="od-card">
              <h2 className="od-card-title">{t('orderItems')}</h2>
              <div className="od-card-body">
                {items.map((item, idx) => {
                  const variant = parseJsonField(item.variant_details) || {};
                  return (
                    <div key={item.id || idx} className="od-item">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.product_name} className="od-item-img" />
                      ) : (
                        <div className="od-item-img" aria-hidden="true" />
                      )}
                      <div className="od-item-info">
                        <p className="od-item-name">
                          {item.product_id
                            ? <Link href={`/products/${item.product_id}`}>{item.product_name}</Link>
                            : item.product_name}
                        </p>
                        {item.product_sku && <p className="od-item-meta">{t('sku', { sku: item.product_sku })}</p>}
                        {(variant.size || variant.color) && (
                          <p className="od-item-meta">
                            {variant.size && t('size', { size: variant.size })}
                            {variant.color && t('color', { color: variant.color })}
                          </p>
                        )}
                      </div>
                      <div className="od-item-price">
                        <p>{money(item.unit_price)} × {item.quantity}</p>
                        <p className="od-item-total">{money(item.total_price)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {history.length > 0 && (
              <section className="od-card">
                <h2 className="od-card-title">{t('orderTimeline')}</h2>
                <div className="od-card-body">
                  <ul className="od-history">
                    {history.map((entry) => (
                      <li key={entry.key}>
                        <div className="od-history-head">
                          <span className="od-history-status">{entry.label}</span>
                          <span className="od-history-date">{formatDate(entry.date)}</span>
                        </div>
                        {entry.notes && <p className="od-history-note">{entry.notes}</p>}
                        {entry.by && <p className="od-history-date">{t('updatedBy', { name: entry.by })}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
          </div>

          <div className="od-col">
            <section className="od-card">
              <h2 className="od-card-title">{t('orderSummary')}</h2>
              <div className="od-card-body">
                <div className="od-row"><span>{t('subtotal')}</span><span>{money(order.subtotal)}</span></div>
                {discountAmount > 0 && (
                  <div className="od-row od-row-discount"><span>{t('discount')}</span><span>-{money(discountAmount)}</span></div>
                )}
                <div className="od-row">
                  <span>{t('shipping')}</span>
                  <span>{shippingAmount > 0 ? money(shippingAmount) : t('free')}</span>
                </div>
                <div className="od-row"><span>{t('tax')}</span><span>{money(order.tax_amount)}</span></div>
                <div className="od-row od-row-total"><span>{t('total')}</span><span>{money(order.total_amount)}</span></div>
              </div>
            </section>

            {(address || order.shipping_method) && (
              <section className="od-card">
                <h2 className="od-card-title">{t('shippingAddress')}</h2>
                <div className="od-card-body od-address">
                  {address && (
                    <>
                      {address.name && <p className="od-address-name">{address.name}</p>}
                      {address.lines.map((line, i) => <p key={i}>{line}</p>)}
                      {address.phone && <p>{t('phone', { phone: address.phone })}</p>}
                    </>
                  )}
                  {order.shipping_method && (
                    <>
                      <p className="od-label">{t('shippingMethod')}</p>
                      <p>{order.shipping_method}</p>
                    </>
                  )}
                </div>
              </section>
            )}

            {(order.status === 'shipped' || order.status === 'delivered') && order.tracking_number && (
              <OrderTracking trackingNumber={order.tracking_number} />
            )}
          </div>
        </div>

        <div className="od-actions">
          <Link href="/orders" className="od-btn od-btn-secondary">{t('backToOrders')}</Link>
          {order.status === 'delivered' && (
            <Link href={`/returns/request/${order.id}`} className="od-btn od-btn-primary">
              {tOrders('requestReturn')}
            </Link>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="aesop-page" style={{ background: 'var(--noirae-bg-cream)', minHeight: '100vh' }}>
      <Header />
      <main className="nt-order-detail">
        <style>{DETAIL_CSS}</style>
        <div className="aesop-container">
          <nav className="nt-breadcrumb" aria-label={t('breadcrumb')}>
            <Link href="/">{tOrders('home')}</Link>
            <span className="nt-breadcrumb-sep">/</span>
            <Link href="/orders">{tOrders('myOrders')}</Link>
            {order && (
              <>
                <span className="nt-breadcrumb-sep">/</span>
                <span>{t('orderNumber', { number: order.order_number })}</span>
              </>
            )}
          </nav>
          {renderBody()}
        </div>
      </main>
      <Footer />
    </div>
  );
}
