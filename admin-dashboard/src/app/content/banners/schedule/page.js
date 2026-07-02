'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function BannerSchedule() {
  const t = useTranslations('BannerSchedule');
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBanner, setSelectedBanner] = useState(null);
  const [scheduleData, setScheduleData] = useState({
    start_date: '',
    end_date: '',
    max_impressions: '',
    priority: 1,
    device_targeting: 'all'
  });

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error(t('noAuthToken'));
      }

      const response = await fetch('http://localhost:6666/api/admin/content/banners', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(t('httpError', { status: response.status }));
      }

      const data = await response.json();

      if (data.success) {
        setBanners(data.keyValueTable?.banners || []);
      } else {
        throw new Error(data.message || t('failedToFetchBanners'));
      }
    } catch (error) {
      console.error('Error fetching banners:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleChange = (e) => {
    const { name, value } = e.target;
    setScheduleData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleUpdateSchedule = async (bannerId) => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error(t('noAuthToken'));
      }

      const response = await fetch(`http://localhost:6666/api/admin/content/banners/${bannerId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          display_rules: scheduleData
        })
      });

      if (!response.ok) {
        throw new Error(t('httpError', { status: response.status }));
      }

      const data = await response.json();

      if (data.success) {
        setSelectedBanner(null);
        setScheduleData({
          start_date: '',
          end_date: '',
          max_impressions: '',
          priority: 1,
          device_targeting: 'all'
        });
        fetchBanners(); // Refresh the list
      } else {
        throw new Error(data.message || t('failedToUpdateSchedule'));
      }
    } catch (error) {
      console.error('Error updating banner schedule:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('notSet');
    return new Date(dateString).toLocaleString();
  };

  const getBannerStatus = (banner) => {
    if (!banner.is_active) return { status: t('statusInactive'), color: 'bg-gray-100 text-gray-800' };

    const now = new Date();
    const startDate = banner.display_rules?.start_date ? new Date(banner.display_rules.start_date) : null;
    const endDate = banner.display_rules?.end_date ? new Date(banner.display_rules.end_date) : null;

    if (startDate && now < startDate) {
      return { status: t('statusScheduled'), color: 'bg-blue-100 text-blue-800' };
    }

    if (endDate && now > endDate) {
      return { status: t('statusExpired'), color: 'bg-red-100 text-red-800' };
    }

    return { status: t('statusActive'), color: 'bg-green-100 text-green-800' };
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Schedule Form */}
      {selectedBanner && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {t('scheduleBannerHeading', { title: selectedBanner.title })}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Start Date */}
            <div>
              <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 mb-2">
                {t('startDateLabel')}
              </label>
              <input
                type="datetime-local"
                id="start_date"
                name="start_date"
                value={scheduleData.start_date}
                onChange={handleScheduleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* End Date */}
            <div>
              <label htmlFor="end_date" className="block text-sm font-medium text-gray-700 mb-2">
                {t('endDateLabel')}
              </label>
              <input
                type="datetime-local"
                id="end_date"
                name="end_date"
                value={scheduleData.end_date}
                onChange={handleScheduleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Max Impressions */}
            <div>
              <label htmlFor="max_impressions" className="block text-sm font-medium text-gray-700 mb-2">
                {t('maxImpressionsLabel')}
              </label>
              <input
                type="number"
                id="max_impressions"
                name="max_impressions"
                value={scheduleData.max_impressions}
                onChange={handleScheduleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('maxImpressionsPlaceholder')}
              />
            </div>

            {/* Priority */}
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                {t('priorityLabel')}
              </label>
              <input
                type="number"
                id="priority"
                name="priority"
                value={scheduleData.priority}
                onChange={handleScheduleChange}
                min="1"
                max="10"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Device Targeting */}
            <div>
              <label htmlFor="device_targeting" className="block text-sm font-medium text-gray-700 mb-2">
                {t('deviceTargetingLabel')}
              </label>
              <select
                id="device_targeting"
                name="device_targeting"
                value={scheduleData.device_targeting}
                onChange={handleScheduleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{t('deviceAll')}</option>
                <option value="desktop">{t('deviceDesktop')}</option>
                <option value="mobile">{t('deviceMobile')}</option>
                <option value="tablet">{t('deviceTablet')}</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end space-x-2">
            <button
              onClick={() => setSelectedBanner(null)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => handleUpdateSchedule(selectedBanner.id)}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? t('updating') : t('updateSchedule')}
            </button>
          </div>
        </div>
      )}

      {/* Banners List */}
      {loading && !selectedBanner ? (
        <div className="text-center py-8">{t('loadingBanners')}</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-8 text-gray-500">{t('noBannersFound')}</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">{t('overviewHeading')}</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('columnBanner')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('columnStatus')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('columnPosition')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('columnSchedule')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('columnPriority')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('columnDevice')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('columnActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {banners.map((banner) => {
                  const status = getBannerStatus(banner);
                  return (
                    <tr key={banner.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {banner.image_url && (
                            <img
                              src={banner.image_url}
                              alt={banner.title}
                              className="w-10 h-10 object-cover rounded mr-3"
                            />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">{banner.title}</div>
                            <div className="text-sm text-gray-500">{banner.content}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${status.color}`}>
                          {status.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {banner.position}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                          <div>{t('startPrefix', { date: formatDate(banner.display_rules?.start_date) })}</div>
                          <div>{t('endPrefix', { date: formatDate(banner.display_rules?.end_date) })}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {banner.display_rules?.priority || 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {banner.display_rules?.device_targeting || 'all'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => {
                            setSelectedBanner(banner);
                            setScheduleData({
                              start_date: banner.display_rules?.start_date || '',
                              end_date: banner.display_rules?.end_date || '',
                              max_impressions: banner.display_rules?.max_impressions || '',
                              priority: banner.display_rules?.priority || 1,
                              device_targeting: banner.display_rules?.device_targeting || 'all'
                            });
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {t('editSchedule')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schedule Legend */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">{t('statusLegend')}</h4>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 mr-2">
              {t('statusActive')}
            </span>
            <span className="text-gray-600">{t('legendActiveDesc')}</span>
          </div>
          <div className="flex items-center">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 mr-2">
              {t('statusScheduled')}
            </span>
            <span className="text-gray-600">{t('legendScheduledDesc')}</span>
          </div>
          <div className="flex items-center">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 mr-2">
              {t('statusExpired')}
            </span>
            <span className="text-gray-600">{t('legendExpiredDesc')}</span>
          </div>
          <div className="flex items-center">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 mr-2">
              {t('statusInactive')}
            </span>
            <span className="text-gray-600">{t('legendInactiveDesc')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
