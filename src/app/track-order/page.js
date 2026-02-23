'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

const STATUS_STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrack = async (e) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    setLoading(true);
    setError('');
    setTracking(null);

    try {
      const data = await apiRequest(`/orders/track/${orderNumber.trim()}`);
      if (data?.status === 'SUCCESS') {
        setTracking(data.keyValueTable?.tracking || data.keyValueTable);
      } else {
        setError('Order not found');
      }
    } catch (err) {
      setError(err.message || 'Order not found. Please check the order number.');
    } finally {
      setLoading(false);
    }
  };

  const statusIdx = tracking ? STATUS_STEPS.indexOf(tracking.status) : -1;

  return (
    <div className="aesop-page">
      <Header />
      <main className="nt-tracking-page">
        <div className="aesop-container">
          <nav className="nt-breadcrumb">
            <Link href="/">Home</Link>
            <span className="nt-breadcrumb-sep">/</span>
            <span>Track Order</span>
          </nav>

          <h1 className="nt-page-title" style={{ textAlign: 'center' }}>Track Your Order</h1>

          <form className="nt-tracking-form" onSubmit={handleTrack}>
            <input
              type="text"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              placeholder="Enter your order number"
            />
            <button className="nt-btn nt-btn-primary nt-btn-full" type="submit" disabled={loading}>
              {loading ? 'Searching...' : 'Track Order'}
            </button>
          </form>

          {error && (
            <div className="nt-error-banner" style={{ maxWidth: '500px', margin: '1.5rem auto' }}>{error}</div>
          )}

          {tracking && (
            <div style={{ maxWidth: '700px', margin: '2.5rem auto 0' }}>
              <div className="nt-confirmation-banner" style={{ padding: '1.5rem' }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Order #{tracking.order_number}</h2>
                <p style={{ color: '#666', fontSize: '0.9rem' }}>
                  Placed on {new Date(tracking.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>

              {/* Status Timeline */}
              <div className="nt-status-timeline" style={{ marginBottom: '2rem' }}>
                {STATUS_STEPS.map((step, idx) => (
                  <div key={step} className={`nt-timeline-step ${idx <= statusIdx ? 'nt-step-active' : ''} ${idx === statusIdx ? 'nt-step-current' : ''}`}>
                    <div className="nt-timeline-dot">{idx < statusIdx ? '✓' : idx + 1}</div>
                    <span className="nt-timeline-label">{step.charAt(0).toUpperCase() + step.slice(1)}</span>
                  </div>
                ))}
              </div>

              {tracking.tracking_number && (
                <div className="nt-info-card">
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Tracking Number</h3>
                  <p className="nt-tracking-number">{tracking.tracking_number}</p>
                </div>
              )}

              {tracking.history && tracking.history.length > 0 && (
                <div className="nt-info-card" style={{ marginTop: '1rem' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Status History</h3>
                  {tracking.history.map((h, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: idx < tracking.history.length - 1 ? '1px solid #eee' : 'none', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{h.status}</span>
                      <span style={{ color: '#888' }}>{new Date(h.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
