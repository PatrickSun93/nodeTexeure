import './globals.css'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { AuthProvider } from '@/contexts/AuthContext'
import { AdminProvider } from '@/contexts/AdminContext'
import NotificationSystem from '@/components/NotificationSystem'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import GlobalErrorHandler from '@/components/GlobalErrorHandler'
import SessionManager from '@/components/SessionManager'
import { GlobalLoadingOverlay } from '@/components/LoadingStateManager'

export const metadata = {
  title: 'Admin Dashboard - Noiraé Admin',
  description: 'Administrative interface for Noiraé Admin e-commerce platform',
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