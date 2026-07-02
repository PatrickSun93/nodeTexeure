'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import ExportButton from '../../../components/ExportButton';
import { apiRequest, getErrorMessage } from '@/lib/api';

// Scheduled reports admin API (proxied to the Express backend at /api/admin/*).
const SCHEDULED_REPORTS_ENDPOINT = 'admin/reports/scheduled';

const scheduledReportsAPI = {
  list() {
    return apiRequest(SCHEDULED_REPORTS_ENDPOINT);
  },
  create(payload) {
    return apiRequest(SCHEDULED_REPORTS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  update(id, payload) {
    return apiRequest(`${SCHEDULED_REPORTS_ENDPOINT}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  remove(id) {
    return apiRequest(`${SCHEDULED_REPORTS_ENDPOINT}/${id}`, {
      method: 'DELETE',
    });
  },
};

// Tolerate the different response shapes the backend may use (ResponseFormatter
// keyValueTable, or a plain { data } envelope) and always return an array.
function extractSchedules(response) {
  const kvt = response?.keyValueTable;
  if (Array.isArray(kvt)) return kvt;
  if (Array.isArray(kvt?.scheduledReports)) return kvt.scheduledReports;
  if (Array.isArray(kvt?.schedules)) return kvt.schedules;
  const data = response?.data;
  if (Array.isArray(data?.scheduledReports)) return data.scheduledReports;
  if (Array.isArray(data?.schedules)) return data.schedules;
  if (Array.isArray(data)) return data;
  return [];
}

export default function ScheduledReportsPage() {
  const t = useTranslations('ScheduledReports');
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: '',
    reportType: 'financial-overview',
    frequency: 'weekly',
    dayOfWeek: '1', // Monday
    dayOfMonth: '1',
    time: '09:00',
    recipients: '',
    isActive: true
  });

  const fetchSchedules = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await scheduledReportsAPI.list();
      setSchedules(extractSchedules(response));
    } catch (err) {
      console.error('Error fetching scheduled reports:', err);
      setSchedules([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const resetNewSchedule = () => {
    setNewSchedule({
      name: '',
      reportType: 'financial-overview',
      frequency: 'weekly',
      dayOfWeek: '1',
      dayOfMonth: '1',
      time: '09:00',
      recipients: '',
      isActive: true
    });
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    try {
      await scheduledReportsAPI.create(newSchedule);
      resetNewSchedule();
      setShowCreateForm(false);
      await fetchSchedules();
    } catch (err) {
      console.error('Error creating scheduled report:', err);
      alert(t('createFailed', { error: getErrorMessage(err) }));
    }
  };

  const toggleScheduleStatus = async (schedule) => {
    try {
      await scheduledReportsAPI.update(schedule.id, { isActive: !schedule.isActive });
      await fetchSchedules();
    } catch (err) {
      console.error('Error updating scheduled report:', err);
      alert(t('updateFailed', { error: getErrorMessage(err) }));
    }
  };

  const deleteSchedule = async (id) => {
    if (!confirm(t('deleteConfirm'))) {
      return;
    }
    try {
      await scheduledReportsAPI.remove(id);
      await fetchSchedules();
    } catch (err) {
      console.error('Error deleting scheduled report:', err);
      alert(t('deleteFailed', { error: getErrorMessage(err) }));
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return t('never');
    return new Date(dateString).toLocaleString();
  };

  const getReportTypeLabel = (type) => {
    const labels = {
      'financial-overview': t('reportTypeFinancialOverview'),
      'revenue-analytics': t('reportTypeRevenueAnalytics'),
      'tax-collection': t('reportTypeTaxCollection'),
      'payment-analytics': t('reportTypePaymentAnalytics')
    };
    return labels[type] || type;
  };

  const getFrequencyLabel = (frequency) => {
    const labels = {
      'daily': t('frequencyDaily'),
      'weekly': t('frequencyWeekly'),
      'monthly': t('frequencyMonthly')
    };
    return labels[frequency] || frequency;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-1">{t('subtitle')}</p>
        </div>

        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="-ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('newSchedule')}
        </button>
      </div>

      {/* Create Schedule Form */}
      {showCreateForm && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('createFormTitle')}</h3>
          <form onSubmit={handleCreateSchedule} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('reportNameLabel')}
                </label>
                <input
                  type="text"
                  value={newSchedule.name}
                  onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('reportTypeLabel')}
                </label>
                <select
                  value={newSchedule.reportType}
                  onChange={(e) => setNewSchedule({ ...newSchedule, reportType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="financial-overview">{t('reportTypeFinancialOverview')}</option>
                  <option value="revenue-analytics">{t('reportTypeRevenueAnalytics')}</option>
                  <option value="tax-collection">{t('reportTypeTaxCollection')}</option>
                  <option value="payment-analytics">{t('reportTypePaymentAnalytics')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('frequencyLabel')}
                </label>
                <select
                  value={newSchedule.frequency}
                  onChange={(e) => setNewSchedule({ ...newSchedule, frequency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="weekly">{t('frequencyWeekly')}</option>
                  <option value="monthly">{t('frequencyMonthly')}</option>
                </select>
              </div>

              {newSchedule.frequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('dayOfWeekLabel')}
                  </label>
                  <select
                    value={newSchedule.dayOfWeek}
                    onChange={(e) => setNewSchedule({ ...newSchedule, dayOfWeek: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="1">{t('dayMonday')}</option>
                    <option value="2">{t('dayTuesday')}</option>
                    <option value="3">{t('dayWednesday')}</option>
                    <option value="4">{t('dayThursday')}</option>
                    <option value="5">{t('dayFriday')}</option>
                    <option value="6">{t('daySaturday')}</option>
                    <option value="0">{t('daySunday')}</option>
                  </select>
                </div>
              )}

              {newSchedule.frequency === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('dayOfMonthLabel')}
                  </label>
                  <select
                    value={newSchedule.dayOfMonth}
                    onChange={(e) => setNewSchedule({ ...newSchedule, dayOfMonth: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('timeLabel')}
                </label>
                <input
                  type="time"
                  value={newSchedule.time}
                  onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('recipientsLabel')}
                </label>
                <input
                  type="text"
                  value={newSchedule.recipients}
                  onChange={(e) => setNewSchedule({ ...newSchedule, recipients: e.target.value })}
                  placeholder="admin@bedtexture.com, finance@bedtexture.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t('createSchedule')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Scheduled Reports List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{t('activeSchedules')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnName')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnReportType')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnFrequency')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnRecipients')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnLastRun')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnNextRun')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnStatus')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('columnActions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                    {t('loading')}
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                    {error
                      ? t('loadError', { error })
                      : t('empty')}
                  </td>
                </tr>
              ) : (
                schedules.map((schedule) => (
                <tr key={schedule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {schedule.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getReportTypeLabel(schedule.reportType)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getFrequencyLabel(schedule.frequency)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {Array.isArray(schedule.recipients)
                      ? schedule.recipients.join(', ')
                      : schedule.recipients}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(schedule.lastRun)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(schedule.nextRun)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      schedule.isActive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {schedule.isActive ? t('statusActive') : t('statusInactive')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => toggleScheduleStatus(schedule)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {schedule.isActive ? t('pause') : t('resume')}
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Export Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('quickExport')}</h3>
        <p className="text-gray-600 mb-4">{t('quickExportSubtitle')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ExportButton
            endpoint="/admin/reports/export/financial-overview"
            filename={`financial-overview-${new Date().toISOString().split('T')[0]}.csv`}
            params={{ period: 'month' }}
            className="w-full justify-center"
          >
            {t('reportTypeFinancialOverview')}
          </ExportButton>

          <ExportButton
            endpoint="/admin/reports/export/revenue-analytics"
            filename={`revenue-analytics-${new Date().toISOString().split('T')[0]}.csv`}
            params={{ period: '30days', granularity: 'day' }}
            className="w-full justify-center"
            variant="secondary"
          >
            {t('reportTypeRevenueAnalytics')}
          </ExportButton>

          <ExportButton
            endpoint="/admin/reports/export/tax-collection"
            filename={`tax-collection-${new Date().toISOString().split('T')[0]}.csv`}
            params={{ period: 'month' }}
            className="w-full justify-center"
            variant="success"
          >
            {t('reportTypeTaxCollection')}
          </ExportButton>

          <ExportButton
            endpoint="/admin/reports/export/payment-analytics"
            filename={`payment-analytics-${new Date().toISOString().split('T')[0]}.csv`}
            params={{ period: 'month' }}
            className="w-full justify-center"
            variant="secondary"
          >
            {t('reportTypePaymentAnalytics')}
          </ExportButton>
        </div>
      </div>
    </div>
  );
}
