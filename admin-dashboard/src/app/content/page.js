'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ContentManagement() {
  const [activeTab, setActiveTab] = useState('pages');
  const [pages, setPages] = useState([]);
  const [menus, setMenus] = useState([]);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchContentData();
  }, [activeTab]);

  const fetchContentData = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      let endpoint = '';
      switch (activeTab) {
        case 'pages':
          endpoint = '/api/admin/content/pages';
          break;
        case 'menus':
          endpoint = '/api/admin/content/menus';
          break;
        case 'banners':
          endpoint = '/api/admin/content/banners';
          break;
        default:
          endpoint = '/api/admin/content/pages';
      }

      const response = await fetch(`http://localhost:6666${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        switch (activeTab) {
          case 'pages':
            setPages(data.keyValueTable?.pages || []);
            break;
          case 'menus':
            setMenus(data.keyValueTable?.menus || []);
            break;
          case 'banners':
            setBanners(data.keyValueTable?.banners || []);
            break;
        }
      } else {
        throw new Error(data.message || 'Failed to fetch data');
      }
    } catch (error) {
      console.error('Error fetching content data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (type, id) => {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`http://localhost:6666/api/admin/content/${type}/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        fetchContentData(); // Refresh the list
      } else {
        throw new Error(data.message || 'Failed to delete item');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      setError(error.message);
    }
  };

  const renderPages = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Pages & Blog Posts</h3>
        <Link 
          href="/content/pages/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create New Page
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading pages...</div>
      ) : pages.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No pages found</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Author
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{page.title}</div>
                    <div className="text-sm text-gray-500">/{page.slug}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      page.page_type === 'blog' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {page.page_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      page.status === 'published' 
                        ? 'bg-green-100 text-green-800' 
                        : page.status === 'draft'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {page.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {page.first_name} {page.last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(page.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <Link 
                      href={`/content/pages/${page.id}/edit`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete('pages', page.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderMenus = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Navigation Menus</h3>
        <Link 
          href="/content/menus/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create New Menu
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading menus...</div>
      ) : menus.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No menus found</div>
      ) : (
        <div className="grid gap-4">
          {menus.map((menu) => (
            <div key={menu.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">{menu.name}</h4>
                  <p className="text-sm text-gray-500">Location: {menu.location}</p>
                  <p className="text-sm text-gray-500">
                    Status: {menu.is_active ? 'Active' : 'Inactive'}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Link 
                    href={`/content/menus/${menu.id}/edit`}
                    className="text-blue-600 hover:text-blue-900 text-sm"
                  >
                    Edit Menu
                  </Link>
                  <Link 
                    href={`/content/menus/${menu.id}/items`}
                    className="text-green-600 hover:text-green-900 text-sm"
                  >
                    Manage Items
                  </Link>
                  <button
                    onClick={() => handleDelete('menus', menu.id)}
                    className="text-red-600 hover:text-red-900 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderBanners = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Promotional Banners</h3>
        <Link 
          href="/content/banners/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create New Banner
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading banners...</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No banners found</div>
      ) : (
        <div className="grid gap-4">
          {banners.map((banner) => (
            <div key={banner.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-gray-900">{banner.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{banner.content}</p>
                  <div className="flex items-center space-x-4 mt-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      banner.position === 'homepage' 
                        ? 'bg-blue-100 text-blue-800' 
                        : banner.position === 'header'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {banner.position}
                    </span>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      banner.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {banner.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                {banner.image_url && (
                  <div className="ml-4">
                    <img 
                      src={banner.image_url} 
                      alt={banner.title}
                      className="w-20 h-20 object-cover rounded"
                    />
                  </div>
                )}
                <div className="ml-4 flex flex-col space-y-2">
                  <Link 
                    href={`/content/banners/${banner.id}/edit`}
                    className="text-blue-600 hover:text-blue-900 text-sm"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete('banners', banner.id)}
                    className="text-red-600 hover:text-red-900 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Content Management</h1>
        <p className="text-gray-600">Manage pages, blog posts, menus, and promotional banners</p>
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
            { key: 'pages', label: 'Pages & Blog' },
            { key: 'menus', label: 'Menus' },
            { key: 'banners', label: 'Banners' }
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
      {activeTab === 'pages' && renderPages()}
      {activeTab === 'menus' && renderMenus()}
      {activeTab === 'banners' && renderBanners()}
    </div>
  );
}