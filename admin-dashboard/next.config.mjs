/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serve admin-dashboard under subpath behind Nginx
  // This ensures assets and routes work correctly when proxied at /admin
  basePath: '/admin',
  // API rewrites for backend communication
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
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '6666',
        pathname: '/uploads/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.bedtexture.com',
        pathname: '/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 86400,
  },
  
  // Performance optimizations
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      '@/components',
      '@/lib',
      '@/contexts',
      '@/hooks',
      'echarts'
    ],
    serverComponentsExternalPackages: ['echarts'],
  },
  
  // Webpack configuration for performance
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Performance optimizations for production
    if (!dev && !isServer) {
      // Advanced code splitting
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000,
        maxSize: 244000,
        cacheGroups: {
          // Vendor chunks
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
          },
          
          // ECharts separate chunk (large library)
          echarts: {
            test: /[\\/]node_modules[\\/]echarts[\\/]/,
            name: 'echarts',
            chunks: 'all',
            priority: 20,
          },
          
          // React libraries
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'react',
            chunks: 'all',
            priority: 20,
          },
          
          // Common admin components
          adminComponents: {
            test: /[\\/]src[\\/]components[\\/]/,
            name: 'admin-components',
            chunks: 'all',
            minChunks: 2,
            priority: 5,
          },
          
          // Charts components
          charts: {
            test: /[\\/]src[\\/]components[\\/]charts[\\/]/,
            name: 'charts',
            chunks: 'all',
            priority: 15,
          },
          
          // Common utilities
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            priority: 1,
          },
        },
      };

      // Tree shaking optimization
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;

      // Module concatenation
      config.optimization.concatenateModules = true;
    }

    // Bundle analyzer (optional)
    if (process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          openAnalyzer: false,
          reportFilename: 'bundle-analyzer-report.html',
        })
      );
    }

    // Webpack performance hints
    config.performance = {
      hints: dev ? false : 'warning',
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
    };

    return config;
  },

  // Compiler options
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Output configuration
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  
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
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  // Generate build ID for cache busting
  generateBuildId: async () => {
    return `admin-${Date.now()}`;
  },

  // Security
  poweredByHeader: false,
};

export default nextConfig;