'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getErrorMessage } from '@/lib/api';

// Supplier API functions
const supplierAPI = {
  async getSuppliers(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/inventory/suppliers?${queryString}` : 'admin/inventory/suppliers';
    return apiRequest(endpoint);
  },

  async createSupplier(supplierData) {
    return apiRequest('admin/inventory/suppliers', {
      method: 'POST',
      body: JSON.stringify(supplierData),
    });
  },

  async updateSupplier(supplierId, supplierData) {
    return apiRequest(`admin/inventory/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify(supplierData),
    });
  }
};

// Supplier Form Modal Component
function SupplierFormModal({ isOpen, onClose, supplier, onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    contact_email: '',
    contact_phone: '',
    address: {
      company: '',
      address_line_1: '',
      address_line_2: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'US'
    },
    payment_terms: 'Net 30',
    lead_time_days: 7,
    status: 'active',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (supplier) {
        // Edit mode
        setFormData({
          name: supplier.name || '',
          contact_email: supplier.contact_email || '',
          contact_phone: supplier.contact_phone || '',
          address: supplier.address_json ? JSON.parse(supplier.address_json) : {
            company: '',
            address_line_1: '',
            address_line_2: '',
            city: '',
            state: '',
            postal_code: '',
            country: 'US'
          },
          payment_terms: supplier.payment_terms || 'Net 30',
          lead_time_days: supplier.lead_time_days || 7,
          status: supplier.status || 'active',
          notes: supplier.notes || ''
        });
      } else {
        // Create mode
        setFormData({
          name: '',
          contact_email: '',
          contact_phone: '',
          address: {
            company: '',
            address_line_1: '',
            address_line_2: '',
            city: '',
            state: '',
            postal_code: '',
            country: 'US'
          },
          payment_terms: 'Net 30',
          lead_time_days: 7,
          status: 'active',
          notes: ''
        });
      }
    }
  }, [isOpen, supplier]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.contact_email) {
      alert('Name and contact email are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Error submitting supplier:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateAddress = (field, value) => {
    setFormData(prev => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value
      }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {supplier ? 'Edit Supplier' : 'Add New Supplier'}
        </h3>
        
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supplier Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact Email *
              </label>
              <input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact Phone
              </label>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* Address Section */}
          <div className="mb-4">
            <h4 className="text-md font-medium text-gray-700 mb-3">Address Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company
                </label>
                <input
                  type="text"
                  value={formData.address.company}
                  onChange={(e) => updateAddress('company', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address Line 1
                </label>
                <input
                  type="text"
                  value={formData.address.address_line_1}
                  onChange={(e) => updateAddress('address_line_1', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={formData.address.address_line_2}
                  onChange={(e) => updateAddress('address_line_2', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  City
                </label>
                <input
                  type="text"
                  value={formData.address.city}
                  onChange={(e) => updateAddress('city', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  State
                </label>
                <input
                  type="text"
                  value={formData.address.state}
                  onChange={(e) => updateAddress('state', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={formData.address.postal_code}
                  onChange={(e) => updateAddress('postal_code', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Business Terms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Terms
              </label>
              <select
                value={formData.payment_terms}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_terms: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 60">Net 60</option>
                <option value="COD">Cash on Delivery</option>
                <option value="Prepaid">Prepaid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lead Time (Days)
              </label>
              <input
                type="number"
                min="1"
                value={formData.lead_time_days}
                onChange={(e) => setFormData(prev => ({ ...prev, lead_time_days: parseInt(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
              placeholder="Additional notes about this supplier"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : (supplier ? 'Update Supplier' : 'Create Supplier')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuppliersPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // State management
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    status: 'active',
    page: 1,
    limit: 50
  });
  const [pagination, setPagination] = useState({});

  // Modal states
  const [supplierModal, setSupplierModal] = useState({ isOpen: false, supplier: null });

  // Authentication check
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch suppliers
  const fetchSuppliers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await supplierAPI.getSuppliers(filters);

      if (response.success) {
        setSuppliers(response.data.suppliers || []);
        setPagination(response.data.pagination || {});
      } else {
        throw new Error(response.message || 'Failed to fetch suppliers');
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchSuppliers();
    }
  }, [isAuthenticated, fetchSuppliers]);

  // Handle supplier creation
  const handleCreateSupplier = async (supplierData) => {
    try {
      const response = await supplierAPI.createSupplier(supplierData);
      if (response.success) {
        await fetchSuppliers();
        alert('Supplier created successfully!');
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      alert(`Error creating supplier: ${getErrorMessage(err)}`);
      throw err;
    }
  };

  // Handle supplier update
  const handleUpdateSupplier = async (supplierData) => {
    try {
      const response = await supplierAPI.updateSupplier(supplierModal.supplier.id, supplierData);
      if (response.success) {
        await fetchSuppliers();
        alert('Supplier updated successfully!');
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      alert(`Error updating supplier: ${getErrorMessage(err)}`);
      throw err;
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-50';
      case 'inactive': return 'text-gray-600 bg-gray-50';
      case 'suspended': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="admin-spinner"></div>
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="admin-container">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-gray-900">
                Supplier Management
              </h1>
              <nav className="flex items-center space-x-2">
                <a 
                  href="/"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
                >
                  Dashboard
                </a>
                <span className="text-gray-400">/</span>
                <a 
                  href="/inventory"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
                >
                  Inventory
                </a>
                <span className="text-gray-400">/</span>
                <span className="text-sm text-gray-900">Suppliers</span>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSupplierModal({ isOpen: true, supplier: null })}
                className="admin-button admin-button-primary text-sm"
              >
                Add Supplier
              </button>
              <button
                onClick={fetchSuppliers}
                disabled={isLoading}
                className="admin-button admin-button-secondary text-sm"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="admin-container py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Suppliers
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search by name, email, or phone"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setFilters(prev => ({ ...prev, page: 1 }))}
                className="admin-button admin-button-primary w-full"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>

        {/* Suppliers Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Suppliers</h2>
              {pagination.total && (
                <span className="text-sm text-gray-500">
                  {pagination.total} total suppliers
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="admin-spinner mx-auto mb-4"></div>
              <p>Loading suppliers...</p>
            </div>
          ) : suppliers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <span className="text-4xl mb-4 block">📦</span>
              <p>No suppliers found</p>
              <button
                onClick={() => setSupplierModal({ isOpen: true, supplier: null })}
                className="mt-4 admin-button admin-button-primary"
              >
                Add Your First Supplier
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Supplier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Terms
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {suppliers.map((supplier) => {
                    const address = supplier.address_json ? JSON.parse(supplier.address_json) : {};

                    return (
                      <tr key={supplier.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="font-medium text-gray-900">{supplier.name}</p>
                            <p className="text-sm text-gray-500">ID: {supplier.id}</p>
                            {address.city && address.state && (
                              <p className="text-sm text-gray-500">
                                {address.city}, {address.state}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="text-sm text-gray-900">{supplier.contact_email}</p>
                            {supplier.contact_phone && (
                              <p className="text-sm text-gray-500">{supplier.contact_phone}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="text-sm text-gray-900">{supplier.payment_terms}</p>
                            <p className="text-sm text-gray-500">
                              {supplier.lead_time_days} day lead time
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(supplier.status)}`}>
                            {supplier.status?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                          <button
                            onClick={() => setSupplierModal({ isOpen: true, supplier })}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => router.push(`/inventory/purchase-orders?supplier=${supplier.id}`)}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            Orders
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Page {pagination.page} of {pagination.pages}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= pagination.pages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Supplier Form Modal */}
      <SupplierFormModal
        isOpen={supplierModal.isOpen}
        onClose={() => setSupplierModal({ isOpen: false, supplier: null })}
        supplier={supplierModal.supplier}
        onSubmit={supplierModal.supplier ? handleUpdateSupplier : handleCreateSupplier}
      />
    </div>
  );
}