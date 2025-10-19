/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const isDev = process.env.NODE_ENV === 'development';
    const backendUrl = isDev 
      ? (process.env.BACKEND_URL || 'http://localhost:6666')
      : (process.env.PRODUCTION_BACKEND_URL || 'http://localhost:6666');
    
    const routes = [
      'admin', 'users', 'products', 'orders', 'dashboard', 'settings', 'reports'
    ];
    
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
    formats: ['image/webp', 'image/avif'],
  },
  
  // Performance optimizations
  experimental: {
    optimizeCss: true,
  },
  
  compress: true,
  trailingSlash: false,
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

export default nextConfig;