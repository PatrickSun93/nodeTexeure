/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*', // Exclude /api/auth/* implicitly because Next routes take precedence
        destination: 'http://localhost:6666/api/:path*',
      },
    ];
  },
};

export default nextConfig;
