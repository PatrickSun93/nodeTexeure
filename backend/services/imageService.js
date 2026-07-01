const sharp = require('sharp');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const path = require('path');
const DatabaseUtil = require('../utils/database');

class ImageService {
  constructor() {
    this.s3Client = null;
    this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    this.useS3 = process.env.NODE_ENV === 'production' && this.bucketName;
    
    if (this.useS3) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
    }

    // Thumbnail sizes configuration
    this.thumbnailSizes = {
      small: { width: 150, height: 150, quality: 80 },
      medium: { width: 300, height: 300, quality: 85 },
      large: { width: 600, height: 600, quality: 90 }
    };
  }

  /**
   * Generate thumbnails for an uploaded image
   * @param {string} originalPath - Path to the original image file
   * @param {string} productId - Product ID for organizing files
   * @param {string} filename - Original filename
   * @returns {Object} URLs for all generated thumbnails
   */
  async generateThumbnails(originalPath, productId, filename) {
    try {
      const thumbnails = {};
      const baseFilename = path.parse(filename).name;
      const ext = '.webp'; // Convert all thumbnails to WebP for better compression

      for (const [size, config] of Object.entries(this.thumbnailSizes)) {
        const thumbnailFilename = `${baseFilename}_${size}${ext}`;
        
        // Generate optimized thumbnail
        const thumbnailBuffer = await sharp(originalPath)
          .resize(config.width, config.height, {
            fit: 'cover',
            position: 'center'
          })
          .webp({ quality: config.quality })
          .toBuffer();

        let thumbnailUrl;
        
        if (this.useS3) {
          // Upload to S3
          thumbnailUrl = await this.uploadToS3(
            thumbnailBuffer, 
            `products/${productId}/thumbnails/${thumbnailFilename}`,
            'image/webp'
          );
        } else {
          // Save locally
          const localDir = path.join(__dirname, '..', 'uploads', 'products', productId, 'thumbnails');
          await fs.mkdir(localDir, { recursive: true });
          const localPath = path.join(localDir, thumbnailFilename);
          await fs.writeFile(localPath, thumbnailBuffer);
          
          const baseUrl = process.env.BASE_URL || 'http://localhost:6666';
          thumbnailUrl = `${baseUrl}/uploads/products/${productId}/thumbnails/${encodeURIComponent(thumbnailFilename)}`;
        }

        thumbnails[`thumbnail_${size}_url`] = thumbnailUrl;
      }

      return thumbnails;
    } catch (error) {
      console.error('Error generating thumbnails:', error);
      throw new Error(`Failed to generate thumbnails: ${error.message}`);
    }
  }

  /**
   * Optimize and upload original image
   * @param {string} originalPath - Path to the original image file
   * @param {string} productId - Product ID for organizing files
   * @param {string} filename - Original filename
   * @returns {string} URL of the optimized original image
   */
  async optimizeOriginalImage(originalPath, productId, filename) {
    try {
      const optimizedFilename = `optimized_${filename}`;
      
      // Optimize original image (reduce size while maintaining quality)
      const optimizedBuffer = await sharp(originalPath)
        .jpeg({ quality: 92, progressive: true })
        .png({ compressionLevel: 6 })
        .webp({ quality: 95 })
        .toBuffer();

      let originalUrl;
      
      if (this.useS3) {
        // Upload to S3
        originalUrl = await this.uploadToS3(
          optimizedBuffer,
          `products/${productId}/originals/${optimizedFilename}`,
          'image/webp'
        );
      } else {
        // Save locally
        const localDir = path.join(__dirname, '..', 'uploads', 'products', productId, 'originals');
        await fs.mkdir(localDir, { recursive: true });
        const localPath = path.join(localDir, optimizedFilename);
        await fs.writeFile(localPath, optimizedBuffer);
        
        const baseUrl = process.env.BASE_URL || 'http://localhost:6666';
        originalUrl = `${baseUrl}/uploads/products/${productId}/originals/${encodeURIComponent(optimizedFilename)}`;
      }

      return originalUrl;
    } catch (error) {
      console.error('Error optimizing original image:', error);
      throw new Error(`Failed to optimize original image: ${error.message}`);
    }
  }

  /**
   * Upload buffer to S3
   * @param {Buffer} buffer - Image buffer
   * @param {string} key - S3 object key
   * @param {string} contentType - MIME type
   * @returns {string} S3 URL
   */
  async uploadToS3(buffer, key, contentType) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'max-age=31536000', // 1 year cache
      });

      await this.s3Client.send(command);
      return `https://${this.bucketName}.s3.amazonaws.com/${key}`;
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
  }

  /**
   * Delete image from S3
   * @param {string} url - S3 URL to delete
   */
  async deleteFromS3(url) {
    if (!this.useS3 || !url.includes('s3.amazonaws.com')) {
      return;
    }

    try {
      const key = url.split('.s3.amazonaws.com/')[1];
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('Error deleting from S3:', error);
      // Don't throw error for deletion failures
    }
  }

  /**
   * Process and upload multiple images for a product
   * @param {Array} files - Array of uploaded files
   * @param {string} productId - Product ID
   * @returns {Array} Array of image records
   */
  async uploadImages(files, productId) {
    try {
      const imageRecords = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const timestamp = Date.now();
        const safeFilename = `${timestamp}_${file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;

        // Generate thumbnails
        const thumbnails = await this.generateThumbnails(file.path, productId, safeFilename);
        
        // Optimize original image
        const originalUrl = await this.optimizeOriginalImage(file.path, productId, safeFilename);

        // Get image dimensions
        const metadata = await sharp(file.path).metadata();

        // Create image record
        const imageId = await this.getNextImageId();
        const imageRecord = {
          id: imageId,
          product_id: productId,
          original_url: originalUrl,
          ...thumbnails,
          alt_text: `${productId} image ${i + 1}`,
          sort_order: i,
          is_primary: i === 0, // First image is primary
          file_size: file.size,
          width: metadata.width,
          height: metadata.height,
        };

        // Save to database
        const insertResult = await DatabaseUtil.executeQuery(
          `INSERT INTO product_images (
            id, product_id, original_url, thumbnail_small_url, thumbnail_medium_url, 
            thumbnail_large_url, alt_text, sort_order, is_primary, file_size, width, height
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            imageRecord.id,
            imageRecord.product_id,
            imageRecord.original_url,
            imageRecord.thumbnail_small_url,
            imageRecord.thumbnail_medium_url,
            imageRecord.thumbnail_large_url,
            imageRecord.alt_text,
            imageRecord.sort_order,
            imageRecord.is_primary,
            imageRecord.file_size,
            imageRecord.width,
            imageRecord.height,
          ]
        );

        if (!insertResult.success) {
          throw new Error(`Failed to save image record: ${insertResult.error}`);
        }

        imageRecords.push(imageRecord);

        // Clean up temporary file
        try {
          await fs.unlink(file.path);
        } catch (error) {
          console.warn('Failed to delete temporary file:', error.message);
        }
      }

      return imageRecords;
    } catch (error) {
      console.error('Error uploading images:', error);
      throw new Error(`Failed to upload images: ${error.message}`);
    }
  }

  /**
   * Delete images for a product
   * @param {Array} imageIds - Array of image IDs to delete
   */
  async deleteImages(imageIds) {
    try {
      // Get image URLs before deletion
      const imagesResult = await DatabaseUtil.executeQuery(
        `SELECT original_url, thumbnail_small_url, thumbnail_medium_url, thumbnail_large_url 
         FROM product_images WHERE id IN (${imageIds.map(() => '?').join(',')})`,
        imageIds
      );

      if (imagesResult.success && imagesResult.data) {
        // Delete from S3 if using S3
        if (this.useS3) {
          for (const image of imagesResult.data) {
            await this.deleteFromS3(image.original_url);
            await this.deleteFromS3(image.thumbnail_small_url);
            await this.deleteFromS3(image.thumbnail_medium_url);
            await this.deleteFromS3(image.thumbnail_large_url);
          }
        }
      }

      // Delete from database
      const deleteResult = await DatabaseUtil.executeQuery(
        `DELETE FROM product_images WHERE id IN (${imageIds.map(() => '?').join(',')})`,
        imageIds
      );

      if (!deleteResult.success) {
        throw new Error(`Failed to delete image records: ${deleteResult.error}`);
      }

      return { deleted: imageIds.length };
    } catch (error) {
      console.error('Error deleting images:', error);
      throw new Error(`Failed to delete images: ${error.message}`);
    }
  }

  /**
   * Get next image ID
   * @returns {string} Next image ID
   */
  async getNextImageId() {
    const result = await DatabaseUtil.executeQuery('SELECT get_next_id("IMG") as id');
    if (!result.success) {
      throw new Error('Failed to generate image ID');
    }
    return result.data[0].id;
  }

  /**
   * Update image sort order
   * @param {Array} imageOrders - Array of {id, sort_order} objects
   */
  async updateImageOrder(imageOrders) {
    try {
      for (const { id, sort_order } of imageOrders) {
        const updateResult = await DatabaseUtil.executeQuery(
          'UPDATE product_images SET sort_order = ? WHERE id = ?',
          [sort_order, id]
        );

        if (!updateResult.success) {
          throw new Error(`Failed to update sort order for image ${id}`);
        }
      }

      return { updated: imageOrders.length };
    } catch (error) {
      console.error('Error updating image order:', error);
      throw new Error(`Failed to update image order: ${error.message}`);
    }
  }

  /**
   * Set primary image for a product
   * @param {string} productId - Product ID
   * @param {string} imageId - Image ID to set as primary
   */
  async setPrimaryImage(productId, imageId) {
    try {
      // Remove primary flag from all images for this product
      await DatabaseUtil.executeQuery(
        'UPDATE product_images SET is_primary = FALSE WHERE product_id = ?',
        [productId]
      );

      // Set the specified image as primary
      const updateResult = await DatabaseUtil.executeQuery(
        'UPDATE product_images SET is_primary = TRUE WHERE id = ? AND product_id = ?',
        [imageId, productId]
      );

      if (!updateResult.success) {
        throw new Error(`Failed to set primary image: ${updateResult.error}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Error setting primary image:', error);
      throw new Error(`Failed to set primary image: ${error.message}`);
    }
  }
}

module.exports = new ImageService();