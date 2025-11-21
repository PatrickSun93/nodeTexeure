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
      // Redirect to dashboard for admin/staff only
      getSession().then((session) => {
        if (session?.user?.isAdmin || session?.user?.role === 'admin' || session?.user?.role === 'staff') {
          router.push('/dashboard');
        } else {
          // If somehow a customer is authenticated, sign them out
          setError('Access denied. Only admin and staff can login.');
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
      // Check if it's an access denied error
      if (result.error.includes('Access denied') || result.error.includes('not allowed to login')) {
        setError('Customer accounts are not allowed to login. This site is for admin and staff only.');
      } else {
        setError('Login failed. Please check your credentials.');
      }
    } else if (result?.ok) {
      // Refresh router to ensure session is updated, then redirect
      router.refresh();
      // Get the updated session to check user role
      const session = await getSession();
      if (session?.user?.isAdmin || session?.user?.role === 'admin' || session?.user?.role === 'staff') {
        router.push('/dashboard');
      } else {
        // This shouldn't happen since customers can't login, but just in case
        setError('Access denied. Only admin and staff can login.');
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
