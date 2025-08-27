'use client';

import Link from 'next/link';
import { useBackendHealth } from '../lib';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useRef, useState } from 'react';

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

// Product Image Collection Component (mouse-move carousel)
function ProductCard({ images = [] }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const containerRef = useRef(null);

    const handleMouseMove = (e) => {
        if (!containerRef.current || images.length === 0) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = Math.min(Math.max(x / rect.width, 0), 1);
        const nextIndex = Math.min(images.length - 1, Math.floor(ratio * images.length));
        setCurrentIndex(nextIndex);
    };

    const handleMouseLeave = () => {
        // Optionally reset to the first image on leave for a clean look
        setCurrentIndex(0);
    };

    return (
        <div className="aesop-product-card">
            <div
                ref={containerRef}
                className="aesop-product-image-carousel"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <img
                    src={images[currentIndex]}
                    alt={`Product image ${currentIndex + 1}`}
                    className="aesop-carousel-image"
                />
                <div className="aesop-image-counter">{currentIndex + 1}/{images.length}</div>
                <div className="aesop-image-indicators">
                    {images.map((_, i) => (
                        <span key={i} className={`aesop-indicator ${i === currentIndex ? 'active' : ''}`}></span>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Featured Products Component (now a gallery of image collections)
function FeaturedProducts() {
    // Generate image collections (10 images each). Using placeholder API with slight size variation for visual variety.
    const generateImages = (base) => Array.from({ length: 10 }, (_, i) => `/api/placeholder/${base + i}/${base + i}`);

    const galleries = [
        { images: generateImages(600) },
        { images: generateImages(610) },
        { images: generateImages(620) },
        { images: generateImages(630) }
    ];

    return (
        <section className="aesop-section">
            <div className="aesop-container">
                <h2 className="aesop-section-title">Featured Products</h2>
                <p className="aesop-section-subtitle">Hover and move your mouse to explore different angles</p>
                <div className="aesop-product-grid">
                    {galleries.map((g, index) => (
                        <ProductCard key={index} images={g.images} />
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
