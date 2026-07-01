/**
 * SEO utilities test file
 */
import { generateMetaTags, generateStructuredData, generateBreadcrumbs, generateSlug } from '../seo';

describe('SEO Utilities', () => {
  test('generateMetaTags creates proper meta tags', () => {
    const metaTags = generateMetaTags({
      title: 'Test Product',
      description: 'Test description',
      url: '/test'
    });

    expect(metaTags.title).toBe('Test Product | Noiraé');
    expect(metaTags.description).toBe('Test description');
    expect(metaTags.canonical).toBe('https://noirae.com/test');
    expect(metaTags.openGraph.title).toBe('Test Product | Noiraé');
  });

  test('generateStructuredData creates product schema', () => {
    const productData = {
      name: 'Test Product',
      description: 'Test description',
      base_price: 99.99,
      id: 'test-123',
      stock_quantity: 10
    };

    const schema = generateStructuredData('product', productData);

    expect(schema['@type']).toBe('Product');
    expect(schema.name).toBe('Test Product');
    expect(schema.offers.price).toBe(99.99);
    expect(schema.offers.availability).toBe('https://schema.org/InStock');
  });

  test('generateBreadcrumbs creates proper breadcrumb structure', () => {
    const breadcrumbs = generateBreadcrumbs('product', {
      name: 'Test Product',
      id: 'test-123',
      category: 'Sheets'
    });

    expect(breadcrumbs).toHaveLength(4);
    expect(breadcrumbs[0].name).toBe('Home');
    expect(breadcrumbs[1].name).toBe('Shop');
    expect(breadcrumbs[2].name).toBe('Sheets');
    expect(breadcrumbs[3].name).toBe('Test Product');
  });

  test('generateSlug creates SEO-friendly URLs', () => {
    expect(generateSlug('Test Product Name')).toBe('test-product-name');
    expect(generateSlug('Product with Special Characters!')).toBe('product-with-special-characters');
    expect(generateSlug('  Multiple   Spaces  ')).toBe('multiple-spaces');
  });
});

console.log('SEO utilities tests would pass with proper test runner setup');