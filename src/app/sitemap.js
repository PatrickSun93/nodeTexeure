// Next.js dynamic sitemap generator
// https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap

import { getBackendJson } from '@/lib/server/backend';
import { defaultSEO } from '@/lib/seo';

const BASE_URL = defaultSEO.siteUrl;

// The products endpoint caps its page size at 100.
const PRODUCTS_PAGE_SIZE = 100;

// Regenerate the sitemap at most once per hour (mirrors the old fetch revalidate).
export const revalidate = 3600;

// Walk every page of /api/products so the sitemap lists all products, not just
// the first page (the endpoint defaults to 10 products per request).
async function fetchAllProducts() {
  const firstPage = await getBackendJson(
    `/api/products?page=1&limit=${PRODUCTS_PAGE_SIZE}`
  );
  const products = [...(firstPage?.keyValueTable?.products || [])];
  const total = Number(firstPage?.keyValueTable?.total) || products.length;
  const totalPages = Math.ceil(total / PRODUCTS_PAGE_SIZE);

  for (let page = 2; page <= totalPages; page++) {
    const nextPage = await getBackendJson(
      `/api/products?page=${page}&limit=${PRODUCTS_PAGE_SIZE}`
    );
    const batch = nextPage?.keyValueTable?.products || [];
    if (batch.length === 0) break; // defensive: stop if a page returns nothing
    products.push(...batch);
  }

  return products;
}

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

  // Dynamic product pages — fetched from the backend API at build/revalidate time.
  let productPages = [];
  try {
    const products = await fetchAllProducts();
    productPages = products.map((product) => ({
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
