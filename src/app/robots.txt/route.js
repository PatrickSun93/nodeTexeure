/**
 * Dynamic robots.txt generation
 */
import { defaultSEO } from '../../lib/seo';

export async function GET() {
  const robotsTxt = `# Robots.txt for ${defaultSEO.siteName}
# Generated automatically

User-agent: *
Allow: /

# Disallow admin and private areas
Disallow: /admin/
Disallow: /dashboard/
Disallow: /api/
Disallow: /checkout/
Disallow: /cart/
Disallow: /login/
Disallow: /register/
Disallow: /profile/
Disallow: /forgot-password/
Disallow: /reset-password/
Disallow: /verify-email/

# Disallow search result pages with parameters
Disallow: /*?*search=*
Disallow: /*?*sort=*
Disallow: /*?*filter=*

# Allow specific API endpoints that should be crawled
Allow: /api/placeholder/

# Sitemap location
Sitemap: ${defaultSEO.siteUrl}/sitemap.xml

# Crawl delay (optional - be respectful to crawlers)
Crawl-delay: 1`;

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400'
    }
  });
}