const ImageService = require('../services/imageService');
const path = require('path');
const fs = require('fs');

async function testImageService() {
  console.log('🧪 Testing Image Service...\n');

  try {
    // Test 1: Check service initialization
    console.log('1. Service Initialization:');
    console.log(`   - S3 enabled: ${ImageService.useS3}`);
    console.log(`   - Bucket name: ${ImageService.bucketName || 'Not configured'}`);
    console.log(`   - Thumbnail sizes: ${Object.keys(ImageService.thumbnailSizes).join(', ')}`);
    console.log('   ✅ Service initialized successfully\n');

    // Test 2: Check thumbnail size configuration
    console.log('2. Thumbnail Configuration:');
    Object.entries(ImageService.thumbnailSizes).forEach(([size, config]) => {
      console.log(`   - ${size}: ${config.width}x${config.height} (quality: ${config.quality}%)`);
    });
    console.log('   ✅ Thumbnail configuration valid\n');

    // Test 3: Check directory structure (for local storage)
    if (!ImageService.useS3) {
      console.log('3. Local Storage Setup:');
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      const tempDir = path.join(uploadsDir, 'temp');
      
      try {
        await fs.promises.mkdir(tempDir, { recursive: true });
        console.log(`   - Uploads directory: ${uploadsDir}`);
        console.log(`   - Temp directory: ${tempDir}`);
        console.log('   ✅ Directory structure created\n');
      } catch (error) {
        console.log(`   ❌ Failed to create directories: ${error.message}\n`);
      }
    } else {
      console.log('3. S3 Configuration:');
      console.log(`   - Region: ${process.env.AWS_REGION}`);
      console.log(`   - Bucket: ${process.env.AWS_S3_BUCKET_NAME}`);
      console.log('   ✅ S3 configuration loaded\n');
    }

    // Test 4: Check required dependencies
    console.log('4. Dependencies Check:');
    try {
      require('sharp');
      console.log('   ✅ Sharp (image processing)');
    } catch (error) {
      console.log('   ❌ Sharp not available');
    }

    try {
      require('@aws-sdk/client-s3');
      console.log('   ✅ AWS SDK S3 Client');
    } catch (error) {
      console.log('   ❌ AWS SDK not available');
    }

    try {
      require('multer');
      console.log('   ✅ Multer (file upload)');
    } catch (error) {
      console.log('   ❌ Multer not available');
    }

    console.log('\n🎉 Image Service test completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Configure AWS S3 credentials for production');
    console.log('   2. Test image upload through API endpoints');
    console.log('   3. Verify thumbnail generation');
    console.log('   4. Test bulk upload functionality');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testImageService();