'use client';

import { useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedFAQ, setExpandedFAQ] = useState(null);

  const categories = [
    { id: 'all', label: 'ALL QUESTIONS' },
    { id: 'ordering', label: 'ORDERING & PAYMENT' },
    { id: 'shipping', label: 'SHIPPING & DELIVERY' },
    { id: 'care', label: 'PRODUCT CARE' },
    { id: 'returns', label: 'RETURNS & EXCHANGES' },
    { id: 'materials', label: 'MATERIALS' }
  ];

  const faqs = [
    {
      id: 1,
      category: 'materials',
      question: 'What materials are used in Noirae bedding?',
      answer: 'Our bedding collections primarly feature ethically sourced mulberry silk and premium cashmere, known both for their exceptional softness, anti-regulating and natural properties. We also use a within-strain cotton for certain collections.'
    },
    {
      id: 2,
      category: 'care',
      question: 'How do I care for my silk bedding?',
      answer: 'Silk bedding should be hand washed in cold water with a gentle detergent or dry cleaned. Avoid direct sunlight when drying and never use bleach. For best results, iron on low heat while slightly damp.'
    },
    {
      id: 3,
      category: 'shipping',
      question: 'What are your shipping options and times?',
      answer: 'We offer standard shipping (5-7 business days) and express shipping (2-3 business days). All orders are processed within 1-2 business days. Free standard shipping is available on orders over $200.'
    },
    {
      id: 4,
      category: 'returns',
      question: 'Do you offer returns for opened items?',
      answer: 'Yes, we accept returns within 30 days of purchase, even if the packaging has been opened. Items must be in unused condition with all original tags attached. Please contact our customer service team to initiate a return.'
    },
    {
      id: 5,
      category: 'returns',
      question: 'What is your return policy for opened items?',
      answer: 'We offer a 30-day return policy for opened items that are in unused condition. The product must be in its original state with tags attached. Return shipping is free for defective items, otherwise a $15 return shipping fee applies.'
    },
    {
      id: 6,
      category: 'ordering',
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards (Visa, MasterCard, American Express), PayPal, Apple Pay, and Google Pay. All transactions are secured with 256-bit SSL encryption.'
    },
    {
      id: 7,
      category: 'ordering',
      question: 'Can I modify or cancel my order?',
      answer: 'Orders can be modified or cancelled within 2 hours of placement. Please contact our customer service team immediately if you need to make changes.'
    },
    {
      id: 8,
      category: 'shipping',
      question: 'Do you ship internationally?',
      answer: 'Yes, we ship to over 50 countries worldwide. International shipping times vary by location, typically 7-14 business days. Customs fees and import duties are the responsibility of the customer.'
    },
    {
      id: 9,
      category: 'care',
      question: 'How do I care for cashmere bedding?',
      answer: 'Cashmere should be dry cleaned or hand washed in cool water with a cashmere-specific detergent. Lay flat to dry away from direct heat or sunlight. Store folded in a breathable bag with cedar or lavender to prevent moths.'
    },
    {
      id: 10,
      category: 'materials',
      question: 'Are your products hypoallergenic?',
      answer: 'Yes, our silk and cashmere products are naturally hypoallergenic and resistant to dust mites, mold, and mildew. They are ideal for people with sensitive skin or allergies.'
    }
  ];

  const filteredFAQs = faqs.filter(faq => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
    const matchesSearch = searchQuery === '' || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleFAQ = (id) => {
    setExpandedFAQ(expandedFAQ === id ? null : id);
  };

  return (
    <div className="noirae-page">
      <Header />
      
      <main className="noirae-faq-main">
        <div className="aesop-container">
          {/* Header Section */}
          <div className="noirae-faq-header">
            <h1 className="noirae-faq-title">FREQUENTLY ASKED QUESTIONS</h1>
            
            {/* Search Bar */}
            <div className="noirae-faq-search-wrapper">
              <input
                type="text"
                placeholder="SEARCH FAQS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="noirae-faq-search-input"
              />
              <button className="noirae-faq-search-button" aria-label="Search">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content Grid */}
          <div className="noirae-faq-grid">
            {/* Left Sidebar - Categories */}
            <aside className="noirae-faq-sidebar">
              {categories.map(category => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`noirae-faq-category ${activeCategory === category.id ? 'active' : ''}`}
                >
                  {category.label}
                </button>
              ))}
            </aside>

            {/* Right Content - FAQ List */}
            <div className="noirae-faq-content">
              {filteredFAQs.length === 0 ? (
                <div className="noirae-faq-empty">
                  <p>No questions found matching your search.</p>
                </div>
              ) : (
                <div className="noirae-faq-list">
                  {filteredFAQs.map(faq => (
                    <div key={faq.id} className="noirae-faq-item">
                      <button
                        onClick={() => toggleFAQ(faq.id)}
                        className="noirae-faq-question"
                        aria-expanded={expandedFAQ === faq.id}
                      >
                        <span>{faq.question}</span>
                        <svg 
                          className={`noirae-faq-icon ${expandedFAQ === faq.id ? 'expanded' : ''}`}
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
                        </svg>
                      </button>
                      {expandedFAQ === faq.id && (
                        <div className="noirae-faq-answer">
                          <p>{faq.answer}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}

