import React, { useState, useEffect } from 'react';

export default function OrderDetailView({ order, onBack }) {
    const [orderDetails, setOrderDetails] = useState(order);
    const [status, setStatus] = useState(order.status || 'Processing');
    const [trackingNumber, setTrackingNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch full details
    useEffect(() => {
        const fetchDetails = async () => {
            if (!order._id && !order.id) return;
            // Use _id if available (UUID), else id (order number might work if backend supports it)
            const idToFetch = order._id || order.id;

            setIsLoading(true);
            try {
                const { apiFetch } = await import('../utils/api');
                const response = await apiFetch(`/api/admin/orders/${idToFetch}`);
                if (response.status === 'SUCCESS' && response.keyValueTable.length > 0) {
                    const data = response.keyValueTable[0].order;
                    setOrderDetails(prev => ({ ...prev, ...data }));
                    if (data.status) setStatus(data.status.charAt(0).toUpperCase() + data.status.slice(1));
                    // Address parsing if needed? Backend returns JSON blocks, frontend might need object.
                    // The backend returns row with shipping_address_json string.
                    // We might need to parse it if it wasn't parsed.
                    // But adminRoutes.js GET /:id returns `order.*`. 
                    // Let's assume we might need to parse JSON fields if they are strings.
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
        try {
            const { apiFetch } = await import('../utils/api');
            const response = await apiFetch(`/api/admin/orders/${idToUpdate}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status })
            });
            if (response.status === 'SUCCESS') {
                alert('Order updated successfully');
            } else {
                alert('Failed to update order');
            }
        } catch (e) {
            console.error('Update failed', e);
            alert('Error updating order');
        } finally {
            setIsSaving(false);
        }
    };

    // Safe access to items and address
    const items = orderDetails.items || [];

    // Calculate totals if not in order object
    const subtotal = orderDetails.subtotal || items.reduce((acc, item) => acc + (item.unit_price || item.price || 0) * (item.quantity || 1), 0);
    const shipping = orderDetails.shipping_amount || 0;
    const taxes = orderDetails.tax_amount || 0;
    const total = orderDetails.total_amount || (subtotal + shipping + taxes);

    // Parse address if string
    let shippingAddress = {};
    try {
        if (typeof orderDetails.shipping_address_json === 'string') {
            shippingAddress = JSON.parse(orderDetails.shipping_address_json);
        } else if (typeof orderDetails.shipping_address_json === 'object') {
            shippingAddress = orderDetails.shipping_address_json;
        }
    } catch (e) { }

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                    </button>
                    <h2 className="text-3xl font-bold text-gray-900">
                        Order {orderDetails.order_number || orderDetails.id}
                        {isLoading && <span className="text-sm font-normal text-gray-400 ml-2">(Loading details...)</span>}
                    </h2>
                </div>
                <div className="flex gap-3">
                    <button onClick={onBack} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column - Main Details */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Customer & Order Details */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">Customer & Order Details</h3>
                            <button className="text-blue-600 text-sm font-medium hover:text-blue-700">Edit</button>
                        </div>
                        <div className="grid grid-cols-2 gap-y-6">
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Customer Name</p>
                                <p className="text-gray-900 font-medium">{orderDetails.first_name ? `${orderDetails.first_name} ${orderDetails.last_name || ''}` : (orderDetails.customer || 'Guest')}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Order Date</p>
                                <p className="text-gray-900 font-medium">{orderDetails.created_at || orderDetails.date}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Email Address</p>
                                <p className="text-gray-900 font-medium">{orderDetails.user_email || orderDetails.guest_email || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Contact Number</p>
                                <p className="text-gray-900 font-medium">{shippingAddress.phone || 'N/A'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Order Items */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">Order Items</h3>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-100 text-left">
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">Product</th>
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="py-4">
                                                <div className="flex items-center gap-4">
                                                    {/* We might not have image URL in order items without join. Use placeholder if missing */}
                                                    <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center text-xs text-gray-400">IMG</div>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{item.product_name || item.name}</p>
                                                        <p className="text-xs text-gray-500">{item.product_sku || item.sku}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 text-sm text-gray-600">${Number(item.unit_price || item.price).toFixed(2)}</td>
                                            <td className="py-4 text-sm text-gray-600 text-center">{item.quantity}</td>
                                            <td className="py-4 text-sm font-medium text-gray-900 text-right">${Number(item.total_price || (item.price * item.quantity)).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {items.length === 0 && (
                                        <tr><td colSpan="4" className="py-8 text-center text-gray-500">No items found</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-6 border-t border-gray-100 pt-6 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="font-medium text-gray-900">${Number(subtotal).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Shipping</span>
                                <span className="font-medium text-gray-900">${Number(shipping).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Taxes</span>
                                <span className="font-medium text-gray-900">${Number(taxes).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-base pt-3 border-t border-gray-100">
                                <span className="font-bold text-gray-900">Total</span>
                                <span className="font-bold text-gray-900">${Number(total).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Sidebar */}
                <div className="space-y-6">

                    {/* Order Status */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Status</h3>
                        <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            >
                                <option value="Pending">Pending</option>
                                <option value="Processing">Processing</option>
                                <option value="Shipped">Shipped</option>
                                <option value="Delivered">Delivered</option>
                                <option value="Cancelled">Cancelled</option>
                            </select>
                        </div>
                    </div>

                    {/* Fulfillment */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Fulfillment</h3>
                        <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Tracking Number</label>
                            <input
                                type="text"
                                placeholder="Add tracking number"
                                value={trackingNumber}
                                onChange={(e) => setTrackingNumber(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                            />
                        </div>
                    </div>

                    {/* Address */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">Address</h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Shipping Address</p>
                                <div className="text-sm text-gray-600 leading-relaxed">
                                    <p className="font-medium text-gray-900">{shippingAddress.firstName} {shippingAddress.lastName}</p>
                                    <p>{shippingAddress.address1}</p>
                                    {shippingAddress.address2 && <p>{shippingAddress.address2}</p>}
                                    <p>{shippingAddress.city}, {shippingAddress.state} {shippingAddress.zip}</p>
                                    <p>{shippingAddress.country}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
