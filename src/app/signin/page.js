'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function SignInPage() {
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
      setError('Invalid email or password. Please try again.');
    } else if (result?.ok) {
      router.refresh();
      router.push(redirect);
    } else {
      setError('An unexpected error occurred.');
    }
  };

  if (status === 'loading') {
    return (
      <div className="noirae-page">
        <Header />
        <div className="noirae-loading">
          <div className="aesop-loading-spinner"></div>
          <p>Loading...</p>
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
            <h1 className="noirae-login-title">Welcome Back</h1>
            <p className="noirae-login-subtitle">
              Sign in to your account to view orders, manage your wishlist, and more.
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
                  Email
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
                  placeholder="you@example.com"
                />
              </div>

              <div className="noirae-form-group">
                <div className="noirae-form-label-row">
                  <label htmlFor="password" className="noirae-form-label">
                    Password
                  </label>
                  <Link href="/forgot-password" className="noirae-forgot-password">
                    Forgot password?
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
                  placeholder="Enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="noirae-login-button"
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: '#6b7280' }}>
              Don&apos;t have an account?{' '}
              <Link href="/register" style={{ color: '#1a1a1a', fontWeight: 500 }}>
                Create one
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
