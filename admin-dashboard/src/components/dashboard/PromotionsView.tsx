'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import PromotionDetailView from '../PromotionDetailView';
import PromotionModal from '../PromotionModal';
import { useNotifications } from '../NotificationSystem';
import type { Coupon, Table } from '@/types/api';

export default function PromotionsView() {
  const t = useTranslations('Dashboard');
  const notify = useNotifications();
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<Coupon | null>(null);
  const [promotions, setPromotions] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const fetchPromotions = async () => {
      try {
        const { apiFetch } = await import('../../utils/api');
        const response = await apiFetch<Table<'coupons', Coupon[]>>('/api/admin/coupons');
        if (response.status === 'SUCCESS') {
          const data = response.keyValueTable.find(item => item.coupons)?.coupons || [];
          setPromotions(data);
        } else {
          setError(t('promotionsLoadFailed'));
        }
      } catch (err) {
        console.error('Error loading promotions:', err);
        setError(t('promotionsLoadError'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchPromotions();
  }, [viewMode, isModalOpen]); // Re-fetch on view change or modal close

  const handleEdit = (promo: Coupon) => {
    setSelectedPromotion(promo);
    setViewMode('edit');
  };

  const handleCreate = () => {
    setSelectedPromotion(null);
    setIsModalOpen(true);
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedPromotion(null);
  };

  const handleDelete = async (promo: Coupon) => {
    if (!promo?.id) return;
    if (!confirm(t('confirmDeletePromotion', { name: promo.name || promo.code || '' }))) return;
    try {
      const { apiFetch } = await import('../../utils/api');
      const response = await apiFetch(`/api/admin/coupons/${promo.id}`, { method: 'DELETE' });
      if (response.status === 'SUCCESS') {
        setPromotions((prev) => prev.filter((p) => p.id !== promo.id));
      } else {
        notify.error(t('deletePromotionError'));
      }
    } catch (e) {
      console.error('Delete promotion failed', e);
      notify.error(t('deletePromotionError'));
    }
  };

  // Filter the loaded list client-side (search by name/code, plus type & status selects).
  const filteredPromotions = promotions.filter((promo) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q ||
      (promo.name && promo.name.toLowerCase().includes(q)) ||
      (promo.code && promo.code.toLowerCase().includes(q));
    const matchesType = !typeFilter || promo.type === typeFilter;
    const matchesStatus = !statusFilter || promo.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  if (viewMode === 'edit') {
    return <PromotionDetailView promotion={selectedPromotion} onBack={handleBack} />;
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">{t('promotionsTitle')}</h2>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-brand text-white rounded-md hover:bg-brand-hover transition shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('createNewPromotion')}
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder={t('searchPromotionsPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-gray-700"
            />
          </div>
          <div className="flex gap-4">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand text-gray-600 min-w-[160px]"
            >
              <option value="">{t('allTypes')}</option>
              <option value="percentage">{t('typePercentage')}</option>
              <option value="fixed_amount">{t('typeFixedAmount')}</option>
              <option value="free_shipping">{t('typeFreeShipping')}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand text-gray-600 min-w-[160px]"
            >
              <option value="">{t('allStatuses')}</option>
              <option value="Active">{t('statusActive')}</option>
              <option value="Draft">{t('statusDraft')}</option>
              <option value="Expired">{t('statusExpired')}</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colName')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colCode')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colType')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colDiscountValue')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colStartDate')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colEndDate')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colStatus')}</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-500">{t('loadingPromotions')}</td></tr>
              ) : error ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-red-500">{error}</td></tr>
              ) : filteredPromotions.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-500">{t('noPromotionsFound')}</td></tr>
              ) : (
                filteredPromotions.map((promo) => (
                  <tr key={promo.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-6 text-sm font-medium text-gray-900">{promo.name}</td>
                    <td className="px-6 py-6 text-sm text-gray-500 font-mono">{promo.code}</td>
                    <td className="px-6 py-6 text-sm text-gray-600 capitalize">{promo.type.replace('_', ' ')}</td>
                    <td className="px-6 py-6 text-sm font-bold text-gray-900">{promo.type === 'percentage' ? `${Number(promo.value)}%` : promo.type === 'fixed_amount' ? `$${Number(promo.value)}` : '-'}</td>
                    <td className="px-6 py-6 text-sm text-gray-500">{promo.startDate ? new Date(promo.startDate).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-6 text-sm text-gray-500">{promo.endDate ? new Date(promo.endDate).toLocaleDateString() : t('noExpiry')}</td>
                    <td className="px-6 py-6">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${promo.status === 'Active' ? 'bg-green-100 text-green-700' :
                        promo.status === 'Draft' ? 'bg-yellow-100 text-yellow-700' :
                          promo.status === 'Scheduled' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                        }`}>
                        {promo.status}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-sm">
                      <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(promo)} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(promo)} className="text-gray-400 hover:text-red-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table>
        </div>
      </div>

      <PromotionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        promotion={null}
      />
    </div>
  );
}
