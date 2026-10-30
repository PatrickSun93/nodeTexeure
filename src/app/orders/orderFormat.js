// Display helpers for order payloads from GET /api/orders/:id (Node and Rust
// return identical JSON). MySQL DECIMAL columns arrive as strings ("69.99")
// and JSON columns may arrive parsed or as strings, so never call number or
// object methods on the raw fields.

export const money = (value) => `$${(Number(value) || 0).toFixed(2)}`;

export function parseJsonField(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Orders store the address object as it was submitted. Checkout sends
// { first_name, last_name, address_line_1, address_line_2, city, state,
// postal_code, country, phone }; older/seeded orders use
// { name, street, city, state, zip, country }. Normalise both.
export function formatAddress(raw) {
  const a = parseJsonField(raw);
  if (!a || typeof a !== 'object') return null;
  const pick = (...keys) => keys.map((k) => a[k]).find((v) => typeof v === 'string' && v.trim()) || '';

  const name = [pick('first_name', 'firstName'), pick('last_name', 'lastName')].filter(Boolean).join(' ')
    || pick('name', 'full_name', 'fullName');
  const stateZip = [pick('state'), pick('postal_code', 'postalCode', 'zip')].filter(Boolean).join(' ');
  const lines = [
    pick('company'),
    pick('address_line_1', 'addressLine1', 'street', 'address1', 'line1'),
    pick('address_line_2', 'addressLine2', 'address2', 'line2'),
    [pick('city'), stateZip].filter(Boolean).join(', '),
    pick('country'),
  ].filter(Boolean);

  if (!name && lines.length === 0) return null;
  return { name, lines, phone: pick('phone') };
}
