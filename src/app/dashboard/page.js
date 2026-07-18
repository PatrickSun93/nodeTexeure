'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { extractResponseData, profileAPI } from '../../lib/api';

export default function Dashboard() {
  const t = useTranslations('Dashboard');
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
        setError(t('errorLoadProfile'));
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      setError(t('errorLoadProfile'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="db-wrap min-h-screen">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--noirae-accent-gold)' }}></div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="db-wrap min-h-screen">
        <Header />
        <main className="max-w-5xl mx-auto py-16 px-4 sm:px-6 lg:px-8 text-center">
          <p style={{ color: 'var(--noirae-error)' }}>{error}</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="db-wrap min-h-screen">
      <style>{`
        .db-wrap { background: var(--noirae-bg-cream); color: var(--noirae-text-primary); font-family: var(--noirae-font-sans); }
        .db-title { font-family: var(--noirae-font-serif); font-weight: 500; font-size: 2.375rem; line-height: 1.1; letter-spacing: -0.01em; color: var(--noirae-text-primary); margin: 0; }
        .db-subtitle { color: var(--noirae-text-secondary); font-size: 0.9375rem; margin-top: 8px; }
        .db-card { background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); }
        .db-card-title { font-family: var(--noirae-font-serif); font-weight: 500; font-size: 1.25rem; line-height: 1.2; color: var(--noirae-text-primary); }
        .db-card-sub { color: var(--noirae-text-muted); font-size: 0.8125rem; margin-top: 2px; }
        .db-icon { width: 48px; height: 48px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; flex: none; background: var(--noirae-bg-light-gray); color: var(--noirae-accent-gold); }
        .db-icon-sm { width: 40px; height: 40px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; background: var(--noirae-bg-light-gray); color: var(--noirae-accent-gold); }
        .db-body { color: var(--noirae-text-secondary); font-size: 0.875rem; line-height: 1.7; }
        .db-meta-label { color: var(--noirae-text-primary); font-weight: 500; }
        .db-muted { color: var(--noirae-text-muted); }
        .db-section-title { font-family: var(--noirae-font-serif); font-weight: 500; font-size: 1.5rem; line-height: 1.2; color: var(--noirae-text-primary); }
        .db-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 0; padding: 10px 20px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-family: var(--noirae-font-sans); cursor: pointer; text-decoration: none; transition: background .2s ease, border-color .2s ease, color .2s ease; }
        .db-btn-primary { background: var(--noirae-charcoal); color: var(--noirae-bg-cream); border: 1px solid var(--noirae-charcoal); }
        .db-btn-primary:hover { background: var(--noirae-accent-gold); border-color: var(--noirae-accent-gold); }
        .db-btn-outline { background: transparent; color: var(--noirae-text-primary); border: 1px solid var(--noirae-charcoal); }
        .db-btn-outline:hover { background: var(--noirae-charcoal); color: var(--noirae-bg-cream); }
        .db-action { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 22px 14px; background: var(--noirae-bg-white); border: 1px solid var(--noirae-border-medium); text-decoration: none; color: var(--noirae-text-primary); transition: border-color .2s ease, background .2s ease; }
        .db-action:hover { border-color: var(--noirae-accent-gold); background: var(--noirae-bg-light-gray); }
        .db-action-label { font-size: 0.8125rem; font-weight: 500; letter-spacing: 0.02em; }
        .db-empty-title { font-family: var(--noirae-font-serif); font-weight: 500; font-size: 1.5rem; color: var(--noirae-text-primary); }
      `}</style>
      <Header />

      <main className="max-w-5xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="db-title">
            {userData?.first_name
              ? t('welcomeNamed', { name: userData.first_name })
              : t('welcome')}
          </h1>
          <p className="db-subtitle">{t('subtitle')}</p>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {/* Profile Summary Card */}
          <div className="db-card p-6 flex flex-col">
            <div className="flex items-center gap-4 mb-4">
              <div className="db-icon">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h3 className="db-card-title">{t('profileTitle')}</h3>
                <p className="db-card-sub">{t('profileSubtitle')}</p>
              </div>
            </div>
            <div className="db-body mb-5 space-y-1">
              <p><span className="db-meta-label">{t('labelName')}:</span> {userData?.first_name} {userData?.last_name}</p>
              <p><span className="db-meta-label">{t('labelEmail')}:</span> {userData?.email}</p>
              <p><span className="db-meta-label">{t('labelPhone')}:</span> {userData?.phone || t('notProvided')}</p>
            </div>
            <div className="mt-auto">
              <Link href="/profile" className="db-btn db-btn-primary">
                {t('editProfile')}
              </Link>
            </div>
          </div>

          {/* Orders Card */}
          <div className="db-card p-6 flex flex-col">
            <div className="flex items-center gap-4 mb-4">
              <div className="db-icon">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div>
                <h3 className="db-card-title">{t('ordersTitle')}</h3>
                <p className="db-card-sub">{t('ordersSubtitle')}</p>
              </div>
            </div>
            <div className="db-body mb-5">
              <p>{t('ordersDesc')}</p>
            </div>
            <div className="mt-auto">
              <Link href="/orders" className="db-btn db-btn-primary">
                {t('viewOrders')}
              </Link>
            </div>
          </div>

          {/* Shopping Cart Card */}
          <div className="db-card p-6 flex flex-col">
            <div className="flex items-center gap-4 mb-4">
              <div className="db-icon">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m8 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01" />
                </svg>
              </div>
              <div>
                <h3 className="db-card-title">{t('cartTitle')}</h3>
                <p className="db-card-sub">{t('cartSubtitle')}</p>
              </div>
            </div>
            <div className="db-body mb-5">
              <p>{t('cartDesc')}</p>
            </div>
            <div className="mt-auto">
              <Link href="/cart" className="db-btn db-btn-primary">
                {t('viewCart')}
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-10">
          <h2 className="db-section-title mb-4">{t('quickActions')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/shop" className="db-action">
              <div className="db-icon-sm">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <p className="db-action-label">{t('shopNow')}</p>
            </Link>

            <Link href="/profile" className="db-action">
              <div className="db-icon-sm">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <p className="db-action-label">{t('editProfile')}</p>
            </Link>

            <Link href="/contact" className="db-action">
              <div className="db-icon-sm">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="db-action-label">{t('contactUs')}</p>
            </Link>

            <Link href="/about" className="db-action">
              <div className="db-icon-sm">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="db-action-label">{t('aboutUs')}</p>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="db-card p-8 text-center">
          <h2 className="db-section-title mb-4">{t('recentActivity')}</h2>
          <p className="db-muted">{t('noActivity')}</p>
          <p className="db-muted" style={{ fontSize: '0.8125rem', marginTop: '6px' }}>{t('noActivityHint')}</p>
          <div className="mt-6">
            <Link href="/shop" className="db-btn db-btn-outline">
              {t('browseProducts')}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
