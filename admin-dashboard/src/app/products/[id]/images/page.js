'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ImageUpload from '../../../../components/ImageUpload';
import ImageGallery from '../../../../components/ImageGallery';

export default function ProductImagesPage() {
  const params = useParams();
  const productId = params.id;
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState([]);

  // Fetch product details
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await fetch(`/api/products/${productId}`);
        const result = await response.json();
        
        if (response.ok) {
          setProduct(result.data);
        } else {
          console.error('Failed to fetch product:', result.message);
        }
      } catch (error) {
        console.error('Error fetching product:', error);
      } finally {
        setLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  const handleUploadComplete = (uploadResult) => {
    console.log('Upload completed:', uploadResult);
    // The ImageGallery component will automatically refresh
  };

  const handleImagesChange = (newImages) => {
    setImages(newImages);
  };

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading product...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="error-page">
        <h1>Product Not Found</h1>
        <p>The requested product could not be found.</p>
      </div>
    );
  }

  return (
    <div className="product-images-page">
      <div className="page-header">
        <h1>Manage Images</h1>
        <div className="product-info">
          <h2>{product.name}</h2>
          <p className="product-id">Product ID: {product.id}</p>
          <p className="image-count">{images.length} image(s) uploaded</p>
        </div>
      </div>

      <div className="page-content">
        <div className="upload-section">
          <h3>Upload New Images</h3>
          <p className="section-description">
            Upload multiple product images. The first image will be set as the primary image automatically.
            You can reorder images and change the primary image after upload.
          </p>
          <ImageUpload 
            productId={productId} 
            onUploadComplete={handleUploadComplete}
          />
        </div>

        <div className="gallery-section">
          <h3>Manage Existing Images</h3>
          <p className="section-description">
            Drag and drop to reorder images, set primary image, update alt text, or delete images.
            The primary image will be displayed as the main product image on the website.
          </p>
          <ImageGallery 
            productId={productId}
            onImagesChange={handleImagesChange}
          />
        </div>
      </div>

      <div className="help-section">
        <h3>Image Guidelines</h3>
        <div className="guidelines-grid">
          <div className="guideline-item">
            <h4>📐 Dimensions</h4>
            <p>Recommended: 1200x1200px or larger</p>
            <p>Square aspect ratio works best</p>
          </div>
          
          <div className="guideline-item">
            <h4>📁 File Types</h4>
            <p>JPEG, PNG, WebP, GIF</p>
            <p>Max file size: 10MB per image</p>
          </div>
          
          <div className="guideline-item">
            <h4>🎯 Quality</h4>
            <p>High resolution for zoom functionality</p>
            <p>Good lighting and clear details</p>
          </div>
          
          <div className="guideline-item">
            <h4>📱 Thumbnails</h4>
            <p>Automatically generated in 3 sizes</p>
            <p>Optimized for web performance</p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .product-images-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        .page-header {
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .page-header h1 {
          margin: 0 0 1rem;
          color: #1f2937;
          font-size: 2rem;
          font-weight: 700;
        }

        .product-info h2 {
          margin: 0 0 0.5rem;
          color: #374151;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .product-id, .image-count {
          margin: 0.25rem 0;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .page-content {
          display: flex;
          flex-direction: column;
          gap: 3rem;
        }

        .upload-section, .gallery-section {
          background-color: #f9fafb;
          padding: 2rem;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }

        .upload-section h3, .gallery-section h3 {
          margin: 0 0 0.5rem;
          color: #1f2937;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .section-description {
          margin: 0 0 1.5rem;
          color: #6b7280;
          line-height: 1.5;
        }

        .help-section {
          margin-top: 3rem;
          padding: 2rem;
          background-color: #eff6ff;
          border-radius: 12px;
          border: 1px solid #bfdbfe;
        }

        .help-section h3 {
          margin: 0 0 1.5rem;
          color: #1e40af;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .guidelines-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .guideline-item {
          background-color: white;
          padding: 1.5rem;
          border-radius: 8px;
          border: 1px solid #bfdbfe;
        }

        .guideline-item h4 {
          margin: 0 0 0.75rem;
          color: #1e40af;
          font-size: 1rem;
          font-weight: 600;
        }

        .guideline-item p {
          margin: 0.25rem 0;
          color: #374151;
          font-size: 0.875rem;
          line-height: 1.4;
        }

        .loading-page, .error-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          text-align: center;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top: 3px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        .error-page h1 {
          color: #dc2626;
          margin-bottom: 0.5rem;
        }

        .error-page p {
          color: #6b7280;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .product-images-page {
            padding: 1rem;
          }
          
          .guidelines-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}