'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function OrderTracking({ trackingNumber, orderId }) {
  const t = useTranslations('OrderTracking');
  const [trackingData, setTrackingData] = useState(null);
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (trackingNumber) {
      fetchTrackingInfo();
    }
  }, [trackingNumber]);

  const fetchTrackingInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch tracking information
      const trackingResponse = await fetch(`/api/shipping/track/${trackingNumber}`);
      const trackingResult = await trackingResponse.json();

      if (trackingResult.success) {
        setTrackingData(trackingResult.data);
      } else {
        setError(trackingResult.message || t('fetchError'));
      }

      // Fetch detailed tracking events
      const eventsResponse = await fetch(`/api/shipping/tracking-events/${trackingNumber}`);
      const eventsResult = await eventsResponse.json();

      if (eventsResult.success) {
        setTrackingEvents(eventsResult.data);
      }
    } catch (err) {
      setError(t('fetchError'));
      console.error('Tracking fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('notAvailable');
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('delivered')) return 'text-green-600';
    if (statusLower.includes('transit') || statusLower.includes('shipped')) return 'text-blue-600';
    if (statusLower.includes('exception') || statusLower.includes('delayed')) return 'text-red-600';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-red-600 mb-4">
          <h3 className="text-lg font-semibold">{t('errorTitle')}</h3>
          <p>{error}</p>
        </div>
        <button
          onClick={fetchTrackingInfo}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  if (!trackingData && !trackingNumber) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <p className="text-gray-600">{t('noTracking')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('title')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">{t('trackingNumber')}</p>
            <p className="font-mono text-lg">{trackingNumber}</p>
          </div>
          {trackingData && (
            <>
              <div>
                <p className="text-sm text-gray-600">{t('status')}</p>
                <p className={`font-semibold ${getStatusColor(trackingData.status)}`}>
                  {trackingData.status}
                </p>
              </div>
              {trackingData.estimatedDelivery && (
                <div>
                  <p className="text-sm text-gray-600">{t('estimatedDelivery')}</p>
                  <p className="font-semibold">{formatDate(trackingData.estimatedDelivery)}</p>
                </div>
              )}
              {trackingData.actualDelivery && (
                <div>
                  <p className="text-sm text-gray-600">{t('delivered')}</p>
                  <p className="font-semibold text-green-600">{formatDate(trackingData.actualDelivery)}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {trackingData?.location && (
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-2">{t('currentLocation')}</h4>
          <p className="text-gray-700">
            {trackingData.location.city && `${trackingData.location.city}, `}
            {trackingData.location.stateOrProvinceCode && `${trackingData.location.stateOrProvinceCode} `}
            {trackingData.location.countryCode}
          </p>
        </div>
      )}

      {trackingEvents.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-4">{t('trackingHistory')}</h4>
          <div className="space-y-4">
            {trackingEvents.map((event, index) => (
              <div key={index} className="border-l-4 border-blue-200 pl-4 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{event.event_description}</p>
                    {event.event_location && (
                      <p className="text-sm text-gray-600">
                        {event.event_location.city && `${event.event_location.city}, `}
                        {event.event_location.stateOrProvinceCode && `${event.event_location.stateOrProvinceCode} `}
                        {event.event_location.countryCode}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">{formatDate(event.event_timestamp)}</p>
                    {event.event_type && (
                      <p className="text-xs text-gray-500">{event.event_type}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={fetchTrackingInfo}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          {t('refresh')}
        </button>
      </div>
    </div>
  );
}