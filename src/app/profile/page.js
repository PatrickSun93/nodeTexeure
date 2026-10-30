'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { extractResponseData, profileAPI, apiRequest } from '../../lib/api';

export default function Profile() {
  const t = useTranslations('Profile');
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [addresses, setAddresses] = useState([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [addressFormData, setAddressFormData] = useState({
    type: 'shipping', first_name: '', last_name: '', phone: '',
    address_line_1: '', address_line_2: '', city: '', state: '', postal_code: '', country: 'US', is_default: false,
  });

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/signin?redirect=/profile');
      return;
    }
    fetchProfile();
  }, [status, session, router]);

  const fetchProfile = async () => {
    try {
      const raw = await profileAPI.get(session.accessToken);
      const parsed = extractResponseData(raw);
      if (parsed.status === 'SUCCESS') {
        const profile = parsed.data || {};
        setUserData(profile);
        setFormData({
          firstName: profile.first_name || '',
          lastName: profile.last_name || '',
          email: profile.email || '',
          phone: profile.phone || '',
          password: '',
          confirmPassword: ''
        });
        setError('');
      } else {
        setError(parsed.message || t('failedFetchProfile'));
      }
    } catch (err) {
      console.error('Error fetching profile', err);
      setError(t('errorFetchProfile'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password && formData.password !== formData.confirmPassword) {
      setError(t('errorPasswordMatch'));
      return;
    }

    try {
      const updateData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone
      };
      if (formData.password) {
        updateData.password = formData.password;
      }

      const raw = await profileAPI.update(session.accessToken, updateData);
      const parsed = extractResponseData(raw);
      if (parsed.status === 'SUCCESS') {
        await fetchProfile();
        setError('');
        setSuccess(t('successProfileUpdated'));
        setIsEditing(false);
        setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      } else {
        setError(parsed.message || t('failedUpdateProfile'));
      }
    } catch (err) {
      console.error('Error updating profile', err);
      setError(t('errorUpdateProfile'));
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      firstName: userData?.first_name || '',
      lastName: userData?.last_name || '',
      email: userData?.email || '',
      phone: userData?.phone || '',
      password: '',
      confirmPassword: ''
    });
    setError('');
    setSuccess('');
  };

  const fetchAddresses = async () => {
    try {
      const data = await apiRequest('/users/addresses', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (data?.status === 'SUCCESS') {
        setAddresses(data.keyValueTable?.addresses || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (session?.accessToken) fetchAddresses();
  }, [session]);

  const handleSaveAddress = async () => {
    try {
      const method = editingAddress ? 'PUT' : 'POST';
      const url = editingAddress ? `/users/addresses/${editingAddress}` : '/users/addresses';
      const data = await apiRequest(url, {
        method,
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify(addressFormData),
      });
      if (data?.status === 'SUCCESS') {
        setShowAddressForm(false);
        setEditingAddress(null);
        fetchAddresses();
        setSuccess(t('successAddressSaved'));
      } else {
        setError(data?.message || t('failedSaveAddress'));
      }
    } catch (err) {
      setError(t('failedSaveAddress'));
    }
  };

  const handleEditAddress = (address) => {
    setEditingAddress(address.id);
    setAddressFormData({
      type: address.type || 'shipping',
      first_name: address.first_name || '',
      last_name: address.last_name || '',
      phone: address.phone || '',
      address_line_1: address.address?.address_line_1 || '',
      address_line_2: address.address?.address_line_2 || '',
      city: address.address?.city || '',
      state: address.address?.state || '',
      postal_code: address.address?.postal_code || '',
      country: address.address?.country || 'US',
      is_default: !!address.is_default,
    });
    setShowAddressForm(true);
  };

  const handleDeleteAddress = async (addressId) => {
    if (!confirm(t('confirmDeleteAddress'))) return;
    try {
      const data = await apiRequest(`/users/addresses/${addressId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (data?.status === 'SUCCESS') {
        fetchAddresses();
        setSuccess(t('successAddressDeleted'));
      }
    } catch { setError(t('failedDeleteAddress')); }
  };

  const handleSetDefault = async (addressId) => {
    try {
      const data = await apiRequest(`/users/addresses/${addressId}/default`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (data?.status === 'SUCCESS') {
        fetchAddresses();
        setSuccess(t('successDefaultUpdated'));
      }
    } catch { setError(t('failedSetDefault')); }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--noirae-bg-cream)', fontFamily: 'var(--noirae-font-sans)' }}>
        <Header />
        <div className="flex items-center justify-center" style={{ padding: '80px 0' }}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--noirae-accent-gold)' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-wrap min-h-screen">
      <style>{`
        .pf-wrap { background: var(--noirae-bg-cream); color: var(--noirae-text-primary); font-family: var(--noirae-font-sans); }
        .pf-title { font-family: var(--noirae-font-serif); font-weight: 500; font-size: 2.375rem; line-height: 1.1; letter-spacing: -0.01em; color: var(--noirae-text-primary); margin: 0; }
        .pf-subtitle { color: var(--noirae-text-secondary); font-size: 0.9375rem; margin-top: 8px; }
        .pf-card { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); }
        .pf-avatar { background: var(--noirae-charcoal); color: var(--noirae-bg-cream); font-family: var(--noirae-font-serif); font-weight: 500; font-size: 1.75rem; }
        .pf-name { font-family: var(--noirae-font-serif); font-weight: 500; font-size: 1.625rem; line-height: 1.15; color: var(--noirae-text-primary); }
        .pf-email { color: var(--noirae-text-secondary); }
        .pf-muted { color: var(--noirae-text-muted); }
        .pf-body { color: var(--noirae-text-secondary); }
        .pf-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--noirae-success); background: var(--noirae-success-bg); padding: 6px 13px; border-radius: 9999px; }
        .pf-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--noirae-success); }
        .pf-section-title { font-family: var(--noirae-font-serif); font-weight: 500; font-size: 1.375rem; line-height: 1.2; color: var(--noirae-text-primary); }
        .pf-sub-title { font-family: var(--noirae-font-serif); font-weight: 500; font-size: 1.125rem; color: var(--noirae-text-primary); }
        .pf-label { display: block; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--noirae-text-muted); }
        .pf-input { width: 100%; background: var(--noirae-bg-cream); border: 1px solid var(--noirae-border-dark); border-radius: 0; padding: 13px 15px; font-size: 14px; color: var(--noirae-text-primary); font-family: var(--noirae-font-sans); transition: border-color .2s ease; }
        .pf-input::placeholder { color: var(--noirae-text-muted); }
        .pf-input:focus { outline: none; border-color: var(--noirae-accent-gold); }
        .pf-input:disabled { background: var(--noirae-bg-light-gray); color: var(--noirae-text-muted); cursor: not-allowed; }
        .pf-hint { font-size: 12px; color: var(--noirae-text-muted); margin-top: 6px; }
        .pf-divider { border-top: 1px solid var(--noirae-border-medium); }
        .pf-btn-outline { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: transparent; color: var(--noirae-text-primary); border: 1px solid var(--noirae-charcoal); border-radius: 0; padding: 9px 18px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-family: var(--noirae-font-sans); cursor: pointer; transition: background .2s ease, color .2s ease; }
        .pf-btn-outline:hover { background: var(--noirae-charcoal); color: var(--noirae-bg-cream); }
        .pf-btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--noirae-charcoal); color: var(--noirae-bg-cream); border: 1px solid var(--noirae-charcoal); border-radius: 0; padding: 13px 26px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-family: var(--noirae-font-sans); cursor: pointer; transition: background .2s ease, border-color .2s ease; }
        .pf-btn-primary:hover { background: var(--noirae-accent-gold); border-color: var(--noirae-accent-gold); }
        .pf-alert { border-radius: 0; padding: 14px 16px; font-size: 14px; }
        .pf-alert-error { background: var(--noirae-error-bg); border: 1px solid var(--noirae-error); color: var(--noirae-error); }
        .pf-alert-success { background: var(--noirae-success-bg); border: 1px solid var(--noirae-success); color: var(--noirae-success); }
        .pf-addr-card { border: 1px solid var(--noirae-border-dark); background: var(--noirae-bg-cream); }
        .pf-addr-form { border: 1px solid var(--noirae-border-dark); background: var(--noirae-bg-light-gray); }
        .pf-tag { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--noirae-text-secondary); }
        .pf-pill-default { display: inline-flex; align-items: center; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--noirae-warning); background: var(--noirae-warning-bg); padding: 4px 10px; border-radius: 9999px; }
        .pf-link { background: transparent; border: none; cursor: pointer; font-size: 12px; letter-spacing: 0.02em; font-family: var(--noirae-font-sans); padding: 0; transition: color .2s ease; }
        .pf-link-primary { color: var(--noirae-text-primary); border-bottom: 1px solid var(--noirae-accent-gold-light); padding-bottom: 2px; }
        .pf-link-primary:hover { color: var(--noirae-accent-gold); }
        .pf-link-muted { color: var(--noirae-text-secondary); }
        .pf-link-muted:hover { color: var(--noirae-text-primary); }
        .pf-link-danger { color: var(--noirae-text-muted); }
        .pf-link-danger:hover { color: var(--noirae-error); }
        .pf-checkbox { accent-color: var(--noirae-accent-gold); }
        /* Page container, matching the other account pages (orders, returns).
           Tailwind's margin/padding/grid utilities are layered and lose to the
           unlayered reset + helpers in aesop-design-system.css, so the ones this
           page uses are restated here, scoped to .pf-wrap. */
        .pf-page { padding: 44px 0 72px; }
        .pf-page .aesop-container { max-width: 1040px; align-items: stretch; }
        .pf-wrap .mb-1 { margin-bottom: 0.25rem; }
        .pf-wrap .mb-2 { margin-bottom: 0.5rem; }
        .pf-wrap .mb-3 { margin-bottom: 0.75rem; }
        .pf-wrap .mb-4 { margin-bottom: 1rem; }
        .pf-wrap .mb-6 { margin-bottom: 1.5rem; }
        .pf-wrap .mb-8 { margin-bottom: 2rem; }
        .pf-wrap .mt-1 { margin-top: 0.25rem; }
        .pf-wrap .mt-3 { margin-top: 0.75rem; }
        .pf-wrap .mt-4 { margin-top: 1rem; }
        .pf-wrap .mt-6 { margin-top: 1.5rem; }
        .pf-wrap .ml-2 { margin-left: 0.5rem; }
        .pf-wrap .ml-3 { margin-left: 0.75rem; }
        .pf-wrap .pt-4 { padding-top: 1rem; }
        .pf-wrap .pt-6 { padding-top: 1.5rem; }
        .pf-wrap .p-5 { padding: 1.25rem; }
        .pf-wrap .px-7 { padding-left: 1.75rem; padding-right: 1.75rem; }
        .pf-wrap .py-7 { padding-top: 1.75rem; padding-bottom: 1.75rem; }
        .pf-wrap .py-8 { padding-top: 2rem; padding-bottom: 2rem; }
        .pf-wrap .gap-2 { gap: 0.5rem; }
        .pf-wrap .gap-4 { gap: 1rem; }
        .pf-wrap .gap-6 { gap: 1.5rem; }
        .pf-wrap .space-y-1 > * { margin-top: 0; margin-bottom: 0; }
        .pf-wrap .space-y-1 > :not(:last-child) { margin-bottom: 0.25rem; }
        .pf-wrap .space-y-6 > :not(:last-child) { margin-bottom: 1.5rem; }
        @media (min-width: 768px) {
          .pf-wrap .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .pf-wrap .md\\:col-span-2 { grid-column: span 2 / span 2; }
        }
        @media (max-width: 640px) {
          .pf-wrap .px-7 { padding-left: 1.25rem; padding-right: 1.25rem; }
        }
      `}</style>
      <Header />

      <main className="pf-page">
        <div className="aesop-container">
          {/* Page Heading */}
          <div className="mb-8">
            <h1 className="pf-title">{t('pageTitle')}</h1>
            <p className="pf-subtitle">
              {userData?.first_name ? t('greetingNamed', { name: userData.first_name }) : t('greeting')}
            </p>
          </div>

          {/* Profile Header */}
          <div className="pf-card mb-6">
            <div className="px-7 py-8">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="pf-avatar h-20 w-20 rounded-full flex items-center justify-center flex-none">
                  <span>
                    {userData?.first_name?.[0]?.toUpperCase()}{userData?.last_name?.[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <h2 className="pf-name">
                    {userData?.first_name} {userData?.last_name}
                  </h2>
                  <p className="pf-email mt-1">{userData?.email}</p>
                  <div className="flex items-center mt-3">
                    <span className="pf-badge">
                      <span className="pf-badge-dot"></span>
                      {t('statusActive')}
                    </span>
                  </div>
                </div>
                <div>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="pf-btn-outline"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {t('editProfile')}
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancel}
                        className="pf-btn-outline"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Profile Form */}
          <div className="pf-card">
            <div className="px-7 py-7">
              <h2 className="pf-section-title mb-6">{t('personalInformation')}</h2>

              {error && (
                <div className="pf-alert pf-alert-error mb-4">
                  <div className="flex">
                    <svg className="h-5 w-5 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="ml-3">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {success && (
                <div className="pf-alert pf-alert-success mb-4">
                  <div className="flex">
                    <svg className="h-5 w-5 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="ml-3">
                      <p>{success}</p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* First Name */}
                  <div>
                    <label htmlFor="firstName" className="pf-label mb-2">
                      {t('firstNameLabel')}
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="pf-input"
                      placeholder={t('firstNamePlaceholder')}
                    />
                  </div>

                  {/* Last Name */}
                  <div>
                    <label htmlFor="lastName" className="pf-label mb-2">
                      {t('lastNameLabel')}
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      disabled={!isEditing}
                      className="pf-input"
                      placeholder={t('lastNamePlaceholder')}
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="pf-label mb-2">
                    {t('emailLabel')}
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    disabled={true}
                    className="pf-input"
                    placeholder={t('emailPlaceholder')}
                  />
                  <p className="pf-hint">{t('emailHint')}</p>
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="pf-label mb-2">
                    {t('phoneLabel')}
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className="pf-input"
                    placeholder={t('phonePlaceholder')}
                  />
                </div>

                {/* Password Section - Only show when editing */}
                {isEditing && (
                  <div className="pf-divider pt-6">
                    <h3 className="pf-sub-title mb-4">{t('changePasswordTitle')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="password" className="pf-label mb-2">
                          {t('newPasswordLabel')}
                        </label>
                        <input
                          type="password"
                          id="password"
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          className="pf-input"
                          placeholder={t('newPasswordPlaceholder')}
                        />
                      </div>
                      <div>
                        <label htmlFor="confirmPassword" className="pf-label mb-2">
                          {t('confirmPasswordLabel')}
                        </label>
                        <input
                          type="password"
                          id="confirmPassword"
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          className="pf-input"
                          placeholder={t('confirmPasswordPlaceholder')}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Button - Only show when editing */}
                {isEditing && (
                  <div className="flex justify-end pt-6 pf-divider">
                    <button
                      type="submit"
                      className="pf-btn-primary"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {t('saveChanges')}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Addresses Section */}
          <div className="pf-card mt-6">
            <div className="px-7 py-7">
              <div className="flex items-center justify-between mb-6">
                <h2 className="pf-section-title">{t('savedAddresses')}</h2>
                <button
                  onClick={() => {
                    setEditingAddress(null);
                    setAddressFormData({ type: 'shipping', first_name: '', last_name: '', phone: '', address_line_1: '', address_line_2: '', city: '', state: '', postal_code: '', country: 'US', is_default: false });
                    setShowAddressForm(true);
                  }}
                  className="pf-btn-outline"
                >
                  {t('addAddress')}
                </button>
              </div>

              {showAddressForm && (
                <div className="pf-addr-form p-5 mb-4">
                  <h3 className="pf-sub-title mb-4">{editingAddress ? t('editAddress') : t('newAddress')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="pf-label mb-1">{t('typeLabel')}</label>
                      <select value={addressFormData.type} onChange={e => setAddressFormData(p => ({...p, type: e.target.value}))} className="pf-input">
                        <option value="shipping">{t('typeShipping')}</option>
                        <option value="billing">{t('typeBilling')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="pf-label mb-1">{t('firstNameLabel')}</label>
                      <input type="text" value={addressFormData.first_name} onChange={e => setAddressFormData(p => ({...p, first_name: e.target.value}))} className="pf-input" />
                    </div>
                    <div>
                      <label className="pf-label mb-1">{t('lastNameLabel')}</label>
                      <input type="text" value={addressFormData.last_name} onChange={e => setAddressFormData(p => ({...p, last_name: e.target.value}))} className="pf-input" />
                    </div>
                    <div>
                      <label className="pf-label mb-1">{t('phoneShortLabel')}</label>
                      <input type="tel" value={addressFormData.phone} onChange={e => setAddressFormData(p => ({...p, phone: e.target.value}))} className="pf-input" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="pf-label mb-1">{t('addressLine1Label')}</label>
                      <input type="text" value={addressFormData.address_line_1} onChange={e => setAddressFormData(p => ({...p, address_line_1: e.target.value}))} className="pf-input" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="pf-label mb-1">{t('addressLine2Label')}</label>
                      <input type="text" value={addressFormData.address_line_2} onChange={e => setAddressFormData(p => ({...p, address_line_2: e.target.value}))} className="pf-input" />
                    </div>
                    <div>
                      <label className="pf-label mb-1">{t('cityLabel')}</label>
                      <input type="text" value={addressFormData.city} onChange={e => setAddressFormData(p => ({...p, city: e.target.value}))} className="pf-input" />
                    </div>
                    <div>
                      <label className="pf-label mb-1">{t('stateLabel')}</label>
                      <input type="text" value={addressFormData.state} onChange={e => setAddressFormData(p => ({...p, state: e.target.value}))} className="pf-input" />
                    </div>
                    <div>
                      <label className="pf-label mb-1">{t('postalCodeLabel')}</label>
                      <input type="text" value={addressFormData.postal_code} onChange={e => setAddressFormData(p => ({...p, postal_code: e.target.value}))} className="pf-input" />
                    </div>
                    <div>
                      <label className="pf-label mb-1">{t('countryLabel')}</label>
                      <input type="text" value={addressFormData.country} onChange={e => setAddressFormData(p => ({...p, country: e.target.value}))} className="pf-input" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="flex items-center">
                        <input type="checkbox" checked={addressFormData.is_default} onChange={e => setAddressFormData(p => ({...p, is_default: e.target.checked}))} className="pf-checkbox h-4 w-4" />
                        <span className="ml-2 text-sm pf-body">{t('setAsDefault')}</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => { setShowAddressForm(false); setEditingAddress(null); }} className="pf-btn-outline">{t('cancel')}</button>
                    <button onClick={handleSaveAddress} className="pf-btn-primary">{t('saveAddress')}</button>
                  </div>
                </div>
              )}

              {addresses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map((address) => (
                    <div key={address.id} className="pf-addr-card p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="pf-tag capitalize">
                          {address.type}
                        </span>
                        <div className="flex items-center gap-2">
                          {!!address.is_default && (
                            <span className="pf-pill-default">{t('defaultPill')}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-sm pf-body space-y-1" style={{ lineHeight: 1.7 }}>
                        <p style={{ color: 'var(--noirae-text-primary)' }}>{address.first_name} {address.last_name}</p>
                        <p>{address.address?.address_line_1}</p>
                        {address.address?.address_line_2 && <p>{address.address.address_line_2}</p>}
                        <p>{address.address?.city}, {address.address?.state} {address.address?.postal_code}</p>
                        <p>{address.address?.country}</p>
                        {address.phone && <p>{t('phoneValue', { phone: address.phone })}</p>}
                      </div>
                      <div className="flex gap-4 mt-4 pt-4 pf-divider">
                        <button onClick={() => handleEditAddress(address)} className="pf-link pf-link-primary">{t('edit')}</button>
                        {!address.is_default && (
                          <button onClick={() => handleSetDefault(address.id)} className="pf-link pf-link-muted">{t('setDefault')}</button>
                        )}
                        <button onClick={() => handleDeleteAddress(address.id)} className="pf-link pf-link-danger">{t('delete')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showAddressForm && (
                <p className="text-sm pf-muted">{t('noAddresses')}</p>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
