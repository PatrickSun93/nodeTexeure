'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

// Merge the API's array-of-objects keyValueTable into one flat object.
function extractKV(data) {
  const kv = data?.keyValueTable;
  if (Array.isArray(kv)) return Object.assign({}, ...kv.filter((x) => x && typeof x === 'object'));
  if (kv && typeof kv === 'object') return kv;
  return {};
}

function ShieldIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M12 21c5-1 8-5 8-11V5l-8-2-8 2v5c0 6 3 10 8 11z" />
    </svg>
  );
}

function MailIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function UnsubscribeContent() {
  const t = useTranslations('Unsubscribe');
  const searchParams = useSearchParams();
  const email = (searchParams.get('email') || '').trim().toLowerCase();
  const token = searchParams.get('token') || '';

  // loading | confirm | done | resubscribed | invalid | error
  const [phase, setPhase] = useState('loading');
  const [submitting, setSubmitting] = useState(false);
  const [selectedReason, setSelectedReason] = useState(null);

  const resolve = useCallback(async () => {
    if (!email || !token) {
      setPhase('invalid');
      return;
    }
    setPhase('loading');
    try {
      const res = await fetch(`/api/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      let data = {};
      try { data = await res.json(); } catch { data = {}; }

      if (!res.ok || data.status !== 'SUCCESS') {
        setPhase('invalid');
        return;
      }
      const kv = extractKV(data);
      setPhase(kv.subscribed === false ? 'done' : 'confirm');
    } catch {
      setPhase('error');
    }
  }, [email, token]);

  useEffect(() => { resolve(); }, [resolve]);

  const handleUnsubscribe = async () => {
    setSubmitting(true);
    try {
      await apiRequest('/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ email, token, scope: 'all' }),
      });
      setPhase('done');
    } catch {
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubscribe = async () => {
    setSubmitting(true);
    try {
      await apiRequest('/unsubscribe/resubscribe', {
        method: 'POST',
        body: JSON.stringify({ email, token }),
      });
      setPhase('resubscribed');
    } catch {
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReason = async (reason) => {
    if (selectedReason) return;
    setSelectedReason(reason);
    try {
      await apiRequest('/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ email, token, scope: 'all', reason }),
      });
    } catch {
      /* feedback is best-effort; never surface an error for an optional note */
    }
  };

  const emailChip = email && (
    <div className="nt-unsub-chip">
      <span className="nt-unsub-chip-label">{t('signedInAs')}</span>
      <span className="nt-unsub-chip-email">{email}</span>
    </div>
  );

  return (
    <div className="aesop-page nt-unsub" style={{ background: 'var(--noirae-bg-cream)', minHeight: '100vh' }}>
      <style>{`
        .nt-unsub main { display: flex; align-items: flex-start; justify-content: center; padding: clamp(2.5rem, 6vw, 4.5rem) 1.5rem 5rem; }
        .nt-unsub .nt-unsub-wrap { width: 100%; max-width: 560px; text-align: center; }
        .nt-unsub .nt-unsub-eyebrow { font-family: var(--noirae-font-sans); font-size: 0.72rem; letter-spacing: 0.3em; text-transform: uppercase; color: var(--noirae-accent-gold); font-weight: 500; }
        .nt-unsub h1 { font-family: var(--noirae-font-serif); font-weight: 500; color: var(--noirae-text-primary); letter-spacing: -0.01em; line-height: 1.1; margin: 0.75rem 0 0; }
        .nt-unsub .nt-unsub-lead { color: var(--noirae-text-secondary); font-size: 0.98rem; line-height: 1.65; margin: 0.9rem auto 0; max-width: 420px; }
        .nt-unsub .nt-unsub-icon { display: inline-flex; align-items: center; justify-content: center; width: 62px; height: 62px; border-radius: 50%; background: var(--noirae-bg-sand); color: var(--noirae-accent-gold); margin-bottom: 1.35rem; }
        .nt-unsub .nt-unsub-chip { display: inline-flex; align-items: center; gap: 0.55rem; background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); padding: 0.5rem 1rem; border-radius: 30px; margin-top: 1.25rem; }
        .nt-unsub .nt-unsub-chip-label { font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--noirae-text-muted); font-family: var(--noirae-font-sans); }
        .nt-unsub .nt-unsub-chip-email { font-size: 0.85rem; color: var(--noirae-text-primary); }
        .nt-unsub .nt-unsub-card { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); border-radius: 2px; padding: clamp(1.5rem, 4vw, 2.25rem); margin-top: 2rem; text-align: left; }
        .nt-unsub .nt-unsub-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.1rem; padding: 1.1rem 0; }
        .nt-unsub .nt-unsub-row + .nt-unsub-row { border-top: 1px solid var(--noirae-border-light); }
        .nt-unsub .nt-unsub-row-title { font-size: 0.95rem; color: var(--noirae-text-primary); }
        .nt-unsub .nt-unsub-row-desc { font-size: 0.8rem; color: var(--noirae-text-muted); margin-top: 0.2rem; line-height: 1.5; }
        .nt-unsub .nt-unsub-lock { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.6rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--noirae-accent-bronze); background: var(--noirae-bg-sand); padding: 0.32rem 0.7rem; border-radius: 20px; white-space: nowrap; flex: 0 0 auto; font-family: var(--noirae-font-sans); }
        .nt-unsub .nt-unsub-btn-primary { display: inline-flex; align-items: center; justify-content: center; background: var(--noirae-text-primary); color: var(--noirae-bg-cream); padding: 0.95rem 2rem; border-radius: 2px; font-family: var(--noirae-font-sans); font-size: 0.72rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; transition: background 0.25s ease; width: 100%; }
        .nt-unsub .nt-unsub-btn-primary:hover:not(:disabled) { background: var(--noirae-accent-gold); }
        .nt-unsub .nt-unsub-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .nt-unsub .nt-unsub-quote { font-family: var(--noirae-font-editorial); font-style: italic; font-size: 1.08rem; color: var(--noirae-accent-bronze); margin-top: 1.35rem; }
        .nt-unsub .nt-unsub-divider { height: 1px; background: var(--noirae-border-light); margin: 2rem 0; }
        .nt-unsub .nt-unsub-sub-eyebrow { font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--noirae-text-muted); margin-bottom: 0.85rem; font-family: var(--noirae-font-sans); }
        .nt-unsub .nt-unsub-reasons { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; }
        .nt-unsub .nt-unsub-reason { font-size: 0.78rem; color: var(--noirae-text-secondary); border: 1px solid var(--noirae-border-medium); background: var(--noirae-bg-cream); padding: 0.5rem 0.9rem; border-radius: 30px; cursor: pointer; transition: border-color 0.2s ease, color 0.2s ease; font-family: var(--noirae-font-sans); }
        .nt-unsub .nt-unsub-reason:hover:not(:disabled) { border-color: var(--noirae-accent-gold); color: var(--noirae-text-primary); }
        .nt-unsub .nt-unsub-reason.is-selected { border-color: var(--noirae-accent-gold); background: var(--noirae-bg-sand); color: var(--noirae-text-primary); }
        .nt-unsub .nt-unsub-reason:disabled { cursor: default; }
        .nt-unsub .nt-unsub-thanks { display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 1.1rem; color: var(--noirae-success); font-size: 0.82rem; }
        .nt-unsub .nt-unsub-back { display: inline-block; margin-top: 2rem; font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--noirae-text-muted); transition: color 0.2s ease; }
        .nt-unsub .nt-unsub-back:hover { color: var(--noirae-accent-gold); }
        .nt-unsub .nt-unsub-spinner { width: 34px; height: 34px; border: 2px solid var(--noirae-border-medium); border-top-color: var(--noirae-accent-gold); border-radius: 50%; margin: 3rem auto; animation: nt-unsub-spin 0.8s linear infinite; }
        @keyframes nt-unsub-spin { to { transform: rotate(360deg); } }
      `}</style>
      <Header />
      <main>
        <div className="nt-unsub-wrap">

          {phase === 'loading' && (
            <>
              <div className="nt-unsub-spinner" role="status" aria-label={t('loading')} />
              <p className="nt-unsub-lead">{t('loading')}</p>
            </>
          )}

          {phase === 'confirm' && (
            <>
              <div className="nt-unsub-icon"><MailIcon /></div>
              <div className="nt-unsub-eyebrow">{t('eyebrow')}</div>
              <h1 style={{ fontSize: 'clamp(2.1rem, 5vw, 2.75rem)' }}>{t('manageTitle')}</h1>
              <p className="nt-unsub-lead">{t('manageSubtitle')}</p>
              {emailChip}

              <div className="nt-unsub-card">
                <div className="nt-unsub-row">
                  <div>
                    <div className="nt-unsub-row-title">{t('orderUpdatesLabel')}</div>
                    <div className="nt-unsub-row-desc">{t('orderUpdatesDesc')}</div>
                  </div>
                  <span className="nt-unsub-lock">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                    {t('alwaysOn')}
                  </span>
                </div>
                <div className="nt-unsub-row">
                  <div>
                    <div className="nt-unsub-row-title">{t('marketingLabel')}</div>
                    <div className="nt-unsub-row-desc">{t('marketingDesc')}</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1.75rem' }}>
                <button className="nt-unsub-btn-primary" onClick={handleUnsubscribe} disabled={submitting}>
                  {submitting ? t('unsubscribing') : t('unsubscribeAll')}
                </button>
              </div>
            </>
          )}

          {phase === 'done' && (
            <div className="nt-unsub-card" style={{ textAlign: 'center', padding: 'clamp(2.25rem, 5vw, 3.25rem)' }}>
              <div className="nt-unsub-icon" style={{ marginBottom: '1.5rem' }}><ShieldIcon /></div>
              <h1 style={{ fontSize: 'clamp(1.9rem, 4.5vw, 2.4rem)' }}>{t('doneTitle')}</h1>
              <p className="nt-unsub-lead">{t('doneMessage', { email })}</p>
              <p className="nt-unsub-quote">{t('doneQuote')}</p>

              <div className="nt-unsub-divider" />
              <div className="nt-unsub-sub-eyebrow">{t('changedMind')}</div>
              <button
                className="nt-unsub-btn-primary"
                style={{ width: 'auto' }}
                onClick={handleResubscribe}
                disabled={submitting}
              >
                {submitting ? t('resubscribing') : t('resubscribe')}
              </button>

              <div style={{ marginTop: '2rem' }}>
                <div className="nt-unsub-sub-eyebrow" style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.8rem', color: 'var(--noirae-text-muted)' }}>
                  {t('reasonPrompt')} <span style={{ color: 'var(--noirae-text-light)' }}>{t('optional')}</span>
                </div>
                <div className="nt-unsub-reasons">
                  {['reasonTooMany', 'reasonNotRelevant', 'reasonNeverSignedUp', 'reasonTidying'].map((key) => (
                    <button
                      key={key}
                      className={`nt-unsub-reason ${selectedReason === t(key) ? 'is-selected' : ''}`}
                      onClick={() => handleReason(t(key))}
                      disabled={!!selectedReason}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
                {selectedReason && (
                  <div className="nt-unsub-thanks">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    {t('reasonThanks')}
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === 'resubscribed' && (
            <div className="nt-unsub-card" style={{ textAlign: 'center', padding: 'clamp(2.25rem, 5vw, 3.25rem)' }}>
              <div className="nt-unsub-icon" style={{ marginBottom: '1.5rem', color: 'var(--noirae-success)' }}><MailIcon size={28} /></div>
              <h1 style={{ fontSize: 'clamp(1.9rem, 4.5vw, 2.4rem)' }}>{t('resubscribedTitle')}</h1>
              <p className="nt-unsub-lead">{t('resubscribedMessage', { email })}</p>
            </div>
          )}

          {phase === 'invalid' && (
            <div className="nt-unsub-card" style={{ textAlign: 'center', padding: 'clamp(2.25rem, 5vw, 3.25rem)' }}>
              <div className="nt-unsub-icon" style={{ marginBottom: '1.5rem' }}><MailIcon size={28} /></div>
              <h1 style={{ fontSize: 'clamp(1.8rem, 4.5vw, 2.25rem)' }}>{t('invalidTitle')}</h1>
              <p className="nt-unsub-lead">{t('invalidMessage')}</p>
              <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--noirae-text-secondary)' }}>
                {t('needHelp')}{' '}
                <Link href="/contact" style={{ color: 'var(--noirae-text-primary)', borderBottom: '1px solid var(--noirae-accent-gold-light)', paddingBottom: '2px' }}>
                  {t('contactUs')}
                </Link>
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="nt-unsub-card" style={{ textAlign: 'center', padding: 'clamp(2.25rem, 5vw, 3.25rem)' }}>
              <div className="nt-unsub-icon" style={{ marginBottom: '1.5rem', color: 'var(--noirae-error)' }}><MailIcon size={28} /></div>
              <h1 style={{ fontSize: 'clamp(1.8rem, 4.5vw, 2.25rem)' }}>{t('errorTitle')}</h1>
              <p className="nt-unsub-lead">{t('errorMessage')}</p>
              <div style={{ marginTop: '1.75rem' }}>
                <button className="nt-unsub-btn-primary" style={{ width: 'auto' }} onClick={resolve}>
                  {t('retry')}
                </button>
              </div>
            </div>
          )}

          <div>
            <Link href="/" className="nt-unsub-back">{t('backToStore')}</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function UnsubscribePage() {
  const t = useTranslations('Unsubscribe');
  return (
    <Suspense
      fallback={
        <div className="aesop-page" style={{ background: 'var(--noirae-bg-cream)', minHeight: '100vh' }}>
          <Header />
          <main>
            <section style={{ textAlign: 'center', padding: '6rem 1.5rem' }}>
              <p className="noirae-body-text">{t('loading')}</p>
            </section>
          </main>
          <Footer />
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
