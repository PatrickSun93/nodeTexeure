'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import OrderTracking from '../../../components/OrderTracking';

// Champagne & Charcoal restyle — scoped remap of the page's raw Tailwind color
// utilities onto the --noirae-* design tokens (unlayered, so it wins over
// Tailwind's layered utilities without touching the shared design system).
const DETAIL_CSS = `
  .noirae-order-detail{background:var(--noirae-bg-cream);color:var(--noirae-text-primary);font-family:var(--noirae-font-sans);}
  .noirae-order-detail h1,.noirae-order-detail h2{font-family:var(--noirae-font-serif);font-weight:500;letter-spacing:-0.01em;}
  .noirae-order-detail .bg-white{background:var(--noirae-bg-white);border:1px solid var(--noirae-border-medium);}
  .noirae-order-detail .bg-gray-50{background:var(--noirae-bg-cream);}
  .noirae-order-detail .bg-gray-100{background:var(--noirae-bg-sand);}
  .noirae-order-detail .bg-gray-200{background:var(--noirae-bg-sand);}
  .noirae-order-detail .shadow{box-shadow:0 6px 22px rgba(42,38,33,0.05);}
  .noirae-order-detail .rounded-lg{border-radius:2px;}
  .noirae-order-detail .rounded{border-radius:2px;}
  .noirae-order-detail .text-gray-900{color:var(--noirae-text-primary);}
  .noirae-order-detail .text-gray-600{color:var(--noirae-text-secondary);}
  .noirae-order-detail .text-gray-500{color:var(--noirae-text-secondary);}
  .noirae-order-detail .text-gray-400{color:var(--noirae-text-muted);}
  .noirae-order-detail .text-gray-300{color:var(--noirae-border-dark);}
  .noirae-order-detail .hover\\:text-gray-500:hover{color:var(--noirae-text-primary);}
  .noirae-order-detail .text-green-600{color:var(--noirae-success);}
  .noirae-order-detail .border-gray-200{border-color:var(--noirae-border-light);}
  .noirae-order-detail .bg-yellow-100{background:var(--noirae-warning-bg);}
  .noirae-order-detail .text-yellow-800{color:var(--noirae-warning);}
  .noirae-order-detail .bg-blue-100{background:var(--noirae-info-bg);}
  .noirae-order-detail .text-blue-800{color:var(--noirae-info);}
  .noirae-order-detail .bg-purple-100{background:var(--noirae-info-bg);}
  .noirae-order-detail .text-purple-800{color:var(--noirae-info);}
  .noirae-order-detail .bg-indigo-100{background:var(--noirae-warning-bg);}
  .noirae-order-detail .text-indigo-800{color:var(--noirae-warning);}
  .noirae-order-detail .bg-green-100{background:var(--noirae-success-bg);}
  .noirae-order-detail .text-green-800{color:var(--noirae-success);}
  .noirae-order-detail .bg-red-100{background:var(--noirae-error-bg);}
  .noirae-order-detail .text-red-800{color:var(--noirae-error);}
  .noirae-order-detail .text-gray-800{color:var(--noirae-text-secondary);}
  .noirae-order-detail .ring-white{--tw-ring-color:var(--noirae-bg-white);}
  .noirae-order-detail .bg-red-50{background:var(--noirae-error-bg);}
  .noirae-order-detail .border-red-200{border-color:var(--noirae-error);}
  .noirae-order-detail .text-red-600{color:var(--noirae-error);}
  .noirae-order-detail .od-btn-primary{display:inline-flex;align-items:center;justify-content:center;background:var(--noirae-text-primary);color:var(--noirae-bg-cream);border-radius:2px;font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;padding:12px 22px;transition:background .2s ease,color .2s ease;}
  .noirae-order-detail .od-btn-primary:hover{background:var(--noirae-accent-gold);color:var(--noirae-bg-white);}
  .noirae-order-detail .od-btn-secondary{display:inline-flex;align-items:center;justify-content:center;background:transparent;color:var(--noirae-text-primary);border:1px solid var(--noirae-border-dark);border-radius:2px;font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;padding:12px 22px;transition:border-color .2s ease,color .2s ease;}
  .noirae-order-detail .od-btn-secondary:hover{border-color:var(--noirae-text-primary);}
  .noirae-order-detail .od-link{color:var(--noirae-accent-gold);transition:color .2s ease;}
  .noirae-order-detail .od-link:hover{color:var(--noirae-text-primary);}
`;

