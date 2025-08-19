/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/((?!auth).*)', // Exclude /api/auth/* from the proxy
        destination: 'http://localhost:6666/api/$1',
      },
    ];
  },
};

export default nextConfig;
