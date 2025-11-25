'use client';

export default function ColorFilter({ selected = [], onChange }) {
  const colors = [
    { name: 'Ivory', hex: '#FFFFF0' },
    { name: 'Champagne', hex: '#F7E7CE' },
    { name: 'Charcoal', hex: '#36454F' },
    { name: 'Silver', hex: '#C0C0C0' },
    { name: 'Navy', hex: '#000080' },
    { name: 'Black', hex: '#000000' },
  ];

  const toggleColor = (colorName) => {
    if (selected.includes(colorName)) {
      onChange(selected.filter(c => c !== colorName));
    } else {
      onChange([...selected, colorName]);
    }
  };

  return (
    <div className="noirae-filter-section">
      <h4 className="noirae-filter-title">Color</h4>
      <div className="noirae-color-swatches">
        {colors.map((color) => (
          <button
            key={color.name}
            onClick={() => toggleColor(color.name)}
            className={`noirae-color-swatch ${selected.includes(color.name) ? 'active' : ''}`}
            style={{ backgroundColor: color.hex }}
            aria-label={color.name}
            title={color.name}
          >
            {selected.includes(color.name) && (
              <svg className="noirae-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

