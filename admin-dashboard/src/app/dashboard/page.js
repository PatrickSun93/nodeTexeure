'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ensureCsrfToken } from '../../utils/api';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();

  useEffect(() => {
    // Guard: verify auth and ensure CSRF token is present
    (async () => {
      try {
        await ensureCsrfToken();
      } catch (e) {
        // Not authenticated or not admin
        router.push('/');
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    try {
      await apiFetch('http://localhost:6666/api/admin/logout', { method: 'POST' });
      router.push('/');
    } catch (e) {
      // If unauthorized or other issue, still return to login
      router.push('/');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md">
        <div className="p-6">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <button onClick={handleLogout} className="button w-full mt-4">Logout</button>
        </div>
        <nav className="mt-6">
          <button onClick={() => setActiveTab('dashboard')} className={`block w-full text-left px-6 py-3 hover:bg-blue-50 ${activeTab === 'dashboard' ? 'bg-blue-50 border-r-2 border-blue-500' : ''}`}>Dashboard</button>
          <button onClick={() => setActiveTab('orders')} className={`block w-full text-left px-6 py-3 hover:bg-blue-50 ${activeTab === 'orders' ? 'bg-blue-50 border-r-2 border-blue-500' : ''}`}>Orders</button>
          <button onClick={() => setActiveTab('products')} className={`block w-full text-left px-6 py-3 hover:bg-blue-50 ${activeTab === 'products' ? 'bg-blue-50 border-r-2 border-blue-500' : ''}`}>Products</button>
          <button onClick={() => setActiveTab('product-approval')} className={`block w-full text-left px-6 py-3 hover:bg-blue-50 ${activeTab === 'product-approval' ? 'bg-blue-50 border-r-2 border-blue-500' : ''}`}>Product Approval</button>
          <button onClick={() => setActiveTab('coupons')} className={`block w-full text-left px-6 py-3 hover:bg-blue-50 ${activeTab === 'coupons' ? 'bg-blue-50 border-r-2 border-blue-500' : ''}`}>Coupons</button>
          <button onClick={() => setActiveTab('inventory')} className={`block w-full text-left px-6 py-3 hover:bg-blue-50 ${activeTab === 'inventory' ? 'bg-blue-50 border-r-2 border-blue-500' : ''}`}>Inventory</button>
          <button onClick={() => setActiveTab('users')} className={`block w-full text-left px-6 py-3 hover:bg-blue-50 ${activeTab === 'users' ? 'bg-blue-50 border-r-2 border-blue-500' : ''}`}>Users</button>
        </nav>
      </div>
      {/* Main content */}
      <div className="flex-1 p-8 overflow-auto">
        {activeTab === 'dashboard' && <SalesAnalyticsDashboard />}
        {activeTab === 'orders' && <OrderManagement />}
        {activeTab === 'products' && <ProductManagement />}
        {activeTab === 'product-approval' && <ProductApprovalManagement />}
        {activeTab === 'coupons' && <CouponManagement />}
        {activeTab === 'inventory' && <InventoryManagement />}
        {activeTab === 'users' && <UserManagement />}
      </div>
    </div>
  );
}

function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async () => {
    const url = statusFilter === 'all' 
      ? 'http://localhost:6666/api/admin/products'
      : `http://localhost:6666/api/admin/products?status=${statusFilter}`;
    const data = await apiFetch(url);
    if (data.success) setProducts(data.data.products);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `http://localhost:6666/api/admin/products/${editingId}` : 'http://localhost:6666/api/admin/products';
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this product?')) {
      await apiFetch(`http://localhost:6666/api/admin/products/${id}`, { method: 'DELETE' });
      await fetchData();
    }
  };

  const handleProductSelect = (productId) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSelectAll = () => {
    if (selectedProducts.length === products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products.map(p => p.id));
    }
  };

  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedProducts.length === 0) return;
    
    if (confirm(`Are you sure you want to update ${selectedProducts.length} products to ${newStatus} status?`)) {
      try {
        await apiFetch('http://localhost:6666/api/admin/products/bulk-update', {
          method: 'POST',
          body: JSON.stringify({ 
            productIds: selectedProducts, 
            updates: { status: newStatus } 
          })
        });
        
        await fetchData();
        setSelectedProducts([]);
        setShowBulkActions(false);
        alert('Products updated successfully!');
      } catch (error) {
        console.error('Error updating products:', error);
        alert('Failed to update products');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.length === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedProducts.length} products? This action cannot be undone.`)) {
      try {
        await apiFetch('http://localhost:6666/api/admin/products/bulk-delete', {
          method: 'DELETE',
          body: JSON.stringify({ productIds: selectedProducts })
        });
        
        await fetchData();
        setSelectedProducts([]);
        setShowBulkActions(false);
        alert('Products deleted successfully!');
      } catch (error) {
        console.error('Error deleting products:', error);
        alert('Failed to delete products');
      }
    }
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      'draft': 'bg-gray-100 text-gray-800',
      'pending_approval': 'bg-yellow-100 text-yellow-800',
      'approved': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
      'discontinued': 'bg-gray-100 text-gray-600'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Product Management</h2>
        <div className="flex gap-2 items-center">
          {selectedProducts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{selectedProducts.length} selected</span>
              <button 
                onClick={() => setShowBulkActions(!showBulkActions)}
                className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
              >
                Bulk Actions
              </button>
            </div>
          )}
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Products</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </div>
      </div>
      
      {/* Bulk Actions */}
      {showBulkActions && selectedProducts.length > 0 && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">Bulk Actions</h3>
          <div className="flex gap-2 flex-wrap">
            <button 
              onClick={() => handleBulkStatusUpdate('approved')}
              className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
            >
              Approve All
            </button>
            <button 
              onClick={() => handleBulkStatusUpdate('draft')}
              className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
            >
              Set as Draft
            </button>
            <button 
              onClick={() => handleBulkStatusUpdate('discontinued')}
              className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600"
            >
              Discontinue
            </button>
            <button 
              onClick={handleBulkDelete}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Delete All
            </button>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-300 rounded-lg bg-gray-50">
        <div className="grid grid-cols-2 gap-4">
          <input 
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Product Name" 
            value={formData.name || ''} 
            onChange={(e) => setFormData({...formData, name: e.target.value})} 
            required
          />
          <input 
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="SKU" 
            value={formData.sku || ''} 
            onChange={(e) => setFormData({...formData, sku: e.target.value})} 
            required
          />
          <input 
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Slug" 
            value={formData.slug || ''} 
            onChange={(e) => setFormData({...formData, slug: e.target.value})} 
            required
          />
          <input 
            type="number" 
            step="0.01"
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Base Price" 
            value={formData.base_price || ''} 
            onChange={(e) => setFormData({...formData, base_price: parseFloat(e.target.value)})} 
            required
          />
          <textarea 
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 col-span-2" 
            placeholder="Description" 
            rows="3"
            value={formData.description || ''} 
            onChange={(e) => setFormData({...formData, description: e.target.value})} 
          />
        </div>
        <div className="mt-4">
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            {editingId ? 'Update' : 'Add'} Product
          </button>
          {editingId && (
            <button 
              type="button" 
              onClick={() => {setFormData({}); setEditingId(null);}}
              className="ml-2 bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-2 text-left">
                <input 
                  type="checkbox" 
                  checked={selectedProducts.length === products.length && products.length > 0}
                  onChange={handleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="border border-gray-300 px-4 py-2 text-left">Name</th>
              <th className="border border-gray-300 px-4 py-2 text-left">SKU</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Price</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Created By</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-2">
                  <input 
                    type="checkbox" 
                    checked={selectedProducts.includes(p.id)}
                    onChange={() => handleProductSelect(p.id)}
                    className="rounded"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2">{p.name}</td>
                <td className="border border-gray-300 px-4 py-2 text-sm">{p.sku}</td>
                <td className="border border-gray-300 px-4 py-2">${p.base_price}</td>
                <td className="border border-gray-300 px-4 py-2">{getStatusBadge(p.status)}</td>
                <td className="border border-gray-300 px-4 py-2 text-sm">
                  {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : 'Unknown'}
                </td>
                <td className="border border-gray-300 px-4 py-2">
                  <button 
                    onClick={() => {setFormData(p); setEditingId(p.id);}} 
                    className="text-blue-500 hover:text-blue-700 mr-2"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(p.id)} 
                    className="text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductApprovalManagement() {
  const [pendingProducts, setPendingProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [approvalHistory, setApprovalHistory] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    fetchPendingProducts();
  }, []);

  const fetchPendingProducts = async () => {
    try {
      const data = await apiFetch('http://localhost:6666/api/admin/products/pending-approval');
      if (data.success) setPendingProducts(data.data.products);
    } catch (error) {
      console.error('Error fetching pending products:', error);
    }
  };

  const fetchApprovalHistory = async (productId) => {
    try {
      const data = await apiFetch(`http://localhost:6666/api/admin/products/${productId}/approval-history`);
      if (data.success) setApprovalHistory(data.data);
    } catch (error) {
      console.error('Error fetching approval history:', error);
    }
  };

  const handleApprove = async () => {
    try {
      await apiFetch(`http://localhost:6666/api/admin/products/${selectedProduct.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ notes: approvalNotes })
      });
      
      setShowApprovalModal(false);
      setApprovalNotes('');
      setSelectedProduct(null);
      await fetchPendingProducts();
      alert('Product approved successfully!');
    } catch (error) {
      console.error('Error approving product:', error);
      alert('Failed to approve product');
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Rejection reason is required');
      return;
    }
    
    try {
      await apiFetch(`http://localhost:6666/api/admin/products/${selectedProduct.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ 
          rejection_reason: rejectionReason,
          notes: rejectionNotes 
        })
      });
      
      setShowRejectionModal(false);
      setRejectionReason('');
      setRejectionNotes('');
      setSelectedProduct(null);
      await fetchPendingProducts();
      alert('Product rejected successfully!');
    } catch (error) {
      console.error('Error rejecting product:', error);
      alert('Failed to reject product');
    }
  };

  const openApprovalModal = (product) => {
    setSelectedProduct(product);
    setShowApprovalModal(true);
  };

  const openRejectionModal = (product) => {
    setSelectedProduct(product);
    setShowRejectionModal(true);
  };

  const openHistoryModal = async (product) => {
    setSelectedProduct(product);
    await fetchApprovalHistory(product.id);
    setShowHistoryModal(true);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Product Approval Management</h2>
        <div className="text-sm text-gray-600">
          {pendingProducts.length} product(s) pending approval
        </div>
      </div>

      {pendingProducts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No products pending approval</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-4 py-2 text-left">Product</th>
                <th className="border border-gray-300 px-4 py-2 text-left">SKU</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Price</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Created By</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Submitted</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingProducts.map(product => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-2">
                    <div>
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {product.short_description || product.description}
                      </div>
                    </div>
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm">{product.sku}</td>
                  <td className="border border-gray-300 px-4 py-2">${product.base_price}</td>
                  <td className="border border-gray-300 px-4 py-2">
                    <div>
                      <div className="font-medium">
                        {product.first_name && product.last_name 
                          ? `${product.first_name} ${product.last_name}` 
                          : 'Unknown'}
                      </div>
                      <div className="text-sm text-gray-500">{product.creator_email}</div>
                    </div>
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm">
                    {formatDate(product.created_at)}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => openApprovalModal(product)}
                        className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => openRejectionModal(product)}
                        className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                      >
                        Reject
                      </button>
                      <button 
                        onClick={() => openHistoryModal(product)}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                      >
                        History
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Approve Product</h3>
            <p className="mb-4">
              Are you sure you want to approve "<strong>{selectedProduct?.name}</strong>"?
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Approval Notes (Optional)
              </label>
              <textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="3"
                placeholder="Add any notes about the approval..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button 
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleApprove}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Reject Product</h3>
            <p className="mb-4">
              Rejecting "<strong>{selectedProduct?.name}</strong>"
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason *
              </label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a reason...</option>
                <option value="incomplete_information">Incomplete Information</option>
                <option value="poor_quality_images">Poor Quality Images</option>
                <option value="incorrect_pricing">Incorrect Pricing</option>
                <option value="duplicate_product">Duplicate Product</option>
                <option value="policy_violation">Policy Violation</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Notes
              </label>
              <textarea
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="3"
                placeholder="Provide specific feedback to help the creator improve..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button 
                onClick={() => setShowRejectionModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleReject}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Approval History</h3>
            {approvalHistory && (
              <div>
                <div className="mb-4 p-3 bg-gray-50 rounded">
                  <h4 className="font-medium">Product: {selectedProduct?.name}</h4>
                  <p className="text-sm text-gray-600">
                    Created by: {approvalHistory.creator.first_name} {approvalHistory.creator.last_name} 
                    ({approvalHistory.creator.email})
                  </p>
                  <p className="text-sm text-gray-600">
                    Submitted: {formatDate(approvalHistory.created_at)}
                  </p>
                  <p className="text-sm">
                    Current Status: <span className="font-medium">{approvalHistory.current_status}</span>
                  </p>
                </div>
                
                {approvalHistory.approval_history.length > 0 ? (
                  <div className="space-y-3">
                    <h5 className="font-medium">History:</h5>
                    {approvalHistory.approval_history.map((entry, index) => (
                      <div key={index} className="border-l-4 border-blue-200 pl-4 py-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`font-medium ${entry.action === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                              {entry.action.toUpperCase()}
                            </span>
                            {entry.user && (
                              <span className="text-sm text-gray-600 ml-2">
                                by {entry.user.first_name} {entry.user.last_name}
                              </span>
                            )}
                          </div>
                          <span className="text-sm text-gray-500">
                            {formatDate(entry.timestamp)}
                          </span>
                        </div>
                        {entry.rejection_reason && (
                          <p className="text-sm text-red-600 mt-1">
                            Reason: {entry.rejection_reason.replace('_', ' ')}
                          </p>
                        )}
                        {entry.notes && (
                          <p className="text-sm text-gray-700 mt-1">
                            Notes: {entry.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No approval history available.</p>
                )}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button 
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CouponManagement() {
  const [coupons, setCoupons] = useState([]);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const data = await apiFetch('http://localhost:6666/api/admin/coupons');
    if (data.success) setCoupons(data.data.coupons);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `http://localhost:6666/api/admin/coupons/${editingId}` : 'http://localhost:6666/api/admin/coupons';
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    await apiFetch(`http://localhost:6666/api/admin/coupons/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Coupon Management</h2>
      <form onSubmit={handleSubmit} className="mb-6">
        <input className="input mb-2" placeholder="Code" value={formData.code || ''} onChange={(e) => setFormData({...formData, code: e.target.value})} />
        <input className="input mb-2" placeholder="Value" value={formData.value || ''} onChange={(e) => setFormData({...formData, value: e.target.value})} />
        {/* Add more fields */}
        <button type="submit" className="button">{editingId ? 'Update' : 'Add'} Coupon</button>
      </form>
      <table className="w-full border-collapse">
        <thead><tr><th>Code</th><th>Value</th><th>Actions</th></tr></thead>
        <tbody>{coupons.map(c => (
          <tr key={c.id}><td>{c.code}</td><td>{c.value}</td><td>
            <button onClick={() => {setFormData(c); setEditingId(c.id);}} className="text-blue-500 mr-2">Edit</button>
            <button onClick={() => handleDelete(c.id)} className="text-red-500">Delete</button>
          </td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function InventoryManagement() {
  const [inventory, setInventory] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch all inventory
      const inventoryData = await apiFetch('http://localhost:6666/api/admin/inventory');
      if (inventoryData.success) setInventory(inventoryData.data.inventory);
      
      // Fetch low stock items
      const lowStockData = await apiFetch('http://localhost:6666/api/inventory/low-stock');
      if (lowStockData.success) setLowStockItems(lowStockData.data.items);
    } catch (error) {
      console.error('Error fetching inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const method = 'PUT';
      const url = `http://localhost:6666/api/inventory/${editingId}`;
      await apiFetch(url, { method, body: JSON.stringify(formData) });
      await fetchData();
      setEditingId(null);
      setFormData({});
    } catch (error) {
      console.error('Error updating inventory:', error);
    }
  };

  const releaseExpiredReservations = async () => {
    try {
      await apiFetch('http://localhost:6666/api/inventory/release-expired', { method: 'POST' });
      await fetchData();
      alert('Expired reservations released successfully');
    } catch (error) {
      console.error('Error releasing expired reservations:', error);
      alert('Failed to release expired reservations');
    }
  };

  const formatVariantInfo = (item) => {
    if (!item.size && !item.color && !item.pattern) {
      return 'Base Product';
    }
    const parts = [];
    if (item.size) parts.push(item.size);
    if (item.color) parts.push(item.color);
    if (item.pattern) parts.push(item.pattern);
    return parts.join(' - ');
  };

  const getStockStatus = (available, reorderPoint) => {
    if (available === 0) return { text: 'Out of Stock', class: 'text-red-600 font-bold' };
    if (available <= reorderPoint) return { text: 'Low Stock', class: 'text-orange-600 font-semibold' };
    return { text: 'In Stock', class: 'text-green-600' };
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Inventory Management</h2>
        <button 
          onClick={releaseExpiredReservations}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Release Expired Reservations
        </button>
      </div>
      
      {/* Tab Navigation */}
      <div className="mb-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'all'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              All Inventory ({inventory.length})
            </button>
            <button
              onClick={() => setActiveTab('low-stock')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'low-stock'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Low Stock ({lowStockItems.length})
            </button>
          </nav>
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {/* All Inventory Tab */}
          {activeTab === 'all' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left">Product</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Variant</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">SKU</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Available</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Reserved</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Sold</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => {
                    const status = getStockStatus(item.quantity_available, item.reorder_point);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2">
                          <div>
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-sm text-gray-500">{item.product_id}</div>
                          </div>
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          {formatVariantInfo(item)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-sm">
                          {item.variant_sku || item.product_sku}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {item.quantity_available}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {item.quantity_reserved}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {item.quantity_sold}
                        </td>
                        <td className={`border border-gray-300 px-4 py-2 ${status.class}`}>
                          {status.text}
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <button 
                            onClick={() => {setFormData(item); setEditingId(item.id);}} 
                            className="text-blue-500 hover:text-blue-700"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Low Stock Tab */}
          {activeTab === 'low-stock' && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-red-50">
                    <th className="border border-gray-300 px-4 py-2 text-left">Product</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Variant</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Available</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Reorder Point</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Reorder Qty</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map(item => (
                    <tr key={item.id} className="hover:bg-red-50">
                      <td className="border border-gray-300 px-4 py-2">
                        <div>
                          <div className="font-medium">{item.product_name}</div>
                          <div className="text-sm text-gray-500">{item.product_id}</div>
                        </div>
                      </td>
                      <td className="border border-gray-300 px-4 py-2">
                        {formatVariantInfo(item)}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center font-bold text-red-600">
                        {item.quantity_available}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {item.reorder_point}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {item.reorder_quantity}
                      </td>
                      <td className="border border-gray-300 px-4 py-2">
                        <button 
                          onClick={() => {setFormData(item); setEditingId(item.id);}} 
                          className="text-blue-500 hover:text-blue-700"
                        >
                          Restock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Edit Form */}
      {editingId && (
        <div className="mt-6 p-4 border border-gray-300 rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">Edit Inventory</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity Available
              </label>
              <input 
                type="number"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Quantity Available" 
                value={formData.quantity_available || ''} 
                onChange={(e) => setFormData({...formData, quantity_available: parseInt(e.target.value) || 0})} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity Reserved
              </label>
              <input 
                type="number"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Quantity Reserved" 
                value={formData.quantity_reserved || ''} 
                onChange={(e) => setFormData({...formData, quantity_reserved: parseInt(e.target.value) || 0})} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reorder Point
              </label>
              <input 
                type="number"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Reorder Point" 
                value={formData.reorder_point || ''} 
                onChange={(e) => setFormData({...formData, reorder_point: parseInt(e.target.value) || 0})} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reorder Quantity
              </label>
              <input 
                type="number"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Reorder Quantity" 
                value={formData.reorder_quantity || ''} 
                onChange={(e) => setFormData({...formData, reorder_quantity: parseInt(e.target.value) || 0})} 
              />
            </div>
            <div className="col-span-2 flex gap-2">
              <button 
                type="submit" 
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Update Inventory
              </button>
              <button 
                type="button"
                onClick={() => {setEditingId(null); setFormData({});}}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SalesAnalyticsDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`http://localhost:6666/api/admin/analytics/dashboard?period=${period}`);
      if (data.success) setAnalytics(data.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading analytics...</div>;
  }

  if (!analytics) {
    return <div className="text-center text-gray-500">Failed to load analytics data</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Sales Analytics Dashboard</h2>
        <select 
          value={period} 
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Revenue</h3>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(analytics.summary.total_revenue)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Orders</h3>
          <p className="text-3xl font-bold text-blue-600">{analytics.summary.total_orders || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Average Order Value</h3>
          <p className="text-3xl font-bold text-purple-600">{formatCurrency(analytics.summary.average_order_value)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Sales Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Daily Sales</h3>
          {analytics.daily_sales.length > 0 ? (
            <div className="space-y-2">
              {analytics.daily_sales.slice(0, 10).map((day, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">{formatDate(day.date)}</span>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(day.revenue)}</div>
                    <div className="text-sm text-gray-500">{day.orders} orders</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No sales data available</p>
          )}
        </div>

        {/* Order Status Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Order Status</h3>
          {analytics.order_status.length > 0 ? (
            <div className="space-y-3">
              {analytics.order_status.map((status, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="capitalize text-gray-700">{status.status.replace('_', ' ')}</span>
                  <span className="font-semibold">{status.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No order data available</p>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Top Products</h3>
          {analytics.top_products.length > 0 ? (
            <div className="space-y-3">
              {analytics.top_products.slice(0, 5).map((product, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <div>
                    <div className="font-medium">{product.product_name}</div>
                    <div className="text-sm text-gray-500">{product.product_sku}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{product.total_sold} sold</div>
                    <div className="text-sm text-gray-500">{formatCurrency(product.total_revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No product data available</p>
          )}
        </div>

        {/* Recent Orders */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Recent Orders</h3>
          {analytics.recent_orders.length > 0 ? (
            <div className="space-y-3">
              {analytics.recent_orders.slice(0, 5).map((order, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <div>
                    <div className="font-medium">#{order.order_number}</div>
                    <div className="text-sm text-gray-500">{order.customer_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(order.total_amount)}</div>
                    <div className={`text-sm px-2 py-1 rounded-full ${
                      order.status === 'completed' ? 'bg-green-100 text-green-800' :
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {order.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No recent orders</p>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderManagement() {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const url = statusFilter === 'all' 
        ? 'http://localhost:6666/api/admin/orders'
        : `http://localhost:6666/api/admin/orders?status=${statusFilter}`;
      const data = await apiFetch(url);
      if (data.success) setOrders(data.data.orders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetails = async (orderId) => {
    try {
      const data = await apiFetch(`http://localhost:6666/api/admin/orders/${orderId}`);
      if (data.success) {
        setSelectedOrder(data.data);
        setNewStatus(data.data.status);
        setShowOrderModal(true);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
    }
  };

  const updateOrderStatus = async () => {
    if (!selectedOrder || !newStatus) return;
    
    try {
      await apiFetch(`http://localhost:6666/api/admin/orders/${selectedOrder.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      
      setShowOrderModal(false);
      setSelectedOrder(null);
      await fetchOrders();
      alert('Order status updated successfully!');
    } catch (error) {
      console.error('Error updating order status:', error);
      alert('Failed to update order status');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      'pending': 'bg-yellow-100 text-yellow-800',
      'confirmed': 'bg-blue-100 text-blue-800',
      'processing': 'bg-purple-100 text-purple-800',
      'shipped': 'bg-indigo-100 text-indigo-800',
      'delivered': 'bg-green-100 text-green-800',
      'cancelled': 'bg-red-100 text-red-800',
      'refunded': 'bg-gray-100 text-gray-800'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Order Management</h2>
        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Orders</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">Loading orders...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">#{order.order_number}</div>
                      <div className="text-sm text-gray-500">{order.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{order.customer_name}</div>
                      <div className="text-sm text-gray-500">{order.customer_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(order.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button 
                        onClick={() => fetchOrderDetails(order.id)}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {showOrderModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-4xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Order Details - #{selectedOrder.order_number}</h3>
              <button 
                onClick={() => setShowOrderModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h4 className="font-semibold mb-2">Customer Information</h4>
                <p><strong>Name:</strong> {selectedOrder.customer_name}</p>
                <p><strong>Email:</strong> {selectedOrder.customer_email}</p>
                {selectedOrder.customer_phone && (
                  <p><strong>Phone:</strong> {selectedOrder.customer_phone}</p>
                )}
              </div>
              
              <div>
                <h4 className="font-semibold mb-2">Order Information</h4>
                <p><strong>Status:</strong> {getStatusBadge(selectedOrder.status)}</p>
                <p><strong>Total:</strong> {formatCurrency(selectedOrder.total_amount)}</p>
                <p><strong>Created:</strong> {formatDate(selectedOrder.created_at)}</p>
              </div>
            </div>

            {selectedOrder.shipping_address && (
              <div className="mb-6">
                <h4 className="font-semibold mb-2">Shipping Address</h4>
                <div className="text-sm text-gray-600">
                  <p>{selectedOrder.shipping_address.street}</p>
                  <p>{selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.state} {selectedOrder.shipping_address.zip}</p>
                  <p>{selectedOrder.shipping_address.country}</p>
                </div>
              </div>
            )}

            <div className="mb-6">
              <h4 className="font-semibold mb-2">Order Items</h4>
              <div className="space-y-2">
                {selectedOrder.items.map((item, index) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <div className="flex items-center">
                      {item.thumbnail_small_url && (
                        <img src={item.thumbnail_small_url} alt={item.product_name} className="w-12 h-12 object-cover rounded mr-3" />
                      )}
                      <div>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-sm text-gray-500">SKU: {item.product_sku}</div>
                        <div className="text-sm text-gray-500">Qty: {item.quantity}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(item.total_price)}</div>
                      <div className="text-sm text-gray-500">{formatCurrency(item.unit_price)} each</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Update Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowOrderModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Close
                </button>
                <button 
                  onClick={updateOrderStatus}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Update Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const data = await apiFetch('http://localhost:6666/api/admin/users');
      if (data.success) setUsers(data.data.users);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `http://localhost:6666/api/admin/users/${editingId}` : 'http://localhost:6666/api/admin/users';
      await apiFetch(url, { method, body: JSON.stringify(formData) });
      await fetchData();
      setFormData({});
      setEditingId(null);
      alert(editingId ? 'User updated successfully!' : 'User added successfully!');
    } catch (error) {
      console.error('Error saving user:', error);
      alert('Failed to save user');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await apiFetch(`http://localhost:6666/api/admin/users/${id}`, { method: 'DELETE' });
        await fetchData();
        alert('User deleted successfully!');
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user');
      }
    }
  };

  const handleUserSelect = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map(u => u.id));
    }
  };

  const handleBulkRoleUpdate = async (newRole) => {
    if (selectedUsers.length === 0) return;
    
    if (confirm(`Are you sure you want to update ${selectedUsers.length} users to ${newRole} role?`)) {
      try {
        // Update each selected user
        await Promise.all(selectedUsers.map(userId => 
          apiFetch(`http://localhost:6666/api/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ role: newRole })
          })
        ));
        
        await fetchData();
        setSelectedUsers([]);
        setShowBulkActions(false);
        alert('Users updated successfully!');
      } catch (error) {
        console.error('Error updating users:', error);
        alert('Failed to update users');
      }
    }
  };

  const getRoleBadge = (role) => {
    const roleColors = {
      'admin': 'bg-red-100 text-red-800',
      'staff': 'bg-blue-100 text-blue-800',
      'customer': 'bg-green-100 text-green-800'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${roleColors[role] || 'bg-gray-100 text-gray-800'}`}>
        {role.toUpperCase()}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      'active': 'bg-green-100 text-green-800',
      'inactive': 'bg-gray-100 text-gray-800',
      'suspended': 'bg-red-100 text-red-800'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">User Management</h2>
        {selectedUsers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{selectedUsers.length} selected</span>
            <button 
              onClick={() => setShowBulkActions(!showBulkActions)}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Bulk Actions
            </button>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {showBulkActions && selectedUsers.length > 0 && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">Bulk Actions</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => handleBulkRoleUpdate('customer')}
              className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
            >
              Set as Customer
            </button>
            <button 
              onClick={() => handleBulkRoleUpdate('staff')}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Set as Staff
            </button>
            <button 
              onClick={() => handleBulkRoleUpdate('admin')}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Set as Admin
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit User Form */}
      <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-300 rounded-lg bg-gray-50">
        <h3 className="font-medium mb-4">{editingId ? 'Edit User' : 'Add New User'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input 
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Email" 
            type="email"
            value={formData.email || ''} 
            onChange={(e) => setFormData({...formData, email: e.target.value})} 
            required
          />
          <input 
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="First Name" 
            value={formData.first_name || ''} 
            onChange={(e) => setFormData({...formData, first_name: e.target.value})} 
            required
          />
          <input 
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Last Name" 
            value={formData.last_name || ''} 
            onChange={(e) => setFormData({...formData, last_name: e.target.value})} 
            required
          />
          <select 
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
            value={formData.role || ''} 
            onChange={(e) => setFormData({...formData, role: e.target.value})}
            required
          >
            <option value="">Select Role</option>
            <option value="customer">Customer</option>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="mt-4">
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            {editingId ? 'Update' : 'Add'} User
          </button>
          {editingId && (
            <button 
              type="button" 
              onClick={() => {setFormData({}); setEditingId(null);}}
              className="ml-2 bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input 
                    type="checkbox" 
                    checked={selectedUsers.length === users.length && users.length > 0}
                    onChange={handleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input 
                      type="checkbox" 
                      checked={selectedUsers.includes(user.id)}
                      onChange={() => handleUserSelect(user.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="font-medium text-gray-900">{user.first_name} {user.last_name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getRoleBadge(user.role)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(user.status || 'active')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button 
                      onClick={() => {setFormData(user); setEditingId(user.id);}} 
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(user.id)} 
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}