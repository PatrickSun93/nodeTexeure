'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

// Four-column footer matching the "Champagne & Charcoal" design (design/Noirae - Home.dc.html):
// a wide brand column + three link columns on a dark espresso ground. Labels are keyed
// into the Footer message namespace so the whole footer localizes.
const FOOTER_COLUMNS = [
  {
    headingKey: 'shop',
    links: [
      { key: 'allBedding', href: '/shop' },
      { key: 'silk', href: '/shop?material=silk' },
      { key: 'cashmere', href: '/shop?material=cashmere' },
      { key: 'newArrivals', href: '/new-arrive' },
    ],
  },
  {
    headingKey: 'company',
    links: [
      { key: 'ourStory', href: '/about' },
      { key: 'journal', href: '/journal' },
      { key: 'contactUs', href: '/contact' },
      { key: 'faq', href: '/faq' },
    ],
  },
  {
    headingKey: 'support',
    links: [
      { key: 'shippingReturns', href: '/shipping-returns' },
      { key: 'myOrders', href: '/orders' },
      { key: 'trackOrder', href: '/track-order' },
      { key: 'termsOfService', href: '/terms' },
    ],
  },
];

export default function Footer() {
  const t = useTranslations('Footer');
  return (
    <footer className="noirae-footer">
      <div className="noirae-footer-inner">
        <div className="noirae-footer-grid">
          {/* Brand column */}
          <div className="noirae-footer-brand">
            <div className="noirae-footer-wordmark">Noiraé</div>
            <p className="noirae-footer-tagline">{t('tagline')}</p>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.headingKey} className="noirae-footer-col">
              <div className="noirae-footer-col-heading">{t(col.headingKey)}</div>
              <nav className="noirae-footer-col-links">
                {col.links.map((l) => (
                  <Link key={l.key} href={l.href} className="noirae-footer-link">
                    {t(l.key)}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="noirae-footer-bottom">
          <div className="noirae-footer-copyright">
            © 2026 Noiraé. {t('rights')}
          </div>
          <div className="noirae-footer-social">
            <a
              href="https://instagram.com/noirae"
              target="_blank"
              rel="noopener noreferrer"
              className="noirae-footer-social-icon"
              aria-label="Instagram"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <a
              href="https://pinterest.com/noirae"
              target="_blank"
              rel="noopener noreferrer"
              className="noirae-footer-social-icon"
              aria-label="Pinterest"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8c-2 0-3.2 1.3-3.2 3 0 .9.4 1.6 1 1.9M12 8c2 0 3 1.3 3 2.9 0 1.9-1 3.3-2.6 3.3-.8 0-1.5-.6-1.3-1.5M11 16.5l1-4" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
