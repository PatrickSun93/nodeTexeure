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

    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (formData.password && formData.password !== formData.confirmPassword) {
                alert('Passwords do not match');
                setIsSaving(false);
                return;
            }

            const { apiFetch } = await import('../utils/api');
            const nameParts = formData.fullName.split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || '';

            const payload = {
                first_name: firstName,
                last_name: lastName,
                email: formData.email,
                phone: formData.phone,
                role: formData.role.toLowerCase(),
                status: formData.status.toLowerCase(),
            };

            if (formData.password) {
                payload.password = formData.password;
            }

            let response;
            if (isEditing) {
                response = await apiFetch(`/api/admin/users/${staff.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
            } else {
                if (!formData.password) {
                    alert('Password is required for new accounts');
                    setIsSaving(false);
                    return;
                }
                response = await apiFetch('/api/admin/users', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            }

            if (response.status === 'SUCCESS') {
                alert(isEditing ? 'Staff updated successfully' : 'Staff created successfully');
                if (!isEditing && onBack) onBack(); // Go back on create, stay on edit
            } else {
                alert('Failed to save staff account: ' + (response.message || 'Unknown error'));
            }
        } catch (e) {
            console.error('Save staff failed', e);
            alert('Error saving staff account');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* ... (Header remains) */}
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">{isEditing ? 'Edit Staff Account' : 'Add New Staff Account'}</h2>
                <p className="text-gray-500">Create and configure a new staff member's account and permissions.</p>
            </div>

            <div className="space-y-6 max-w-4xl">
                {/* ... (Sections remain) */}
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
                                    placeholder={isEditing ? "(Leave blank to keep current)" : "Enter password"}
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
                                <option value="Staff">Staff</option>
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

                    {/* Permission checkboxes skipped for brevity as they are not wired to API yet */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-4">Permissions (Not implemented in backend)</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-8 opacity-50 pointer-events-none">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={true} readOnly className="rounded border-gray-300" />
                                <span className="text-sm text-gray-600">All permissions enabled for Admin</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onBack} className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Account')}
                    </button>
                </div>

            </div>
        </div>
    );
}
