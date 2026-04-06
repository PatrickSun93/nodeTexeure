'use client';

import { useState, useRef, useEffect } from 'react';

export default function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(''); // 'success', 'error', or ''
  const statusTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    setStatus('success');
    setEmail('');
    statusTimeoutRef.current = setTimeout(() => setStatus(''), 3000);
  };

  return (
    <section className="noirae-newsletter-section">
      <div className="aesop-container">
        <div className="noirae-newsletter-content">
          <h2 className="noirae-heading-2">Join Our Community</h2>
          <p className="noirae-newsletter-description">
            Subscribe to receive exclusive offers, styling tips, and early access to new collections
          </p>

          <form onSubmit={handleSubmit} className="noirae-newsletter-form">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="noirae-newsletter-input"
              required
            />
            <button type="submit" className="noirae-btn-primary">
              Subscribe
            </button>
          </form>

          {status === 'success' && (
            <p className="noirae-newsletter-success">Thank you for subscribing!</p>
          )}
        </div>
      </div>
    </section>
  );
}
