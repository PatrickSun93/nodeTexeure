'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      getSession().then((session) => {
        if (session?.user?.isAdmin || session?.user?.role === 'admin' || session?.user?.role === 'staff') {
          router.push('/dashboard');
        } else {
          // Customer is authenticated but on admin login page, send them to profile
          router.push('/profile');
        }
      });
    }
  }, [status, router]);

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
      setError('Login failed. Please check your credentials.');
    } else if (result?.ok) {
      router.refresh();
      const session = await getSession();
      if (session?.user?.isAdmin || session?.user?.role === 'admin' || session?.user?.role === 'staff') {
        router.push('/dashboard');
      } else {
        // Customer logged in on admin page, redirect to profile
        router.push('/profile');
      }
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
          {/* Welcome Section */}
          <div className="noirae-login-header">
            <h1 className="noirae-login-title">Admin Login</h1>
            <p className="noirae-login-subtitle">
              Sign in to access the admin dashboard.
            </p>
          </div>

          {/* Login Form Card */}
          <div className="noirae-login-card">
            {error && (
              <div className="noirae-login-error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="noirae-login-form">
              {/* Email Field */}
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

              {/* Password Field */}
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

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="noirae-login-button"
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>

          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
