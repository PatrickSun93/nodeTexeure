'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Profile() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });

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
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/profile`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setUserData(data.keyValueTable);
        setFormData({ name: data.keyValueTable.name, email: data.keyValueTable.email, password: '', confirmPassword: '' });
      } else {
        setError('Failed to fetch profile');
      }
    } catch (err) {
      setError('Error fetching profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      const updateData = { name: formData.name };
      if (formData.password) updateData.password = formData.password;
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify(updateData),
      });
      const data = await res.json();
      if (data.success) {
        fetchProfile();
        setError('');
        alert('Profile updated successfully');
      } else {
        setError('Failed to update profile');
      }
    } catch (err) {
      setError('Error updating profile');
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Your Profile</h2>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {userData && (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="name">Name</label>
                <input id="name" name="name" type="text" value={formData.name} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" value={formData.email} disabled className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100" />
              </div>
              <div>
                <label htmlFor="password">New Password (optional)</label>
                <input id="password" name="password" type="password" value={formData.password} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input id="confirmPassword" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
            </div>
            <button type="submit" className="w-full py-2 px-4 bg-indigo-600 text-white rounded-md">Update Profile</button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-gray-600">
          <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">Back to Home</Link>
        </p>
      </div>
    </div>
  );
}