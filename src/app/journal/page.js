"use client";

import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Link from 'next/link';

export default function JournalPage() {
  // Mock journal articles
  const articles = [
    {
      id: 1,
      title: 'The Science of Sleep: Why Quality Bedding Matters',
      excerpt: 'Discover how the right bedding materials can transform your sleep quality and overall well-being.',
      image: '/api/placeholder/800/500',
      date: 'November 5, 2024',
      category: 'Sleep Science',
      readTime: '5 min read'
    },
    {
      id: 2,
      title: 'Caring for Your Silk Bedding: A Complete Guide',
      excerpt: 'Learn the best practices for maintaining the luxury and quality of your silk bedding. Discover proper washing techniques, storage tips, and care instructions to ensure your investment lasts for years to come.',
      image: '/api/placeholder/800/500',
      date: 'October 28, 2024',
      category: 'Care Guide',
      readTime: '7 min read'
    },
    {
      id: 3,
      title: 'The Cashmere Story: From Mongolia to Your Bedroom',
      excerpt: 'Follow the journey of cashmere from the high plateaus of Mongolia to the softest bedding you&apos;ve ever experienced.',
      image: '/api/placeholder/800/500',
      date: 'October 15, 2024',
      category: 'Behind the Scenes',
      readTime: '6 min read'
    },
    {
      id: 4,
      title: 'Creating Your Perfect Sleep Sanctuary',
      excerpt: 'Transform your bedroom into a haven of comfort with our expert interior styling tips.',
      image: '/api/placeholder/800/500',
      date: 'October 1, 2024',
      category: 'Lifestyle',
      readTime: '4 min read'
    }
  ];

  const featuredArticle = articles[0];
  const recentArticles = articles.slice(1);

  return (
    <div className="aesop-page">
      <Header />
      
      <main>
        {/* Hero Section */}
        <section className="noirae-journal-hero">
          <div className="aesop-container">
            <h1 className="noirae-heading-hero">The Journal</h1>
            <p className="noirae-journal-hero-subtitle">
              Stories, insights, and inspiration from the world of luxury bedding
            </p>
          </div>
        </section>

        {/* Featured Article */}
        <section className="noirae-journal-featured">
          <div className="aesop-container">
            <Link href={`/journal/${featuredArticle.id}`} className="noirae-featured-article">
              <div className="noirae-featured-article-image">
                <img src={featuredArticle.image} alt={featuredArticle.title} />
                <span className="noirae-article-category">{featuredArticle.category}</span>
              </div>
              <div className="noirae-featured-article-content">
                <h2 className="noirae-heading-1">{featuredArticle.title}</h2>
                <p className="noirae-article-excerpt">{featuredArticle.excerpt}</p>
                <div className="noirae-article-meta">
                  <span className="noirae-article-date">{featuredArticle.date}</span>
                  <span className="noirae-article-divider">•</span>
                  <span className="noirae-article-read-time">{featuredArticle.readTime}</span>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Recent Articles Grid */}
        <section className="noirae-journal-recent">
          <div className="aesop-container">
            <h2 className="noirae-heading-2">Recent Stories</h2>
            
            <div className="noirae-articles-grid">
              {recentArticles.map((article) => (
                <Link key={article.id} href={`/journal/${article.id}`} className="noirae-article-card">
                  <div className="noirae-article-image">
                    <img src={article.image} alt={article.title} />
                    <span className="noirae-article-category">{article.category}</span>
                  </div>
                  <div className="noirae-article-content">
                    <h3 className="noirae-heading-3">{article.title}</h3>
                    <p className="noirae-article-excerpt">{article.excerpt}</p>
                    <div className="noirae-article-meta">
                      <span className="noirae-article-date">{article.date}</span>
                      <span className="noirae-article-divider">•</span>
                      <span className="noirae-article-read-time">{article.readTime}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Newsletter Signup */}
        <section className="noirae-journal-newsletter">
          <div className="aesop-container">
            <div className="noirae-journal-newsletter-content">
              <h2 className="noirae-heading-2">Stay Inspired</h2>
              <p>
                Subscribe to our journal for the latest stories, sleep tips, and exclusive insights 
                delivered directly to your inbox.
              </p>
              <form className="noirae-newsletter-form">
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="noirae-newsletter-input"
                  required
                />
                <button type="submit" className="noirae-btn-primary">
                  Subscribe
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
}

