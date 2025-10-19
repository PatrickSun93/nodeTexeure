# Image Management Service

This service provides comprehensive image management functionality for the e-commerce platform, including automatic thumbnail generation, image optimization, and AWS S3 integration for production environments.

## Features

### 1. Automatic Thumbnail Generation
- **Small**: 150x150px (quality: 80%)
- **Medium**: 300x300px (quality: 85%)
- **Large**: 600x600px (quality: 90%)
- All thumbnails are converted to WebP format for optimal compression

### 2. Image Optimization
- Automatic compression and optimization of original images
- Progressive JPEG encoding for faster loading
- WebP conversion for modern browsers
- Maintains high quality while reducing file size

### 3. Storage Options
- **Development**: Local file storage in `backend/uploads/`
- **Production**: AWS S3 with CDN-friendly URLs
- Automatic fallback to local storage if S3 is not configured

### 4. Bulk Upload Support
- Upload up to 20 images simultaneously
- Automatic processing and thumbnail generation
- Database integration with proper metadata storage

## API Endpoints

### Upload Images
```
POST /api/images/products/:id/upload
Content-Type: multipart/form-data
Field: images (array of files)
```

### Get Product Images
```
GET /api/images/products/:id
```

### Update Image Order
```
PUT /api/images/products/:productId/order
Body: { imageOrders: [{ id: "IMG001", sort_order: 0 }] }
```

### Set Primary Image
```
PUT /api/images/products/:productId/primary/:imageId
```

### Delete Images
```
DELETE /api/images/:id (single)
DELETE /api/images/bulk (multiple)
Body: { imageIds: ["IMG001", "IMG002"] }
```

### Update Alt Text
```
PUT /api/images/:id/alt-text
Body: { alt_text: "Product image description" }
```

## Configuration

### Environment Variables

```bash
# Base URL for local file serving
BASE_URL=http://localhost:6666

# AWS S3 Configuration (production only)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET_NAME=your-bucket-name
```

### S3 Bucket Setup

1. Create an S3 bucket with public read access
2. Configure CORS policy:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

3. Set up IAM user with S3 permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

## File Organization

### Local Storage Structure
```
backend/uploads/
├── products/
│   └── PROD0000000001/
│       ├── originals/
│       │   └── optimized_image.webp
│       └── thumbnails/
│           ├── image_small.webp
│           ├── image_medium.webp
│           └── image_large.webp
└── temp/
    └── (temporary upload files)
```

### S3 Storage Structure
```
your-bucket/
└── products/
    └── PROD0000000001/
        ├── originals/
        │   └── optimized_image.webp
        └── thumbnails/
            ├── image_small.webp
            ├── image_medium.webp
            └── image_large.webp
```

## Database Schema

The service uses the `product_images` table:

```sql
CREATE TABLE product_images (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50) NULL,
    original_url VARCHAR(500) NOT NULL,
    thumbnail_small_url VARCHAR(500),
    thumbnail_medium_url VARCHAR(500),
    thumbnail_large_url VARCHAR(500),
    alt_text VARCHAR(255),
    sort_order INT DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    file_size INT UNSIGNED,
    width INT UNSIGNED,
    height INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Usage Examples

### Frontend Integration

```javascript
// Upload multiple images
const formData = new FormData();
files.forEach(file => formData.append('images', file));

const response = await fetch('/api/images/products/PROD001/upload', {
  method: 'POST',
  body: formData,
  headers: {
    'X-CSRF-Token': csrfToken
  }
});

// Get product images
const images = await fetch('/api/images/products/PROD001')
  .then(res => res.json());

// Update image order
await fetch('/api/images/products/PROD001/order', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify({
    imageOrders: [
      { id: 'IMG001', sort_order: 0 },
      { id: 'IMG002', sort_order: 1 }
    ]
  })
});
```


## Performance Considerations

1. **Image Optimization**: All images are automatically optimized for web delivery
2. **Lazy Loading**: Use `loading="lazy"` attribute for better performance
3. **CDN**: S3 URLs work well with CloudFront for global distribution
4. **Caching**: Images are served with appropriate cache headers
5. **Compression**: WebP format provides 25-35% better compression than JPEG

## Error Handling

The service includes comprehensive error handling:

- File type validation (JPEG, PNG, WebP, GIF only)
- File size limits (10MB per file, 20 files max)
- S3 upload failures with local fallback
- Database transaction rollbacks on errors
- Temporary file cleanup

## Security Features

- CSRF protection on all write operations
- Rate limiting (50 uploads per 15 minutes)
- File type validation
- Secure filename sanitization
- Authenticated access to upload endpoints

## Monitoring and Logging

All operations are logged with:
- Upload success/failure rates
- Processing times
- Storage usage
- Error details for debugging

## Migration from Legacy System

Legacy single-image upload endpoint has been retired. Use `/api/images/products/:id/upload` for bulk uploads and `/api/images/products/:id` to retrieve images.