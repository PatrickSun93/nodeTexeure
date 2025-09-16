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
  
  async redirects() {
    return [
      // SEO-friendly category redirects
      {
        source: '/shop/:category',
        destination: '/categories/:category',
        permanent: true,
      },
      // Legacy product URLs
      {
        source: '/product/:id',
        destination: '/products/:id',
        permanent: true,
      },
      // Category parameter redirects to SEO-friendly URLs
      {
        source: '/shop',
        has: [
          {
            type: 'query',
            key: 'category',
            value: '(?<category>sheets|pillows|blankets|mattresses|accessories)',
          },
        ],
        destination: '/categories/:category',
        permanent: false,
      },
    ];
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
  
  // Enable experimental features for better SEO
  experimental: {
    optimizeCss: true,
  },
  
  // Compress responses for better performance
  compress: true,
  
  // Generate static pages for better SEO
  trailingSlash: false,
};

export default nextConfig;
