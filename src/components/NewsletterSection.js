'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function NewsletterSection() {
  const t = useTranslations('Newsletter');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(''); // 'success', 'error', or ''
  const [isSubmitting, setIsSubmitting] = useState(false);
  const statusTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    setStatus('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON response — fall through to the error branch */
      }

      if (res.ok && data?.status === 'SUCCESS') {
        setStatus('success');
        setEmail('');
        statusTimeoutRef.current = setTimeout(() => setStatus(''), 3000);
      } else {
        setStatus('error');
      }
    } catch (err) {
      console.error('Newsletter subscription failed:', err);
      setStatus('error');
    } finally {
      setIsSubmitting(false);
    }
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
              disabled={isSubmitting}
              required
            />
            <button type="submit" className="noirae-btn-primary" disabled={isSubmitting}>
              {isSubmitting ? t('subscribing') : t('subscribe')}
            </button>
          </form>

          {status === 'success' && (
            <p className="noirae-newsletter-success">{t('successMessage')}</p>
          )}

          {status === 'error' && (
            <p
              className="noirae-newsletter-success"
              style={{ color: 'var(--noirae-error)' }}
            >
              {t('errorMessage')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
