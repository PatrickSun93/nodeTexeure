'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { adminCustomers, getErrorMessage } from '../../../lib/api';
import * as echarts from 'echarts';

export default function CustomerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params.id;

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [addingNote, setAddingNote] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Fetch customer profile
  const fetchCustomer = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await adminCustomers.getCustomer(customerId);
      
      if (response.status === 'SUCCESS') {
        setCustomer(response.keyValueTable);
      } else {
        throw new Error(response.message || 'Failed to fetch customer');
      }
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error fetching customer:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Fetch customer notes
  const fetchNotes = useCallback(async () => {
    try {
      setNotesLoading(true);
      const response = await adminCustomers.getCustomerNotes(customerId);
      
      if (response.status === 'SUCCESS') {
        setNotes(response.keyValueTable.notes || []);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setNotesLoading(false);
    }
  }, [customerId]);

  // Load data on component mount
  useEffect(() => {
    if (customerId) {
      fetchCustomer();
      fetchNotes();
    }
  }, [customerId, fetchCustomer, fetchNotes]);

  // Initialize charts when customer data is available
  useEffect(() => {
    if (customer && !loading) {
      initializeCharts();
    }
  }, [customer, loading]);

  // Initialize ECharts
  const initializeCharts = () => {
    // Monthly Spending Chart
    if (customer.monthlySpending && customer.monthlySpending.length > 0) {
      const spendingChart = echarts.init(document.getElementById('spending-chart'));
      
      spendingChart.setOption({
        title: {
          text: 'Monthly Spending Trend',
          left: 'center',
          textStyle: { fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
          trigger: 'axis',
          formatter: function(params) {
            const data = params[0];
            return `${data.name}<br/>Orders: ${data.data.order_count}<br/>Spent: $${data.data.total_spent.toFixed(2)}`;
          }
        },
        xAxis: {
          type: 'category',
          data: customer.monthlySpending.map(item => item.month)
        },
        yAxis: [
          {
            type: 'value',
            name: 'Amount Spent ($)',
            position: 'left'
          },
          {
            type: 'value',
            name: 'Orders',
            position: 'right'
          }
        ],
        series: [
          {
            name: 'Amount Spent',
            type: 'bar',
            yAxisIndex: 0,
            data: customer.monthlySpending.map(item => ({
              value: item.total_spent,
              order_count: item.order_count,
              total_spent: item.total_spent
            })),
            itemStyle: { color: '#3B82F6' }
          },
          {
            name: 'Orders',
            type: 'line',
            yAxisIndex: 1,
            data: customer.monthlySpending.map(item => item.order_count),
            lineStyle: { color: '#10B981' },
            itemStyle: { color: '#10B981' }
          }
        ]
      });
    }

    // Order Status Distribution
    if (customer.orderStats) {
      const statusChart = echarts.init(document.getElementById('status-chart'));
      const statusData = [
        { value: customer.orderStats.pending_orders, name: 'Pending' },
        { value: customer.orderStats.confirmed_orders, name: 'Confirmed' },
        { value: customer.orderStats.shipped_orders, name: 'Shipped' },
        { value: customer.orderStats.delivered_orders, name: 'Delivered' },
        { value: customer.orderStats.cancelled_orders, name: 'Cancelled' },
        { value: customer.orderStats.refunded_orders, name: 'Refunded' }
      ].filter(item => item.value > 0);

      statusChart.setOption({
        title: {
          text: 'Order Status Distribution',
          left: 'center',
          textStyle: { fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
          trigger: 'item',
          formatter: '{a} <br/>{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          left: 'left'
        },
        series: [{
          name: 'Orders',
          type: 'pie',
          radius: '50%',
          data: statusData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }]
      });
    }
  };

  // Handle status update
  const handleStatusUpdate = async (newStatus, reason = '') => {
    try {
      setStatusUpdating(true);
      await adminCustomers.updateCustomerStatus(customerId, newStatus, reason);
      await fetchCustomer(); // Refresh customer data
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error updating customer status:', err);
    } finally {
      setStatusUpdating(false);
    }
  };

  // Handle add note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    try {
      setAddingNote(true);
      await adminCustomers.addCustomerNote(customerId, newNote.trim(), noteType);
      setNewNote('');
      setNoteType('general');
      await fetchNotes(); // Refresh notes
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error adding note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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

  // Get note type badge color
  const getNoteTypeBadgeColor = (type) => {
    const colors = {
      'support': 'bg-blue-100 text-blue-800',
      'billing': 'bg-yellow-100 text-yellow-800',
      'general': 'bg-gray-100 text-gray-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customer profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/customers')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Customers
          </button>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Customer not found</p>
          <button
            onClick={() => router.push('/customers')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Customers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/customers')}
                className="text-gray-600 hover:text-gray-900 mr-4"
              >
                ← Back to Customers
              </button>
              <h1 className="text-xl font-semibold text-gray-900">
                Customer Profile
              </h1>
            </div>
            <nav className="flex items-center space-x-4">
              <a 
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                Dashboard
              </a>
              <a 
                href="/customers"
                className="text-sm text-blue-600 px-3 py-2 rounded-md bg-blue-50"
              >
                Customers
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Customer Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-xl font-medium text-gray-600">
                  {customer.customer?.first_name?.[0]}{customer.customer?.last_name?.[0]}
                </span>
              </div>
              <div className="ml-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {customer.customer?.first_name} {customer.customer?.last_name}
                </h2>
                <p className="text-gray-600">{customer.customer?.email}</p>
                {customer.customer?.phone && (
                  <p className="text-gray-600">{customer.customer?.phone}</p>
                )}
                <div className="flex items-center space-x-2 mt-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(customer.customer?.status)}`}>
                    {customer.customer?.status}
                  </span>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSegmentBadgeColor(customer.customer?.segment)}`}>
                    {customer.customer?.segment}
                  </span>
                  <span className="text-xs text-gray-500 capitalize">
                    {customer.customer?.role}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              {customer.customer?.status === 'active' && (
                <button
                  onClick={() => handleStatusUpdate('suspended', 'Admin action')}
                  disabled={statusUpdating}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {statusUpdating ? 'Updating...' : 'Suspend'}
                </button>
              )}
              {customer.customer?.status === 'suspended' && (
                <button
                  onClick={() => handleStatusUpdate('active', 'Admin action')}
                  disabled={statusUpdating}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {statusUpdating ? 'Updating...' : 'Activate'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Customer Info and Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Statistics */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{customer.orderStats?.total_orders || 0}</div>
                  <div className="text-sm text-gray-600">Total Orders</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(customer.orderStats?.total_spent || 0)}</div>
                  <div className="text-sm text-gray-600">Total Spent</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{formatCurrency(customer.orderStats?.avg_order_value || 0)}</div>
                  <div className="text-sm text-gray-600">Avg Order Value</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {customer.orderStats?.last_order_date ? formatDate(customer.orderStats.last_order_date).split(',')[0] : 'Never'}
                  </div>
                  <div className="text-sm text-gray-600">Last Order</div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div id="spending-chart" style={{ width: '100%', height: '300px' }}></div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div id="status-chart" style={{ width: '100%', height: '300px' }}></div>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h3>
              {customer.recentOrders && customer.recentOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {customer.recentOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-blue-600">
                              {order.order_number}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 capitalize">
                              {order.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {order.item_count}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(order.total_amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(order.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No orders found</p>
              )}
            </div>

            {/* Addresses */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Addresses</h3>
              {customer.addresses && customer.addresses.length > 0 ? (
                <div className="space-y-4">
                  {customer.addresses.map((address) => {
                    const addressData = JSON.parse(address.address_json);
                    return (
                      <div key={address.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900 capitalize">
                            {address.type} Address
                          </span>
                          {address.is_default && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          <p>{address.first_name} {address.last_name}</p>
                          {addressData.company && <p>{addressData.company}</p>}
                          <p>{addressData.address_line_1}</p>
                          {addressData.address_line_2 && <p>{addressData.address_line_2}</p>}
                          <p>{addressData.city}, {addressData.state} {addressData.postal_code}</p>
                          <p>{addressData.country}</p>
                          {address.phone && <p>Phone: {address.phone}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No addresses found</p>
              )}
            </div>
          </div>

          {/* Right Column - Notes and Activity */}
          <div className="space-y-6">
            {/* Add Note */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Customer Note</h3>
              <form onSubmit={handleAddNote} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note Type
                  </label>
                  <select
                    value={noteType}
                    onChange={(e) => setNoteType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="general">General</option>
                    <option value="support">Support</option>
                    <option value="billing">Billing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note
                  </label>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={3}
                    placeholder="Enter customer service note..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newNote.trim() || addingNote}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingNote ? 'Adding...' : 'Add Note'}
                </button>
              </form>
            </div>

            {/* Customer Notes and Activity */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Notes & Activity</h3>
              {notesLoading ? (
                <p className="text-gray-500 text-center py-4">Loading notes...</p>
              ) : notes.length > 0 ? (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {notes.map((note) => (
                    <div key={note.id} className="border-l-4 border-blue-200 pl-4 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getNoteTypeBadgeColor(note.type)}`}>
                          {note.type}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(note.createdAt)}
                        </span>
                      </div>
                      {note.note && (
                        <p className="text-sm text-gray-700 mb-2">{note.note}</p>
                      )}
                      {note.reason && (
                        <p className="text-sm text-gray-600 mb-2">Reason: {note.reason}</p>
                      )}
                      <div className="text-xs text-gray-500">
                        by {note.createdBy?.firstName} {note.createdBy?.lastName}
                        {note.ipAddress && ` from ${note.ipAddress}`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No notes or activity found</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}