'use client';

import { useState } from 'react';
import {
  useBackendHealth,
  useUsers,
  useForm,
  useMessage,
  useHelloAPI,
  useDatabaseStatus,
  useDatabaseTables,
  useTransnoData,
  validateUserData,
  confirmAction,
  CSS_CLASSES,
  MESSAGES,
} from '../lib';

export default function Home() {
  // Use custom hooks for cleaner state management
  const { status: backendStatus, isConnected } = useBackendHealth();
  const { users, loading: usersLoading, createUser, deleteUser } = useUsers();
  const { message, messageType, showSuccess, showError } = useMessage();
  const { testHello, loading: helloLoading } = useHelloAPI();
  const { status: dbStatus, loading: dbStatusLoading, error: dbStatusError, checkDatabaseStatus } = useDatabaseStatus();
  const { tableInfo, loading: tableLoading, error: tableError, fetchTableInfo } = useDatabaseTables();
  const { transnoData, loading: transnoLoading, error: transnoError, fetchTransnoData } = useTransnoData();
  
  // Form management with validation
  const {
    values: newUser,
    errors: formErrors,
    isSubmitting,
    handleChange,
    handleBlur,
    reset: resetForm,
    handleSubmit,
  } = useForm(
    { name: '', email: '' },
    validateUserData
  );

  // Handle user creation
  const handleCreateUser = async (e) => {
    e.preventDefault();
    
    const result = await handleSubmit(async (userData) => {
      return await createUser(userData);
    });
    
    if (result.success) {
      showSuccess(result.message);
      resetForm();
    } else {
      showError(result.message);
    }
  };

  // Handle user deletion with confirmation
  const handleDeleteUser = async (userId) => {
    if (!confirmAction(MESSAGES.CONFIRMATION.DELETE_USER)) return;
    
    const result = await deleteUser(userId);
    if (result.success) {
      showSuccess(result.message);
    } else {
      showError(result.message);
    }
  };

  // Handle hello API test
  const handleTestHello = async () => {
    const result = await testHello();
    if (result.success) {
      showSuccess(result.message);
    } else {
      showError(result.message);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Next.js Frontend with Separate Node.js Backend
          </h1>
          <p className="text-lg text-gray-600">
            Full-stack application with separate backend server on port 6666
          </p>
          <div className="mt-4 p-3 bg-gray-100 rounded-lg">
            <p className="text-sm font-medium text-gray-700">
              Backend Status: <span className={isConnected ? CSS_CLASSES.STATUS.CONNECTED : CSS_CLASSES.STATUS.DISCONNECTED}>{backendStatus}</span>
            </p>
          </div>
        </div>

        {/* Message Display */}
        {message && (
          <div className={`mb-6 ${CSS_CLASSES.MESSAGE[messageType.toUpperCase()]}`}>
            {message}
          </div>
        )}

        {/* API Test Section */}
        <div className={CSS_CLASSES.CARD.DEFAULT + " mb-8"}>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">API Testing</h2>
          <button
            onClick={handleTestHello}
            disabled={helloLoading}
            className={helloLoading ? CSS_CLASSES.BUTTON.DISABLED : CSS_CLASSES.BUTTON.SUCCESS}
          >
            {helloLoading ? 'Testing...' : 'Test Hello API'}
          </button>
        </div>

        {/* Database Status Section */}
        <div className={CSS_CLASSES.CARD.DEFAULT + " mb-8"}>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Database Status</h2>
          <div className="bg-white p-4 rounded-lg shadow">
            {dbStatusLoading ? (
              <p>Checking database connection...</p>
            ) : dbStatusError ? (
              <div className="text-red-500">
                <p>Error: {dbStatusError}</p>
                <button
                  onClick={checkDatabaseStatus}
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div>
                <p>
                  Connection: <span className={`font-medium ${dbStatus?.connected ? 'text-green-500' : 'text-red-500'}`}>
                    {dbStatus?.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </p>
                {dbStatus?.connected && (
                  <>
                    <p>
                      MySQL Version: <span className="font-medium">{dbStatus?.version}</span>
                    </p>
                    <p>
                      Database: <span className="font-medium">{dbStatus?.database}</span>
                    </p>
                    <button
                      onClick={checkDatabaseStatus}
                      className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                    >
                      Refresh
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Database Tables Section */}
        <div className={CSS_CLASSES.CARD.DEFAULT + " mb-8"}>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Database Tables</h2>
          <div className="bg-white p-4 rounded-lg shadow">
            {tableLoading ? (
              <p>Loading table information...</p>
            ) : tableError ? (
              <div className="text-red-500">
                <p>Error: {tableError}</p>
                <button
                  onClick={fetchTableInfo}
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div>
                <p>
                  Total Tables: <span className="font-medium">{tableInfo?.count}</span>
                </p>
                {tableInfo?.tables && (
                  <div className="mt-2">
                    <p className="font-medium mb-1">Table List:</p>
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                      <ul className="list-disc pl-5">
                        {tableInfo.tables.map((table, index) => (
                          <li key={index}>{table}</li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={fetchTableInfo}
                      className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Transno Table Data Section */}
        <div className={CSS_CLASSES.CARD.DEFAULT + " mb-8"}>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Transno Table Data</h2>
          <div className="bg-white p-4 rounded-lg shadow">
            {transnoLoading ? (
              <p>Loading transno data...</p>
            ) : transnoError ? (
              <div className="text-red-500">
                <p>Error: {transnoError}</p>
                <button
                  onClick={fetchTransnoData}
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div>
                {transnoData?.rows && transnoData.rows.length > 0 ? (
                  <div>
                    <p className="mb-2">Total Records: <span className="font-medium">{transnoData.rows.length}</span></p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border border-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {Object.keys(transnoData.rows[0]).map((key) => (
                              <th key={key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {transnoData.rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              {Object.values(row).map((value, cellIndex) => (
                                <td key={cellIndex} className="px-4 py-2 text-sm text-gray-500 border-b">
                                  {value === null ? 'NULL' : String(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={fetchTransnoData}
                      className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                    >
                      Refresh
                    </button>
                  </div>
                ) : (
                  <div>
                    <p>No data found in transno table.</p>
                    <button
                      onClick={fetchTransnoData}
                      className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Create User Form */}
        <div className={CSS_CLASSES.CARD.DEFAULT + " mb-8"}>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Create New User</h2>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={newUser.name}
                onChange={handleChange}
                onBlur={handleBlur}
                className={formErrors.name ? CSS_CLASSES.INPUT.ERROR : CSS_CLASSES.INPUT.DEFAULT}
                placeholder="Enter user name"
              />
              {formErrors.name && (
                <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
              )}
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={newUser.email}
                onChange={handleChange}
                onBlur={handleBlur}
                className={formErrors.email ? CSS_CLASSES.INPUT.ERROR : CSS_CLASSES.INPUT.DEFAULT}
                placeholder="Enter user email"
              />
              {formErrors.email && (
                <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={isSubmitting || usersLoading}
              className={isSubmitting || usersLoading ? CSS_CLASSES.BUTTON.DISABLED : CSS_CLASSES.BUTTON.PRIMARY}
            >
              {isSubmitting ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>

        {/* Users List */}
        <div className={CSS_CLASSES.CARD.DEFAULT}>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Users List</h2>
          {usersLoading ? (
            <p className="text-gray-500">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="text-gray-500">No users found. Create one above!</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div>
                    <h3 className="font-medium text-gray-900">{user.name}</h3>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    disabled={usersLoading}
                    className={usersLoading ? CSS_CLASSES.BUTTON.DISABLED : CSS_CLASSES.BUTTON.DANGER}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* API Documentation */}
        <div className={CSS_CLASSES.CARD.DEFAULT + " mt-8"}>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Available API Endpoints</h2>
          <div className="space-y-2 text-sm">
            <p className="text-gray-600 mb-3">Backend Server: <code className="bg-gray-100 px-2 py-1 rounded">http://localhost:6666</code></p>
            <div className="flex items-center space-x-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono">GET</span>
              <span className="font-mono">/api/status/health</span>
              <span className="text-gray-600">- Backend health check</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono">GET</span>
              <span className="font-mono">/api/database/test</span>
              <span className="text-gray-600">- Test database connection</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono">GET</span>
              <span className="font-mono">/api/database/tables</span>
              <span className="text-gray-600">- Get database table count and list</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono">GET</span>
              <span className="font-mono">/api/database/transno</span>
              <span className="text-gray-600">- Get transno table data</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">POST</span>
              <span className="font-mono">/api/database/query</span>
              <span className="text-gray-600">- Execute custom SELECT queries</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono">GET</span>
              <span className="font-mono">/api/status/hello</span>
              <span className="text-gray-600">- Basic hello world endpoint</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">POST</span>
              <span className="font-mono">/api/status/hello</span>
              <span className="text-gray-600">- Personalized hello endpoint</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono">GET</span>
              <span className="font-mono">/api/users</span>
              <span className="text-gray-600">- Get all users</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">POST</span>
              <span className="font-mono">/api/users</span>
              <span className="text-gray-600">- Create a new user</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono">GET</span>
              <span className="font-mono">/api/users/[id]</span>
              <span className="text-gray-600">- Get specific user</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-mono">PUT</span>
              <span className="font-mono">/api/users/[id]</span>
              <span className="text-gray-600">- Update specific user</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-red-100 text-red-800 px-2 py-1 rounded font-mono">DELETE</span>
              <span className="font-mono">/api/users/[id]</span>
              <span className="text-gray-600">- Delete specific user</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
