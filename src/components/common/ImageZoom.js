'use client';

import { useState, useRef, useEffect } from 'react';

export default function ImageZoom({ images = [], alt = 'Product image' }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const imageRef = useRef(null);

  const selectedImage = images[selectedIndex] || images[0] || '/api/placeholder/600/600';

  const handleMouseMove = (e) => {
    if (!isZoomed || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setZoomPosition({ x, y });
  };

  const handleMouseEnter = () => {
    setIsZoomed(true);
  };

  const handleMouseLeave = () => {
    setIsZoomed(false);
    setZoomPosition({ x: 50, y: 50 });
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft' && selectedIndex > 0) {
        setSelectedIndex(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && selectedIndex < images.length - 1) {
        setSelectedIndex(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, images.length]);

  return (
    <div className="noirae-image-zoom-container">
      {/* Main Image */}
      <div 
        className="noirae-main-image-wrapper"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <img
          ref={imageRef}
          src={selectedImage}
          alt={alt}
          className={`noirae-main-image ${isZoomed ? 'zoomed' : ''}`}
          style={
            isZoomed
              ? {
                  transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
                }
              : {}
          }
        />
        {isZoomed && (
          <div className="noirae-zoom-hint">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </div>
        )}
      </div>

      {/* Thumbnail Gallery */}
      {images.length > 1 && (
        <div className="noirae-thumbnail-gallery">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => setSelectedIndex(index)}
              className={`noirae-thumbnail ${index === selectedIndex ? 'active' : ''}`}
              aria-label={`View image ${index + 1}`}
            >
              <img src={image} alt={`${alt} ${index + 1}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

