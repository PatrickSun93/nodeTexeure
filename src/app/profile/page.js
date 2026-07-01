'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { extractResponseData, profileAPI, apiRequest } from '../../lib/api';

export default function Profile() {
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
        setError(parsed.message || 'Failed to fetch profile');
      }
    } catch (err) {
      console.error('Error fetching profile', err);
      setError('Error fetching profile');
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
      setError('Passwords do not match');
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
        setSuccess('Profile updated successfully!');
        setIsEditing(false);
        setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      } else {
        setError(parsed.message || 'Failed to update profile');
      }
    } catch (err) {
      console.error('Error updating profile', err);
      setError('Error updating profile');
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
        setSuccess('Address saved successfully');
      } else {
        setError(data?.message || 'Failed to save address');
      }
    } catch (err) {
      setError('Failed to save address');
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
    if (!confirm('Delete this address?')) return;
    try {
      const data = await apiRequest(`/users/addresses/${addressId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (data?.status === 'SUCCESS') {
        fetchAddresses();
        setSuccess('Address deleted');
      }
    } catch { setError('Failed to delete address'); }
  };

  const handleSetDefault = async (addressId) => {
    try {
      const data = await apiRequest(`/users/addresses/${addressId}/default`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (data?.status === 'SUCCESS') {
        fetchAddresses();
        setSuccess('Default address updated');
      }
    } catch { setError('Failed to set default'); }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--noirae-bg-cream)', fontFamily: 'var(--noirae-font-sans)' }}>
        <Header />
        <div className="flex items-center justify-center py-20">
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
      `}</style>
      <Header />

      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Page Heading */}
        <div className="mb-8">
          <h1 className="pf-title">My Account</h1>
          <p className="pf-subtitle">
            {userData?.first_name ? `Hello, ${userData.first_name} — welcome back.` : 'Welcome back.'}
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
                    Active
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
                    Edit Profile
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancel}
                      className="pf-btn-outline"
                    >
                      Cancel
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
            <h2 className="pf-section-title mb-6">Personal Information</h2>

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
                    First Name
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className="pf-input"
                    placeholder="Enter your first name"
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label htmlFor="lastName" className="pf-label mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className="pf-input"
                    placeholder="Enter your last name"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="pf-label mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  disabled={true}
                  className="pf-input"
                  placeholder="your.email@example.com"
                />
                <p className="pf-hint">Email cannot be changed</p>
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="pf-label mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={!isEditing}
                  className="pf-input"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Password Section - Only show when editing */}
              {isEditing && (
                <div className="pf-divider pt-6">
                  <h3 className="pf-sub-title mb-4">Change Password (Optional)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="password" className="pf-label mb-2">
                        New Password
                      </label>
                      <input
                        type="password"
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        className="pf-input"
                        placeholder="Enter new password"
                      />
                    </div>
                    <div>
                      <label htmlFor="confirmPassword" className="pf-label mb-2">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        id="confirmPassword"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className="pf-input"
                        placeholder="Confirm new password"
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
                    Save Changes
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
              <h2 className="pf-section-title">Saved Addresses</h2>
              <button
                onClick={() => {
                  setEditingAddress(null);
                  setAddressFormData({ type: 'shipping', first_name: '', last_name: '', phone: '', address_line_1: '', address_line_2: '', city: '', state: '', postal_code: '', country: 'US', is_default: false });
                  setShowAddressForm(true);
                }}
                className="pf-btn-outline"
              >
                + Add Address
              </button>
            </div>

            {showAddressForm && (
              <div className="pf-addr-form p-5 mb-4">
                <h3 className="pf-sub-title mb-4">{editingAddress ? 'Edit Address' : 'New Address'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="pf-label mb-1">Type</label>
                    <select value={addressFormData.type} onChange={e => setAddressFormData(p => ({...p, type: e.target.value}))} className="pf-input">
                      <option value="shipping">Shipping</option>
                      <option value="billing">Billing</option>
                    </select>
                  </div>
                  <div>
                    <label className="pf-label mb-1">First Name</label>
                    <input type="text" value={addressFormData.first_name} onChange={e => setAddressFormData(p => ({...p, first_name: e.target.value}))} className="pf-input" />
                  </div>
                  <div>
                    <label className="pf-label mb-1">Last Name</label>
                    <input type="text" value={addressFormData.last_name} onChange={e => setAddressFormData(p => ({...p, last_name: e.target.value}))} className="pf-input" />
                  </div>
                  <div>
                    <label className="pf-label mb-1">Phone</label>
                    <input type="tel" value={addressFormData.phone} onChange={e => setAddressFormData(p => ({...p, phone: e.target.value}))} className="pf-input" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="pf-label mb-1">Address Line 1</label>
                    <input type="text" value={addressFormData.address_line_1} onChange={e => setAddressFormData(p => ({...p, address_line_1: e.target.value}))} className="pf-input" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="pf-label mb-1">Address Line 2</label>
                    <input type="text" value={addressFormData.address_line_2} onChange={e => setAddressFormData(p => ({...p, address_line_2: e.target.value}))} className="pf-input" />
                  </div>
                  <div>
                    <label className="pf-label mb-1">City</label>
                    <input type="text" value={addressFormData.city} onChange={e => setAddressFormData(p => ({...p, city: e.target.value}))} className="pf-input" />
                  </div>
                  <div>
                    <label className="pf-label mb-1">State</label>
                    <input type="text" value={addressFormData.state} onChange={e => setAddressFormData(p => ({...p, state: e.target.value}))} className="pf-input" />
                  </div>
                  <div>
                    <label className="pf-label mb-1">Postal Code</label>
                    <input type="text" value={addressFormData.postal_code} onChange={e => setAddressFormData(p => ({...p, postal_code: e.target.value}))} className="pf-input" />
                  </div>
                  <div>
                    <label className="pf-label mb-1">Country</label>
                    <input type="text" value={addressFormData.country} onChange={e => setAddressFormData(p => ({...p, country: e.target.value}))} className="pf-input" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="flex items-center">
                      <input type="checkbox" checked={addressFormData.is_default} onChange={e => setAddressFormData(p => ({...p, is_default: e.target.checked}))} className="pf-checkbox h-4 w-4" />
                      <span className="ml-2 text-sm pf-body">Set as default address</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => { setShowAddressForm(false); setEditingAddress(null); }} className="pf-btn-outline">Cancel</button>
                  <button onClick={handleSaveAddress} className="pf-btn-primary">Save Address</button>
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
                        {address.is_default && (
                          <span className="pf-pill-default">Default</span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm pf-body space-y-1" style={{ lineHeight: 1.7 }}>
                      <p style={{ color: 'var(--noirae-text-primary)' }}>{address.first_name} {address.last_name}</p>
                      <p>{address.address?.address_line_1}</p>
                      {address.address?.address_line_2 && <p>{address.address.address_line_2}</p>}
                      <p>{address.address?.city}, {address.address?.state} {address.address?.postal_code}</p>
                      <p>{address.address?.country}</p>
                      {address.phone && <p>Phone: {address.phone}</p>}
                    </div>
                    <div className="flex gap-4 mt-4 pt-4 pf-divider">
                      <button onClick={() => handleEditAddress(address)} className="pf-link pf-link-primary">Edit</button>
                      {!address.is_default && (
                        <button onClick={() => handleSetDefault(address.id)} className="pf-link pf-link-muted">Set Default</button>
                      )}
                      <button onClick={() => handleDeleteAddress(address.id)} className="pf-link pf-link-danger">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : !showAddressForm && (
              <p className="text-sm pf-muted">No saved addresses. Click &quot;Add Address&quot; to add one.</p>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
