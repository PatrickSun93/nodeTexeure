'use client';

import MaterialFilter from './MaterialFilter';
import ColorFilter from './ColorFilter';
import PriceRangeFilter from './PriceRangeFilter';
import SizeFilter from './SizeFilter';
import BrandFilter from './BrandFilter';
import ThreadCountFilter from './ThreadCountFilter';

export default function FilterSidebar({ filters, onFilterChange }) {
  return (
    <div className="noirae-filter-sidebar">
      <div className="noirae-filter-header">
        <h3 className="noirae-filter-heading">Filter by</h3>
        {Object.keys(filters).some(key => {
          const value = filters[key];
          if (Array.isArray(value)) return value.length > 0;
          if (key === 'material') return value !== 'All';
          if (key === 'priceRange') return value !== 750;
          if (key === 'threadCount') return value !== 600;
          return false;
        }) && (
          <button
            onClick={() => {
              onFilterChange('material', 'All');
              onFilterChange('colors', []);
              onFilterChange('priceRange', 750);
              onFilterChange('sizes', []);
              onFilterChange('brands', []);
              onFilterChange('threadCount', 600);
            }}
            className="noirae-clear-filters"
          >
            Clear All
          </button>
        )}
      </div>

      <MaterialFilter
        selected={filters.material || 'All'}
        onChange={(value) => onFilterChange('material', value)}
      />

      <ColorFilter
        selected={filters.colors || []}
        onChange={(value) => onFilterChange('colors', value)}
      />

      <PriceRangeFilter
        value={filters.priceRange || 750}
        onChange={(value) => onFilterChange('priceRange', value)}
        max={1000}
      />

      <SizeFilter
        selected={filters.sizes || []}
        onChange={(value) => onFilterChange('sizes', value)}
      />

      <BrandFilter
        selected={filters.brands || []}
        onChange={(value) => onFilterChange('brands', value)}
      />

      <ThreadCountFilter
        value={filters.threadCount || 600}
        onChange={(value) => onFilterChange('threadCount', value)}
        min={200}
        max={1230}
      />
    </div>
  );
}

