'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function ForgotPasswordPage() {
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
      // TODO: Implement actual password reset API call
      // For now, simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate success
      setSuccess(true);
      setEmail('');
      
      // In a real implementation, you would call your API:
      // const response = await fetch('/api/auth/forgot-password', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email }),
      // });
      // const data = await response.json();
      // if (!response.ok) {
      //   setError(data.message || 'Failed to send reset link');
      // } else {
      //   setSuccess(true);
      // }
    } catch (err) {
      setError('An error occurred. Please try again.');
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
            <h1 className="noirae-login-title">Forgot Your Password?</h1>
            <p className="noirae-login-subtitle">
              Enter your email and we&apos;ll send you a reset link.
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
                <p>Reset link sent! Please check your email.</p>
              </div>
            ) : (
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

                {/* Send Reset Link Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="noirae-login-button"
                >
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            )}

            {/* Return to Login Link */}
            <div className="noirae-register-link">
              <Link href="/login" className="noirae-register-cta">
                Return to Login
              </Link>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}

