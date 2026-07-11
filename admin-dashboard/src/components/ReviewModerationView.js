'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

/**
 * ReviewModerationView
 * Admin moderation queue for product reviews.
 *
 * Data source: GET /api/reviews/admin/pending  (protect + admin gated)
 *   -> { status:'SUCCESS', keyValueTable: { reviews: [...] } }
 *   Each raw review carries: id, rating, review_details (JSON) / title /
 *   review_text, is_verified_purchase, is_approved, status, created_at,
 *   helpful_count, first_name, last_name, email, product_name.
 *
 * Writes: PUT /api/reviews/admin/:id/approve and /reject.
 *   apiFetch() automatically attaches the X-CSRF-Token header for non-GET
 *   methods (double-submit cookie pattern), so no manual CSRF wiring is needed.
 *
 * The endpoint only returns pending reviews; as the moderator acts, we update
 * each review's status in place (optimistic) so the Approved / Rejected tabs
 * reflect this session's decisions. "Flagged" is a derived view of low-rating
 * reviews (<= 2 stars) that need extra attention.
 */

// ---- helpers ---------------------------------------------------------------

function parseDetails(raw) {
  const d = raw.review_details;
  if (!d) return {};
  if (typeof d === 'object') return d;
  if (typeof d === 'string') {
    try {
      return JSON.parse(d);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeReview(raw) {
  const details = parseDetails(raw);
  const name = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim();
  const status = String(raw.status || (raw.is_approved ? 'approved' : 'pending')).toLowerCase();
  return {
    id: raw.id,
    rating: Number(raw.rating) || 0,
    title: raw.title || details.title || '',
    body: raw.review_text || details.review_text || details.comment || details.text || '',
    authorName: name,
    email: raw.email || '',
    productName: raw.product_name || '',
    createdAt: raw.created_at || null,
    verified: raw.is_verified_purchase === 1 || raw.is_verified_purchase === true,
    status,
  };
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function Stars({ rating }) {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="tracking-wide text-sm" aria-label={`${rating} / 5`}>
      <span className="text-amber-500">{'★'.repeat(full)}</span>
      <span className="text-gray-300">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_ACCENT = {
  pending: 'border-l-amber-400',
  approved: 'border-l-green-500',
  rejected: 'border-l-red-400',
};

// ---- component -------------------------------------------------------------

export default function ReviewModerationView() {
  const t = useTranslations('ReviewModeration');

  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [actioningId, setActioningId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadReviews = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { apiFetch } = await import('../utils/api');
      const response = await apiFetch('/api/reviews/admin/pending');
      if (response.status === 'SUCCESS') {
        const kv = response.keyValueTable;
        const rawList = Array.isArray(kv)
          ? (kv.find((item) => item && item.reviews)?.reviews || [])
          : (kv?.reviews || []);
        setReviews(rawList.map(normalizeReview));
      } else {
        setError(t('loadError'));
      }
    } catch (err) {
      console.error('Error loading reviews:', err);
      setError(t('loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handleAction = async (id, action) => {
    setActioningId(id);
    setActionError(null);
    // optimistic snapshot for rollback
    const prevStatus = reviews.find((r) => r.id === id)?.status;
    const nextStatus = action === 'approve' ? 'approved' : 'rejected';
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)));
    try {
      const { apiFetch } = await import('../utils/api');
      const response = await apiFetch(`/api/reviews/admin/${id}/${action}`, { method: 'PUT' });
      if (response.status !== 'SUCCESS') {
        // rollback
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status: prevStatus } : r)));
        setActionError(t('actionFailed'));
      }
    } catch (err) {
      console.error(`Error on review ${action}:`, err);
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status: prevStatus } : r)));
      setActionError(t('actionError'));
    } finally {
      setActioningId(null);
    }
  };

  // derived data
  const counts = {
    all: reviews.length,
    pending: reviews.filter((r) => r.status === 'pending').length,
    approved: reviews.filter((r) => r.status === 'approved').length,
    rejected: reviews.filter((r) => r.status === 'rejected').length,
    flagged: reviews.filter((r) => r.rating > 0 && r.rating <= 2).length,
  };

  const filtered =
    filter === 'all'
      ? reviews
      : filter === 'flagged'
        ? reviews.filter((r) => r.rating > 0 && r.rating <= 2)
        : reviews.filter((r) => r.status === filter);

  const avg = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
  const avgLabel = avg.toFixed(1);

  const dist = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
    return { star, count, pct };
  });

  const tabs = [
    { key: 'all', label: t('labelAll') },
    { key: 'pending', label: t('labelPending') },
    { key: 'approved', label: t('labelApproved') },
    { key: 'rejected', label: t('labelRejected') },
    { key: 'flagged', label: t('labelFlagged') },
  ];

  const statusLabel = (status) =>
    ({
      pending: t('labelPending'),
      approved: t('labelApproved'),
      rejected: t('labelRejected'),
    }[status] || status);

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{t('title')}</h2>
          <p className="text-gray-500 mt-1">
            {t('subtitle', { pending: counts.pending, total: counts.all })}
          </p>
        </div>
        <button
          onClick={loadReviews}
          disabled={isLoading}
          className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isLoading ? t('refreshing') : t('refresh')}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-t-4 border-t-amber-400 p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('cardPending')}</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{counts.pending}</div>
          <div className="text-xs text-amber-600 mt-1">{t('cardPendingHint')}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-t-4 border-t-green-500 p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('cardApproved')}</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{counts.approved}</div>
          <div className="text-xs text-green-600 mt-1">{t('cardApprovedHint')}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-t-4 border-t-blue-500 p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('cardAvgRating')}</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{avgLabel}</div>
          <div className="text-xs text-gray-500 mt-1">{t('cardAvgRatingHint')}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-t-4 border-t-red-400 p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('cardFlagged')}</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{counts.flagged}</div>
          <div className="text-xs text-red-500 mt-1">{t('cardFlaggedHint')}</div>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        {/* LEFT: filters + list */}
        <div>
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
                <span className={filter === tab.key ? 'opacity-80' : 'text-gray-400'}>
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          {/* List */}
          {isLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
              {t('loading')}
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm border border-red-100 p-12 text-center text-red-500">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-dashed border-gray-200 p-12 text-center text-gray-500">
              {filter === 'pending' || filter === 'all' ? t('empty') : t('emptyFiltered')}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${
                    STATUS_ACCENT[r.status] || 'border-l-gray-300'
                  } p-5`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                      {initialsOf(r.authorName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {r.authorName || r.email || t('anonymous')}
                        </span>
                        {r.verified && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {t('verifiedBuyer')}
                          </span>
                        )}
                        {r.createdAt && (
                          <span className="text-xs text-gray-400">
                            · {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <Stars rating={r.rating} />
                        {r.productName && (
                          <span className="text-xs text-gray-500 truncate">{r.productName}</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0 ${
                        STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </div>

                  {r.title && <h4 className="text-base font-semibold text-gray-900 mt-3">{r.title}</h4>}
                  {r.body && <p className="text-sm leading-relaxed text-gray-600 mt-1">{r.body}</p>}

                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    <button
                      onClick={() => handleAction(r.id, 'approve')}
                      disabled={actioningId === r.id || r.status === 'approved'}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3.5 py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {actioningId === r.id ? t('approving') : t('approve')}
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'reject')}
                      disabled={actioningId === r.id || r.status === 'rejected'}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 px-3.5 py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      {actioningId === r.id ? t('rejecting') : t('reject')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: rating breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:sticky lg:top-6">
          <h3 className="text-lg font-bold text-gray-900">{t('breakdownTitle')}</h3>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl font-bold text-gray-900 leading-none">{avgLabel}</span>
            <span className="text-xs text-gray-500">
              {t('breakdownSummary', { avg: avgLabel, total: reviews.length })}
            </span>
          </div>
          <div className="flex flex-col gap-2.5 mt-5">
            {dist.map((d) => (
              <div key={d.star} className="flex items-center gap-2.5">
                <span className="text-xs text-gray-500 w-7">{d.star}{'★'}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${d.pct}%` }} />
                </div>
                <span className="text-xs text-gray-400 w-6 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
