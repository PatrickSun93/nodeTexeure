'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

const STATUS_COLORS = {
  requested: '#f59e0b',
  approved: '#3b82f6',
  rejected: '#ef4444',
  shipped_back: '#8b5cf6',
  received: '#6366f1',
  processed: '#10b981',
  closed: '#6b7280',
};

export default function ReturnsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session) { router.push('/login'); return; }
    fetchReturns();
  }, [authStatus, session]);

  const fetchReturns = async () => {
    try {
      const data = await apiRequest('/returns/my-returns', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (data?.status === 'SUCCESS') {
        setReturns(data.keyValueTable?.returns || []);
      }
    } catch (err) {
      console.error('Fetch returns error:', err);
    } finally {
      setLoading(false);
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
        <div className="aesop-container">
          <nav className="nt-breadcrumb">
            <Link href="/">Home</Link><span className="nt-breadcrumb-sep">/</span><span>My Returns</span>
          </nav>

          <h1 className="noirae-heading-hero" style={{ margin: '1.5rem 0' }}>My Returns</h1>

          {returns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p className="noirae-body-text" style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>
                You have no return requests.
              </p>
              <Link href="/orders" className="nt-btn nt-btn-primary">View Orders</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {returns.map(ret => (
                <Link key={ret.id} href={`/returns/${ret.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ border: '1px solid #e5e5e5', borderRadius: '4px', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <div>
                      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Return {ret.return_number}</p>
                      <p style={{ fontSize: '0.875rem', color: '#666' }}>Order: {ret.order_number}</p>
                      <p style={{ fontSize: '0.875rem', color: '#666' }}>Reason: {ret.reason?.replace(/_/g, ' ')}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 500,
                        backgroundColor: `${STATUS_COLORS[ret.status] || '#666'}20`,
                        color: STATUS_COLORS[ret.status] || '#666',
                      }}>
                        {ret.status?.replace(/_/g, ' ')}
                      </span>
                      <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.5rem' }}>
                        {new Date(ret.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
