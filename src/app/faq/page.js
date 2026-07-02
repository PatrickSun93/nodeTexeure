'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function FAQPage() {
  const t = useTranslations('Faq');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedFAQ, setExpandedFAQ] = useState(null);

  const categories = [
    { id: 'all', label: t('categoryAll') },
    { id: 'ordering', label: t('categoryOrdering') },
    { id: 'shipping', label: t('categoryShipping') },
    { id: 'care', label: t('categoryCare') },
    { id: 'returns', label: t('categoryReturns') },
    { id: 'materials', label: t('categoryMaterials') }
  ];

  const faqs = [
    { id: 1, category: 'materials', question: t('materialsQuestion'), answer: t('materialsAnswer') },
    { id: 2, category: 'care', question: t('silkCareQuestion'), answer: t('silkCareAnswer') },
    { id: 3, category: 'shipping', question: t('shippingOptionsQuestion'), answer: t('shippingOptionsAnswer') },
    { id: 4, category: 'returns', question: t('openReturnsQuestion'), answer: t('openReturnsAnswer') },
    { id: 5, category: 'returns', question: t('returnPolicyQuestion'), answer: t('returnPolicyAnswer') },
    { id: 6, category: 'ordering', question: t('paymentMethodsQuestion'), answer: t('paymentMethodsAnswer') },
    { id: 7, category: 'ordering', question: t('modifyOrderQuestion'), answer: t('modifyOrderAnswer') },
    { id: 8, category: 'shipping', question: t('internationalShippingQuestion'), answer: t('internationalShippingAnswer') },
    { id: 9, category: 'care', question: t('cashmereCareQuestion'), answer: t('cashmereCareAnswer') },
    { id: 10, category: 'materials', question: t('hypoallergenicQuestion'), answer: t('hypoallergenicAnswer') }
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
            <h1 className="noirae-faq-title">{t('title')}</h1>
            
            {/* Search Bar */}
            <div className="noirae-faq-search-wrapper">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="noirae-faq-search-input"
              />
              <button className="noirae-faq-search-button" aria-label={t('searchLabel')}>
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
                  <p>{t('noResults')}</p>
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

