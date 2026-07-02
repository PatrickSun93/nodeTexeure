const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const PerformanceMiddleware = require('../middleware/performanceMiddleware');
const cacheManager = require('../utils/cacheManager');
const router = express.Router();

// Locale for serving translated product content. Comes from the NEXT_LOCALE cookie
// (set by the storefront LanguageSwitcher and forwarded through the Next proxy), with
// a ?locale= query override. Unknown values fall back to English.
const SUPPORTED_LOCALES = ['en', 'zh', 'fr', 'es'];
function resolveLocale(req) {
  const raw = req.query.locale || req.cookies?.NEXT_LOCALE || 'en';
  return SUPPORTED_LOCALES.includes(raw) ? raw : 'en';
}

// Map a product row's translation-override columns back onto the canonical fields
// and drop the temporary t_* aliases.
function applyTranslation(p) {
  const out = {
    ...p,
    name: p.t_name ?? p.name,
    short_description: p.t_short_description ?? p.short_description,
    description: p.t_description ?? p.description,
  };
  delete out.t_name;
  delete out.t_short_description;
  delete out.t_description;
  return out;
}

// GET /api/products - Product listing with pagination and filters (with caching)
router.get('/', PerformanceMiddleware.responseCache({
  ttl: 300, // 5 minutes cache
  cacheType: 'products',
  keyGenerator: (req) => `products_list_${resolveLocale(req)}_${JSON.stringify(req.query)}`,
  skipCache: (req) => req.query.nocache === 'true'
}), async (req, res) => {
  try {
    const { page = 1, limit = 10, category, min_price, max_price, search } = req.query;
    const locale = resolveLocale(req);
    const offset = (page - 1) * limit;
    // p.* plus the translated overrides (t_*); COALESCE falls back to the English base.
    let query = `SELECT p.*,
        COALESCE(pt.name, p.name) AS t_name,
        COALESCE(pt.short_description, p.short_description) AS t_short_description,
        COALESCE(pt.description, p.description) AS t_description
      FROM products p
      LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?`;
    let countQuery = 'SELECT COUNT(*) as total FROM products p';
    let whereClauses = ['p.status = ?']; // Only show approved products to public
    let filterParams = ['approved'];      // params for the WHERE (shared by list + count)

    // Category filter
    if (category) {
      whereClauses.push('p.category_id = ?');
      filterParams.push(category);
    }

    // Price filters
    if (min_price) {
      whereClauses.push('p.base_price >= ?');
      filterParams.push(min_price);
    }
    if (max_price) {
      whereClauses.push('p.base_price <= ?');
      filterParams.push(max_price);
    }

    // Materials filter (JSON: product_details.material)
    // Accepts: ?materials=Cotton,Polyester or ?materials[]=Cotton&materials[]=Polyester or ?material=Cotton
    const rawMaterials = req.query.materials ?? req.query.material;
    let materials = [];
    if (rawMaterials) {
      if (Array.isArray(rawMaterials)) {
        materials = rawMaterials;
      } else {
        materials = String(rawMaterials).split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (materials.length > 0) {
      const placeholders = materials.map(() => '?').join(', ');
      // JSON_EXTRACT returns JSON string => unquote to compare to plain strings
      whereClauses.push(`JSON_UNQUOTE(JSON_EXTRACT(p.product_details, '$.material')) IN (${placeholders})`);
      filterParams.push(...materials);
    }

    // Fulltext or LIKE search
    if (search) {
      whereClauses.push('MATCH(p.name, p.description, p.short_description) AGAINST (? IN NATURAL LANGUAGE MODE)');
      filterParams.push(search);
    }

    if (whereClauses.length > 0) {
      const where = ' WHERE ' + whereClauses.join(' AND ');
      query += where;
      countQuery += where;
    }

    const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const offsetNum = Math.max(0, (pageNum - 1) * limitNum);

    query += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;

    // List query joins translations, so the locale param leads; count has no join.
    const listResult = await DatabaseUtil.executeQuery(query, [locale, ...filterParams]);
    if (!listResult.success) throw new Error(listResult.error || 'Failed to fetch products');
    const rows = listResult.data;

    const countResult = await DatabaseUtil.executeQuery(countQuery, filterParams);
    if (!countResult.success) throw new Error(countResult.error || 'Failed to count products');
    const total = Number(countResult.data[0]?.total || 0);

    // Apply the locale translation overrides + map image alias for the frontend.
    const products = (rows || []).map((row) => {
      const p = applyTranslation(row);
      return {
        ...p,
        image: p.image || p.thumbnail_small_url || p.thumbnail_medium_url || p.thumbnail_large_url || null,
      };
    });

    const keyValueTable = { products, total, page: pageNum, limit: limitNum };
    res.json(ResponseFormatter.success('Products fetched successfully', keyValueTable));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/products/by-ids - Fetch products by a list of IDs, preserving order
router.get('/by-ids', async (req, res) => {
  try {
    const raw = req.query.ids;

    // Support ids=1,2,3 or ids[]=1&ids[]=2
    let idList = [];
    if (Array.isArray(raw)) {
      idList = raw.flatMap(v => String(v).split(',')).map(v => v.trim()).filter(Boolean);
    } else if (typeof raw === 'string') {
      idList = raw.split(',').map(v => v.trim()).filter(Boolean);
    }

    // Validate and normalize to integers
    const ids = idList.filter(v => /^\d+$/.test(v)).map(v => parseInt(v, 10));

    if (!ids || ids.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('Parameter "ids" is required and must contain at least one numeric id'));
    }

    // Limit to prevent abuse
    if (ids.length > 100) {
      return res.status(400).json(ResponseFormatter.failure('Too many ids provided (max 100)'));
    }

    // Build placeholders for IN clause and ORDER BY FIELD to preserve order, only approved products
    const placeholders = ids.map(() => '?').join(', ');
    const orderPlaceholders = ids.map(() => '?').join(', ');

    const query = `SELECT * FROM products WHERE id IN (${placeholders}) AND status = ? ORDER BY FIELD(id, ${orderPlaceholders})`;

    const result = await DatabaseUtil.executeQuery(query, [...ids, 'approved', ...ids]);
    if (!result.success) throw new Error(result.error || 'Failed to fetch products by ids');

    const rows = result.data || [];

    // Map image alias for frontend compatibility
    const products = rows.map(p => ({
      ...p,
      image: p.image || p.thumbnail_small_url || p.thumbnail_medium_url || p.thumbnail_large_url || null,
    }));

    const keyValueTable = { products, total: products.length };
    res.json(ResponseFormatter.success('Products fetched by IDs successfully', keyValueTable));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/products/:id - Product details (with caching)
router.get('/:id', PerformanceMiddleware.responseCache({
  ttl: 600, // 10 minutes cache for individual products
  cacheType: 'products',
  keyGenerator: (req) => `product_${resolveLocale(req)}_${req.params.id}`,
  skipCache: (req) => req.query.nocache === 'true'
}), async (req, res) => {
  try {
    const { id: param } = req.params;
    const locale = resolveLocale(req);

    // Allow fetching by primary id OR slug, but only approved products for public.
    // COALESCE the localized name/descriptions over the English base.
    const productResult = await DatabaseUtil.executeQuery(
      `SELECT p.*,
          COALESCE(pt.name, p.name) AS t_name,
          COALESCE(pt.short_description, p.short_description) AS t_short_description,
          COALESCE(pt.description, p.description) AS t_description
        FROM products p
        LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
        WHERE (p.id = ? OR p.slug = ?) AND p.status = ? LIMIT 1`,
      [locale, param, param, 'approved']
    );
    if (!productResult.success) throw new Error(productResult.error || 'Failed to fetch product');
    if (!productResult.data || productResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    const product = applyTranslation(productResult.data[0]);
    const productId = product.id;

    const variantsResult = await DatabaseUtil.executeQuery('SELECT * FROM product_variants WHERE product_id = ?', [productId]);
    if (!variantsResult.success) throw new Error(variantsResult.error || 'Failed to fetch variants');

    const imagesResult = await DatabaseUtil.executeQuery('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [productId]);
    if (!imagesResult.success) throw new Error(imagesResult.error || 'Failed to fetch images');

    const reviewsResult = await DatabaseUtil.executeQuery('SELECT * FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC', [productId]);
    if (!reviewsResult.success) throw new Error(reviewsResult.error || 'Failed to fetch reviews');

    const keyValueTable = { ...product, variants: variantsResult.data, images: imagesResult.data, reviews: reviewsResult.data };
    res.json(ResponseFormatter.success('Product fetched successfully', keyValueTable));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

module.exports = router;