import { dirname } from 'path';
import { fileURLToPath } from 'url';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app has its own lockfile; don't let Next infer the repo root as the workspace.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:6666'}/api/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);