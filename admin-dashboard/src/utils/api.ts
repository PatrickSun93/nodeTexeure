// Simple API utilities for cookie-based auth and CSRF protection
// Note: /api/* paths are automatically proxied to backend via next.config.mjs rewrites

import type { ApiResponse } from '@/types/api';

const BACKEND_URL = typeof window === 'undefined'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:6666')
  : '';

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}

/**
 * Ensure there is a CSRF token available (double-submit cookie pattern).
 * - Returns the token from the csrf_token cookie if present.
 * - Otherwise, calls GET /api/users/csrf-token to obtain and set it.
 */
async function ensureCsrfToken({ refresh = false }: { refresh?: boolean } = {}): Promise<string> {
  const token = refresh ? undefined : readCookie('csrf_token');
  if (token) return token;

  const res = await fetch(`${BACKEND_URL}/api/users/csrf-token`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.status) {
    // Likely not authenticated or not admin
    throw new Error(`Failed to obtain CSRF token: ${res.status}`);
  }

  const data: ApiResponse<{ csrfToken: string }> = await res.json();
  if (data.status == 'SUCCESS') {
    return data.keyValueTable.csrfToken;
  }
  throw new Error('CSRF token missing in response');
}

/** Thrown by apiFetch on a 401/403, with the response body. */
export interface AuthError extends Error {
  status: number;
  data: ApiResponse;
}

/**
 * apiFetch(pathOrUrl, options)
 * - Always includes credentials for cookie-based auth
 * - Automatically attaches X-CSRF-Token for non-GET/HEAD/OPTIONS methods
 * - Returns parsed JSON from ResponseFormatter
 */
async function apiFetch<T = unknown>(pathOrUrl: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BACKEND_URL}${pathOrUrl}`;
  const method = (options.method || 'GET').toUpperCase();

  const headers = new Headers(options.headers || {});
  const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  const callerCsrf = headers.has('X-CSRF-Token');
  if (isStateChanging) {
    if (!callerCsrf) {
      headers.set('X-CSRF-Token', await ensureCsrfToken());
    }
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const send = () => fetch(url, { ...options, method, headers, credentials: 'include' });
  let res = await send();

  // A csrf_token cookie left over from another session (another user, an
  // expired token or a rotated secret) fails every write: fetch a fresh token
  // (the endpoint also resets the cookie) and retry once.
  if (res.status === 403 && isStateChanging && !callerCsrf) {
    const failed = await res.clone().json().catch(() => ({}));
    if (failed.message === 'CSRF token validation failed') {
      headers.set('X-CSRF-Token', await ensureCsrfToken({ refresh: true }));
      res = await send();
    }
  }

  const data = await res.json().catch(() => ({}));

  // Surface auth/permission issues to caller
  if (res.status === 401 || res.status === 403) {
    const error = new Error('Unauthorized') as AuthError;
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export { apiFetch, ensureCsrfToken, readCookie };