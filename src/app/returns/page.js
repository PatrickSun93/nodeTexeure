'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

const STATUS_STYLES = {
  requested:    { color: 'var(--noirae-warning)', bg: 'var(--noirae-warning-bg)' },
  approved:     { color: 'var(--noirae-info)', bg: 'var(--noirae-info-bg)' },
  rejected:     { color: 'var(--noirae-error)', bg: 'var(--noirae-error-bg)' },
  shipped_back: { color: 'var(--noirae-info)', bg: 'var(--noirae-info-bg)' },
  received:     { color: 'var(--noirae-info)', bg: 'var(--noirae-info-bg)' },
  processed:    { color: 'var(--noirae-success)', bg: 'var(--noirae-success-bg)' },
  closed:       { color: 'var(--noirae-text-muted)', bg: 'var(--noirae-bg-sand)' },
};

const RTN_STYLES = `
.rtn-scope { background: var(--noirae-bg-cream); min-height: 100vh; }
.rtn-scope .nt-breadcrumb { color: var(--noirae-text-muted); font-family: var(--noirae-font-sans); }
.rtn-scope .nt-breadcrumb a { color: var(--noirae-text-secondary); }
.rtn-scope .nt-breadcrumb a:hover { color: var(--noirae-accent-gold); }
.rtn-scope .nt-breadcrumb-sep { color: var(--noirae-border-dark); }
.rtn-meta { font-family: var(--noirae-font-sans); font-size: 0.82rem; color: var(--noirae-text-secondary); margin-top: 0.2rem; }
.rtn-row-link { text-decoration: none; color: inherit; display: block; }
.rtn-row { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); padding: 1.5rem 1.75rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; transition: border-color .2s ease, box-shadow .2s ease; }
.rtn-row-link:hover .rtn-row { border-color: var(--noirae-border-dark); box-shadow: var(--noirae-shadow-sm); }
.rtn-badge { display: inline-flex; align-items: center; gap: 7px; font-family: var(--noirae-font-sans); font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 13px; border-radius: 30px; white-space: nowrap; }
.rtn-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.rtn-btn { display: inline-flex; align-items: center; justify-content: center; font-family: var(--noirae-font-sans); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 400; padding: 0.85rem 1.6rem; border-radius: 0; cursor: pointer; text-decoration: none; transition: all .25s ease; border: 1px solid transparent; }
.rtn-btn-dark { background: var(--noirae-text-primary); color: var(--noirae-bg-cream); }
.rtn-btn-dark:hover { background: var(--noirae-accent-gold); }
`;

export default function ReturnsPage() {
  const t = useTranslations('Returns');
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session) { router.push('/signin?redirect=/returns'); return; }
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
        <div className="aesop-container">
          <nav className="nt-breadcrumb">
            <Link href="/">{t('home')}</Link><span className="nt-breadcrumb-sep">/</span><span>{t('myReturns')}</span>
          </nav>

          <h1 className="noirae-heading-hero" style={{ margin: '1.25rem 0 0.5rem' }}>{t('myReturns')}</h1>
          <p style={{ fontFamily: 'var(--noirae-font-sans)', color: 'var(--noirae-text-secondary)', fontSize: '0.95rem', marginBottom: '2.25rem' }}>
            {t('subtitle')}
          </p>

          {returns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4.5rem 1.5rem', background: 'var(--noirae-bg-white)', border: '1px solid var(--noirae-border-medium)' }}>
              <p style={{ fontFamily: 'var(--noirae-font-sans)', color: 'var(--noirae-text-secondary)', marginBottom: '1.75rem' }}>
                {t('empty')}
              </p>
              <Link href="/orders" className="rtn-btn rtn-btn-dark">{t('viewOrders')}</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {returns.map(ret => {
                const s = STATUS_STYLES[ret.status] || STATUS_STYLES.closed;
                return (
                  <Link key={ret.id} href={`/returns/${ret.id}`} className="rtn-row-link">
                    <div className="rtn-row">
                      <div>
                        <p style={{ fontFamily: 'var(--noirae-font-serif)', fontSize: '1.4rem', lineHeight: 1.15, color: 'var(--noirae-text-primary)', marginBottom: '0.4rem' }}>{t('returnLabel', { number: ret.return_number })}</p>
                        <p className="rtn-meta">{t('orderLabel', { number: ret.order_number })}</p>
                        <p className="rtn-meta" style={{ textTransform: 'capitalize' }}>{t('reasonLabel', { reason: ret.reason?.replace(/_/g, ' ') || '' })}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="rtn-badge" style={{ color: s.color, backgroundColor: s.bg }}>
                          <span className="rtn-badge-dot"></span>{ret.status?.replace(/_/g, ' ')}
                        </span>
                        <p style={{ fontFamily: 'var(--noirae-font-sans)', fontSize: '0.72rem', color: 'var(--noirae-text-muted)', marginTop: '0.65rem' }}>
                          {new Date(ret.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
      <style>{RTN_STYLES}</style>
    </div>
  );
}
