'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adminAPI } from '../../utils/api';

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: '',
    customerEmail: '',
    orderNumber: '',
    minAmount: '',
    maxAmount: ''
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalOrders: 0,
    limit: 20
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState({
    status: '',
    notes: ''
  });

  useEffect(() => {
    fetchOrders();
  }, [filters, pagination.currentPage]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.currentPage,
        limit: pagination.limit,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''))
      };

      const result = await adminAPI.getOrders(params);

      if (result.success) {
        setOrders(result.data.orders);
        setPagination(result.data.pagination);
      } else {
        setError(result.message || 'Failed to fetch orders');
      }
    } catch (err) {
      setError('Failed to fetch orders');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      dateFrom: '',
      dateTo: '',
      customerEmail: '',
      orderNumber: '',
      minAmount: '',
      maxAmount: ''
    });
  };

  const handleStatusUpdate = async () => {
    if (!selectedOrder || !statusUpdate.status) return;

    try {
      const result = await adminAPI.updateOrderStatus(
        selectedOrder.id, 
        statusUpdate.status, 
        statusUpdate.notes
      );

      if (result.success) {
        setShowStatusModal(false);
        setSelectedOrder(null);
        setStatusUpdate({ status: '', notes: '' });
        fetchOrders(); // Refresh the list
      } else {
        alert(result.message || 'Failed to update order status');
      }
    } catch (err) {
      alert('Failed to update order status');
      console.error('Error updating status:', err);
    }
  };

  const handleCancelOrder = async (orderId, reason) => {
    if (!reason) return;

    try {
      const result = await adminAPI.cancelOrder(orderId, reason);

      if (result.success) {
        fetchOrders(); // Refresh the list
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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="orders-page">
      <style jsx>{`
        .orders-page {
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .page-title {
          font-size: 2rem;
          font-weight: bold;
          color: #1f2937;
          margin: 0;
        }

        .filters-section {
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
        }

        .filter-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.25rem;
        }

        .filter-input, .filter-select {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .filter-actions {
          display: flex;
          gap: 1rem;
        }

        .btn {
          padding: 0.5rem 1rem;
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

        .orders-table-container {
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .orders-table {
          width: 100%;
          border-collapse: collapse;
        }

        .orders-table th,
        .orders-table td {
          padding: 1rem;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }

        .orders-table th {
          background-color: #f9fafb;
          font-weight: 600;
          color: #374151;
        }

        .status {
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 500;
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

        .actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn-sm {
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
        }

        .btn-view {
          background-color: #3b82f6;
          color: white;
        }

        .btn-status {
          background-color: #059669;
          color: white;
        }

        .btn-cancel {
          background-color: #dc2626;
          color: white;
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          margin-top: 2rem;
        }

        .pagination-info {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .pagination-btn {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 0.375rem;
          cursor: pointer;
        }

        .pagination-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          padding: 1.5rem;
          border-top: 1px solid #e5e7eb;
        }

        .loading {
          text-align: center;
          padding: 2rem;
        }

        .error {
          background-color: #fee2e2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          color: #6b7280;
        }
      `}</style>

      <div className="page-header">
        <h1 className="page-title">Order Management</h1>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filters-grid">
          <div className="filter-group">
            <label className="filter-label">Status</label>
            <select
              className="filter-select"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Date From</label>
            <input
              type="date"
              className="filter-input"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Date To</label>
            <input
              type="date"
              className="filter-input"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Customer Email</label>
            <input
              type="email"
              className="filter-input"
              placeholder="customer@example.com"
              value={filters.customerEmail}
              onChange={(e) => handleFilterChange('customerEmail', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Order Number</label>
            <input
              type="text"
              className="filter-input"
              placeholder="ORDER0000000001"
              value={filters.orderNumber}
              onChange={(e) => handleFilterChange('orderNumber', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Min Amount ($)</label>
            <input
              type="number"
              className="filter-input"
              placeholder="0"
              value={filters.minAmount}
              onChange={(e) => handleFilterChange('minAmount', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Max Amount ($)</label>
            <input
              type="number"
              className="filter-input"
              placeholder="1000"
              value={filters.maxAmount}
              onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
            />
          </div>
        </div>

        <div className="filter-actions">
          <button className="btn btn-primary" onClick={fetchOrders}>
            Apply Filters
          </button>
          <button className="btn btn-secondary" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {/* Orders Table */}
      {loading ? (
        <div className="loading">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <p>No orders found matching your criteria.</p>
        </div>
      ) : (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <div>
                      <div className="font-medium">{order.order_number}</div>
                      <div className="text-sm text-gray-500">{order.id}</div>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div className="font-medium">{order.customer_name}</div>
                      <div className="text-sm text-gray-500">{order.customer_email}</div>
                    </div>
                  </td>
                  <td>
                    <span className={`status ${getStatusColor(order.status)}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </td>
                  <td className="font-medium">${order.total_amount.toFixed(2)}</td>
                  <td>{formatDate(order.created_at)}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="btn btn-sm btn-view"
                        onClick={() => router.push(`/orders/${order.id}`)}
                      >
                        View
                      </button>
                      <button
                        className="btn btn-sm btn-status"
                        onClick={() => {
                          setSelectedOrder(order);
                          setStatusUpdate({ status: order.status, notes: '' });
                          setShowStatusModal(true);
                        }}
                      >
                        Update Status
                      </button>
                      {order.status === 'pending' && (
                        <button
                          className="btn btn-sm btn-cancel"
                          onClick={() => {
                            const reason = prompt('Enter cancellation reason:');
                            if (reason) {
                              handleCancelOrder(order.id, reason);
                            }
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            disabled={pagination.currentPage === 1}
            onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
          >
            Previous
          </button>
          
          <span className="pagination-info">
            Page {pagination.currentPage} of {pagination.totalPages} 
            ({pagination.totalOrders} total orders)
          </span>
          
          <button
            className="pagination-btn"
            disabled={pagination.currentPage === pagination.totalPages}
            onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
          >
            Next
          </button>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedOrder && (
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
                <label className="form-label">Order</label>
                <div className="text-sm text-gray-600">
                  #{selectedOrder.order_number} - {selectedOrder.customer_name}
                </div>
              </div>

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
    </div>
  );
}