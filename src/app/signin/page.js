'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

function SignInContent() {
  const t = useTranslations('SignIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const redirect = searchParams.get('redirect') || '/profile';

  useEffect(() => {
    if (status === 'authenticated') {
      router.push(redirect);
    }
  }, [status, router, redirect]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    setIsLoading(false);

    if (result?.error) {
      setError(t('invalidCredentials'));
    } else if (result?.ok) {
      router.refresh();
      router.push(redirect);
    } else {
      setError(t('unexpectedError'));
    }
  };

  if (status === 'loading') {
    return (
      <div className="noirae-page">
        <Header />
        <div className="noirae-loading">
          <div className="aesop-loading-spinner"></div>
          <p>{t('loading')}</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="noirae-page">
      <Header />

      <main className="noirae-login-main">
        <div className="noirae-login-container">
          <div className="noirae-login-header">
            <h1 className="noirae-login-title">{t('title')}</h1>
            <p className="noirae-login-subtitle">
              {t('subtitle')}
            </p>
          </div>

          <div className="noirae-login-card">
            {error && (
              <div className="noirae-login-error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="noirae-login-form">
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

              <div className="noirae-form-group">
                <div className="noirae-form-label-row">
                  <label htmlFor="password" className="noirae-form-label">
                    {t('passwordLabel')}
                  </label>
                  <Link href="/forgot-password" className="noirae-forgot-password">
                    {t('forgotPassword')}
                  </Link>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="noirae-form-input"
                  placeholder={t('passwordPlaceholder')}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="noirae-login-button"
              >
                {isLoading ? t('signingIn') : t('signIn')}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: '#6b7280' }}>
              {t('noAccount')}{' '}
              <Link href="/register" style={{ color: '#1a1a1a', fontWeight: 500 }}>
                {t('createAccount')}
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function SignInPage() {
  const t = useTranslations('SignIn');
  return (
    <Suspense
      fallback={
        <div className="noirae-page">
          <Header />
          <div className="noirae-loading">
            <div className="aesop-loading-spinner"></div>
            <p>{t('loading')}</p>
          </div>
          <Footer />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
