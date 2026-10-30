-- Localized product content. The base products table stays the source of truth
-- (English); this table holds one row per (product, locale) with translated fields.
-- Product reads COALESCE the translation over the base, so a missing translation
-- transparently falls back to English.
CREATE TABLE IF NOT EXISTS product_translations (
  product_id VARCHAR(50) NOT NULL,
  locale VARCHAR(10) NOT NULL,
  name VARCHAR(255),
  short_description TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, locale),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
