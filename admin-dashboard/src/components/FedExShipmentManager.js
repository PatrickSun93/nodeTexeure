'use client';

import { useState, useEffect } from 'react';
import { adminAPI } from '../utils/api';

export default function FedExShipmentManager() {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [serviceType, setServiceType] = useState('FEDEX_GROUND');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const fedexServiceTypes = [
    { value: 'FEDEX_GROUND', label: 'FedEx Ground' },
    { value: 'FEDEX_EXPRESS_SAVER', label: 'FedEx Express Saver' },
    { value: 'FEDEX_2_DAY', label: 'FedEx 2Day' },
    { value: 'STANDARD_OVERNIGHT', label: 'FedEx Standard Overnight' },
    { value: 'PRIORITY_OVERNIGHT', label: 'FedEx Priority Overnight' }
  ];

  useEffect(() => {
    fetchConfirmedOrders();
  }, []);

  const fetchConfirmedOrders = async () => {
    try {
      const result = await adminAPI.getOrders({ status: 'confirmed' });
      setOrders(result.data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const createShipment = async () => {
    if (!selectedOrder) {
      setMessage('Please select an order');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const result = await adminAPI.createFedExShipment(selectedOrder, serviceType);
      setMessage(`Shipment created successfully! Tracking: ${result.data.trackingNumber}`);
      setMessageType('success');
      setSelectedOrder('');
      fetchConfirmedOrders(); // Refresh orders
    } catch (error) {
      setMessage('Error creating shipment');
      setMessageType('error');
      console.error('Error creating shipment:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateCredentials = async () => {
    setLoading(true);
    setMessage('');

    try {
      const result = await adminAPI.validateFedExCredentials();
      if (result.data.valid) {
        setMessage('FedEx credentials are valid');
        setMessageType('success');
      } else {
        setMessage('FedEx credentials are invalid or not configured');
        setMessageType('error');
      }
    } catch (error) {
      setMessage('Error validating credentials');
      setMessageType('error');
      console.error('Error validating credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">FedEx Shipment Manager</h2>

      {/* Credentials Validation */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">API Configuration</h3>
        <button
          onClick={validateCredentials}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Validating...' : 'Validate FedEx Credentials'}
        </button>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message}
        </div>
      )}

      {/* Create Shipment Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Order to Ship
          </label>
          <select
            value={selectedOrder}
            onChange={(e) => setSelectedOrder(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select an order...</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.order_number} - ${order.total_amount} - {order.guest_email || 'Registered User'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            FedEx Service Type
          </label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {fedexServiceTypes.map((service) => (
              <option key={service.value} value={service.value}>
                {service.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={createShipment}
          disabled={loading || !selectedOrder}
          className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating Shipment...' : 'Create FedEx Shipment'}
        </button>
      </div>

      {/* Orders List */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirmed Orders Ready to Ship</h3>
        {orders.length === 0 ? (
          <p className="text-gray-600">No confirmed orders found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tracking
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.order_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.guest_email || 'Registered User'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${order.total_amount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        order.status === 'shipped' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.fedex_tracking_number || order.tracking_number || 'Not shipped'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}