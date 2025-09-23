import React, { useState, useCallback } from 'react';
import { adminAPI } from '../utils/api';

const ImageUpload = ({ productId, onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    // Validate file types
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const validFiles = Array.from(files).filter(file => validTypes.includes(file.type));
    
    if (validFiles.length === 0) {
      alert('Please select valid image files (JPEG, PNG, WebP, GIF)');
      return;
    }

    if (validFiles.length > 20) {
      alert('Maximum 20 files allowed per upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      validFiles.forEach(file => {
        formData.append('images', file);
      });

      const result = await adminAPI.uploadProductImage(productId, formData);

      if (result.success) {
        setUploadProgress(100);
        setTimeout(() => {
          setUploadProgress(null);
          onUploadComplete?.(result.data);
        }, 1000);
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  }, [productId, onUploadComplete]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleChange = useCallback((e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  return (
    <div className="image-upload-container">
      <div
        className={`upload-area ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="image-upload"
          multiple
          accept="image/*"
          onChange={handleChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />
        
        <label htmlFor="image-upload" className="upload-label">
          {uploading ? (
            <div className="upload-status">
              <div className="spinner"></div>
              <p>Uploading images...</p>
              {uploadProgress !== null && (
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              )}
            </div>
          ) : (
            <div className="upload-prompt">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <h3>Upload Product Images</h3>
              <p>Drag and drop images here, or click to select files</p>
              <p className="upload-info">
                Supports JPEG, PNG, WebP, GIF • Max 20 files • 10MB per file
              </p>
            </div>
          )}
        </label>
      </div>

      <style jsx>{`
        .image-upload-container {
          width: 100%;
          max-width: 600px;
          margin: 0 auto;
        }

        .upload-area {
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          transition: all 0.3s ease;
          background-color: #f9fafb;
          cursor: pointer;
        }

        .upload-area:hover {
          border-color: #3b82f6;
          background-color: #eff6ff;
        }

        .upload-area.drag-active {
          border-color: #3b82f6;
          background-color: #dbeafe;
          transform: scale(1.02);
        }

        .upload-area.uploading {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .upload-label {
          display: block;
          cursor: inherit;
        }

        .upload-prompt svg {
          margin: 0 auto 1rem;
          color: #6b7280;
        }

        .upload-prompt h3 {
          margin: 0 0 0.5rem;
          color: #1f2937;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .upload-prompt p {
          margin: 0 0 0.5rem;
          color: #6b7280;
        }

        .upload-info {
          font-size: 0.875rem;
          color: #9ca3af;
        }

        .upload-status {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top: 3px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .progress-bar {
          width: 100%;
          max-width: 300px;
          height: 8px;
          background-color: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background-color: #3b82f6;
          transition: width 0.3s ease;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ImageUpload;