"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';

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

export default function JournalArticlePage() {
  const t = useTranslations('Journal');
  const locale = useLocale();
  const { id } = useParams(); // slug or custom id from the URL

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setNotFound(false);
        const res = await fetch(`/api/journal/${encodeURIComponent(id)}`);
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (res.ok && data?.status === 'SUCCESS' && data.keyValueTable?.article) {
          setArticle(data.keyValueTable.article);
        } else {
          setNotFound(true);
        }
      } catch (err) {
        if (active) setNotFound(true);
        console.error('Journal article load error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    if (id) load();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="aesop-page">
      <Header />

      <main className="noirae-article-detail">
        <div className="aesop-container noirae-article-detail-container">
          <Link href="/journal" className="noirae-article-detail-back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t('backToJournal')}
          </Link>

          {loading ? (
            <p className="noirae-journal-state">{t('loading')}</p>
          ) : notFound || !article ? (
            <div className="noirae-article-notfound">
              <h1 className="noirae-heading-1">{t('notFoundTitle')}</h1>
              <p className="noirae-body-text">{t('notFoundText')}</p>
              <Link href="/journal" className="noirae-btn-primary noirae-btn-large">
                {t('backToJournal')}
              </Link>
            </div>
          ) : (
            <article>
              <header className="noirae-article-detail-header">
                <span className="noirae-article-detail-category">{t(`cat${article.category}`)}</span>
                <h1 className="noirae-article-detail-title">{article.title}</h1>
                <div className="noirae-article-detail-meta">
                  {article.author && <span>{t('byAuthor', { author: article.author })}</span>}
                  {article.author && <span className="noirae-article-divider">•</span>}
                  <span>{formatDate(article.published_at, locale)}</span>
                  <span className="noirae-article-divider">•</span>
                  <span>{t('readTime', { minutes: article.read_minutes || 5 })}</span>
                </div>
              </header>

              {article.hero_image && (
                <div className="noirae-article-detail-hero">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={article.hero_image} alt={article.title} />
                </div>
              )}

              {article.excerpt && <p className="noirae-article-detail-lead">{article.excerpt}</p>}

              {/* Content is trusted, server-authored editorial HTML (not user input). */}
              <div
                className="noirae-article-body"
                dangerouslySetInnerHTML={{ __html: article.content || '' }}
              />
            </article>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
