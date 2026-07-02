'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function NewBanner() {
  const t = useTranslations('BannerNew');
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    image_url: '',
    link_url: '',
    link_text: '',
    position: 'homepage',
    target_audience: {
      user_roles: [],
      categories: [],
      pages: []
    },
    display_rules: {
      start_date: '',
      end_date: '',
      max_impressions: '',
      priority: 1,
      device_targeting: 'all'
    },
    is_active: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const positionOptions = [
    { value: 'homepage', label: t('positionHomepage') },
    { value: 'header', label: t('positionHeader') },
    { value: 'footer', label: t('positionFooter') },
    { value: 'sidebar', label: t('positionSidebar') },
    { value: 'category', label: t('positionCategory') }
  ];

  const deviceOptions = [
    { value: 'all', label: t('deviceAll') },
    { value: 'desktop', label: t('deviceDesktop') },
    { value: 'mobile', label: t('deviceMobile') },
    { value: 'tablet', label: t('deviceTablet') }
  ];

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDisplayRuleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      display_rules: {
        ...prev.display_rules,
        [name]: value
      }
    }));
  };

  const handleTargetAudienceChange = (e) => {
    const { name, value } = e.target;
    const values = value.split(',').map(v => v.trim()).filter(v => v);
    setFormData(prev => ({
      ...prev,
      target_audience: {
        ...prev.target_audience,
        [name]: values
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title) {
      setError(t('titleRequired'));
      return;
    }

    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error(t('noAuthToken'));
      }

      // Clean up display rules - remove empty values
      const cleanDisplayRules = Object.fromEntries(
        Object.entries(formData.display_rules).filter(([key, value]) => value !== '')
      );

      const submitData = {
        ...formData,
        display_rules: cleanDisplayRules
      };

      const response = await fetch('http://localhost:6666/api/admin/content/banners', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitData)
      });

      if (!response.ok) {
        throw new Error(t('httpError', { status: response.status }));
      }

      const data = await response.json();

      if (data.success) {
        router.push('/content');
      } else {
        throw new Error(data.message || t('failedToCreate'));
      }
    } catch (error) {
      console.error('Error creating banner:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">{t('basicInformation')}</h3>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bannerTitleLabel')} *
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('bannerTitlePlaceholder')}
                  required
                />
              </div>

              {/* Content */}
              <div>
                <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('bannerContentLabel')}
                </label>
                <textarea
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('bannerContentPlaceholder')}
                />
              </div>

              {/* Image URL */}
              <div>
                <label htmlFor="image_url" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('imageUrlLabel')}
                </label>
                <input
                  type="url"
                  id="image_url"
                  name="image_url"
                  value={formData.image_url}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/banner-image.jpg"
                />
                {formData.image_url && (
                  <div className="mt-2">
                    <img
                      src={formData.image_url}
                      alt={t('bannerPreviewAlt')}
                      className="w-full h-32 object-cover rounded"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Link URL */}
              <div>
                <label htmlFor="link_url" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('linkUrlLabel')}
                </label>
                <input
                  type="url"
                  id="link_url"
                  name="link_url"
                  value={formData.link_url}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/landing-page"
                />
              </div>

              {/* Link Text */}
              <div>
                <label htmlFor="link_text" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('linkTextLabel')}
                </label>
                <input
                  type="text"
                  id="link_text"
                  name="link_text"
                  value={formData.link_text}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('linkTextPlaceholder')}
                />
              </div>

              {/* Position */}
              <div>
                <label htmlFor="position" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('displayPositionLabel')}
                </label>
                <select
                  id="position"
                  name="position"
                  value={formData.position}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {positionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Status */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                  {t('activeLabel')}
                </label>
              </div>
            </div>
          </div>

          {/* Display Rules & Targeting */}
          <div className="space-y-6">
            {/* Display Rules */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{t('displayRules')}</h3>

              <div className="space-y-4">
                {/* Start Date */}
                <div>
                  <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('startDateLabel')}
                  </label>
                  <input
                    type="datetime-local"
                    id="start_date"
                    name="start_date"
                    value={formData.display_rules.start_date}
                    onChange={handleDisplayRuleChange}
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
                    value={formData.display_rules.end_date}
                    onChange={handleDisplayRuleChange}
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
                    value={formData.display_rules.max_impressions}
                    onChange={handleDisplayRuleChange}
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
                    value={formData.display_rules.priority}
                    onChange={handleDisplayRuleChange}
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
                    value={formData.display_rules.device_targeting}
                    onChange={handleDisplayRuleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {deviceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Target Audience */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{t('targetAudience')}</h3>

              <div className="space-y-4">
                {/* User Roles */}
                <div>
                  <label htmlFor="user_roles" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('userRolesLabel')}
                  </label>
                  <input
                    type="text"
                    id="user_roles"
                    name="user_roles"
                    value={formData.target_audience.user_roles.join(', ')}
                    onChange={handleTargetAudienceChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="customer, admin, guest"
                  />
                </div>

                {/* Categories */}
                <div>
                  <label htmlFor="categories" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('categoriesLabel')}
                  </label>
                  <input
                    type="text"
                    id="categories"
                    name="categories"
                    value={formData.target_audience.categories.join(', ')}
                    onChange={handleTargetAudienceChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="bed-sheets, comforters, pillows"
                  />
                </div>

                {/* Pages */}
                <div>
                  <label htmlFor="pages" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('pagesLabel')}
                  </label>
                  <input
                    type="text"
                    id="pages"
                    name="pages"
                    value={formData.target_audience.pages.join(', ')}
                    onChange={handleTargetAudienceChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="/shop, /about, /contact"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={() => router.push('/content')}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            {t('cancel')}
          </button>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? t('creating') : t('createBanner')}
          </button>
        </div>
      </form>
    </div>
  );
}