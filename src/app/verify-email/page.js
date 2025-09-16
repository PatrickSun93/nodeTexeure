'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiRequest, isSuccessResponse } from '../../lib/api';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error', 'already-verified'
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      verifyEmail(token);
    } else {
      setStatus('error');
      setMessage('Invalid verification link. Please check your email for the correct link.');
    }
  }, [searchParams]);

  const verifyEmail = async (token) => {
    try {
      const response = await apiRequest('/users/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });

      if (isSuccessResponse(response)) {
        setStatus('success');
        setMessage(response.data.message || 'Email verified successfully!');
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login?message=Email verified! You can now log in.');
        }, 3000);
      } else {
        if (response.message?.includes('already verified')) {
          setStatus('already-verified');
          setMessage('Your email is already verified. You can log in now.');
        } else {
          setStatus('error');
          setMessage(response.message || 'Verification failed. The link may be invalid or expired.');
        }
      }
    } catch (error) {
      console.error('Email verification error:', error);
      setStatus('error');
      setMessage('Network error. Please check your connection and try again.');
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      alert('Please enter your email address');
      return;
    }

    setIsResending(true);
    try {
      const response = await apiRequest('/users/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      if (isSuccessResponse(response)) {
        alert('Verification email sent! Please check your inbox.');
      } else {
        alert(response.message || 'Failed to resend verification email');
      }
    } catch (error) {
      console.error('Resend verification error:', error);
      alert('Network error. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg text-center">
        {status === 'verifying' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <h2 className="text-2xl font-bold text-gray-900">Verifying Email...</h2>
            <p className="text-gray-600">Please wait while we verify your email address.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Email Verified!</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to login page...</p>
            <Link 
              href="/login" 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Go to Login
            </Link>
          </>
        )}

        {status === 'already-verified' && (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Already Verified</h2>
            <p className="text-gray-600">{message}</p>
            <Link 
              href="/login" 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Go to Login
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Verification Failed</h2>
            <p className="text-gray-600">{message}</p>
            
            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 text-left">
                  Resend verification email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                onClick={handleResendVerification}
                disabled={isResending}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isResending ? 'Sending...' : 'Resend Verification Email'}
              </button>
            </div>

            <div className="mt-4">
              <Link 
                href="/register" 
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                Back to Registration
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}