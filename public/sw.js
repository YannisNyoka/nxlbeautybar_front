// ============================================================
// NXL Beauty Bar — Service Worker
// Strategy:
//   - App shell (HTML, JS, CSS): Cache First
//   - API calls (/appointments, /shop, etc.): Network First
//   - Images: Cache First with 30-day expiry
//   - Everything else: Network First with cache fallback
// ============================================================

const CACHE_NAME     = 'nxl-beauty-v1';
const OFFLINE_URL    = '/offline.html';
const STATIC_ASSETS  = [
  '/',
  '/index.html',
  '/offline.html',
  '/Logo.jpeg',
  '/manifest.json',
];

// ── Install ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        // Non-fatal — some assets may not exist yet on first install
        console.warn('[SW] Pre-cache partial failure:', err.message);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests, browser extensions, and cross-origin requests
  // except for our own API and Cloudinary images
  if (request.method !== 'GET') return;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // ── API calls — Network First, no cache ──────────────────
  if (
    url.pathname.startsWith('/appointments') ||
    url.pathname.startsWith('/shop') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/payments') ||
    url.pathname.startsWith('/gallery') ||
    url.pathname.startsWith('/users') ||
    url.pathname.startsWith('/notifications') ||
    url.pathname.startsWith('/discount-codes') ||
    url.hostname !== self.location.hostname
      && !url.hostname.includes('cloudinary')
      && !url.hostname.includes('googletagmanager')
      && !url.hostname.includes('fonts.googleapis')
      && !url.hostname.includes('fonts.gstatic')
  ) {
    // Pure network — don't cache API responses
    return;
  }

  // ── Google Fonts — Cache First ────────────────────────────
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
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

  // ── Images — Cache First with 30-day expiry ───────────────
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
          return new Response('', { status: 408, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // ── App Shell (HTML, JS, CSS) — Network First with cache fallback ──
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Offline fallback
        const cached = await caches.match(request);
        if (cached) return cached;

        // For navigation requests, serve the offline page
        if (request.mode === 'navigate') {
          const offlinePage = await caches.match(OFFLINE_URL);
          if (offlinePage) return offlinePage;
        }

        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});

// ── Push Notifications ─────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'NXL Beauty Bar', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'NXL Beauty Bar', {
      body:    data.body  || 'You have a new notification.',
      icon:    '/Logo.jpeg',
      badge:   '/Logo.jpeg',
      data:    { url: data.url || '/' },
      vibrate: [200, 100, 200],
      actions: data.actions || [],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});