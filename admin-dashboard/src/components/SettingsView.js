import React, { useState } from 'react';

export default function SettingsView() {
    const [storeName, setStoreName] = useState('Noirae Silk & Cashmere');
    const [supportEmail, setSupportEmail] = useState('support@noirae.com');
    const [currency, setCurrency] = useState('USD');
    const [timezone, setTimezone] = useState('EST');
    const [stripeEnabled, setStripeEnabled] = useState(true);
    const [paypalEnabled, setPaypalEnabled] = useState(false);

    // API state
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    React.useEffect(() => {
        const fetchSettings = async () => {
            try {
                const { apiFetch } = await import('../utils/api');
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
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

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
                alert('Settings saved successfully');
            } else {
                alert('Failed to save settings');
            }
        } catch (e) {
            console.error(e);
            alert('Error saving settings');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-8">Loading settings...</div>;

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Settings & Configurations</h2>
                    <p className="text-gray-500 mt-1">Manage store preferences, payments, and shipping logic.</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm">
                        Discard
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className="space-y-6 max-w-5xl">

                {/* General Settings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex justify-between items-center mb-6 border-b border-gray-50 pb-4">
                        <h3 className="text-lg font-bold text-gray-900">General Settings</h3>
                        <span className="text-gray-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
                            <input
                                type="text"
                                value={storeName}
                                onChange={(e) => setStoreName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
                            <input
                                type="email"
                                value={supportEmail}
                                onChange={(e) => setSupportEmail(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Default Currency</label>
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            >
                                <option value="USD">USD - US Dollar</option>
                                <option value="EUR">EUR - Euro</option>
                                <option value="GBP">GBP - British Pound</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                            <select
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            >
                                <option value="EST">EST (UTC-5)</option>
                                <option value="PST">PST (UTC-8)</option>
                                <option value="GMT">GMT (UTC+0)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Payment Gateways */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex justify-between items-center mb-6 border-b border-gray-50 pb-4">
                        <h3 className="text-lg font-bold text-gray-900">Payment Gateways</h3>
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
                                        <h4 className="font-bold text-gray-900">Stripe Payments</h4>
                                        <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded-full">ACTIVE</span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-0.5">Accept credit cards, Apple Pay, and Google Pay.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button className="text-blue-600 font-medium text-sm hover:underline">Configure</button>
                                <button
                                    onClick={() => setStripeEnabled(!stripeEnabled)}
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
                                        <h4 className="font-bold text-gray-900">PayPal Express</h4>
                                        <span className="px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-600 rounded-full">INACTIVE</span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-0.5">Express checkout for PayPal users.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button className="text-blue-600 font-medium text-sm hover:underline">Configure</button>
                                <button
                                    onClick={() => setPaypalEnabled(!paypalEnabled)}
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
                        <h3 className="text-lg font-bold text-gray-900">Shipping Zones</h3>
                        <button className="text-blue-600 font-medium text-sm hover:underline flex items-center gap-1">
                            <span>+</span> Add Zone
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-50">
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Zone Name</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Regions</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                <tr className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Domestic (US)</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">United States (50 states)</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">Free</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-gray-400 hover:text-blue-600">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                    </td>
                                </tr>
                                <tr className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">International - EU</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">France, Germany, Italy, +24</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">$25.00 Flat Rate</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-gray-400 hover:text-blue-600">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
