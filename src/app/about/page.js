"use client";

import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Link from 'next/link';

export default function AboutPage() {
  const t = useTranslations('About');

  return (
    <div className="aesop-page">
      <Header />

      <main>
        {/* Hero Section */}
        <section className="noirae-about-hero">
          <div className="aesop-container">
            <h1 className="noirae-heading-hero">{t('heroTitle')}</h1>
            <p className="noirae-about-hero-subtitle">
              {t('heroSubtitle')}
            </p>
          </div>
        </section>

        {/* Story Section */}
        <section className="noirae-about-story">
          <div className="aesop-container">
            <div className="noirae-about-story-content">
              <div className="noirae-about-story-text">
                <h2 className="noirae-heading-2">{t('storyTitle')}</h2>
                <p className="noirae-body-text">
                  {t('storyPara1')}
                </p>
                <p className="noirae-body-text">
                  {t('storyPara2')}
                </p>
              </div>
              <div className="noirae-about-story-image">
                <img src="/api/placeholder/600/800" alt={t('altAtelier')} />
              </div>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="noirae-about-values">
          <div className="aesop-container">
            <h2 className="noirae-heading-1 text-center">{t('valuesTitle')}</h2>

            <div className="noirae-values-detailed-grid">
              <div className="noirae-value-detailed">
                <div className="noirae-value-image-wrapper">
                  <img src="/api/placeholder/400/300" alt={t('valueQualityAlt')} />
                </div>
                <h3 className="noirae-heading-3">{t('valueQualityTitle')}</h3>
                <p>
                  {t('valueQualityText')}
                </p>
              </div>

              <div className="noirae-value-detailed">
                <div className="noirae-value-image-wrapper">
                  <img src="/api/placeholder/400/300" alt={t('valueSustainableAlt')} />
                </div>
                <h3 className="noirae-heading-3">{t('valueSustainabilityTitle')}</h3>
                <p>
                  {t('valueSustainabilityText')}
                </p>
              </div>

              <div className="noirae-value-detailed">
                <div className="noirae-value-image-wrapper">
                  <img src="/api/placeholder/400/300" alt={t('valueArtisanAlt')} />
                </div>
                <h3 className="noirae-heading-3">{t('valueArtisanTitle')}</h3>
                <p>
                  {t('valueArtisanText')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Timeline Section */}
        <section className="noirae-about-timeline">
          <div className="aesop-container">
            <h2 className="noirae-heading-1 text-center">{t('journeyTitle')}</h2>

            <div className="noirae-timeline">
              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2010</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">{t('timeline2010Title')}</h3>
                  <p>
                    {t('timeline2010Text')}
                  </p>
                </div>
              </div>

              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2013</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">{t('timeline2013Title')}</h3>
                  <p>
                    {t('timeline2013Text')}
                  </p>
                </div>
              </div>

              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2016</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">{t('timeline2016Title')}</h3>
                  <p>
                    {t('timeline2016Text')}
                  </p>
                </div>
              </div>

              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2020</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">{t('timeline2020Title')}</h3>
                  <p>
                    {t('timeline2020Text')}
                  </p>
                </div>
              </div>

              <div className="noirae-timeline-item">
                <div className="noirae-timeline-year">2024</div>
                <div className="noirae-timeline-content">
                  <h3 className="noirae-heading-3">{t('timeline2024Title')}</h3>
                  <p>
                    {t('timeline2024Text')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="noirae-about-cta">
          <div className="aesop-container">
            <div className="noirae-about-cta-content">
              <h2 className="noirae-heading-2">{t('ctaTitle')}</h2>
              <p className="noirae-body-text">
                {t('ctaText')}
              </p>
              <div className="noirae-about-cta-actions">
                <Link href="/shop" className="noirae-btn-primary noirae-btn-large">
                  {t('ctaShop')}
                </Link>
                <Link href="/contact" className="noirae-btn-secondary noirae-btn-large">
                  {t('ctaContact')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
