import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { AdminProvider } from '@/contexts/AdminContext'
import NotificationSystem from '@/components/NotificationSystem'
import PerformanceMonitor from '@/components/PerformanceMonitor'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'

export const metadata = {
  title: 'Admin Dashboard - Bed Texture',
  description: 'Administrative interface for Bed Texture e-commerce platform',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AuthProvider>
          <AdminProvider>
            {children}
            <NotificationSystem />
            <PerformanceMonitor 
              enabled={process.env.NODE_ENV === 'development'} 
              showWidget={false}
            />
            <ServiceWorkerRegistration 
              enabled={process.env.NODE_ENV === 'production'}
            />
          </AdminProvider>
        </AuthProvider>
      </body>
    </html>
  )
}