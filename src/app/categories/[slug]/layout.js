// Server-side SEO for category pages (the page is a client component; next/head
// is a no-op in the App Router, so metadata has to come from here).
import { getTranslations } from 'next-intl/server';
import { defaultSEO, generateStructuredData, jsonLd } from '@/lib/seo';
import { categoryName, categoryDescKey } from '@/lib/categories';

async function describe(slug) {
  const t = await getTranslations('CategoryPage');
  const name = categoryName(slug);
  const key = categoryDescKey(slug);
  return { name, description: key ? t(key) : t('descFallback', { category: name }) };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { name, description } = await describe(slug);
  const title = `${name} - Premium Bed Textures & Luxury Linens`;
  const url = `${defaultSEO.siteUrl}/categories/${slug}`;
  return {
    title: `${title} | ${defaultSEO.siteName}`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: defaultSEO.siteName, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CategoryLayout({ children, params }) {
  const { slug } = await params;
  const { name, description } = await describe(slug);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(generateStructuredData('collection', {
          name: `${name} Collection`,
          description,
          url: `/categories/${slug}`,
        }))}
      />
      {children}
    </>
  );
}
