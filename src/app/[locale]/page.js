"use client";

import Link from 'next/link';
import Head from 'next/head';
import { useTranslations } from 'next-intl';
import { useBackendHealth } from '../../lib';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import LazyImage from '../../components/LazyImage';
import { fetchSettings } from '../../lib/fetchSettings';
import { generateMetaTags, generateStructuredData, defaultSEO } from '../../lib/seo';
import { usePerformance } from '../../lib/usePerformance';
import { useRef, useState, useEffect } from 'react';

// Hero Section Component
function HeroSection() {
    const t = useTranslations('common');
    
    return (
        <section className="noirae-hero">
            <div className="aesop-container">
                <div className="aesop-hero-content">
                    <h1 className="noirae-hero-title">
                        Premium Bed Textures
                    </h1>
                    <p className="noirae-hero-subtitle">
                        Transform your bedroom with our luxurious collection of high-quality bed textures and linens
                    </p>
                    <Link href="/shop" className="noirae-cta-button">
                        {t('shop') || 'Shop Now'}
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
                    <LazyImage
                        src={images[currentIndex]}
                        alt={title ? `${title} — image ${currentIndex + 1} of ${images.length}` : `Product image ${currentIndex + 1} of ${images.length}`}
                        width={800}
                        height={600}
                        className="aesop-carousel-image"
                        priority={currentIndex === 0}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 800px"
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
    // One full-width, hero-like collection that scrubs on hover
    const images = Array.from({ length: 10 }, (_, i) => {
        const w = 800 + i * 40;
        const h = 600 + i * 30; // keeps 4:3 ratio
        return `/api/placeholder/${w}/${h}`;
    });
    const slug = 'luxury-cotton-sheets';
    const title = 'Luxury Cotton Sheets';

    return (
        <section className="aesop-section aesop-fullstrip aesop-fullstrip-hero">
            <ProductCard images={images} slug={slug} title={title} />
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
    const { isConnected, loading } = useBackendHealth();
    const [settings, setSettings] = useState(null);
    const performanceMetrics = usePerformance();
    const t = useTranslations('common');

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const s = await fetchSettings();
                console.log('Settings:', s);
                if (!mounted) return;
                setSettings(s);
                const title = s.siteTitle || s.site_name || 'Noiraé shop';
                if (typeof document !== 'undefined') {
                    document.title = title;
                }
            } catch (err) {
                // Keep defaults if fetching fails
                console.error('Failed to load settings on page:', err);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const siteName = settings?.site_name || 'Noiraé';
    
    // Generate SEO data for home page
    const homeMetaTags = generateMetaTags({
        title: 'Premium Bed Textures & Luxury Linens',
        description: 'Transform your bedroom with our luxurious collection of high-quality bed textures, premium linens, and home textiles. Shop Egyptian cotton sheets, silk pillowcases, and more.',
        keywords: 'bed textures, luxury linens, Egyptian cotton sheets, silk pillowcases, premium bedding, home textiles, bedroom decor, luxury bedding',
        url: '/',
        type: 'website'
    });

    const homeStructuredData = generateStructuredData('website');

    return (
        <>
            <Head>
                <title>{homeMetaTags.title}</title>
                <meta name="description" content={homeMetaTags.description} />
                <meta name="keywords" content={homeMetaTags.keywords} />
                <link rel="canonical" href={homeMetaTags.canonical} />
                
                {/* Open Graph */}
                <meta property="og:title" content={homeMetaTags.openGraph.title} />
                <meta property="og:description" content={homeMetaTags.openGraph.description} />
                <meta property="og:url" content={homeMetaTags.openGraph.url} />
                <meta property="og:type" content={homeMetaTags.openGraph.type} />
                
                {/* Twitter Card */}
                <meta name="twitter:card" content={homeMetaTags.twitter.card} />
                <meta name="twitter:title" content={homeMetaTags.twitter.title} />
                <meta name="twitter:description" content={homeMetaTags.twitter.description} />
                
                {/* Structured Data */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(homeStructuredData)
                    }}
                />
            </Head>
            
            <div className="noirae-page">
                <Header siteName={siteName} />
                <main className="noirae-main">
                    <HeroSection />
                    <FeaturedProducts />
                    <FeaturesSection />
                </main>
                <Footer />
                
                {/* Backend Health Status */}
                {loading && (
                    <div className="aesop-status aesop-status-loading">
                        {t('loading')}
                    </div>
                )}
                {!loading && !isConnected && (
                    <div className="aesop-status aesop-status-error">
                        Backend connection failed
                    </div>
                )}
            </div>
        </>
    );
}