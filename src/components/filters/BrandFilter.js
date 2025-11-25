'use client';

export default function BrandFilter({ selected = [], onChange }) {
  const brands = ['Siken Dream', 'Sishmere Comfort', 'Cloud Weave'];

  const toggleBrand = (brand) => {
    if (selected.includes(brand)) {
      onChange(selected.filter(b => b !== brand));
    } else {
      onChange([...selected, brand]);
    }
  };

  return (
    <div className="noirae-filter-section">
      <h4 className="noirae-filter-title">Brand</h4>
      <div className="noirae-filter-options">
        {brands.map((brand) => (
          <label key={brand} className="noirae-filter-option">
            <input
              type="checkbox"
              checked={selected.includes(brand)}
              onChange={() => toggleBrand(brand)}
              className="noirae-filter-checkbox"
            />
            <span className="noirae-filter-label">{brand}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

