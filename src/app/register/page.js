'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiRequest, isSuccessResponse } from '../../lib/api';

export default function Register() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    address: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const router = useRouter();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTermsChange = (e) => {
    setTermsAccepted(e.target.checked);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validation
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      setError('All fields are required');
      setLoading(false);
      return;
    }

    if (!termsAccepted) {
      setError('You must agree to the Terms of Service and Privacy Policy');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    try {
      const response = await apiRequest('/users/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password
        }),
      });

      if (isSuccessResponse(response)) {
        // Registration successful
        router.push('/signin?message=Registration successful! Please check your email to verify your account.');
      } else {
        // Registration failed
        setError(response.message || 'Registration failed. Please try again.');
      }
    } catch (error) {
      console.error('Registration error:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="noirae-auth">
      {/* ===== FORM SIDE ===== */}
      <div className="na-form-side">
        <div className="na-topbar">
          <Link href="/" className="na-back">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="14 6 8 12 14 18" />
            </svg>
            Back to store
          </Link>
        </div>

        <div className="na-form-inner">
          <div className="na-eyebrow">Join Noiraé</div>
          <h1 className="na-title">Create account</h1>
          <p className="na-subtitle">
            Save your details, track orders and enjoy early access to new collections.
          </p>

          <form className="na-form" onSubmit={handleSubmit}>
            <div className="na-grid-2">
              <div className="na-field">
                <label htmlFor="firstName" className="na-label">First name</label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  className="na-input"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="First name"
                />
              </div>
              <div className="na-field">
                <label htmlFor="lastName" className="na-label">Last name</label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  className="na-input"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="na-field">
              <label htmlFor="email" className="na-label">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="na-input"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
              />
            </div>

            <div className="na-field">
              <label htmlFor="password" className="na-label">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="na-input"
                value={formData.password}
                onChange={handleChange}
                placeholder="At least 6 characters"
              />
            </div>

            <div className="na-field">
              <label htmlFor="confirmPassword" className="na-label">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="na-input"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter your password"
              />
            </div>

            <label htmlFor="terms" className="na-terms">
              <input
                id="terms"
                type="checkbox"
                checked={termsAccepted}
                onChange={handleTermsChange}
                className="na-checkbox"
              />
              <span>
                I agree to the{' '}
                <Link href="/terms" className="na-inline-link">Terms of Service</Link>{' '}
                and{' '}
                <Link href="/privacy" className="na-inline-link">Privacy Policy</Link>
              </span>
            </label>

            {error && (
              <div className="na-error" role="alert">{error}</div>
            )}

            <button type="submit" disabled={loading} className="na-submit">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <div className="na-footer">
            Already have an account?{' '}
            <Link href="/login" className="na-inline-link">Sign in</Link>
          </div>
        </div>
      </div>

      {/* ===== IMAGE SIDE ===== */}
      <div className="na-image-side" aria-hidden="true">
        <img
          src="https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=1300"
          alt=""
          className="na-image"
        />
        <div className="na-scrim" />
        <Link href="/" className="na-wordmark">Noiraé</Link>
        <div className="na-caption">
          <div className="na-caption-quote">
            Become a member for 30-night trials, early access and a note from our founders.
          </div>
          <div className="na-caption-kicker">The Noiraé Atelier</div>
        </div>
      </div>

      <style>{`
        .noirae-auth {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 0.95fr 1.05fr;
          background: var(--noirae-bg-cream);
          color: var(--noirae-text-primary);
          font-family: var(--noirae-font-sans);
          font-weight: 300;
        }
        .na-form-side {
          display: flex;
          flex-direction: column;
          padding: 34px 44px;
        }
        .na-topbar { display: flex; justify-content: flex-start; }
        .na-back {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          letter-spacing: 0.06em;
          color: var(--noirae-text-secondary);
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .na-back:hover { color: var(--noirae-text-primary); }
        .na-form-inner {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          padding: 36px 0;
        }
        .na-eyebrow {
          font-size: 11px;
          letter-spacing: 0.26em;
          text-transform: uppercase;
          color: var(--noirae-accent-gold);
        }
        .na-title {
          font-family: var(--noirae-font-serif);
          font-weight: 500;
          font-size: 42px;
          line-height: 1.08;
          letter-spacing: -0.01em;
          color: var(--noirae-text-primary);
          margin: 12px 0 0;
        }
        .na-subtitle {
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--noirae-text-secondary);
          margin: 12px 0 0;
        }
        .na-form {
          margin-top: 28px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .na-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .na-field { display: flex; flex-direction: column; }
        .na-label {
          display: block;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--noirae-text-secondary);
          margin-bottom: 8px;
        }
        .na-input {
          width: 100%;
          background: var(--noirae-bg-white);
          border: 1px solid var(--noirae-border-dark);
          border-radius: 0;
          padding: 14px 15px;
          font-family: var(--noirae-font-sans);
          font-size: 14px;
          color: var(--noirae-text-primary);
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .na-input::placeholder { color: var(--noirae-text-light); }
        .na-input:focus {
          border-color: var(--noirae-accent-gold);
          box-shadow: 0 0 0 3px rgba(168, 134, 63, 0.12);
        }
        .na-terms {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          font-size: 13px;
          line-height: 1.5;
          color: var(--noirae-text-secondary);
          cursor: pointer;
        }
        .na-checkbox {
          width: 16px;
          height: 16px;
          margin-top: 2px;
          flex: 0 0 auto;
          accent-color: var(--noirae-accent-gold);
        }
        .na-inline-link {
          color: var(--noirae-text-primary);
          text-decoration: none;
          border-bottom: 1px solid var(--noirae-accent-gold-light);
          padding-bottom: 1px;
          transition: color 0.2s ease, border-color 0.2s ease;
        }
        .na-inline-link:hover {
          color: var(--noirae-accent-gold);
          border-color: var(--noirae-accent-gold);
        }
        .na-error {
          background: var(--noirae-error-bg);
          border: 1px solid var(--noirae-error);
          color: var(--noirae-error);
          font-size: 13px;
          line-height: 1.5;
          padding: 12px 14px;
        }
        .na-submit {
          width: 100%;
          height: 52px;
          margin-top: 4px;
          background: var(--noirae-charcoal);
          color: var(--noirae-bg-cream);
          border: none;
          border-radius: 0;
          font-family: var(--noirae-font-sans);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.25s ease;
        }
        .na-submit:hover:not(:disabled) { background: var(--noirae-accent-gold); }
        .na-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .na-footer {
          text-align: center;
          margin-top: 26px;
          font-size: 13.5px;
          color: var(--noirae-text-secondary);
        }
        .na-image-side {
          position: relative;
          overflow: hidden;
          min-height: 100vh;
          background: var(--noirae-bg-sand);
        }
        .na-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .na-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(42, 38, 33, 0.50) 0%, rgba(42, 38, 33, 0.12) 34%, rgba(42, 38, 33, 0.62) 100%);
        }
        .na-wordmark {
          position: absolute;
          top: 36px;
          right: 44px;
          font-family: var(--noirae-font-serif);
          font-weight: 600;
          font-size: 30px;
          letter-spacing: 0.14em;
          color: var(--noirae-bg-cream);
          text-decoration: none;
        }
        .na-caption {
          position: absolute;
          left: 44px;
          right: 44px;
          bottom: 48px;
          color: var(--noirae-bg-cream);
        }
        .na-caption-quote {
          font-family: var(--noirae-font-serif);
          font-weight: 500;
          font-size: 32px;
          line-height: 1.25;
          max-width: 460px;
        }
        .na-caption-kicker {
          margin-top: 18px;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--noirae-accent-bronze);
        }
        @media (max-width: 900px) {
          .noirae-auth { grid-template-columns: 1fr; }
          .na-image-side { display: none; }
          .na-form-side { padding: 30px 22px; }
          .na-title { font-size: 34px; }
        }
      `}</style>
    </div>
  );
}
