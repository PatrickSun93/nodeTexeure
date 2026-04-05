/**
 * Next.js configuration
 * - Rewrites API routes to backend server (dev/prod)
 * - Adds images.remotePatterns to allow loading images from backend uploads
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const isDev = process.env.NODE_ENV === 'development';
    const backendUrl = isDev 
      ? (process.env.BACKEND_URL || 'http://localhost:5000')
      : (process.env.PRODUCTION_BACKEND_URL || 'http://localhost:5000');
    
    // Only add rewrites if we have a valid backend URL
    if (!backendUrl || backendUrl === 'undefined') {
      console.warn('⚠️  No backend URL configured, skipping API rewrites');
      return [];
    }
    
    const routes = [
      'users', 'products', 'orders', 'cart', 'admin', 'status', 'database', 'settings',
      'search', 'reviews', 'payments', 'images', 'shipping', 'wishlist', 'returns',
      'newsletter', 'currency', 'blog', 'loyalty', 'gift-cards', 'support',
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
        port: '5000',
        pathname: '/uploads/**',
      },
    ],
  },
};

export default nextConfig;
