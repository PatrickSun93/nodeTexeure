"use client";

import Header from '../components/Header';
import Footer from '../components/Footer';
import Link from 'next/link';

export default function Error({ error, reset }) {
  return (
    <div className="aesop-page">
      <Header />
      <main>
        <section style={{ textAlign: 'center', padding: '6rem 1.5rem' }}>
          <div className="aesop-container">
            <h1 className="noirae-heading-hero" style={{ marginBottom: '1rem' }}>Something went wrong</h1>
            <p className="noirae-body-text" style={{ color: 'var(--color-text-secondary)', marginBottom: '2.5rem' }}>
              An unexpected error occurred. Please try again.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => reset()} className="nt-btn nt-btn-primary">Try Again</button>
              <Link href="/" className="nt-btn nt-btn-secondary">Back to Home</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
