'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function ForgotPasswordPage() {
  const t = useTranslations('ForgotPassword');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch('/api/users/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (data.status === 'SUCCESS') {
        setSuccess(true);
        setEmail('');
      } else {
        setError(data.message || t('failedToSend'));
      }
    } catch (err) {
      setError(t('genericError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="noirae-page">
      <Header />

      <main className="noirae-login-main">
        <div className="noirae-login-container">
          {/* Header Section */}
          <div className="noirae-login-header">
            <h1 className="noirae-login-title">{t('title')}</h1>
            <p className="noirae-login-subtitle">
              {t('subtitle')}
            </p>
          </div>

          {/* Form Card */}
          <div className="noirae-login-card">
            {error && (
              <div className="noirae-login-error" role="alert">
                {error}
              </div>
            )}

            {success ? (
              <div className="noirae-login-success">
                <p>{t('successMessage')}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="noirae-login-form">
                {/* Email Field */}
                <div className="noirae-form-group">
                  <label htmlFor="email" className="noirae-form-label">
                    {t('emailLabel')}
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="noirae-form-input"
                    placeholder={t('emailPlaceholder')}
                  />
                </div>

                {/* Send Reset Link Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="noirae-login-button"
                >
                  {isLoading ? t('sending') : t('sendResetLink')}
                </button>
              </form>
            )}

            {/* Return to Login Link */}
            <div className="noirae-register-link">
              <Link href="/login" className="noirae-register-cta">
                {t('returnToLogin')}
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
