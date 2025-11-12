'use client';

import { useState, useEffect } from 'react';

export default function PriceRangeFilter({ value = 750, onChange, max = 1000 }) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e) => {
    const newValue = parseInt(e.target.value);
    setLocalValue(newValue);
  };

  const handleMouseUp = () => {
    onChange(localValue);
  };

  return (
    <div className="noirae-filter-section">
      <h4 className="noirae-filter-title">Price Range</h4>
      <div className="noirae-price-display">
        <span className="noirae-price-label">Up to</span>
        <span className="noirae-price-value">${localValue}</span>
      </div>
      <input
        type="range"
        min="0"
        max={max}
        step="50"
        value={localValue}
        onChange={handleChange}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
        className="noirae-price-slider"
      />
      <div className="noirae-price-range-labels">
        <span>$0</span>
        <span>${max}</span>
      </div>
    </div>
  );
}

