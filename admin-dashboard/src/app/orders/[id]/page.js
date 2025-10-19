'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminOrders, getErrorMessage, isAuthError } from '../../../lib/api';

const ORDER_STATUSES = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
  { value: 'processing', label: 'Processing', color: 'bg-purple-100 text-purple-800' },
  { value: 'shipped', label: 'Shipped', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'delivered', label: 'Delivered', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  { value: 'refunded', label: 'Refunded', color: 'bg-gray-100 text-gray-800' }
];

const REFUND_REASONS = [
  { value: 'customer_request', label: 'Customer Request' },
  { value: 'defective_product', label: 'Defective Product' },
  { value: 'wrong_item', label: 'Wrong Item Sent' },
  { value: 'damaged_shipping', label: 'Damaged During Shipping' },
  { value: 'other', label: 'Other' }
];

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id;

  const [order, setOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [statusHistory, setStatusHistory] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Status update state
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [showStatusUpdate, setShowStatusUpdate] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  
  // Refund state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('customer_request');
  const [refundNotes, setRefundNotes] = useState('');
  
  // Shipping state
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);

  // Fetch order details
  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await adminOrders.getOrder(orderId);
      
      if (response.success) {
        const data = response.keyValueTable;
        setOrder(data.order);
        setOrderItems(data.orderItems || []);
        setStatusHistory(data.statusHistory || []);
        setPayments(data.payments || []);
        setRefunds(data.refunds || []);
      } else {
        setError(response.message || 'Failed to fetch order details');
      }
    } catch (err) {
      if (isAuthError(err)) {
        router.push('/login');
        return;
      }
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId]);

  // Handle status update
  const handleStatusUpdate = async () => {
    if (!newStatus) {
      alert('Please select a status');
      return;
    }

    try {
      setStatusUpdateLoading(true);
      
      const response = await adminOrders.updateOrderStatus(orderId, newStatus, statusNotes);
      
      if (response.success) {
        alert('Order status updated successfully');
        setShowStatusUpdate(false);
        setNewStatus('');
        setStatusNotes('');
        fetchOrderDetails(); // Refresh data
      } else {
        alert(`Failed to update status: ${response.message}`);
      }
    } catch (err) {
      alert(`Error updating status: ${getErrorMessage(err)}`);
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  // Handle refund
  const handleRefund = async () => {
    if (!refundReason) {
      alert('Please select a refund reason');
      return;
    }

    const amount = refundAmount ? parseFloat(refundAmount) : null;
    if (amount && (amount <= 0 || amount > order.total_amount)) {
      alert('Invalid refund amount');
      return;
    }

    try {
      setRefundLoading(true);
      
      const response = await adminOrders.processRefund(orderId, amount, refundReason, refundNotes);
      
      if (response.success) {
        alert('Refund processed successfully');
        setShowRefundModal(false);
        setRefundAmount('');
        setRefundReason('customer_request');
        setRefundNotes('');
        fetchOrderDetails(); // Refresh data
      } else {
        alert(`Failed to process refund: ${response.message}`);
      }
    } catch (err) {
      alert(`Error processing refund: ${getErrorMessage(err)}`);
    } finally {
      setRefundLoading(false);
    }
  };

  // Handle shipping label generation
  const handleGenerateShippingLabel = async () => {
    try {
      setShippingLoading(true);
      
      const response = await adminOrders.generateShippingLabel(orderId, {
        serviceType: 'FEDEX_GROUND'
      });
      
      if (response.success) {
        alert(`Shipping label generated successfully. Tracking: ${response.keyValueTable.trackingNumber}`);
        setShowShippingModal(false);
        fetchOrderDetails(); // Refresh data
      } else {
        alert(`Failed to generate shipping label: ${response.message}`);
      }
    } catch (err) {
      alert(`Error generating shipping label: ${getErrorMessage(err)}`);
    } finally {
      setShippingLoading(false);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    const statusObj = ORDER_STATUSES.find(s => s.value === status);
    return statusObj?.color || 'bg-gray-100 text-gray-800';
  };

  // Format currency
  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading order details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => router.push('/orders')}
            className="mt-2 text-red-600 hover:text-red-800 font-medium"
          >
            ← Back to Orders
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Order not found</div>
          <button
            onClick={() => router.push('/orders')}
            className="mt-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/orders')}
              className="text-blue-600 hover:text-blue-800 font-medium mb-2"
            >
              ← Back to Orders
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              Order {order.order_number}
            </h1>
            <p className="text-gray-600">Order ID: {order.id}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowStatusUpdate(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Update Status
            </button>
            {order.status !== 'refunded' && order.status !== 'cancelled' && (
              <button
                onClick={() => setShowRefundModal(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Process Refund
              </button>
            )}
            {(order.status === 'confirmed' || order.status === 'processing') && !order.tracking_number && (
              <button
                onClick={() => setShowShippingModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Generate Shipping Label
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-500">Status</div>
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Amount</div>
                <div className="font-semibold">{formatCurrency(order.total_amount, order.currency)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Payment Status</div>
                <div className="font-semibold">{order.payment_status || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Created</div>
                <div className="font-semibold">{formatDate(order.created_at)}</div>
              </div>
            </div>
            
            {order.tracking_number && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-800">
                  <strong>Tracking Number:</strong> {order.tracking_number}
                </div>
                {order.estimated_delivery_date && (
                  <div className="text-sm text-blue-600">
                    <strong>Estimated Delivery:</strong> {formatDate(order.estimated_delivery_date)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h2>
            <div className="space-y-4">
              {orderItems.map((item, index) => (
                <div key={index} className="flex items-center justify-between border-b border-gray-200 pb-4">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{item.product_name}</div>
                    {item.variant_name && (
                      <div className="text-sm text-gray-500">Variant: {item.variant_name}</div>
                    )}
                    <div className="text-sm text-gray-500">
                      SKU: {item.variant_sku || item.product_sku || 'N/A'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {item.quantity} × {formatCurrency(item.price)}
                    </div>
                    <div className="text-sm text-gray-500">
                      Total: {formatCurrency(item.quantity * item.price)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900">Order Total:</span>
                <span className="font-bold text-lg">{formatCurrency(order.total_amount, order.currency)}</span>
              </div>
            </div>
          </div>

          {/* Payment Information */}
          {payments.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Information</h2>
              <div className="space-y-3">
                {payments.map((payment, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">
                          {formatCurrency(payment.amount, payment.currency)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {payment.payment_method_type} {payment.last_four && `****${payment.last_four}`}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatDate(payment.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          payment.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {payment.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Refunds */}
          {refunds.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Refunds</h2>
              <div className="space-y-3">
                {refunds.map((refund, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">
                          {formatCurrency(refund.amount)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Reason: {refund.reason}
                        </div>
                        <div className="text-sm text-gray-500">
                          Processed by: {refund.processed_by_name || 'System'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatDate(refund.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          refund.status === 'completed' ? 'bg-green-100 text-green-800' : 
                          refund.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {refund.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h2>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Name</div>
                <div className="font-medium">{order.customer_name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Email</div>
                <div className="font-medium">{order.customer_email || order.guest_email}</div>
              </div>
              {order.customer_phone && (
                <div>
                  <div className="text-sm text-gray-500">Phone</div>
                  <div className="font-medium">{order.customer_phone}</div>
                </div>
              )}
              <div>
                <div className="text-sm text-gray-500">Customer Type</div>
                <div className="font-medium">{order.user_id ? 'Registered' : 'Guest'}</div>
              </div>
              {order.customer_since && (
                <div>
                  <div className="text-sm text-gray-500">Customer Since</div>
                  <div className="font-medium">{formatDate(order.customer_since)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Shipping Address */}
          {order.shipping_address && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Shipping Address</h2>
              <div className="text-sm">
                {order.shipping_address.company && (
                  <div className="font-medium">{order.shipping_address.company}</div>
                )}
                <div>{order.shipping_address.street}</div>
                <div>
                  {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postalCode}
                </div>
                <div>{order.shipping_address.country || 'US'}</div>
                {order.shipping_address.phone && (
                  <div className="mt-2">Phone: {order.shipping_address.phone}</div>
                )}
              </div>
            </div>
          )}

          {/* Billing Address */}
          {order.billing_address && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Billing Address</h2>
              <div className="text-sm">
                {order.billing_address.company && (
                  <div className="font-medium">{order.billing_address.company}</div>
                )}
                <div>{order.billing_address.street}</div>
                <div>
                  {order.billing_address.city}, {order.billing_address.state} {order.billing_address.postalCode}
                </div>
                <div>{order.billing_address.country || 'US'}</div>
                {order.billing_address.phone && (
                  <div className="mt-2">Phone: {order.billing_address.phone}</div>
                )}
              </div>
            </div>
          )}

          {/* Status History */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Status History</h2>
            <div className="space-y-3">
              {statusHistory.map((entry, index) => (
                <div key={index} className="border-l-2 border-gray-200 pl-3">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(entry.status)}`}>
                      {entry.status}
                    </span>
                    <div className="text-xs text-gray-500">
                      {formatDate(entry.created_at)}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Changed by: {entry.changed_by_name || 'System'}
                  </div>
                  {entry.status_details && entry.status_details.notes && (
                    <div className="text-sm text-gray-500 mt-1">
                      {entry.status_details.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Status Update Modal */}
      {showStatusUpdate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Update Order Status</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select status...</option>
                  {ORDER_STATUSES.map(status => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add notes about this status change..."
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleStatusUpdate}
                disabled={statusUpdateLoading || !newStatus}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {statusUpdateLoading ? 'Updating...' : 'Update Status'}
              </button>
              <button
                onClick={() => setShowStatusUpdate(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Process Refund</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refund Amount (Leave empty for full refund)
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={order.total_amount}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Max: ${formatCurrency(order.total_amount)}`}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refund Reason
                </label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {REFUND_REASONS.map(reason => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add notes about this refund..."
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleRefund}
                disabled={refundLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {refundLoading ? 'Processing...' : 'Process Refund'}
              </button>
              <button
                onClick={() => setShowRefundModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipping Modal */}
      {showShippingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Shipping Label</h3>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                This will generate a FedEx Ground shipping label for this order and automatically update the status to "shipped".
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleGenerateShippingLabel}
                disabled={shippingLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {shippingLoading ? 'Generating...' : 'Generate Label'}
              </button>
              <button
                onClick={() => setShowShippingModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}