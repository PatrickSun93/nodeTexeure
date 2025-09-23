'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminAPI } from '../../../utils/api';

export default function AdminOrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState({
    status: '',
    notes: ''
  });
  const [refundData, setRefundData] = useState({
    amount: '',
    reason: 'customer_request',
    reasonNotes: ''
  });

  useEffect(() => {
    if (params.id) {
      fetchOrderDetails();
    }
  }, [params.id]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      const result = await adminAPI.getOrder(params.id);

      if (result.success) {
        setOrder(result.data);
        setStatusUpdate({ status: result.data.status, notes: '' });
        setRefundData(prev => ({ ...prev, amount: result.data.total_amount.toString() }));
      } else {
        setError(result.message || 'Failed to fetch order details');
      }
    } catch (err) {
      setError('Failed to fetch order details');
      console.error('Error fetching order:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!statusUpdate.status) return;

    try {
      const result = await adminAPI.updateOrderStatus(
        params.id, 
        statusUpdate.status, 
        statusUpdate.notes
      );

      if (result.success) {
        setShowStatusModal(false);
        fetchOrderDetails(); // Refresh order details
      } else {
        alert(result.message || 'Failed to update order status');
      }
    } catch (err) {
      alert('Failed to update order status');
      console.error('Error updating status:', err);
    }
  };

  const handleRefund = async () => {
    if (!refundData.amount || !refundData.reason) return;

    try {
      const result = await adminAPI.refundOrder(
        params.id, 
        refundData.amount, 
        `${refundData.reason}: ${refundData.reasonNotes}`
      );

      if (result.success) {
        setShowRefundModal(false);
        fetchOrderDetails(); // Refresh order details
        alert('Refund initiated successfully');
      } else {
        alert(result.message || 'Failed to process refund');
      }
    } catch (err) {
      alert('Failed to process refund');
      console.error('Error processing refund:', err);
    }
  };

  const handleCancelOrder = async () => {
    const reason = prompt('Enter cancellation reason:');
    if (!reason) return;

    try {
      const result = await adminAPI.cancelOrder(params.id, reason);

      if (result.success) {
        fetchOrderDetails(); // Refresh order details
      } else {
        alert(result.message || 'Failed to cancel order');
      }
    } catch (err) {
      alert('Failed to cancel order');
      console.error('Error cancelling order:', err);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'status-pending',
      confirmed: 'status-confirmed',
      processing: 'status-processing',
      shipped: 'status-shipped',
      delivered: 'status-delivered',
      cancelled: 'status-cancelled',
      refunded: 'status-refunded'
    };
    return colors[status] || 'status-default';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading order details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">
          <h3>Error</h3>
          <p>{error}</p>
          <div className="error-actions">
            <button onClick={fetchOrderDetails} className="btn btn-primary">
              Try Again
            </button>
            <button onClick={() => router.push('/orders')} className="btn btn-secondary">
              Back to Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="error-container">
        <div className="error-message">
          <h3>Order not found</h3>
          <button onClick={() => router.push('/orders')} className="btn btn-primary">
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="order-details-page">
      <style jsx>{`
        .order-details-page {
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .header-left h1 {
          font-size: 2rem;
          font-weight: bold;
          color: #1f2937;
          margin: 0 0 0.5rem 0;
        }

        .header-left p {
          color: #6b7280;
          margin: 0;
        }

        .header-actions {
          display: flex;
          gap: 1rem;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }

        .btn-primary {
          background-color: #3b82f6;
          color: white;
        }

        .btn-primary:hover {
          background-color: #2563eb;
        }

        .btn-secondary {
          background-color: #6b7280;
          color: white;
        }

        .btn-secondary:hover {
          background-color: #4b5563;
        }

        .btn-success {
          background-color: #059669;
          color: white;
        }

        .btn-success:hover {
          background-color: #047857;
        }

        .btn-danger {
          background-color: #dc2626;
          color: white;
        }

        .btn-danger:hover {
          background-color: #b91c1c;
        }

        .content-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 2rem;
        }

        .main-content {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .sidebar {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .card {
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .card-header {
          padding: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          background-color: #f9fafb;
        }

        .card-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .card-body {
          padding: 1.5rem;
        }

        .status {
          padding: 0.5rem 1rem;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 500;
          display: inline-block;
        }

        .status-pending {
          background-color: #fef3c7;
          color: #92400e;
        }

        .status-confirmed {
          background-color: #dbeafe;
          color: #1e40af;
        }

        .status-processing {
          background-color: #e0e7ff;
          color: #5b21b6;
        }

        .status-shipped {
          background-color: #c7d2fe;
          color: #3730a3;
        }

        .status-delivered {
          background-color: #d1fae5;
          color: #065f46;
        }

        .status-cancelled {
          background-color: #fee2e2;
          color: #991b1b;
        }

        .status-refunded {
          background-color: #f3f4f6;
          color: #374151;
        }

        .order-items {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .order-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.375rem;
        }

        .item-image {
          width: 64px;
          height: 64px;
          border-radius: 0.375rem;
          object-fit: cover;
        }

        .item-placeholder {
          width: 64px;
          height: 64px;
          border-radius: 0.375rem;
          background-color: #f3f4f6;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
        }

        .item-details {
          flex: 1;
        }

        .item-name {
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .item-sku {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .item-variant {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .item-pricing {
          text-align: right;
        }

        .item-price {
          font-weight: 600;
          color: #111827;
        }

        .item-total {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .summary-row.total {
          border-top: 1px solid #e5e7eb;
          padding-top: 0.5rem;
          font-weight: 600;
          font-size: 1.125rem;
        }

        .address-info {
          line-height: 1.6;
        }

        .address-info .name {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .timeline {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .timeline-item {
          display: flex;
          gap: 1rem;
          position: relative;
        }

        .timeline-item:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 1rem;
          top: 2rem;
          bottom: -1rem;
          width: 2px;
          background-color: #e5e7eb;
        }

        .timeline-icon {
          width: 2rem;
          height: 2rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 600;
          flex-shrink: 0;
        }

        .timeline-content {
          flex: 1;
          padding-top: 0.25rem;
        }

        .timeline-status {
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .timeline-notes {
          color: #6b7280;
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }

        .timeline-meta {
          color: #9ca3af;
          font-size: 0.75rem;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: 0.5rem;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6b7280;
        }

        .modal-body {
          padding: 1.5rem;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          padding: 1.5rem;
          border-top: 1px solid #e5e7eb;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.25rem;
        }

        .form-input, .form-select, .form-textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .form-textarea {
          resize: vertical;
          min-height: 80px;
        }

        .loading-container, .error-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          text-align: center;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e5e7eb;
          border-top: 4px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error-message {
          background-color: #fee2e2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 2rem;
          border-radius: 0.5rem;
        }

        .error-actions {
          margin-top: 1rem;
          display: flex;
          gap: 1rem;
          justify-content: center;
        }

        @media (max-width: 768px) {
          .content-grid {
            grid-template-columns: 1fr;
          }
          
          .header-actions {
            flex-direction: column;
          }
        }
      `}</style>

      <div className="page-header">
        <div className="header-left">
          <h1>Order #{order.order_number}</h1>
          <p>Placed on {formatDate(order.created_at)} by {order.customer_name}</p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => router.push('/orders')}
          >
            Back to Orders
          </button>
          <button
            className="btn btn-success"
            onClick={() => setShowStatusModal(true)}
          >
            Update Status
          </button>
          {order.status !== 'cancelled' && order.status !== 'refunded' && (
            <button
              className="btn btn-danger"
              onClick={handleCancelOrder}
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>

      <div className="content-grid">
        <div className="main-content">
          {/* Order Items */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Order Items</h2>
            </div>
            <div className="card-body">
              <div className="order-items">
                {order.items.map((item) => (
                  <div key={item.id} className="order-item">
                    {item.thumbnail_small_url ? (
                      <img
                        src={item.thumbnail_small_url}
                        alt={item.product_name}
                        className="item-image"
                      />
                    ) : (
                      <div className="item-placeholder">
                        <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="item-details">
                      <div className="item-name">{item.product_name}</div>
                      <div className="item-sku">SKU: {item.product_sku}</div>
                      {item.variant_details && (
                        <div className="item-variant">
                          {JSON.parse(item.variant_details).size && `Size: ${JSON.parse(item.variant_details).size}`}
                          {JSON.parse(item.variant_details).color && `, Color: ${JSON.parse(item.variant_details).color}`}
                        </div>
                      )}
                    </div>
                    <div className="item-pricing">
                      <div className="item-price">
                        ${item.unit_price.toFixed(2)} × {item.quantity}
                      </div>
                      <div className="item-total">
                        Total: ${item.total_price.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Order Timeline */}
          {order.status_history && order.status_history.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Order Timeline</h2>
              </div>
              <div className="card-body">
                <div className="timeline">
                  {order.status_history.map((entry) => (
                    <div key={entry.id} className="timeline-item">
                      <div className={`timeline-icon ${getStatusColor(entry.status)}`}>
                        ✓
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-status">
                          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                        </div>
                        {entry.status_details?.notes && (
                          <div className="timeline-notes">
                            {entry.status_details.notes}
                          </div>
                        )}
                        <div className="timeline-meta">
                          {formatDate(entry.created_at)}
                          {entry.status_details?.changed_by_name && (
                            <> • Updated by {entry.status_details.changed_by_name}</>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="sidebar">
          {/* Order Status */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Order Status</h2>
            </div>
            <div className="card-body">
              <span className={`status ${getStatusColor(order.status)}`}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
              {order.status === 'shipped' && order.tracking_number && (
                <div style={{ marginTop: '1rem' }}>
                  <strong>Tracking Number:</strong><br />
                  {order.tracking_number}
                </div>
              )}
            </div>
          </div>

          {/* Order Summary */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Order Summary</h2>
            </div>
            <div className="card-body">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>${order.subtotal.toFixed(2)}</span>
              </div>
              {order.tax_amount > 0 && (
                <div className="summary-row">
                  <span>Tax</span>
                  <span>${order.tax_amount.toFixed(2)}</span>
                </div>
              )}
              {order.shipping_amount > 0 && (
                <div className="summary-row">
                  <span>Shipping</span>
                  <span>${order.shipping_amount.toFixed(2)}</span>
                </div>
              )}
              {order.discount_amount > 0 && (
                <div className="summary-row">
                  <span>Discount</span>
                  <span style={{ color: '#059669' }}>-${order.discount_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="summary-row total">
                <span>Total</span>
                <span>${order.total_amount.toFixed(2)}</span>
              </div>
              
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => setShowRefundModal(true)}
                  disabled={order.status === 'cancelled' || order.status === 'refunded'}
                >
                  Process Refund
                </button>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Customer Information</h2>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: '1rem' }}>
                <strong>{order.customer_name}</strong><br />
                {order.customer_email}<br />
                {order.customer_phone && <>{order.customer_phone}<br /></>}
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {order.shipping_address && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Shipping Address</h2>
              </div>
              <div className="card-body">
                <div className="address-info">
                  <div className="name">
                    {order.shipping_address.first_name} {order.shipping_address.last_name}
                  </div>
                  {order.shipping_address.company && (
                    <div>{order.shipping_address.company}</div>
                  )}
                  <div>{order.shipping_address.address_line_1}</div>
                  {order.shipping_address.address_line_2 && (
                    <div>{order.shipping_address.address_line_2}</div>
                  )}
                  <div>
                    {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}
                  </div>
                  <div>{order.shipping_address.country}</div>
                  {order.shipping_address.phone && (
                    <div style={{ marginTop: '0.5rem' }}>
                      Phone: {order.shipping_address.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Update Order Status</h3>
              <button
                className="modal-close"
                onClick={() => setShowStatusModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">New Status</label>
                <select
                  className="form-select"
                  value={statusUpdate.status}
                  onChange={(e) => setStatusUpdate(prev => ({ ...prev, status: e.target.value }))}
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

              <div className="form-group">
                <label className="form-label">Notes (Optional)</label>
                <textarea
                  className="form-textarea"
                  placeholder="Add any notes about this status change..."
                  value={statusUpdate.notes}
                  onChange={(e) => setStatusUpdate(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowStatusModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStatusUpdate}
              >
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="modal-overlay" onClick={() => setShowRefundModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Process Refund</h3>
              <button
                className="modal-close"
                onClick={() => setShowRefundModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Refund Amount ($)</label>
                <input
                  type="number"
                  className="form-input"
                  step="0.01"
                  max={order.total_amount}
                  value={refundData.amount}
                  onChange={(e) => setRefundData(prev => ({ ...prev, amount: e.target.value }))}
                />
                <small style={{ color: '#6b7280' }}>
                  Maximum refund amount: ${order.total_amount.toFixed(2)}
                </small>
              </div>

              <div className="form-group">
                <label className="form-label">Reason</label>
                <select
                  className="form-select"
                  value={refundData.reason}
                  onChange={(e) => setRefundData(prev => ({ ...prev, reason: e.target.value }))}
                >
                  <option value="customer_request">Customer Request</option>
                  <option value="defective_product">Defective Product</option>
                  <option value="wrong_item">Wrong Item</option>
                  <option value="damaged_shipping">Damaged in Shipping</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Additional Notes</label>
                <textarea
                  className="form-textarea"
                  placeholder="Add any additional notes about this refund..."
                  value={refundData.reasonNotes}
                  onChange={(e) => setRefundData(prev => ({ ...prev, reasonNotes: e.target.value }))}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowRefundModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleRefund}
              >
                Process Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}