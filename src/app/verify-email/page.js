'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { apiRequest } from '../../lib/api';

function VerifyEmailContent() {
  const t = useTranslations('VerifyEmail');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('noToken'));
      return;
    }

    const verify = async () => {
      try {
        const data = await apiRequest(`/users/verify-email?token=${token}`);
        if (data?.status === 'SUCCESS') {
          setStatus('success');
          setMessage(t('successMessage'));
        } else {
          setStatus('error');
          setMessage(data?.message || t('failedGeneric'));
        }
      } catch (err) {
        setStatus('error');
        setMessage(t('invalidLink'));
      }
    };
    verify();
  }, [token, t]);

  return (
    <div className="aesop-page">
      <Header />
      <main>
        <section style={{ textAlign: 'center', padding: '6rem 1.5rem' }}>
          <div className="aesop-container">
            {status === 'verifying' && (
              <>
                <div className="aesop-loading-spinner" style={{ margin: '0 auto 1.5rem' }}></div>
                <p className="noirae-body-text">{t('verifying')}</p>
              </>
            )}
            {status === 'success' && (
              <>
                <h1 className="noirae-heading-hero" style={{ marginBottom: '1rem' }}>{t('successHeading')}</h1>
                <p className="noirae-body-text" style={{ marginBottom: '2.5rem' }}>{message}</p>
                <Link href="/login" className="nt-btn nt-btn-primary">{t('signIn')}</Link>
              </>
            )}
            {status === 'error' && (
              <>
                <h1 className="noirae-heading-hero" style={{ marginBottom: '1rem' }}>{t('failedHeading')}</h1>
                <p className="noirae-body-text" style={{ color: 'var(--color-text-secondary)', marginBottom: '2.5rem' }}>{message}</p>
                <Link href="/register" className="nt-btn nt-btn-primary">{t('registerAgain')}</Link>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default function VerifyEmailPage() {
  const t = useTranslations('VerifyEmail');
  return (
    <Suspense
      fallback={
        <div className="aesop-page">
          <Header />
          <main>
            <section style={{ textAlign: 'center', padding: '6rem 1.5rem' }}>
              <div className="aesop-container">
                <div className="aesop-loading-spinner" style={{ margin: '0 auto 1.5rem' }}></div>
                <p className="noirae-body-text">{t('loading')}</p>
              </div>
            </section>
          </main>
          <Footer />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
