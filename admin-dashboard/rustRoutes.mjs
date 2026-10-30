// Which service answers the admin dashboard's /api/* calls: the Node backend,
// or the Rust API (rust/crates/api) for the route groups already moved there.
// Same env and the same rules as the storefront (next.config.mjs and
// src/lib/server/apiTarget.js at the repo root), but the admin app is its own
// build context, so it carries its own copy:
//
//   RUST_API_URL     base URL of the Rust API (trimmed, trailing slash dropped)
//   RUST_API_ROUTES  comma-separated groups (`admin`, `users`) or single paths
//                    (`settings/public`, `admin/logout`); ignored when
//                    RUST_API_URL is unset. Unset/empty = everything on Node.
//
// A group listed in PARTIAL_GROUPS moves only those paths (Next path patterns,
// e.g. `admin: ['admin/logout', 'admin/coupons/:path*']`); the rest of the
// group stays on Node. None today: nothing of the admin's own API is moved yet.
//
// The rewrite targets are baked in at `next build` (Dockerfile.prod passes
// RUST_API_URL / RUST_API_ROUTES / BACKEND_URL as build args).
export const PARTIAL_GROUPS = {};

/** RUST_API_URL and the RUST_API_ROUTES entries. */
export function rustRouting(env = process.env) {
  const url = (env.RUST_API_URL || '').trim().replace(/\/$/, '');
  const entries = url
    ? (env.RUST_API_ROUTES || '').split(',').map((r) => r.trim()).filter(Boolean)
    : [];
  return { url, entries };
}

/**
 * The rewrites for next.config.mjs: moved single paths first (Next uses the
 * first match), then whole moved groups, then everything else to Node.
 */
export function apiRewrites(backendUrl, env = process.env, partialGroups = PARTIAL_GROUPS) {
  const { url, entries } = rustRouting(env);
  const groups = entries.filter((r) => !r.includes('/') && !partialGroups[r]);
  const paths = entries.flatMap((r) => partialGroups[r] || (r.includes('/') ? [r] : []));
  return [
    // A param's regex `(…)` belongs to the source only.
    ...paths.map((path) => ({
      source: `/api/${path}`,
      destination: `${url}/api/${path.replace(/\(.*\)/, '')}`,
    })),
    ...groups.map((group) => ({
      source: `/api/${group}/:path*`,
      destination: `${url}/api/${group}/:path*`,
    })),
    { source: '/api/:path*', destination: `${backendUrl}/api/:path*` },
  ];
}

/**
 * Base URL (no trailing slash) of the service for `path` (`/api/admin/logout`),
 * for server-side code that calls the API directly. Partial-group patterns
 * match literally (no `:param`s).
 */
export function apiBaseUrl(path, backendUrl, env = process.env, partialGroups = PARTIAL_GROUPS) {
  const { url, entries } = rustRouting(env);
  if (!url) return backendUrl;
  const route = path.split('?')[0].replace(/^\/?api\//, '').replace(/\/$/, '');
  const group = route.split('/')[0];
  const partial = partialGroups[group];
  const moved = entries.includes(route)
    || (entries.includes(group) && (!partial || partial.includes(route)));
  return moved ? url : backendUrl;
}
