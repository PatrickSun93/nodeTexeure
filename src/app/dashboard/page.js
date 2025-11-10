'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { extractResponseData, profileAPI } from '../../lib/api';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    fetchProfile();
  }, [status, session, router]);

  const fetchProfile = async () => {
    try {
      const raw = await profileAPI.get(session.accessToken);
      const parsed = extractResponseData(raw);
      if (parsed.status === 'SUCCESS') {
        const profile = parsed.data || {};
        setUserData(profile);
      } else {
        setError('Failed to load profile data');
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="aesop-page">
        <Header />
        <main className="aesop-container aesop-py-8">
          <div className="aesop-text-center">
            <p>Loading dashboard...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="aesop-page">
        <Header />
        <main className="aesop-container aesop-py-8">
          <div className="aesop-text-center">
            <p className="aesop-text-error">{error}</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="aesop-page">
      <Header />
      <main className="aesop-container aesop-py-8">
        {/* Remove the breadcrumb section entirely */}
        <div className="aesop-dashboard-content">

          {/* Welcome Section */}
          <div className="aesop-mb-8">
            <h1 className="aesop-heading-1 aesop-mb-2">Welcome back, {userData?.first_name || 'User'}!</h1>
            <p className="aesop-text-muted">Manage your account, orders, and preferences from your dashboard.</p>
          </div>

          {/* Dashboard Grid */}
          <div className="aesop-grid aesop-grid-cols-1 md:aesop-grid-cols-2 lg:aesop-grid-cols-3 aesop-gap-6 aesop-mb-8">
            {/* Profile Summary Card */}
            <div className="aesop-card aesop-p-6">
              <div className="aesop-flex aesop-items-center aesop-mb-4">
                <div className="aesop-w-12 aesop-h-12 aesop-bg-primary-light aesop-rounded-full aesop-flex aesop-items-center aesop-justify-center aesop-mr-4">
                  <svg className="aesop-w-6 aesop-h-6 aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="aesop-heading-3 aesop-mb-1">Profile</h3>
                  <p className="aesop-text-muted aesop-text-sm">Manage your account</p>
                </div>
              </div>
              <div className="aesop-mb-4">
                <p className="aesop-text-sm aesop-mb-1"><strong>Name:</strong> {userData?.first_name} {userData?.last_name}</p>
                <p className="aesop-text-sm aesop-mb-1"><strong>Email:</strong> {userData?.email}</p>
                <p className="aesop-text-sm"><strong>Phone:</strong> {userData?.phone || 'Not provided'}</p>
              </div>
              <Link href="/profile" className="aesop-btn aesop-btn-primary aesop-btn-sm">
                Edit Profile
              </Link>
            </div>

            {/* Orders Card */}
            <div className="aesop-card aesop-p-6">
              <div className="aesop-flex aesop-items-center aesop-mb-4">
                <div className="aesop-w-12 aesop-h-12 aesop-bg-primary-light aesop-rounded-full aesop-flex aesop-items-center aesop-justify-center aesop-mr-4">
                  <svg className="aesop-w-6 aesop-h-6 aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <div>
                  <h3 className="aesop-heading-3 aesop-mb-1">Orders</h3>
                  <p className="aesop-text-muted aesop-text-sm">View your order history</p>
                </div>
              </div>
              <div className="aesop-mb-4">
                <p className="aesop-text-sm aesop-mb-2">Recent orders and tracking information</p>
                <p className="aesop-text-muted aesop-text-xs">Order management coming soon</p>
              </div>
              <button className="aesop-btn aesop-btn-secondary aesop-btn-sm" disabled>
                View Orders
              </button>
            </div>

            {/* Shopping Cart Card */}
            <div className="aesop-card aesop-p-6">
              <div className="aesop-flex aesop-items-center aesop-mb-4">
                <div className="aesop-w-12 aesop-h-12 aesop-bg-primary-light aesop-rounded-full aesop-flex aesop-items-center aesop-justify-center aesop-mr-4">
                  <svg className="aesop-w-6 aesop-h-6 aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m8 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
                  </svg>
                </div>
                <div>
                  <h3 className="aesop-heading-3 aesop-mb-1">Shopping Cart</h3>
                  <p className="aesop-text-muted aesop-text-sm">Continue shopping</p>
                </div>
              </div>
              <div className="aesop-mb-4">
                <p className="aesop-text-sm aesop-mb-2">Items in your cart</p>
              </div>
              <Link href="/cart" className="aesop-btn aesop-btn-primary aesop-btn-sm">
                View Cart
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="aesop-mb-8">
            <h2 className="aesop-heading-2 aesop-mb-4">Quick Actions</h2>
            <div className="aesop-grid aesop-grid-cols-2 md:aesop-grid-cols-4 aesop-gap-4">
              <Link href="/shop" className="aesop-card aesop-p-4 aesop-text-center aesop-hover-shadow">
                <div className="aesop-w-8 aesop-h-8 aesop-bg-primary-light aesop-rounded-full aesop-flex aesop-items-center aesop-justify-center aesop-mx-auto aesop-mb-2">
                  <svg className="aesop-w-4 aesop-h-4 aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <p className="aesop-text-sm aesop-font-medium">Shop Now</p>
              </Link>
              
              <Link href="/profile" className="aesop-card aesop-p-4 aesop-text-center aesop-hover-shadow">
                <div className="aesop-w-8 aesop-h-8 aesop-bg-primary-light aesop-rounded-full aesop-flex aesop-items-center aesop-justify-center aesop-mx-auto aesop-mb-2">
                  <svg className="aesop-w-4 aesop-h-4 aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <p className="aesop-text-sm aesop-font-medium">Edit Profile</p>
              </Link>
              
              <Link href="/contact" className="aesop-card aesop-p-4 aesop-text-center aesop-hover-shadow">
                <div className="aesop-w-8 aesop-h-8 aesop-bg-primary-light aesop-rounded-full aesop-flex aesop-items-center aesop-justify-center aesop-mx-auto aesop-mb-2">
                  <svg className="aesop-w-4 aesop-h-4 aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="aesop-text-sm aesop-font-medium">Contact Us</p>
              </Link>
              
              <Link href="/about" className="aesop-card aesop-p-4 aesop-text-center aesop-hover-shadow">
                <div className="aesop-w-8 aesop-h-8 aesop-bg-primary-light aesop-rounded-full aesop-flex aesop-items-center aesop-justify-center aesop-mx-auto aesop-mb-2">
                  <svg className="aesop-w-4 aesop-h-4 aesop-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="aesop-text-sm aesop-font-medium">About Us</p>
              </Link>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="aesop-card aesop-p-6">
            <h2 className="aesop-heading-2 aesop-mb-4">Recent Activity</h2>
            <div className="aesop-text-center aesop-py-8">
              <p className="aesop-text-muted">No recent activity to display.</p>
              <p className="aesop-text-muted aesop-text-sm aesop-mt-2">Start shopping to see your activity here!</p>
              <Link href="/shop" className="aesop-btn aesop-btn-primary aesop-mt-4">
                Browse Products
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}