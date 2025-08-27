'use client';

import Link from 'next/link';
import { useBackendHealth } from '../lib';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useRef, useState, useEffect } from 'react';

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
function ProductCard({ images = [], slug, title }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAutoplay, setIsAutoplay] = useState(false);
    const containerRef = useRef(null);
    const idleTimeoutRef = useRef(null);
    const autoplayIntervalRef = useRef(null);

    const clearTimers = () => {
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current);
    };

    const startIdleTimer = () => {
        clearTimers();
        idleTimeoutRef.current = setTimeout(() => {
            setIsAutoplay(true);
        }, 3000); // start after 3s
    };

    // Handle mouse move (scrub)
    const handleMouseMove = (e) => {
        setIsAutoplay(false);
        if (!containerRef.current || images.length === 0) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = Math.min(Math.max(x / rect.width, 0), 1);
        const nextIndex = Math.min(images.length - 1, Math.floor(ratio * images.length));
        setCurrentIndex(nextIndex);
    };

    const handleMouseLeave = () => {
        setCurrentIndex(0);
        startIdleTimer();
    };

    // Autoplay effect
    // 1200ms per frame when autoplay is ON
    // Resets when user interacts (mouse move)
    useEffect(() => {
        if (isAutoplay && images.length > 0) {
            if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current);
            autoplayIntervalRef.current = setInterval(() => {
                setCurrentIndex((prev) => (prev + 1) % images.length);
            }, 1200);
        } else {
            if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current);
        }
        return () => {
            if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current);
        };
    }, [isAutoplay, images.length]);

    // Start idle timer on mount
    useEffect(() => {
        startIdleTimer();
        return () => clearTimers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const progressPercent = images.length > 1 ? (currentIndex / (images.length - 1)) * 100 : 0;

    return (
        <div className="aesop-product-card">
            <Link href={slug ? `/products/${slug}` : '#'}>
                <div
                    ref={containerRef}
                    className="aesop-product-image-carousel"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    aria-label="Product image gallery"
                    role="img"
                >
                    <img
                        src={images[currentIndex]}
                        alt={title ? `${title} — image ${currentIndex + 1} of ${images.length}` : `Product image ${currentIndex + 1} of ${images.length}`}
                        className="aesop-carousel-image"
                    />
                    <div className="aesop-image-counter">{currentIndex + 1}/{images.length}</div>
                    {/* Optional dots indicators retained for visual aid */}
                    <div className="aesop-image-indicators">
                        {images.map((_, i) => (
                            <span key={i} className={`aesop-indicator ${i === currentIndex ? 'active' : ''}`}></span>
                        ))}
                    </div>
                    {/* Thin progress bar */}
                    <div className="aesop-carousel-progress" aria-hidden="true">
                        <div className="aesop-carousel-progress-bar" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                </div>
            </Link>
        </div>
    );
}

// Featured Products Component (now a gallery of image collections)
function FeaturedProducts() {
    // Generate image collections (10 images each) with consistent 4:3 aspect ratio.
    // Use base 800x600 and scale by a factor to keep variety while preserving ratio.
    const generateImages = () => Array.from({ length: 10 }, (_, i) => {
        const width = 800 + i * 40;   // maintains 4:3 when paired with height increment below
        const height = 600 + i * 30;  // 40:30 == 4:3
        return `/api/placeholder/${width}/${height}`;
    });

    const slugToTitle = (slug) => slug
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');

    const galleries = [
        { slug: 'luxury-cotton-sheets', title: slugToTitle('luxury-cotton-sheets'), images: generateImages() },
        { slug: 'silk-pillowcase-set', title: slugToTitle('silk-pillowcase-set'), images: generateImages() },
        { slug: 'memory-foam-mattress', title: slugToTitle('memory-foam-mattress'), images: generateImages() },
        { slug: 'bamboo-duvet-cover', title: slugToTitle('bamboo-duvet-cover'), images: generateImages() }
    ];

    return (
        <section className="aesop-section aesop-fullstrip">
            <div className="aesop-container">
                <h2 className="aesop-section-title">Featured Collections</h2>
                <p className="aesop-section-subtitle">Hover to scrub through each collection</p>
            </div>
            <div className="aesop-strip-row" role="list" aria-label="Featured Collections">
                {galleries.map((g, index) => (
                    <div key={index} className="aesop-strip-item" role="listitem">
                        <ProductCard images={g.images} slug={g.slug} title={g.title} />
                    </div>
                ))}
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
