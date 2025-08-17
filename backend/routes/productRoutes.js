const express = require('express');
const pool = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const router = express.Router();

// GET /api/products - Product listing with pagination and filters
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, minPrice, maxPrice, search } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM products';
    let countQuery = 'SELECT COUNT(*) as total FROM products';
    let whereClauses = [];
    let params = [];

    if (category) {
      whereClauses.push('category_id = ?');
      params.push(category);
    }
    if (minPrice) {
      whereClauses.push('base_price >= ?');
      params.push(minPrice);
    }
    if (maxPrice) {
      whereClauses.push('base_price <= ?');
      params.push(maxPrice);
    }
    if (search) {
      whereClauses.push('MATCH(name, description, short_description) AGAINST (? IN NATURAL LANGUAGE MODE)');
      params.push(search);
    }

    if (whereClauses.length > 0) {
      const where = ' WHERE ' + whereClauses.join(' AND ');
      query += where;
      countQuery += where;
    }

    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, params);
    const [[{ total }]] = await pool.query(countQuery, params.slice(0, -2));

    const keyValueTable = { products: rows, total, page: parseInt(page), limit: parseInt(limit) };
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
    const [product] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (product.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ?', [id]);
    const [images] = await pool.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [id]);
    const [reviews] = await pool.query('SELECT * FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC', [id]);

    const keyValueTable = { ...product[0], variants, images, reviews };
    res.json(ResponseFormatter.success('Product fetched successfully', keyValueTable));
  } catch (error) {
    console.error(error);
    res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

module.exports = router;