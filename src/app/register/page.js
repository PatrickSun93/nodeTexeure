'use client';

import { useState, useEffect } from 'react';
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
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: [],
    isValid: false
  });
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const router = useRouter();

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
    const failedRequirements = requirements.filter(req => !req.test);
    
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
      isValid: passedRequirements.length >= 4 // Require at least 4 out of 5 criteria
    };
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Validate password strength on password change
    if (name === 'password') {
      const strength = validatePasswordStrength(value);
      setPasswordStrength(strength);
    }
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

    if (!passwordStrength.isValid) {
      setError('Password does not meet security requirements');
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
        // Registration successful - show success message with verification instructions
        alert('Registration successful! Please check your email to verify your account before logging in.');
        router.push('/login?message=Registration successful! Please check your email to verify your account.');
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Create Account</h2>
          <p className="mt-2 text-sm text-gray-600">Join us today and start shopping</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="Enter your first name"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Enter your last name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter your email address"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={formData.password}
                onChange={handleChange}
                onFocus={() => setShowPasswordRequirements(true)}
                onBlur={() => setShowPasswordRequirements(false)}
                placeholder="Create a secure password"
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
                </div>
              )}

              {/* Password Requirements */}
              {(showPasswordRequirements || formData.password) && (
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
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
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
                placeholder="Confirm your password"
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

          <div className="mt-4">
            <div className="flex items-center">
              <input
                id="terms"
                type="checkbox"
                checked={termsAccepted}
                onChange={handleTermsChange}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="terms" className="ml-2 block text-sm text-gray-900">
                I agree to the{' '}
                <Link href="/terms" className="font-medium text-indigo-600 hover:text-indigo-500">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="font-medium text-indigo-600 hover:text-indigo-500">
                  Privacy Policy
                </Link>
              </label>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}