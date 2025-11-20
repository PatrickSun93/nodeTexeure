'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function ShippingReturnsPage() {
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
            <h1 className="noirae-shipping-title">Shipping & Returns</h1>
            <p className="noirae-shipping-intro">
              At Noirae, we are committed to providing a seamless and luxurious experience from the moment you browse our collections to the moment your order arrives at your doorstep. Below you will find detailed information about our shipping and return policies, designed to make your experience as smooth as our finest silk.
            </p>
          </div>

          {/* Shipping Policy Section */}
          <section className="noirae-shipping-section">
            <h2 className="noirae-shipping-section-title">Shipping Policy</h2>
            
            <div className="noirae-shipping-accordion">
              {/* Shipping Methods & Costs */}
              <div className="noirae-shipping-accordion-item">
                <button
                  onClick={() => toggleSection('shipping-methods')}
                  className="noirae-shipping-accordion-button"
                  aria-expanded={expandedSection === 'shipping-methods'}
                >
                  <span>Shipping Methods & Costs</span>
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
                      We offer complimentary standard shipping on all domestic orders over $150. For orders under $150, a flat rate of $10 applies. Express shipping is available for an additional fee calculated at checkout based on your location.
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
                  <span>Estimated Delivery Times</span>
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
                      Standard shipping typically takes 5-7 business days. Express shipping takes 2-3 business days. Please note that delivery times may vary during peak seasons or holidays. You will receive a tracking number via email once your order has shipped.
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
                  <span>Order Processing & Tracking</span>
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
                      All orders are processed within 1-2 business days. You will receive an email confirmation when your order is placed, and another email with tracking information when your order ships. You can track your order anytime through the link provided in your shipping confirmation email.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Return Policy Section */}
          <section className="noirae-shipping-section">
            <h2 className="noirae-shipping-section-title">Return Policy</h2>
            
            <div className="noirae-shipping-accordion">
              {/* Return Process */}
              <div className="noirae-shipping-accordion-item">
                <button
                  onClick={() => toggleSection('return-process')}
                  className="noirae-shipping-accordion-button"
                  aria-expanded={expandedSection === 'return-process'}
                >
                  <span>Return Process</span>
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
                      We accept returns within 30 days of delivery. To initiate a return, please visit our returns portal or contact customer service. A pre-paid shipping label will be provided for your convenience.
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
                  <span>Eligibility & Conditions</span>
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
                      Items must be unused, unwashed, and in their original condition with all tags attached. We reserve the right to refuse returns that do not meet these conditions. Final sale items and personalized products are not eligible for return.
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
                  <span>Refunds & Exchanges</span>
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
                      Refunds will be processed within 5-7 business days of receiving your return. The refund will be issued to your original payment method. Exchanges can be requested through our customer service team, subject to availability.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Contact CTA Section */}
          <div className="noirae-shipping-cta">
            <p className="noirae-shipping-cta-text">
              Have more questions? Our customer service team is here to help.
            </p>
            <Link href="/contact" className="noirae-shipping-cta-button">
              Contact Customer Service
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

