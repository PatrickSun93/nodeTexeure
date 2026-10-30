'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';

/**
 * EmailQueueView
 * Admin operational view for the transactional email queue (`email_queue` table).
 *
 * Data source: GET /api/admin/email-queue?status=<bucket>
 *   -> keyValueTable: [ { emails:[...] }, { counts:{...} }, { worker:{...} },
 *                       { pagination:{...} } ]
 *   Each email: { id, to, toName, subject, template, status, rawStatus,
 *                 attempts, maxAttempts, scheduledAt, sentAt, createdAt, error }
 *   Status buckets: queued | sending | sent | failed | cancelled
 *
 * Writes (apiFetch auto-attaches X-CSRF-Token for non-GET):
 *   POST /api/admin/email-queue/retry-failed   -> requeue all failed
 *   POST /api/admin/email-queue/:id/retry       -> requeue one failed/cancelled
 *
 * Note: there is intentionally no "flush now" action. The consumer
 * (rust/crates/email-daemon) is a separate process that polls every few seconds,
 * so a manual flush would be misleading; the header offers an honest Refresh.
 */

// ---- helpers ---------------------------------------------------------------

const STATUS_BADGE = {
  queued: 'bg-amber-100 text-amber-800',
  sending: 'bg-blue-100 text-blue-800',
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const HEALTH_DOT = {
  active: 'bg-green-500 animate-pulse',
  idle: 'bg-gray-400',
  waiting: 'bg-amber-400',
  backlog: 'bg-red-500',
  unknown: 'bg-gray-400',
};

function kv(keyValueTable, key) {
  if (Array.isArray(keyValueTable)) {
    return keyValueTable.find((item) => item && item[key] !== undefined)?.[key];
  }
  return keyValueTable ? keyValueTable[key] : undefined;
}

function formatAge(seconds) {
  if (seconds == null) return null;
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

// ---- component -------------------------------------------------------------

export default function EmailQueueView() {
  const t = useTranslations('EmailQueue');

  const [emails, setEmails] = useState([]);
  const [counts, setCounts] = useState({ queued: 0, sending: 0, sent: 0, failed: 0, cancelled: 0, total: 0 });
  const [worker, setWorker] = useState(null);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [actionError, setActionError] = useState(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const { apiFetch } = await import('../utils/api');
      const activeFilter = filterRef.current;
      const query = activeFilter !== 'all' ? `?status=${encodeURIComponent(activeFilter)}` : '';
      const response = await apiFetch(`/api/admin/email-queue${query}`);
      if (response.status === 'SUCCESS') {
        setEmails(kv(response.keyValueTable, 'emails') || []);
        const c = kv(response.keyValueTable, 'counts');
        if (c) setCounts((prev) => ({ ...prev, ...c }));
        setWorker(kv(response.keyValueTable, 'worker') || null);
      } else {
        setError(t('loadError'));
      }
    } catch (err) {
      console.error('Error loading email queue:', err);
      setError(t('loadError'));
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [t]);

  // Re-fetch when the status filter changes.
  useEffect(() => {
    load();
  }, [filter, load]);

  // Quiet auto-refresh so the worker strip and counts stay live.
  useEffect(() => {
    const id = setInterval(() => load(true), 15000);
    return () => clearInterval(id);
  }, [load]);

  const handleRetryOne = async (id) => {
    setActioningId(id);
    setActionError(null);
    try {
      const { apiFetch } = await import('../utils/api');
      const response = await apiFetch(`/api/admin/email-queue/${id}/retry`, { method: 'POST' });
      if (response.status === 'SUCCESS') {
        await load(true);
      } else {
        setActionError(t('actionFailed'));
      }
    } catch (err) {
      console.error('Error retrying email:', err);
      setActionError(t('actionError'));
    } finally {
      setActioningId(null);
    }
  };

  const handleRetryAll = async () => {
    setRetryingAll(true);
    setActionError(null);
    try {
      const { apiFetch } = await import('../utils/api');
      const response = await apiFetch('/api/admin/email-queue/retry-failed', { method: 'POST' });
      if (response.status === 'SUCCESS') {
        await load(true);
      } else {
        setActionError(t('actionFailed'));
      }
    } catch (err) {
      console.error('Error retrying failed emails:', err);
      setActionError(t('actionError'));
    } finally {
      setRetryingAll(false);
    }
  };

  const tabs = [
    { key: 'all', label: t('tabAll'), count: counts.total },
    { key: 'queued', label: t('tabQueued'), count: counts.queued },
    { key: 'sending', label: t('tabSending'), count: counts.sending },
    { key: 'sent', label: t('tabSent'), count: counts.sent },
    { key: 'failed', label: t('tabFailed'), count: counts.failed },
  ];

  const statusLabel = (status) =>
    ({
      queued: t('statusQueued'),
      sending: t('statusSending'),
      sent: t('statusSent'),
      failed: t('statusFailed'),
      cancelled: t('statusCancelled'),
    }[status] || status);

  const healthLabel = (health) =>
    ({
      active: t('workerActive'),
      idle: t('workerIdle'),
      waiting: t('workerWaiting'),
      backlog: t('workerBacklog'),
      unknown: t('workerUnknown'),
    }[health] || t('workerUnknown'));

  const cards = [
    { key: 'queued', label: t('cardQueued'), value: counts.queued, hint: t('cardQueuedHint'), accent: 'border-t-amber-400', hintColor: 'text-amber-600' },
    { key: 'sending', label: t('cardSending'), value: counts.sending, hint: t('cardSendingHint'), accent: 'border-t-blue-500', hintColor: 'text-blue-600' },
    { key: 'sent', label: t('cardSent'), value: counts.sent, hint: t('cardSentHint'), accent: 'border-t-green-500', hintColor: 'text-green-600' },
    { key: 'failed', label: t('cardFailed'), value: counts.failed, hint: t('cardFailedHint'), accent: 'border-t-red-400', hintColor: 'text-red-500' },
  ];

  const workerHealth = worker?.health || 'unknown';
  const oldestAge = formatAge(worker?.oldestQueuedAgeSeconds);

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{t('title')}</h2>
          <p className="text-gray-500 mt-1">
            {t('subtitle', { queued: counts.queued, sending: counts.sending, failed: counts.failed })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {counts.failed > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {retryingAll ? t('retryingAll') : t('retryAllFailed')}
            </button>
          )}
          <button
            onClick={() => load()}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoading ? t('refreshing') : t('refresh')}
          </button>
        </div>
      </div>

      {/* Worker health strip */}
      <div className="flex items-center gap-6 flex-wrap bg-gray-900 text-gray-100 px-6 py-4 rounded-xl mb-6">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${HEALTH_DOT[workerHealth] || HEALTH_DOT.unknown}`} />
          <span className="text-sm text-white">{healthLabel(workerHealth)}</span>
        </div>
        <div className="w-px h-5 bg-gray-700 hidden sm:block" />
        <div className="text-sm">
          <span className="text-gray-400">{t('metricPending')}</span>
          <span className="text-white ml-2">{worker ? worker.pendingCount : '—'}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-400">{t('metricSentLastHour')}</span>
          <span className="text-white ml-2">{worker ? worker.sentLastHour : '—'}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-400">{t('metricOldestQueued')}</span>
          <span className="text-white ml-2">{oldestAge ? t('agoValue', { age: oldestAge }) : t('none')}</span>
        </div>
        <div className="text-sm sm:ml-auto">
          <span className="text-gray-400">{t('metricLastSent')}</span>
          <span className="text-amber-300 ml-2">{worker?.lastSentAt ? formatTime(worker.lastSentAt) : t('none')}</span>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {cards.map((card) => (
          <div key={card.key} className={`bg-white rounded-xl shadow-sm border border-gray-100 border-t-4 ${card.accent} p-5`}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{card.label}</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{card.value}</div>
            <div className={`text-xs mt-1 ${card.hintColor}`}>{card.hint}</div>
          </div>
        ))}
      </div>

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {actionError}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {tab.label}{' '}
            <span className={filter === tab.key ? 'opacity-80' : 'text-gray-400'}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colRecipient')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colTemplate')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colStatus')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colAttempts')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colCreated')}</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">{t('loading')}</td></tr>
              ) : error ? (
                <tr><td colSpan="6" className="px-6 py-10 text-center text-red-500">{error}</td></tr>
              ) : emails.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-500">{filter === 'all' ? t('empty') : t('emptyFiltered')}</td></tr>
              ) : (
                emails.map((email) => {
                  const canRetry = email.status === 'failed' || email.status === 'cancelled';
                  return (
                    <tr key={email.id} className="hover:bg-gray-50 transition-colors align-top">
                      <td className="px-6 py-4 text-sm">
                        <div className="font-medium text-gray-900 truncate max-w-[220px]">{email.to}</div>
                        {email.toName && <div className="text-xs text-gray-400 truncate max-w-[220px]">{email.toName}</div>}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="text-gray-900">{email.template || t('rawEmail')}</div>
                        {email.subject && <div className="text-xs text-gray-400 truncate max-w-[280px]">{email.subject}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_BADGE[email.status] || 'bg-gray-100 text-gray-600'}`}>
                          {statusLabel(email.status)}
                        </span>
                        {email.error && (
                          <div className="text-xs text-red-500 mt-1.5 max-w-[260px] break-words">{email.error}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={email.attempts >= email.maxAttempts ? 'text-red-500 font-medium' : 'text-gray-500'}>
                          {email.attempts}/{email.maxAttempts}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatTime(email.createdAt)}</td>
                      <td className="px-6 py-4 text-right text-sm">
                        {canRetry ? (
                          <button
                            onClick={() => handleRetryOne(email.id)}
                            disabled={actioningId === email.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {actioningId === email.id ? t('retrying') : t('retry')}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && !error && emails.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 bg-white">
            <p className="text-xs text-gray-500">{t('footerNote', { count: emails.length })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
