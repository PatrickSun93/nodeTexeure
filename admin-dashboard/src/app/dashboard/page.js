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
  const [selectedStatus, setSelectedStatus] = useState('Pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data based on image
  const orders = [
    { id: '#N-12345', date: '2024-05-21', customer: 'Liam Gallagher', amount: '$450.00', destination: 'Manchester, UK', status: 'Pending' },
    { id: '#N-12346', date: '2024-05-21', customer: 'Noel Gallagher', amount: '$720.50', destination: 'London, UK', status: 'Processing' },
    { id: '#N-12347', date: '2024-05-20', customer: 'Damon Albarn', amount: '$315.00', destination: 'Essex, UK', status: 'Shipped' },
    { id: '#N-12348', date: '2024-05-19', customer: 'Graham Coxon', amount: '$990.00', destination: 'Colchester, UK', status: 'Delivered' },
    { id: '#N-12349', date: '2024-05-18', customer: 'Alex James', amount: '$155.25', destination: 'Oxfordshire, UK', status: 'Cancelled' },
  ];

  const filteredOrders = orders.filter(order =>
    (selectedStatus === 'All' || order.status === selectedStatus) &&
    (order.id.toLowerCase().includes(searchQuery.toLowerCase()) || order.customer.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Order Queue</h2>
        <button className="px-4 py-2 bg-[#C5A572] text-white rounded-md hover:bg-[#b09060] transition shadow-sm font-medium">
          Export Orders
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search by Order ID, Customer Name..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <input type="date" className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-white text-gray-600" />
          </div>
          <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-2 font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            Filters
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {statuses.map(status => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status)}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${selectedStatus === status
                ? 'bg-[#F3EAD8] text-[#8C6B3D]' // Beige/Gold-ish for active
                : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'
              }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-4 text-left w-10">
                  <input type="checkbox" className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Amount</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Destination</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <input type="checkbox" className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-600">{order.id}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{order.date}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{order.customer}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{order.amount}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{order.destination}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-md ${order.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'Processing' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'Shipped' ? 'bg-purple-100 text-purple-800' :
                            order.status === 'Delivered' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                      }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button className="text-[#C5A572] hover:text-[#a08050] font-medium">Edit Details</button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-6 py-10 text-center text-gray-500">
                    No orders found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white">
          <span className="text-sm text-gray-500">Showing 1 to {filteredOrders.length} of 42 results</span>
          <div className="flex gap-1">
            <button className="p-2 rounded hover:bg-gray-100 text-gray-500 border border-gray-200">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button className="p-2 rounded hover:bg-gray-100 text-gray-500 border border-gray-200">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
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