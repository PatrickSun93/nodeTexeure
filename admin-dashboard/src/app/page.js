'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function Login() {
  const t = useTranslations('AdminHome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (data.status === 'SUCCESS' && data.keyValueTable.isAdmin) {
        // Auth cookies are set; no localStorage anymore
        router.push('/dashboard');
      } else if (data.status === 'SUCCESS' && !data.keyValueTable.isAdmin) {
        setError(t('accessDenied'));
      } else {
        setError(data.message || t('invalidCredentials'));
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(t('loginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="card w-96">
        <h2 className="text-2xl font-bold mb-6">{t('adminLogin')}</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder={t('emailPlaceholder')}
            className="input w-full mb-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
          <input
            type="password"
            placeholder={t('passwordPlaceholder')}
            className="input w-full mb-4"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
          />
          {error && <p className="text-red-500 mb-4">{error}</p>}
          <button
            type="submit"
            className="button w-full"
            disabled={isLoading}
          >
            {isLoading ? t('loggingIn') : t('login')}
          </button>
        </form>
      </div>
    </div>
  );
}