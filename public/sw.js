// ============================================================
// NXL Beauty Bar — Service Worker v3
// Strategy:
//   • App shell  → Cache First (fast navigation)
//   • API calls  → Network First + 5-min stale fallback
//   • Images     → Cache First with 30-day expiry
//   • Pages      → Stale While Revalidate
//   • Offline    → Branded fallback page
// ============================================================

const CACHE_VERSION = 'v3';
const CACHE_SHELL   = `nxl-shell-${CACHE_VERSION}`;
const CACHE_IMAGES  = `nxl-images-${CACHE_VERSION}`;
const CACHE_PAGES   = `nxl-pages-${CACHE_VERSION}`;
const OFFLINE_URL   = '/offline.html';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
];

// Routes that should never be served from cache
const NO_CACHE_PATTERNS = [
  /\/api\//,
  /\/auth\//,
  /\/payments/,
  /chrome-extension/,
];

// ── Install — pre-cache shell ─────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch((err) => console.warn('[SW] Pre-cache partial failure:', err.message))
  );
  self.skipWaiting();
});

// ── Activate — clean up old caches ───────────────────────────
self.addEventListener('activate', (event) => {
  const CURRENT = new Set([CACHE_SHELL, CACHE_IMAGES, CACHE_PAGES]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !CURRENT.has(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch — routing strategies ────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and no-cache patterns
  if (request.method !== 'GET') return;
  if (NO_CACHE_PATTERNS.some((p) => p.test(url.pathname))) return;
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') return;

  // Images — Cache First, 30 days
  if (request.destination === 'image' || /\.(png|jpg|jpeg|gif|svg|webp|avif|ico)(\?|$)/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_IMAGES, 30 * 24 * 60 * 60));
    return;
  }

  // JS/CSS bundles — Cache First (Vite fingerprints them)
  if (/\.(js|css)(\?|$)/i.test(url.pathname) && url.hostname === self.location.hostname) {
    event.respondWith(cacheFirst(request, CACHE_SHELL, 7 * 24 * 60 * 60));
    return;
  }

  // HTML pages — Stale While Revalidate, offline fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidate(request, CACHE_PAGES));
    return;
  }

  // Fonts / external — Cache First 7 days
  if (request.destination === 'font' || url.hostname.includes('fonts.')) {
    event.respondWith(cacheFirst(request, CACHE_SHELL, 7 * 24 * 60 * 60));
    return;
  }

  // Everything else — Network with offline fallback
  event.respondWith(networkWithOfflineFallback(request));
});

// ── Strategies ────────────────────────────────────────────────

async function cacheFirst(request, cacheName, maxAgeSeconds) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) {
    const dateHeader = cached.headers.get('sw-cached-date');
    if (!dateHeader || (Date.now() - new Date(dateHeader).getTime()) / 1000 < maxAgeSeconds) {
      return cached;
    }
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const headers  = new Headers(response.headers);
      headers.append('sw-cached-date', new Date().toUTCString());
      const toCache  = new Response(await response.clone().arrayBuffer(), { status:response.status, statusText:response.statusText, headers });
      cache.put(request, toCache);
      return response;
    }
    return cached || response;
  } catch {
    return cached || offlineFallback(request);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await networkFetch) || offlineFallback(request);
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    return offlineFallback(request);
  }
}

async function offlineFallback(request) {
  if (request.headers.get('accept')?.includes('text/html')) {
    const cache    = await caches.open(CACHE_SHELL);
    return (await cache.match(OFFLINE_URL)) || new Response('Offline', { status: 503 });
  }
  return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

// ── Background Sync — queue failed POST requests ──────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-bookings') {
    event.waitUntil(syncPendingBookings());
  }
});

async function syncPendingBookings() {
  const cache = await caches.open('nxl-sync-queue');
  const keys  = await cache.keys();
  for (const key of keys) {
    try {
      const req = await cache.match(key);
      const body = await req.json();
      const res  = await fetch(req.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) await cache.delete(key);
    } catch {}
  }
}

// ── Push Notifications ────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'NXL Beauty Bar', {
        body:    data.body || '',
        icon:    '/android-chrome-192x192.png',
        badge:   '/favicon-32x32.png',
        tag:     data.tag  || 'nxl-notification',
        data:    data.url  || '/',
        actions: data.actions || [],
        vibrate: [200, 100, 200],
      })
    );
  } catch {}
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data || '/';
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});