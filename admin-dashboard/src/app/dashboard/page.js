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
import ProductDetailView from '../../components/ProductDetailView';
import CustomerDetailView from '../../components/CustomerDetailView';
import PromotionDetailView from '../../components/PromotionDetailView';
import PromotionModal from '../../components/PromotionModal';
import StaffDetailView from '../../components/StaffDetailView';
import SettingsView from '../../components/SettingsView';
import EmailTemplatesView from '../../components/EmailTemplatesView';

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
            onClick={() => setActiveTab('email-templates')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'email-templates' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            📧 Email Templates
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'customers' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            👥 Customers
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'settings' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            ⚙️ Settings
          </button>
          <button
            onClick={() => setActiveTab('promotions')}
            className={`block w-full text-left px-6 py-3 hover:bg-blue-50 transition ${activeTab === 'promotions' ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600' : ''}`}
          >
            🎟️ Promotions
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
        {activeTab === 'email-templates' && <EmailTemplatesView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'settings' && <SettingsView />}
        {activeTab === 'promotions' && <PromotionsView />}

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
import OrderDetailView from '../../components/OrderDetailView';

function OrdersView() {
  const [selectedStatus, setSelectedStatus] = useState('Pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);

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

  if (selectedOrder) {
    return <OrderDetailView order={selectedOrder} onBack={() => setSelectedOrder(null)} />;
  }

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
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="text-[#C5A572] hover:text-[#a08050] font-medium"
                    >
                      Edit Details
                    </button>
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
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Mock data based on image
  const products = [
    { id: 1, name: 'Pure Silk Pillowcase', sku: 'SKU-PSPC-001', category: 'Silk Bedding', price: '89.00', stock: 120, status: 'Active', image: 'https://placehold.co/40x40/f3ead8/8c6b3d?text=SP' },
    { id: 2, name: 'Luxe Cashmere Throw', sku: 'SKU-LCT-002', category: 'Cashmere Throws', price: '250.00', stock: 45, status: 'Active', image: 'https://placehold.co/40x40/e5e7eb/374151?text=LC' },
    { id: 3, name: 'Charmeuse Silk Duvet Cover', sku: 'SKU-CSDC-003', category: 'Silk Bedding', price: '499.00', stock: 15, status: 'Draft', image: 'https://placehold.co/40x40/d1d5db/1f2937?text=CS' },
    { id: 4, name: 'Cozy Cashmere Bed Socks', sku: 'SKU-CCBS-004', category: 'Cashmere Accessories', price: '65.00', stock: 0, status: 'Out of Stock', image: 'https://placehold.co/40x40/1f2937/d1d5db?text=CC' },
  ];

  const handleAddProduct = () => {
    setSelectedProduct(null);
    setViewMode('add');
  };

  const handleEditProduct = (product) => {
    setSelectedProduct(product);
    setViewMode('edit');
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedProduct(null);
  };

  if (viewMode === 'add' || viewMode === 'edit') {
    return <ProductDetailView product={selectedProduct} onBack={handleBack} />;
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Products</h2>
          <p className="text-gray-500 mt-1">Manage your product inventory, details, and status.</p>
        </div>
        <button
          onClick={handleAddProduct}
          className="px-4 py-2 bg-[#C5A572] text-white rounded-md hover:bg-[#b09060] transition shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add New Product
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 space-y-4">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search by Product Name, SKU..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <select
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-white text-gray-600"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">Category: All</option>
            <option value="Silk Bedding">Silk Bedding</option>
            <option value="Cashmere Throws">Cashmere Throws</option>
          </select>
          <select
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] bg-white text-gray-600"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">Status: All</option>
            <option value="Active">Active</option>
            <option value="Draft">Draft</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-4 text-left w-10">
                  <input type="checkbox" className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <input type="checkbox" className="rounded border-gray-300 text-[#C5A572] focus:ring-[#C5A572]" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={product.image} alt={product.name} className="w-10 h-10 rounded object-cover bg-gray-100" />
                      <span className="text-sm font-medium text-gray-900">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">{product.sku}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{product.category}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">${product.price}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{product.stock}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${product.status === 'Active' ? 'bg-green-100 text-green-800' :
                      product.status === 'Draft' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                      {product.status === 'Active' ? '● Active' : product.status === 'Draft' ? '● Draft' : 'Out of Stock'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex gap-3">
                      <button onClick={() => handleEditProduct(product)} className="text-gray-400 hover:text-blue-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button className="text-gray-400 hover:text-red-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white">
          <span className="text-sm text-gray-500">Showing 1-4 of 100</span>
          <div className="flex gap-1">
            <button className="px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm">Previous</button>
            <button className="px-3 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-sm">1</button>
            <button className="px-3 py-1 rounded border border-[#C5A572] bg-[#F3EAD8] text-[#8C6B3D] text-sm font-medium">2</button>
            <button className="px-3 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-sm">3</button>
            <button className="px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function CustomersView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Mock data based on image
  const customers = [
    { id: 'CUS-00124', name: 'Eleanor Vance', email: 'eleanor.v@email.com', orders: 12, spent: '€4,500', lastOrder: '2023-10-15' },
    { id: 'CUS-00125', name: 'James Fitzgerald', email: 'james.f@email.com', orders: 8, spent: '€2,150', lastOrder: '2023-10-12' },
    { id: 'CUS-00126', name: 'Clara Dubois', email: 'clara.d@email.com', orders: 21, spent: '€8,900', lastOrder: '2023-10-20' },
    { id: 'CUS-00127', name: 'Liam O\'Connell', email: 'liam.o@email.com', orders: 5, spent: '€950', lastOrder: '2023-09-28' },
    { id: 'CUS-00128', name: 'Sofia Rossi', email: 'sofia.r@email.com', orders: 15, spent: '€5,200', lastOrder: '2023-10-18' },
  ];

  if (selectedCustomer) {
    return <CustomerDetailView customer={selectedCustomer} onBack={() => setSelectedCustomer(null)} />;
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold text-gray-900">Customers</h2>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition shadow-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add New Customer
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
            placeholder="Search by name, email, or ID..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <select className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600">
            <option>Customer Segments</option>
            <option>VIP</option>
            <option>New</option>
          </select>
          <select className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600">
            <option>Order History</option>
            <option>High to Low</option>
            <option>Low to High</option>
          </select>
          <select className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-600">
            <option>Last Order Date</option>
            <option>Newest First</option>
            <option>Oldest First</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer ID</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Orders</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Spent</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Order Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{customer.id}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{customer.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{customer.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{customer.orders}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{customer.spent}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{customer.lastOrder}</td>
                  <td className="px-6 py-4 text-sm">
                    <button onClick={() => setSelectedCustomer(customer)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white">
          <span className="text-sm text-gray-500">Showing 1 to 5 of 2,345 results</span>
          <div className="flex gap-1">
            <button className="px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button className="px-3 py-1 rounded border border-blue-600 bg-blue-50 text-blue-600 font-medium text-sm">1</button>
            <button className="px-3 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-sm">2</button>
            <button className="px-3 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-sm">3</button>
            <span className="px-2 py-1 text-gray-400">...</span>
            <button className="px-3 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-sm">469</button>
            <button className="px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PromotionsView() {
  const [viewMode, setViewMode] = useState('list'); // 'list', 'edit'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState(null);

  // Mock data based on image
  const promotions = [
    { id: 1, name: 'Autumn Sale', code: 'AUTUMN20', type: 'Percentage', value: '20', startDate: '2023-09-01T00:00', endDate: '2023-09-30T23:59', status: 'Active', description: 'Get 20% off all silk pillowcases and cashmere throws this autumn.' },
    { id: 2, name: 'Welcome Discount', code: 'WELCOME10', type: 'Fixed Amount', value: '10', startDate: '2023-01-01T00:00', endDate: '2023-12-31T23:59', status: 'Active', description: 'Welcome discount for new customers.' },
    { id: 3, name: 'Summer Clearance', code: 'SUMMER50', type: 'Percentage', value: '50', startDate: '2023-08-15T00:00', endDate: '2023-08-31T23:59', status: 'Expired', description: 'End of summer clearance sale.' },
    { id: 4, name: 'Free Shipping Weekend', code: 'FREESHIP', type: 'Free Shipping', value: '', startDate: '2023-11-04T00:00', endDate: '2023-11-05T23:59', status: 'Active', description: 'Free shipping on all orders this weekend.' },
    { id: 5, name: 'Winter Collection Preview', code: 'WINTERVIP', type: 'Percentage', value: '15', startDate: '2023-11-15T00:00', endDate: '2023-11-30T23:59', status: 'Draft', description: 'Early access to winter collection.' },
  ];

  const handleEdit = (promo) => {
    setSelectedPromotion(promo);
    setViewMode('edit');
  };

  const handleCreate = () => {
    setSelectedPromotion(null);
    setIsModalOpen(true);
  };

  const handleBack = () => {
    setViewMode('list');
    setSelectedPromotion(null);
  };

  if (viewMode === 'edit') {
    return <PromotionDetailView promotion={selectedPromotion} onBack={handleBack} />;
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Promotions & Discounts</h2>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-[#C5A572] text-white rounded-md hover:bg-[#b09060] transition shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Create New Promotion
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search promotions by name or code..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] focus:border-transparent text-gray-700"
            />
          </div>
          <div className="flex gap-4">
            <select className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] text-gray-600 min-w-[160px]">
              <option>All Types</option>
              <option>Percentage</option>
              <option>Fixed Amount</option>
              <option>Free Shipping</option>
            </select>
            <select className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572] text-gray-600 min-w-[160px]">
              <option>All Statuses</option>
              <option>Active</option>
              <option>Draft</option>
              <option>Expired</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Code</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Discount Value</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Start Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">End Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {promotions.map((promo) => (
                <tr key={promo.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-6 py-6 text-sm font-medium text-gray-900">{promo.name}</td>
                  <td className="px-6 py-6 text-sm text-gray-500 font-mono">{promo.code}</td>
                  <td className="px-6 py-6 text-sm text-gray-600">{promo.type}</td>
                  <td className="px-6 py-6 text-sm font-bold text-gray-900">{promo.type === 'Percentage' ? `${promo.value}%` : promo.type === 'Fixed Amount' ? `$${promo.value}` : '-'}</td>
                  <td className="px-6 py-6 text-sm text-gray-500">{promo.startDate.split('T')[0]}</td>
                  <td className="px-6 py-6 text-sm text-gray-500">{promo.endDate.split('T')[0]}</td>
                  <td className="px-6 py-6">
                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${promo.status === 'Active' ? 'bg-green-100 text-green-700' :
                      promo.status === 'Draft' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                      {promo.status}
                    </span>
                  </td>
                  <td className="px-6 py-6 text-sm">
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(promo)} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button className="text-gray-400 hover:text-red-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PromotionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        promotion={null}
      />
    </div>
  );
}





function StaffView() {
  const [selectedStaff, setSelectedStaff] = useState(null);

  // Mock data
  const staff = [
    { id: 1, name: 'Admin User', email: 'admin@noirae.com', role: 'Administrator', status: 'Active', lastActive: 'Now' },
    { id: 2, name: 'Sarah Jones', email: 'sarah@noirae.com', role: 'Editor', status: 'Active', lastActive: '2 hours ago' },
  ];

  if (selectedStaff) {
    return <StaffDetailView staff={selectedStaff} onBack={() => setSelectedStaff(null)} />;
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Staff Members</h2>
        <button
          onClick={() => setSelectedStaff({})}
          className="px-4 py-2 bg-[#C5A572] text-white rounded-md hover:bg-[#b09060] transition shadow-sm font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add New Staff
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Active</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {staff.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{member.name}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{member.email}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{member.role}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    {member.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{member.lastActive}</td>
                <td className="px-6 py-4 text-sm">
                  <button onClick={() => setSelectedStaff(member)} className="text-gray-400 hover:text-blue-600">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsView() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Analytics</h2>
      <p className="text-gray-500">Advanced analytics coming soon...</p>
    </div>
  );
}