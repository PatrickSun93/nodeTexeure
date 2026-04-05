'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { apiRequest } from '../../../lib/api';

const STATUS_STEPS = ['requested', 'approved', 'shipped_back', 'received', 'processed'];

export default function ReturnDetailPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const [returnData, setReturnData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.accessToken || !id) return;
    const fetchReturn = async () => {
      try {
        const data = await apiRequest(`/returns/${id}`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (data?.status === 'SUCCESS') {
          setReturnData(data.keyValueTable?.return || data.keyValueTable);
        } else {
          setError('Return not found');
        }
      } catch (err) {
        setError(err.message || 'Failed to load return');
      } finally {
        setLoading(false);
      }
    };
    fetchReturn();
  }, [id, session]);

  if (loading) {
    return (
      <div className="aesop-page"><Header />
        <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <div className="aesop-loading-spinner" style={{ margin: '0 auto' }}></div>
        </main><Footer />
      </div>
    );
  }

  if (error || !returnData) {
    return (
      <div className="aesop-page"><Header />
        <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <p className="noirae-body-text">{error || 'Return not found'}</p>
          <Link href="/returns" className="nt-btn nt-btn-primary" style={{ marginTop: '1.5rem', display: 'inline-block' }}>Back to Returns</Link>
        </main><Footer />
      </div>
    );
  }

  const currentStep = STATUS_STEPS.indexOf(returnData.status);
  const isRejected = returnData.status === 'rejected';
  const isClosed = returnData.status === 'closed';

  return (
    <div className="aesop-page">
      <Header />
      <main style={{ padding: '2rem 0 4rem' }}>
        <div className="aesop-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <nav className="nt-breadcrumb">
            <Link href="/">Home</Link><span className="nt-breadcrumb-sep">/</span>
            <Link href="/returns">My Returns</Link><span className="nt-breadcrumb-sep">/</span>
            <span>{returnData.return_number}</span>
          </nav>

          <h1 className="noirae-heading-hero" style={{ margin: '1.5rem 0 0.5rem' }}>
            Return {returnData.return_number}
          </h1>
          <p style={{ color: '#666', marginBottom: '2rem' }}>Order: {returnData.order_number}</p>

          {/* Status Timeline */}
          {!isRejected && !isClosed && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5rem', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '14px', left: '20px', right: '20px', height: '2px', backgroundColor: '#e5e5e5', zIndex: 0 }} />
              {STATUS_STEPS.map((step, idx) => (
                <div key={step} style={{ textAlign: 'center', position: 'relative', zIndex: 1, flex: 1 }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto 0.5rem',
                    backgroundColor: idx <= currentStep ? '#333' : '#e5e5e5',
                    color: idx <= currentStep ? '#fff' : '#999',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600,
                  }}>
                    {idx <= currentStep ? '\u2713' : idx + 1}
                  </div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'capitalize', color: idx <= currentStep ? '#333' : '#999' }}>
                    {step.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isRejected && (
            <div style={{ padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', marginBottom: '1.5rem' }}>
              <p style={{ color: '#dc2626', fontWeight: 500 }}>Return request was rejected.</p>
              {returnData.return_details?.admin_notes && (
                <p style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}>{returnData.return_details.admin_notes}</p>
              )}
            </div>
          )}

          {/* Details */}
          <div style={{ border: '1px solid #e5e5e5', borderRadius: '4px', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Return Details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div><span style={{ color: '#666' }}>Reason:</span> <span style={{ textTransform: 'capitalize' }}>{returnData.reason?.replace(/_/g, ' ')}</span></div>
              <div><span style={{ color: '#666' }}>Status:</span> <span style={{ textTransform: 'capitalize' }}>{returnData.status?.replace(/_/g, ' ')}</span></div>
              <div><span style={{ color: '#666' }}>Submitted:</span> {new Date(returnData.created_at).toLocaleDateString()}</div>
              {returnData.refund_amount && <div><span style={{ color: '#666' }}>Refund Amount:</span> ${parseFloat(returnData.refund_amount).toFixed(2)}</div>}
              {returnData.return_tracking_number && <div><span style={{ color: '#666' }}>Tracking:</span> {returnData.return_tracking_number}</div>}
            </div>
            {returnData.return_details?.description && (
              <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#444' }}>{returnData.return_details.description}</p>
            )}
          </div>

          {/* Return Items */}
          {returnData.items && returnData.items.length > 0 && (
            <div style={{ border: '1px solid #e5e5e5', borderRadius: '4px', padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Items Being Returned</h2>
              {returnData.items.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #f5f5f5' }}>
                  <div>
                    <p style={{ fontWeight: 500 }}>{item.product_name}</p>
                    <p style={{ fontSize: '0.8rem', color: '#666' }}>Qty: {item.quantity}</p>
                    {item.reason && <p style={{ fontSize: '0.8rem', color: '#666' }}>{item.reason}</p>}
                  </div>
                  <p style={{ fontWeight: 500 }}>${parseFloat(item.unit_price).toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '2rem' }}>
            <Link href="/returns" className="nt-btn nt-btn-secondary">Back to Returns</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
