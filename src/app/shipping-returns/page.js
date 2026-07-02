'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function ShippingReturnsPage() {
  const t = useTranslations('ShippingReturns');
  const [expandedSection, setExpandedSection] = useState('shipping-methods');

  const toggleSection = (id) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  return (
    <div className="noirae-page">
      <Header />
      
      <main className="noirae-shipping-main">
        <div className="aesop-container noirae-shipping-container">
          {/* Header Section */}
          <div className="noirae-shipping-header">
            <h1 className="noirae-shipping-title">{t('pageTitle')}</h1>
            <p className="noirae-shipping-intro">
              {t('intro')}
            </p>
          </div>

          {/* Shipping Policy Section */}
          <section className="noirae-shipping-section">
            <h2 className="noirae-shipping-section-title">{t('shippingPolicyTitle')}</h2>
            
            <div className="noirae-shipping-accordion">
              {/* Shipping Methods & Costs */}
              <div className="noirae-shipping-accordion-item">
                <button
                  onClick={() => toggleSection('shipping-methods')}
                  className="noirae-shipping-accordion-button"
                  aria-expanded={expandedSection === 'shipping-methods'}
                >
                  <span>{t('shippingMethodsHeading')}</span>
                  <svg 
                    className={`noirae-shipping-accordion-icon ${expandedSection === 'shipping-methods' ? 'expanded' : ''}`}
                    width="24" 
                    height="24" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSection === 'shipping-methods' && (
                  <div className="noirae-shipping-accordion-content">
                    <p>
                      {t('shippingMethodsBody')}
                    </p>
                  </div>
                )}
              </div>

              {/* Estimated Delivery Times */}
              <div className="noirae-shipping-accordion-item">
                <button
                  onClick={() => toggleSection('delivery-times')}
                  className="noirae-shipping-accordion-button"
                  aria-expanded={expandedSection === 'delivery-times'}
                >
                  <span>{t('deliveryTimesHeading')}</span>
                  <svg 
                    className={`noirae-shipping-accordion-icon ${expandedSection === 'delivery-times' ? 'expanded' : ''}`}
                    width="24" 
                    height="24" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSection === 'delivery-times' && (
                  <div className="noirae-shipping-accordion-content">
                    <p>
                      {t('deliveryTimesBody')}
                    </p>
                  </div>
                )}
              </div>

              {/* Order Processing & Tracking */}
              <div className="noirae-shipping-accordion-item">
                <button
                  onClick={() => toggleSection('order-tracking')}
                  className="noirae-shipping-accordion-button"
                  aria-expanded={expandedSection === 'order-tracking'}
                >
                  <span>{t('orderTrackingHeading')}</span>
                  <svg 
                    className={`noirae-shipping-accordion-icon ${expandedSection === 'order-tracking' ? 'expanded' : ''}`}
                    width="24" 
                    height="24" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSection === 'order-tracking' && (
                  <div className="noirae-shipping-accordion-content">
                    <p>
                      {t('orderTrackingBody')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Return Policy Section */}
          <section className="noirae-shipping-section">
            <h2 className="noirae-shipping-section-title">{t('returnPolicyTitle')}</h2>
            
            <div className="noirae-shipping-accordion">
              {/* Return Process */}
              <div className="noirae-shipping-accordion-item">
                <button
                  onClick={() => toggleSection('return-process')}
                  className="noirae-shipping-accordion-button"
                  aria-expanded={expandedSection === 'return-process'}
                >
                  <span>{t('returnProcessHeading')}</span>
                  <svg 
                    className={`noirae-shipping-accordion-icon ${expandedSection === 'return-process' ? 'expanded' : ''}`}
                    width="24" 
                    height="24" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSection === 'return-process' && (
                  <div className="noirae-shipping-accordion-content">
                    <p>
                      {t('returnProcessBody')}
                    </p>
                  </div>
                )}
              </div>

              {/* Eligibility & Conditions */}
              <div className="noirae-shipping-accordion-item">
                <button
                  onClick={() => toggleSection('eligibility')}
                  className="noirae-shipping-accordion-button"
                  aria-expanded={expandedSection === 'eligibility'}
                >
                  <span>{t('eligibilityHeading')}</span>
                  <svg 
                    className={`noirae-shipping-accordion-icon ${expandedSection === 'eligibility' ? 'expanded' : ''}`}
                    width="24" 
                    height="24" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSection === 'eligibility' && (
                  <div className="noirae-shipping-accordion-content">
                    <p>
                      {t('eligibilityBody')}
                    </p>
                  </div>
                )}
              </div>

              {/* Refunds & Exchanges */}
              <div className="noirae-shipping-accordion-item">
                <button
                  onClick={() => toggleSection('refunds')}
                  className="noirae-shipping-accordion-button"
                  aria-expanded={expandedSection === 'refunds'}
                >
                  <span>{t('refundsHeading')}</span>
                  <svg 
                    className={`noirae-shipping-accordion-icon ${expandedSection === 'refunds' ? 'expanded' : ''}`}
                    width="24" 
                    height="24" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSection === 'refunds' && (
                  <div className="noirae-shipping-accordion-content">
                    <p>
                      {t('refundsBody')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Contact CTA Section */}
          <div className="noirae-shipping-cta">
            <p className="noirae-shipping-cta-text">
              {t('ctaText')}
            </p>
            <Link href="/contact" className="noirae-shipping-cta-button">
              {t('ctaButton')}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}

