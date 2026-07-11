"use client";

import { useEffect, useMemo, useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';

// Fixed filter taxonomy the design specifies. Values (except "All") match the
// `category` column stored in journal_articles; labels are localized via i18n.
const CATEGORIES = ['All', 'Care', 'Guides', 'Ritual', 'Craft'];

// Map an app locale to a BCP-47 tag for Intl date formatting.
const LOCALE_TAG = { en: 'en-US', zh: 'zh-CN', fr: 'fr-FR', es: 'es-ES' };

function formatDate(value, locale) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(LOCALE_TAG[locale] || 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

export default function JournalPage() {
  const t = useTranslations('Journal');
  const locale = useLocale();

  const [articles, setArticles] = useState([]);
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        // Relative path — routed to the backend through the Next proxy (never :6666).
        const res = await fetch('/api/journal');
        const data = await res.json();
        if (!active) return;
        if (data?.status === 'SUCCESS') {
          setArticles(data.keyValueTable?.articles || []);
        } else {
          setError(data?.message || 'Failed to load journal');
        }
      } catch (err) {
        if (active) setError('Failed to load journal');
        console.error('Journal load error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(
    () => (category === 'All' ? articles : articles.filter((a) => a.category === category)),
    [articles, category]
  );

  const featured = filtered[0] || null;
  const rest = filtered.slice(1);

  const meta = (a) => (
    <div className="noirae-article-meta">
      <span className="noirae-article-date">{formatDate(a.published_at, locale)}</span>
      <span className="noirae-article-divider">•</span>
      <span className="noirae-article-read-time">{t('readTime', { minutes: a.read_minutes || 5 })}</span>
    </div>
  );

  return (
    <div className="aesop-page">
      <Header />

      <main>
        {/* Hero Section */}
        <section className="noirae-journal-hero">
          <div className="aesop-container">
            <h1 className="noirae-heading-hero">{t('heroTitle')}</h1>
            <p className="noirae-journal-hero-subtitle">{t('heroSubtitle')}</p>
          </div>
        </section>

        {/* Category filter pills */}
        <div className="aesop-container">
          <div className="noirae-journal-filters" role="tablist" aria-label={t('recentTitle')}>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                className={`noirae-journal-filter-pill${category === c ? ' active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {t(`cat${c}`)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <section className="noirae-journal-recent">
            <div className="aesop-container">
              <p className="noirae-journal-state">{t('loading')}</p>
            </div>
          </section>
        ) : error ? (
          <section className="noirae-journal-recent">
            <div className="aesop-container">
              <p className="noirae-journal-state">{error}</p>
            </div>
          </section>
        ) : filtered.length === 0 ? (
          <section className="noirae-journal-recent">
            <div className="aesop-container">
              <p className="noirae-journal-state">{t('empty')}</p>
            </div>
          </section>
        ) : (
          <>
            {/* Featured Article */}
            {featured && (
              <section className="noirae-journal-featured">
                <div className="aesop-container">
                  <Link href={`/journal/${featured.slug}`} className="noirae-featured-article">
                    <div className="noirae-featured-article-image">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={featured.hero_image || '/api/placeholder/800/500'} alt={featured.title} />
                      <span className="noirae-article-category">{t(`cat${featured.category}`)}</span>
                    </div>
                    <div className="noirae-featured-article-content">
                      <h2 className="noirae-heading-1">{featured.title}</h2>
                      <p className="noirae-article-excerpt">{featured.excerpt}</p>
                      {meta(featured)}
                    </div>
                  </Link>
                </div>
              </section>
            )}

            {/* Recent Articles Grid */}
            {rest.length > 0 && (
              <section className="noirae-journal-recent">
                <div className="aesop-container">
                  <h2 className="noirae-heading-2">{t('recentTitle')}</h2>

                  <div className="noirae-articles-grid">
                    {rest.map((article) => (
                      <Link
                        key={article.id}
                        href={`/journal/${article.slug}`}
                        className="noirae-article-card"
                      >
                        <div className="noirae-article-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={article.hero_image || '/api/placeholder/800/500'} alt={article.title} />
                          <span className="noirae-article-category">{t(`cat${article.category}`)}</span>
                        </div>
                        <div className="noirae-article-content">
                          <h3 className="noirae-heading-3">{article.title}</h3>
                          <p className="noirae-article-excerpt">{article.excerpt}</p>
                          {meta(article)}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* Newsletter Signup */}
        <section className="noirae-journal-newsletter">
          <div className="aesop-container">
            <div className="noirae-journal-newsletter-content">
              <h2 className="noirae-heading-2">{t('newsletterTitle')}</h2>
              <p>{t('newsletterText')}</p>
              <form className="noirae-newsletter-form">
                <input
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  className="noirae-newsletter-input"
                  required
                />
                <button type="submit" className="noirae-btn-primary">
                  {t('subscribeButton')}
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
