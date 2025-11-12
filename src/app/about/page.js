"use client";

import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="aesop-page">
      <Header />
      
      <main>
        {/* Hero Section */}
        <section className="noirae-about-hero">
          <div className="aesop-container">
            <h1 className="noirae-heading-hero">Our Story</h1>
            <p className="noirae-about-hero-subtitle">
              The journey of creating the world&apos;s finest bedding
            </p>
          </div>
        </section>

        {/* Story Section */}
        <section className="noirae-about-story">
          <div className="aesop-container">
            <div className="noirae-about-story-content">
              <div className="noirae-about-story-text">
                <h2 className="noirae-heading-2">The Art of Comfort</h2>
                <p className="noirae-body-text">
                  Founded in 2010, Noiraé was born from a simple belief: that quality sleep 
                  begins with exceptional bedding. What started as a passion project in a small 
                  atelier has grown into a global destination for those who appreciate the finer 
                  things in life.
                </p>
                <p className="noirae-body-text">
                  Our founder, inspired by travels through the silk roads of Asia and the 
                  cashmere valleys of Mongolia, set out to create a collection that would bring 
                  these luxurious materials to bedrooms around the world. Every piece in our 
                  collection tells a story of craftsmanship, sustainability, and timeless elegance.
                </p>
              </div>
              <div className="noirae-about-story-image">
                <img src="/api/placeholder/600/800" alt="Noiraé atelier" />
              </div>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="noirae-about-values">
          <div className="aesop-container">
            <h2 className="noirae-heading-1 text-center">Our Values</h2>
            
            <div className="noirae-values-detailed-grid">
              <div className="noirae-value-detailed">
                <div className="noirae-value-image-wrapper">
                  <img src="/api/placeholder/400/300" alt="Quality craftsmanship" />
                </div>
                <h3 className="noirae-heading-3">Exceptional Quality</h3>
                <p>
                  We source only the finest materials from trusted suppliers around the world. 
                  Each piece undergoes rigorous quality control to ensure it meets our exacting 
                  standards.
                </p>
              </div>

              <div className="noirae-value-detailed">
                <div className="noirae-value-image-wrapper">
                  <img src="/api/placeholder/400/300" alt="Sustainable practices" />
                </div>
                <h3 className="noirae-heading-3">Sustainability</h3>
                <p>
                  From ethical sourcing to eco-friendly packaging, we&apos;re committed to 
                  minimizing our environmental impact while supporting the communities we work with.
                </p>
              </div>

              <div className="noirae-value-detailed">
                <div className="noirae-value-image-wrapper">
                  <img src="/api/placeholder/400/300" alt="Artisan craftsmanship" />
                </div>
                <h3 className="noirae-heading-3">Artisan Craftsmanship</h3>
                <p>
                  Every product is crafted by skilled artisans who have honed their craft over 
                  decades. Their expertise ensures that every stitch, every weave is perfect.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Timeline Section */}
        <section className="noirae-about-timeline">
          <div className="aesop-container">
            <h2 className="noirae-heading-1 text-center">Our Journey</h2>
            
            <div className="noirae-timeline">
              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2010</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">The Beginning</h3>
                  <p>
                    Noiraé was founded in a small atelier with a vision to create the 
                    world&apos;s finest bedding from natural luxury materials.
                  </p>
                </div>
              </div>

              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2013</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">First Collection Launch</h3>
                  <p>
                    Launched our signature silk collection, featuring premium mulberry silk 
                    sourced directly from sustainable farms in China.
                  </p>
                </div>
              </div>

              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2016</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">Cashmere Innovation</h3>
                  <p>
                    Introduced our revolutionary cashmere bedding line, bringing the softness 
                    of Mongolian cashmere to the bedroom.
                  </p>
                </div>
              </div>

              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2020</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">Global Expansion</h3>
                  <p>
                    Expanded our reach to serve customers in over 50 countries, bringing 
                    luxury bedding to homes worldwide.
                  </p>
                </div>
              </div>

              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2024</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">Sustainability Commitment</h3>
                  <p>
                    Achieved carbon-neutral operations and launched our circular economy 
                    initiative for product recycling and reuse.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="noirae-about-cta">
          <div className="aesop-container">
            <div className="noirae-about-cta-content">
              <h2 className="noirae-heading-2">Experience the Noiraé Difference</h2>
              <p className="noirae-body-text">
                Discover our collection of luxury bedding and transform your bedroom into a sanctuary of comfort.
              </p>
              <div className="noirae-about-cta-actions">
                <Link href="/shop" className="noirae-btn-primary noirae-btn-large">
                  Shop Our Collection
                </Link>
                <Link href="/contact" className="noirae-btn-secondary noirae-btn-large">
                  Get in Touch
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
}
