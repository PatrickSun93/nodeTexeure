import React, { useState } from 'react';

export default function StaffDetailView({ staff, onBack }) {
    const isEditing = !!staff;
    const [formData, setFormData] = useState(staff || {
        fullName: '',
        phone: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'Admin',
        status: 'Active',
        permissions: {
            manageOrders: true,
            editProducts: true,
            manageCustomers: true,
            viewAnalytics: true,
            editSiteSettings: false,
            manageStaff: false
        }
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
            setFormData(prev => ({
                ...prev,
                permissions: { ...prev.permissions, [name]: checked }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">{isEditing ? 'Edit Staff Account' : 'Add New Staff Account'}</h2>
                <p className="text-gray-500">Create and configure a new staff member's account and permissions.</p>
            </div>

            <div className="space-y-6 max-w-4xl">

                {/* Personal Information */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Personal Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                            <input
                                type="text"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleChange}
                                placeholder="Enter full name"
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number (optional)</label>
                            <input
                                type="text"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                placeholder="Enter phone number"
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                            />
                        </div>
                    </div>
                </div>

                {/* Account Credentials */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Account Credentials</h3>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="Enter email address"
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder="Enter password"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    placeholder="Confirm password"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-gray-50"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Roles & Permissions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Roles & Permissions</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-gray-50"
                            >
                                <option value="Admin">Admin</option>
                                <option value="Manager">Manager</option>
                                <option value="Editor">Editor</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Account Status</label>
                            <div className="flex items-center gap-3 mt-2">
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, status: prev.status === 'Active' ? 'Inactive' : 'Active' }))}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:ring-offset-2 ${formData.status === 'Active' ? 'bg-[#C5A572]' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.status === 'Active' ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                <span className="text-sm text-gray-700">{formData.status}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-4">Permissions</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-8">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="manageOrders" checked={formData.permissions?.manageOrders} onChange={handleChange} className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                                <span className="text-sm text-gray-600">Manage Orders</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="editProducts" checked={formData.permissions?.editProducts} onChange={handleChange} className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                                <span className="text-sm text-gray-600">Edit Products</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="manageCustomers" checked={formData.permissions?.manageCustomers} onChange={handleChange} className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                                <span className="text-sm text-gray-600">Manage Customers</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="viewAnalytics" checked={formData.permissions?.viewAnalytics} onChange={handleChange} className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                                <span className="text-sm text-gray-600">View Analytics</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="editSiteSettings" checked={formData.permissions?.editSiteSettings} onChange={handleChange} className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                                <span className="text-sm text-gray-600">Edit Site Settings</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="manageStaff" checked={formData.permissions?.manageStaff} onChange={handleChange} className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                                <span className="text-sm text-gray-600">Manage Staff</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onBack} className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                        Cancel
                    </button>
                    <button className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium transition-colors shadow-sm">
                        {isEditing ? 'Save Changes' : 'Create Account'}
                    </button>
                </div>

            </div>
        </div>
    );
}
