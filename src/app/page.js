'use client';

import Link from 'next/link';
import { useBackendHealth } from '../lib';
import Header from '../components/Header';

// Hero Section Component
function HeroSection() {
    return (
        <section className="aesop-hero">
            <div className="aesop-container">
                <div className="aesop-hero-content">
                    <h1 className="aesop-hero-title">
                        Premium Bed Textures
                    </h1>
                    <p className="aesop-hero-subtitle">
                        Transform your bedroom with our luxurious collection of high-quality bed textures and linens
                    </p>
                    <Link href="/shop" className="aesop-button-primary aesop-button-large">
                        Shop Now
                    </Link>
                </div>
            </div>
        </section>
    );
}

// Product Card Component
function ProductCard({ name, price, image, isNew = false }) {
    return (
        <div className="aesop-product-card">
            <div className="aesop-product-image">
                <img src={image} alt={name} />
                {isNew && <span className="aesop-product-badge">New</span>}
            </div>
            <div className="aesop-product-info">
                <h3 className="aesop-product-name">{name}</h3>
                <p className="aesop-product-price">${price}</p>
            </div>
        </div>
    );
}

// Featured Products Component
function FeaturedProducts() {
    const products = [
        { name: "Luxury Cotton Sheets", price: "299", image: "/api/placeholder/300/300", isNew: true },
        { name: "Silk Pillowcase Set", price: "149", image: "/api/placeholder/300/300" },
        { name: "Bamboo Duvet Cover", price: "199", image: "/api/placeholder/300/300" },
        { name: "Linen Throw Blanket", price: "89", image: "/api/placeholder/300/300", isNew: true }
    ];

    return (
        <section className="aesop-section">
            <div className="aesop-container">
                <h2 className="aesop-section-title">Featured Products</h2>
                <div className="aesop-product-grid">
                    {products.map((product, index) => (
                        <ProductCard key={index} {...product} />
                    ))}
                </div>
            </div>
        </section>
    );
}

// Features Section Component
function FeaturesSection() {
    const features = [
        {
            title: "Premium Quality",
            description: "Crafted from the finest materials for ultimate comfort and durability",
            icon: "✨"
        },
        {
            title: "Sustainable",
            description: "Ethically sourced and environmentally conscious production methods",
            icon: "🌱"
        },
        {
            title: "Expert Craftsmanship",
            description: "Meticulously designed by textile artisans with decades of experience",
            icon: "👥"
        }
    ];

    return (
        <section className="aesop-section aesop-features">
            <div className="aesop-container">
                <div className="aesop-features-grid">
                    {features.map((feature, index) => (
                        <div key={index} className="aesop-feature-card">
                            <div className="aesop-feature-icon">{feature.icon}</div>
                            <h3 className="aesop-feature-title">{feature.title}</h3>
                            <p className="aesop-feature-description">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// Footer Component
function Footer() {
    return (
        <footer className="aesop-footer">
            <div className="aesop-container">
                <div className="aesop-footer-content">
                    <div className="aesop-footer-section">
                        <h3 className="aesop-footer-title">Furniro</h3>
                        <p className="aesop-footer-text">
                            Premium bed textures and linens for the discerning home.
                        </p>
                    </div>
                    <div className="aesop-footer-section">
                        <h4 className="aesop-footer-subtitle">Shop</h4>
                        <ul className="aesop-footer-links">
                            <li><Link href="/shop">All Products</Link></li>
                            <li><Link href="/shop?category=sheets">Sheets</Link></li>
                            <li><Link href="/shop?category=pillows">Pillows</Link></li>
                            <li><Link href="/shop?category=blankets">Blankets</Link></li>
                        </ul>
                    </div>
                    <div className="aesop-footer-section">
                        <h4 className="aesop-footer-subtitle">Support</h4>
                        <ul className="aesop-footer-links">
                            <li><Link href="/contact">Contact</Link></li>
                            <li><Link href="/about">About</Link></li>
                            <li><Link href="/shipping">Shipping</Link></li>
                            <li><Link href="/returns">Returns</Link></li>
                        </ul>
                    </div>
                    <div className="aesop-footer-section">
                        <h4 className="aesop-footer-subtitle">Connect</h4>
                        <ul className="aesop-footer-links">
                            <li><a href="#">Newsletter</a></li>
                            <li><a href="#">Instagram</a></li>
                            <li><a href="#">Pinterest</a></li>
                        </ul>
                    </div>
                </div>
                <div className="aesop-footer-bottom">
                    <p>&copy; 2024 Furniro. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}

export default function Home() {
    const { isHealthy, isLoading } = useBackendHealth();

    return (
        <div className="aesop-page">
            <Header />
            <main>
                <HeroSection />
                <FeaturedProducts />
                <FeaturesSection />
            </main>
            <Footer />
            
            {/* Backend Health Status */}
            {isLoading && (
                <div className="aesop-status aesop-status-loading">
                    Checking backend connection...
                </div>
            )}
            {!isLoading && !isHealthy && (
                <div className="aesop-status aesop-status-error">
                    Backend connection failed
                </div>
            )}
        </div>
    );
}
