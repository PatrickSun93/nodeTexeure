/**
 * Next.js configuration
 * - Rewrites API routes to backend server (dev/prod)
 * - Adds images.remotePatterns to allow loading images from backend uploads
 * - Wires next-intl (cookie-based locale; see src/i18n/request.js)
 */
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const isDev = process.env.NODE_ENV === 'development';
    const backendUrl = isDev
      ? (process.env.BACKEND_URL || 'http://localhost:6666')
      : (process.env.PRODUCTION_BACKEND_URL || 'http://localhost:6666');
    
    // Only add rewrites if we have a valid backend URL
    if (!backendUrl || backendUrl === 'undefined') {
      console.warn('⚠️  No backend URL configured, skipping API rewrites');
      return [];
    }
    
    const routes = [
      'users', 'products', 'orders', 'cart', 'admin', 'status', 'database', 'settings',
      'search', 'reviews', 'payments', 'images', 'shipping', 'wishlist', 'returns',
      'newsletter', 'currency', 'blog', 'journal', 'loyalty', 'gift-cards', 'support',
      'unsubscribe',
    ];
    
    // In development, add extra debugging routes
    if (isDev) {
      routes.push('debug', 'logs');
    }
    
    return routes.map(route => ({
      source: `/api/${route}/:path*`,
      destination: `${backendUrl}/api/${route}/:path*`,
    }));
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '6666',
        pathname: '/uploads/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
