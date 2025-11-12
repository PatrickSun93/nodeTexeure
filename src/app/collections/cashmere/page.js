"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { ProductCard } from '../../shop/page';
import Pagination from '../../../components/common/Pagination';

export default function CashmereCollectionPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 12;

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/products?material=cashmere');
        const data = await res.json();
        if (data.status === 'SUCCESS') {
          setProducts(data.keyValueTable.products || []);
        }
      } catch (error) {
        console.error('Error fetching cashmere products:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const totalPages = Math.ceil(products.length / productsPerPage);
  const startIndex = (currentPage - 1) * productsPerPage;
  const endIndex = startIndex + productsPerPage;
  const paginatedProducts = products.slice(startIndex, endIndex);

  const handleAddToCart = async (product) => {
    // Add to cart logic
    console.log('Adding to cart:', product);
  };

  return (
    <div className="aesop-page">
      <Header />
      
      <main className="aesop-container">
        {/* Collection Hero */}
        <div className="noirae-collection-hero">
          <h1 className="noirae-heading-hero">Cashmere Collection</h1>
          <p className="noirae-collection-hero-description">
            Indulge in the supreme softness of our cashmere bedding. Sourced from 
            the finest cashmere goats, our collection offers unmatched warmth, 
            breathability, and luxurious comfort.
          </p>
        </div>

        {/* Collection Features */}
        <div className="noirae-collection-features">
          <div className="noirae-collection-feature">
            <h3>Premium Cashmere</h3>
            <p>Ethically sourced from the finest cashmere goats</p>
          </div>
          <div className="noirae-collection-feature">
            <h3>Supreme Softness</h3>
            <p>Incredibly soft fibers that get softer with every wash</p>
          </div>
          <div className="noirae-collection-feature">
            <h3>Lightweight Warmth</h3>
            <p>Exceptionally warm yet breathable for year-round comfort</p>
          </div>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="noirae-loading">
            <div className="aesop-loading-spinner"></div>
            <p>Loading cashmere products...</p>
          </div>
        ) : (
          <>
            <div className="noirae-collection-results">
              <h2 className="noirae-heading-2">All Cashmere Products</h2>
              <span className="noirae-results-count">{products.length} products</span>
            </div>

            <div className="noirae-product-grid">
              {paginatedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </>
        )}
      </main>
      
      <Footer />
    </div>
  );
}

