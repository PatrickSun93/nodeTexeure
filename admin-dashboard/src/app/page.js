'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminDashboard() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleLogout = async () => {
    await logout();
    router.push('/login?logout=true');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="admin-spinner"></div>
        <span className="ml-2">Loading...</span>
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
              Admin Dashboard
            </h1>
            <nav className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {user?.firstName || 'Admin'}
              </span>
              <button 
                className="admin-button admin-button-secondary text-sm"
                onClick={handleLogout}
              >
                Logout
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="admin-container py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* KPI Cards - Placeholder for now */}
          <div className="admin-card">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Sales</h3>
            <p className="text-2xl font-bold text-gray-900">$0</p>
            <p className="text-xs text-gray-500 mt-1">+0% from last month</p>
          </div>
          
          <div className="admin-card">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Orders</h3>
            <p className="text-2xl font-bold text-gray-900">0</p>
            <p className="text-xs text-gray-500 mt-1">+0% from last month</p>
          </div>
          
          <div className="admin-card">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Customers</h3>
            <p className="text-2xl font-bold text-gray-900">0</p>
            <p className="text-xs text-gray-500 mt-1">+0% from last month</p>
          </div>
          
          <div className="admin-card">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Products</h3>
            <p className="text-2xl font-bold text-gray-900">0</p>
            <p className="text-xs text-gray-500 mt-1">Active products</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <button className="admin-button admin-button-primary p-4 text-left">
                <div className="text-sm font-medium">Add Product</div>
                <div className="text-xs opacity-75">Create new product</div>
              </button>
              <button className="admin-button admin-button-primary p-4 text-left">
                <div className="text-sm font-medium">View Orders</div>
                <div className="text-xs opacity-75">Manage orders</div>
              </button>
              <button className="admin-button admin-button-primary p-4 text-left">
                <div className="text-sm font-medium">Customers</div>
                <div className="text-xs opacity-75">Manage customers</div>
              </button>
              <button className="admin-button admin-button-primary p-4 text-left">
                <div className="text-sm font-medium">Reports</div>
                <div className="text-xs opacity-75">View analytics</div>
              </button>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
            <div className="space-y-3">
              <div className="text-sm text-gray-500 text-center py-8">
                No recent activity to display
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}