export default function OrderDetailsPage() {
  const t = useTranslations('OrderDetail');
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/login?redirect=/orders');
      return;
    }

    if (params.id) {
      fetchOrderDetails();
    }
  }, [session, status, router, params.id]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/orders/${params.id}`, {
        headers: {
          'Authorization': `Bearer ${session?.accessToken}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        setOrder(result.data);
      } else {
        setError(result.message || t('fetchFailed'));
      }
    } catch (err) {
      setError(t('fetchFailed'));
      console.error('Error fetching order:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      processing: 'bg-purple-100 text-purple-800',
      shipped: 'bg-indigo-100 text-indigo-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      refunded: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusLabel = (value) => {
    const labels = {
      pending: t('statusPending'),
      confirmed: t('statusConfirmed'),
      processing: t('statusProcessing'),
      shipped: t('statusShipped'),
      delivered: t('statusDelivered'),
      cancelled: t('statusCancelled'),
      refunded: t('statusRefunded'),
    };
    return labels[value] || (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');
  };

  if (status === 'loading' || loading) {
    return (
      <div className="noirae-order-detail min-h-screen py-8">
        <style>{DETAIL_CSS}</style>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="noirae-order-detail min-h-screen py-8">
        <style>{DETAIL_CSS}</style>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-red-800 mb-2">{t('error')}</h3>
            <p className="text-red-600">{error}</p>
            <div className="mt-4 space-x-4">
              <button
                onClick={fetchOrderDetails}
                className="od-btn-primary"
              >
                {t('tryAgain')}
              </button>
              <Link
                href="/orders"
                className="od-btn-secondary"
              >
                {t('backToOrders')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="noirae-order-detail min-h-screen py-8">
        <style>{DETAIL_CSS}</style>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('orderNotFound')}</h3>
            <Link
              href="/orders"
              className="od-link"
            >
              {t('backToOrders')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="noirae-order-detail min-h-screen py-8">
      <style>{DETAIL_CSS}</style>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex" aria-label={t('breadcrumb')}>
            <ol className="flex items-center space-x-4">
              <li>
                <Link href="/orders" className="text-gray-400 hover:text-gray-500">
                  {t('orders')}
                </Link>
              </li>
              <li>
                <div className="flex items-center">
                  <svg className="flex-shrink-0 h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="ml-4 text-sm font-medium text-gray-500">
                    {t('orderNumber', { number: order.order_number })}
                  </span>
                </div>
              </li>
            </ol>
          </nav>
          
          <div className="mt-4 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {t('orderNumber', { number: order.order_number })}
              </h1>
              <p className="mt-2 text-gray-600">
                {t('placedOn', { date: formatDate(order.created_at) })}
              </p>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.status)}`}>
              {getStatusLabel(order.status)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Items */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">{t('orderItems')}</h2>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {item.thumbnail_small_url ? (
                          <img
                            src={item.thumbnail_small_url}
                            alt={item.product_name}
                            className="h-16 w-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="h-16 w-16 rounded-lg bg-gray-200 flex items-center justify-center">
                            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900">
                          {item.product_name}
                        </h3>
                        <p className="text-sm text-gray-500">{t('sku', { sku: item.product_sku })}</p>
                        {item.variant_details && (
                          <p className="text-sm text-gray-500">
                            {JSON.parse(item.variant_details).size && t('size', { size: JSON.parse(item.variant_details).size })}
                            {JSON.parse(item.variant_details).color && t('color', { color: JSON.parse(item.variant_details).color })}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          ${item.unit_price.toFixed(2)} × {item.quantity}
                        </p>
                        <p className="text-sm text-gray-500">
                          {t('lineTotal', { total: `$${item.total_price.toFixed(2)}` })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Order Status History */}
            {order.status_history && order.status_history.length > 0 && (
              <div className="mt-8 bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">{t('orderTimeline')}</h2>
                </div>
                <div className="p-6">
                  <div className="flow-root">
                    <ul className="-mb-8">
                      {order.status_history.map((entry, index) => (
                        <li key={entry.id}>
                          <div className="relative pb-8">
                            {index !== order.status_history.length - 1 && (
                              <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" />
                            )}
                            <div className="relative flex space-x-3">
                              <div>
                                <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${getStatusColor(entry.status)}`}>
                                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </span>
                              </div>
                              <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                                <div>
                                  <p className="text-sm text-gray-900 font-medium">
                                    {getStatusLabel(entry.status)}
                                  </p>
                                  {entry.status_details?.notes && (
                                    <p className="text-sm text-gray-500 mt-1">
                                      {entry.status_details.notes}
                                    </p>
                                  )}
                                  {entry.status_details?.changed_by_name && (
                                    <p className="text-xs text-gray-400 mt-1">
                                      {t('updatedBy', { name: entry.status_details.changed_by_name })}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right text-sm whitespace-nowrap text-gray-500">
                                  {formatDate(entry.created_at)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Order Summary & Details */}
          <div className="space-y-8">
            {/* Order Summary */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">{t('orderSummary')}</h2>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('subtotal')}</span>
                    <span className="font-medium">${order.subtotal.toFixed(2)}</span>
                  </div>
                  {order.tax_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('tax')}</span>
                      <span className="font-medium">${order.tax_amount.toFixed(2)}</span>
                    </div>
                  )}
                  {order.shipping_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('shipping')}</span>
                      <span className="font-medium">${order.shipping_amount.toFixed(2)}</span>
                    </div>
                  )}
                  {order.discount_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-green-600">{t('discount')}</span>
                      <span className="font-medium text-green-600">-${order.discount_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-3">
                    <div className="flex justify-between">
                      <span className="text-lg font-semibold text-gray-900">{t('total')}</span>
                      <span className="text-lg font-semibold text-gray-900">${order.total_amount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            {order.shipping_address && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">{t('shippingAddress')}</h2>
                </div>
                <div className="p-6">
                  <div className="text-sm text-gray-900">
                    <p className="font-medium">
                      {order.shipping_address.first_name} {order.shipping_address.last_name}
                    </p>
                    {order.shipping_address.company && (
                      <p>{order.shipping_address.company}</p>
                    )}
                    <p>{order.shipping_address.address_line_1}</p>
                    {order.shipping_address.address_line_2 && (
                      <p>{order.shipping_address.address_line_2}</p>
                    )}
                    <p>
                      {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}
                    </p>
                    <p>{order.shipping_address.country}</p>
                    {order.shipping_address.phone && (
                      <p className="mt-2">{t('phone', { phone: order.shipping_address.phone })}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tracking Information */}
            {(order.status === 'shipped' || order.status === 'delivered') && order.tracking_number && (
              <OrderTracking 
                trackingNumber={order.tracking_number}
                orderId={order.id}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}