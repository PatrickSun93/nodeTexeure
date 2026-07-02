import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function CustomerDetailView({ customer, onBack }) {
    const t = useTranslations('CustomerDetailView');
    const [activeTab, setActiveTab] = useState('overview'); // For future tabs if needed
    const [orders, setOrders] = useState([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);

    useEffect(() => {
        const fetchOrders = async () => {
            if (!customer?.id) return;
            setIsLoadingOrders(true);
            try {
                const { apiFetch } = await import('../utils/api');
                const response = await apiFetch(`/api/admin/orders?user_id=${customer.id}`);
                if (response.status === 'SUCCESS' && response.keyValueTable && response.keyValueTable[0]) {
                    setOrders(response.keyValueTable[0].orders || []);
                }
            } catch (error) {
                console.error('Failed to fetch customer orders:', error);
            } finally {
                setIsLoadingOrders(false);
            }
        };

        fetchOrders();
    }, [customer?.id]);

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                        <span className="cursor-pointer hover:text-gray-700" onClick={onBack}>{t('breadcrumbCustomers')}</span>
                        <span>/</span>
                        <span>{customer.name}</span>
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900">{customer.name}</h2>
                </div>
                <div className="flex gap-3">
                    <button onClick={onBack} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                        {t('cancel')}
                    </button>
                    <button className="px-4 py-2 bg-[#C5A572] text-white rounded-lg hover:bg-[#b09060] font-medium transition-colors shadow-sm">
                        {t('saveChanges')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column - Profile & Account */}
                <div className="space-y-6">
                    {/* Profile Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
                        <div className="relative inline-block">
                            <img
                                src="https://placehold.co/100x100/f3ead8/8c6b3d?text=JD"
                                alt={customer.name}
                                className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
                            />
                            <span className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900">{customer.name}</h3>
                        <p className="text-sm text-gray-500 mb-4">{t('customerRole')}</p>

                        <div className="flex justify-center mb-6">
                            <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">{t('active')}</span>
                        </div>

                        <div className="text-left space-y-3 border-t border-gray-100 pt-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">{t('customerIdLabel')}</span>
                                <span className="font-medium text-gray-900">{customer.id || 'CUST-10234'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">{t('memberSinceLabel')}</span>
                                <span className="font-medium text-gray-900">Jan 15, 2023</span>
                            </div>
                        </div>
                    </div>

                    {/* Account Management */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('accountManagement')}</h3>
                        <div className="space-y-3">
                            <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                {t('resetPassword')}
                            </button>
                            <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium text-sm transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                {t('suspendAccount')}
                            </button>
                        </div>

                        <div className="mt-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('internalNotes')}</label>
                            <textarea
                                placeholder={t('addNotePlaceholder')}
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent text-sm"
                            ></textarea>
                            <button className="mt-2 w-full px-4 py-2 bg-[#F3EAD8] text-[#8C6B3D] rounded-lg hover:bg-[#eaddc5] font-medium text-sm transition-colors">
                                {t('saveNote')}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Middle Column - Personal Info & Addresses */}
                <div className="space-y-6">
                    {/* Personal Information */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">{t('personalInformation')}</h3>
                            <button className="text-[#C5A572] text-sm font-medium hover:text-[#a08050] flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                {t('editProfile')}
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">{t('firstName')}</label>
                                    <input type="text" defaultValue={customer.name.split(' ')[0]} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">{t('lastName')}</label>
                                    <input type="text" defaultValue={customer.name.split(' ')[1] || ''} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">{t('emailAddress')}</label>
                                <input type="email" defaultValue={customer.email} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">{t('phoneNumber')}</label>
                                <input type="text" defaultValue="+1 (555) 123-4567" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]" />
                            </div>
                        </div>
                    </div>

                    {/* Addresses */}
                    <div className="grid grid-cols-1 gap-6">
                        {/* Shipping Address */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">{t('shippingAddress')}</h3>
                                <button className="text-[#C5A572] text-sm font-medium hover:text-[#a08050] flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    {t('edit')}
                                </button>
                            </div>
                            <div className="text-sm text-gray-600 leading-relaxed">
                                <p>123 Luxury Lane</p>
                                <p>Suite 450</p>
                                <p>Beverly Hills, CA 90210</p>
                                <p>United States</p>
                            </div>
                        </div>

                        {/* Billing Address */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">{t('billingAddress')}</h3>
                                <button className="text-[#C5A572] text-sm font-medium hover:text-[#a08050] flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    {t('edit')}
                                </button>
                            </div>
                            <div className="text-sm text-gray-600 leading-relaxed mb-3">
                                <p>123 Luxury Lane</p>
                                <p>Suite 450</p>
                                <p>Beverly Hills, CA 90210</p>
                                <p>United States</p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-600">
                                <input type="checkbox" defaultChecked className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                                {t('sameAsShippingAddress')}
                            </label>
                        </div>
                    </div>
                </div>

                {/* Right Column - Order History */}
                <div className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('orderHistory')}</h3>

                        <div className="relative mb-6">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </span>
                            <input
                                type="text"
                                placeholder={t('searchOrdersPlaceholder')}
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent"
                            />
                        </div>

                        <div className="overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-100 text-left">
                                        <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('columnOrderId')}</th>
                                        <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('columnDate')}</th>
                                        <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('columnTotal')}</th>
                                        <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">{t('columnStatus')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {isLoadingOrders ? (
                                        <tr>
                                            <td colSpan="4" className="py-8 text-center text-gray-500">{t('loadingOrders')}</td>
                                        </tr>
                                    ) : orders.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" className="py-8 text-center text-gray-500">{t('noOrdersFound')}</td>
                                        </tr>
                                    ) : (
                                        orders.map((order) => (
                                            <tr key={order._id || order.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                                                <td className="py-3 text-sm font-medium text-gray-900">{order.id}</td>
                                                <td className="py-3 text-sm text-gray-500">{new Date(order.date).toLocaleDateString()}</td>
                                                <td className="py-3 text-sm text-gray-900 font-medium text-right">${Number(order.amount).toFixed(2)}</td>
                                                <td className="py-3 text-right">
                                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${order.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                                                        order.status === 'Processing' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {order.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-6 flex justify-between items-center pt-4 border-t border-gray-100">
                            <button className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <div className="flex gap-2 text-sm text-gray-500">
                                <span className="font-medium text-gray-900">1</span>
                                <span>{t('of')}</span>
                                <span>5</span>
                            </div>
                            <button className="text-gray-400 hover:text-gray-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
