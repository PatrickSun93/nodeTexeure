-- Journal (editorial blog) articles. DB-backed replacement for the old hardcoded
-- storefront journal. One row per article; the storefront lists published rows and
-- renders a detail page per slug. Content is authored/editorial data (English) and is
-- NOT localized through the i18n catalogs — only the surrounding UI chrome is.
--
-- Custom-ID prefix: 'JRNL' (registered below so get_next_id('JRNL') works).
-- Seed rows live in backend/scripts/seed-example-data.js (seedJournal), idempotent.
CREATE TABLE IF NOT EXISTS journal_articles (
  id            VARCHAR(50)  PRIMARY KEY,
  slug          VARCHAR(255) NOT NULL UNIQUE,
  title         VARCHAR(255) NOT NULL,
  excerpt       TEXT,
  content       LONGTEXT     NOT NULL,
  category      VARCHAR(100) NOT NULL DEFAULT 'Ritual',
  author        VARCHAR(150) DEFAULT 'The Noiraé Atelier',
  hero_image    VARCHAR(500),
  read_minutes  INT UNSIGNED DEFAULT 5,
  status        VARCHAR(20)  NOT NULL DEFAULT 'published',
  published_at  TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_journal_status (status),
  INDEX idx_journal_category (category),
  INDEX idx_journal_published_at (published_at)
);

-- Register the custom-ID prefix so get_next_id('JRNL') works.
INSERT IGNORE INTO transno (prefix, count, details) VALUES ('JRNL', 0, 'Journal article ID counter');
