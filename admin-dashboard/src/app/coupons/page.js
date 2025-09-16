'use client';

import { useState, useEffect } from 'react';

const CouponsPage = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    type: '',
    isActive: ''
  });

  // Form state for creating/editing coupons
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    type: 'percentage',
    value: '',
    minimumOrderAmount: '',
    maximumDiscountAmount: '',
    usageLimit: '',
    usageLimitPerCustomer: '1',
    startsAt: '',
    expiresAt: ''
  });

  useEffect(() => {
    fetchCoupons();
  }, [currentPage, filters]);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      setError('');

      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });

      const response = await fetch(`http://localhost:6666/api/coupons?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        setCoupons(data.data.coupons);
        setTotalPages(data.data.pagination.totalPages);
      } else {
        setError(data.message || 'Failed to fetch coupons');
      }
    } catch (err) {
      console.error('Error fetching coupons:', err);
      setError('Error loading coupons');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    
    try {
      setError('');
      setSuccess('');

      const payload = {
        ...formData,
        value: parseFloat(formData.value),
        minimumOrderAmount: formData.minimumOrderAmount ? parseFloat(formData.minimumOrderAmount) : 0,
        maximumDiscountAmount: formData.maximumDiscountAmount ? parseFloat(formData.maximumDiscountAmount) : null,
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
        usageLimitPerCustomer: parseInt(formData.usageLimitPerCustomer),
        startsAt: formData.startsAt || null,
        expiresAt: formData.expiresAt || null
      };

      const response = await fetch('http://localhost:6666/api/coupons', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Coupon created successfully');
        setShowCreateModal(false);
        resetForm();
        fetchCoupons();
      } else {
        setError(data.message || 'Failed to create coupon');
      }
    } catch (err) {
      console.error('Error creating coupon:', err);
      setError('Error creating coupon');
    }
  };

  const handleUpdateCoupon = async (e) => {
    e.preventDefault();
    
    try {
      setError('');
      setSuccess('');

      const payload = {
        ...formData,
        value: parseFloat(formData.value),
        minimumOrderAmount: formData.minimumOrderAmount ? parseFloat(formData.minimumOrderAmount) : 0,
        maximumDiscountAmount: formData.maximumDiscountAmount ? parseFloat(formData.maximumDiscountAmount) : null,
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
        usageLimitPerCustomer: parseInt(formData.usageLimitPerCustomer)
      };

      const response = await fetch(`http://localhost:6666/api/coupons/${editingCoupon.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Coupon updated successfully');
        setEditingCoupon(null);
        resetForm();
        fetchCoupons();
      } else {
        setError(data.message || 'Failed to update coupon');
      }
    } catch (err) {
      console.error('Error updating coupon:', err);
      setError('Error updating coupon');
    }
  };

  const handleDeleteCoupon = async (couponId) => {
    if (!confirm('Are you sure you want to delete this coupon?')) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      const response = await fetch(`http://localhost:6666/api/coupons/${couponId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Coupon deleted successfully');
        fetchCoupons();
      } else {
        setError(data.message || 'Failed to delete coupon');
      }
    } catch (err) {
      console.error('Error deleting coupon:', err);
      setError('Error deleting coupon');
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      type: 'percentage',
      value: '',
      minimumOrderAmount: '',
      maximumDiscountAmount: '',
      usageLimit: '',
      usageLimitPerCustomer: '1',
      startsAt: '',
      expiresAt: ''
    });
  };

  const openEditModal = (coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      name: coupon.name,
      description: coupon.discount_details?.description || '',
      type: coupon.type,
      value: coupon.value.toString(),
      minimumOrderAmount: coupon.minimum_order_amount?.toString() || '',
      maximumDiscountAmount: coupon.maximum_discount_amount?.toString() || '',
      usageLimit: coupon.usage_limit?.toString() || '',
      usageLimitPerCustomer: coupon.usage_limit_per_customer?.toString() || '1',
      startsAt: coupon.starts_at ? new Date(coupon.starts_at).toISOString().slice(0, 16) : '',
      expiresAt: coupon.expires_at ? new Date(coupon.expires_at).toISOString().slice(0, 16) : ''
    });
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingCoupon(null);
    resetForm();
    setError('');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No expiration';
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const CouponForm = () => (
    <form onSubmit={editingCoupon ? handleUpdateCoupon : handleCreateCoupon} className="coupon-form">
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="code">Coupon Code *</label>
          <input
            type="text"
            id="code"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            placeholder="e.g., SAVE10"
            required
            disabled={editingCoupon} // Don't allow editing code
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="name">Display Name *</label>
          <input
            type="text"
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., 10% Off Everything"
            required
            className="form-input"
          />
        </div>

        <div className="form-group full-width">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Describe the coupon offer"
            rows="3"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="type">Discount Type *</label>
          <select
            id="type"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            required
            className="form-input"
          >
            <option value="percentage">Percentage Off</option>
            <option value="fixed_amount">Fixed Amount Off</option>
            <option value="free_shipping">Free Shipping</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="value">
            {formData.type === 'percentage' ? 'Percentage (%)' : 
             formData.type === 'fixed_amount' ? 'Amount ($)' : 'Value'} *
          </label>
          <input
            type="number"
            id="value"
            value={formData.value}
            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
            placeholder={formData.type === 'percentage' ? '10' : '20'}
            required={formData.type !== 'free_shipping'}
            disabled={formData.type === 'free_shipping'}
            min="0"
            step={formData.type === 'percentage' ? '1' : '0.01'}
            max={formData.type === 'percentage' ? '100' : undefined}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="minimumOrderAmount">Minimum Order Amount ($)</label>
          <input
            type="number"
            id="minimumOrderAmount"
            value={formData.minimumOrderAmount}
            onChange={(e) => setFormData({ ...formData, minimumOrderAmount: e.target.value })}
            placeholder="0"
            min="0"
            step="0.01"
            className="form-input"
          />
        </div>

        {formData.type === 'percentage' && (
          <div className="form-group">
            <label htmlFor="maximumDiscountAmount">Maximum Discount ($)</label>
            <input
              type="number"
              id="maximumDiscountAmount"
              value={formData.maximumDiscountAmount}
              onChange={(e) => setFormData({ ...formData, maximumDiscountAmount: e.target.value })}
              placeholder="No limit"
              min="0"
              step="0.01"
              className="form-input"
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="usageLimit">Total Usage Limit</label>
          <input
            type="number"
            id="usageLimit"
            value={formData.usageLimit}
            onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
            placeholder="Unlimited"
            min="1"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="usageLimitPerCustomer">Usage Limit Per Customer *</label>
          <input
            type="number"
            id="usageLimitPerCustomer"
            value={formData.usageLimitPerCustomer}
            onChange={(e) => setFormData({ ...formData, usageLimitPerCustomer: e.target.value })}
            placeholder="1"
            min="1"
            required
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="startsAt">Start Date</label>
          <input
            type="datetime-local"
            id="startsAt"
            value={formData.startsAt}
            onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="expiresAt">Expiration Date</label>
          <input
            type="datetime-local"
            id="expiresAt"
            value={formData.expiresAt}
            onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
            className="form-input"
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="button" onClick={closeModal} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="coupons-page">
      <div className="page-header">
        <h1>Coupon Management</h1>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="btn-primary"
        >
          Create New Coupon
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      {/* Filters */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search coupons..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="filter-input"
        />
        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="filter-select"
        >
          <option value="">All Types</option>
          <option value="percentage">Percentage</option>
          <option value="fixed_amount">Fixed Amount</option>
          <option value="free_shipping">Free Shipping</option>
        </select>
        <select
          value={filters.isActive}
          onChange={(e) => setFilters({ ...filters, isActive: e.target.value })}
          className="filter-select"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Coupons Table */}
      <div className="table-container">
        {loading ? (
          <div className="loading">Loading coupons...</div>
        ) : (
          <table className="coupons-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
                <th>Usage</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id}>
                  <td className="coupon-code">{coupon.code}</td>
                  <td>{coupon.name}</td>
                  <td className="coupon-type">
                    {coupon.type === 'percentage' ? 'Percentage' :
                     coupon.type === 'fixed_amount' ? 'Fixed Amount' : 'Free Shipping'}
                  </td>
                  <td>
                    {coupon.type === 'percentage' ? `${coupon.value}%` :
                     coupon.type === 'fixed_amount' ? formatCurrency(coupon.value) : 'Free Shipping'}
                  </td>
                  <td>
                    {coupon.usage_count} / {coupon.usage_limit || '∞'}
                  </td>
                  <td>{formatDate(coupon.expires_at)}</td>
                  <td>
                    <span className={`status ${coupon.is_active ? 'active' : 'inactive'}`}>
                      {coupon.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      onClick={() => openEditModal(coupon)}
                      className="btn-edit"
                      title="Edit coupon"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCoupon(coupon.id)}
                      className="btn-delete"
                      title="Delete coupon"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="pagination-btn"
          >
            Next
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}</h2>
              <button onClick={closeModal} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <CouponForm />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .coupons-page {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .page-header h1 {
          margin: 0;
          color: #1f2937;
        }

        .btn-primary {
          background-color: #3b82f6;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s;
        }

        .btn-primary:hover {
          background-color: #2563eb;
        }

        .btn-secondary {
          background-color: #6b7280;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s;
        }

        .btn-secondary:hover {
          background-color: #4b5563;
        }

        .alert {
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }

        .alert-error {
          background-color: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        .alert-success {
          background-color: #f0fdf4;
          color: #16a34a;
          border: 1px solid #bbf7d0;
        }

        .filters {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }

        .filter-input, .filter-select {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .filter-input {
          flex: 1;
          min-width: 200px;
        }

        .table-container {
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .coupons-table {
          width: 100%;
          border-collapse: collapse;
        }

        .coupons-table th,
        .coupons-table td {
          padding: 1rem;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }

        .coupons-table th {
          background-color: #f9fafb;
          font-weight: 600;
          color: #374151;
        }

        .coupon-code {
          font-family: monospace;
          font-weight: 600;
          color: #1f2937;
        }

        .coupon-type {
          text-transform: capitalize;
        }

        .status {
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .status.active {
          background-color: #d1fae5;
          color: #065f46;
        }

        .status.inactive {
          background-color: #fee2e2;
          color: #991b1b;
        }

        .actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn-edit, .btn-delete {
          padding: 0.25rem 0.75rem;
          border: none;
          border-radius: 0.25rem;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .btn-edit {
          background-color: #dbeafe;
          color: #1d4ed8;
        }

        .btn-edit:hover {
          background-color: #bfdbfe;
        }

        .btn-delete {
          background-color: #fee2e2;
          color: #dc2626;
        }

        .btn-delete:hover {
          background-color: #fecaca;
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          margin-top: 2rem;
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

        .pagination-info {
          color: #6b7280;
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
          max-width: 800px;
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

        .modal-header h2 {
          margin: 0;
          color: #1f2937;
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

        .coupon-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-group label {
          font-weight: 500;
          color: #374151;
        }

        .form-input {
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .form-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-input:disabled {
          background-color: #f9fafb;
          color: #6b7280;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        .loading {
          text-align: center;
          padding: 2rem;
          color: #6b7280;
        }

        @media (max-width: 768px) {
          .coupons-page {
            padding: 1rem;
          }

          .page-header {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
          }

          .filters {
            flex-direction: column;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .coupons-table {
            font-size: 0.875rem;
          }

          .coupons-table th,
          .coupons-table td {
            padding: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
};

export default CouponsPage;