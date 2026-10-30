'use client';

import { useEffect } from 'react';
import { useAdmin, type Notification, type NotificationType } from '@/contexts/AdminContext';

// Individual Notification Component
function NotificationItem({ notification, onRemove }: { notification: Notification; onRemove: (id: string) => void }) {
  const { id, message, type, duration } = notification;

  const typeStyles: Record<NotificationType, string> = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const iconMap: Record<NotificationType, string> = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => {
        onRemove(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onRemove]);

  return (
    <div className={`
      flex items-center justify-between p-4 rounded-lg border shadow-sm
      transform transition-all duration-300 ease-in-out
      ${(type && typeStyles[type]) || typeStyles.info}
    `}>
      <div className="flex items-center space-x-3">
        <span className="text-lg">
          {(type && iconMap[type]) || iconMap.info}
        </span>
        <p className="text-sm font-medium">
          {message}
        </p>
      </div>
      
      <button
        onClick={() => onRemove(id)}
        className="ml-4 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Dismiss notification"
      >
        <span className="text-lg">×</span>
      </button>
    </div>
  );
}

// Main Notification System Component
export default function NotificationSystem() {
  const { notifications, removeNotification } = useAdmin();

  if (!notifications || notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={removeNotification}
        />
      ))}
    </div>
  );
}

// Toast notification hook for easy use
export function useNotifications() {
  const { showNotification, showSuccess, showError, showWarning } = useAdmin();

  return {
    notify: showNotification,
    success: showSuccess,
    error: showError,
    warning: showWarning
  };
}