'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { apiRequest } from '../../lib/api';

export default function WishlistButton({ productId, variantId, style }) {
  const { data: session } = useSession();
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.accessToken || !productId) return;
    const check = async () => {
      try {
        const data = await apiRequest(`/wishlist/check/${productId}`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (data?.status === 'SUCCESS') {
          setIsWishlisted(data.keyValueTable?.isWishlisted || false);
        }
      } catch {}
    };
    check();
  }, [session, productId]);

  const handleToggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.accessToken) return;
    setLoading(true);
    try {
      if (isWishlisted) {
        await apiRequest(`/wishlist/${productId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        setIsWishlisted(false);
      } else {
        await apiRequest('/wishlist', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}` },
          body: JSON.stringify({ product_id: productId, variant_id: variantId || null }),
        });
        setIsWishlisted(true);
      }
    } catch {}
    setLoading(false);
  };

  if (!session) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      style={{
        background: 'none',
        border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        padding: '0.5rem',
        opacity: loading ? 0.5 : 1,
        transition: 'opacity 0.2s',
        ...style,
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill={isWishlisted ? '#e11d48' : 'none'} stroke={isWishlisted ? '#e11d48' : 'currentColor'} strokeWidth="1.5">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
