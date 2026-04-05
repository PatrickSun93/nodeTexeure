"use client";

import Header from '../components/Header';
import Footer from '../components/Footer';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="aesop-page">
      <Header />
      <main>
        <section style={{ textAlign: 'center', padding: '6rem 1.5rem' }}>
          <div className="aesop-container">
            <h1 className="noirae-heading-hero" style={{ marginBottom: '1rem' }}>404</h1>
            <p className="noirae-body-text" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
              Page not found
            </p>
            <p className="noirae-body-text" style={{ color: 'var(--color-text-secondary)', marginBottom: '2.5rem' }}>
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/" className="nt-btn nt-btn-secondary">Back to Home</Link>
              <Link href="/shop" className="nt-btn nt-btn-primary">Browse Products</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
