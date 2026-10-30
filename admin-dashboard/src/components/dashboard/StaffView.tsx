'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import StaffDetailView from '../StaffDetailView';
import type { StaffMember, Table } from '@/types/api';

export default function StaffView() {
  const t = useTranslations('Dashboard');
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const { apiFetch } = await import('../../utils/api');
        const response = await apiFetch<Table<'staff', StaffMember[]>>('/api/admin/staff');
        if (response.status === 'SUCCESS') {
          const data = response.keyValueTable.find(item => item.staff)?.staff || [];
          setStaff(data);
        } else {
          setError(t('staffLoadFailed'));
        }
      } catch (err) {
        console.error('Error loading staff:', err);
        setError(t('staffLoadError'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchStaff();
  }, [selectedStaff, isAddingStaff]); // refetch when returning to the list (create/edit may have changed it)

  // Editing passes the selected member; adding passes null so StaffDetailView runs its
  // create flow (POST /api/admin/users). Passing {} previously made isEditing truthy and
  // fired PUT /api/admin/users/undefined.
  if (selectedStaff || isAddingStaff) {
    return (
      <StaffDetailView
        staff={isAddingStaff ? null : selectedStaff}
        onBack={() => { setSelectedStaff(null); setIsAddingStaff(false); }}
      />
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">{t('staffTitle')}</h2>
        <button
          onClick={() => setIsAddingStaff(true)}
          className="px-4 py-2 bg-brand text-white rounded-md hover:bg-brand-hover transition shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('addNewStaff')}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colName')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colEmail')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colRole')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colStatus')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colLastActive')}</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">{t('loadingStaff')}</td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-red-500">{error}</td></tr>
            ) : staff.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">{t('noStaffFound')}</td></tr>
            ) : (
              staff.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{member.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{member.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{member.role}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${member.status?.toLowerCase() === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{member.lastActive !== 'Never' ? new Date(member.lastActive).toLocaleString() : t('never')}</td>
                  <td className="px-6 py-4 text-sm">
                    <button onClick={() => setSelectedStaff(member)} className="text-gray-400 hover:text-blue-600">
                      {t('edit')}
                    </button>
                  </td>
                </tr>
              )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
