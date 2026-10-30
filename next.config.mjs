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
      'unsubscribe', 'contact', 'abandoned-cart',
    ];
    
    // In development, add extra debugging routes
    if (isDev) {
      routes.push('debug', 'logs');
    }
    
    // Route groups already ported to the Rust API (rust/crates/api) go there
    // instead, e.g. RUST_API_URL=http://api:7000 RUST_API_ROUTES=products,search.
    // An entry with a slash moves a single path (settings/public) while the rest
    // of its group stays on Node. Unset = everything on Node (instant rollback).
    const rustUrl = (process.env.RUST_API_URL || '').trim().replace(/\/$/, '');
    const rustEntries = rustUrl
      ? (process.env.RUST_API_ROUTES || '').split(',').map((r) => r.trim()).filter(Boolean)
      : [];
    const rustGroups = new Set(rustEntries.filter((r) => !r.includes('/')));
    // Exact paths first: Next uses the first matching rewrite.
    const rustPaths = rustEntries
      .filter((r) => r.includes('/'))
      .map((path) => ({ source: `/api/${path}`, destination: `${rustUrl}/api/${path}` }));

    return [
      ...rustPaths,
      ...routes.map(route => ({
        source: `/api/${route}/:path*`,
        destination: `${rustGroups.has(route) ? rustUrl : backendUrl}/api/${route}/:path*`,
      })),
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],
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
