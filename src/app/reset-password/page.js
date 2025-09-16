'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiRequest, isSuccessResponse } from '../../lib/api';

export default function ResetPasswordPage() {
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

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Password Reset Successful!</h2>
          <p className="text-gray-600">Your password has been updated successfully.</p>
          <p className="text-sm text-gray-500">Redirecting to login page...</p>
          <Link 
            href="/login" 
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Reset Password</h2>
          <p className="mt-2 text-sm text-gray-600">Enter your new password below</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                New Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your new password"
              />
              
              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600">Password Strength:</span>
                    <span className={`text-xs font-medium ${passwordStrength.strengthColor}`}>
                      {passwordStrength.strengthText}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        passwordStrength.score === 0 ? 'bg-red-500 w-1/5' :
                        passwordStrength.score === 1 ? 'bg-orange-500 w-2/5' :
                        passwordStrength.score === 2 ? 'bg-yellow-500 w-3/5' :
                        passwordStrength.score === 3 ? 'bg-green-500 w-4/5' :
                        'bg-green-600 w-full'
                      }`}
                    ></div>
                  </div>
                  
                  {/* Password Requirements */}
                  <div className="mt-2 p-3 bg-gray-50 rounded-md">
                    <p className="text-xs font-medium text-gray-700 mb-2">Password Requirements:</p>
                    <ul className="space-y-1">
                      {passwordStrength.requirements?.map((req, index) => (
                        <li key={index} className={`text-xs flex items-center ${req.test ? 'text-green-600' : 'text-gray-500'}`}>
                          <span className="mr-2">{req.test ? '✓' : '○'}</span>
                          {req.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                  formData.confirmPassword && formData.password !== formData.confirmPassword 
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                    : 'border-gray-300'
                }`}
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your new password"
              />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
              {formData.confirmPassword && formData.password === formData.confirmPassword && formData.password && (
                <p className="mt-1 text-xs text-green-600 flex items-center">
                  <span className="mr-1">✓</span>
                  Passwords match
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Remember your password?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}