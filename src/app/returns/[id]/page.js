'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { apiRequest } from '../../../lib/api';

const STATUS_STEPS = ['requested', 'approved', 'shipped_back', 'received', 'processed'];

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
.rtn-card { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); }
.rtn-meta { font-family: var(--noirae-font-sans); font-size: 0.82rem; color: var(--noirae-text-secondary); margin-top: 0.2rem; }
.rtn-flabel { font-family: var(--noirae-font-sans); font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--noirae-text-muted); margin-bottom: 0.45rem; }
.rtn-fvalue { font-family: var(--noirae-font-sans); font-size: 0.9rem; color: var(--noirae-text-primary); }
.rtn-item { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid var(--noirae-border-light); }
.rtn-item:last-child { border-bottom: none; padding-bottom: 0; }
.rtn-badge { display: inline-flex; align-items: center; gap: 7px; font-family: var(--noirae-font-sans); font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 13px; border-radius: 30px; white-space: nowrap; }
.rtn-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.rtn-btn { display: inline-flex; align-items: center; justify-content: center; font-family: var(--noirae-font-sans); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 400; padding: 0.85rem 1.6rem; border-radius: 0; cursor: pointer; text-decoration: none; transition: all .25s ease; border: 1px solid transparent; }
.rtn-btn-dark { background: var(--noirae-text-primary); color: var(--noirae-bg-cream); }
.rtn-btn-dark:hover { background: var(--noirae-accent-gold); }
.rtn-btn-ghost { background: transparent; color: var(--noirae-text-primary); border-color: var(--noirae-border-dark); }
.rtn-btn-ghost:hover { border-color: var(--noirae-text-primary); }
`;

export default function ReturnDetailPage() {
  const t = useTranslations('ReturnFlow');
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
          setError(t('returnNotFound'));
        }
      } catch (err) {
        setError(err.message || t('failedToLoadReturn'));
      } finally {
        setLoading(false);
      }
    };
    fetchReturn();
  }, [id, session]);

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

  if (error || !returnData) {
    return (
      <div className="aesop-page rtn-scope"><Header />
        <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--noirae-font-sans)', color: 'var(--noirae-text-secondary)' }}>{error || t('returnNotFound')}</p>
          <Link href="/returns" className="rtn-btn rtn-btn-dark" style={{ marginTop: '1.5rem' }}>{t('backToReturns')}</Link>
        </main><Footer />
        <style>{RTN_STYLES}</style>
      </div>
    );
  }

  const currentStep = STATUS_STEPS.indexOf(returnData.status);
  const isRejected = returnData.status === 'rejected';
  const isClosed = returnData.status === 'closed';
  const badge = STATUS_STYLES[returnData.status] || STATUS_STYLES.closed;

  return (
    <div className="aesop-page rtn-scope">
      <Header />
      <main style={{ padding: '2rem 0 4.5rem' }}>
        <div className="aesop-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <nav className="nt-breadcrumb">
            <Link href="/">{t('breadcrumbHome')}</Link><span className="nt-breadcrumb-sep">/</span>
            <Link href="/returns">{t('breadcrumbMyReturns')}</Link><span className="nt-breadcrumb-sep">/</span>
            <span>{returnData.return_number}</span>
          </nav>

          <h1 className="noirae-heading-hero" style={{ margin: '1.25rem 0 0.5rem' }}>
            {t('returnHeading', { number: returnData.return_number })}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap', marginBottom: '2.25rem' }}>
            <p style={{ fontFamily: 'var(--noirae-font-sans)', color: 'var(--noirae-text-secondary)', fontSize: '0.95rem' }}>{t('orderLabel', { order: returnData.order_number })}</p>
            <span className="rtn-badge" style={{ color: badge.color, backgroundColor: badge.bg }}>
              <span className="rtn-badge-dot"></span>{returnData.status?.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Status Timeline */}
          {!isRejected && !isClosed && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '15px', left: '20px', right: '20px', height: '1px', backgroundColor: 'var(--noirae-border-dark)', zIndex: 0 }} />
              {STATUS_STEPS.map((step, idx) => (
                <div key={step} style={{ textAlign: 'center', position: 'relative', zIndex: 1, flex: 1 }}>
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%', margin: '0 auto 0.6rem',
                    backgroundColor: idx < currentStep ? 'var(--noirae-text-primary)' : idx === currentStep ? 'var(--noirae-accent-gold)' : 'var(--noirae-bg-white)',
                    color: idx <= currentStep ? 'var(--noirae-bg-cream)' : 'var(--noirae-text-muted)',
                    border: idx <= currentStep ? 'none' : '1px solid var(--noirae-border-dark)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 500, fontFamily: 'var(--noirae-font-sans)',
                  }}>
                    {idx <= currentStep ? '✓' : idx + 1}
                  </div>
                  <span style={{ fontFamily: 'var(--noirae-font-sans)', fontSize: '0.66rem', letterSpacing: '0.06em', textTransform: 'capitalize', color: idx <= currentStep ? 'var(--noirae-text-primary)' : 'var(--noirae-text-muted)' }}>
                    {step.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isRejected && (
            <div style={{ padding: '1.1rem 1.25rem', backgroundColor: 'var(--noirae-error-bg)', border: '1px solid var(--noirae-error)', marginBottom: '1.5rem' }}>
              <p style={{ fontFamily: 'var(--noirae-font-sans)', color: 'var(--noirae-error)', fontWeight: 500 }}>{t('rejectedMessage')}</p>
              {returnData.return_details?.admin_notes && (
                <p style={{ fontFamily: 'var(--noirae-font-sans)', color: 'var(--noirae-text-secondary)', marginTop: '0.5rem', fontSize: '0.85rem' }}>{returnData.return_details.admin_notes}</p>
              )}
            </div>
          )}

          {/* Details */}
          <div className="rtn-card" style={{ padding: '1.75rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontFamily: 'var(--noirae-font-serif)', fontSize: '1.5rem', color: 'var(--noirae-text-primary)', marginBottom: '1.35rem' }}>{t('returnDetailsHeading')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div><div className="rtn-flabel">{t('reasonFieldLabel')}</div><div className="rtn-fvalue" style={{ textTransform: 'capitalize' }}>{returnData.reason?.replace(/_/g, ' ')}</div></div>
              <div><div className="rtn-flabel">{t('statusFieldLabel')}</div><div className="rtn-fvalue" style={{ textTransform: 'capitalize' }}>{returnData.status?.replace(/_/g, ' ')}</div></div>
              <div><div className="rtn-flabel">{t('submittedLabel')}</div><div className="rtn-fvalue">{new Date(returnData.created_at).toLocaleDateString()}</div></div>
              {returnData.refund_amount && <div><div className="rtn-flabel">{t('refundAmountLabel')}</div><div className="rtn-fvalue">${parseFloat(returnData.refund_amount).toFixed(2)}</div></div>}
              {returnData.return_tracking_number && <div><div className="rtn-flabel">{t('trackingLabel')}</div><div className="rtn-fvalue">{returnData.return_tracking_number}</div></div>}
            </div>
            {returnData.return_details?.description && (
              <p style={{ marginTop: '1.35rem', paddingTop: '1.35rem', borderTop: '1px solid var(--noirae-border-light)', fontFamily: 'var(--noirae-font-sans)', fontSize: '0.88rem', color: 'var(--noirae-text-secondary)', lineHeight: 1.7 }}>{returnData.return_details.description}</p>
            )}
          </div>

          {/* Return Items */}
          {returnData.items && returnData.items.length > 0 && (
            <div className="rtn-card" style={{ padding: '1.75rem' }}>
              <h2 style={{ fontFamily: 'var(--noirae-font-serif)', fontSize: '1.5rem', color: 'var(--noirae-text-primary)', marginBottom: '1.1rem' }}>{t('itemsBeingReturnedHeading')}</h2>
              {returnData.items.map(item => (
                <div key={item.id} className="rtn-item">
                  <div>
                    <p style={{ fontFamily: 'var(--noirae-font-sans)', fontSize: '0.92rem', fontWeight: 500, color: 'var(--noirae-text-primary)' }}>{item.product_name}</p>
                    <p className="rtn-meta">{t('itemQty', { qty: item.quantity })}</p>
                    {item.reason && <p className="rtn-meta" style={{ textTransform: 'capitalize' }}>{item.reason?.replace(/_/g, ' ')}</p>}
                  </div>
                  <p style={{ fontFamily: 'var(--noirae-font-sans)', fontSize: '0.92rem', fontWeight: 500, color: 'var(--noirae-text-primary)', whiteSpace: 'nowrap' }}>${parseFloat(item.unit_price).toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '2rem' }}>
            <Link href="/returns" className="rtn-btn rtn-btn-ghost">{t('backToReturns')}</Link>
          </div>
        </div>
      </main>
      <Footer />
      <style>{RTN_STYLES}</style>
    </div>
  );
}
