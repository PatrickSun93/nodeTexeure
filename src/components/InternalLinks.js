/**
 * Internal Links Component for SEO optimization
 * Provides contextual internal linking throughout the site
 */
import Link from 'next/link';

// Category links for internal linking
const categoryLinks = [
  { name: 'Sheets', slug: 'sheets', description: 'Premium bed sheets' },
  { name: 'Pillows', slug: 'pillows', description: 'Comfortable pillows' },
  { name: 'Blankets', slug: 'blankets', description: 'Cozy blankets' },
  { name: 'Mattresses', slug: 'mattresses', description: 'Quality mattresses' },
  { name: 'Accessories', slug: 'accessories', description: 'Bed accessories' }
];

// Popular product links (these would typically come from an API)
const popularProducts = [
  { id: 1, name: 'Luxury Cotton Sheets', category: 'sheets' },
  { id: 2, name: 'Silk Pillowcase Set', category: 'pillows' },
  { id: 3, name: 'Memory Foam Mattress', category: 'mattresses' }
];

/**
 * Category Navigation Links
 */
export function CategoryNavigation({ currentCategory = null, className = '' }) {
  return (
    <nav className={`category-navigation ${className}`} aria-label="Product categories">
      <h3 className="category-nav-title">Shop by Category</h3>
      <ul className="category-nav-list">
        {categoryLinks.map(category => (
          <li key={category.slug} className="category-nav-item">
            <Link 
              href={`/categories/${category.slug}`}
              className={`category-nav-link ${currentCategory === category.slug ? 'active' : ''}`}
              title={`Shop ${category.description}`}
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Related Products Links
 */
export function RelatedProductsLinks({ currentProductId, category, className = '' }) {
  // Filter out current product and show related products from same category
  const relatedProducts = popularProducts.filter(
    product => product.id !== currentProductId && product.category === category
  );

  if (relatedProducts.length === 0) return null;

  return (
    <aside className={`related-products-links ${className}`}>
      <h3 className="related-products-title">Related Products</h3>
      <ul className="related-products-list">
        {relatedProducts.map(product => (
          <li key={product.id} className="related-product-item">
            <Link 
              href={`/products/${product.id}`}
              className="related-product-link internal-link"
              title={`View ${product.name}`}
            >
              {product.name}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Footer Site Links for SEO
 */
export function FooterSiteLinks({ className = '' }) {
  const footerLinks = [
    {
      title: 'Shop',
      links: [
        { name: 'All Products', href: '/shop' },
        { name: 'New Arrivals', href: '/new-arrive' },
        ...categoryLinks.map(cat => ({ name: cat.name, href: `/categories/${cat.slug}` }))
      ]
    },
    {
      title: 'Customer Care',
      links: [
        { name: 'Contact Us', href: '/contact' },
        { name: 'About Us', href: '/about' },
        { name: 'Size Guide', href: '/size-guide' },
        { name: 'Care Instructions', href: '/care-instructions' }
      ]
    },
    {
      title: 'Account',
      links: [
        { name: 'My Account', href: '/profile' },
        { name: 'Order History', href: '/orders' },
        { name: 'Wishlist', href: '/wishlist' },
        { name: 'Cart', href: '/cart' }
      ]
    }
  ];

  return (
    <div className={`footer-site-links ${className}`}>
      {footerLinks.map(section => (
        <div key={section.title} className="footer-link-section">
          <h4 className="footer-section-title">{section.title}</h4>
          <ul className="footer-link-list">
            {section.links.map(link => (
              <li key={link.href} className="footer-link-item">
                <Link 
                  href={link.href}
                  className="footer-link internal-link"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Contextual Product Links within content
 */
export function ContextualProductLinks({ context = 'general', className = '' }) {
  let links = [];

  switch (context) {
    case 'sheets':
      links = [
        { text: 'silk pillowcases', href: '/categories/pillows' },
        { text: 'matching blankets', href: '/categories/blankets' },
        { text: 'mattress protectors', href: '/categories/accessories' }
      ];
      break;
    case 'pillows':
      links = [
        { text: 'luxury sheets', href: '/categories/sheets' },
        { text: 'comfortable mattresses', href: '/categories/mattresses' },
        { text: 'cozy blankets', href: '/categories/blankets' }
      ];
      break;
    case 'general':
    default:
      links = [
        { text: 'premium bed sheets', href: '/categories/sheets' },
        { text: 'comfortable pillows', href: '/categories/pillows' },
        { text: 'luxury blankets', href: '/categories/blankets' }
      ];
      break;
  }

  return (
    <div className={`contextual-links ${className}`}>
      <p className="contextual-links-text">
        Complete your bedroom with our {' '}
        {links.map((link, index) => (
          <span key={link.href}>
            <Link href={link.href} className="internal-link">
              {link.text}
            </Link>
            {index < links.length - 1 && (index === links.length - 2 ? ' and ' : ', ')}
          </span>
        ))}
        .
      </p>
    </div>
  );
}

/**
 * Breadcrumb-style navigation for SEO
 */
export function SEONavigation({ currentPage, parentPages = [], className = '' }) {
  return (
    <nav className={`seo-navigation ${className}`} aria-label="Site navigation">
      <ul className="seo-nav-list">
        <li className="seo-nav-item">
          <Link href="/" className="seo-nav-link">Home</Link>
        </li>
        {parentPages.map((page, index) => (
          <li key={index} className="seo-nav-item">
            <span className="seo-nav-separator">›</span>
            <Link href={page.href} className="seo-nav-link">{page.name}</Link>
          </li>
        ))}
        <li className="seo-nav-item">
          <span className="seo-nav-separator">›</span>
          <span className="seo-nav-current">{currentPage}</span>
        </li>
      </ul>
    </nav>
  );
}