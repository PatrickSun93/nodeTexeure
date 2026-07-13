-- Migration 006: add category / type / status / preheader columns to email_templates
--
-- The admin email-template API (GET list, POST create, PUT update in
-- backend/routes/emailTemplateRoutes.js) reads and writes these four columns,
-- but the original table only had a `template_content` JSON blob. Loading the
-- admin "Email Templates" view failed with:
--   Unknown column 'category' in 'field list'
--
-- Note: MySQL 8.0 does not support "ADD COLUMN IF NOT EXISTS"; run once on an
-- existing database. Fresh databases get these columns from docker/mysql/init.sql.

ALTER TABLE email_templates ADD COLUMN category  VARCHAR(100) NULL;
ALTER TABLE email_templates ADD COLUMN type      VARCHAR(50)  NULL;
ALTER TABLE email_templates ADD COLUMN status    VARCHAR(50)  NOT NULL DEFAULT 'Draft';
ALTER TABLE email_templates ADD COLUMN preheader VARCHAR(255) NULL;
