"use client";

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function PrivacyPage() {
  const t = useTranslations('Privacy');

  // Static legal sections. Each key resolves to a title + body in the Privacy namespace.
  const sections = [
    'collection',
    'use',
    'sharing',
    'cookies',
    'security',
    'rights',
    'retention',
    'contact',
  ];

  return (
    <div className="noirae-page">
      <Header />

      <main className="noirae-shipping-main">
        <div className="aesop-container noirae-shipping-container">
          {/* Header */}
          <div className="noirae-shipping-header">
            <h1 className="noirae-shipping-title">{t('pageTitle')}</h1>
            <p className="noirae-shipping-intro">{t('intro')}</p>
            <p className="noirae-legal-updated">{t('lastUpdated')}</p>
          </div>

          {sections.map((key) => (
            <section key={key} className="noirae-shipping-section">
              <h2 className="noirae-shipping-section-title">{t(`${key}Title`)}</h2>
              <p className="noirae-legal-body">{t(`${key}Body`)}</p>

              {key === 'contact' && (
                <p className="noirae-legal-body">
                  <Link href="/contact" className="noirae-legal-link">
                    {t('contactLinkText')}
                  </Link>
                </p>
              )}
            </section>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
