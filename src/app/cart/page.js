'use client'

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '../../components/Header'; // fixed path to src/components/Header
import Footer from '../../components/Footer';
import { apiRequest, extractResponseData } from '../../lib/api';

function Breadcrumb() {
  return (
    <div className="bg-amber-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Shopping Cart</h1>
          <nav className="flex justify-center items-center space-x-2 text-sm">
            <Link href="/" className="text-gray-600 hover:text-amber-600">Home</Link>
            <span className="text-gray-400">&gt;</span>
            <span className="text-gray-900 font-medium">Cart</span>
          </nav>
        </div>
      </div>
    </div>
  );
}

export default function Cart() {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCart = async () => {
    try {
      const raw = await apiRequest('/cart');
      const parsed = extractResponseData(raw);
      if (parsed.status === 'SUCCESS') {
        // Normalize into the shape the UI expects
        setCart({
          id: parsed.cartId,
          items: Array.isArray(parsed.items) ? parsed.items : []
        });
      } else {
        console.error('Failed to fetch cart:', parsed.message);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const handleUpdateQuantity = async (itemId, quantity) => {
    try {
      await apiRequest(`/cart/update/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity })
      });
      fetchCart();
    } catch (error) {
      console.error(error);
    }
  };

  const handleRemove = async (itemId) => {
    try {
      await apiRequest(`/cart/remove/${itemId}`, {
        method: 'DELETE'
      });
      fetchCart();
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!cart || cart.items.length === 0) return <div>Your cart is empty</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <Breadcrumb />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-2xl font-bold mb-4">Cart Items</h2>
              {cart.items.map(item => (
                <div key={item.id} className="flex items-center mb-4 border-b pb-4">
                  <div className="w-24 h-24 bg-gray-200 mr-4">Image</div>
                  <div className="flex-1">
                    <h3 className="font-medium">{item.name}</h3>
                    <p>${item.price}</p>
                    <div className="flex items-center mt-2">
                      <input
                        type="number"
                        defaultValue={item.quantity}
                        min="1"
                        className="w-16 border rounded px-2 py-1 mr-2"
                        onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value))}
                      />
                      <button onClick={() => handleRemove(item.id)} className="text-red-600 hover:text-red-800 mr-4">Remove</button>
                    </div>
                  </div>
                  <p className="font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-4">Summary</h2>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="flex justify-between mb-2"><span>Subtotal</span><span>${cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}</span></p>
                <button className="w-full bg-amber-600 text-white py-3 rounded-lg mt-4">Proceed to Checkout</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}