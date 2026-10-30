import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useNotifications } from './NotificationSystem';

export default function StaffDetailView({ staff, onBack }) {
    const t = useTranslations('StaffDetailView');
    const notify = useNotifications();
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
                notify.warning(t('alertPwMismatch'));
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
                    notify.warning(t('alertPwRequired'));
                    setIsSaving(false);
                    return;
                }
                response = await apiFetch('/api/admin/users', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            }

            if (response.status === 'SUCCESS') {
                notify.success(isEditing ? t('successUpdated') : t('successCreated'));
                if (!isEditing && onBack) onBack(); // Go back on create, stay on edit
            } else {
                notify.error(t('failSave') + (response.message || 'Unknown error'));
            }
        } catch (e) {
            console.error('Save staff failed', e);
            notify.error(t('errorSave'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* ... (Header remains) */}
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">{isEditing ? t('editStaff') : t('addStaff')}</h2>
                <p className="text-gray-500">{t('subtitle')}</p>
            </div>

            <div className="space-y-6 max-w-4xl">
                {/* ... (Sections remain) */}
                {/* Personal Information */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('personalInfo')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('fullName')}</label>
                            <input
                                type="text"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleChange}
                                placeholder={t('fullNamePlaceholder')}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-gray-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('phone')}</label>
                            <input
                                type="text"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                placeholder={t('phonePlaceholder')}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-gray-50"
                            />
                        </div>
                    </div>
                </div>

                {/* Account Credentials */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('accountCredentials')}</h3>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('email')}</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder={t('emailPlaceholder')}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-gray-50"
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('password')}</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder={isEditing ? t('passwordPlaceholderEdit') : t('passwordPlaceholderNew')}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-gray-50"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('confirmPassword')}</label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    placeholder={t('confirmPasswordPlaceholder')}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-gray-50"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Roles & Permissions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('rolesPermissions')}</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('role')}</label>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand bg-gray-50"
                            >
                                <option value="Admin">{t('roleAdmin')}</option>
                                <option value="Manager">{t('roleManager')}</option>
                                <option value="Editor">{t('roleEditor')}</option>
                                <option value="Staff">{t('roleStaff')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('accountStatus')}</label>
                            <div className="flex items-center gap-3 mt-2">
                                <button
                                    onClick={() => setFormData(prev => ({ ...prev, status: prev.status === 'Active' ? 'Inactive' : 'Active' }))}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ${formData.status === 'Active' ? 'bg-brand' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.status === 'Active' ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                <span className="text-sm text-gray-700">{formData.status}</span>
                            </div>
                        </div>
                    </div>

                    {/* Permission checkboxes skipped for brevity as they are not wired to API yet */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-4">{t('permissionsLabel')}</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-8 opacity-50 pointer-events-none">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={true} readOnly className="rounded border-gray-300" />
                                <span className="text-sm text-gray-600">{t('allPermsAdmin')}</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onBack} className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                        {t('cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isSaving ? t('saving') : (isEditing ? t('saveChanges') : t('createAccount'))}
                    </button>
                </div>

            </div>
        </div>
    );
}
