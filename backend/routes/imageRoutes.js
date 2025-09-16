const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const DatabaseUtil = require('../utils/database');
const ResponseFormatter = require('../utils/responseFormatter');
const ImageService = require('../services/imageService');

const router = express.Router();

// Rate limiter for image operations
const imageUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 image uploads per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

const imageReadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // Higher limit for read operations
  standardHeaders: true,
  legacyHeaders: false,
});

// Ensure upload directory exists
function ensureDirSync(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (e) {
    // ignore if exists
  }
}

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
    ensureDirSync(tempDir);
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ts = Date.now();
    cb(null, `${ts}-${safeBase}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 20, // Maximum 20 files per upload
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.'));
    }
    cb(null, true);
  },
});

// POST /api/images/products/:id/upload - Bulk image upload for a product
router.post('/products/:id/upload', imageUploadLimiter, csrfProtection, async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Validate product ID format
    if (!/^[A-Za-z0-9_-]+$/.test(String(productId))) {
      return res.status(400).json(ResponseFormatter.failure('Invalid product ID format'));
    }

    // Verify product exists
    const prodResult = await DatabaseUtil.executeQuery('SELECT id FROM products WHERE id = ? LIMIT 1', [productId]);
    if (!prodResult.success) {
      throw new Error(prodResult.error || 'Failed to verify product');
    }
    if (!prodResult.data || prodResult.data.length === 0) {
      return res.status(404).json(ResponseFormatter.failure('Product not found'));
    }

    // Handle file upload
    const uploadHandler = upload.array('images', 20);
    
    uploadHandler(req, res, async function (err) {
      if (err) {
        return res.status(400).json(ResponseFormatter.failure('Upload failed', { error: err.message }));
      }
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json(ResponseFormatter.failure('No files uploaded. Expected field name "images"'));
      }

      try {
        // Process images using ImageService
        const imageRecords = await ImageService.uploadImages(req.files, productId);
        
        return res.json(ResponseFormatter.success('Images uploaded successfully', {
          uploaded: imageRecords.length,
          images: imageRecords
        }));
      } catch (error) {
        console.error('Error processing images:', error);
        return res.status(500).json(ResponseFormatter.failure('Failed to process images', { error: error.message }));
      }
    });
  } catch (error) {
    console.error('Error in bulk image upload:', error);
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// GET /api/images/products/:id - Get all images for a product
router.get('/products/:id', imageReadLimiter, async (req, res) => {
  try {
    const productId = req.params.id;
    
    const imagesResult = await DatabaseUtil.executeQuery(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, created_at ASC',
      [productId]
    );
    
    if (!imagesResult.success) {
      throw new Error(imagesResult.error || 'Failed to fetch images');
    }

    return res.json(ResponseFormatter.success('Images fetched successfully', {
      images: imagesResult.data || []
    }));
  } catch (error) {
    console.error('Error fetching product images:', error);
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// PUT /api/images/:id/order - Update image sort order
router.put('/:id/order', imageUploadLimiter, csrfProtection, async (req, res) => {
  try {
    const imageId = req.params.id;
    const { sort_order } = req.body;
    
    if (typeof sort_order !== 'number' || sort_order < 0) {
      return res.status(400).json(ResponseFormatter.failure('Invalid sort_order. Must be a non-negative number'));
    }

    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE product_images SET sort_order = ? WHERE id = ?',
      [sort_order, imageId]
    );

    if (!updateResult.success) {
      throw new Error(updateResult.error || 'Failed to update image order');
    }

    return res.json(ResponseFormatter.success('Image order updated successfully'));
  } catch (error) {
    console.error('Error updating image order:', error);
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// PUT /api/images/products/:productId/order - Update multiple image orders
router.put('/products/:productId/order', imageUploadLimiter, csrfProtection, async (req, res) => {
  try {
    const productId = req.params.productId;
    const { imageOrders } = req.body;
    
    if (!Array.isArray(imageOrders)) {
      return res.status(400).json(ResponseFormatter.failure('imageOrders must be an array'));
    }

    // Validate each order entry
    for (const order of imageOrders) {
      if (!order.id || typeof order.sort_order !== 'number' || order.sort_order < 0) {
        return res.status(400).json(ResponseFormatter.failure('Each order entry must have id and valid sort_order'));
      }
    }

    const result = await ImageService.updateImageOrder(imageOrders);
    
    return res.json(ResponseFormatter.success('Image orders updated successfully', result));
  } catch (error) {
    console.error('Error updating image orders:', error);
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// PUT /api/images/products/:productId/primary/:imageId - Set primary image
router.put('/products/:productId/primary/:imageId', imageUploadLimiter, csrfProtection, async (req, res) => {
  try {
    const { productId, imageId } = req.params;
    
    const result = await ImageService.setPrimaryImage(productId, imageId);
    
    return res.json(ResponseFormatter.success('Primary image set successfully', result));
  } catch (error) {
    console.error('Error setting primary image:', error);
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// DELETE /api/images/:id - Delete a single image
router.delete('/:id', imageUploadLimiter, csrfProtection, async (req, res) => {
  try {
    const imageId = req.params.id;
    
    const result = await ImageService.deleteImages([imageId]);
    
    return res.json(ResponseFormatter.success('Image deleted successfully', result));
  } catch (error) {
    console.error('Error deleting image:', error);
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// DELETE /api/images/bulk - Delete multiple images
router.delete('/bulk', imageUploadLimiter, csrfProtection, async (req, res) => {
  try {
    const { imageIds } = req.body;
    
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json(ResponseFormatter.failure('imageIds must be a non-empty array'));
    }

    const result = await ImageService.deleteImages(imageIds);
    
    return res.json(ResponseFormatter.success('Images deleted successfully', result));
  } catch (error) {
    console.error('Error deleting images:', error);
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

// PUT /api/images/:id/alt-text - Update image alt text
router.put('/:id/alt-text', imageUploadLimiter, csrfProtection, async (req, res) => {
  try {
    const imageId = req.params.id;
    const { alt_text } = req.body;
    
    if (!alt_text || typeof alt_text !== 'string' || alt_text.trim().length === 0) {
      return res.status(400).json(ResponseFormatter.failure('alt_text is required and must be a non-empty string'));
    }

    const updateResult = await DatabaseUtil.executeQuery(
      'UPDATE product_images SET alt_text = ? WHERE id = ?',
      [alt_text.trim(), imageId]
    );

    if (!updateResult.success) {
      throw new Error(updateResult.error || 'Failed to update alt text');
    }

    return res.json(ResponseFormatter.success('Alt text updated successfully'));
  } catch (error) {
    console.error('Error updating alt text:', error);
    return res.status(500).json(ResponseFormatter.failure('Server error', { error: error.message }));
  }
});

module.exports = router;