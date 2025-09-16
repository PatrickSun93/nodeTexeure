import React, { useState, useEffect, useCallback } from 'react';

const ImageGallery = ({ productId, onImagesChange }) => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [draggedImage, setDraggedImage] = useState(null);

  // Fetch images for the product
  const fetchImages = useCallback(async () => {
    try {
      const response = await fetch(`/api/images/products/${productId}`);
      const result = await response.json();
      
      if (response.ok) {
        setImages(result.data.images || []);
        onImagesChange?.(result.data.images || []);
      } else {
        console.error('Failed to fetch images:', result.message);
      }
    } catch (error) {
      console.error('Error fetching images:', error);
    } finally {
      setLoading(false);
    }
  }, [productId, onImagesChange]);

  useEffect(() => {
    if (productId) {
      fetchImages();
    }
  }, [productId, fetchImages]);

  // Set primary image
  const setPrimaryImage = async (imageId) => {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      const response = await fetch(`/api/images/products/${productId}/primary/${imageId}`, {
        method: 'PUT',
        headers: {
          'X-CSRF-Token': csrfToken
        }
      });

      if (response.ok) {
        // Update local state
        setImages(prev => prev.map(img => ({
          ...img,
          is_primary: img.id === imageId
        })));
      } else {
        const result = await response.json();
        alert(`Failed to set primary image: ${result.message}`);
      }
    } catch (error) {
      console.error('Error setting primary image:', error);
      alert('Failed to set primary image');
    }
  };

  // Delete selected images
  const deleteSelectedImages = async () => {
    if (selectedImages.size === 0) return;
    
    if (!confirm(`Delete ${selectedImages.size} selected image(s)?`)) return;

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      const response = await fetch('/api/images/bulk', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          imageIds: Array.from(selectedImages)
        })
      });

      if (response.ok) {
        // Remove deleted images from local state
        setImages(prev => prev.filter(img => !selectedImages.has(img.id)));
        setSelectedImages(new Set());
      } else {
        const result = await response.json();
        alert(`Failed to delete images: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting images:', error);
      alert('Failed to delete images');
    }
  };

  // Update alt text
  const updateAltText = async (imageId, altText) => {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      const response = await fetch(`/api/images/${imageId}/alt-text`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ alt_text: altText })
      });

      if (response.ok) {
        // Update local state
        setImages(prev => prev.map(img => 
          img.id === imageId ? { ...img, alt_text: altText } : img
        ));
      } else {
        const result = await response.json();
        alert(`Failed to update alt text: ${result.message}`);
      }
    } catch (error) {
      console.error('Error updating alt text:', error);
      alert('Failed to update alt text');
    }
  };

  // Handle drag and drop reordering
  const handleDragStart = (e, image) => {
    setDraggedImage(image);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetImage) => {
    e.preventDefault();
    
    if (!draggedImage || draggedImage.id === targetImage.id) {
      setDraggedImage(null);
      return;
    }

    // Create new order based on drag and drop
    const newImages = [...images];
    const draggedIndex = newImages.findIndex(img => img.id === draggedImage.id);
    const targetIndex = newImages.findIndex(img => img.id === targetImage.id);
    
    // Remove dragged item and insert at target position
    newImages.splice(draggedIndex, 1);
    newImages.splice(targetIndex, 0, draggedImage);
    
    // Update sort orders
    const imageOrders = newImages.map((img, index) => ({
      id: img.id,
      sort_order: index
    }));

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      const response = await fetch(`/api/images/products/${productId}/order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ imageOrders })
      });

      if (response.ok) {
        // Update local state with new order
        setImages(newImages.map((img, index) => ({
          ...img,
          sort_order: index
        })));
      } else {
        const result = await response.json();
        alert(`Failed to update image order: ${result.message}`);
      }
    } catch (error) {
      console.error('Error updating image order:', error);
      alert('Failed to update image order');
    }

    setDraggedImage(null);
  };

  // Toggle image selection
  const toggleImageSelection = (imageId) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading images...</p>
      </div>
    );
  }

  return (
    <div className="image-gallery">
      {selectedImages.size > 0 && (
        <div className="gallery-toolbar">
          <span>{selectedImages.size} image(s) selected</span>
          <button 
            className="delete-button"
            onClick={deleteSelectedImages}
          >
            Delete Selected
          </button>
        </div>
      )}

      {images.length === 0 ? (
        <div className="empty-gallery">
          <p>No images uploaded yet</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {images.map((image) => (
            <div
              key={image.id}
              className={`image-item ${selectedImages.has(image.id) ? 'selected' : ''} ${image.is_primary ? 'primary' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, image)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, image)}
            >
              <div className="image-container">
                <img
                  src={image.thumbnail_medium_url}
                  alt={image.alt_text}
                  loading="lazy"
                />
                
                <div className="image-overlay">
                  <input
                    type="checkbox"
                    checked={selectedImages.has(image.id)}
                    onChange={() => toggleImageSelection(image.id)}
                    className="image-checkbox"
                  />
                  
                  {image.is_primary && (
                    <span className="primary-badge">Primary</span>
                  )}
                </div>
              </div>

              <div className="image-controls">
                <input
                  type="text"
                  value={image.alt_text || ''}
                  onChange={(e) => updateAltText(image.id, e.target.value)}
                  placeholder="Alt text..."
                  className="alt-text-input"
                />
                
                <div className="control-buttons">
                  {!image.is_primary && (
                    <button
                      onClick={() => setPrimaryImage(image.id)}
                      className="primary-button"
                      title="Set as primary image"
                    >
                      Set Primary
                    </button>
                  )}
                  
                  <button
                    onClick={() => toggleImageSelection(image.id)}
                    className="select-button"
                    title="Select for deletion"
                  >
                    {selectedImages.has(image.id) ? 'Deselect' : 'Select'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .image-gallery {
          width: 100%;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2rem;
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

        .gallery-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background-color: #f3f4f6;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .delete-button {
          background-color: #dc2626;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.875rem;
        }

        .delete-button:hover {
          background-color: #b91c1c;
        }

        .empty-gallery {
          text-align: center;
          padding: 2rem;
          color: #6b7280;
        }

        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 1rem;
        }

        .image-item {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
          transition: all 0.3s ease;
          cursor: move;
        }

        .image-item:hover {
          border-color: #3b82f6;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .image-item.selected {
          border-color: #3b82f6;
          background-color: #eff6ff;
        }

        .image-item.primary {
          border-color: #10b981;
          background-color: #ecfdf5;
        }

        .image-container {
          position: relative;
          aspect-ratio: 1;
          overflow: hidden;
        }

        .image-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .image-overlay {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .image-checkbox {
          width: 18px;
          height: 18px;
        }

        .primary-badge {
          background-color: #10b981;
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .image-controls {
          padding: 0.75rem;
          background-color: white;
        }

        .alt-text-input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
        }

        .alt-text-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .control-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .primary-button, .select-button {
          padding: 0.375rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          background-color: white;
          cursor: pointer;
          font-size: 0.75rem;
          transition: all 0.2s ease;
        }

        .primary-button {
          background-color: #10b981;
          color: white;
          border-color: #10b981;
        }

        .primary-button:hover {
          background-color: #059669;
        }

        .select-button:hover {
          background-color: #f3f4f6;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ImageGallery;