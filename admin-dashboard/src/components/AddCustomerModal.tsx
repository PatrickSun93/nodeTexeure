'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { AuthError } from '@/utils/api';

interface CustomerForm {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    password: string;
}

// Minimal create-customer form wired to the real backend endpoint:
//   POST /api/admin/users  (defaults role -> 'customer', status -> 'active')
// Writes go through the CSRF-aware apiFetch (utils/api).
export default function AddCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
    const t = useTranslations('AddCustomerModal');
    const [form, setForm] = useState<CustomerForm>({ first_name: '', last_name: '', email: '', phone: '', password: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const update = (key: keyof CustomerForm) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!form.first_name || !form.last_name || !form.email || !form.password) {
            setError(t('requiredFields'));
            return;
        }
        setIsSaving(true);
        try {
            const { apiFetch } = await import('../utils/api');
            const response = await apiFetch('/api/admin/users', {
                method: 'POST',
                body: JSON.stringify({
                    first_name: form.first_name,
                    last_name: form.last_name,
                    email: form.email,
                    phone: form.phone || null,
                    password: form.password,
                    role: 'customer',
                    status: 'active',
                }),
            });
            if (response.status === 'SUCCESS') {
                onCreated && onCreated();
            } else {
                setError(response.message || t('createFailed'));
            }
        } catch (err) {
            console.error('Create customer failed', err);
            setError((err as Partial<AuthError>)?.data?.message || t('createFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <form onSubmit={handleSubmit}>
                    <div className="flex justify-between items-center p-6 border-b border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900">{t('title')}</h2>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label={t('close')}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('firstName')}</label>
                                <input value={form.first_name} onChange={update('first_name')} className={inputClass} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('lastName')}</label>
                                <input value={form.last_name} onChange={update('last_name')} className={inputClass} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                            <input type="email" value={form.email} onChange={update('email')} className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('phoneOptional')}</label>
                            <input value={form.phone} onChange={update('phone')} className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('temporaryPassword')}</label>
                            <input type="password" value={form.password} onChange={update('password')} className={inputClass} />
                        </div>
                    </div>
                    <div className="p-4 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">{t('cancel')}</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50">
                            {isSaving ? t('creating') : t('createCustomer')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
