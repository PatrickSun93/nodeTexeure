/**
 * S3 Image Upload Service
 * Handles file uploads to AWS S3 with thumbnail generation
 * Falls back to local storage when S3 is not configured
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { randomUUID: uuidv4 } = require('crypto');

let s3Client;
let isConfigured = false;

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'your-s3-bucket-name';
const REGION = process.env.AWS_REGION || 'us-east-1';

try {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey && !accessKeyId.includes('your-aws')) {
    s3Client = new S3Client({
      region: REGION,
      credentials: { accessKeyId, secretAccessKey },
    });
    isConfigured = true;
    console.log('✅ AWS S3 service initialized');
  } else {
    console.warn('⚠️  AWS S3 not configured (placeholder keys). Images will be saved locally.');
  }
} catch (err) {
  console.warn('⚠️  AWS S3 initialization failed:', err.message);
}

// Thumbnail sizes
const THUMBNAIL_SIZES = {
  small: 150,
  medium: 400,
  large: 800,
};

/**
 * Upload a file buffer to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} key - S3 key (path)
 * @param {string} contentType - MIME type
 * @returns {Object} { url, key }
 */
async function uploadFile(buffer, key, contentType) {
  if (!isConfigured) {
    // Fallback: save locally
    return saveLocally(buffer, key);
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read',
  });

  await s3Client.send(command);

  const url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
  return { url, key };
}

/**
 * Save file locally (fallback when S3 is not configured)
 */
async function saveLocally(buffer, key) {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const filePath = path.join(uploadsDir, key);

  // Reject keys that escape the uploads dir (path-traversal guard)
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(uploadsDir) + path.sep)) {
    throw new Error('Invalid upload path');
  }

  const dir = path.dirname(filePath);

  // Ensure directory exists
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buffer);

  const url = `/uploads/${key}`;
  return { url, key };
}

/**
 * Upload a product image with thumbnail generation
 * @param {Buffer} fileBuffer - Original image buffer
 * @param {string} originalName - Original filename
 * @param {string} productId - Product ID
 * @returns {Object} { original, thumbnails: { small, medium, large } }
 */
async function uploadProductImage(fileBuffer, originalName, productId) {
  // Allowlisted extension only: a client-declared image/png named x.svg or
  // x.html must not be stored (and served) with that extension.
  const rawExt = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const ext = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(rawExt) ? rawExt : '.jpg';
  const baseName = uuidv4();
  const keyPrefix = `products/${productId}`;

  // Upload original
  const originalKey = `${keyPrefix}/${baseName}_original${ext}`;
  const original = await uploadFile(fileBuffer, originalKey, getMimeType(ext));

  // Generate and upload thumbnails
  const thumbnails = {};
  for (const [sizeName, width] of Object.entries(THUMBNAIL_SIZES)) {
    try {
      const resizedBuffer = await sharp(fileBuffer)
        .resize(width, width, { fit: 'cover', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      const thumbKey = `${keyPrefix}/${baseName}_${sizeName}.jpg`;
      thumbnails[sizeName] = await uploadFile(resizedBuffer, thumbKey, 'image/jpeg');
    } catch (err) {
      console.error(`Error generating ${sizeName} thumbnail:`, err.message);
      thumbnails[sizeName] = null;
    }
  }

  return { original, thumbnails };
}

/**
 * Delete a file from S3
 * @param {string} key - S3 key
 */
async function deleteFile(key) {
  if (!isConfigured) {
    // Delete locally
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const filePath = path.join(uploadsDir, key);
    // Same path-traversal guard as saveLocally: a stored URL like
    // '/uploads/../server.js' must not delete files outside the uploads dir.
    if (!path.resolve(filePath).startsWith(path.resolve(uploadsDir) + path.sep)) {
      throw new Error('Invalid upload path');
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Generate a pre-signed URL for temporary access
 * @param {string} key - S3 key
 * @param {number} expiresIn - Expiration in seconds (default: 3600)
 * @returns {string} Pre-signed URL
 */
async function generateSignedUrl(key, expiresIn = 3600) {
  if (!isConfigured) {
    return `/uploads/${key}`;
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get MIME type from file extension
 */
function getMimeType(ext) {
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

module.exports = {
  isConfigured,
  uploadFile,
  uploadProductImage,
  deleteFile,
  generateSignedUrl,
};
