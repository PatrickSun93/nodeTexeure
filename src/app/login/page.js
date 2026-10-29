'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

function LoginContent() {
  const t = useTranslations('SignIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const redirect = searchParams.get('redirect');
  const message = searchParams.get('message');

  // Where to send the user after authentication: honour an explicit ?redirect=,
  // otherwise route admins/staff to the dashboard and customers to their profile.
  const destinationFor = (session) => {
    if (redirect) return redirect;
    if (
      session?.user?.isAdmin ||
      session?.user?.role === 'admin' ||
      session?.user?.role === 'staff'
    ) {
      return '/dashboard';
    }
    return '/profile';
  };

  useEffect(() => {
    if (status === 'authenticated') {
      getSession().then((session) => {
        router.push(destinationFor(session));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
      const session = await getSession();
      router.push(destinationFor(session));
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
          {/* Welcome Section */}
          <div className="noirae-login-header">
            <h1 className="noirae-login-title">{t('title')}</h1>
            <p className="noirae-login-subtitle">
              {t('subtitle')}
            </p>
          </div>

          {/* Login Form Card */}
          <div className="noirae-login-card">
            {message && (
              <div
                role="status"
                style={{
                  padding: '12px 14px',
                  marginBottom: '1rem',
                  background: 'var(--noirae-success-bg)',
                  border: '1px solid var(--noirae-success)',
                  color: 'var(--noirae-success)',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                }}
              >
                {message}
              </div>
            )}

            {error && (
              <div className="noirae-login-error" role="alert">
                {error}
              </div>
            )}

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

              {/* Password Field */}
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

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="noirae-login-button"
              >
                {isLoading ? t('signingIn') : t('signIn')}
              </button>
            </form>

            <div
              style={{
                textAlign: 'center',
                marginTop: '1.5rem',
                fontSize: '0.9rem',
                color: 'var(--noirae-text-secondary)',
              }}
            >
              {t('noAccount')}{' '}
              <Link
                href="/register"
                style={{ color: 'var(--noirae-text-primary)', fontWeight: 500 }}
              >
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

export default function LoginPage() {
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
      <LoginContent />
    </Suspense>
  );
}
