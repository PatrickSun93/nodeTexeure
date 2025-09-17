/**
 * SEO Component for managing meta tags and structured data
 */
import Head from 'next/head';
import { generateMetaTags, generateStructuredData } from '../lib/seo';

export default function SEO({
  title,
  description,
  keywords,
  image,
  url,
  type = 'website',

  noindex = false,
  nofollow = false,
  structuredData = null,
  children
}) {
  const metaTags = generateMetaTags({
    title,
    description,
    keywords,
    image,
    url,
    type,
    locale,
    noindex,
    nofollow
  });

  return (
    <Head>
      {/* Basic Meta Tags */}
      <title>{metaTags.title}</title>
      <meta name="description" content={metaTags.description} />
      <meta name="keywords" content={metaTags.keywords} />
      <meta name="robots" content={metaTags.robots} />
      <link rel="canonical" href={metaTags.canonical} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={metaTags.openGraph.title} />
      <meta property="og:description" content={metaTags.openGraph.description} />
      <meta property="og:url" content={metaTags.openGraph.url} />
      <meta property="og:site_name" content={metaTags.openGraph.siteName} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:type" content={metaTags.openGraph.type} />
      {metaTags.openGraph.images.map((image, index) => (
        <meta key={index} property="og:image" content={image.url} />
      ))}
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={metaTags.openGraph.title} />

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content={metaTags.twitter.card} />
      <meta name="twitter:title" content={metaTags.twitter.title} />
      <meta name="twitter:description" content={metaTags.twitter.description} />
      {metaTags.twitter.images.map((image, index) => (
        <meta key={index} name="twitter:image" content={image} />
      ))}

      {/* Additional Meta Tags */}
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="language" content="en_US" />
      <meta name="author" content="Noiraé" />

      {/* Structured Data */}
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData)
          }}
        />
      )}

      {/* Additional custom head elements */}
      {children}
    </Head>
  );
}