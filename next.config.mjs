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
      ? (process.env.BACKEND_URL || 'http://localhost:6666')
      : process.env.PRODUCTION_BACKEND_URL;
    
    const routes = [
      'users', 'products', 'orders', 'cart', 'admin', 'status', 'database', 'settings'
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

export default nextConfig;
