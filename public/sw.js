// ─── NXL Beauty Bar Service Worker ───────────────────────────────────────────
// This file MUST be placed in /public/sw.js so it is served from the root.
//
// What this does:
//  1. Receives PUSH events from the server (if you set up Web Push later).
//  2. More importantly: uses a periodic ALARM (setInterval via message) so that
//     even when the admin tab is hidden/minimised, the SW can poll for new
//     bookings and fire a persistent OS notification every 3 minutes until the
//     admin reads (dismisses) the alert.
//
// Limitations (browser security — cannot be worked around):
//  • The browser itself must be running (any tab, not necessarily NXL).
//  • If the admin closes the browser entirely, no JS runs anywhere — not solvable
//    in a pure web app. For that you would need native app push (FCM/APNs).
//  • The SW can only poll the API if the token is stored somewhere the SW can
//    read. We store it in IndexedDB (set from the main thread on login).
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'nxl-sw-v1';
const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

// ─── IndexedDB helpers (SW has no localStorage) ──────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('nxl-sw-store', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('kv');
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Polling state ────────────────────────────────────────────────────────────
let pollTimer = null;
let pendingAlarm = false; // true = unread booking exists, keep ringing

async function fetchUnreadCount() {
  try {
    const token = await dbGet('authToken');
    const apiBase = await dbGet('apiBase');
    if (!token || !apiBase) return null;

    const res = await fetch(`${apiBase}/notifications`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // 401/403 means logged out — stop polling
    if (res.status === 401 || res.status === 403) {
      await stopPolling();
      return null;
    }

    if (!res.ok) return null;

    const data = await res.json();
    const notifications = data.data || [];
    return notifications.filter(n => !n.read).length;
  } catch {
    return null;
  }
}

// Play a chime sound using a data-URI encoded minimal WAV (440 Hz beep).
// This works in a Service Worker via the Web Audio API through the client.
// We actually send a message to all open clients instead — they play the sound.
async function notifyClients(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach(client => client.postMessage(msg));
}

async function runPoll() {
  const unread = await fetchUnreadCount();

  if (unread === null) return; // not logged in or error

  const lastKnown = (await dbGet('lastUnreadCount')) ?? 0;

  if (unread > lastKnown) {
    // New booking arrived — set alarm, fire notification immediately
    pendingAlarm = true;
    await dbSet('lastUnreadCount', unread);
    await fireAlert(unread);
  } else if (unread === 0) {
    // Admin read everything
    pendingAlarm = false;
    await dbSet('lastUnreadCount', 0);
  } else if (pendingAlarm && unread > 0) {
    // Still unread — re-ring every 3 minutes
    await fireAlert(unread);
  } else {
    await dbSet('lastUnreadCount', unread);
  }
}

async function fireAlert(unreadCount) {
  // 1. OS notification (shows even when tab is in background)
  if (self.registration && Notification.permission === 'granted') {
    await self.registration.showNotification('📅 NXL Beauty Bar — New Booking', {
      body: `You have ${unreadCount} unread booking${unreadCount > 1 ? 's' : ''}. Tap to view.`,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'nxl-new-booking',   // replaces previous notification instead of stacking
      renotify: true,            // re-fires even if same tag
      requireInteraction: true,  // stays on screen until admin clicks
      data: { url: '/admin-dashboard' },
    });
  }

  // 2. Tell open tabs to play the chime sound
  await notifyClients({ type: 'PLAY_CHIME', unreadCount });
}

function startPolling() {
  if (pollTimer) return; // already running
  runPoll(); // immediate first run
  pollTimer = setInterval(runPoll, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pendingAlarm = false;
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── SW lifecycle ─────────────────────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ─── Messages from the main thread ───────────────────────────────────────────
// The main app sends messages to control the SW:
//   { type: 'START_POLL', token, apiBase }  — admin logged in
//   { type: 'STOP_POLL' }                  — admin logged out
//   { type: 'MARK_READ' }                  — admin opened Activity Log
self.addEventListener('message', async event => {
  const msg = event.data;
  if (!msg?.type) return;

  switch (msg.type) {
    case 'START_POLL':
      if (msg.token) await dbSet('authToken', msg.token);
      if (msg.apiBase) await dbSet('apiBase', msg.apiBase);
      await dbSet('lastUnreadCount', msg.currentUnread ?? 0);
      startPolling();
      break;

    case 'STOP_POLL':
      await dbSet('authToken', null);
      stopPolling();
      break;

    case 'MARK_READ':
      pendingAlarm = false;
      await dbSet('lastUnreadCount', 0);
      break;

    case 'TOKEN_REFRESH':
      // Called when the auth token is refreshed — update stored token
      if (msg.token) await dbSet('authToken', msg.token);
      break;
  }
});

// ─── Notification click → open/focus the admin dashboard ─────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/admin-dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // If an NXL tab is already open, focus it
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return;
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(targetUrl);
    })
  );
});