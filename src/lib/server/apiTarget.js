// Which service answers an /api path, for server-side calls that go to the API
// directly instead of through the storefront proxy (NextAuth's login/refresh).
// The browser's /api/* calls are routed by the rewrites in next.config.mjs; this
// reads the same env the same way, so both kinds of call reach the same service:
//
//   RUST_API_URL     base URL of the Rust API (trimmed, trailing slash dropped)
//   RUST_API_ROUTES  comma-separated groups (`users`) or single paths
//                    (`settings/public`); ignored when RUST_API_URL is unset
//
// A group listed in PARTIAL_GROUPS moves only those paths. Keep it in sync with
// `partialGroups` in next.config.mjs.
const PARTIAL_GROUPS = {
  cart: ['cart', 'cart/add', 'cart/update/:itemId', 'cart/remove/:itemId'],
};

/** RUST_API_URL and the RUST_API_ROUTES entries, parsed like next.config.mjs. */
export function rustRouting(env = process.env) {
  const url = (env.RUST_API_URL || '').trim().replace(/\/$/, '');
  const entries = url
    ? (env.RUST_API_ROUTES || '').split(',').map((r) => r.trim()).filter(Boolean)
    : [];
  return { url, entries };
}

/**
 * Base URL (no trailing slash) of the service for `path` (`/api/users/login`):
 * the Rust API when its group or the exact path is in RUST_API_ROUTES, else
 * `backendUrl`. Partial-group patterns match literally (no `:param`s).
 */
export function apiBaseUrl(path, backendUrl, env = process.env) {
  const { url, entries } = rustRouting(env);
  if (!url) return backendUrl;
  const route = path.split('?')[0].replace(/^\/?api\//, '').replace(/\/$/, '');
  const group = route.split('/')[0];
  const partial = PARTIAL_GROUPS[group];
  const moved = entries.includes(route)
    || (entries.includes(group) && (!partial || partial.includes(route)));
  return moved ? url : backendUrl;
}
