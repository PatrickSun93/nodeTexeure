'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiRequest, isSuccessResponse } from '../../lib/api';

function ResetPasswordForm() {
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: [],
    isValid: false
  });
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const resetToken = searchParams.get('token');
    if (resetToken) {
      setToken(resetToken);
    } else {
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, [searchParams]);

  // Password strength validation
  const validatePasswordStrength = (password) => {
    const requirements = [
      { test: password.length >= 8, message: 'At least 8 characters' },
      { test: /[A-Z]/.test(password), message: 'One uppercase letter' },
      { test: /[a-z]/.test(password), message: 'One lowercase letter' },
      { test: /\d/.test(password), message: 'One number' },
      { test: /[!@#$%^&*(),.?":{}|<>]/.test(password), message: 'One special character' }
    ];

    const passedRequirements = requirements.filter(req => req.test);

    let score = 0;
    let strengthText = '';
    let strengthColor = '';

    if (passedRequirements.length >= 5) {
      score = 4;
      strengthText = 'Very Strong';
      strengthColor = 'text-green-600';
    } else if (passedRequirements.length >= 4) {
      score = 3;
      strengthText = 'Strong';
      strengthColor = 'text-green-500';
    } else if (passedRequirements.length >= 3) {
      score = 2;
      strengthText = 'Medium';
      strengthColor = 'text-yellow-500';
    } else if (passedRequirements.length >= 2) {
      score = 1;
      strengthText = 'Weak';
      strengthColor = 'text-orange-500';
    } else {
      score = 0;
      strengthText = 'Very Weak';
      strengthColor = 'text-red-500';
    }

    return {
      score,
      strengthText,
      strengthColor,
      requirements,
      isValid: passedRequirements.length >= 4
    };
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'password') {
      const strength = validatePasswordStrength(value);
      setPasswordStrength(strength);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validation
    if (!formData.password || !formData.confirmPassword) {
      setError('Both password fields are required');
      setLoading(false);
      return;
    }

    if (!passwordStrength.isValid) {
      setError('Password does not meet security requirements');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await apiRequest('/users/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: token,
          newPassword: formData.password
        }),
      });

      if (isSuccessResponse(response)) {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login?message=Password reset successful! Please log in with your new password.');
        }, 3000);
      } else {
        setError(response.message || 'Password reset failed. Please try again.');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Champagne strength palette keyed off the computed score
  const strengthColor =
    passwordStrength.score <= 1 ? 'var(--noirae-error)' :
    passwordStrength.score === 2 ? 'var(--noirae-warning)' :
    'var(--noirae-success)';

  if (success) {
    return (
      <div className="rps-wrap">
        <div className="rps-card">
          <div className="rps-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="rps-eyebrow">Success</div>
          <h1 className="rps-title">Password reset</h1>
          <p className="rps-text">Your password has been updated successfully.</p>
          <p className="rps-note">Redirecting you to sign in…</p>
          <Link href="/login" className="rps-button">Go to sign in</Link>
        </div>

        <style>{`
          .rps-wrap {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px 22px;
            background: var(--noirae-bg-cream);
            font-family: var(--noirae-font-sans);
            font-weight: 300;
          }
          .rps-card {
            width: 100%;
            max-width: 440px;
            background: var(--noirae-bg-white);
            border: 1px solid var(--noirae-border-medium);
            padding: 48px 44px;
            text-align: center;
          }
          .rps-icon {
            width: 56px;
            height: 56px;
            margin: 0 auto 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
            background: var(--noirae-success-bg);
            color: var(--noirae-success);
          }
          .rps-eyebrow {
            font-size: 11px;
            letter-spacing: 0.26em;
            text-transform: uppercase;
            color: var(--noirae-accent-gold);
          }
          .rps-title {
            font-family: var(--noirae-font-serif);
            font-weight: 500;
            font-size: 38px;
            line-height: 1.1;
            color: var(--noirae-text-primary);
            margin: 10px 0 0;
          }
          .rps-text {
            font-size: 14.5px;
            line-height: 1.6;
            color: var(--noirae-text-secondary);
            margin: 14px 0 0;
          }
          .rps-note {
            font-size: 12.5px;
            color: var(--noirae-text-muted);
            margin: 8px 0 0;
          }
          .rps-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 50px;
            padding: 0 28px;
            margin-top: 28px;
            background: var(--noirae-charcoal);
            color: var(--noirae-bg-cream);
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            text-decoration: none;
            transition: background 0.25s ease;
          }
          .rps-button:hover { background: var(--noirae-accent-gold); }
        `}</style>
      </div>
    );
  }

  return (
    <div className="noirae-auth">
      {/* ===== IMAGE SIDE ===== */}
      <div className="rp-image-side" aria-hidden="true">
        <img
          src="https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&q=80&w=1300"
          alt=""
          className="rp-image"
        />
        <div className="rp-scrim" />
        <Link href="/" className="rp-wordmark">Noiraé</Link>
        <div className="rp-caption">
          <div className="rp-caption-quote">Rest easy — we&apos;ll help you back in.</div>
          <div className="rp-caption-kicker">Silk &amp; Cashmere</div>
        </div>
      </div>

      {/* ===== FORM SIDE ===== */}
      <div className="rp-form-side">
        <div className="rp-topbar">
          <Link href="/login" className="rp-back">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="14 6 8 12 14 18" />
            </svg>
            Back to sign in
          </Link>
        </div>

        <div className="rp-form-inner">
          <div className="rp-eyebrow">Reset</div>
          <h1 className="rp-title">Set a new password</h1>
          <p className="rp-subtitle">Choose a strong new password to keep your account secure.</p>

          <form className="rp-form" onSubmit={handleSubmit}>
            <div className="rp-field">
              <label htmlFor="password" className="rp-label">New password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="rp-input"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your new password"
              />

              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="rp-strength">
                  <div className="rp-strength-row">
                    <span className="rp-strength-caption">Password strength</span>
                    <span className="rp-strength-label" style={{ color: strengthColor }}>
                      {passwordStrength.strengthText}
                    </span>
                  </div>
                  <div className="rp-strength-track">
                    <div
                      className="rp-strength-fill"
                      style={{
                        width: `${(passwordStrength.score + 1) * 20}%`,
                        background: strengthColor
                      }}
                    ></div>
                  </div>

                  {/* Password Requirements */}
                  <div className="rp-reqs">
                    <p className="rp-reqs-title">Password requirements</p>
                    <ul className="rp-reqs-list">
                      {passwordStrength.requirements?.map((req, index) => (
                        <li
                          key={index}
                          className="rp-req"
                          style={{ color: req.test ? 'var(--noirae-success)' : 'var(--noirae-text-muted)' }}
                        >
                          <span className="rp-req-mark">{req.test ? '✓' : '○'}</span>
                          {req.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="rp-field">
              <label htmlFor="confirmPassword" className="rp-label">Confirm new password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className={`rp-input${
                  formData.confirmPassword && formData.password !== formData.confirmPassword
                    ? ' rp-input--error'
                    : ''
                }`}
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your new password"
              />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="rp-hint" style={{ color: 'var(--noirae-error)' }}>Passwords do not match</p>
              )}
              {formData.confirmPassword && formData.password === formData.confirmPassword && formData.password && (
                <p className="rp-hint" style={{ color: 'var(--noirae-success)' }}>
                  <span className="rp-req-mark">✓</span>Passwords match
                </p>
              )}
            </div>

            {error && (
              <div className="rp-error" role="alert">{error}</div>
            )}

            <button type="submit" disabled={loading || !token} className="rp-submit">
              {loading ? 'Resetting password…' : 'Reset password'}
            </button>
          </form>

          <div className="rp-footer">
            Remember your password?{' '}
            <Link href="/login" className="rp-inline-link">Sign in</Link>
          </div>
        </div>
      </div>

      <style>{`
        .noirae-auth {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          background: var(--noirae-bg-cream);
          color: var(--noirae-text-primary);
          font-family: var(--noirae-font-sans);
          font-weight: 300;
        }
        .rp-image-side {
          position: relative;
          overflow: hidden;
          min-height: 100vh;
          background: var(--noirae-bg-sand);
        }
        .rp-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .rp-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(42, 38, 33, 0.50) 0%, rgba(42, 38, 33, 0.12) 34%, rgba(42, 38, 33, 0.60) 100%);
        }
        .rp-wordmark {
          position: absolute;
          top: 36px;
          left: 44px;
          font-family: var(--noirae-font-serif);
          font-weight: 600;
          font-size: 30px;
          letter-spacing: 0.14em;
          color: var(--noirae-bg-cream);
          text-decoration: none;
        }
        .rp-caption {
          position: absolute;
          left: 44px;
          right: 44px;
          bottom: 48px;
          color: var(--noirae-bg-cream);
        }
        .rp-caption-quote {
          font-family: var(--noirae-font-serif);
          font-weight: 500;
          font-size: 32px;
          line-height: 1.25;
          max-width: 420px;
        }
        .rp-caption-kicker {
          margin-top: 18px;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--noirae-accent-bronze);
        }
        .rp-form-side {
          display: flex;
          flex-direction: column;
          padding: 34px 44px;
        }
        .rp-topbar { display: flex; justify-content: flex-end; }
        .rp-back {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          letter-spacing: 0.06em;
          color: var(--noirae-text-secondary);
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .rp-back:hover { color: var(--noirae-text-primary); }
        .rp-form-inner {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          width: 100%;
          max-width: 400px;
          margin: 0 auto;
          padding: 36px 0;
        }
        .rp-eyebrow {
          font-size: 11px;
          letter-spacing: 0.26em;
          text-transform: uppercase;
          color: var(--noirae-accent-gold);
        }
        .rp-title {
          font-family: var(--noirae-font-serif);
          font-weight: 500;
          font-size: 42px;
          line-height: 1.08;
          letter-spacing: -0.01em;
          color: var(--noirae-text-primary);
          margin: 12px 0 0;
        }
        .rp-subtitle {
          font-size: 14.5px;
          line-height: 1.6;
          color: var(--noirae-text-secondary);
          margin: 12px 0 0;
        }
        .rp-form {
          margin-top: 30px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .rp-field { display: flex; flex-direction: column; }
        .rp-label {
          display: block;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--noirae-text-secondary);
          margin-bottom: 8px;
        }
        .rp-input {
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
        .rp-input::placeholder { color: var(--noirae-text-light); }
        .rp-input:focus {
          border-color: var(--noirae-accent-gold);
          box-shadow: 0 0 0 3px rgba(168, 134, 63, 0.12);
        }
        .rp-input--error { border-color: var(--noirae-error); }
        .rp-input--error:focus {
          border-color: var(--noirae-error);
          box-shadow: 0 0 0 3px rgba(181, 101, 77, 0.14);
        }
        .rp-strength { margin-top: 12px; }
        .rp-strength-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .rp-strength-caption {
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--noirae-text-muted);
        }
        .rp-strength-label {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.06em;
        }
        .rp-strength-track {
          width: 100%;
          height: 4px;
          border-radius: 2px;
          overflow: hidden;
          background: var(--noirae-border-medium);
        }
        .rp-strength-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.25s ease, background 0.25s ease;
        }
        .rp-reqs {
          margin-top: 14px;
          padding: 14px 16px;
          background: var(--noirae-bg-light-gray);
          border: 1px solid var(--noirae-border-light);
        }
        .rp-reqs-title {
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--noirae-text-secondary);
          margin: 0 0 10px;
        }
        .rp-reqs-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .rp-req {
          display: flex;
          align-items: center;
          font-size: 12.5px;
        }
        .rp-req-mark {
          display: inline-block;
          width: 16px;
          margin-right: 8px;
          text-align: center;
        }
        .rp-hint {
          display: flex;
          align-items: center;
          margin-top: 8px;
          font-size: 12px;
        }
        .rp-error {
          background: var(--noirae-error-bg);
          border: 1px solid var(--noirae-error);
          color: var(--noirae-error);
          font-size: 13px;
          line-height: 1.5;
          padding: 12px 14px;
        }
        .rp-submit {
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
        .rp-submit:hover:not(:disabled) { background: var(--noirae-accent-gold); }
        .rp-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .rp-footer {
          text-align: center;
          margin-top: 26px;
          font-size: 13.5px;
          color: var(--noirae-text-secondary);
        }
        .rp-inline-link {
          color: var(--noirae-text-primary);
          text-decoration: none;
          border-bottom: 1px solid var(--noirae-accent-gold-light);
          padding-bottom: 1px;
          transition: color 0.2s ease, border-color 0.2s ease;
        }
        .rp-inline-link:hover {
          color: var(--noirae-accent-gold);
          border-color: var(--noirae-accent-gold);
        }
        @media (max-width: 900px) {
          .noirae-auth { grid-template-columns: 1fr; }
          .rp-image-side { display: none; }
          .rp-form-side { padding: 30px 22px; }
          .rp-title { font-size: 34px; }
        }
      `}</style>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
