'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ensureCsrfToken } from '../../utils/api';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('products');
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
      await apiFetch('http://localhost:6666/api/admin/logout', { method: 'POST' });
      router.push('/');
    } catch (e) {
      // If unauthorized or other issue, still return to login
      router.push('/');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md">
        <div className="p-6">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <button onClick={handleLogout} className="button w-full mt-4">Logout</button>
        </div>
        <nav className="mt-6">
          <button onClick={() => setActiveTab('products')} className="block w-full text-left px-6 py-3 hover:bg-blue-50">Products</button>
          <button onClick={() => setActiveTab('coupons')} className="block w-full text-left px-6 py-3 hover:bg-blue-50">Coupons</button>
          <button onClick={() => setActiveTab('inventory')} className="block w-full text-left px-6 py-3 hover:bg-blue-50">Inventory</button>
          <button onClick={() => setActiveTab('users')} className="block w-full text-left px-6 py-3 hover:bg-blue-50">Users</button>
        </nav>
      </div>
      {/* Main content */}
      <div className="flex-1 p-8 overflow-auto">
        {activeTab === 'products' && <ProductManagement />}
        {activeTab === 'coupons' && <CouponManagement />}
        {activeTab === 'inventory' && <InventoryManagement />}
        {activeTab === 'users' && <UserManagement />}
      </div>
    </div>
  );
}

function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const data = await apiFetch('http://localhost:6666/api/admin/products');
    if (data.success) setProducts(data.data.products);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `http://localhost:6666/api/admin/products/${editingId}` : 'http://localhost:6666/api/admin/products';
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    await apiFetch(`http://localhost:6666/api/admin/products/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Product Management</h2>
      <form onSubmit={handleSubmit} className="mb-6">
        {/* Add input fields for product data */}
        <input className="input mb-2" placeholder="Name" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} />
        {/* Add more fields similarly */}
        <button type="submit" className="button">{editingId ? 'Update' : 'Add'} Product</button>
      </form>
      <table className="w-full border-collapse">
        <thead><tr><th>Name</th><th>Price</th><th>Actions</th></tr></thead>
        <tbody>{products.map(p => (
          <tr key={p.id}><td>{p.name}</td><td>{p.base_price}</td><td>
            <button onClick={() => {setFormData(p); setEditingId(p.id);}} className="text-blue-500 mr-2">Edit</button>
            <button onClick={() => handleDelete(p.id)} className="text-red-500">Delete</button>
          </td></tr>
        ))}</tbody>
      </table>
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
    const data = await apiFetch('http://localhost:6666/api/admin/coupons');
    if (data.success) setCoupons(data.data.coupons);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `http://localhost:6666/api/admin/coupons/${editingId}` : 'http://localhost:6666/api/admin/coupons';
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    await apiFetch(`http://localhost:6666/api/admin/coupons/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Coupon Management</h2>
      <form onSubmit={handleSubmit} className="mb-6">
        <input className="input mb-2" placeholder="Code" value={formData.code || ''} onChange={(e) => setFormData({...formData, code: e.target.value})} />
        <input className="input mb-2" placeholder="Value" value={formData.value || ''} onChange={(e) => setFormData({...formData, value: e.target.value})} />
        {/* Add more fields */}
        <button type="submit" className="button">{editingId ? 'Update' : 'Add'} Coupon</button>
      </form>
      <table className="w-full border-collapse">
        <thead><tr><th>Code</th><th>Value</th><th>Actions</th></tr></thead>
        <tbody>{coupons.map(c => (
          <tr key={c.id}><td>{c.code}</td><td>{c.value}</td><td>
            <button onClick={() => {setFormData(c); setEditingId(c.id);}} className="text-blue-500 mr-2">Edit</button>
            <button onClick={() => handleDelete(c.id)} className="text-red-500">Delete</button>
          </td></tr>
        ))}</tbody>
      </table>
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
    const data = await apiFetch('http://localhost:6666/api/admin/inventory');
    if (data.success) setInventory(data.data.inventory);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = 'PUT';
    const url = `http://localhost:6666/api/admin/inventory/${editingId}`;
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Inventory Management</h2>
      <table className="w-full border-collapse">
        <thead><tr><th>Product ID</th><th>Quantity Available</th><th>Actions</th></tr></thead>
        <tbody>{inventory.map(i => (
          <tr key={i.id}><td>{i.product_id}</td><td>{i.quantity_available}</td><td>
            <button onClick={() => {setFormData(i); setEditingId(i.id);}} className="text-blue-500">Edit</button>
          </td></tr>
        ))}</tbody>
      </table>
      {editingId && (
        <form onSubmit={handleSubmit} className="mt-6">
          <input className="input mb-2" placeholder="Quantity Available" value={formData.quantity_available || ''} onChange={(e) => setFormData({...formData, quantity_available: e.target.value})} />
          {/* Add more fields */}
          <button type="submit" className="button">Update Inventory</button>
        </form>
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
    const data = await apiFetch('http://localhost:6666/api/admin/users');
    if (data.success) setUsers(data.data.users);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `http://localhost:6666/api/admin/users/${editingId}` : 'http://localhost:6666/api/admin/users';
    await apiFetch(url, { method, body: JSON.stringify(formData) });
    await fetchData();
    setFormData({});
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    await apiFetch(`http://localhost:6666/api/admin/users/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">User Management</h2>
      <form onSubmit={handleSubmit} className="mb-6">
        <input className="input mb-2" placeholder="Email" value={formData.email || ''} onChange={(e) => setFormData({...formData, email: e.target.value})} />
        {/* Add more fields */}
        <button type="submit" className="button">{editingId ? 'Update' : 'Add'} User</button>
      </form>
      <table className="w-full border-collapse">
        <thead><tr><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>{users.map(u => (
          <tr key={u.id}><td>{u.email}</td><td>{u.role}</td><td>
            <button onClick={() => {setFormData(u); setEditingId(u.id);}} className="text-blue-500 mr-2">Edit</button>
            <button onClick={() => handleDelete(u.id)} className="text-red-500">Delete</button>
          </td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

const handleDelete = async (id) => {
  const token = localStorage.getItem('token');
  await fetch(`http://localhost:6666/api/admin/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  fetchData();
};