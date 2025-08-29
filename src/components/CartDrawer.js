"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { apiRequest, extractResponseData } from "../lib/api";

/**
 * CartDrawer component
 * - Right-side drawer with overlay
 * - Accessibility: role=dialog, aria-modal, focus trap, ESC/overlay to close
 * - Integrates with existing cart APIs and dispatches 'cart:updated' on changes
 */
export default function CartDrawer({ isOpen, onClose }) {
  const drawerRef = useRef(null);
  const previouslyFocusedElement = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cart, setCart] = useState({ id: null, items: [] });
  const [updating, setUpdating] = useState({}); // { [itemId]: boolean }

  const fetchCart = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const raw = await apiRequest("/cart");
      const parsed = extractResponseData(raw);
      if (parsed.status === "SUCCESS") {
        setCart({ id: parsed.cartId || null, items: Array.isArray(parsed.items) ? parsed.items : [] });
      } else {
        setError(parsed.message || "Failed to fetch cart");
      }
    } catch (e) {
      setError(e?.message || "Failed to fetch cart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElement.current = document.activeElement;
      document.body.style.overflow = "hidden";
      fetchCart();
      // Focus management after open
      setTimeout(() => {
        const closeBtn = drawerRef.current?.querySelector("[data-close]");
        closeBtn?.focus();
      }, 50);
    } else {
      document.body.style.overflow = "";
      // Restore focus
      previouslyFocusedElement.current?.focus?.();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, fetchCart]);

  // Simple focus trap within drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === "Tab") {
        const focusable = drawerRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const dispatchCartUpdated = () => {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("cart:updated"));
      }
    } catch {}
  };

  const updateQuantity = async (itemId, newQty) => {
    if (!itemId || newQty < 1) return;
    setUpdating((s) => ({ ...s, [itemId]: true }));
    try {
      await apiRequest(`/cart/update/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity: newQty }),
      });
      setCart((prev) => ({
        ...prev,
        items: prev.items.map((it) => (it.id === itemId ? { ...it, quantity: newQty } : it)),
      }));
      dispatchCartUpdated();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating((s) => ({ ...s, [itemId]: false }));
    }
  };

  const removeItem = async (itemId) => {
    if (!itemId) return;
    setUpdating((s) => ({ ...s, [itemId]: true }));
    try {
      await apiRequest(`/cart/remove/${itemId}`, { method: "DELETE" });
      setCart((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== itemId) }));
      dispatchCartUpdated();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating((s) => ({ ...s, [itemId]: false }));
    }
  };

  const subtotal = cart.items.reduce((sum, it) => sum + (Number(it.base_price) || 0) * (Number(it.quantity) || 0), 0);

  return (
    <>
      <div
        className={`aesop-cart-overlay${isOpen ? " open" : ""}`}
        onClick={() => onClose?.()}
        aria-hidden={isOpen ? "false" : "true"}
      />

      <aside
        ref={drawerRef}
        className={`aesop-cart-drawer${isOpen ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <div className="aesop-cart-drawer-header">
          <h2 id="cart-drawer-title" className="aesop-cart-drawer-title">Your Cart</h2>
          <button className="aesop-icon-button" data-close onClick={() => onClose?.()} aria-label="Close cart">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="aesop-cart-drawer-body">
          {loading ? (
            <div className="aesop-cart-loading">Loading…</div>
          ) : error ? (
            <div className="aesop-cart-error">{error}</div>
          ) : cart.items.length === 0 ? (
            <div className="aesop-cart-empty">
              <p>Your cart is empty.</p>
              <Link href="/shop" className="aesop-button-primary" onClick={() => onClose?.()}>
                Continue Shopping
              </Link>
            </div>
          ) : (
            <ul className="aesop-cart-items" aria-live="polite">
              {cart.items.map((item) => {
                const price = Number(item.base_price) || 0;
                const qty = Number(item.quantity) || 0;
                const line = price * qty;
                return (
                  <li key={item.id} className="aesop-cart-item">
                    <div className="aesop-cart-item-main">
                      <div className="aesop-cart-item-title">{item.name || item.product_id}</div>
                      <div className="aesop-cart-item-price">${price.toFixed(2)}</div>
                    </div>
                    <div className="aesop-cart-item-controls">
                      <div className="aesop-qty-control" aria-label={`Quantity for ${item.name || item.product_id}`}>
                        <button
                          className="aesop-qty-btn"
                          onClick={() => updateQuantity(item.id, Math.max(1, qty - 1))}
                          disabled={!!updating[item.id] || qty <= 1}
                          aria-label="Decrease quantity"
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
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <button
                        className="aesop-link-button aesop-remove-item"
                        onClick={() => removeItem(item.id)}
                        disabled={!!updating[item.id]}
                      >
                        Remove
                      </button>
                      <div className="aesop-cart-line">${line.toFixed(2)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="aesop-cart-drawer-footer">
          <div className="aesop-cart-subtotal">
            <span>Subtotal</span>
            <strong>${subtotal.toFixed(2)}</strong>
          </div>
          <div className="aesop-cart-actions">
            <Link href="/cart" className="aesop-button-secondary" onClick={() => onClose?.()}>
              View Cart
            </Link>
            <button className="aesop-button-primary" onClick={() => { onClose?.(); }}>
              Checkout
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}