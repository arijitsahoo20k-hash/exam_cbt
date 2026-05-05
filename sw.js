/**
 * sw.js — Service Worker
 * Network-first for HTML/CSS/JS so updates are always picked up automatically.
 * Cache-first only for images and fonts (rarely change).
 *
 * To force a full cache refresh, bump CACHE_VERSION below.
 */

const CACHE_VERSION = 'v6'; // ← increment this on every deploy to bust old caches
const CACHE_NAME = `examcbt-${CACHE_VERSION}`;

// Static assets worth pre-caching (images/icons only)
const PRECACHE_URLS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting()) // activate immediately without waiting
  );
});

// ── Activate: delete ALL old caches ──────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim()) // take control of all pages immediately
  );
});

// ── Fetch Strategy ────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, Supabase API, blob URLs
  if (request.method !== 'GET') return;
  if (url.host.includes('supabase.co')) return;
  if (url.protocol === 'blob:') return;

  // For HTML, CSS, JS → Network-first (always get latest, fall back to cache if offline)
  const isAppShell = (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.match(/\.(js|css)$/)
  );

  if (isAppShell) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(request).then(cached => {
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('/index.html');
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // For images/fonts → Cache-first
  if (url.pathname.match(/\.(png|svg|webp|jpg|jpeg|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        }).catch(() => new Response('Offline', { status: 503 }));
      })
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
