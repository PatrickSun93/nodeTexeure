import { dirname } from 'path';
import { fileURLToPath } from 'url';
import createNextIntlPlugin from 'next-intl/plugin';
import { apiRewrites } from './rustRoutes.mjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app has its own lockfile; don't let Next infer the repo root as the workspace.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  async rewrites() {
    // /api/* goes to the Node backend, except the groups/paths in
    // RUST_API_ROUTES (with RUST_API_URL set), which go to the Rust API — see
    // rustRoutes.mjs. Unset = everything on Node (instant rollback).
    return apiRewrites(process.env.BACKEND_URL || 'http://localhost:6666');
  },
};

export default withNextIntl(nextConfig);
