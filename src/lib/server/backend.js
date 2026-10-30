// Server-only helpers for calling the backend from Next.js server code
// (metadata, sitemap). Uses http.request, not fetch: the backend listens on port
// 6666, which is on the WHATWG "bad ports" list, so Node's fetch refuses it.
import http from 'http';
import https from 'https';
import { URL } from 'url';

export const BACKEND_URL = (
  (process.env.NODE_ENV === 'production' && process.env.PRODUCTION_BACKEND_URL) ||
  process.env.BACKEND_URL ||
  'http://localhost:6666'
).trim().replace(/\/$/, '');

/** GET `${BACKEND_URL}${path}` and parse the JSON body. Rejects on network/JSON errors. */
export function getBackendJson(path, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BACKEND_URL}${path}`);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response from backend'));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Backend request timed out')));
    req.on('error', reject);
    req.end();
  });
}
