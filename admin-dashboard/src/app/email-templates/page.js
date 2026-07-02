'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getErrorMessage } from '@/lib/api';
import { useTranslations } from 'next-intl';

// Template Status Badge Component
function TemplateStatusBadge({ isActive }) {
  const t = useTranslations('EmailTemplates');
  return (
    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
      isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      {isActive ? t('statusActive') : t('statusInactive')}
    </span>
  );
}

// Template Editor Modal Component
function TemplateEditorModal({ isOpen, onClose, onSave, template = null }) {
  const t = useTranslations('EmailTemplates');
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    template_content: {
      html_content: '',
      text_content: '',
      variables: [],
      styling: {},
      metadata: {}
    },
    is_active: true
  });
  const [activeTab, setActiveTab] = useState('html');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Initialize form data when template changes
  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name || '',
        subject: template.subject || '',
        template_content: {
          html_content: template.template_content?.html_content || '',
          text_content: template.template_content?.text_content || '',
          variables: template.template_content?.variables || [],
          styling: template.template_content?.styling || {},
          metadata: template.template_content?.metadata || {}
        },
        is_active: template.is_active !== undefined ? template.is_active : true
      });
    } else {
      setFormData({
        name: '',
        subject: '',
        template_content: {
          html_content: '',
          text_content: '',
          variables: [],
          styling: {},
          metadata: {}
        },
        is_active: true
      });
    }
    setErrors({});
  }, [template]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name) newErrors.name = t('templateNameRequired');
    if (!formData.subject) newErrors.subject = t('subjectRequired');
    if (!formData.template_content.html_content && !formData.template_content.text_content) {
      newErrors.content = t('contentRequired');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      await onSave(formData, template?.id);
      onClose();
    } catch (error) {
      console.error('Failed to save template:', error);
      setErrors({ submit: getErrorMessage(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const updateTemplateContent = (field, value) => {
    setFormData(prev => ({
      ...prev,
      template_content: {
        ...prev.template_content,
        [field]: value
      }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">
            {template ? t('editTitle') : t('createTitle')}
          </h3>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('templateNameLabel')}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  required
                />
                {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('subjectLabel')}
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.subject ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder={t('subjectPlaceholder')}
                  required
                />
                {errors.subject && <p className="text-xs text-red-600 mt-1">{errors.subject}</p>}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="mr-2"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  {t('activeTemplate')}
                </label>
              </div>
            </div>

            {/* Content Tabs */}
            <div className="mb-4">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    type="button"
                    onClick={() => setActiveTab('html')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'html'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {t('tabHtml')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'text'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {t('tabText')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('variables')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'variables'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {t('tabVariables')}
                  </button>
                </nav>
              </div>

              <div className="mt-4">
                {activeTab === 'html' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('htmlContentLabel')}
                    </label>
                    <textarea
                      value={formData.template_content.html_content}
                      onChange={(e) => updateTemplateContent('html_content', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      rows={12}
                      placeholder={t('htmlContentPlaceholder')}
                    />
                  </div>
                )}

                {activeTab === 'text' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('textContentLabel')}
                    </label>
                    <textarea
                      value={formData.template_content.text_content}
                      onChange={(e) => updateTemplateContent('text_content', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={12}
                      placeholder={t('textContentPlaceholder')}
                    />
                  </div>
                )}

                {activeTab === 'variables' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('availableVariables')}
                    </label>
                    <div className="bg-gray-50 p-4 rounded-md">
                      <p className="text-sm text-gray-600 mb-2">
                        {t('commonVariables')}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><code className="bg-white px-2 py-1 rounded">{'{{customer_name}}'}</code></div>
                        <div><code className="bg-white px-2 py-1 rounded">{'{{order_number}}'}</code></div>
                        <div><code className="bg-white px-2 py-1 rounded">{'{{order_total}}'}</code></div>
                        <div><code className="bg-white px-2 py-1 rounded">{'{{order_date}}'}</code></div>
                        <div><code className="bg-white px-2 py-1 rounded">{'{{tracking_number}}'}</code></div>
                        <div><code className="bg-white px-2 py-1 rounded">{'{{company_name}}'}</code></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {errors.content && (
              <p className="text-sm text-red-600 mb-4">{errors.content}</p>
            )}

            {errors.submit && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{errors.submit}</p>
              </div>
            )}
          </div>

          <div className="p-6 border-t flex space-x-3">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? t('saving') : (template ? t('updateTemplate') : t('createTemplate'))}
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

// Test Email Modal Component
function TestEmailModal({ isOpen, onClose, template, onSendTest }) {
  const t = useTranslations('EmailTemplates');
  const [testEmail, setTestEmail] = useState('');
  const [testData, setTestData] = useState('{}');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!testEmail) {
      setError(t('testEmailRequired'));
      return;
    }

    let parsedTestData = {};
    try {
      parsedTestData = JSON.parse(testData);
    } catch (err) {
      setError(t('invalidJson'));
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      await onSendTest(template.id, testEmail, parsedTestData);
      onClose();
      setTestEmail('');
      setTestData('{}');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !template) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">{t('sendTestEmail')}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('templateLabelValue', { name: template.name })}
            </label>
            <p className="text-sm text-gray-500">{template.subject}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('testEmailAddressLabel')}
            </label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('testDataLabel')}
            </label>
            <textarea
              value={testData}
              onChange={(e) => setTestData(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              rows={4}
              placeholder={t('testDataPlaceholder')}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? t('sending') : t('sendTest')}
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

export default function EmailTemplates() {
  const t = useTranslations('EmailTemplates');
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [testingTemplate, setTestingTemplate] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch templates data
  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (activeFilter) params.active = activeFilter;

      const queryString = new URLSearchParams(params).toString();
      const endpoint = queryString ? `admin/email-templates?${queryString}` : 'admin/email-templates';
      
      const response = await apiRequest(endpoint);

      if (response.status === 'SUCCESS') {
        setTemplates(response.keyValueTable.templates || []);
      } else {
        throw new Error(response.message || t('failedToFetch'));
      }
    } catch (err) {
      console.error('Templates fetch error:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, activeFilter, t]);

  // Save template (create or update)
  const saveTemplate = async (templateData, templateId = null) => {
    try {
      let response;
      if (templateId) {
        // Update existing template
        response = await apiRequest(`admin/email-templates/${templateId}`, {
          method: 'PUT',
          body: JSON.stringify(templateData),
        });
      } else {
        // Create new template
        response = await apiRequest('admin/email-templates', {
          method: 'POST',
          body: JSON.stringify(templateData),
        });
      }

      if (response.status === 'SUCCESS') {
        await fetchTemplates(); // Refresh templates
        setShowEditorModal(false);
        setEditingTemplate(null);
      } else {
        throw new Error(response.message || t('failedToSave'));
      }
    } catch (err) {
      console.error('Template save error:', err);
      throw err;
    }
  };

  // Delete template
  const deleteTemplate = async (templateId) => {
    if (!confirm(t('confirmDelete'))) return;

    try {
      const response = await apiRequest(`admin/email-templates/${templateId}`, {
        method: 'DELETE',
      });

      if (response.status === 'SUCCESS') {
        await fetchTemplates(); // Refresh templates
      } else {
        throw new Error(response.message || t('failedToDelete'));
      }
    } catch (err) {
      console.error('Template delete error:', err);
      setError(getErrorMessage(err));
    }
  };

  // Send test email
  const sendTestEmail = async (templateId, testEmail, testData) => {
    try {
      const response = await apiRequest(`admin/email-templates/${templateId}/test`, {
        method: 'POST',
        body: JSON.stringify({ testEmail, testData }),
      });

      if (response.status === 'SUCCESS') {
        alert(t('testEmailQueued'));
      } else {
        throw new Error(response.message || t('failedToSendTest'));
      }
    } catch (err) {
      console.error('Test email error:', err);
      throw err;
    }
  };

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchTemplates();
    }
  }, [isAuthenticated, fetchTemplates]);

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setShowEditorModal(true);
  };

  const handleTestTemplate = (template) => {
    setTestingTemplate(template);
    setShowTestModal(true);
  };

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
              <a
                href="/settings"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                {t('settings')}
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
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('filterAll')}</option>
              <option value="true">{t('filterActiveOnly')}</option>
              <option value="false">{t('filterInactiveOnly')}</option>
            </select>
          </div>
          {user?.role === 'admin' && (
            <button
              onClick={() => {
                setEditingTemplate(null);
                setShowEditorModal(true);
              }}
              className="admin-button admin-button-primary"
            >
              {t('createTemplate')}
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Templates Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="admin-spinner"></div>
            <span className="ml-2">{t('loadingTemplates')}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.length > 0 ? (
              templates.map((template) => (
                <div key={template.id} className="admin-card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900 mb-1">
                        {template.name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        {template.subject}
                      </p>
                    </div>
                    <TemplateStatusBadge isActive={template.is_active} />
                  </div>

                  <div className="text-xs text-gray-500 mb-4">
                    {t('createdLabel')} {new Date(template.created_at).toLocaleDateString()}
                    {template.updated_at !== template.created_at && (
                      <span className="block">
                        {t('updatedLabel')} {new Date(template.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEditTemplate(template)}
                      className="flex-1 text-xs px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      {t('edit')}
                    </button>
                    <button
                      onClick={() => handleTestTemplate(template)}
                      className="flex-1 text-xs px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      {t('test')}
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        className="text-xs px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        {t('delete')}
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full">
                <div className="admin-card text-center py-12">
                  <p className="text-gray-500">{t('noTemplatesFound')}</p>
                  {(searchTerm || activeFilter) && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setActiveFilter('');
                      }}
                      className="mt-2 text-blue-600 hover:text-blue-800"
                    >
                      {t('clearFilters')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Template Editor Modal */}
        <TemplateEditorModal
          isOpen={showEditorModal}
          onClose={() => {
            setShowEditorModal(false);
            setEditingTemplate(null);
          }}
          onSave={saveTemplate}
          template={editingTemplate}
        />

        {/* Test Email Modal */}
        <TestEmailModal
          isOpen={showTestModal}
          onClose={() => {
            setShowTestModal(false);
            setTestingTemplate(null);
          }}
          template={testingTemplate}
          onSendTest={sendTestEmail}
        />
      </main>
    </div>
  );
}