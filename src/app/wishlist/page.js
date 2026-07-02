'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

export default function WishlistPage() {
  const t = useTranslations('Wishlist');
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState({});

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/signin?redirect=/wishlist');
      return;
    }
    fetchWishlist();
  }, [status, session]);

  const fetchWishlist = async () => {
    try {
      const data = await apiRequest('/wishlist', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (data?.status === 'SUCCESS') {
        setItems(data.keyValueTable?.items || []);
      }
    } catch (err) {
      console.error('Wishlist fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (productId) => {
    setRemoving(prev => ({ ...prev, [productId]: true }));
    try {
      await apiRequest(`/wishlist/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      setItems(prev => prev.filter(i => i.product_id !== productId));
    } catch (err) {
      console.error('Remove error:', err);
    } finally {
      setRemoving(prev => ({ ...prev, [productId]: false }));
    }
  };

  const handleAddToCart = async (item) => {
    try {
      await apiRequest('/cart/add', {
        method: 'POST',
        body: JSON.stringify({
          product_id: item.product_id,
          variant_id: item.variant_id || undefined,
          quantity: 1,
        }),
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('cart:updated'));
    } catch (err) {
      console.error('Add to cart error:', err);
    }
  };

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <div className="aesop-loading-spinner" style={{ margin: '0 auto' }}></div>
          <p className="noirae-body-text" style={{ marginTop: '1rem' }}>{t('loading')}</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="aesop-page">
      <Header />
      <main style={{ padding: '2rem 0 4rem' }}>
        <div className="aesop-container">
          <nav className="nt-breadcrumb">
            <Link href="/">{t('home')}</Link>
            <span className="nt-breadcrumb-sep">/</span>
            <span>{t('wishlist')}</span>
          </nav>

          <h1 className="noirae-heading-hero" style={{ margin: '1.5rem 0' }}>{t('title')}</h1>

          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p className="noirae-body-text" style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>
                {t('empty')}
              </p>
              <Link href="/shop" className="nt-btn nt-btn-primary">{t('browseProducts')}</Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
              {items.map(item => (
                <div key={item.id} style={{ border: '1px solid var(--color-border, #e5e5e5)', borderRadius: '4px', overflow: 'hidden' }}>
                  <Link href={`/products/${item.product_id}`}>
                    <div style={{ aspectRatio: '1', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: '#999', fontSize: '0.875rem' }}>{t('noImage')}</span>
                      )}
                    </div>
                  </Link>
                  <div style={{ padding: '1rem' }}>
                    <Link href={`/products/${item.product_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.25rem' }}>{item.name}</h3>
                    </Link>
                    {item.variant_size && (
                      <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                        {item.variant_size}{item.variant_color ? ` / ${item.variant_color}` : ''}
                      </p>
                    )}
                    <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                      ${item.price?.toFixed(2)}
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleAddToCart(item)}
                        className="nt-btn nt-btn-primary"
                        style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem' }}
                      >
                        {t('addToCart')}
                      </button>
                      <button
                        onClick={() => handleRemove(item.product_id)}
                        disabled={removing[item.product_id]}
                        className="nt-btn nt-btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                      >
                        {removing[item.product_id] ? '...' : t('remove')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
