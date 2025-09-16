/**
 * Dynamic sitemap generation for SEO
 */
import { defaultSEO } from '../../lib/seo';

// Static pages configuration
const staticPages = [
  {
    url: '/',
    changeFreq: 'daily',
    priority: 1.0,
    lastMod: new Date().toISOString()
  },
  {
    url: '/shop',
    changeFreq: 'daily',
    priority: 0.9,
    lastMod: new Date().toISOString()
  },
  {
    url: '/about',
    changeFreq: 'monthly',
    priority: 0.7,
    lastMod: new Date().toISOString()
  },
  {
    url: '/contact',
    changeFreq: 'monthly',
    priority: 0.6,
    lastMod: new Date().toISOString()
  },
  {
    url: '/new-arrive',
    changeFreq: 'weekly',
    priority: 0.8,
    lastMod: new Date().toISOString()
  }
];

// Product categories
const categories = [
  'Sheets',
  'Pillows', 
  'Blankets',
  'Mattresses',
  'Accessories'
];

async function fetchProducts() {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:6666';
    const response = await fetch(`${backendUrl}/api/products?limit=1000`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch products');
    }
    
    const data = await response.json();
    return data.status === 'SUCCESS' ? (data.keyValueTable?.products || []) : [];
  } catch (error) {
    console.error('Error fetching products for sitemap:', error);
    return [];
  }
}

function generateSitemapXML(urls) {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(url => `  <url>
    <loc>${defaultSEO.siteUrl}${url.url}</loc>
    <lastmod>${url.lastMod}</lastmod>
    <changefreq>${url.changeFreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return sitemap;
}

export async function GET() {
  try {
    const urls = [...staticPages];
    
    // Add category pages
    categories.forEach(category => {
      urls.push({
        url: `/shop?category=${encodeURIComponent(category)}`,
        changeFreq: 'weekly',
        priority: 0.8,
        lastMod: new Date().toISOString()
      });
    });
    
    // Fetch and add product pages
    const products = await fetchProducts();
    products.forEach(product => {
      urls.push({
        url: `/products/${product.id}`,
        changeFreq: 'weekly',
        priority: 0.7,
        lastMod: product.updated_at || new Date().toISOString()
      });
    });
    
    const sitemap = generateSitemapXML(urls);
    
    return new Response(sitemap, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      }
    });
  } catch (error) {
    console.error('Error generating sitemap:', error);
    return new Response('Error generating sitemap', { status: 500 });
  }
}