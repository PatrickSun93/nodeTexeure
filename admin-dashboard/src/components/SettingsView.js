import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

export default function SettingsView() {
    const t = useTranslations('SettingsView');
    const [storeName, setStoreName] = useState('Noirae Silk & Cashmere');
    const [supportEmail, setSupportEmail] = useState('support@noirae.com');
    const [currency, setCurrency] = useState('USD');
    const [timezone, setTimezone] = useState('EST');
    const [stripeEnabled, setStripeEnabled] = useState(true);
    const [paypalEnabled, setPaypalEnabled] = useState(false);

    // Shipping zones (real rows from GET /api/admin/shipping/zones).
    const [zones, setZones] = useState([]);
    // Add/edit zone modal: null when closed, else { id?, name, countries (string), is_active }.
    const [zoneModal, setZoneModal] = useState(null);
    const [zoneSaving, setZoneSaving] = useState(false);

    // API state
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const truthy = (v) => v === true || v === 'true' || v === '1' || v === 1;

    const loadZones = useCallback(async () => {
        try {
            const { apiFetch } = await import('../utils/api');
            const response = await apiFetch('/api/admin/shipping/zones');
            if (response.status === 'SUCCESS') {
                const z = response.keyValueTable?.find?.((i) => i.zones)?.zones
                    || response.keyValueTable?.[0]?.zones || [];
                setZones(Array.isArray(z) ? z : []);
            }
        } catch (e) {
            console.error('Failed to load shipping zones', e);
        }
    }, []);

    React.useEffect(() => {
        const fetchSettings = async () => {
            const { apiFetch } = await import('../utils/api');

            // General settings (store name / email / currency / timezone).
            try {
                const response = await apiFetch('/api/admin/settings/general');
                if (response.status === 'SUCCESS' && response.keyValueTable?.[0]?.general) {
                    const gen = response.keyValueTable[0].general;
                    setStoreName(gen.storeName || '');
                    setSupportEmail(gen.supportEmail || '');
                    setCurrency(gen.currency || 'USD');
                    setTimezone(gen.timezone || 'UTC');
                }
            } catch (e) {
                console.error("Failed to load settings", e);
            }

            // Payment-gateway enablement flags (payment_stripe_enabled / payment_paypal_enabled).
            try {
                const response = await apiFetch('/api/admin/settings');
                if (response.status === 'SUCCESS') {
                    const list = response.keyValueTable?.find?.((i) => i.settings)?.settings
                        || response.keyValueTable?.[0]?.settings || [];
                    const map = {};
                    (Array.isArray(list) ? list : []).forEach((s) => { map[s.setting_key] = s.setting_value; });
                    if ('payment_stripe_enabled' in map) setStripeEnabled(truthy(map.payment_stripe_enabled));
                    if ('payment_paypal_enabled' in map) setPaypalEnabled(truthy(map.payment_paypal_enabled));
                }
            } catch (e) {
                console.error('Failed to load payment settings', e);
            }

            await loadZones();
            setIsLoading(false);
        };
        fetchSettings();
    }, [loadZones]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { apiFetch } = await import('../utils/api');
            const response = await apiFetch('/api/admin/settings/general', {
                method: 'PUT',
                body: JSON.stringify({
                    storeName, supportEmail, currency, timezone
                })
            });
            if (response.status === 'SUCCESS') {
                alert(t('savedSuccess'));
            } else {
                alert(t('saveFailed'));
            }
        } catch (e) {
            console.error(e);
            alert(t('saveError'));
        } finally {
            setIsSaving(false);
        }
    };

    // Persist a single payment-gateway flag immediately (optimistic; revert on failure).
    const persistGateway = async (key, value) => {
        try {
            const { apiFetch } = await import('../utils/api');
            const response = await apiFetch(`/api/admin/settings/${key}`, {
                method: 'PUT',
                body: JSON.stringify({ value: String(value), type: 'boolean' }),
            });
            return response.status === 'SUCCESS';
        } catch (e) {
            console.error('Gateway update failed', e);
            return false;
        }
    };

    const toggleStripe = async () => {
        const next = !stripeEnabled;
        setStripeEnabled(next);
        if (!(await persistGateway('payment_stripe_enabled', next))) {
            setStripeEnabled(!next);
            alert(t('gatewayUpdateFailed'));
        }
    };

    const togglePaypal = async () => {
        const next = !paypalEnabled;
        setPaypalEnabled(next);
        if (!(await persistGateway('payment_paypal_enabled', next))) {
            setPaypalEnabled(!next);
            alert(t('gatewayUpdateFailed'));
        }
    };

    const saveZone = async () => {
        if (!zoneModal || !zoneModal.name.trim()) { alert(t('zoneNameRequired')); return; }
        setZoneSaving(true);
        try {
            const { apiFetch } = await import('../utils/api');
            const countries = zoneModal.countries.split(',').map((s) => s.trim()).filter(Boolean);
            const path = zoneModal.id ? `/api/admin/shipping/zones/${zoneModal.id}` : '/api/admin/shipping/zones';
            const response = await apiFetch(path, {
                method: zoneModal.id ? 'PUT' : 'POST',
                body: JSON.stringify({ name: zoneModal.name.trim(), countries, is_active: !!zoneModal.is_active }),
            });
            if (response.status === 'SUCCESS') {
                setZoneModal(null);
                await loadZones();
            } else {
                alert(t('zoneSaveFailed'));
            }
        } catch (e) {
            console.error('Save shipping zone failed', e);
            alert(t('zoneSaveFailed'));
        } finally {
            setZoneSaving(false);
        }
    };

    const deleteZone = async (zone) => {
        if (!zone?.id) return;
        if (!confirm(t('confirmDeleteZone', { name: zone.name }))) return;
        try {
            const { apiFetch } = await import('../utils/api');
            const response = await apiFetch(`/api/admin/shipping/zones/${zone.id}`, { method: 'DELETE' });
            if (response.status === 'SUCCESS') {
                await loadZones();
            } else {
                alert(t('zoneDeleteFailed'));
            }
        } catch (e) {
            console.error('Delete shipping zone failed', e);
            alert(t('zoneDeleteFailed'));
        }
    };

    if (isLoading) return <div className="p-8">{t('loadingSettings')}</div>;

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">{t('title')}</h2>
                    <p className="text-gray-500 mt-1">{t('subtitle')}</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm">
                        {t('discard')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isSaving ? t('saving') : t('saveChanges')}
                    </button>
                </div>
            </div>

            <div className="space-y-6 max-w-5xl">

                {/* General Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex justify-between items-center mb-6 border-b border-gray-50 pb-4">
                        <h3 className="text-lg font-bold text-gray-900">{t('generalSettings')}</h3>
                        <span className="text-gray-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('storeName')}</label>
                            <input
                                type="text"
                                value={storeName}
                                onChange={(e) => setStoreName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('supportEmail')}</label>
                            <input
                                type="email"
                                value={supportEmail}
                                onChange={(e) => setSupportEmail(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('defaultCurrency')}</label>
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            >
                                <option value="USD">{t('currencyUsd')}</option>
                                <option value="EUR">{t('currencyEur')}</option>
                                <option value="GBP">{t('currencyGbp')}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('timezone')}</label>
                            <select
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            >
                                <option value="EST">{t('timezoneEst')}</option>
                                <option value="PST">{t('timezonePst')}</option>
                                <option value="GMT">{t('timezoneGmt')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Payment Gateways */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex justify-between items-center mb-6 border-b border-gray-50 pb-4">
                        <h3 className="text-lg font-bold text-gray-900">{t('paymentGateways')}</h3>
                        <span className="text-gray-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                        </span>
                    </div>

                    <div className="space-y-6">
                        {/* Stripe */}
                        <div className="flex items-center justify-between p-4 border border-gray-50 rounded-lg hover:border-gray-100 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-xs">stripe</div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-gray-900">{t('stripePayments')}</h4>
                                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${stripeEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{stripeEnabled ? t('active') : t('inactive')}</span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-0.5">{t('stripeDescription')}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button disabled title={t('configureUnavailable')} className="text-blue-600 font-medium text-sm hover:underline opacity-50 cursor-not-allowed">{t('configure')}</button>
                                <button
                                    onClick={toggleStripe}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${stripeEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                                >
                                    <span
                                        className={`${stripeEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* PayPal */}
                        <div className="flex items-center justify-between p-4 border border-gray-50 rounded-lg hover:border-gray-100 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-700 font-bold text-xs italic">PayPal</div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-gray-900">{t('paypalExpress')}</h4>
                                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${paypalEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{paypalEnabled ? t('active') : t('inactive')}</span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-0.5">{t('paypalDescription')}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button disabled title={t('configureUnavailable')} className="text-blue-600 font-medium text-sm hover:underline opacity-50 cursor-not-allowed">{t('configure')}</button>
                                <button
                                    onClick={togglePaypal}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${paypalEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                                >
                                    <span
                                        className={`${paypalEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Shipping Zones */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-900">{t('shippingZones')}</h3>
                        <button
                            onClick={() => setZoneModal({ name: '', countries: '', is_active: true })}
                            className="text-blue-600 font-medium text-sm hover:underline flex items-center gap-1"
                        >
                            <span>+</span> {t('addZone')}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-50">
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('zoneName')}</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('regions')}</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('status')}</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {zones.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-8 text-center text-sm text-gray-500">
                                            {t('noZonesConfigured')}
                                        </td>
                                    </tr>
                                ) : (
                                    zones.map((zone) => (
                                        <tr key={zone.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{zone.name}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{Array.isArray(zone.countries) ? zone.countries.join(', ') : ''}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded-full ${zone.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                    {zone.is_active ? t('zoneStatusActive') : t('zoneStatusInactive')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-3">
                                                    <button
                                                        onClick={() => setZoneModal({ id: zone.id, name: zone.name || '', countries: Array.isArray(zone.countries) ? zone.countries.join(', ') : '', is_active: !!zone.is_active })}
                                                        title={t('editZone')}
                                                        className="text-gray-400 hover:text-blue-600"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={() => deleteZone(zone)}
                                                        title={t('deleteZone')}
                                                        className="text-gray-400 hover:text-red-600"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            {/* Add / Edit shipping zone modal */}
            {zoneModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900">{zoneModal.id ? t('editZoneTitle') : t('addZoneTitle')}</h2>
                            <button type="button" onClick={() => setZoneModal(null)} className="text-gray-400 hover:text-gray-600 p-1" aria-label={t('cancel')}>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('zoneName')}</label>
                                <input
                                    type="text"
                                    value={zoneModal.name}
                                    onChange={(e) => setZoneModal((z) => ({ ...z, name: e.target.value }))}
                                    placeholder={t('zoneNamePlaceholder')}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('countriesLabel')}</label>
                                <input
                                    type="text"
                                    value={zoneModal.countries}
                                    onChange={(e) => setZoneModal((z) => ({ ...z, countries: e.target.value }))}
                                    placeholder={t('countriesPlaceholder')}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                />
                                <p className="text-xs text-gray-400 mt-1">{t('countriesHelp')}</p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={!!zoneModal.is_active}
                                    onChange={(e) => setZoneModal((z) => ({ ...z, is_active: e.target.checked }))}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                {t('zoneActiveLabel')}
                            </label>
                        </div>
                        <div className="p-4 border-t border-gray-100 flex justify-end gap-3">
                            <button type="button" onClick={() => setZoneModal(null)} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">{t('cancel')}</button>
                            <button type="button" onClick={saveZone} disabled={zoneSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50">
                                {zoneSaving ? t('saving') : t('save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
