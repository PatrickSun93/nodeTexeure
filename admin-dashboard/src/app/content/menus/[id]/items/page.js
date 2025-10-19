'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function MenuItems() {
  const router = useRouter();
  const params = useParams();
  const menuId = params.id;

  const [menu, setMenu] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    parent_id: null,
    title: '',
    url: '',
    target: '_self',
    sort_order: 0,
    is_active: true
  });

  useEffect(() => {
    fetchMenuWithItems();
  }, [menuId]);

  const fetchMenuWithItems = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`http://localhost:6666/api/admin/content/menus/${menuId}`, {
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
        const menuData = data.keyValueTable;
        setMenu({
          id: menuData.id,
          name: menuData.name,
          location: menuData.location,
          is_active: menuData.is_active
        });
        setItems(menuData.items || []);
      } else {
        throw new Error(data.message || 'Failed to fetch menu');
      }
    } catch (error) {
      console.error('Error fetching menu:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title) {
      setError('Title is required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('adminToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const url = editingItem 
        ? `http://localhost:6666/api/admin/content/menus/${menuId}/items/${editingItem.id}`
        : `http://localhost:6666/api/admin/content/menus/${menuId}/items`;
      
      const method = editingItem ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setFormData({
          parent_id: null,
          title: '',
          url: '',
          target: '_self',
          sort_order: 0,
          is_active: true
        });
        setShowAddForm(false);
        setEditingItem(null);
        fetchMenuWithItems(); // Refresh the list
      } else {
        throw new Error(data.message || 'Failed to save menu item');
      }
    } catch (error) {
      console.error('Error saving menu item:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      parent_id: item.parent_id,
      title: item.title,
      url: item.url,
      target: item.target,
      sort_order: item.sort_order,
      is_active: item.is_active
    });
    setShowAddForm(true);
  };

  const handleDelete = async (itemId) => {
    if (!confirm('Are you sure you want to delete this menu item?')) {
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`http://localhost:6666/api/admin/content/menus/${menuId}/items/${itemId}`, {
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
        fetchMenuWithItems(); // Refresh the list
      } else {
        throw new Error(data.message || 'Failed to delete menu item');
      }
    } catch (error) {
      console.error('Error deleting menu item:', error);
      setError(error.message);
    }
  };

  const renderMenuItem = (item, level = 0) => (
    <div key={item.id} className="border border-gray-200 rounded-lg mb-2">
      <div className="p-4" style={{ marginLeft: `${level * 20}px` }}>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <h4 className="text-lg font-medium text-gray-900">{item.title}</h4>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                item.is_active 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {item.is_active ? 'Active' : 'Inactive'}
              </span>
              {level > 0 && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                  Sub-item
                </span>
              )}
            </div>
            <div className="mt-1 space-y-1">
              {item.url && (
                <p className="text-sm text-gray-600">URL: {item.url}</p>
              )}
              <p className="text-sm text-gray-500">
                Target: {item.target} | Sort Order: {item.sort_order}
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => handleEdit(item)}
              className="text-blue-600 hover:text-blue-900 text-sm"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-red-600 hover:text-red-900 text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      
      {/* Render children */}
      {item.children && item.children.length > 0 && (
        <div className="pl-4 pb-2">
          {item.children.map(child => renderMenuItem(child, level + 1))}
        </div>
      )}
    </div>
  );

  const flattenItems = (items) => {
    const flattened = [];
    const flatten = (items, level = 0) => {
      items.forEach(item => {
        flattened.push({ ...item, level });
        if (item.children && item.children.length > 0) {
          flatten(item.children, level + 1);
        }
      });
    };
    flatten(items);
    return flattened;
  };

  if (loading && !menu) {
    return (
      <div className="p-6">
        <div className="text-center py-8">Loading menu...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
          <button 
            onClick={() => router.push('/content')}
            className="hover:text-gray-700"
          >
            Content
          </button>
          <span>›</span>
          <span>Menu Items</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {menu?.name} - Menu Items
        </h1>
        <p className="text-gray-600">Manage navigation menu items and structure</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Parent Item */}
              <div>
                <label htmlFor="parent_id" className="block text-sm font-medium text-gray-700 mb-2">
                  Parent Item (optional)
                </label>
                <select
                  id="parent_id"
                  name="parent_id"
                  value={formData.parent_id || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Top Level Item</option>
                  {flattenItems(items).map((item) => (
                    <option key={item.id} value={item.id} disabled={item.id === editingItem?.id}>
                      {'—'.repeat(item.level)} {item.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Menu item title"
                  required
                />
              </div>

              {/* URL */}
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                  URL
                </label>
                <input
                  type="text"
                  id="url"
                  name="url"
                  value={formData.url}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="/page-url or https://external-link.com"
                />
              </div>

              {/* Target */}
              <div>
                <label htmlFor="target" className="block text-sm font-medium text-gray-700 mb-2">
                  Link Target
                </label>
                <select
                  id="target"
                  name="target"
                  value={formData.target}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="_self">Same Window</option>
                  <option value="_blank">New Window</option>
                </select>
              </div>

              {/* Sort Order */}
              <div>
                <label htmlFor="sort_order" className="block text-sm font-medium text-gray-700 mb-2">
                  Sort Order
                </label>
                <input
                  type="number"
                  id="sort_order"
                  name="sort_order"
                  value={formData.sort_order}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
                  Active (item will be displayed in menu)
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingItem(null);
                  setFormData({
                    parent_id: null,
                    title: '',
                    url: '',
                    target: '_self',
                    sort_order: 0,
                    is_active: true
                  });
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Menu Items List */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Menu Items</h3>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Menu Item
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No menu items found. Add your first menu item to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => renderMenuItem(item))}
          </div>
        )}
      </div>
    </div>
  );
}