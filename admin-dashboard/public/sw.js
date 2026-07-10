// sw.js — self-unregistering "kill switch" (intentionally NOT a caching SW).
//
// The previous version of this file was a full PWA caching service worker. It
// served stale cached HTML/JS chunks that no longer matched the deployed build,
// which broke React hydration — admin pages rendered but were completely
// non-interactive (you couldn't type or click) and the problem survived normal
// refreshes. The admin dashboard does not need offline PWA caching, so this
// file now does the opposite of caching: it uninstalls itself.
//
// Any browser still holding a stale registration from a previous production
// build heals AUTOMATICALLY on its next navigation — no manual "Clear site
// data" required. (ServiceWorkerRegistration.js registers this file ONLY in
// production and proactively unregisters any worker in development; this
// kill switch is the other half of that fix.)
//
// Deliberately has NO fetch handler — a kill switch must never intercept or
// serve requests; every request hits the network normally.

self.addEventListener('install', () => {
  // Activate this worker immediately so the cleanup below runs right away.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      // 1. Delete every cache left behind by the old caching service worker.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      // 2. Unregister so this worker never controls a page again.
      await self.registration.unregister();

      // 3. Reload open windows once into a clean, service-worker-free state.
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    } catch (err) {
      // A failed heal must never throw or wedge the page.
      console.error('[sw kill-switch] cleanup failed', err);
    }
  })());
});
