// ============================================================
// NXL Beauty Bar — Service Worker v2
// ============================================================

const CACHE_NAME    = 'nxl-beauty-v2';
const OFFLINE_URL   = '/offline.html';
const STATIC_ASSETS = [
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

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch((err) =>
        console.warn('[SW] Pre-cache partial failure:', err.message)
      )
    )
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // API calls — never cache
  if (
    url.pathname.startsWith('/appointments') ||
    url.pathname.startsWith('/shop/') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/payments') ||
    url.pathname.startsWith('/gallery') ||
    url.pathname.startsWith('/users') ||
    url.pathname.startsWith('/notifications') ||
    url.pathname.startsWith('/discount-codes') ||
    url.pathname.startsWith('/sitemap') ||
    url.pathname.startsWith('/robots')
  ) return;

  // Cross-origin except fonts + Cloudinary
  if (
    url.hostname !== self.location.hostname &&
    !url.hostname.includes('cloudinary') &&
    !url.hostname.includes('fonts.googleapis') &&
    !url.hostname.includes('fonts.gstatic')
  ) return;

  // Google Fonts — Cache First
  if (url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        cache.put(request, fresh.clone());
        return fresh;
      }).catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // Images & Cloudinary — Cache First
  if (
    request.destination === 'image' ||
    url.hostname.includes('cloudinary') ||
    url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return new Response('', { status: 408 });
        }
      })
    );
    return;
  }

  // App shell — Network First with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
        }
        return new Response('Offline', { status: 503 });
      })
  );
});

// ── Push Notifications ────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'NXL Beauty Bar', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'NXL Beauty Bar', {
      body:    data.body || 'You have a new notification.',
      icon:    '/android-chrome-192x192.png',
      badge:   '/android-chrome-192x192.png',
      data:    { url: data.url || '/' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});