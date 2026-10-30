import React, { useState, useEffect } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import type { OrderDetail, OrderItem, OrderListItem, Table } from '@/types/api';

/** The list row, filled in with GET /api/admin/orders/:id once it loads. */
type OrderState = Omit<Partial<OrderDetail>, 'status'> & Partial<Omit<OrderListItem, 'status'>> & { id: string; status: string };

/** Seeded or older rows may carry name/sku/price instead of the snapshot columns. */
type ItemRow = OrderItem & { name?: string; sku?: string; price?: string | number };

type RawAddress = Record<string, unknown>;

interface SaveFeedback {
    type: 'success' | 'error';
    message: string;
    detail?: string;
}

// Every orders.status ENUM value, so a confirmed/refunded order isn't shown (and
// re-saved) as "Pending".
const STATUS_OPTIONS = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'];

const firstString = (...values: unknown[]): string => (values.find((v) => typeof v === 'string' && v.trim()) as string | undefined) || '';

// Order addresses are stored in more than one shape: checkout writes snake_case
// (first_name, address_line_1, postal_code), the example seed writes
// { name, street, zip }, and older admin code expected camelCase. Normalize them
// so the street lines and postcode are never silently dropped.
function normalizeAddress(raw: unknown) {
    let addr = raw as RawAddress | string | null;
    if (typeof addr === 'string') {
        try { addr = JSON.parse(addr); } catch (e) { addr = null; }
    }
    if (!addr || typeof addr !== 'object') return null;
    const name = firstString(
        [firstString(addr.first_name, addr.firstName), firstString(addr.last_name, addr.lastName)].filter(Boolean).join(' '),
        addr.name,
        addr.full_name,
    );
    return {
        name,
        company: firstString(addr.company),
        line1: firstString(addr.address_line_1, addr.address1, addr.addressLine1, addr.line1, addr.street),
        line2: firstString(addr.address_line_2, addr.address2, addr.addressLine2, addr.line2),
        city: firstString(addr.city),
        state: firstString(addr.state, addr.province, addr.region),
        postalCode: firstString(addr.postal_code, addr.postalCode, addr.zip, addr.zip_code),
        country: firstString(addr.country, addr.country_code),
        phone: firstString(addr.phone),
    };
}

// DECIMAL columns arrive as strings ("12.42"); coerce before any arithmetic.
const toNumber = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

