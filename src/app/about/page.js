'use client';

import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

const Breadcrumb = () => {
  return (
    <div className="aesop-container">
      <Link href="/" className="aesop-breadcrumb-link">Home</Link>
      <span className="aesop-breadcrumb-separator">&gt;</span>
      <span className="aesop-breadcrumb-current">About</span>
    </div>
  );
};

const AboutContent = () => {
  return (
    <div className="aesop-container aesop-section">
      {/* Hero Section */}
      <div className="aesop-text-center aesop-mb-16">
        <h2 className="aesop-heading-2 aesop-mb-6">Crafting Premium Bed Textures Since 2010</h2>
        <p className="aesop-text-lg aesop-text-muted aesop-max-width-3xl aesop-mx-auto">
          At Noiraé, we believe that quality sleep begins with exceptional bedding. Our passion for creating 
          the finest bed textures has driven us to source the world's most luxurious materials and craft them 
          into products that transform your bedroom into a sanctuary of comfort.
        </p>
      </div>

      {/* Story Section */}
      <div className="aesop-grid aesop-grid-cols-2 aesop-gap-12 aesop-items-center aesop-mb-16">
        <div>
          <h3 className="aesop-heading-3 aesop-mb-6">Our Story</h3>
          <p className="aesop-text-muted aesop-mb-4">
            Founded in 2010 by textile enthusiasts Sarah and Michael Chen, Noiraé began as a small family 
            business with a simple mission: to bring hotel-quality bedding to everyday homes. What started 
            in a small workshop has grown into a trusted brand serving customers worldwide.
          </p>
          <p className="aesop-text-muted aesop-mb-4">
            Our journey has been guided by an unwavering commitment to quality, sustainability, and customer 
            satisfaction. Every product we create undergoes rigorous testing to ensure it meets our exacting 
            standards for comfort, durability, and style.
          </p>
          <p className="aesop-text-muted">
            Today, we're proud to offer an extensive collection of premium bed textures, from Egyptian cotton 
            sheets to bamboo fiber pillowcases, each designed to enhance your sleep experience.
          </p>
        </div>
        <div className="aesop-bg-muted aesop-h-96 aesop-rounded aesop-flex aesop-items-center aesop-justify-center">
          <span className="aesop-text-muted">Our Workshop Image</span>
        </div>
      </div>

      {/* Values Section */}
      <div className="aesop-mb-16">
        <h3 className="aesop-heading-3 aesop-text-center aesop-mb-12">Our Values</h3>
        <div className="aesop-grid aesop-grid-cols-3 aesop-gap-8">
          <div className="aesop-text-center">
            <div className="aesop-icon-container aesop-bg-primary-light aesop-mx-auto aesop-mb-4">
              <svg className="aesop-icon aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="aesop-heading-4 aesop-mb-3">Quality First</h4>
            <p className="aesop-text-muted">
              We source only the finest materials and employ skilled artisans to ensure every product 
              meets our exceptional quality standards.
            </p>
          </div>
          <div className="aesop-text-center">
            <div className="aesop-icon-container aesop-bg-primary-light aesop-mx-auto aesop-mb-4">
              <svg className="aesop-icon aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h4 className="aesop-heading-4 aesop-mb-3">Sustainability</h4>
            <p className="aesop-text-muted">
              We're committed to environmental responsibility, using eco-friendly materials and 
              sustainable manufacturing processes wherever possible.
            </p>
          </div>
          <div className="aesop-text-center">
            <div className="aesop-icon-container aesop-bg-primary-light aesop-mx-auto aesop-mb-4">
              <svg className="aesop-icon aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <h4 className="aesop-heading-4 aesop-mb-3">Customer Care</h4>
            <p className="aesop-text-muted">
              Your satisfaction is our priority. We provide exceptional customer service and stand 
              behind every product with our satisfaction guarantee.
            </p>
          </div>
        </div>
      </div>

      {/* Team Section */}
      <div className="aesop-mb-16">
        <h3 className="aesop-heading-3 aesop-text-center aesop-mb-12">Meet Our Team</h3>
        <div className="aesop-grid aesop-grid-cols-3 aesop-gap-8">
          <div className="aesop-text-center">
            <div className="aesop-avatar aesop-bg-muted aesop-mx-auto aesop-mb-4 aesop-flex aesop-items-center aesop-justify-center">
              <span className="aesop-text-muted">Sarah Chen</span>
            </div>
            <h4 className="aesop-heading-4 aesop-mb-2">Sarah Chen</h4>
            <p className="aesop-text-primary aesop-mb-3">Co-Founder & CEO</p>
            <p className="aesop-text-muted aesop-text-sm">
              With over 15 years in textile design, Sarah leads our product development and ensures 
              every item meets our quality standards.
            </p>
          </div>
          <div className="aesop-text-center">
            <div className="aesop-avatar aesop-bg-muted aesop-mx-auto aesop-mb-4 aesop-flex aesop-items-center aesop-justify-center">
              <span className="aesop-text-muted">Michael Chen</span>
            </div>
            <h4 className="aesop-heading-4 aesop-mb-2">Michael Chen</h4>
            <p className="aesop-text-primary aesop-mb-3">Co-Founder & COO</p>
            <p className="aesop-text-muted aesop-text-sm">
              Michael oversees operations and supply chain, ensuring our products reach customers 
              efficiently while maintaining our sustainability commitments.
            </p>
          </div>
          <div className="aesop-text-center">
            <div className="aesop-avatar aesop-bg-muted aesop-mx-auto aesop-mb-4 aesop-flex aesop-items-center aesop-justify-center">
              <span className="aesop-text-muted">Emma Rodriguez</span>
            </div>
            <h4 className="aesop-heading-4 aesop-mb-2">Emma Rodriguez</h4>
            <p className="aesop-text-primary aesop-mb-3">Head of Design</p>
            <p className="aesop-text-muted aesop-text-sm">
              Emma brings creativity and innovation to our collections, staying ahead of trends while 
              maintaining timeless appeal in our designs.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="aesop-bg-primary-light aesop-rounded aesop-p-8 aesop-text-center">
        <h3 className="aesop-heading-3 aesop-mb-4">Experience the Noiraé Difference</h3>
        <p className="aesop-text-muted aesop-mb-6 aesop-max-width-2xl aesop-mx-auto">
          Join thousands of satisfied customers who have transformed their sleep experience with our 
          premium bed textures. Discover the perfect bedding for your home today.
        </p>
        <Link 
          href="/shop" 
          className="aesop-btn aesop-btn-primary"
        >
          Shop Our Collection
        </Link>
      </div>
    </div>
  );
};



export default function AboutPage() {
  return (
    <div className="aesop-page">
      <Header />
      <main>
        <Breadcrumb />
        <AboutContent />
      </main>
      <Footer />
    </div>
  );
}