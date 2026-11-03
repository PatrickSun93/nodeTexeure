// Type checks for request values that are bound into SQL.
//
// mysql2 binds a JS number as DOUBLE, a boolean as TINY and an array/object as
// its JSON text. Compared with a string column (`WHERE email = ?`) a number makes
// MySQL cast the column instead, so every row whose numeric prefix equals the
// value matches ('abc' → 0, '1a3f…' → 1, '1e5…' → 100000). MySQL can also keep the
// parameter type it saw first for a cached prepared statement, so one numeric
// request can make later string requests on that statement compare numerically.
// JSON bodies, query strings (`?x=a&x=b`, `?x[a]=b`) and cookie-parser's `j:`
// cookies all produce such values: check the type before the value reaches SQL.

const isString = (v) => typeof v === 'string';

// A required text field: a non-empty string.
const isNonEmptyString = (v) => typeof v === 'string' && v !== '';

// An optional text field: absent (undefined, null or '') or a string.
const isOptionalString = (v) => v === undefined || v === null || typeof v === 'string';

// Every element is a non-empty string (and there is at least one).
const isStringList = (v) => Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);

// The first non-empty value of a raw query-string key — what the Rust API's
// `params::first` reads. Express's `req.query` can't be used for this: with the
// default (qs) parser `?x=a&x=b` and `?x[]=a` become arrays and `?x[a]=b` an
// object, so `.trim()` throws and a bound value becomes JSON text. Reads from
// the first `?` on, so a literal `?` inside a value is kept.
function firstQueryValue(req, key) {
  const url = req.originalUrl || req.url || '';
  const i = url.indexOf('?');
  const raw = i < 0 ? '' : url.slice(i + 1);
  return new URLSearchParams(raw).getAll(key).find((v) => v !== '') || '';
}

module.exports = { isString, isNonEmptyString, isOptionalString, isStringList, firstQueryValue };
