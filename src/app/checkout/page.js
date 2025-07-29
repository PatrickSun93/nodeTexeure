'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function CheckoutPage() {
  const [cartItems, setCartItems] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [subtotal, setSubtotal] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [shipping, setShipping] = useState(10); // Fixed shipping for now
  const [total, setTotal] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [shippingAddress, setShippingAddress] = useState({ first_name: '', last_name: '', address_line_1: '', city: '', state: '', postal_code: '', country: '', phone: '' });
  const [billingAddress, setBillingAddress] = useState({ first_name: '', last_name: '', address_line_1: '', city: '', state: '', postal_code: '', country: '', phone: '' });
  const [guestEmail, setGuestEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false); // TODO: Check auth
  const router = useRouter();

  useEffect(() => {
    fetchCart();
  }, []);

  const fetchCart = async () => {
    const res = await fetch('/api/cart');
    if (res.ok) {
      const data = await res.json();
      setCartId(data.cartId); // Assuming backend returns cartId
      setCartItems(data.items || []);
      const sub = data.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
      setSubtotal(sub);
      setTax(sub * 0.1); // 10% tax for example
    }
  };

  const handleApplyCoupon = async () => {
    setError('');
    const res = await fetch('/api/orders/apply-coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartId, couponCode })
    });
    const data = await res.json();
    if (data.status === 'success') {
      setDiscount(data.data.discount);
    } else {
      setError(data.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cartId) return setError('Cart not found');
    const payload = {
      cartId,
      shippingAddress,
      billingAddress,
      couponCode,
      guestEmail: isLoggedIn ? null : guestEmail
    };
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'success') {
      router.push(`/order/confirmation/${data.data.orderId}`);
    } else {
      setError(data.message);
    }
  };

  const updateTotal = () => {
    setTotal(subtotal + tax + shipping - discount);
  };

  useEffect(updateTotal, [subtotal, tax, shipping, discount]);

  const AddressForm = ({ address, setAddress, title }) => (
    <div>
      <h2>{title}</h2>
      <input type="text" value={address.first_name} onChange={e => setAddress({...address, first_name: e.target.value})} placeholder="First Name" className="block mb-2" />
      <input type="text" value={address.last_name} onChange={e => setAddress({...address, last_name: e.target.value})} placeholder="Last Name" className="block mb-2" />
      <input type="text" value={address.address_line_1} onChange={e => setAddress({...address, address_line_1: e.target.value})} placeholder="Address" className="block mb-2" />
      <input type="text" value={address.city} onChange={e => setAddress({...address, city: e.target.value})} placeholder="City" className="block mb-2" />
      <input type="text" value={address.state} onChange={e => setAddress({...address, state: e.target.value})} placeholder="State" className="block mb-2" />
      <input type="text" value={address.postal_code} onChange={e => setAddress({...address, postal_code: e.target.value})} placeholder="Postal Code" className="block mb-2" />
      <input type="text" value={address.country} onChange={e => setAddress({...address, country: e.target.value})} placeholder="Country" className="block mb-2" />
      <input type="text" value={address.phone} onChange={e => setAddress({...address, phone: e.target.value})} placeholder="Phone" className="block mb-2" />
    </div>
  );

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Checkout</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {!isLoggedIn && (
        <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="Guest Email" className="block mb-4" />
      )}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <AddressForm address={shippingAddress} setAddress={setShippingAddress} title="Shipping Address" />
        <AddressForm address={billingAddress} setAddress={setBillingAddress} title="Billing Address" />
      </div>
      <div className="mb-4">
        <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="Coupon Code" className="mr-2" />
        <button onClick={handleApplyCoupon} className="bg-blue-500 text-white px-4 py-2">Apply</button>
      </div>
      <div className="mb-4">
        {cartItems.map(item => (
          <div key={item.id} className="mb-2">{item.name} - {item.quantity} x ${item.price.toFixed(2)}</div>
        ))}
        <p>Subtotal: ${subtotal.toFixed(2)}</p>
        <p>Tax: ${tax.toFixed(2)}</p>
        <p>Shipping: ${shipping.toFixed(2)}</p>
        <p>Discount: -${discount.toFixed(2)}</p>
        <p className="font-bold">Total: ${total.toFixed(2)}</p>
      </div>
      <button onClick={handleSubmit} className="bg-green-500 text-white px-4 py-2">Place Order</button>
    </div>
  );
}

export default CheckoutPage;