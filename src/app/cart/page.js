'use client'

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest, extractResponseData } from '../../lib/api';


export default function Cart() {
  const t = useTranslations('Cart');
  const [cart, setCart] = useState({ id: null, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState({});

  const fetchCart = async () => {
    setLoading(true);
    setError('');
    try {
      const raw = await apiRequest('/cart');
      const parsed = extractResponseData(raw);
      if (parsed.status === 'SUCCESS') {
        setCart({
          id: parsed.cartId || null,
          items: Array.isArray(parsed.items) ? parsed.items : []
        });
      } else {
        setError(parsed.message || 'Failed to fetch cart');
      }
    } catch (e) {
      setError(e?.message || 'Failed to fetch cart');
    } finally {
      setLoading(false);
    }
  };

  const dispatchCartUpdated = () => {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('cart:updated'));
      }
    } catch {}
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const updateQuantity = async (itemId, newQty) => {
    if (!itemId || newQty < 1) return;
    setUpdating(s => ({ ...s, [itemId]: true }));
    try {
      await apiRequest(`/cart/update/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity: newQty })
      });
      setCart(prev => ({
        ...prev,
        items: prev.items.map(it => it.id === itemId ? { ...it, quantity: newQty } : it)
      }));
      dispatchCartUpdated();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(s => ({ ...s, [itemId]: false }));
    }
  };

  const removeItem = async (itemId) => {
    if (!itemId) return;
    setUpdating(s => ({ ...s, [itemId]: true }));
    try {
      await apiRequest(`/cart/remove/${itemId}`, { method: 'DELETE' });
      setCart(prev => ({ ...prev, items: prev.items.filter(it => it.id !== itemId) }));
      dispatchCartUpdated();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(s => ({ ...s, [itemId]: false }));
    }
  };

  const subtotal = cart.items.reduce((sum, it) => sum + (Number(it.base_price) || 0) * (Number(it.quantity) || 0), 0);

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="aesop-container">
          <div className="aesop-loading-state">{t('loading')}</div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="aesop-container">
          <div className="aesop-error-state">
            <p>{error}</p>
            <button className="aesop-button-primary" onClick={fetchCart}>{t('tryAgain')}</button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!cart.items || cart.items.length === 0) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="aesop-container">
          <div className="aesop-empty-state">
            <h2>{t('empty')}</h2>
            <p>{t('emptyDesc')}</p>
            <Link href="/shop" className="aesop-button-primary">{t('continueShopping')}</Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="aesop-container">
          <div className="aesop-cart-loading">Loading your cart...</div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="aesop-container">
          <div className="aesop-cart-error">
            <p>Error loading cart: {error}</p>
            <button onClick={() => window.location.reload()} className="aesop-button-secondary">
              Try Again
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="aesop-page">
        <Header />
        <div className="aesop-container">
          <div className="aesop-cart-empty">
            <h2>Your cart is empty</h2>
            <p>Discover our collection and add items to your cart.</p>
            <Link href="/shop" className="aesop-button-primary">
              Start Shopping
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="aesop-page">
      <Header />
      <div className="aesop-container">
        <div className="aesop-cart-page">
          <div className="aesop-cart-content">
            {/* Cart Items Column */}
            <div className="aesop-cart-items-section">
              <h2 className="aesop-section-title">{t('cartItems')}</h2>
              <ul className="aesop-cart-page-items" aria-live="polite">
                {cart.items.map((item) => {
                  const price = Number(item.base_price) || 0;
                  const qty = Number(item.quantity) || 0;
                  const line = price * qty;
                  return (
                    <li key={item.id} className="aesop-cart-page-item">
                      <div className="aesop-cart-item-image">
                        <div className="aesop-placeholder-image">Image</div>
                      </div>
                      <div className="aesop-cart-item-details">
                        <h3 className="aesop-cart-item-name">{item.name || item.product_id}</h3>
                        <p className="aesop-cart-item-price">${price.toFixed(2)}</p>
                        <div className="aesop-cart-item-controls">
                          <div className="aesop-qty-control" aria-label={`Quantity for ${item.name || item.product_id}`}>
                            <button
                              className="aesop-qty-btn"
                              onClick={() => updateQuantity(item.id, Math.max(1, qty - 1))}
                              disabled={!!updating[item.id] || qty <= 1}
                              aria-label={t('decreaseQty')}
                            >
                              −
                            </button>
                            <input
                              className="aesop-qty-input"
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!Number.isNaN(val) && val >= 1) {
                                  updateQuantity(item.id, val);
                                }
                              }}
                              aria-live="off"
                            />
                            <button
                              className="aesop-qty-btn"
                              onClick={() => updateQuantity(item.id, qty + 1)}
                              disabled={!!updating[item.id]}
                              aria-label={t('increaseQty')}
                            >
                              +
                            </button>
                          </div>
                          <button
                            className="aesop-link-button aesop-remove-item"
                            onClick={() => removeItem(item.id)}
                            disabled={!!updating[item.id]}
                          >
                            {t('remove')}
                          </button>
                        </div>
                      </div>
                      <div className="aesop-cart-item-total">
                        ${line.toFixed(2)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Cart Summary Column */}
            <div className="aesop-cart-summary-section">
              <div className="aesop-cart-summary-card">
                <h2 className="aesop-section-title">{t('orderSummary')}</h2>
                <div className="aesop-cart-summary-details">
                  <div className="aesop-cart-subtotal">
                    <span>{t('subtotal')}</span>
                    <strong>${subtotal.toFixed(2)}</strong>
                  </div>
                  <div className="aesop-cart-summary-note">
                    <p>{t('taxNote')}</p>
                  </div>
                </div>
                <div className="aesop-cart-summary-actions">
                  <Link href="/checkout" className="aesop-button-primary aesop-checkout-btn">
                    {t('proceedToCheckout')}
                  </Link>
                  <Link href="/shop" className="aesop-button-secondary">
                    {t('continueShopping')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}