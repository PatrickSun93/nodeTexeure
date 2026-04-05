'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Header from '../../../../components/Header';
import Footer from '../../../../components/Footer';
import { apiRequest } from '../../../../lib/api';

const REASON_OPTIONS = [
  { value: 'defective', label: 'Defective product' },
  { value: 'wrong_item', label: 'Wrong item received' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'damaged_shipping', label: 'Damaged during shipping' },
  { value: 'other', label: 'Other' },
];

export default function ReturnRequestPage() {
  const { orderId } = useParams();
  const { data: session } = useSession();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [selectedItems, setSelectedItems] = useState({});

  useEffect(() => {
    if (!session?.accessToken || !orderId) return;
    const fetchOrder = async () => {
      try {
        const data = await apiRequest(`/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (data?.status === 'SUCCESS') {
          const o = data.keyValueTable?.order || data.keyValueTable;
          setOrder(o);
          // Pre-select all items
          const items = o.items || [];
          const sel = {};
          items.forEach(item => { sel[item.id] = { selected: true, quantity: item.quantity }; });
          setSelectedItems(sel);
        } else {
          setError('Order not found');
        }
      } catch (err) {
        setError(err.message || 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderId, session]);

  const handleToggleItem = (itemId) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], selected: !prev[itemId]?.selected },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) { setError('Please select a reason'); return; }

    const items = Object.entries(selectedItems)
      .filter(([, v]) => v.selected)
      .map(([itemId, v]) => ({ orderItemId: itemId, quantity: v.quantity || 1 }));

    if (items.length === 0) { setError('Please select at least one item'); return; }

    setSubmitting(true);
    setError('');

    try {
      const data = await apiRequest('/returns/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ orderId, reason, description, items }),
      });
      if (data?.status === 'SUCCESS') {
        const returnId = data.keyValueTable?.returnId;
        router.push(`/returns/${returnId}`);
      } else {
        setError(data?.message || 'Failed to submit return request');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="aesop-page"><Header />
        <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <div className="aesop-loading-spinner" style={{ margin: '0 auto' }}></div>
        </main><Footer />
      </div>
    );
  }

  return (
    <div className="aesop-page">
      <Header />
      <main style={{ padding: '2rem 0 4rem' }}>
        <div className="aesop-container" style={{ maxWidth: '700px', margin: '0 auto' }}>
          <nav className="nt-breadcrumb">
            <Link href="/">Home</Link><span className="nt-breadcrumb-sep">/</span>
            <Link href="/orders">Orders</Link><span className="nt-breadcrumb-sep">/</span>
            <span>Return Request</span>
          </nav>

          <h1 className="noirae-heading-hero" style={{ margin: '1.5rem 0' }}>Request a Return</h1>
          <p style={{ color: '#666', marginBottom: '2rem' }}>Order: {order?.order_number || orderId}</p>

          {error && <div className="nt-error-banner" style={{ marginBottom: '1.5rem' }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            {/* Select items */}
            <div style={{ border: '1px solid #e5e5e5', borderRadius: '4px', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Select Items to Return</h2>
              {(order?.items || []).map(item => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedItems[item.id]?.selected || false}
                    onChange={() => handleToggleItem(item.id)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500 }}>{item.product_name}</p>
                    <p style={{ fontSize: '0.8rem', color: '#666' }}>Qty: {item.quantity} &middot; ${parseFloat(item.unit_price).toFixed(2)} each</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Reason */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>Reason for Return</label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                required
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: '4px', fontSize: '0.875rem' }}
              >
                <option value="">Select a reason...</option>
                {REASON_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>Additional Details (optional)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: '4px', fontSize: '0.875rem', resize: 'vertical' }}
                placeholder="Describe the issue in detail..."
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="submit"
                disabled={submitting}
                className="nt-btn nt-btn-primary"
              >
                {submitting ? 'Submitting...' : 'Submit Return Request'}
              </button>
              <Link href="/orders" className="nt-btn nt-btn-secondary">Cancel</Link>
            </div>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
