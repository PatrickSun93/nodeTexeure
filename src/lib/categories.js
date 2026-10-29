// Category slugs used in /categories/[slug] URLs -> display names. Shared by the
// client page and its server layout (metadata). Descriptions are translated via
// the CategoryPage message namespace (desc<Name>, descFallback).
export const CATEGORY_NAMES = {
  sheets: 'Sheets',
  pillows: 'Pillows',
  blankets: 'Blankets',
  mattresses: 'Mattresses',
  accessories: 'Accessories',
};

export const categoryName = (slug) => CATEGORY_NAMES[slug] || slug;
export const categoryDescKey = (slug) => (CATEGORY_NAMES[slug] ? `desc${CATEGORY_NAMES[slug]}` : null);
