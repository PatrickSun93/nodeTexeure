import React, { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function PromotionModal({ isOpen, onClose, promotion }) {
    const t = useTranslations('PromotionModal');
    if (!isOpen) return null;

    const getTodayDate = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [formData, setFormData] = useState(promotion || {
        name: '',
        description: '',
        code: '',
        status: 'Draft',
        type: 'Percentage',
        value: '',
        minRequirements: 'None',
        appliesTo: 'All products',
        startDate: getTodayDate(),
        endDate: '',
        // New fields from database schema
        minimum_order_amount: '',
        maximum_discount_amount: '',
        usage_limit: '',
        usage_limit_per_customer: ''
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleGenerateCode = () => {
        const randomCode = 'SUMMER' + Math.floor(Math.random() * 100);
        setFormData(prev => ({ ...prev, code: randomCode }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { apiFetch } = await import('../utils/api');
            const payload = {
                name: formData.name,
                code: formData.code,
                type: formData.type.toLowerCase().replace(' ', '_'),
                value: formData.value,
                starts_at: formData.startDate ? `${formData.startDate} 00:00:00` : null,
                expires_at: formData.endDate ? `${formData.endDate} 00:00:00` : null,
                is_active: formData.status === 'Active',
                minimum_order_amount: formData.minimum_order_amount || null,
                maximum_discount_amount: formData.maximum_discount_amount || null,
                usage_limit: formData.usage_limit || null,
                usage_limit_per_customer: formData.usage_limit_per_customer || null,
                discount_details: {
                    description: formData.description,
                    min_requirements: formData.minRequirements,
                    applies_to: formData.appliesTo
                }
            };

            const response = await apiFetch('/api/admin/coupons', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.status === 'SUCCESS') {
                onClose();
            } else {
                alert(t('failedToCreate'));
            }
        } catch (e) {
            console.error('Create promo failed', e);
            alert(t('errorCreating'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{t('title')}</h2>
                        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">

                    {/* Promotion Details */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-4">{t('promotionDetails')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('promotionName')}</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder={t('promotionNamePlaceholder')}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('descriptionLabel')}</label>
                                <input
                                    type="text"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    placeholder={t('descriptionPlaceholder')}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Discount Code */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-medium text-gray-700">{t('discountCodeLabel')}</label>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">{t('status')}</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs ${formData.status === 'Draft' ? 'font-bold text-gray-900' : 'text-gray-500'}`}>{t('draft')}</span>
                                    <button
                                        onClick={() => setFormData(prev => ({ ...prev, status: prev.status === 'Active' ? 'Draft' : 'Active' }))}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:ring-offset-2 ${formData.status === 'Active' ? 'bg-[#C5A572]' : 'bg-gray-200'}`}
                                    >
                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${formData.status === 'Active' ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </button>
                                    <span className={`text-xs ${formData.status === 'Active' ? 'font-bold text-gray-900' : 'text-gray-500'}`}>{t('active')}</span>
                                </div>
                            </div>
                        </div>
                        <div className="relative">
                            <input
                                type="text"
                                name="code"
                                value={formData.code}
                                onChange={handleChange}
                                placeholder={t('discountCodePlaceholder')}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                            />
                            <button
                                onClick={handleGenerateCode}
                                className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded hover:bg-gray-200"
                            >
                                {t('generate')}
                            </button>
                        </div>
                    </div>

                    {/* Discount Type */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-4">{t('discountType')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('discountType')}</label>
                                <select
                                    name="type"
                                    value={formData.type}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-white"
                                >
                                    <option value="Percentage">{t('percentage')}</option>
                                    <option value="Fixed Amount">{t('fixedAmount')}</option>
                                    <option value="Free Shipping">{t('freeShipping')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('discountValue')}</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm">
                                        {formData.type === 'Fixed Amount' ? '$' : '%'}
                                    </span>
                                    <input
                                        type="number"
                                        name="value"
                                        value={formData.value}
                                        onChange={handleChange}
                                        placeholder="20"
                                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                                        disabled={formData.type === 'Free Shipping'}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Applicability */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-4">{t('applicability')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('minimumRequirements')}</label>
                                <select
                                    name="minRequirements"
                                    value={formData.minRequirements}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-white"
                                >
                                    <option value="None">{t('none')}</option>
                                    <option value="Minimum Purchase Amount">{t('minimumPurchaseAmount')}</option>
                                    <option value="Minimum Quantity">{t('minimumQuantity')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('appliesTo')}</label>
                                <select
                                    name="appliesTo"
                                    value={formData.appliesTo}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-white"
                                >
                                    <option value="All products">{t('allProducts')}</option>
                                    <option value="Specific collections">{t('specificCollections')}</option>
                                    <option value="Specific products">{t('specificProducts')}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Limits & Thresholds */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-4">{t('limitsAndThresholds')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('minimumOrderAmount')}</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm">$</span>
                                    <input
                                        type="number"
                                        name="minimum_order_amount"
                                        value={formData.minimum_order_amount}
                                        onChange={handleChange}
                                        placeholder="0.00"
                                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('maximumDiscountCap')}</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm">$</span>
                                    <input
                                        type="number"
                                        name="maximum_discount_amount"
                                        value={formData.maximum_discount_amount}
                                        onChange={handleChange}
                                        placeholder="0.00"
                                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('totalUsageLimit')}</label>
                                <input
                                    type="number"
                                    name="usage_limit"
                                    value={formData.usage_limit}
                                    onChange={handleChange}
                                    placeholder={t('unlimited')}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('limitPerCustomer')}</label>
                                <input
                                    type="number"
                                    name="usage_limit_per_customer"
                                    value={formData.usage_limit_per_customer}
                                    onChange={handleChange}
                                    placeholder={t('unlimited')}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Active Dates */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-4">{t('activeDates')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('startDate')}</label>
                                <input
                                    type="date"
                                    name="startDate"
                                    value={formData.startDate}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('endDate')}</label>
                                <input
                                    type="date"
                                    name="endDate"
                                    value={formData.endDate}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A572]"
                                />
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors">
                        {t('cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isSaving ? t('saving') : t('savePromotion')}
                    </button>
                </div>
            </div>
        </div>
    );
}
