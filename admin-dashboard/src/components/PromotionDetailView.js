import React, { useState } from 'react';

export default function PromotionDetailView({ promotion, onBack }) {
    const isEditing = !!promotion;

    // Parse initial details
    const initialDetails = promotion?.discount_details || {};
    // Ensure properly parsed if string (though likely object)
    const details = typeof initialDetails === 'string' ? JSON.parse(initialDetails) : initialDetails;

    const getTodayDate = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Parse dates from DB (format: YYYY-MM-DD HH:MM:SS or ISO string)
    const parseDbDate = (dateStr) => {
        if (!dateStr) return '';
        // Extract just the date part
        return dateStr.split('T')[0].split(' ')[0];
    };

    const [formData, setFormData] = useState({
        name: promotion?.name || '',
        description: details.description || '',
        code: promotion?.code || '',
        type: promotion?.type ? (promotion.type.charAt(0).toUpperCase() + promotion.type.slice(1).replace('_', ' ')) : 'Percentage',
        value: promotion?.value || '',
        minRequirements: details.min_requirements || details.minRequirements || 'None',
        appliesTo: details.applies_to || details.appliesTo || 'Specific collections',
        status: promotion?.status || 'Draft',
        startDate: parseDbDate(promotion?.starts_at) || getTodayDate(),
        endDate: parseDbDate(promotion?.expires_at) || '',
        // New fields from database schema
        minimum_order_amount: promotion?.minimum_order_amount || '',
        maximum_discount_amount: promotion?.maximum_discount_amount || '',
        usage_limit: promotion?.usage_limit || '',
        usage_limit_per_customer: promotion?.usage_limit_per_customer || '',
        usage_count: promotion?.usage_count || 0 // Read-only
    });

    const handleQuickDuration = (days) => {
        const start = formData.startDate ? new Date(formData.startDate) : new Date();
        const end = new Date(start);

        if (days === 'EOM') {
            // End of Month
            end.setMonth(end.getMonth() + 1);
            end.setDate(0); // Last day of previous month (which is current month relative to +1)
        } else {
            end.setDate(end.getDate() + days);
        }

        end.setHours(0, 0, 0, 0);

        // Format to YYYY-MM-DD (date only)
        const year = end.getFullYear();
        const month = String(end.getMonth() + 1).padStart(2, '0');
        const day = String(end.getDate()).padStart(2, '0');
        const dateOnly = `${year}-${month}-${day}`;

        setFormData(prev => ({ ...prev, endDate: dateOnly }));
    };

    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        if (!promotion?.id) return; // Should be editing here

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

            const response = await apiFetch(`/api/admin/coupons/${promotion.id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });

            if (response.status === 'SUCCESS') {
                alert('Promotion updated successfully');
            } else {
                alert('Failed to update promotion');
            }
        } catch (e) {
            console.error('Update promo failed', e);
            alert('Error updating promotion');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">{isEditing ? 'Edit Promotion' : 'Create New Promotion'}</h2>
                <p className="text-gray-500">{isEditing ? `Modify the details for the "${formData.name}" promotion.` : 'Configure the details for your new promotional offer.'}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Main Column */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Promotion Details */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6">Promotion Details</h3>
                        <p className="text-sm text-gray-500 mb-6 -mt-4">Basic information for the promotion.</p>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Promotion Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="e.g., Autumn Sale"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    rows={3}
                                    placeholder="A brief description..."
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Discount Code</label>
                                    <input
                                        type="text"
                                        name="code"
                                        value={formData.code}
                                        onChange={handleChange}
                                        placeholder="e.g., AUTUMN20"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Discount Type</label>
                                    <select
                                        name="type"
                                        value={formData.type}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-gray-50"
                                    >
                                        <option value="Percentage">Percentage</option>
                                        <option value="Fixed Amount">Fixed Amount</option>
                                        <option value="Free Shipping">Free Shipping</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Discount Value</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-500">
                                        {formData.type === 'Fixed Amount' ? '$' : '%'}
                                    </span>
                                    <input
                                        type="number"
                                        name="value"
                                        value={formData.value}
                                        onChange={handleChange}
                                        placeholder="20"
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Configuration */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6">Configuration</h3>
                        <p className="text-sm text-gray-500 mb-6 -mt-4">Set the rules and applicability for this promotion.</p>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Requirements</label>
                                <select
                                    name="minRequirements"
                                    value={formData.minRequirements}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-gray-50"
                                >
                                    <option value="None">None</option>
                                    <option value="Minimum Purchase Amount">Minimum Purchase Amount</option>
                                    <option value="Minimum Quantity">Minimum Quantity</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Applicable Products/Collections</label>
                                <select
                                    name="appliesTo"
                                    value={formData.appliesTo}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-gray-50"
                                >
                                    <option value="All products">All products</option>
                                    <option value="Specific collections">Specific collections</option>
                                    <option value="Specific products">Specific products</option>
                                </select>
                            </div>

                            {/* Limits & Thresholds */}
                            <div className="pt-6 border-t border-gray-100">
                                <h4 className="text-sm font-semibold text-gray-900 mb-4">Limits & Thresholds</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Order Amount</label>
                                        <div className="relative">
                                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-500">$</span>
                                            <input
                                                type="number"
                                                name="minimum_order_amount"
                                                value={formData.minimum_order_amount}
                                                onChange={handleChange}
                                                placeholder="0.00"
                                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                            />
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">Leave empty for no minimum</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Discount Amount</label>
                                        <div className="relative">
                                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-500">$</span>
                                            <input
                                                type="number"
                                                name="maximum_discount_amount"
                                                value={formData.maximum_discount_amount}
                                                onChange={handleChange}
                                                placeholder="0.00"
                                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                            />
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">Cap for percentage discounts</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Total Usage Limit</label>
                                        <input
                                            type="number"
                                            name="usage_limit"
                                            value={formData.usage_limit}
                                            onChange={handleChange}
                                            placeholder="Unlimited"
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">Max times this code can be used globally</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Usage Limit Per Customer</label>
                                        <input
                                            type="number"
                                            name="usage_limit_per_customer"
                                            value={formData.usage_limit_per_customer}
                                            onChange={handleChange}
                                            placeholder="Unlimited"
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">Max times per single customer</p>
                                    </div>
                                </div>
                                {/* Usage Count (Read-only) */}
                                {isEditing && (
                                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-gray-700">Current Usage Count</span>
                                            <span className="text-lg font-bold text-[#C5A572]">{formData.usage_count}</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">Number of times this code has been used</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Sidebar Column */}
                <div className="space-y-6">

                    {/* Status & Schedule */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6">Status & Schedule</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                                <input
                                    type="date"
                                    name="startDate"
                                    value={formData.startDate}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-gray-50 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                                <input
                                    type="date"
                                    name="endDate"
                                    value={formData.endDate}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-gray-50 text-sm"
                                />
                                <div className="mt-2 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleQuickDuration(7)}
                                        className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600 bg-white"
                                    >
                                        +7 Days
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleQuickDuration(30)}
                                        className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600 bg-white"
                                    >
                                        +30 Days
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleQuickDuration('EOM')}
                                        className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600 bg-white"
                                    >
                                        End of Month
                                    </button>
                                </div>
                            </div>

                            {/* Toggle Status */}
                            <div className="pt-4 border-t border-gray-100">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, status: prev.status === 'Active' ? 'Draft' : 'Active' }))}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.status === 'Active' ? 'bg-[#C5A572]' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.status === 'Active' ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                <span className="ml-3 text-sm text-gray-700">{formData.status}</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex gap-3">
                            <button onClick={onBack} className="flex-1 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 px-4 py-2 bg-[#C5A572] text-white rounded-lg hover:bg-[#b09060] font-medium transition-colors shadow-sm disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
