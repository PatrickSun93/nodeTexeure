'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getErrorMessage } from '@/lib/api';
import { useTranslations } from 'next-intl';

// Setting Category Component
function SettingCategory({ category, settings, onSettingUpdate, isLoading }) {
  const t = useTranslations('Settings');
  const [expandedSettings, setExpandedSettings] = useState({});
  const [editingSettings, setEditingSettings] = useState({});
  const [localValues, setLocalValues] = useState({});

  const toggleExpanded = (settingKey) => {
    setExpandedSettings(prev => ({
      ...prev,
      [settingKey]: !prev[settingKey]
    }));
  };

  const startEditing = (setting) => {
    setEditingSettings(prev => ({ ...prev, [setting.setting_key]: true }));
    setLocalValues(prev => ({ 
      ...prev, 
      [setting.setting_key]: setting.setting_value 
    }));
  };

  const cancelEditing = (settingKey) => {
    setEditingSettings(prev => ({ ...prev, [settingKey]: false }));
    setLocalValues(prev => ({ ...prev, [settingKey]: undefined }));
  };

  const saveSettings = async (setting) => {
    try {
      const newValue = localValues[setting.setting_key];
      await onSettingUpdate(setting.setting_key, newValue, setting.setting_type, setting.setting_details);
      setEditingSettings(prev => ({ ...prev, [setting.setting_key]: false }));
    } catch (error) {
      console.error('Failed to save setting:', error);
    }
  };

  const renderSettingValue = (setting) => {
    const isEditing = editingSettings[setting.setting_key];
    const currentValue = isEditing ? localValues[setting.setting_key] : setting.setting_value;

    if (isEditing) {
      switch (setting.setting_type) {
        case 'boolean':
          return (
            <select
              value={currentValue ? 'true' : 'false'}
              onChange={(e) => setLocalValues(prev => ({ 
                ...prev, 
                [setting.setting_key]: e.target.value === 'true' 
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="true">{t('enabled')}</option>
              <option value="false">{t('disabled')}</option>
            </select>
          );
        case 'integer':
          return (
            <input
              type="number"
              value={currentValue || ''}
              onChange={(e) => setLocalValues(prev => ({ 
                ...prev, 
                [setting.setting_key]: parseInt(e.target.value) || 0 
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          );
        case 'decimal':
          return (
            <input
              type="number"
              step="0.01"
              value={currentValue || ''}
              onChange={(e) => setLocalValues(prev => ({ 
                ...prev, 
                [setting.setting_key]: parseFloat(e.target.value) || 0 
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          );
        case 'json':
          return (
            <textarea
              value={typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : currentValue || ''}
              onChange={(e) => setLocalValues(prev => ({ 
                ...prev, 
                [setting.setting_key]: e.target.value 
              }))}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder={t('enterValidJson')}
            />
          );
        default:
          return (
            <input
              type="text"
              value={currentValue || ''}
              onChange={(e) => setLocalValues(prev => ({ 
                ...prev, 
                [setting.setting_key]: e.target.value 
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          );
      }
    }

    // Display mode
    switch (setting.setting_type) {
      case 'boolean':
        return (
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            currentValue ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {currentValue ? t('enabled') : t('disabled')}
          </span>
        );
      case 'json':
        return (
          <pre className="text-sm bg-gray-50 p-2 rounded border overflow-x-auto">
            {typeof currentValue === 'object' 
              ? JSON.stringify(currentValue, null, 2) 
              : currentValue || 'null'
            }
          </pre>
        );
      default:
        return (
          <span className="text-gray-900">
            {currentValue !== null && currentValue !== undefined ? String(currentValue) : t('notSet')}
          </span>
        );
    }
  };

  return (
    <div className="admin-card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{category}</h3>
      <div className="space-y-4">
        {settings.map((setting) => (
          <div key={setting.setting_key} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1">
                <h4 className="text-sm font-medium text-gray-900">{setting.setting_key}</h4>
                {setting.setting_details?.description && (
                  <p className="text-xs text-gray-500 mt-1">{setting.setting_details.description}</p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                  {setting.setting_type}
                </span>
                {setting.is_public && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded">
                    {t('public')}
                  </span>
                )}
                <button
                  onClick={() => toggleExpanded(setting.setting_key)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {expandedSettings[setting.setting_key] ? '−' : '+'}
                </button>
              </div>
            </div>

            {expandedSettings[setting.setting_key] && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('value')}
                  </label>
                  {renderSettingValue(setting)}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    {setting.updated_at && (
                      <>{t('lastUpdated', { date: new Date(setting.updated_at).toLocaleString() })}</>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    {editingSettings[setting.setting_key] ? (
                      <>
                        <button
                          onClick={() => saveSettings(setting)}
                          disabled={isLoading}
                          className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {t('save')}
                        </button>
                        <button
                          onClick={() => cancelEditing(setting.setting_key)}
                          disabled={isLoading}
                          className="text-xs px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                        >
                          {t('cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEditing(setting)}
                        disabled={isLoading}
                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {t('edit')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// New Setting Modal Component
function NewSettingModal({ isOpen, onClose, onSave, categories }) {
  const t = useTranslations('Settings');
  const [formData, setFormData] = useState({
    setting_key: '',
    setting_value: '',
    setting_type: 'string',
    setting_details: {
      description: '',
      category: 'General'
    },
    is_public: false
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await onSave(formData);
      setFormData({
        setting_key: '',
        setting_value: '',
        setting_type: 'string',
        setting_details: {
          description: '',
          category: 'General'
        },
        is_public: false
      });
      onClose();
    } catch (error) {
      console.error('Failed to create setting:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">{t('addNewSetting')}</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('settingKey')}
            </label>
            <input
              type="text"
              value={formData.setting_key}
              onChange={(e) => setFormData(prev => ({ ...prev, setting_key: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('type')}
            </label>
            <select
              value={formData.setting_type}
              onChange={(e) => setFormData(prev => ({ ...prev, setting_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="string">{t('typeString')}</option>
              <option value="integer">{t('typeInteger')}</option>
              <option value="decimal">{t('typeDecimal')}</option>
              <option value="boolean">{t('typeBoolean')}</option>
              <option value="json">{t('typeJson')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('value')}
            </label>
            <input
              type="text"
              value={formData.setting_value}
              onChange={(e) => setFormData(prev => ({ ...prev, setting_value: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('category')}
            </label>
            <select
              value={formData.setting_details.category}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                setting_details: { ...prev.setting_details, category: e.target.value }
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map(cat => (
                <option key={cat.name} value={cat.name}>{cat.name}</option>
              ))}
              <option value="General">{t('categoryGeneral')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('description')}
            </label>
            <textarea
              value={formData.setting_details.description}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                setting_details: { ...prev.setting_details, description: e.target.value }
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_public"
              checked={formData.is_public}
              onChange={(e) => setFormData(prev => ({ ...prev, is_public: e.target.checked }))}
              className="mr-2"
            />
            <label htmlFor="is_public" className="text-sm text-gray-700">
              {t('publicAccessible')}
            </label>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? t('creating') : t('createSetting')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700"
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SystemSettings() {
  const t = useTranslations('Settings');
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  const [settings, setSettings] = useState([]);
  const [settingsByCategory, setSettingsByCategory] = useState({});
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showNewSettingModal, setShowNewSettingModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch settings data
  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (selectedCategory) params.category = selectedCategory;

      const queryString = new URLSearchParams(params).toString();
      const endpoint = queryString ? `admin/settings?${queryString}` : 'admin/settings';
      
      const response = await apiRequest(endpoint);

      if (response.status === 'SUCCESS') {
        setSettings(response.keyValueTable.settings || []);
        setSettingsByCategory(response.keyValueTable.settingsByCategory || {});
      } else {
        throw new Error(response.message || t('fetchError'));
      }
    } catch (err) {
      console.error('Settings fetch error:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, selectedCategory]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const response = await apiRequest('admin/settings/categories/list');
      if (response.status === 'SUCCESS') {
        setCategories(response.keyValueTable.categories || []);
      }
    } catch (err) {
      console.error('Categories fetch error:', err);
    }
  }, []);

  // Update setting
  const updateSetting = async (settingKey, value, type, details) => {
    try {
      const response = await apiRequest(`admin/settings/${settingKey}`, {
        method: 'PUT',
        body: JSON.stringify({
          setting_value: value,
          setting_type: type,
          setting_details: details
        }),
      });

      if (response.status === 'SUCCESS') {
        await fetchSettings(); // Refresh settings
      } else {
        throw new Error(response.message || t('updateError'));
      }
    } catch (err) {
      console.error('Setting update error:', err);
      throw err;
    }
  };

  // Create new setting
  const createSetting = async (settingData) => {
    try {
      const response = await apiRequest(`admin/settings/${settingData.setting_key}`, {
        method: 'PUT',
        body: JSON.stringify(settingData),
      });

      if (response.status === 'SUCCESS') {
        await fetchSettings(); // Refresh settings
        await fetchCategories(); // Refresh categories
      } else {
        throw new Error(response.message || t('createError'));
      }
    } catch (err) {
      console.error('Setting creation error:', err);
      throw err;
    }
  };

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings();
      fetchCategories();
    }
  }, [isAuthenticated, fetchSettings, fetchCategories]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="admin-spinner"></div>
        <span className="ml-2">{t('loading')}</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="admin-container">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-semibold text-gray-900">
              {t('title')}
            </h1>
            <nav className="flex items-center space-x-4">
              <a
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                {t('dashboard')}
              </a>
              <span className="text-sm text-gray-600">
                {t('welcome', { name: user?.firstName || t('adminFallback') })}
              </span>
            </nav>
          </div>
        </div>
      </header>

      <main className="admin-container py-8">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('allCategories')}</option>
              {categories.map(category => (
                <option key={category.name} value={category.name}>
                  {category.name} ({category.settingCount})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowNewSettingModal(true)}
            className="admin-button admin-button-primary"
          >
            {t('addSetting')}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Settings Display */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="admin-spinner"></div>
            <span className="ml-2">{t('loadingSettings')}</span>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.keys(settingsByCategory).length > 0 ? (
              Object.entries(settingsByCategory).map(([category, categorySettings]) => (
                <SettingCategory
                  key={category}
                  category={category}
                  settings={categorySettings}
                  onSettingUpdate={updateSetting}
                  isLoading={isLoading}
                />
              ))
            ) : (
              <div className="admin-card text-center py-12">
                <p className="text-gray-500">{t('noSettingsFound')}</p>
                {(searchTerm || selectedCategory) && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCategory('');
                    }}
                    className="mt-2 text-blue-600 hover:text-blue-800"
                  >
                    {t('clearFilters')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* New Setting Modal */}
        <NewSettingModal
          isOpen={showNewSettingModal}
          onClose={() => setShowNewSettingModal(false)}
          onSave={createSetting}
          categories={categories}
        />
      </main>
    </div>
  );
}