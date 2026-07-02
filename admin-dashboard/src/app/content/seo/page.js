'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function SEOManagement() {
  const t = useTranslations('SeoSettings');
  const [activeTab, setActiveTab] = useState('analysis');
  const [analysis, setAnalysis] = useState([]);
  const [suggestions, setSuggestions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    type: 'all',
    minScore: 0,
    maxScore: 100
  });
  const [bulkUpdates, setBulkUpdates] = useState({});

  useEffect(() => {
    if (activeTab === 'analysis') {
      fetchSEOAnalysis();
    } else if (activeTab === 'suggestions') {
      fetchSEOSuggestions();
    }
  }, [activeTab, filters]);

  const fetchSEOAnalysis = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error(t('noAuthToken'));
      }

      const queryParams = new URLSearchParams();
      if (filters.type !== 'all') {
        queryParams.append('type', filters.type);
      }

      const response = await fetch(`http://localhost:6666/api/admin/content/seo/analysis?${queryParams}`, {
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
        let analysisData = data.keyValueTable?.analysis || [];

        // Apply score filters
        analysisData = analysisData.filter(item =>
          item.score >= filters.minScore && item.score <= filters.maxScore
        );

        setAnalysis(analysisData);
      } else {
        throw new Error(data.message || t('failedToFetchAnalysis'));
      }
    } catch (error) {
      console.error('Error fetching SEO analysis:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSEOSuggestions = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error(t('noAuthToken'));
      }

      const response = await fetch('http://localhost:6666/api/admin/content/seo/suggestions', {
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
        setSuggestions(data.keyValueTable?.suggestions || {});
      } else {
        throw new Error(data.message || t('failedToFetchSuggestions'));
      }
    } catch (error) {
      console.error('Error fetching SEO suggestions:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpdateChange = (itemId, field, value) => {
    setBulkUpdates(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  const handleBulkUpdate = async () => {
    const updates = Object.entries(bulkUpdates)
      .filter(([itemId, updates]) => Object.keys(updates).length > 0)
      .map(([itemId, updates]) => {
        const item = analysis.find(a => a.id === itemId);
        return {
          id: itemId,
          content_type: item.content_type,
          ...updates
        };
      });

    if (updates.length === 0) {
      setError(t('noUpdatesToApply'));
      return;
    }

    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error(t('noAuthToken'));
      }

      const response = await fetch('http://localhost:6666/api/admin/content/seo/bulk-update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      });

      if (!response.ok) {
        throw new Error(t('httpError', { status: response.status }));
      }

      const data = await response.json();

      if (data.success) {
        setBulkUpdates({});
        fetchSEOAnalysis(); // Refresh the analysis
      } else {
        throw new Error(data.message || t('failedToUpdateSettings'));
      }
    } catch (error) {
      console.error('Error updating SEO settings:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    if (score >= 40) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  const renderAnalysis = () => (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-4">{t('filters')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('contentType')}</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">{t('allContent')}</option>
              <option value="pages">{t('pagesOnly')}</option>
              <option value="products">{t('productsOnly')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('minScore')}</label>
            <input
              type="number"
              min="0"
              max="100"
              value={filters.minScore}
              onChange={(e) => setFilters(prev => ({ ...prev, minScore: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('maxScore')}</label>
            <input
              type="number"
              min="0"
              max="100"
              value={filters.maxScore}
              onChange={(e) => setFilters(prev => ({ ...prev, maxScore: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Bulk Update Actions */}
      {Object.keys(bulkUpdates).length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-blue-900">{t('bulkUpdatesReady')}</h3>
              <p className="text-sm text-blue-700">
                {t('itemsPendingUpdates', { count: Object.keys(bulkUpdates).length })}
              </p>
            </div>
            <div className="space-x-2">
              <button
                onClick={() => setBulkUpdates({})}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleBulkUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {t('applyUpdates')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {loading ? (
        <div className="text-center py-8">{t('loadingAnalysis')}</div>
      ) : analysis.length === 0 ? (
        <div className="text-center py-8 text-gray-500">{t('noContentFound')}</div>
      ) : (
        <div className="space-y-4">
          {analysis.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getScoreColor(item.score)}`}>
                      {t('score', { score: item.score })}
                    </span>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                      {item.content_type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{item.url}</p>
                </div>
              </div>

              {/* Issues */}
              {item.issues.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-red-700 mb-2">{t('issuesFound')}</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {item.issues.map((issue, index) => (
                      <li key={index} className="text-sm text-red-600">{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {item.recommendations.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-blue-700 mb-2">{t('recommendations')}</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {item.recommendations.map((rec, index) => (
                      <li key={index} className="text-sm text-blue-600">{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quick Edit Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('metaTitle')}</label>
                  <input
                    type="text"
                    placeholder={t('enterMetaTitle')}
                    value={bulkUpdates[item.id]?.meta_title || ''}
                    onChange={(e) => handleBulkUpdateChange(item.id, 'meta_title', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('metaDescription')}</label>
                  <input
                    type="text"
                    placeholder={t('enterMetaDescription')}
                    value={bulkUpdates[item.id]?.meta_description || ''}
                    onChange={(e) => handleBulkUpdateChange(item.id, 'meta_description', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('metaKeywords')}</label>
                  <input
                    type="text"
                    placeholder={t('keywordsPlaceholder')}
                    value={bulkUpdates[item.id]?.meta_keywords || ''}
                    onChange={(e) => handleBulkUpdateChange(item.id, 'meta_keywords', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSuggestions = () => (
    <div className="space-y-6">
      {loading ? (
        <div className="text-center py-8">{t('loadingSuggestions')}</div>
      ) : (
        <div className="grid gap-6">
          {Object.entries(suggestions).map(([key, section]) => (
            <div key={key} className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{section.title}</h3>
              <ul className="space-y-2">
                {section.tips.map((tip, index) => (
                  <li key={index} className="flex items-start">
                    <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3"></span>
                    <span className="text-gray-700">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('seoManagement')}</h1>
        <p className="text-gray-600">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'analysis', label: t('tabAnalysis') },
            { key: 'suggestions', label: t('tabBestPractices') }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'analysis' && renderAnalysis()}
      {activeTab === 'suggestions' && renderSuggestions()}
    </div>
  );
}
