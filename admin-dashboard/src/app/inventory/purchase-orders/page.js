'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getErrorMessage } from '@/lib/api';
import { useTranslations } from 'next-intl';

// Purchase Order API functions
const purchaseOrderAPI = {
  async getPurchaseOrders(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/inventory/purchase-orders?${queryString}` : 'admin/inventory/purchase-orders';
    return apiRequest(endpoint);
  },

  async getPurchaseOrder(poId) {
    return apiRequest(`admin/inventory/purchase-orders/${poId}`);
  },

  async createPurchaseOrder(poData) {
    return apiRequest('admin/inventory/purchase-orders', {
      method: 'POST',
      body: JSON.stringify(poData),
    });
  },

  async updatePurchaseOrderStatus(poId, status, notes) {
    return apiRequest(`admin/inventory/purchase-orders/${poId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes }),
    });
  },

  async getSuppliers() {
    return apiRequest('admin/inventory/suppliers?status=active&limit=100');
  },

  async getInventory(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `admin/inventory?${queryString}` : 'admin/inventory';
    return apiRequest(endpoint);
  }
};

// Purchase Order Form Modal Component
function PurchaseOrderFormModal({ isOpen, onClose, onSubmit }) {
  const t = useTranslations('PurchaseOrders');
  const [formData, setFormData] = useState({
    supplier_id: '',
    items: [],
    notes: '',
    expected_delivery_date: ''
  });
  const [suppliers, setSuppliers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showProductSelector, setShowProductSelector] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSuppliers();
      fetchInventory();
      setFormData({
        supplier_id: '',
        items: [],
        notes: '',
        expected_delivery_date: ''
      });
    }
  }, [isOpen]);

  const fetchSuppliers = async () => {
    try {
      const response = await purchaseOrderAPI.getSuppliers();
      if (response.success) {
        setSuppliers(response.data.suppliers || []);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await purchaseOrderAPI.getInventory({ limit: 200 });
      if (response.success) {
        setInventory(response.data.inventory || []);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const addItem = (inventoryItem) => {
    const existingItemIndex = formData.items.findIndex(
      item => item.product_id === inventoryItem.product_id && item.variant_id === inventoryItem.variant_id
    );

    if (existingItemIndex >= 0) {
      // Update existing item quantity
      const updatedItems = [...formData.items];
      updatedItems[existingItemIndex].quantity += 1;
      setFormData(prev => ({ ...prev, items: updatedItems }));
    } else {
      // Add new item
      const newItem = {
        product_id: inventoryItem.product_id,
        variant_id: inventoryItem.variant_id,
        product_name: inventoryItem.product_name,
        product_sku: inventoryItem.product_sku,
        size: inventoryItem.size,
        color: inventoryItem.color,
        pattern: inventoryItem.pattern,
        quantity: inventoryItem.reorder_quantity || 10,
        unit_cost: 0
      };
      setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    }
    setShowProductSelector(false);
  };

  const updateItem = (index, field, value) => {
    const updatedItems = [...formData.items];
    updatedItems[index][field] = field === 'quantity' || field === 'unit_cost' ? parseFloat(value) || 0 : value;
    setFormData(prev => ({ ...prev, items: updatedItems }));
  };

  const removeItem = (index) => {
    const updatedItems = formData.items.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, items: updatedItems }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.supplier_id || formData.items.length === 0) {
      alert(t('selectSupplierAndItem'));
      return;
    }

    // Validate all items have unit costs
    const invalidItems = formData.items.filter(item => !item.unit_cost || item.unit_cost <= 0);
    if (invalidItems.length > 0) {
      alert(t('setUnitCostsForAllItems'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Error submitting purchase order:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalAmount = formData.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{t('createPurchaseOrder')}</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('supplierRequired')}
              </label>
              <select
                value={formData.supplier_id}
                onChange={(e) => setFormData(prev => ({ ...prev, supplier_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">{t('selectSupplier')}</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('expectedDeliveryDate')}
              </label>
              <input
                type="date"
                value={formData.expected_delivery_date}
                onChange={(e) => setFormData(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Items Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-md font-medium text-gray-700">{t('items')}</h4>
              <button
                type="button"
                onClick={() => setShowProductSelector(true)}
                className="admin-button admin-button-secondary text-sm"
              >
                {t('addItem')}
              </button>
            </div>

            {formData.items.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                <p>{t('noItemsAddedYet')}</p>
                <button
                  type="button"
                  onClick={() => setShowProductSelector(true)}
                  className="mt-2 text-blue-600 hover:text-blue-800"
                >
                  {t('addYourFirstItem')}
                </button>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('product')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('quantity')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('unitCost')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('total')}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {formData.items.map((item, index) => {
                      const variant = item.size || item.color || item.pattern ? 
                        `${item.size || ''} ${item.color || ''} ${item.pattern || ''}`.trim() : 
                        null;

                      return (
                        <tr key={index}>
                          <td className="px-4 py-2">
                            <div>
                              <p className="font-medium text-sm">{item.product_name}</p>
                              <p className="text-xs text-gray-500">{t('sku', { sku: item.product_sku })}</p>
                              {variant && (
                                <p className="text-xs text-gray-500">{t('variant', { variant })}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_cost}
                              onChange={(e) => updateItem(index, 'unit_cost', e.target.value)}
                              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-4 py-2 text-sm">
                            ${(item.quantity * item.unit_cost).toFixed(2)}
                          </td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              {t('remove')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan="3" className="px-4 py-2 text-right font-medium">{t('totalAmount')}</td>
                      <td className="px-4 py-2 font-bold">${totalAmount.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('notes')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
              placeholder={t('notesPlaceholder')}
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? t('creating') : t('createPurchaseOrder')}
            </button>
          </div>
        </form>

        {/* Product Selector Modal */}
        {showProductSelector && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h4 className="text-lg font-semibold mb-4">{t('selectProducts')}</h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {inventory.map((item) => {
                  const variant = item.size || item.color || item.pattern ? 
                    `${item.size || ''} ${item.color || ''} ${item.pattern || ''}`.trim() : 
                    'Base Product';

                  return (
                    <div
                      key={`${item.product_id}-${item.variant_id || 'base'}`}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                      onClick={() => addItem(item)}
                    >
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-gray-500">{t('sku', { sku: item.product_sku })}</p>
                        {variant !== 'Base Product' && (
                          <p className="text-sm text-gray-500">{t('variant', { variant })}</p>
                        )}
                        <p className="text-sm text-gray-500">
                          {t('stockReorder', { stock: item.quantity_available, reorder: item.reorder_point })}
                        </p>
                      </div>
                      <button className="text-blue-600 hover:text-blue-800 font-medium">
                        {t('add')}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowProductSelector(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PurchaseOrdersPage() {
  const t = useTranslations('PurchaseOrders');
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>{t('loading')}</div>}>
      <PurchaseOrdersContent />
    </Suspense>
  );
}

function PurchaseOrdersContent() {
  const t = useTranslations('PurchaseOrders');
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // State management
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    supplier_id: searchParams.get('supplier') || '',
    page: 1,
    limit: 50
  });
  const [pagination, setPagination] = useState({});
  const [suppliers, setSuppliers] = useState([]);

  // Modal states
  const [poModal, setPoModal] = useState({ isOpen: false });

  // Authentication check
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch purchase orders
  const fetchPurchaseOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await purchaseOrderAPI.getPurchaseOrders(filters);

      if (response.success) {
        setPurchaseOrders(response.data.purchase_orders || []);
        setPagination(response.data.pagination || {});
      } else {
        throw new Error(response.message || t('failedToFetchPurchaseOrders'));
      }
    } catch (err) {
      console.error('Error fetching purchase orders:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [filters, t]);

  // Fetch suppliers for filter
  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await purchaseOrderAPI.getSuppliers();
      if (response.success) {
        setSuppliers(response.data.suppliers || []);
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchPurchaseOrders();
      fetchSuppliers();
    }
  }, [isAuthenticated, fetchPurchaseOrders, fetchSuppliers]);

  // Handle purchase order creation
  const handleCreatePurchaseOrder = async (poData) => {
    try {
      const response = await purchaseOrderAPI.createPurchaseOrder(poData);
      if (response.success) {
        await fetchPurchaseOrders();
        alert(t('poCreatedSuccess', { poNumber: response.data.po_number }));
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      alert(t('errorCreatingPo', { error: getErrorMessage(err) }));
      throw err;
    }
  };

  // Handle status update
  const handleStatusUpdate = async (poId, status) => {
    const notes = prompt(t('updateStatusPrompt', { status }));
    if (notes === null) return; // User cancelled

    try {
      const response = await purchaseOrderAPI.updatePurchaseOrderStatus(poId, status, notes);
      if (response.success) {
        await fetchPurchaseOrders();
        alert(t('statusUpdatedSuccess'));
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      alert(t('errorUpdatingStatus', { error: getErrorMessage(err) }));
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'sent': return 'text-blue-600 bg-blue-50';
      case 'confirmed': return 'text-purple-600 bg-purple-50';
      case 'received': return 'text-green-600 bg-green-50';
      case 'cancelled': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="admin-spinner"></div>
        <span className="ml-2">{t('loading')}</span>
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
                {t('purchaseOrders')}
              </h1>
              <nav className="flex items-center space-x-2">
                <a
                  href="/"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
                >
                  {t('dashboard')}
                </a>
                <span className="text-gray-400">/</span>
                <a
                  href="/inventory"
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
                >
                  {t('inventory')}
                </a>
                <span className="text-gray-400">/</span>
                <span className="text-sm text-gray-900">{t('purchaseOrders')}</span>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setPoModal({ isOpen: true })}
                className="admin-button admin-button-primary text-sm"
              >
                {t('createPo')}
              </button>
              <button
                onClick={fetchPurchaseOrders}
                disabled={isLoading}
                className="admin-button admin-button-secondary text-sm"
              >
                {isLoading ? t('refreshing') : t('refresh')}
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
                {t('status')}
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{t('statusAll')}</option>
                <option value="pending">{t('statusPending')}</option>
                <option value="sent">{t('statusSent')}</option>
                <option value="confirmed">{t('statusConfirmed')}</option>
                <option value="received">{t('statusReceived')}</option>
                <option value="cancelled">{t('statusCancelled')}</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('supplier')}
              </label>
              <select
                value={filters.supplier_id}
                onChange={(e) => setFilters(prev => ({ ...prev, supplier_id: e.target.value, page: 1 }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('allSuppliers')}</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setFilters(prev => ({ ...prev, page: 1 }))}
                className="admin-button admin-button-primary w-full"
              >
                {t('applyFilters')}
              </button>
            </div>
          </div>
        </div>

        {/* Purchase Orders Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('purchaseOrders')}</h2>
              {pagination.total && (
                <span className="text-sm text-gray-500">
                  {t('totalOrders', { total: pagination.total })}
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="admin-spinner mx-auto mb-4"></div>
              <p>{t('loadingPurchaseOrders')}</p>
            </div>
          ) : purchaseOrders.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <span className="text-4xl mb-4 block">📋</span>
              <p>{t('noPurchaseOrdersFound')}</p>
              <button
                onClick={() => setPoModal({ isOpen: true })}
                className="mt-4 admin-button admin-button-primary"
              >
                {t('createYourFirstPurchaseOrder')}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('poNumber')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('supplier')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('amount')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('created')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {purchaseOrders.map((po) => (
                    <tr key={po.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="font-medium text-gray-900">{po.po_number}</p>
                          <p className="text-sm text-gray-500">{t('id', { id: po.id })}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm text-gray-900">{po.supplier_name}</p>
                          <p className="text-sm text-gray-500">{po.supplier_email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${parseFloat(po.total_amount).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(po.status)}`}>
                          {po.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm text-gray-900">
                            {new Date(po.created_at).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-500">
                            {t('createdBy', { name: po.created_by_name })}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                        <button
                          onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {t('view')}
                        </button>
                        {po.status === 'pending' && (
                          <button
                            onClick={() => handleStatusUpdate(po.id, 'sent')}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            {t('send')}
                          </button>
                        )}
                        {po.status === 'sent' && (
                          <button
                            onClick={() => handleStatusUpdate(po.id, 'confirmed')}
                            className="text-purple-600 hover:text-purple-800 font-medium"
                          >
                            {t('confirm')}
                          </button>
                        )}
                        {po.status === 'confirmed' && (
                          <button
                            onClick={() => handleStatusUpdate(po.id, 'received')}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            {t('receive')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {t('pageOf', { page: pagination.page, pages: pagination.pages })}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  {t('previous')}
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= pagination.pages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  {t('next')}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Purchase Order Form Modal */}
      <PurchaseOrderFormModal
        isOpen={poModal.isOpen}
        onClose={() => setPoModal({ isOpen: false })}
        onSubmit={handleCreatePurchaseOrder}
      />
    </div>
  );
}