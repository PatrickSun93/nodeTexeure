'use client';

export default function SizeFilter({ selected = [], onChange }) {
  const sizes = ['Twin', 'Queen', 'King', 'California King'];

  const toggleSize = (size) => {
    if (selected.includes(size)) {
      onChange(selected.filter(s => s !== size));
    } else {
      onChange([...selected, size]);
    }
  };

  return (
    <div className="noirae-filter-section">
      <h4 className="noirae-filter-title">Size</h4>
      <div className="noirae-filter-options">
        {sizes.map((size) => (
          <label key={size} className="noirae-filter-option">
            <input
              type="checkbox"
              checked={selected.includes(size)}
              onChange={() => toggleSize(size)}
              className="noirae-filter-checkbox"
            />
            <span className="noirae-filter-label">{size}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

