import './globals.css'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { AuthProvider } from '@/contexts/AuthContext'
import { AdminProvider } from '@/contexts/AdminContext'
import NotificationSystem from '@/components/NotificationSystem'
import PerformanceMonitor from '@/components/PerformanceMonitor'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import GlobalErrorHandler from '@/components/GlobalErrorHandler'
import SessionManager from '@/components/SessionManager'
import IntegrationTest from '@/components/IntegrationTest'
import { GlobalLoadingOverlay } from '@/components/LoadingStateManager'

export const metadata = {
  title: 'Admin Dashboard - Bed Texture',
  description: 'Administrative interface for Bed Texture e-commerce platform',
}

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
        <AuthProvider>
          <AdminProvider>
            {children}
            <NotificationSystem />
            <GlobalLoadingOverlay />
            <GlobalErrorHandler />
            <SessionManager />
            <IntegrationTest />
            <PerformanceMonitor 
              enabled={process.env.NODE_ENV === 'development'} 
              showWidget={false}
            />
            <ServiceWorkerRegistration 
              enabled={process.env.NODE_ENV === 'production'}
            />
          </AdminProvider>
        </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}