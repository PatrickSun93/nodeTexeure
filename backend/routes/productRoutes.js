const express = require('express');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const router = express.Router();

// GET /api/products - Product listing with pagination and filters
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, min_price, max_price, search } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM products';
    let countQuery = 'SELECT COUNT(*) as total FROM products';
    let whereClauses = [];
    let filterParams = [];

    // Category filter
    if (category) {
      whereClauses.push('category_id = ?');
      filterParams.push(category);
    }

    // Price filters
    if (min_price) {
      whereClauses.push('base_price >= ?');
      filterParams.push(min_price);
    }
    if (max_price) {
      whereClauses.push('base_price <= ?');
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
      whereClauses.push(`JSON_UNQUOTE(JSON_EXTRACT(product_details, '$.material')) IN (${placeholders})`);
      filterParams.push(...materials);
    }

    // Fulltext or LIKE search
    if (search) {
      whereClauses.push('MATCH(name, description, short_description) AGAINST (? IN NATURAL LANGUAGE MODE)');
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

    const listResult = await DatabaseUtil.executeQuery(query, filterParams);
    if (!listResult.success) throw new Error(listResult.error || 'Failed to fetch products');
    const rows = listResult.data;

    const countResult = await DatabaseUtil.executeQuery(countQuery, filterParams);
    if (!countResult.success) throw new Error(countResult.error || 'Failed to count products');
    const total = Number(countResult.data[0]?.total || 0);

    const keyValueTable = { products: rows, total, page: pageNum, limit: limitNum };
    res.json(ResponseFormatter.success('Products fetched successfully', keyValueTable));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/products/:id - Product details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const productResult = await DatabaseUtil.executeQuery('SELECT * FROM products WHERE id = ?', [id]);
    if (!productResult.success) throw new Error(productResult.error || 'Failed to fetch product');
    if (!productResult.data || productResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    const variantsResult = await DatabaseUtil.executeQuery('SELECT * FROM product_variants WHERE product_id = ?', [id]);
    if (!variantsResult.success) throw new Error(variantsResult.error || 'Failed to fetch variants');

    const imagesResult = await DatabaseUtil.executeQuery('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [id]);
    if (!imagesResult.success) throw new Error(imagesResult.error || 'Failed to fetch images');

    const reviewsResult = await DatabaseUtil.executeQuery('SELECT * FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC', [id]);
    if (!reviewsResult.success) throw new Error(reviewsResult.error || 'Failed to fetch reviews');

    const keyValueTable = { ...productResult.data[0], variants: variantsResult.data, images: imagesResult.data, reviews: reviewsResult.data };
    res.json(ResponseFormatter.success('Product fetched successfully', keyValueTable));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

module.exports = router;