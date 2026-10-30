'use client';

export default function MaterialFilter({ selected, onChange }) {
  // Values are terms the API matches inside a material ("Blend" → "Polyester Blend").
  const materials = [
    { value: 'Silk', label: 'Silk' },
    { value: 'Cashmere', label: 'Cashmere' },
    { value: 'Blend', label: 'Blends' },
  ];

  return (
    <div className="noirae-filter-section">
      <h4 className="noirae-filter-title">Material</h4>
      <div className="noirae-filter-options">
        {materials.map(({ value, label }) => (
          <label key={value} className="noirae-filter-option">
            <input
              type="radio"
              name="material"
              value={value}
              checked={selected === value}
              onChange={(e) => onChange(e.target.value)}
              className="noirae-filter-radio"
            />
            <span className="noirae-filter-label">{label}</span>
          </label>
        ))}
      </div>
      {selected && selected !== 'All' && (
        <div className="noirae-selected-badge">
          <span>{selected}</span>
          <button
            onClick={() => onChange('All')}
            className="noirae-remove-badge"
            aria-label="Clear material filter"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

