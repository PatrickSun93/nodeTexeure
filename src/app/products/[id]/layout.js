// Server-side SEO for product pages: the page itself is a client component, so
// title/description/Open Graph and Product JSON-LD are produced here.
import { getLocale } from 'next-intl/server';
import { getBackendJson } from '@/lib/server/backend';
import { defaultSEO, generateStructuredData, jsonLd } from '@/lib/seo';

// Product copy changes rarely; re-fetch at most every 10 minutes.
const REVALIDATE_MS = 10 * 60 * 1000;
const cache = new Map();

// The backend translates name/descriptions per locale, so cache per locale too.
async function getProduct(id, locale) {
  const key = `${locale}:${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REVALIDATE_MS) return hit.product;
  let product = null;
  try {
    const res = await getBackendJson(
      `/api/products/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}`);
    product = res?.status === 'SUCCESS' ? res.keyValueTable : null;
  } catch (err) {
    console.error('Product metadata: backend unavailable:', err.message);
  }
  cache.set(key, { product, at: Date.now() });
  return product;
}

function ratingOf(product) {
  const ratings = (product.reviews || []).map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
  if (!ratings.length) return {};
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return { rating: Math.round(avg * 10) / 10, review_count: ratings.length };
}

const plain = (text = '') => String(text).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export async function generateMetadata({ params }) {
  const { id } = await params;
  const locale = await getLocale();
  const product = await getProduct(id, locale);
  if (!product) return { title: defaultSEO.title };

  // meta_title/meta_description are English-only columns; in other locales use
  // the translated name and copy the backend returns instead.
  const english = locale === 'en';
  const title = (english && product.meta_title) || product.name;
  const description = plain((english && product.meta_description) || product.short_description || product.description).slice(0, 160);
  const image = (product.images || []).find((img) => img.is_primary) || (product.images || [])[0];
  const url = `${defaultSEO.siteUrl}/products/${product.id}`;
  const images = image ? [{ url: `${defaultSEO.siteUrl}${image.original_url}`, alt: image.alt_text || product.name }] : [];

  return {
    title: `${title} | ${defaultSEO.siteName}`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: defaultSEO.siteName, type: 'website', images },
    twitter: { card: 'summary_large_image', title, description, images: images.map((i) => i.url) },
  };
}

export default async function ProductLayout({ children, params }) {
  const { id } = await params;
  const product = await getProduct(id, await getLocale());
  return (
    <>
      {product && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd(generateStructuredData('product', {
            ...product,
            description: plain(product.description),
            ...ratingOf(product),
          }))}
        />
      )}
      {children}
    </>
  );
}
