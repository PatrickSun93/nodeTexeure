const express = require('express');
const router = express.Router();
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Journal (editorial blog) routes — all PUBLIC (no auth).
 * Only rows with status='published' are ever exposed.
 *
 * Response envelope follows ResponseFormatter (keyValueTable holds the payload):
 *   GET /api/journal            -> { articles: [...] }   (excerpt/list fields, no body)
 *   GET /api/journal/:idOrSlug  -> { article: {...} }    (full row incl. content)
 */

// Columns returned by the LIST endpoint (omit the heavy `content` body).
const LIST_COLUMNS =
  'id, slug, title, excerpt, category, author, hero_image, read_minutes, published_at';

// executeQuery returns { success, data } where data is the rows array; normalize
// defensively (the repo's executeQuery shape is not identical across all callers).
function rowsOf(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return Array.isArray(result.data) ? result.data : [];
}

/**
 * GET /api/journal
 * List published articles, newest first. Optional ?category= filter (exact match,
 * e.g. Care / Guides / Ritual / Craft). Optional ?limit= (defaults to 50, capped 100).
 */
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (limit > 100) limit = 100;

    const params = [];
    let where = "WHERE status = 'published'";
    if (category && category !== 'All') {
      where += ' AND category = ?';
      params.push(category);
    }

    // `limit` is a validated integer (1–100), so it is inlined directly: mysql2's
    // prepared-statement path rejects a bound `LIMIT ?` ("Incorrect arguments to
    // mysqld_stmt_execute"). Only `category` (real user input) is bound as a param.
    const sql = `
      SELECT ${LIST_COLUMNS}
      FROM journal_articles
      ${where}
      ORDER BY published_at DESC, created_at DESC
      LIMIT ${limit}
    `;

    const result = await DatabaseUtil.executeQuery(sql, params);
    if (result && result.success === false) {
      throw new Error(result.error || 'Query failed');
    }

    res.json(ResponseFormatter.success('Journal articles fetched successfully', {
      articles: rowsOf(result),
    }));
  } catch (error) {
    console.error('Error fetching journal articles:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

/**
 * GET /api/journal/:idOrSlug
 * Fetch a single published article by its custom id (JRNL...) or its slug.
 */
router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;

    const sql = `
      SELECT id, slug, title, excerpt, content, category, author,
             hero_image, read_minutes, published_at, created_at, updated_at
      FROM journal_articles
      WHERE (id = ? OR slug = ?) AND status = 'published'
      LIMIT 1
    `;
    const result = await DatabaseUtil.executeQuery(sql, [idOrSlug, idOrSlug]);
    if (result && result.success === false) {
      throw new Error(result.error || 'Query failed');
    }

    const article = rowsOf(result)[0];
    if (!article) {
      return res.status(404).json(ResponseFormatter.failure('Article not found', { idOrSlug }));
    }

    res.json(ResponseFormatter.success('Journal article fetched successfully', { article }));
  } catch (error) {
    console.error('Error fetching journal article:', error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

module.exports = router;
