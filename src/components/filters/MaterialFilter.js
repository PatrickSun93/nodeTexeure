'use client';

export default function MaterialFilter({ selected, onChange }) {
  const materials = ['Silk', 'Cashmere', 'Blends'];

  return (
    <div className="noirae-filter-section">
      <h4 className="noirae-filter-title">Material</h4>
      <div className="noirae-filter-options">
        {materials.map((material) => (
          <label key={material} className="noirae-filter-option">
            <input
              type="radio"
              name="material"
              value={material}
              checked={selected === material}
              onChange={(e) => onChange(e.target.value)}
              className="noirae-filter-radio"
            />
            <span className="noirae-filter-label">{material}</span>
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