export default function OrderDetailView({ order, onBack }: { order: OrderListItem; onBack: () => void }) {
    const t = useTranslations('OrderDetailView');
    const format = useFormatter();
    const [orderDetails, setOrderDetails] = useState<OrderState>(order);
    const [status, setStatus] = useState(order.status || 'Processing');
    const [trackingNumber, setTrackingNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Inline save result ({ type: 'success' | 'error', message, detail? }) instead
    // of a blocking window.alert().
    const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);

    // Fetch full details
    useEffect(() => {
        const fetchDetails = async () => {
            if (!order._id && !order.id) return;
            // Use _id if available (UUID), else id (order number might work if backend supports it)
            const idToFetch = order._id || order.id;

            setIsLoading(true);
            try {
                const { apiFetch } = await import('../utils/api');
                const response = await apiFetch<Table<'order', OrderDetail>>(`/api/admin/orders/${idToFetch}`);
                if (response.status === 'SUCCESS' && response.keyValueTable.length > 0) {
                    const data = response.keyValueTable[0].order as OrderDetail;
                    setOrderDetails(prev => ({ ...prev, ...data }));
                    if (data.status) setStatus(data.status.charAt(0).toUpperCase() + data.status.slice(1));
                    if (data.tracking_number) setTrackingNumber(data.tracking_number);
                }
            } catch (e) {
                console.error('Failed to load order details', e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [order]);

    const handleSave = async () => {
        const idToUpdate = orderDetails._id || orderDetails.id;
        if (!idToUpdate) return;

        setIsSaving(true);
        setSaveFeedback(null);
        try {
            const { apiFetch } = await import('../utils/api');
            // Persist the tracking number alongside the status change.
            const payload: { status: string; tracking_number?: string } = { status };
            const trimmedTracking = (trackingNumber || '').trim();
            if (trimmedTracking) payload.tracking_number = trimmedTracking;
            const response = await apiFetch(`/api/admin/orders/${idToUpdate}/status`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            if (response.status === 'SUCCESS') {
                setSaveFeedback({ type: 'success', message: t('orderUpdatedSuccess') });
                setOrderDetails(prev => ({
                    ...prev,
                    status: status.toLowerCase(),
                    ...(trimmedTracking ? { tracking_number: trimmedTracking } : {}),
                }));
            } else {
                setSaveFeedback({ type: 'error', message: t('failedToUpdate'), detail: response.message });
            }
        } catch (e) {
            console.error('Update failed', e);
            setSaveFeedback({ type: 'error', message: t('errorUpdating') });
        } finally {
            setIsSaving(false);
        }
    };

    // Safe access to items and address
    const items: ItemRow[] = orderDetails.items || [];

    // Totals. The discount line must be shown, or subtotal + shipping + tax won't
    // add up to the total of a coupon order.
    const subtotal = orderDetails.subtotal != null
        ? toNumber(orderDetails.subtotal)
        : items.reduce((acc, item) => acc + toNumber(item.unit_price || item.price) * (item.quantity || 1), 0);
    const shipping = toNumber(orderDetails.shipping_amount);
    const taxes = toNumber(orderDetails.tax_amount);
    const discount = toNumber(orderDetails.discount_amount);
    // Until the detail fetch lands, the row from the orders list only has `amount`.
    const rawTotal = orderDetails.total_amount ?? orderDetails.amount;
    const total = rawTotal != null
        ? toNumber(rawTotal)
        : subtotal - discount + shipping + taxes;

    const shippingAddress: Partial<NonNullable<ReturnType<typeof normalizeAddress>>> = normalizeAddress(orderDetails.shipping_address_json) || {};
    const cityLine = [
        [shippingAddress.city, shippingAddress.state].filter(Boolean).join(', '),
        shippingAddress.postalCode,
    ].filter(Boolean).join(' ');
    const hasAddress = Boolean(shippingAddress.name || shippingAddress.line1 || cityLine || shippingAddress.country);

    // created_at is an ISO timestamp; show it in the admin's locale.
    const rawDate = orderDetails.created_at || orderDetails.date;
    const parsedDate = rawDate ? new Date(rawDate) : null;
    const orderDate = parsedDate && !Number.isNaN(parsedDate.getTime())
        ? format.dateTime(parsedDate, { dateStyle: 'medium', timeStyle: 'short' })
        : (rawDate || t('notAvailable'));

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                    </button>
                    <h2 className="text-3xl font-bold text-gray-900">
                        {t('orderTitle', { orderNumber: orderDetails.order_number || orderDetails.id })}
                        {isLoading && <span className="text-sm font-normal text-gray-400 ml-2">{t('loadingDetails')}</span>}
                    </h2>
                </div>
                <div className="flex gap-3">
                    <button onClick={onBack} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">
                        {t('cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm disabled:opacity-50"
                    >
                        {isSaving ? t('saving') : t('saveChanges')}
                    </button>
                </div>
            </div>

            {saveFeedback && (
                <div
                    role={saveFeedback.type === 'error' ? 'alert' : 'status'}
                    className={`mb-6 flex items-start justify-between gap-4 rounded-lg border p-4 text-sm ${saveFeedback.type === 'success'
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-red-50 border-red-200 text-red-800'}`}
                >
                    <div>
                        <p className="font-medium">{saveFeedback.message}</p>
                        {saveFeedback.detail && <p className="mt-1">{saveFeedback.detail}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={() => setSaveFeedback(null)}
                        className="opacity-70 hover:opacity-100"
                        aria-label={t('dismiss')}
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column - Main Details */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Customer & Order Details */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">{t('customerOrderDetails')}</h3>
                            <button className="text-blue-600 text-sm font-medium hover:text-blue-700">{t('edit')}</button>
                        </div>
                        <div className="grid grid-cols-2 gap-y-6">
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('customerName')}</p>
                                <p className="text-gray-900 font-medium">{orderDetails.first_name ? `${orderDetails.first_name} ${orderDetails.last_name || ''}` : (orderDetails.customer || t('guest'))}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('orderDate')}</p>
                                <p className="text-gray-900 font-medium">{orderDate}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('emailAddress')}</p>
                                <p className="text-gray-900 font-medium">{orderDetails.user_email || orderDetails.guest_email || t('notAvailable')}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('contactNumber')}</p>
                                <p className="text-gray-900 font-medium">{shippingAddress.phone || t('notAvailable')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Order Items */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">{t('orderItems')}</h3>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-100 text-left">
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">{t('product')}</th>
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('price')}</th>
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('quantity')}</th>
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('total')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="py-4">
                                                <div className="flex items-center gap-4">
                                                    {/* We might not have image URL in order items without join. Use placeholder if missing */}
                                                    <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center text-xs text-gray-400">{t('imagePlaceholder')}</div>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{item.product_name || item.name}</p>
                                                        <p className="text-xs text-gray-500">{item.product_sku || item.sku}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 text-sm text-gray-600">${Number(item.unit_price || item.price).toFixed(2)}</td>
                                            <td className="py-4 text-sm text-gray-600 text-center">{item.quantity}</td>
                                            <td className="py-4 text-sm font-medium text-gray-900 text-right">${Number(item.total_price || (Number(item.price) * item.quantity)).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {items.length === 0 && (
                                        <tr><td colSpan={4} className="py-8 text-center text-gray-500">{t('noItemsFound')}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-6 border-t border-gray-100 pt-6 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">{t('subtotal')}</span>
                                <span className="font-medium text-gray-900">${subtotal.toFixed(2)}</span>
                            </div>
                            {discount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">{t('discount')}</span>
                                    <span className="font-medium text-green-700">-${discount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">{t('shipping')}</span>
                                <span className="font-medium text-gray-900">${shipping.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">{t('taxes')}</span>
                                <span className="font-medium text-gray-900">${taxes.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-base pt-3 border-t border-gray-100">
                                <span className="font-bold text-gray-900">{t('total')}</span>
                                <span className="font-bold text-gray-900">${total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Sidebar */}
                <div className="space-y-6">

                    {/* Order Status */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('orderStatus')}</h3>
                        <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">{t('status')}</label>
                            <select
                                value={status}
                                onChange={(e) => { setStatus(e.target.value); setSaveFeedback(null); }}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            >
                                {STATUS_OPTIONS.map((value) => (
                                    <option key={value} value={value}>{t(`status${value}`)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Fulfillment */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('fulfillment')}</h3>
                        <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">{t('trackingNumber')}</label>
                            <input
                                type="text"
                                placeholder={t('addTrackingNumber')}
                                value={trackingNumber}
                                onChange={(e) => { setTrackingNumber(e.target.value); setSaveFeedback(null); }}
                                maxLength={100}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            />
                        </div>
                    </div>

                    {/* Address */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">{t('address')}</h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{t('shippingAddress')}</p>
                                {hasAddress ? (
                                    <address className="not-italic text-sm text-gray-600 leading-relaxed">
                                        {shippingAddress.name && <p className="font-medium text-gray-900">{shippingAddress.name}</p>}
                                        {shippingAddress.company && <p>{shippingAddress.company}</p>}
                                        {shippingAddress.line1 && <p>{shippingAddress.line1}</p>}
                                        {shippingAddress.line2 && <p>{shippingAddress.line2}</p>}
                                        {cityLine && <p>{cityLine}</p>}
                                        {shippingAddress.country && <p>{shippingAddress.country}</p>}
                                    </address>
                                ) : (
                                    <p className="text-sm text-gray-500">{t('notAvailable')}</p>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
