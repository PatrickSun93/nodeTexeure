"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { ProductCard } from '../../shop/page';
import Pagination from '../../../components/common/Pagination';

export default function SilkCollectionPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 12;

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/products?material=silk');
        const data = await res.json();
        if (data.status === 'SUCCESS') {
          setProducts(data.keyValueTable.products || []);
        }
      } catch (error) {
        console.error('Error fetching silk products:', error);
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
          <h1 className="noirae-heading-hero">Silk Collection</h1>
          <p className="noirae-collection-hero-description">
            Experience the ultimate luxury with our premium mulberry silk bedding. 
            Naturally hypoallergenic, temperature-regulating, and incredibly soft, 
            silk offers an unparalleled sleeping experience.
          </p>
        </div>

        {/* Collection Features */}
        <div className="noirae-collection-features">
          <div className="noirae-collection-feature">
            <h3>100% Mulberry Silk</h3>
            <p>The finest grade silk, carefully sourced and ethically produced</p>
          </div>
          <div className="noirae-collection-feature">
            <h3>Temperature Regulating</h3>
            <p>Naturally adapts to keep you cool in summer, warm in winter</p>
          </div>
          <div className="noirae-collection-feature">
            <h3>Hypoallergenic</h3>
            <p>Resistant to dust mites, mold, and allergens</p>
          </div>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="noirae-loading">
            <div className="aesop-loading-spinner"></div>
            <p>Loading silk products...</p>
          </div>
        ) : (
          <>
            <div className="noirae-collection-results">
              <h2 className="noirae-heading-2">All Silk Products</h2>
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

