'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function LoginPage() {
  const [email, setEmail] = useState('alice.customer@example.com');
  const [password, setPassword] = useState('Customer@123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      // This will be handled in handleSubmit after we get session data
    }
  }, [status, router]);

  const handleResendVerification = async () => {
    setIsResendingVerification(true);
    try {
      const response = await fetch('/api/users/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setError('Verification email sent! Please check your inbox.');
      } else {
        setError(data.message || 'Failed to resend verification email');
      }
    } catch (error) {
      console.error('Resend verification error:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    setNeedsVerification(false);

    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    setIsLoading(false);

    if (result?.error) {
      // Check if it's an email verification error
      if (result.error.includes('verify your email')) {
        setNeedsVerification(true);
        setError('Please verify your email address before logging in. Check your inbox for a verification email.');
      } else {
        setError('Login failed. Please check credentials.');
      }
    } else if (result?.ok) {
      // Get the updated session to check user role
      const session = await getSession();
      if (session?.user?.isAdmin || session?.user?.role === 'admin' || session?.user?.role === 'staff') {
        router.push('/dashboard');
      } else {
        router.push('/profile');
      }
    } else {
      setError('An unexpected error occurred.');
    }
  };

  if (status === 'loading' || status === 'authenticated') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-xs">
        <form className="px-8 pt-6 pb-8 mb-4 bg-white rounded shadow-md" onSubmit={handleSubmit}>
          {error && (
            <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded" role="alert">
              {error}
              {needsVerification && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={isResendingVerification}
                    className="text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                  >
                    {isResendingVerification ? 'Sending...' : 'Resend verification email'}
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="mb-4">
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 leading-tight text-gray-700 border rounded shadow-sm appearance-none focus:outline-none focus:shadow-outline"
              placeholder="Email"
            />
          </div>
          <div className="mb-6">
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 leading-tight text-gray-700 border rounded shadow-sm appearance-none focus:outline-none focus:shadow-outline"
              placeholder="Password"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700 focus:outline-none focus:shadow-outline disabled:bg-blue-300"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </div>
          
          <div className="text-center mt-4">
            <Link 
              href="/forgot-password" 
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Forgot your password?
            </Link>
          </div>
          
          <div className="text-center mt-2">
            <span className="text-sm text-gray-600">Don't have an account? </span>
            <Link 
              href="/register" 
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Sign up
            </Link>
          </div>
        </form>
      </div>
      </div>
      <Footer />
    </div>
  );
}