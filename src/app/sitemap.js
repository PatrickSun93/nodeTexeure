// Next.js dynamic sitemap generator
// https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nodetexeure.com';

export default async function sitemap() {
  // Static pages
  const staticPages = [
    { url: `${BASE_URL}`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/collections/silk`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/collections/cashmere`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/new-arrive`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/shipping-returns`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/journal`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/track-order`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];

  // Dynamic product pages — fetch from API at build time
  let productPages = [];
  try {
    const res = await fetch(`${process.env.BACKEND_URL || 'http://localhost:6666'}/api/products`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    const data = await res.json();
    const products = data?.keyValueTable?.products || [];
    productPages = products.map(product => ({
      url: `${BASE_URL}/products/${product.id}`,
      lastModified: product.updated_at ? new Date(product.updated_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));
  } catch (err) {
    console.error('Sitemap: Failed to fetch products', err.message);
  }

  return [...staticPages, ...productPages];
}
