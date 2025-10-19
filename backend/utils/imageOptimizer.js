/**
 * Image Optimization Utility
 * Handles image compression, format conversion, and CDN integration
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger');
const cacheManager = require('./cacheManager');

class ImageOptimizer {
  constructor() {
    this.supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'avif'];
    this.thumbnailSizes = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 },
      xlarge: { width: 1200, height: 1200 }
    };
    
    // CDN configuration
    this.cdnConfig = {
      enabled: process.env.CDN_ENABLED === 'true',
      baseUrl: process.env.CDN_BASE_URL || '',
      s3Bucket: process.env.AWS_S3_BUCKET || '',
      cloudFrontUrl: process.env.CLOUDFRONT_URL || ''
    };
  }

  /**
   * Optimize image with compression and format conversion
   * @param {Buffer|string} input - Image buffer or file path
   * @param {Object} options - Optimization options
   * @returns {Promise<Buffer>} Optimized image buffer
   */
  async optimizeImage(input, options = {}) {
    const {
      format = 'webp',
      quality = 85,
      width = null,
      height = null,
      fit = 'cover',
      progressive = true,
      stripMetadata = true
    } = options;

    try {
      let pipeline = sharp(input);

      // Strip metadata for smaller file size
      if (stripMetadata) {
        pipeline = pipeline.withMetadata({
          density: 72 // Standard web density
        });
      }

      // Resize if dimensions provided
      if (width || height) {
        pipeline = pipeline.resize(width, height, {
          fit: fit,
          withoutEnlargement: true
        });
      }

      // Apply format-specific optimizations
      switch (format.toLowerCase()) {
        case 'webp':
          pipeline = pipeline.webp({
            quality: quality,
            effort: 4, // Balance between compression and speed
            progressive: progressive
          });
          break;
          
        case 'avif':
          pipeline = pipeline.avif({
            quality: quality,
            effort: 4
          });
          break;
          
        case 'jpeg':
        case 'jpg':
          pipeline = pipeline.jpeg({
            quality: quality,
            progressive: progressive,
            mozjpeg: true // Better compression
          });
          break;
          
        case 'png':
          pipeline = pipeline.png({
            quality: quality,
            progressive: progressive,
            compressionLevel: 9,
            adaptiveFiltering: true
          });
          break;
          
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      const optimizedBuffer = await pipeline.toBuffer();
      
      logger.debug(`Image optimized: ${format}, quality: ${quality}, size: ${optimizedBuffer.length} bytes`);
      
      return optimizedBuffer;
    } catch (error) {
      logger.error('Image optimization failed:', error);
      throw error;
    }
  }

  /**
   * Generate multiple thumbnail sizes for an image
   * @param {Buffer|string} input - Image buffer or file path
   * @param {string} outputDir - Directory to save thumbnails
   * @param {string} filename - Base filename
   * @returns {Promise<Object>} Generated thumbnail paths
   */
  async generateThumbnails(input, outputDir, filename) {
    const thumbnails = {};
    const baseFilename = path.parse(filename).name;
    
    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });
      
      // Generate thumbnails for each size
      for (const [sizeName, dimensions] of Object.entries(this.thumbnailSizes)) {
        const thumbnailFilename = `${baseFilename}_${sizeName}.webp`;
        const thumbnailPath = path.join(outputDir, thumbnailFilename);
        
        const optimizedBuffer = await this.optimizeImage(input, {
          format: 'webp',
          width: dimensions.width,
          height: dimensions.height,
          quality: sizeName === 'small' ? 75 : 85,
          fit: 'cover'
        });
        
        await fs.writeFile(thumbnailPath, optimizedBuffer);
        
        thumbnails[sizeName] = {
          path: thumbnailPath,
          filename: thumbnailFilename,
          width: dimensions.width,
          height: dimensions.height,
          size: optimizedBuffer.length
        };
        
        logger.debug(`Generated ${sizeName} thumbnail: ${thumbnailFilename}`);
      }
      
      return thumbnails;
    } catch (error) {
      logger.error('Thumbnail generation failed:', error);
      throw error;
    }
  }

  /**
   * Get optimized image URL with CDN support
   * @param {string} imagePath - Original image path
   * @param {Object} options - Optimization options
   * @returns {string} Optimized image URL
   */
  getOptimizedUrl(imagePath, options = {}) {
    const {
      size = 'medium',
      format = 'webp',
      quality = 85
    } = options;

    // If CDN is enabled, return CDN URL with optimization parameters
    if (this.cdnConfig.enabled && this.cdnConfig.cloudFrontUrl) {
      const params = new URLSearchParams({
        format: format,
        quality: quality.toString(),
        size: size
      });
      
      return `${this.cdnConfig.cloudFrontUrl}/${imagePath}?${params.toString()}`;
    }
    
    // Return local optimized URL
    const pathParts = path.parse(imagePath);
    const optimizedFilename = `${pathParts.name}_${size}.${format}`;
    
    return path.join(pathParts.dir, optimizedFilename).replace(/\\/g, '/');
  }

  /**
   * Generate responsive image srcset
   * @param {string} imagePath - Base image path
   * @param {Array} sizes - Array of size configurations
   * @returns {string} Srcset string
   */
  generateSrcSet(imagePath, sizes = ['small', 'medium', 'large', 'xlarge']) {
    const srcsetEntries = sizes.map(size => {
      const dimensions = this.thumbnailSizes[size];
      const url = this.getOptimizedUrl(imagePath, { size, format: 'webp' });
      return `${url} ${dimensions.width}w`;
    });
    
    return srcsetEntries.join(', ');
  }

  /**
   * Cache optimized image metadata
   * @param {string} imagePath - Image path
   * @param {Object} metadata - Image metadata
   */
  cacheImageMetadata(imagePath, metadata) {
    const cacheKey = `image_meta_${imagePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
    cacheManager.set('api', cacheKey, metadata, 3600); // Cache for 1 hour
  }

  /**
   * Get cached image metadata
   * @param {string} imagePath - Image path
   * @returns {Object|null} Cached metadata or null
   */
  getCachedImageMetadata(imagePath) {
    const cacheKey = `image_meta_${imagePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return cacheManager.get('api', cacheKey);
  }

  /**
   * Analyze image and return metadata
   * @param {Buffer|string} input - Image buffer or file path
   * @returns {Promise<Object>} Image metadata
   */
  async analyzeImage(input) {
    try {
      const metadata = await sharp(input).metadata();
      
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        channels: metadata.channels,
        aspectRatio: metadata.width / metadata.height
      };
    } catch (error) {
      logger.error('Image analysis failed:', error);
      throw error;
    }
  }

  /**
   * Batch optimize images
   * @param {Array} images - Array of image objects with input and output paths
   * @param {Object} options - Optimization options
   * @returns {Promise<Array>} Results of batch optimization
   */
  async batchOptimize(images, options = {}) {
    const results = [];
    const concurrency = options.concurrency || 3; // Limit concurrent operations
    
    // Process images in batches to avoid overwhelming the system
    for (let i = 0; i < images.length; i += concurrency) {
      const batch = images.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (image) => {
        try {
          const optimizedBuffer = await this.optimizeImage(image.input, options);
          
          if (image.output) {
            await fs.writeFile(image.output, optimizedBuffer);
          }
          
          return {
            success: true,
            input: image.input,
            output: image.output,
            size: optimizedBuffer.length
          };
        } catch (error) {
          logger.error(`Batch optimization failed for ${image.input}:`, error);
          return {
            success: false,
            input: image.input,
            error: error.message
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to prevent overwhelming the system
      if (i + concurrency < images.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  /**
   * Clean up old optimized images
   * @param {string} directory - Directory to clean
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {Promise<number>} Number of files cleaned
   */
  async cleanupOptimizedImages(directory, maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
    try {
      const files = await fs.readdir(directory);
      let cleanedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        
        if (Date.now() - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          cleanedCount++;
          logger.debug(`Cleaned up old optimized image: ${file}`);
        }
      }
      
      logger.info(`Cleaned up ${cleanedCount} old optimized images from ${directory}`);
      return cleanedCount;
    } catch (error) {
      logger.error('Image cleanup failed:', error);
      return 0;
    }
  }
}

module.exports = new ImageOptimizer();