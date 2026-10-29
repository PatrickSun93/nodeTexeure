/**
 * Image Upload Routes
 * Handles image uploads to S3 (or local fallback) with thumbnail generation
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { randomUUID: uuidv4 } = require('crypto');
const ResponseFormatter = require('../utils/responseFormatter');
const DatabaseUtil = require('../utils/database');
const s3Service = require('../services/s3Service');
const { protect, admin } = require('../middleware/authMiddleware');
const db = DatabaseUtil; // executeQuery et al. are static — reference the class, not an instance

// Configure multer for memory storage (buffers)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  },
});

/**
 * POST /api/images/upload
 * Upload a single image (admin only — storage writes are not a customer feature)
 */
router.post('/upload', protect, admin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(ResponseFormatter.failure('No image file provided'));
    }

    // Build the key from a uuid + sanitized extension only — never the raw
    // client filename (path-traversal guard).
    const ext = path.extname(req.file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    const key = `general/${uuidv4()}${safeExt}`;

    const result = await s3Service.uploadFile(
      req.file.buffer,
      key,
      req.file.mimetype
    );

    res.json(ResponseFormatter.success('Image uploaded successfully', {
      url: result.url,
      key: result.key,
    }));
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to upload image'));
  }
});

/**
 * POST /api/images/product/:productId
 * Upload a product image with auto-generated thumbnails (admin only)
 */
router.post('/product/:productId', protect, admin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(ResponseFormatter.failure('No image file provided'));
    }

    const { productId } = req.params;

    // Verify product exists
    const product = db.first(await db.executeQuery('SELECT id FROM products WHERE id = ?', [productId]));
    if (!product) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    // Upload with thumbnails
    const result = await s3Service.uploadProductImage(
      req.file.buffer,
      req.file.originalname,
      productId
    );

    // Get max sort_order for this product
    const maxSort = db.first(await db.executeQuery(
      'SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM product_images WHERE product_id = ?',
      [productId]
    ));
    const sortOrder = (maxSort?.max_sort || 0) + 1;

    // Insert image record into database
    const imageId = uuidv4();
    await db.executeQuery(
      `INSERT INTO product_images (id, product_id, original_url, thumbnail_small_url, thumbnail_medium_url, thumbnail_large_url, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        imageId,
        productId,
        result.original.url,
        result.thumbnails.small?.url || result.original.url,
        result.thumbnails.medium?.url || result.original.url,
        result.thumbnails.large?.url || result.original.url,
        sortOrder,
      ]
    );

    res.json(ResponseFormatter.success('Product image uploaded successfully', {
      imageId,
      original: result.original.url,
      thumbnails: {
        small: result.thumbnails.small?.url,
        medium: result.thumbnails.medium?.url,
        large: result.thumbnails.large?.url,
      },
    }));
  } catch (error) {
    console.error('Error uploading product image:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to upload product image'));
  }
});

/**
 * DELETE /api/images/:imageId
 * Delete a product image (admin only)
 */
router.delete('/:imageId', protect, admin, async (req, res) => {
  try {
    const { imageId } = req.params;

    // Get image record
    const image = db.first(await db.executeQuery('SELECT * FROM product_images WHERE id = ?', [imageId]));
    if (!image) {
      return res.status(404).json(ResponseFormatter.failure('Image not found'));
    }

    // Delete from S3/local for each URL stored
    const urlsToDelete = [
      image.original_url,
      image.thumbnail_small_url,
      image.thumbnail_medium_url,
      image.thumbnail_large_url,
    ].filter(Boolean);

    for (const url of urlsToDelete) {
      try {
        // Extract key from URL
        const key = url.includes('amazonaws.com/')
          ? url.split('amazonaws.com/')[1]
          : url.replace('/uploads/', '');
        await s3Service.deleteFile(key);
      } catch (err) {
        console.warn('Non-fatal: could not delete file:', url, err.message);
      }
    }

    // Delete DB record
    await db.executeQuery('DELETE FROM product_images WHERE id = ?', [imageId]);

    res.json(ResponseFormatter.success('Image deleted successfully'));
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json(ResponseFormatter.failure(error.message || 'Failed to delete image'));
  }
});

module.exports = router;
