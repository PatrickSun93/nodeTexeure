// Simple API utilities for cookie-based auth and CSRF protection
// Note: /api/* paths are automatically proxied to backend via next.config.mjs rewrites

const BACKEND_URL = typeof window === 'undefined'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:6666')
  : '';

function readCookie(name) {
  if (typeof document === 'undefined') return undefined;
  const matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}

/**
 * Ensure there is a CSRF token available (double-submit cookie pattern).
 * - Returns the token from the csrf_token cookie if present.
 * - Otherwise, calls GET /api/users/csrf-token to obtain and set it.
 */
async function ensureCsrfToken() {
  let token = readCookie('csrf_token');
  if (token) return token;

  const res = await fetch(`${BACKEND_URL}/api/users/csrf-token`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.status) {
    // Likely not authenticated or not admin
    throw new Error(`Failed to obtain CSRF token: ${res.status}`);
  }

  const data = await res.json();
  if (data.status == 'SUCCESS') {
    return data.keyValueTable.csrfToken;
  }
  throw new Error('CSRF token missing in response');
}

/**
 * apiFetch(pathOrUrl, options)
 * - Always includes credentials for cookie-based auth
 * - Automatically attaches X-CSRF-Token for non-GET/HEAD/OPTIONS methods
 * - Returns parsed JSON from ResponseFormatter
 */
async function apiFetch(pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BACKEND_URL}${pathOrUrl}`;
  const method = (options.method || 'GET').toUpperCase();

  const headers = new Headers(options.headers || {});
  const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  if (isStateChanging) {
    const csrf = await ensureCsrfToken();
    if (!headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrf);
    }
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const res = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  // Surface auth/permission issues to caller
  if (res.status === 401 || res.status === 403) {
    const error = new Error('Unauthorized');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export { apiFetch, ensureCsrfToken, readCookie };