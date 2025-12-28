import React, { useState } from 'react';

export default function PromotionDetailView({ promotion, onBack }) {
    const isEditing = !!promotion;

    // Parse initial details
    const initialDetails = promotion?.discount_details || {};
    // Ensure properly parsed if string (though likely object)
    const details = typeof initialDetails === 'string' ? JSON.parse(initialDetails) : initialDetails;

    const [formData, setFormData] = useState({
        name: promotion?.name || '',
        description: details.description || '',
        code: promotion?.code || '',
        type: promotion?.type ? (promotion.type.charAt(0).toUpperCase() + promotion.type.slice(1).replace('_', ' ')) : 'Percentage',
        value: promotion?.value || '',
        minRequirements: details.min_requirements || details.minRequirements || 'None',
        appliesTo: details.applies_to || details.appliesTo || 'Specific collections',
        status: promotion?.status || 'Draft',
        startDate: promotion?.startDate || '',
        endDate: promotion?.endDate || ''
    });
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
                starts_at: formData.startDate,
                expires_at: formData.endDate,
                is_active: formData.status === 'Active', // We might need to expose Status toggle in this view too
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date & Time</label>
                                <input
                                    type="datetime-local"
                                    name="startDate"
                                    value={formData.startDate}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-gray-50 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">End Date & Time</label>
                                <input
                                    type="datetime-local"
                                    name="endDate"
                                    value={formData.endDate}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-gray-50 text-sm"
                                />
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
