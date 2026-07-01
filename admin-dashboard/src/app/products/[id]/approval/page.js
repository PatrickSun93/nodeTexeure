'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { adminProducts, getErrorMessage } from '../../../../lib/api';

export default function ProductApprovalPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id;

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Approval form state
  const [approvalAction, setApprovalAction] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

  // Load product data
  useEffect(() => {
    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await adminProducts.getProduct(productId);
      
      if (response.status === 'SUCCESS') {
        setProduct(response.keyValueTable);
      } else {
        throw new Error(response.message || 'Failed to fetch product');
      }
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error fetching product:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle approval action
  const handleApprovalAction = async () => {
    if (!approvalAction) {
      setError('Please select an approval action');
      return;
    }

    try {
      setProcessing(true);
      setError(null);
      setSuccess(null);

      await adminProducts.updateProductStatus(productId, approvalAction, approvalNotes);
      
      setSuccess(`Product ${approvalAction} successfully!`);
      setApprovalAction('');
      setApprovalNotes('');
      
      // Refresh product data to show updated approval history
      await fetchProduct();

      // Redirect back to products list after a delay
      setTimeout(() => {
        router.push('/products');
      }, 2000);

    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error updating product status:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Parse approval details
  const getApprovalHistory = () => {
    if (!product?.approval_details) return [];
    
    try {
      const approvalData = JSON.parse(product.approval_details);
      return approvalData.history || [];
    } catch (e) {
      console.warn('Failed to parse approval_details:', e);
      return [];
    }
  };

  // Get current approval status
  const getCurrentApproval = () => {
    if (!product?.approval_details) return null;
    
    try {
      const approvalData = JSON.parse(product.approval_details);
      return approvalData.current || null;
    } catch (e) {
      console.warn('Failed to parse approval_details:', e);
      return null;
    }
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status badge color
  const getStatusBadgeColor = (status) => {
    const colors = {
      'draft': 'bg-gray-100 text-gray-800',
      'pending_approval': 'bg-yellow-100 text-yellow-800',
      'approved': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
      'discontinued': 'bg-gray-100 text-gray-500'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Product not found</p>
          <button
            onClick={() => router.push('/products')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  const approvalHistory = getApprovalHistory();
  const currentApproval = getCurrentApproval();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <h1 className="text-xl font-semibold text-gray-900">
                Product Approval
              </h1>
            </div>
            <nav className="flex items-center space-x-4">
              <a 
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                Dashboard
              </a>
              <a 
                href="/products"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                Products
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Product Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Product Overview */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Overview</h2>
              
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center">
                    <span className="text-gray-500 text-sm">No Image</span>
                  </div>
                </div>
                
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900">{product.name}</h3>
                  <p className="text-gray-600 mt-1">SKU: {product.sku}</p>
                  <p className="text-gray-600">Price: ${product.base_price}</p>
                  <div className="mt-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(product.status)}`}>
                      {product.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {product.short_description && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Description</h4>
                  <p className="text-gray-700">{product.short_description}</p>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Created:</span>
                  <span className="ml-2">{formatDate(product.created_at)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Updated:</span>
                  <span className="ml-2">{formatDate(product.updated_at)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Creator:</span>
                  <span className="ml-2">{product.creator_first_name} {product.creator_last_name}</span>
                </div>
                <div>
                  <span className="text-gray-600">Category:</span>
                  <span className="ml-2">{product.category_name || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Approval History */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Approval History</h2>
              
              {approvalHistory.length > 0 ? (
                <div className="space-y-4">
                  {approvalHistory.map((entry, index) => (
                    <div key={index} className="border-l-4 border-blue-200 pl-4 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(entry.status)}`}>
                            {entry.status.replace('_', ' ')}
                          </span>
                          <span className="ml-2 text-sm text-gray-600">
                            by {entry.user_name || 'Unknown'}
                          </span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {formatDate(entry.approved_at)}
                        </span>
                      </div>
                      {entry.notes && (
                        <p className="mt-2 text-sm text-gray-700">{entry.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No approval history available
                </div>
              )}
            </div>

            {/* Current Status */}
            {currentApproval && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Status</h2>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(currentApproval.status)}`}>
                      {currentApproval.status.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatDate(currentApproval.approved_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Last updated by {currentApproval.user_name || 'Unknown'}
                  </p>
                  {currentApproval.notes && (
                    <p className="mt-2 text-sm text-gray-700">{currentApproval.notes}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Approval Actions */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              
              <div className="space-y-3">
                <button
                  onClick={() => router.push(`/products/${productId}/edit`)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Edit Product
                </button>

                <button
                  onClick={() => window.open(`/products/${productId}`, '_blank')}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Preview Product
                </button>
              </div>
            </div>

            {/* Approval Form */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Update Status</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Action
                  </label>
                  <select
                    value={approvalAction}
                    onChange={(e) => setApprovalAction(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Action</option>
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                    <option value="pending_approval">Request Changes</option>
                    <option value="discontinued">Discontinue</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add notes about this status change..."
                  />
                </div>

                <button
                  onClick={handleApprovalAction}
                  disabled={!approvalAction || processing}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Processing...' : 'Update Status'}
                </button>
              </div>
            </div>

            {/* Product Stats */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Stats</h2>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Variants:</span>
                  <span>{product.variant_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Images:</span>
                  <span>{product.image_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Inventory Items:</span>
                  <span>{product.inventory_count || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}