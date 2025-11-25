'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ensureCsrfToken } from '../../utils/api';
import MetricsCard from '../../components/MetricsCard';
// import RevenueChart from '../../components/RevenueChart';
// import SalesDistributionChart from '../../components/SalesDistributionChart';
// import SalesByRegionChart from '../../components/SalesByRegionChart';
// import USMapChart from '../../components/USMapChart';
import RecentOrdersTable from '../../components/RecentOrdersTable';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [timePeriod, setTimePeriod] = useState('last-30-days');
  const router = useRouter();

  useEffect(() => {
    // Guard: verify auth and ensure CSRF token is present
    (async () => {
      try {
        await ensureCsrfToken();
      } catch (e) {
        // Not authenticated or not admin
        router.push('/');
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    try {
      const { apiFetch } = await import('../../utils/api');
      await apiFetch('/api/admin/logout', { method: 'POST' });
      router.push('/');
    } catch (e) {
      // If unauthorized or other issue, still return to login
      router.push('/');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Noirae Admin</p>
        </div>
        <nav className="flex-1 py-4">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'orders' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📦 Orders
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'products' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            🏷️ Products
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'customers' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            👥 Customers
          </button>
          <button
            onClick={() => setActiveTab('coupons')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'coupons' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            🎟️ Coupons
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'inventory' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📦 Inventory
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'analytics' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📈 Analytics
          </button>
        </nav>
        <div className="p-6 border-t">
          <button onClick={handleLogout} className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition">
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && <DashboardView timePeriod={timePeriod} setTimePeriod={setTimePeriod} />}
        {activeTab === 'orders' && <OrdersView />}
        {activeTab === 'products' && <ProductsView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'coupons' && <CouponsView />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'analytics' && <AnalyticsView />}
      </div>
    </div>
  );
}

function DashboardView({ timePeriod, setTimePeriod }) {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold">Admin Sales Dashboard</h2>
          <p className="text-gray-500 mt-1">Welcome back, Noirae Admin</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTimePeriod('last-30-days')}
            className={`px-4 py-2 rounded transition ${timePeriod === 'last-30-days' ? 'bg-amber-100 text-amber-700 font-medium' : 'bg-white hover:bg-gray-50'}`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setTimePeriod('last-90-days')}
            className={`px-4 py-2 rounded transition ${timePeriod === 'last-90-days' ? 'bg-amber-100 text-amber-700 font-medium' : 'bg-white hover:bg-gray-50'}`}
          >
            Last 90 Days
          </button>
          <button
            onClick={() => setTimePeriod('custom')}
            className={`px-4 py-2 rounded transition ${timePeriod === 'custom' ? 'bg-amber-100 text-amber-700 font-medium' : 'bg-white hover:bg-gray-50'}`}
          >
            Custom Range
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricsCard title="Total Revenue" value="$125,670" change="↑ 34.5%" trend="up" />
        <MetricsCard title="Total Orders" value="1,450" change="↑ 12.3%" trend="up" />
        <MetricsCard title="Average Order Value" value="$86.67" change="↑ 4.1%" trend="up" />
        <MetricsCard title="Conversion Rate" value="3.2%" change="↓ 0.3%" trend="down" />
      </div>

      {/* Charts Grid - Temporarily disabled */}
      {/* <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <RevenueChart />
        <SalesDistributionChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <SalesByRegionChart />
        <USMapChart />
      </div> */}

      {/* Recent Orders */}
      <RecentOrdersTable />
    </div>
  );
}

// Keep existing management views
function OrdersView() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Order Management</h2>
      <p className="text-gray-500">Order management interface coming soon...</p>
    </div>
  );
}

function ProductsView() {
  return <ProductManagement />;
}

function CustomersView() {
  return <UserManagement />;
}

function CouponsView() {
  return <CouponManagement />;
}

function InventoryView() {
  return <InventoryManagement />;
}

function AnalyticsView() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Analytics</h2>
      <p className="text-gray-500">Advanced analytics coming soon...</p>
    </div>
  );
}

// Existing CRUD components
function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { apiFetch } = await import('../../utils/api');
    const data = await apiFetch('/api/admin/products');
    if (data.success) setProducts(data.data.products);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { apiFetch } = await import('../../utils/api');
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/admin/products/${editingId}` : '/api/admin/products';
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    const { apiFetch } = await import('../../utils/api');
    await apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Product Management</h2>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Product Name"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <input
            className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Price"
            type="number"
            step="0.01"
            value={formData.base_price || ''}
            onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
          />
          <button type="submit" className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition">
            {editingId ? 'Update' : 'Add'} Product
          </button>
        </form>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{p.name}</td>
                <td className="px-6 py-4">${p.base_price}</td>
                <td className="px-6 py-4">
                  <button onClick={() => { setFormData(p); setEditingId(p.id); }} className="text-blue-500 hover:text-blue-700 mr-4">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-700">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CouponManagement() {
  const [coupons, setCoupons] = useState([]);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { apiFetch } = await import('../../utils/api');
    const data = await apiFetch('/api/admin/coupons');
    if (data.success) setCoupons(data.data.coupons);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { apiFetch } = await import('../../utils/api');
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/admin/coupons/${editingId}` : '/api/admin/coupons';
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    const { apiFetch } = await import('../../utils/api');
    await apiFetch(`/api/admin/coupons/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Coupon Management</h2>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Coupon Code"
            value={formData.code || ''}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          />
          <input
            className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Value"
            type="number"
            step="0.01"
            value={formData.value || ''}
            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
          />
          <button type="submit" className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition">
            {editingId ? 'Update' : 'Add'} Coupon
          </button>
        </form>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {coupons.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{c.code}</td>
                <td className="px-6 py-4">${c.value}</td>
                <td className="px-6 py-4">
                  <button onClick={() => { setFormData(c); setEditingId(c.id); }} className="text-blue-500 hover:text-blue-700 mr-4">Edit</button>
                  <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryManagement() {
  const [inventory, setInventory] = useState([]);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { apiFetch } = await import('../../utils/api');
    const data = await apiFetch('/api/admin/inventory');
    if (data.success) setInventory(data.data.inventory);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { apiFetch } = await import('../../utils/api');
    const method = 'PUT';
    const url = `/api/admin/inventory/${editingId}`;
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Inventory Management</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity Available</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {inventory.map(i => (
              <tr key={i.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{i.product_id}</td>
                <td className="px-6 py-4">{i.quantity_available}</td>
                <td className="px-6 py-4">
                  <button onClick={() => { setFormData(i); setEditingId(i.id); }} className="text-blue-500 hover:text-blue-700">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editingId && (
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Quantity Available"
              type="number"
              value={formData.quantity_available || ''}
              onChange={(e) => setFormData({ ...formData, quantity_available: e.target.value })}
            />
            <button type="submit" className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition">
              Update Inventory
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { apiFetch } = await import('../../utils/api');
    const data = await apiFetch('/api/admin/users');
    if (data.success) setUsers(data.data.users);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { apiFetch } = await import('../../utils/api');
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/admin/users/${editingId}` : '/api/admin/users';
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    const { apiFetch } = await import('../../utils/api');
    await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">User Management</h2>
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Email"
            type="email"
            value={formData.email || ''}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <button type="submit" className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition">
            {editingId ? 'Update' : 'Add'} User
          </button>
        </form>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{u.email}</td>
                <td className="px-6 py-4">{u.role}</td>
                <td className="px-6 py-4">
                  <button onClick={() => { setFormData(u); setEditingId(u.id); }} className="text-blue-500 hover:text-blue-700 mr-4">Edit</button>
                  <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:text-red-700">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}