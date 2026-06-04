/**
 * usePushNotifications
 * Requests browser notification permission and shows a notification
 * when a new unread booking appears in the admin dashboard.
 *
 * Usage in AdminDashboard:
 *   usePushNotifications({ notifications, isAdmin })
 */

import { useEffect, useRef } from 'react';

const NOTIF_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

let audioCtx = null;

function playChime() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
    g.gain.setValueAtTime(0.4, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    o.start(audioCtx.currentTime);
    o.stop(audioCtx.currentTime + 0.5);
  } catch {}
}

function showBrowserNotification(title, body, url = '/admin-dashboard') {
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      icon:  '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      tag:   'nxl-booking',
      renotify: true,
      requireInteraction: false,
    });
    n.onclick = () => { window.focus(); window.location.href = url; n.close(); };
    setTimeout(() => n.close(), 8000);
  } catch {}
}

export function usePushNotifications({ notifications = [], isAdmin = false }) {
  const prevCountRef = useRef(null);

  // Request permission on mount (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Delay request so it doesn't fire immediately on page load
      const t = setTimeout(() => {
        Notification.requestPermission();
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [isAdmin]);

  // Watch for new unread notifications
  useEffect(() => {
    if (!isAdmin) return;
    const unreadCount = notifications.filter(n => !n.read).length;

    if (prevCountRef.current !== null && unreadCount > prevCountRef.current) {
      // New booking arrived
      playChime();
      const latest = notifications.find(n => !n.read);
      showBrowserNotification(
        '📅 New Booking — NXL Beauty Bar',
        latest?.message || 'A new appointment has been booked.',
        '/admin-dashboard'
      );
    }
    prevCountRef.current = unreadCount;
  }, [notifications, isAdmin]);
}

/**
 * Standalone helper — call this anywhere to request push permission
 * and show a test notification.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  const result = await Notification.requestPermission();
  return result;
}