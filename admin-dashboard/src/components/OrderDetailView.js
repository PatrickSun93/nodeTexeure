import React, { useState } from 'react';

export default function OrderDetailView({ order, onBack }) {
    const [status, setStatus] = useState(order.status || 'Processing');
    const [trackingNumber, setTrackingNumber] = useState('');

    // Mock items if not present in order object
    const items = order.items || [
        { id: 1, name: 'Silk Pillowcase', sku: 'SKU: N-SILK-PL-IVR', price: 89.00, quantity: 2, image: 'https://placehold.co/60x60/f3ead8/8c6b3d?text=SP' },
        { id: 2, name: 'Cashmere Throw', sku: 'SKU: N-CASH-THR-GRY', price: 249.00, quantity: 1, image: 'https://placehold.co/60x60/e5e7eb/374151?text=CT' },
    ];

    const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const shipping = 15.00;
    const taxes = 35.23;
    const total = subtotal + shipping + taxes;

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                    </button>
                    <h2 className="text-3xl font-bold text-gray-900">Order {order.id || '#ORD12345'}</h2>
                </div>
                <div className="flex gap-3">
                    <button onClick={onBack} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">
                        Cancel
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">
                        Save Changes
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
                                <p className="text-gray-900 font-medium">{order.customer || 'Elara Vance'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Order Date</p>
                                <p className="text-gray-900 font-medium">{order.date || 'Oct 26, 2023'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Email Address</p>
                                <p className="text-gray-900 font-medium">elara.v@example.com</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Contact Number</p>
                                <p className="text-gray-900 font-medium">+1 (555) 123-4567</p>
                            </div>
                        </div>
                    </div>

                    {/* Order Items */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">Order Items</h3>
                            <button className="text-blue-600 text-sm font-medium hover:text-blue-700">Add Item</button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-100 text-left">
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">Product</th>
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                        <th className="pb-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total</th>
                                        <th className="pb-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="py-4">
                                                <div className="flex items-center gap-4">
                                                    <img src={item.image} alt={item.name} className="w-12 h-12 rounded-md object-cover bg-gray-100" />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                                                        <p className="text-xs text-gray-500">{item.sku}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 text-sm text-gray-600">${item.price.toFixed(2)}</td>
                                            <td className="py-4">
                                                <input
                                                    type="number"
                                                    defaultValue={item.quantity}
                                                    className="w-16 px-2 py-1 border border-gray-200 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="py-4 text-sm font-medium text-gray-900 text-right">${(item.price * item.quantity).toFixed(2)}</td>
                                            <td className="py-4 text-right">
                                                <button className="text-red-400 hover:text-red-600">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-6 border-t border-gray-100 pt-6 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="font-medium text-gray-900">${subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Shipping</span>
                                <span className="font-medium text-gray-900">${shipping.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Taxes</span>
                                <span className="font-medium text-gray-900">${taxes.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-base pt-3 border-t border-gray-100">
                                <span className="font-bold text-gray-900">Total</span>
                                <span className="font-bold text-gray-900">${total.toFixed(2)}</span>
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
                            <button className="text-blue-600 text-sm font-medium hover:text-blue-700">Edit</button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Shipping Address</p>
                                <div className="text-sm text-gray-600 leading-relaxed">
                                    <p className="font-medium text-gray-900">{order.customer || 'Elara Vance'}</p>
                                    <p>123 Serenity Lane</p>
                                    <p>Apt 4B</p>
                                    <p>Meadowville, ST 12345</p>
                                    <p>United States</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Billing Address</p>
                                <p className="text-sm text-gray-600">Same as shipping address</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
