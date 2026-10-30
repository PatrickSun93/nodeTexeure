'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiRequest } from '../lib/api';

// Carrier tracking card for the order detail page. GET /api/shipping/track/:n
// answers { status, message, keyValueTable: { trackingNumber, status,
// statusDescription, estimatedDelivery, events: [{ timestamp, description,
// location }] } } (a mock payload when FedEx credentials are absent).
const TRACKING_CSS = `
  .nt-tracking-card{background:var(--noirae-bg-white);border:1px solid var(--noirae-border-medium);font-family:var(--noirae-font-sans);}
  .nt-tracking-card p{margin:0;color:inherit;}
  .nt-tracking-card .trk-title{padding:18px 24px;border-bottom:1px solid var(--noirae-border-light);font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--noirae-text-secondary);}
  .nt-tracking-card .trk-body{padding:20px 24px;display:flex;flex-direction:column;gap:14px;}
  .nt-tracking-card .trk-label{font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--noirae-text-muted);}
  .nt-tracking-card .trk-value{margin-top:3px;font-size:14px;color:var(--noirae-text-primary);}
  .nt-tracking-card .trk-mono{letter-spacing:0.05em;}
  .nt-tracking-card .trk-events{list-style:none;border-top:1px solid var(--noirae-border-light);padding-top:14px;}
  .nt-tracking-card .trk-events li{padding:0 0 12px 12px;border-left:2px solid var(--noirae-border-medium);}
  .nt-tracking-card .trk-events li:last-child{padding-bottom:0;}
  .nt-tracking-card .trk-event-desc{font-size:13px;color:var(--noirae-text-primary);}
  .nt-tracking-card .trk-event-meta{margin-top:2px;font-size:12px;color:var(--noirae-text-muted);}
  .nt-tracking-card .trk-error{font-size:13px;color:var(--noirae-error);}
  .nt-tracking-card .trk-btn{align-self:flex-start;background:transparent;color:var(--noirae-text-primary);border:1px solid var(--noirae-border-dark);padding:9px 16px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-family:var(--noirae-font-sans);cursor:pointer;transition:border-color .2s ease;}
  .nt-tracking-card .trk-btn:hover{border-color:var(--noirae-text-primary);}
  .nt-tracking-card .trk-btn:disabled{opacity:0.6;cursor:not-allowed;}
`;

const statusColor = (status) => {
  const s = (status || '').toLowerCase();
  if (s.includes('delivered')) return 'var(--noirae-success)';
  if (s.includes('exception') || s.includes('delayed')) return 'var(--noirae-error)';
  return 'var(--noirae-text-primary)';
};

export default function OrderTracking({ trackingNumber }) {
  const t = useTranslations('OrderTracking');
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTracking = useCallback(async () => {
    if (!trackingNumber) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest(`/shipping/track/${encodeURIComponent(trackingNumber)}`);
      setTracking(data?.keyValueTable || null);
    } catch (err) {
      console.error('Tracking fetch error:', err);
      setError(t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [trackingNumber, t]);

  useEffect(() => {
    fetchTracking();
  }, [fetchTracking]);

  const formatDate = (value) => (value ? new Date(value).toLocaleString() : t('notAvailable'));
  const events = Array.isArray(tracking?.events) ? tracking.events : [];

  return (
    <section className="nt-tracking-card">
      <style>{TRACKING_CSS}</style>
      <h2 className="trk-title">{t('title')}</h2>
      <div className="trk-body">
        <div>
          <p className="trk-label">{t('trackingNumber')}</p>
          <p className="trk-value trk-mono">{trackingNumber}</p>
        </div>

        {error && <p className="trk-error">{error}</p>}

        {tracking && (
          <>
            {(tracking.statusDescription || tracking.status) && (
              <div>
                <p className="trk-label">{t('status')}</p>
                <p className="trk-value" style={{ color: statusColor(tracking.status) }}>
                  {tracking.statusDescription || tracking.status}
                </p>
              </div>
            )}
            {tracking.estimatedDelivery && (
              <div>
                <p className="trk-label">{t('estimatedDelivery')}</p>
                <p className="trk-value">{formatDate(tracking.estimatedDelivery)}</p>
              </div>
            )}
            {events.length > 0 && (
              <div>
                <p className="trk-label" style={{ marginBottom: '10px' }}>{t('trackingHistory')}</p>
                <ul className="trk-events">
                  {events.map((event, idx) => (
                    <li key={idx}>
                      <p className="trk-event-desc">{event.description}</p>
                      <p className="trk-event-meta">
                        {[formatDate(event.timestamp), event.location].filter(Boolean).join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <button type="button" className="trk-btn" onClick={fetchTracking} disabled={loading}>
          {error ? t('retry') : t('refresh')}
        </button>
      </div>
    </section>
  );
}
