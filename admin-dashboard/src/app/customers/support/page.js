'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminCustomers, getErrorMessage } from '../../../lib/api';
import { useTranslations } from 'next-intl';

export default function CustomerSupportPage() {
  const t = useTranslations('CustomerSupport');
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    segment: '',
    page: 1,
    limit: 20,
    sortBy: 'last_login',
    sortOrder: 'desc'
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('support');
  const [addingNote, setAddingNote] = useState(false);

  // Fetch customers with support focus
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await adminCustomers.getCustomers(filters);
      
      if (response.status === 'SUCCESS') {
        setCustomers(response.keyValueTable.customers || []);
        setPagination(response.keyValueTable.pagination || {});
      } else {
        throw new Error(response.message || t('fetchError'));
      }
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  // Load customers on component mount and filter changes
  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : value
    }));
  };

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    fetchCustomers();
  };

  // Handle customer status update
  const handleStatusUpdate = async (customerId, newStatus, reason = '') => {
    try {
      await adminCustomers.updateCustomerStatus(customerId, newStatus, reason);
      await fetchCustomers(); // Refresh the list
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error updating customer status:', err);
    }
  };

  // Handle add note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim() || !selectedCustomer) return;

    try {
      setAddingNote(true);
      await adminCustomers.addCustomerNote(selectedCustomer.id, newNote.trim(), noteType);
      setNewNote('');
      setShowNoteModal(false);
      setSelectedCustomer(null);
      // Optionally refresh the customer list or show success message
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error adding note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  // Open note modal
  const openNoteModal = (customer) => {
    setSelectedCustomer(customer);
    setShowNoteModal(true);
    setNewNote('');
    setNoteType('support');
  };

  // Close note modal
  const closeNoteModal = () => {
    setShowNoteModal(false);
    setSelectedCustomer(null);
    setNewNote('');
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Get status badge color
  const getStatusBadgeColor = (status) => {
    const colors = {
      'active': 'bg-green-100 text-green-800',
      'inactive': 'bg-gray-100 text-gray-800',
      'suspended': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Get segment badge color
  const getSegmentBadgeColor = (segment) => {
    const colors = {
      'VIP': 'bg-purple-100 text-purple-800',
      'Loyal': 'bg-blue-100 text-blue-800',
      'Returning': 'bg-green-100 text-green-800',
      'One-time': 'bg-yellow-100 text-yellow-800',
      'New': 'bg-gray-100 text-gray-800'
    };
    return colors[segment] || 'bg-gray-100 text-gray-800';
  };

  // Get priority level based on customer data
  const getPriorityLevel = (customer) => {
    if (customer.segment === 'VIP' || customer.total_spent > 1000) return 'High';
    if (customer.segment === 'Loyal' || customer.total_orders > 5) return 'Medium';
    return 'Normal';
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    const colors = {
      'High': 'bg-red-100 text-red-800',
      'Medium': 'bg-yellow-100 text-yellow-800',
      'Normal': 'bg-green-100 text-green-800'
    };
    return colors[priority] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-semibold text-gray-900">
              {t('title')}
            </h1>
            <nav className="flex items-center space-x-4">
              <a
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                {t('navDashboard')}
              </a>
              <a
                href="/customers"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                {t('navCustomers')}
              </a>
              <a
                href="/customers/support"
                className="text-sm text-blue-600 px-3 py-2 rounded-md bg-blue-50"
              >
                {t('navSupport')}
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{t('title')}</h2>
          <p className="text-gray-600">{t('subtitle')}</p>
        </div>

        {/* Support Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 text-sm font-medium">!</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('highPriority')}</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {customers.filter(c => getPriorityLevel(c) === 'High').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-yellow-600 text-sm font-medium">⚠</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('mediumPriority')}</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {customers.filter(c => getPriorityLevel(c) === 'Medium').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 text-sm font-medium">⏸</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('suspended')}</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {customers.filter(c => c.status === 'suspended').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 text-sm font-medium">👑</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('vipCustomers')}</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {customers.filter(c => c.segment === 'VIP').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('searchCustomers')}
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('status')}
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('allStatuses')}</option>
                <option value="active">{t('statusActive')}</option>
                <option value="inactive">{t('statusInactive')}</option>
                <option value="suspended">{t('statusSuspended')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('segment')}
              </label>
              <select
                value={filters.segment}
                onChange={(e) => handleFilterChange('segment', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('allSegments')}</option>
                <option value="VIP">{t('segmentVIP')}</option>
                <option value="Loyal">{t('segmentLoyal')}</option>
                <option value="Returning">{t('segmentReturning')}</option>
                <option value="One-time">{t('segmentOneTime')}</option>
                <option value="New">{t('segmentNew')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('sortBy')}
              </label>
              <select
                value={`${filters.sortBy}_${filters.sortOrder}`}
                onChange={(e) => {
                  const [sortBy, sortOrder] = e.target.value.split('_');
                  handleFilterChange('sortBy', sortBy);
                  handleFilterChange('sortOrder', sortOrder);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="last_login_desc">{t('lastLogin')}</option>
                <option value="created_at_desc">{t('sortNewest')}</option>
                <option value="first_name_asc">{t('sortNameAsc')}</option>
                <option value="total_spent_desc">{t('sortHighestSpender')}</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {t('searchButton')}
              </button>
            </div>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Customers Support Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('columnCustomer')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('columnPriority')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('segment')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('totalSpent')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('lastLogin')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('supportActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                      {t('loading')}
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                      {t('noCustomers')}
                    </td>
                  </tr>
                ) : (
                  customers.map((customer) => {
                    const priority = getPriorityLevel(customer);
                    return (
                      <tr key={customer.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <span className="text-sm font-medium text-gray-600">
                                  {customer.first_name?.[0]}{customer.last_name?.[0]}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {customer.first_name} {customer.last_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {customer.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(priority)}`}>
                            {priority}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(customer.status)}`}>
                            {customer.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSegmentBadgeColor(customer.segment)}`}>
                            {customer.segment}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(customer.total_spent)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {customer.last_login ? formatDate(customer.last_login) : t('never')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => router.push(`/customers/${customer.id}`)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              {t('viewProfile')}
                            </button>
                            <button
                              onClick={() => openNoteModal(customer)}
                              className="text-green-600 hover:text-green-900"
                            >
                              {t('addNote')}
                            </button>
                            {customer.status === 'active' && (
                              <button
                                onClick={() => handleStatusUpdate(customer.id, 'suspended', 'Support action')}
                                className="text-red-600 hover:text-red-900"
                              >
                                {t('suspend')}
                              </button>
                            )}
                            {customer.status === 'suspended' && (
                              <button
                                onClick={() => handleStatusUpdate(customer.id, 'active', 'Support action')}
                                className="text-green-600 hover:text-green-900"
                              >
                                {t('activate')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => handleFilterChange('page', Math.max(1, pagination.page - 1))}
                  disabled={pagination.page <= 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('previous')}
                </button>
                <button
                  onClick={() => handleFilterChange('page', Math.min(pagination.totalPages, pagination.page + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('next')}
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    {t.rich('showingResults', {
                      from: ((pagination.page - 1) * pagination.limit) + 1,
                      to: Math.min(pagination.page * pagination.limit, pagination.total),
                      total: pagination.total,
                      medium: (chunks) => <span className="font-medium">{chunks}</span>
                    })}
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label={t('paginationAriaLabel')}>
                    <button
                      onClick={() => handleFilterChange('page', Math.max(1, pagination.page - 1))}
                      disabled={pagination.page <= 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('previous')}
                    </button>
                    
                    {/* Page numbers */}
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handleFilterChange('page', pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            pageNum === pagination.page
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => handleFilterChange('page', Math.min(pagination.totalPages, pagination.page + 1))}
                      disabled={pagination.page >= pagination.totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('next')}
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {t('addSupportNoteFor', { name: `${selectedCustomer?.first_name} ${selectedCustomer?.last_name}` })}
              </h3>
              <form onSubmit={handleAddNote} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('noteType')}
                  </label>
                  <select
                    value={noteType}
                    onChange={(e) => setNoteType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="support">{t('noteTypeSupport')}</option>
                    <option value="billing">{t('noteTypeBilling')}</option>
                    <option value="general">{t('noteTypeGeneral')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('note')}
                  </label>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={4}
                    placeholder={t('notePlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={closeNoteModal}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={!newNote.trim() || addingNote}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingNote ? t('adding') : t('addNote')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}