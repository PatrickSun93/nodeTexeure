'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// Reusing Header from shop page (assume it's extracted or copy for now)
function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-amber-600 rounded"></div>
            <span className="text-xl font-bold text-gray-900">Furniro</span>
          </Link>
          <nav className="hidden md:flex space-x-8">
            <Link href="/" className="text-gray-900 hover:text-amber-600 font-medium">Home</Link>
            <Link href="/shop" className="text-amber-600 font-medium">Shop</Link>
            <a href="#" className="text-gray-900 hover:text-amber-600 font-medium">About</a>
            <a href="#" className="text-gray-900 hover:text-amber-600 font-medium">Contact</a>
          </nav>
          <div className="flex items-center space-x-4">
            {/* Icons */}
          </div>
        </div>
      </div>
    </header>
  );
}

function Breadcrumb({ productName }) {
  return (
    <div className="bg-amber-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{productName}</h1>
          <nav className="flex justify-center items-center space-x-2 text-sm">
            <Link href="/" className="text-gray-600 hover:text-amber-600">Home</Link>
            <span className="text-gray-400">&gt;</span>
            <Link href="/shop" className="text-gray-600 hover:text-amber-600">Shop</Link>
            <span className="text-gray-400">&gt;</span>
            <span className="text-gray-900 font-medium">{productName}</span>
          </nav>
        </div>
      </div>
    </div>
  );
}

export default function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await fetch(`/api/products/${id}`);
        const data = await res.json();
        if (data.success) {
          setProduct(data.data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (!product) return <div>Product not found</div>;

  return (
    <div>
      <Header />
      <Breadcrumb productName={product.name} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            {/* Main image */}
            <div className="bg-gray-200 h-96 flex items-center justify-center mb-4">
              {product.images?.[0]?.original_url || 'Main Image'}
            </div>
            {/* Thumbnails */}
            <div className="grid grid-cols-4 gap-4">
              {product.images?.slice(1).map(img => (
                <div key={img.id} className="bg-gray-200 h-24 flex items-center justify-center">
                  {img.thumbnail_small_url}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
            <p className="text-2xl text-amber-600 font-bold mb-4">${product.base_price}</p>
            <p className="text-gray-600 mb-6">{product.description}</p>
            {/* Variants */}
            {product.variants?.length > 0 && (
              <div className="mb-6">
                <h3 className="font-medium mb-2">Variants</h3>
                <select className="w-full p-2 border rounded">
                  {product.variants.map(v => (
                    <option key={v.id}>{v.size} - {v.color} (${v.price_adjustment})</option>
                  ))}
                </select>
              </div>
            )}
            <button className="bg-amber-600 text-white py-3 px-6 rounded-lg hover:bg-amber-700">
              Add to Cart
            </button>
            {/* Reviews */}
            <div className="mt-8">
              <h3 className="font-medium mb-4">Reviews</h3>
              {product.reviews?.map(r => (
                <div key={r.id} className="border-b py-4">
                  <p>{r.rating} stars - {r.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}