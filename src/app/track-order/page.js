'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

const STATUS_STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

export default function TrackOrderPage() {
  const t = useTranslations('TrackOrder');
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
        setError(t('orderNotFound'));
      }
    } catch (err) {
      setError(err.message || t('orderNotFoundHelp'));
    } finally {
      setLoading(false);
    }
  };

  const statusIdx = tracking ? STATUS_STEPS.indexOf(tracking.status) : -1;

  return (
    <div className="aesop-page nt-track-champagne" style={{ background: 'var(--noirae-bg-cream)', minHeight: '100vh' }}>
      <style>{`
        .nt-track-champagne .nt-breadcrumb a:hover { color: var(--noirae-accent-gold); }
        .nt-track-champagne input.nt-track-input {
          width: 100%;
          background: var(--noirae-bg-cream);
          border: 1px solid var(--noirae-border-dark);
          border-radius: 2px;
          padding: 0.9rem 0.95rem;
          font-size: 0.95rem;
          font-family: var(--noirae-font-sans);
          color: var(--noirae-text-primary);
          text-align: left;
          text-transform: none;
          letter-spacing: normal;
          margin-bottom: 1.25rem;
          outline: none;
          transition: border-color 0.2s ease;
        }
        .nt-track-champagne input.nt-track-input::placeholder { color: var(--noirae-text-muted); }
        .nt-track-champagne input.nt-track-input:focus { border-color: var(--noirae-accent-gold); }
        .nt-track-champagne button.nt-track-submit {
          background: var(--noirae-text-primary);
          color: var(--noirae-bg-cream);
          width: 100%;
          padding: 0.95rem;
          border-radius: 2px;
          font-family: var(--noirae-font-sans);
          font-size: 0.72rem;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          transition: background 0.25s ease;
        }
        .nt-track-champagne button.nt-track-submit:hover:not(:disabled) { background: var(--noirae-accent-gold); }
        .nt-track-champagne .nt-timeline-dot {
          background: var(--noirae-bg-sand);
          color: var(--noirae-text-muted);
          border-color: var(--noirae-border-dark);
        }
        .nt-track-champagne .nt-step-active .nt-timeline-dot {
          background: var(--noirae-accent-gold);
          color: var(--noirae-bg-white);
          border-color: var(--noirae-accent-gold);
        }
        .nt-track-champagne .nt-step-current .nt-timeline-dot {
          background: var(--noirae-text-primary);
          color: var(--noirae-bg-cream);
          border-color: var(--noirae-text-primary);
          box-shadow: 0 0 0 4px var(--noirae-warning-bg);
        }
        .nt-track-champagne .nt-timeline-label { color: var(--noirae-text-muted); }
        .nt-track-champagne .nt-step-active .nt-timeline-label { color: var(--noirae-text-primary); font-weight: 500; }
        .nt-track-champagne .nt-timeline-step:not(:last-child)::after { background: var(--noirae-border-dark); }
        .nt-track-champagne .nt-timeline-step.nt-step-active:not(:last-child)::after { background: var(--noirae-accent-gold); }
        .nt-track-champagne .nt-help-link:hover { color: var(--noirae-accent-gold); }
      `}</style>
      <Header />
      <main className="nt-tracking-page">
        <div className="aesop-container">
          <nav className="nt-breadcrumb" style={{ width: '100%', maxWidth: '720px', margin: '0 auto', color: 'var(--noirae-text-muted)' }}>
            <Link href="/" style={{ color: 'var(--noirae-text-secondary)' }}>{t('home')}</Link>
            <span className="nt-breadcrumb-sep" style={{ color: 'var(--noirae-border-dark)' }}>/</span>
            <span style={{ color: 'var(--noirae-text-primary)', fontWeight: 500 }}>{t('trackOrder')}</span>
          </nav>

          <div style={{ width: '100%', maxWidth: '720px', margin: '0 auto', textAlign: 'center', padding: '2.5rem 0 0.5rem' }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--noirae-accent-gold)', fontWeight: 500, fontFamily: 'var(--noirae-font-sans)' }}>
              {t('orderStatus')}
            </div>
            <h1
              className="nt-page-title"
              style={{ fontFamily: 'var(--noirae-font-serif)', fontSize: 'clamp(2.4rem, 5vw, 3.25rem)', fontWeight: 500, color: 'var(--noirae-text-primary)', letterSpacing: '-0.01em', lineHeight: 1.1, margin: '0.75rem 0 0', textAlign: 'center' }}
            >
              {t('trackYourOrder')}
            </h1>
            <p style={{ color: 'var(--noirae-text-secondary)', fontSize: '0.97rem', margin: '0.85rem 0 0' }}>
              {t('subtitle')}
            </p>
          </div>

          <form
            className="nt-tracking-form"
            onSubmit={handleTrack}
            style={{ width: '100%', maxWidth: '460px', margin: '2rem auto 0', textAlign: 'left', background: 'var(--noirae-bg-white)', border: '1px solid var(--noirae-border-medium)', borderRadius: '2px', padding: '1.75rem' }}
          >
            <label style={{ display: 'block', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--noirae-text-secondary)', marginBottom: '0.55rem', fontFamily: 'var(--noirae-font-sans)' }}>
              {t('orderNumberLabel')}
            </label>
            <input
              className="nt-track-input"
              type="text"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              placeholder={t('orderNumberPlaceholder')}
            />
            <button
              className="nt-btn nt-btn-primary nt-btn-full nt-track-submit"
              type="submit"
              disabled={loading}
              style={{ opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? t('searching') : t('trackOrderButton')}
            </button>
          </form>

          {error && (
            <div
              className="nt-error-banner"
              style={{ maxWidth: '460px', margin: '1.25rem auto 0', background: 'var(--noirae-error-bg)', border: '1px solid var(--noirae-error)', color: 'var(--noirae-error)', borderRadius: '2px' }}
            >
              {error}
            </div>
          )}

          {tracking && (
            <div style={{ width: '100%', maxWidth: '720px', margin: '2.5rem auto 0' }}>
              <div
                className="nt-confirmation-banner"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', textAlign: 'left', padding: '1.5rem', margin: 0, background: 'var(--noirae-bg-white)', border: '1px solid var(--noirae-border-medium)', borderRadius: '2px' }}
              >
                <div>
                  <h2 style={{ fontFamily: 'var(--noirae-font-serif)', fontSize: '1.5rem', fontWeight: 500, color: 'var(--noirae-text-primary)', margin: 0, lineHeight: 1.15 }}>
                    {t('orderHeading', { number: tracking.order_number })}
                  </h2>
                  <p style={{ color: 'var(--noirae-text-muted)', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
                    {t('placedOn', { date: new Date(tracking.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) })}
                  </p>
                </div>
                {tracking.status && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--noirae-warning)', background: 'var(--noirae-warning-bg)', padding: '0.4rem 0.85rem', borderRadius: '30px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--noirae-accent-gold)' }} />
                    {t.has(`statuses.${tracking.status}`) ? t(`statuses.${tracking.status}`) : (tracking.status.charAt(0).toUpperCase() + tracking.status.slice(1))}
                  </span>
                )}
              </div>

              {/* Status Timeline */}
              <div className="nt-status-timeline" style={{ marginTop: '2.5rem', marginBottom: '2.5rem' }}>
                {STATUS_STEPS.map((step, idx) => (
                  <div key={step} className={`nt-timeline-step ${idx <= statusIdx ? 'nt-step-active' : ''} ${idx === statusIdx ? 'nt-step-current' : ''}`}>
                    <div className="nt-timeline-dot">{idx < statusIdx ? '✓' : idx + 1}</div>
                    <span className="nt-timeline-label">{t.has(`statuses.${step}`) ? t(`statuses.${step}`) : (step.charAt(0).toUpperCase() + step.slice(1))}</span>
                  </div>
                ))}
              </div>

              {tracking.tracking_number && (
                <div
                  className="nt-info-card"
                  style={{ background: 'var(--noirae-bg-light-gray)', border: '1px solid var(--noirae-border-medium)', borderRadius: '2px', padding: '1.1rem 1.25rem', margin: 0 }}
                >
                  <h3 style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--noirae-text-muted)', margin: '0 0 0.5rem', fontFamily: 'var(--noirae-font-sans)' }}>
                    {t('trackingNumber')}
                  </h3>
                  <p className="nt-tracking-number" style={{ color: 'var(--noirae-text-primary)', letterSpacing: '0.05em', margin: 0 }}>
                    {tracking.tracking_number}
                  </p>
                </div>
              )}

              {tracking.history && tracking.history.length > 0 && (
                <div
                  className="nt-info-card"
                  style={{ background: 'var(--noirae-bg-light-gray)', border: '1px solid var(--noirae-border-medium)', borderRadius: '2px', padding: '1.1rem 1.25rem', marginTop: '1rem' }}
                >
                  <h3 style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--noirae-text-muted)', margin: '0 0 0.75rem', fontFamily: 'var(--noirae-font-sans)' }}>
                    {t('statusHistory')}
                  </h3>
                  {tracking.history.map((h, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: idx < tracking.history.length - 1 ? '1px solid var(--noirae-border-light)' : 'none', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 500, textTransform: 'capitalize', color: 'var(--noirae-text-primary)' }}>{t.has(`statuses.${h.status}`) ? t(`statuses.${h.status}`) : h.status}</span>
                      <span style={{ color: 'var(--noirae-text-muted)' }}>{new Date(h.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ textAlign: 'center', marginTop: '1.75rem', fontSize: '0.85rem', color: 'var(--noirae-text-secondary)' }}>
                {t('needHelp')}{' '}
                <Link href="/contact" className="nt-help-link" style={{ color: 'var(--noirae-text-primary)', borderBottom: '1px solid var(--noirae-accent-gold-light)', paddingBottom: '2px', transition: 'color 0.2s ease' }}>
                  {t('contactUs')}
                </Link>
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
