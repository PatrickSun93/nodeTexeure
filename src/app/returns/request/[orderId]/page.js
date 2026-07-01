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

const RTN_STYLES = `
.rtn-scope { background: var(--noirae-bg-cream); min-height: 100vh; }
.rtn-scope .nt-breadcrumb { color: var(--noirae-text-muted); font-family: var(--noirae-font-sans); }
.rtn-scope .nt-breadcrumb a { color: var(--noirae-text-secondary); }
.rtn-scope .nt-breadcrumb a:hover { color: var(--noirae-accent-gold); }
.rtn-scope .nt-breadcrumb-sep { color: var(--noirae-border-dark); }
.rtn-scope .nt-error-banner { background: var(--noirae-error-bg); border: 1px solid var(--noirae-error); color: var(--noirae-error); border-radius: 0; font-family: var(--noirae-font-sans); }
.rtn-card { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); }
.rtn-meta { font-family: var(--noirae-font-sans); font-size: 0.82rem; color: var(--noirae-text-secondary); margin-top: 0.2rem; }
.rtn-form-label { display: block; font-family: var(--noirae-font-sans); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--noirae-text-muted); margin-bottom: 0.6rem; }
.rtn-check { display: flex; align-items: center; gap: 0.85rem; padding: 0.9rem 0; border-bottom: 1px solid var(--noirae-border-light); cursor: pointer; }
.rtn-check:last-child { border-bottom: none; padding-bottom: 0; }
.rtn-scope .rtn-field { width: 100%; font-family: var(--noirae-font-sans); font-size: 0.9rem; color: var(--noirae-text-primary); background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-dark); border-radius: 0; padding: 0.85rem 1rem; transition: border-color .2s ease; }
.rtn-scope .rtn-field:focus { outline: none; border-color: var(--noirae-accent-gold); }
.rtn-scope .rtn-field::placeholder { color: var(--noirae-text-muted); }
.rtn-btn { display: inline-flex; align-items: center; justify-content: center; font-family: var(--noirae-font-sans); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 400; padding: 0.85rem 1.6rem; border-radius: 0; cursor: pointer; text-decoration: none; transition: all .25s ease; border: 1px solid transparent; }
.rtn-btn-dark { background: var(--noirae-text-primary); color: var(--noirae-bg-cream); }
.rtn-btn-dark:hover { background: var(--noirae-accent-gold); }
.rtn-btn-dark:disabled { background: var(--noirae-text-muted); cursor: not-allowed; }
.rtn-btn-ghost { background: transparent; color: var(--noirae-text-primary); border-color: var(--noirae-border-dark); }
.rtn-btn-ghost:hover { border-color: var(--noirae-text-primary); }
`;

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
      <div className="aesop-page rtn-scope"><Header />
        <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <div className="aesop-loading-spinner" style={{ margin: '0 auto' }}></div>
        </main><Footer />
        <style>{RTN_STYLES}</style>
      </div>
    );
  }

  return (
    <div className="aesop-page rtn-scope">
      <Header />
      <main style={{ padding: '2rem 0 4.5rem' }}>
        <div className="aesop-container" style={{ maxWidth: '700px', margin: '0 auto' }}>
          <nav className="nt-breadcrumb">
            <Link href="/">Home</Link><span className="nt-breadcrumb-sep">/</span>
            <Link href="/orders">Orders</Link><span className="nt-breadcrumb-sep">/</span>
            <span>Return Request</span>
          </nav>

          <h1 className="noirae-heading-hero" style={{ margin: '1.25rem 0 0.5rem' }}>Request a Return</h1>
          <p style={{ fontFamily: 'var(--noirae-font-sans)', color: 'var(--noirae-text-secondary)', fontSize: '0.95rem', marginBottom: '2.25rem' }}>Order: {order?.order_number || orderId}</p>

          {error && <div className="nt-error-banner" style={{ marginBottom: '1.5rem' }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            {/* Select items */}
            <div className="rtn-card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--noirae-font-serif)', fontSize: '1.5rem', color: 'var(--noirae-text-primary)', marginBottom: '0.75rem' }}>Select Items to Return</h2>
              {(order?.items || []).map(item => (
                <label key={item.id} className="rtn-check">
                  <input
                    type="checkbox"
                    checked={selectedItems[item.id]?.selected || false}
                    onChange={() => handleToggleItem(item.id)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--noirae-accent-gold)', flex: '0 0 auto' }}
                  />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: 'var(--noirae-font-sans)', fontSize: '0.92rem', fontWeight: 500, color: 'var(--noirae-text-primary)' }}>{item.product_name}</p>
                    <p className="rtn-meta">Qty: {item.quantity} &middot; ${parseFloat(item.unit_price).toFixed(2)} each</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Reason */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="rtn-form-label">Reason for Return</label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                required
                className="rtn-field"
              >
                <option value="">Select a reason...</option>
                {REASON_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '2rem' }}>
              <label className="rtn-form-label">Additional Details (optional)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                className="rtn-field"
                style={{ resize: 'vertical' }}
                placeholder="Describe the issue in detail..."
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="submit"
                disabled={submitting}
                className="rtn-btn rtn-btn-dark"
              >
                {submitting ? 'Submitting...' : 'Submit Return Request'}
              </button>
              <Link href="/orders" className="rtn-btn rtn-btn-ghost">Cancel</Link>
            </div>
          </form>
        </div>
      </main>
      <Footer />
      <style>{RTN_STYLES}</style>
    </div>
  );
}
