'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getErrorMessage } from '@/lib/api';
import { useTranslations } from 'next-intl';

// User Role Badge Component
function UserRoleBadge({ role }) {
  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'staff':
        return 'bg-blue-100 text-blue-800';
      case 'customer':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(role)}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

// User Status Badge Component
function UserStatusBadge({ isDeleted, emailVerified }) {
  const t = useTranslations('Users');

  if (isDeleted) {
    return (
      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
        {t('statusDeleted')}
      </span>
    );
  }

  return (
    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
      emailVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
    }`}>
      {emailVerified ? t('verified') : t('unverified')}
    </span>
  );
}

// User Actions Component
function UserActions({ user, onRoleChange, onStatusChange, currentUser }) {
  const t = useTranslations('Users');
  const [showActions, setShowActions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const canModifyUser = currentUser?.role === 'admin' && user.id !== currentUser.id;

  const handleRoleChange = async (newRole) => {
    if (!canModifyUser) return;
    
    setIsLoading(true);
    try {
      await onRoleChange(user.id, newRole);
      setShowActions(false);
    } catch (error) {
      console.error('Failed to change role:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!canModifyUser) return;
    
    setIsLoading(true);
    try {
      await onStatusChange(user.id, !user.isDeleted);
      setShowActions(false);
    } catch (error) {
      console.error('Failed to change status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!canModifyUser) {
    return (
      <span className="text-xs text-gray-400">
        {user.id === currentUser?.id ? t('currentUser') : t('noAccess')}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowActions(!showActions)}
        disabled={isLoading}
        className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
      >
        {isLoading ? t('loading') : t('actions')}
      </button>
      
      {showActions && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
          <div className="py-1">
            <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b">
              {t('changeRole')}
            </div>
            {['admin', 'staff', 'customer'].map(role => (
              <button
                key={role}
                onClick={() => handleRoleChange(role)}
                disabled={user.role === role}
                className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
                {user.role === role && t('currentSuffix')}
              </button>
            ))}
            
            <div className="border-t mt-1 pt-1">
              <button
                onClick={handleStatusToggle}
                className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                {user.isDeleted ? t('restoreUser') : t('deleteUser')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// New User Modal Component
function NewUserModal({ isOpen, onClose, onSave }) {
  const t = useTranslations('Users');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'customer'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.email) newErrors.email = t('emailRequired');
    if (!formData.password || formData.password.length < 6) {
      newErrors.password = t('passwordMinLength');
    }
    if (!formData.firstName) newErrors.firstName = t('firstNameRequired');
    if (!formData.lastName) newErrors.lastName = t('lastNameRequired');
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      await onSave(formData);
      setFormData({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        phone: '',
        role: 'customer'
      });
      setErrors({});
      onClose();
    } catch (error) {
      console.error('Failed to create user:', error);
      setErrors({ submit: getErrorMessage(error) });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{t('addNewUser')}</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('email')} *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.email ? 'border-red-300' : 'border-gray-300'
              }`}
              required
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('password')} *
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.password ? 'border-red-300' : 'border-gray-300'
              }`}
              required
            />
            {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('firstName')} *
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.firstName ? 'border-red-300' : 'border-gray-300'
                }`}
                required
              />
              {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('lastName')} *
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.lastName ? 'border-red-300' : 'border-gray-300'
                }`}
                required
              />
              {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('phone')}
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('role')}
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="customer">{t('roleCustomer')}</option>
              <option value="staff">{t('roleStaff')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
          </div>

          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? t('creating') : t('createUser')}
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

export default function UserManagement() {
  const t = useTranslations('Users');
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showNewUserModal, setShowNewUserModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch users data
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = {
        page: currentPage,
        limit: 20
      };
      
      if (searchTerm) params.search = searchTerm;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;

      const queryString = new URLSearchParams(params).toString();
      const endpoint = queryString ? `admin/users?${queryString}` : 'admin/users';
      
      const response = await apiRequest(endpoint);

      if (response.status === 'SUCCESS') {
        setUsers(response.keyValueTable.users || []);
        setTotalPages(response.keyValueTable.pagination?.totalPages || 1);
      } else {
        throw new Error(response.message || t('fetchError'));
      }
    } catch (err) {
      console.error('Users fetch error:', err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchTerm, roleFilter, statusFilter, t]);

  // Change user role
  const changeUserRole = async (userId, newRole) => {
    try {
      const response = await apiRequest(`admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });

      if (response.status === 'SUCCESS') {
        await fetchUsers(); // Refresh users list
      } else {
        throw new Error(response.message || t('roleChangeError'));
      }
    } catch (err) {
      console.error('Role change error:', err);
      throw err;
    }
  };

  // Change user status (delete/restore)
  const changeUserStatus = async (userId, isDeleted) => {
    try {
      const response = await apiRequest(`admin/users/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ isDeleted }),
      });

      if (response.status === 'SUCCESS') {
        await fetchUsers(); // Refresh users list
      } else {
        throw new Error(response.message || t('statusChangeError'));
      }
    } catch (err) {
      console.error('Status change error:', err);
      throw err;
    }
  };

  // Create new user
  const createUser = async (userData) => {
    try {
      const response = await apiRequest('admin/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      });

      if (response.status === 'SUCCESS') {
        await fetchUsers(); // Refresh users list
      } else {
        throw new Error(response.message || t('createError'));
      }
    } catch (err) {
      console.error('User creation error:', err);
      throw err;
    }
  };

  // Initial data fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
    }
  }, [isAuthenticated, fetchUsers]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, statusFilter]);

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
                {t('navDashboard')}
              </a>
              <a 
                href="/settings"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                {t('navSettings')}
              </a>
              <span className="text-sm text-gray-600">
                {t('welcome', { name: user?.firstName || 'Admin' })}
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
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('allRoles')}</option>
              <option value="admin">{t('roleAdmin')}</option>
              <option value="staff">{t('roleStaff')}</option>
              <option value="customer">{t('roleCustomer')}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('allStatus')}</option>
              <option value="active">{t('statusActive')}</option>
              <option value="deleted">{t('statusDeleted')}</option>
            </select>
          </div>
          {user?.role === 'admin' && (
            <button
              onClick={() => setShowNewUserModal(true)}
              className="admin-button admin-button-primary"
            >
              {t('addUser')}
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Users Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="admin-spinner"></div>
            <span className="ml-2">{t('loadingUsers')}</span>
          </div>
        ) : (
          <div className="admin-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('columnUser')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('role')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('columnOrders')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('columnCreated')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('lastLogin')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('columnActions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.length > 0 ? (
                    users.map((userItem) => (
                      <tr key={userItem.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {userItem.first_name} {userItem.last_name}
                            </div>
                            <div className="text-sm text-gray-500">{userItem.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <UserRoleBadge role={userItem.role} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <UserStatusBadge 
                            isDeleted={userItem.isDeleted} 
                            emailVerified={userItem.email_verified} 
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {userItem.order_count || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(userItem.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {userItem.last_login 
                            ? new Date(userItem.last_login).toLocaleDateString()
                            : t('never')
                          }
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <UserActions
                            user={userItem}
                            currentUser={user}
                            onRoleChange={changeUserRole}
                            onStatusChange={changeUserStatus}
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                        {t('noUsers')}
                        {(searchTerm || roleFilter || statusFilter) && (
                          <button
                            onClick={() => {
                              setSearchTerm('');
                              setRoleFilter('');
                              setStatusFilter('');
                            }}
                            className="ml-2 text-blue-600 hover:text-blue-800"
                          >
                            {t('clearFilters')}
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  {t('pageOf', { current: currentPage, total: totalPages })}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('previous')}
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('next')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* New User Modal */}
        <NewUserModal
          isOpen={showNewUserModal}
          onClose={() => setShowNewUserModal(false)}
          onSave={createUser}
        />
      </main>
    </div>
  );
}