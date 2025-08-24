'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import { extractResponseData, profileAPI } from '../../lib/api';

export default function Profile() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    address: '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    console.log(session)
    fetchProfile();
  }, [status, session, router]);

  const fetchProfile = async () => {
    try {
      const raw = await profileAPI.get(session.accessToken);
      const parsed = extractResponseData(raw);
      if (parsed.status === 'SUCCESS') {
        const profile = parsed.data || {};
        setUserData(profile);
        setError('');
      } else {
        setError(parsed.message || 'Failed to fetch profile');
      }
    } catch (err) {
      console.error('Error fetching profile', err);
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
      const updateData = { name: formData.name, address: formData.address };
      if (formData.password) updateData.password = formData.password;

      const raw = await profileAPI.update(session.accessToken, updateData);
      const parsed = extractResponseData(raw);
      if (parsed.status === 'SUCCESS') {
        await fetchProfile();
        setError('');
        alert('Profile updated successfully');
      } else {
        setError(parsed.message || 'Failed to update profile');
      }
    } catch (err) {
      console.error('Error updating profile', err);
      setError('Error updating profile');
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="bg-white p-6 rounded-xl shadow">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900">Your Profile</h2>
          </div>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          {userData && (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500">Name</div>
                <div className="text-base font-medium text-gray-900">
                  {userData.name || 'Not set'}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500">Email</div>
                <div className="text-base font-medium text-gray-900">
                  {userData.email || 'Not set'}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500">Shipping Address</div>
                <div className="text-base font-medium text-gray-900 whitespace-pre-line">
                  {userData.address || 'Not set'}
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Payment Information and footer removed */}
      </div>
    </div>
  );
}