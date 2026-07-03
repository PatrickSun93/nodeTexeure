'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function NewsletterSection() {
  const t = useTranslations('Newsletter');
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
          <h2 className="noirae-heading-2">{t('heading')}</h2>
          <p className="noirae-newsletter-description">
            {t('description')}
          </p>

          <form onSubmit={handleSubmit} className="noirae-newsletter-form">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="noirae-newsletter-input"
              required
            />
            <button type="submit" className="noirae-btn-primary">
              {t('subscribe')}
            </button>
          </form>

          {status === 'success' && (
            <p className="noirae-newsletter-success">{t('successMessage')}</p>
          )}
        </div>
      </div>
    </section>
  );
}
