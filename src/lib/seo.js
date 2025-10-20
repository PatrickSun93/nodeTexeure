/**
 * SEO utilities for meta tags, structured data, and Open Graph
 */

// Default SEO configuration
export const defaultSEO = {
  title: 'Noiraé - Premium Bed Textures & Luxury Linens',
  description: 'Transform your bedroom with our luxurious collection of high-quality bed textures, premium linens, and home textiles. Shop Egyptian cotton sheets, silk pillowcases, and more.',
  keywords: 'bed textures, luxury linens, Egyptian cotton sheets, silk pillowcases, premium bedding, home textiles, bedroom decor',
  siteName: 'Noiraé',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://noirae.com',
  image: '/images/og-default.jpg',
  locale: 'en_US',
  type: 'website'
};

/**
 * Generate meta tags for a page
 */
export function generateMetaTags({
  title,
  description,
  keywords,
  image,
  url,
  type = 'website',
  locale = 'en-US',
  noindex = false,
  nofollow = false
}) {
  const fullTitle = title ? `${title} | ${defaultSEO.siteName}` : defaultSEO.title;
  const fullDescription = description || defaultSEO.description;
  const fullImage = image ? `${defaultSEO.siteUrl}${image}` : `${defaultSEO.siteUrl}${defaultSEO.image}`;
  const fullUrl = url ? `${defaultSEO.siteUrl}${url}` : defaultSEO.siteUrl;

  return {
    title: fullTitle,
    description: fullDescription,
    keywords: keywords || defaultSEO.keywords,
    robots: `${noindex ? 'noindex' : 'index'},${nofollow ? 'nofollow' : 'follow'}`,
    canonical: fullUrl,
    openGraph: {
      title: fullTitle,
      description: fullDescription,
      url: fullUrl,
      siteName: defaultSEO.siteName,
      images: [
        {
          url: fullImage,
          width: 1200,
          height: 630,
          alt: fullTitle,
        }
      ],
      locale: locale,
      type: type,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: fullDescription,
      images: [fullImage],
    },
  };
}

/**
 * Generate structured data (JSON-LD) for different page types
 */
export function generateStructuredData(type, data) {
  const baseData = {
    '@context': 'https://schema.org',
  };

  switch (type) {
    case 'website':
      return {
        ...baseData,
        '@type': 'WebSite',
        name: defaultSEO.siteName,
        url: defaultSEO.siteUrl,
        description: defaultSEO.description,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${defaultSEO.siteUrl}/shop?search={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      };

    case 'organization':
      return {
        ...baseData,
        '@type': 'Organization',
        name: defaultSEO.siteName,
        url: defaultSEO.siteUrl,
        logo: `${defaultSEO.siteUrl}/images/logo.png`,
        description: defaultSEO.description,
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: '+1-555-0123',
          contactType: 'customer service',
          availableLanguage: ['English', 'Chinese']
        }
      };

    case 'product':
      return {
        ...baseData,
        '@type': 'Product',
        name: data.name,
        description: data.description,
        image: data.images?.map(img => `${defaultSEO.siteUrl}${img.original_url}`) || [],
        sku: data.sku || data.id,
        brand: {
          '@type': 'Brand',
          name: defaultSEO.siteName
        },
        offers: {
          '@type': 'Offer',
          price: data.base_price || data.price,
          priceCurrency: 'USD',
          availability: data.stock_quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: `${defaultSEO.siteUrl}/products/${data.id}`,
          seller: {
            '@type': 'Organization',
            name: defaultSEO.siteName
          }
        },
        aggregateRating: data.rating ? {
          '@type': 'AggregateRating',
          ratingValue: data.rating,
          reviewCount: data.review_count || 0,
          bestRating: 5,
          worstRating: 1
        } : undefined
      };

    case 'breadcrumb':
      return {
        ...baseData,
        '@type': 'BreadcrumbList',
        itemListElement: data.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: `${defaultSEO.siteUrl}${item.url}`
        }))
      };

    case 'collection':
      return {
        ...baseData,
        '@type': 'CollectionPage',
        name: data.name,
        description: data.description,
        url: `${defaultSEO.siteUrl}${data.url}`,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: data.products?.length || 0,
          itemListElement: data.products?.map((product, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${defaultSEO.siteUrl}/products/${product.id}`
          })) || []
        }
      };

    default:
      return baseData;
  }
}

/**
 * Generate breadcrumb data for different page types
 */
export function generateBreadcrumbs(type, data = {}) {
  const breadcrumbs = [
    { name: 'Home', url: '/' }
  ];

  switch (type) {
    case 'shop':
      breadcrumbs.push({ name: 'Shop', url: '/shop' });
      if (data.category && data.category !== 'All') {
        breadcrumbs.push({ 
          name: data.category, 
          url: `/shop?category=${encodeURIComponent(data.category)}` 
        });
      }
      break;

    case 'product':
      breadcrumbs.push({ name: 'Shop', url: '/shop' });
      if (data.category) {
        breadcrumbs.push({ 
          name: data.category, 
          url: `/shop?category=${encodeURIComponent(data.category)}` 
        });
      }
      breadcrumbs.push({ 
        name: data.name, 
        url: `/products/${data.id}` 
      });
      break;

    case 'category':
      breadcrumbs.push({ name: 'Shop', url: '/shop' });
      breadcrumbs.push({ 
        name: data.name, 
        url: `/categories/${data.slug}` 
      });
      break;

    default:
      break;
  }

  return breadcrumbs;
}

/**
 * Generate SEO-friendly URL slug
 */
export function generateSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate canonical URL
 */
export function generateCanonicalUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${defaultSEO.siteUrl}${cleanPath}`;
}

/**
 * Generate hreflang tags for multi-language support
 */
export function generateHreflangTags(path, languages = ['en', 'zh-CN']) {
  return languages.map(lang => ({
    hreflang: lang,
    href: `${defaultSEO.siteUrl}/${lang}${path}`
  }));
}