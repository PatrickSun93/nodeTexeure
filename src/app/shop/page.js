'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '../../components/Header';

// Breadcrumb Component
function Breadcrumb() {
    return (
        <nav className="aesop-breadcrumb">
            <div className="aesop-container">
                <ol className="aesop-breadcrumb-list">
                    <li><Link href="/">Home</Link></li>
                    <li>Shop</li>
                </ol>
            </div>
        </nav>
    );
}

// Filter Sidebar Component
function FilterSidebar({ filters, onFilterChange }) {
    const categories = ['All', 'Sheets', 'Pillows', 'Blankets', 'Mattresses'];
    const priceRanges = [
        { label: 'All Prices', min: 0, max: Infinity },
        { label: 'Under $100', min: 0, max: 100 },
        { label: '$100 - $200', min: 100, max: 200 },
        { label: '$200 - $300', min: 200, max: 300 },
        { label: 'Over $300', min: 300, max: Infinity }
    ];

    return (
        <aside className="aesop-filter-sidebar">
            <div className="aesop-filter-section">
                <h3 className="aesop-filter-title">Categories</h3>
                <div className="aesop-filter-options">
                    {categories.map(category => (
                        <label key={category} className="aesop-filter-option">
                            <input
                                type="radio"
                                name="category"
                                value={category}
                                checked={filters.category === category}
                                onChange={(e) => onFilterChange({ ...filters, category: e.target.value })}
                            />
                            <span>{category}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="aesop-filter-section">
                <h3 className="aesop-filter-title">Price Range</h3>
                <div className="aesop-filter-options">
                    {priceRanges.map((range, index) => (
                        <label key={index} className="aesop-filter-option">
                            <input
                                type="radio"
                                name="priceRange"
                                value={`${range.min}-${range.max}`}
                                checked={filters.priceMin === range.min && filters.priceMax === range.max}
                                onChange={() => onFilterChange({ 
                                    ...filters, 
                                    priceMin: range.min, 
                                    priceMax: range.max 
                                })}
                            />
                            <span>{range.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="aesop-filter-section">
                <h3 className="aesop-filter-title">Sort By</h3>
                <select 
                    className="aesop-select"
                    value={filters.sortBy}
                    onChange={(e) => onFilterChange({ ...filters, sortBy: e.target.value })}
                >
                    <option value="name">Name</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="newest">Newest</option>
                </select>
            </div>
        </aside>
    );
}

// Product Card Component
export function ProductCard({ product, onAddToCart, onToggleWishlist }) {
    const [isWishlisted, setIsWishlisted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleAddToCart = async () => {
        setIsLoading(true);
        try {
            await onAddToCart(product);
        } catch (error) {
            console.error('Error adding to cart:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleWishlist = () => {
        setIsWishlisted(!isWishlisted);
        onToggleWishlist?.(product);
    };

    return (
        <div className="aesop-product-card">
            <div className="aesop-product-image">
                <img 
                    src={product.image || '/api/placeholder/300/300'} 
                    alt={product.name}
                    onError={(e) => {
                        e.target.src = '/api/placeholder/300/300';
                    }}
                />
                {product.isNew && <span className="aesop-product-badge">New</span>}
                <button 
                    className={`aesop-wishlist-button ${isWishlisted ? 'active' : ''}`}
                    onClick={handleToggleWishlist}
                    aria-label="Add to wishlist"
                >
                    <svg className="w-5 h-5" fill={isWishlisted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                </button>
            </div>
            <div className="aesop-product-info">
                <h3 className="aesop-product-name">{product.name}</h3>
                <p className="aesop-product-description">{product.description}</p>
                <div className="aesop-product-price-section">
                    <span className="aesop-product-price">${product.price}</span>
                    {product.originalPrice && (
                        <span className="aesop-product-original-price">${product.originalPrice}</span>
                    )}
                </div>
                <button 
                    className="aesop-button-primary aesop-add-to-cart"
                    onClick={handleAddToCart}
                    disabled={isLoading}
                >
                    {isLoading ? 'Adding...' : 'Add to Cart'}
                </button>
            </div>
        </div>
    );
}

// Main Shop Component
export default function Shop() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState({
        category: 'All',
        priceMin: 0,
        priceMax: Infinity,
        sortBy: 'name',
        search: ''
    });

    // Sample products data
    const sampleProducts = [
        {
            id: 1,
            name: "Luxury Cotton Sheets",
            description: "Premium 100% Egyptian cotton sheets with 400 thread count",
            price: 299,
            originalPrice: 399,
            category: "Sheets",
            image: "/api/placeholder/300/300",
            isNew: true
        },
        {
            id: 2,
            name: "Silk Pillowcase Set",
            description: "Mulberry silk pillowcases for hair and skin care",
            price: 149,
            category: "Pillows",
            image: "/api/placeholder/300/300"
        },
        {
            id: 3,
            name: "Memory Foam Mattress",
            description: "Gel-infused memory foam for optimal comfort",
            price: 899,
            category: "Mattresses",
            image: "/api/placeholder/300/300"
        },
        {
            id: 4,
            name: "Bamboo Duvet Cover",
            description: "Eco-friendly bamboo fiber duvet cover set",
            price: 199,
            category: "Blankets",
            image: "/api/placeholder/300/300",
            isNew: true
        },
        {
            id: 5,
            name: "Linen Throw Blanket",
            description: "Soft and breathable linen throw for all seasons",
            price: 89,
            category: "Blankets",
            image: "/api/placeholder/300/300"
        },
        {
            id: 6,
            name: "Down Alternative Pillow",
            description: "Hypoallergenic down alternative pillow",
            price: 79,
            category: "Pillows",
            image: "/api/placeholder/300/300"
        }
    ];

    // Initialize products and handle search params
    useEffect(() => {
        setProducts(sampleProducts);
        setLoading(false);

        // Handle search query from URL
        const searchQuery = searchParams.get('search');
        const categoryQuery = searchParams.get('category');
        
        if (searchQuery || categoryQuery) {
            setFilters(prev => ({
                ...prev,
                search: searchQuery || '',
                category: categoryQuery || 'All'
            }));
        }
    }, [searchParams]);

    // Filter and sort products
    useEffect(() => {
        let filtered = [...products];

        // Apply search filter
        if (filters.search) {
            filtered = filtered.filter(product =>
                product.name.toLowerCase().includes(filters.search.toLowerCase()) ||
                product.description.toLowerCase().includes(filters.search.toLowerCase()) ||
                product.category.toLowerCase().includes(filters.search.toLowerCase())
            );
        }

        // Apply category filter
        if (filters.category !== 'All') {
            filtered = filtered.filter(product => product.category === filters.category);
        }

        // Apply price filter
        filtered = filtered.filter(product => 
            product.price >= filters.priceMin && product.price <= filters.priceMax
        );

        // Apply sorting
        switch (filters.sortBy) {
            case 'price-low':
                filtered.sort((a, b) => a.price - b.price);
                break;
            case 'price-high':
                filtered.sort((a, b) => b.price - a.price);
                break;
            case 'newest':
                filtered.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
                break;
            case 'name':
            default:
                filtered.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }

        setFilteredProducts(filtered);
    }, [products, filters]);

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
    };

    const handleAddToCart = async (product) => {
        try {
            const response = await fetch('/api/cart', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    productId: product.id,
                    quantity: 1
                })
            });

            if (!response.ok) {
                throw new Error('Failed to add to cart');
            }

            // Show success message or update cart count
            console.log('Product added to cart successfully');
        } catch (error) {
            console.error('Error adding to cart:', error);
            throw error;
        }
    };

    const handleToggleWishlist = (product) => {
        console.log('Toggle wishlist for:', product.name);
    };

    const clearSearch = () => {
        setFilters(prev => ({ ...prev, search: '' }));
        router.push('/shop');
    };

    if (loading) {
        return (
            <div className="aesop-page">
                <Header />
                <div className="aesop-loading">
                    <div className="aesop-container">
                        <p>Loading products...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="aesop-page">
                <Header />
                <div className="aesop-error">
                    <div className="aesop-container">
                        <p>Error loading products: {error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="aesop-page">
            <Header />
            <Breadcrumb />
            
            <main className="aesop-shop-main">
                <div className="aesop-container">
                    {/* Search Results Header */}
                    {filters.search && (
                        <div className="aesop-search-results">
                            <h2 className="aesop-search-title">
                                Search results for "{filters.search}" ({filteredProducts.length} products)
                            </h2>
                            <button 
                                className="aesop-button-secondary"
                                onClick={clearSearch}
                            >
                                Clear Search
                            </button>
                        </div>
                    )}

                    <div className="aesop-shop-layout">
                        {/* Filter Sidebar */}
                        <FilterSidebar 
                            filters={filters} 
                            onFilterChange={handleFilterChange} 
                        />

                        {/* Products Grid */}
                        <div className="aesop-products-section">
                            <div className="aesop-products-header">
                                <h1 className="aesop-page-title">
                                    {filters.category === 'All' ? 'All Products' : filters.category}
                                </h1>
                                <p className="aesop-products-count">
                                    Showing {filteredProducts.length} of {products.length} products
                                </p>
                            </div>

                            {filteredProducts.length === 0 ? (
                                <div className="aesop-no-products">
                                    <p>No products found matching your criteria.</p>
                                    <button 
                                        className="aesop-button-primary"
                                        onClick={() => setFilters({
                                            category: 'All',
                                            priceMin: 0,
                                            priceMax: Infinity,
                                            sortBy: 'name',
                                            search: ''
                                        })}
                                    >
                                        Reset Filters
                                    </button>
                                </div>
                            ) : (
                                <div className="aesop-product-grid">
                                    {filteredProducts.map(product => (
                                        <ProductCard
                                            key={product.id}
                                            product={product}
                                            onAddToCart={handleAddToCart}
                                            onToggleWishlist={handleToggleWishlist}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}