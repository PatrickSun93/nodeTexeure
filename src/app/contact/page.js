'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function ContactPage() {
  const t = useTranslations('Contact');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const clearStatusTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clearStatusTimeoutRef.current) {
        clearTimeout(clearStatusTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('');
    setErrorMessage('');

    // Clear any pending success-message timeout
    if (clearStatusTimeoutRef.current) {
      clearTimeout(clearStatusTimeoutRef.current);
    }

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.fullName,
          email: formData.email,
          subject: formData.subject,
          message: formData.message,
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON response — fall through to the error branch */
      }

      if (res.ok && data?.status === 'SUCCESS') {
        setSubmitStatus('success');
        setFormData({ fullName: '', email: '', subject: '', message: '' });

        // Clear success message after 5 seconds
        clearStatusTimeoutRef.current = setTimeout(() => {
          setSubmitStatus('');
        }, 5000);
      } else {
        setErrorMessage(data?.message || t('errorMessage'));
        setSubmitStatus('error');
      }
    } catch (err) {
      console.error('Contact form submission failed:', err);
      setErrorMessage(t('errorMessage'));
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="noirae-page">
      <Header />
      
      <main className="noirae-contact-main">
        <div className="aesop-container">
          {/* Header Section */}
          <div className="noirae-contact-header">
            <h1 className="noirae-contact-title">{t('title')}</h1>
            <p className="noirae-contact-subtitle">
              {t('subtitle')}
            </p>
          </div>

          {/* Two Column Layout */}
          <div className="noirae-contact-grid">
            {/* Left Column - Send a Message */}
            <div className="noirae-contact-form-section">
              <h2 className="noirae-contact-section-title">{t('formHeading')}</h2>

              {submitStatus === 'success' && (
                <div className="noirae-contact-success" role="alert">
                  {t('successMessage')}
                </div>
              )}

              {submitStatus === 'error' && (
                <div
                  role="alert"
                  style={{
                    padding: 'var(--space-4)',
                    background: 'var(--noirae-error-bg)',
                    border: '1px solid var(--noirae-error)',
                    borderRadius: 'var(--radius-base)',
                    color: 'var(--noirae-error)',
                    fontSize: 'var(--font-size-sm)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  {errorMessage || t('errorMessage')}
                </div>
              )}

              <form onSubmit={handleSubmit} className="noirae-contact-form">
                <div className="noirae-contact-form-group">
                  <label htmlFor="fullName" className="noirae-contact-label">
                    {t('fullNameLabel')}
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="noirae-contact-input"
                    placeholder={t('fullNamePlaceholder')}
                  />
                </div>

                <div className="noirae-contact-form-group">
                  <label htmlFor="email" className="noirae-contact-label">
                    {t('emailLabel')}
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="noirae-contact-input"
                    placeholder={t('emailPlaceholder')}
                  />
                </div>

                <div className="noirae-contact-form-group">
                  <label htmlFor="subject" className="noirae-contact-label">
                    {t('subjectLabel')}
                  </label>
                  <input
                    id="subject"
                    name="subject"
                    type="text"
                    required
                    value={formData.subject}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="noirae-contact-input"
                    placeholder={t('subjectPlaceholder')}
                  />
                </div>

                <div className="noirae-contact-form-group">
                  <label htmlFor="message" className="noirae-contact-label">
                    {t('messageLabel')}
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    value={formData.message}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    rows={6}
                    className="noirae-contact-textarea"
                    placeholder={t('messagePlaceholder')}
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="noirae-contact-button"
                >
                  {isSubmitting ? t('sending') : t('submit')}
                </button>
              </form>
            </div>

            {/* Right Column - Other Ways to Connect */}
            <div className="noirae-contact-info-section">
              <h2 className="noirae-contact-section-title">{t('otherWaysHeading')}</h2>
              
              <div className="noirae-contact-info-cards">
                {/* Email Us */}
                <div className="noirae-contact-info-card">
                  <div className="noirae-contact-info-icon">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="noirae-contact-info-content">
                    <h3 className="noirae-contact-info-title">{t('emailUsTitle')}</h3>
                    <p className="noirae-contact-info-text">
                      {t('emailUsText')}
                    </p>
                    <a href="mailto:support@noirae.com" className="noirae-contact-info-link">
                      support@noirae.com
                    </a>
                  </div>
                </div>

                {/* Call Us */}
                <div className="noirae-contact-info-card">
                  <div className="noirae-contact-info-icon">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div className="noirae-contact-info-content">
                    <h3 className="noirae-contact-info-title">{t('callUsTitle')}</h3>
                    <p className="noirae-contact-info-text">
                      {t('callUsText')}
                    </p>
                    <a href="tel:+15551234567" className="noirae-contact-info-link">
                      +1 (555) 123-4567
                    </a>
                    <p className="noirae-contact-info-hours">
                      {t('callUsHours')}
                    </p>
                  </div>
                </div>

                {/* Visit Our Showroom */}
                <div className="noirae-contact-info-card">
                  <div className="noirae-contact-info-icon">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className="noirae-contact-info-content">
                    <h3 className="noirae-contact-info-title">{t('showroomTitle')}</h3>
                    <p className="noirae-contact-info-text">
                      {t('showroomText')}
                    </p>
                    <p className="noirae-contact-info-address">
                      123 Silk Avenue, Cashmere City, 10001
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}