// Next.js robots.txt generator
// https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/login', '/register', '/forgot-password'],
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://nodetexeure.com'}/sitemap.xml`,
  };
}
