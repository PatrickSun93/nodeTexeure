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
      router.push('/login');
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
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-8">
            <div className="flex items-center space-x-6">
              <div className="h-20 w-20 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">
                  {userData?.first_name?.[0]?.toUpperCase()}{userData?.last_name?.[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900">
                  {userData?.first_name} {userData?.last_name}
                </h1>
                <p className="text-gray-600 mt-1">{userData?.email}</p>
                <div className="flex items-center mt-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active Account
                  </span>
                </div>
              </div>
              <div>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Profile
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button
                      onClick={handleCancel}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">Personal Information</h2>
            
            {error && (
              <div className="mb-4 p-4 rounded-md bg-red-50 border border-red-200">
                <div className="flex">
                  <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {success && (
              <div className="mb-4 p-4 rounded-md bg-green-50 border border-green-200">
                <div className="flex">
                  <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-green-800">{success}</p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* First Name */}
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      !isEditing ? 'bg-gray-50 text-gray-500' : 'bg-white'
                    }`}
                    placeholder="Enter your first name"
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    disabled={!isEditing}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      !isEditing ? 'bg-gray-50 text-gray-500' : 'bg-white'
                    }`}
                    placeholder="Enter your last name"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  disabled={true}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500"
                  placeholder="your.email@example.com"
                />
                <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={!isEditing}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    !isEditing ? 'bg-gray-50 text-gray-500' : 'bg-white'
                  }`}
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Password Section - Only show when editing */}
              {isEditing && (
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-md font-medium text-gray-900 mb-4">Change Password (Optional)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                        New Password
                      </label>
                      <input
                        type="password"
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter new password"
                      />
                    </div>
                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        id="confirmPassword"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button - Only show when editing */}
              {isEditing && (
                <div className="flex justify-end pt-6 border-t border-gray-200">
                  <button
                    type="submit"
                    className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Changes
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Addresses Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
          <div className="px-6 py-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-gray-900">Saved Addresses</h2>
              <button
                onClick={() => {
                  setEditingAddress(null);
                  setAddressFormData({ type: 'shipping', first_name: '', last_name: '', phone: '', address_line_1: '', address_line_2: '', city: '', state: '', postal_code: '', country: 'US', is_default: false });
                  setShowAddressForm(true);
                }}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                + Add Address
              </button>
            </div>

            {showAddressForm && (
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="text-md font-medium text-gray-900 mb-4">{editingAddress ? 'Edit Address' : 'New Address'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select value={addressFormData.type} onChange={e => setAddressFormData(p => ({...p, type: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                      <option value="shipping">Shipping</option>
                      <option value="billing">Billing</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input type="text" value={addressFormData.first_name} onChange={e => setAddressFormData(p => ({...p, first_name: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input type="text" value={addressFormData.last_name} onChange={e => setAddressFormData(p => ({...p, last_name: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="tel" value={addressFormData.phone} onChange={e => setAddressFormData(p => ({...p, phone: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                    <input type="text" value={addressFormData.address_line_1} onChange={e => setAddressFormData(p => ({...p, address_line_1: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                    <input type="text" value={addressFormData.address_line_2} onChange={e => setAddressFormData(p => ({...p, address_line_2: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input type="text" value={addressFormData.city} onChange={e => setAddressFormData(p => ({...p, city: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <input type="text" value={addressFormData.state} onChange={e => setAddressFormData(p => ({...p, state: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                    <input type="text" value={addressFormData.postal_code} onChange={e => setAddressFormData(p => ({...p, postal_code: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                    <input type="text" value={addressFormData.country} onChange={e => setAddressFormData(p => ({...p, country: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="flex items-center">
                      <input type="checkbox" checked={addressFormData.is_default} onChange={e => setAddressFormData(p => ({...p, is_default: e.target.checked}))} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                      <span className="ml-2 text-sm text-gray-700">Set as default address</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => { setShowAddressForm(false); setEditingAddress(null); }} className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button onClick={handleSaveAddress} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Save Address</button>
                </div>
              </div>
            )}

            {addresses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {addresses.map((address) => (
                  <div key={address.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {address.type} Address
                      </span>
                      <div className="flex items-center gap-2">
                        {address.is_default && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Default</span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>{address.first_name} {address.last_name}</p>
                      <p>{address.address?.address_line_1}</p>
                      {address.address?.address_line_2 && <p>{address.address.address_line_2}</p>}
                      <p>{address.address?.city}, {address.address?.state} {address.address?.postal_code}</p>
                      <p>{address.address?.country}</p>
                      {address.phone && <p>Phone: {address.phone}</p>}
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                      <button onClick={() => handleEditAddress(address)} className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
                      {!address.is_default && (
                        <button onClick={() => handleSetDefault(address.id)} className="text-sm text-gray-600 hover:text-gray-800">Set Default</button>
                      )}
                      <button onClick={() => handleDeleteAddress(address.id)} className="text-sm text-red-600 hover:text-red-800">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : !showAddressForm && (
              <p className="text-sm text-gray-500">No saved addresses. Click "Add Address" to add one.</p>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}