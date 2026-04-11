// src/hooks/usePushAlarm.js
//
// Drop this file in your src/hooks/ folder.
// Import and call it once inside AdminDashboard.
//
// What it does:
//  1. Registers the service worker (/public/sw.js).
//  2. Requests Notification permission on first admin click.
//  3. Sends the auth token + API base to the SW so it can poll even when the
//     tab is hidden or the admin navigates away (browser must stay open).
//  4. Listens for PLAY_CHIME messages from the SW and plays the Web Audio chime.
//  5. Listens for NAVIGATE messages (notification click) and calls navigate().
//  6. Keeps the SW token fresh whenever localStorage changes (token refresh).

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// ─── Web Audio chime (C6→E6 + G5 harmony) ────────────────────────────────────
function playChime(audioCtxRef) {
  try {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(1047, ctx.currentTime);
    o1.frequency.setValueAtTime(1319, ctx.currentTime + 0.15);
    o1.connect(gain);
    o1.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.7);

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(784, ctx.currentTime);
    o2.connect(gain);
    o2.start(ctx.currentTime);
    o2.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn('Chime playback failed:', e);
  }
}

export function usePushAlarm({ isAuthenticated, notifications, activeSection }) {
  const navigate = useNavigate();
  const swRef = useRef(null);           // ServiceWorkerRegistration
  const audioCtxRef = useRef(null);    // AudioContext

  // ─── Register SW once ───────────────────────────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => {
        swRef.current = reg;
        console.log('[NXL] Service worker registered:', reg.scope);
      })
      .catch(err => console.warn('[NXL] SW registration failed:', err));

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', event => {
      const msg = event.data;
      if (!msg?.type) return;

      if (msg.type === 'PLAY_CHIME') {
        playChime(audioCtxRef);
      }

      if (msg.type === 'NAVIGATE') {
        navigate(msg.url || '/admin-dashboard');
      }
    });
  }, [navigate]);

  // ─── Init AudioContext on first user click ───────────────────────────────
  useEffect(() => {
    function initAudio() {
      if (!audioCtxRef.current) {
        try {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        } catch {}
      }
      window.removeEventListener('click', initAudio);
    }
    window.addEventListener('click', initAudio);
    return () => window.removeEventListener('click', initAudio);
  }, []);

  // ─── Request push permission + start/stop SW polling on auth change ──────
  useEffect(() => {
    async function syncWithSW() {
      const sw = await getActiveSW();
      if (!sw) return;

      if (isAuthenticated) {
        // Request permission (must be called after a user gesture — the click
        // listener above covers this for the AudioContext; Notification.requestPermission
        // is separately gated but modern browsers allow it on page load for PWAs).
        if ('Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }

        const token = localStorage.getItem('token');
        const currentUnread = notifications.filter(n => !n.read).length;

        sw.postMessage({
          type: 'START_POLL',
          token,
          apiBase: API_BASE_URL,
          currentUnread,
        });
      } else {
        sw.postMessage({ type: 'STOP_POLL' });
      }
    }

    syncWithSW();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Tell SW when admin reads notifications ───────────────────────────────
  useEffect(() => {
    if (activeSection !== 'notifications') return;
    getActiveSW().then(sw => sw?.postMessage({ type: 'MARK_READ' }));
  }, [activeSection]);

  // ─── Keep SW token fresh (token refresh from AuthContext) ─────────────────
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== 'token') return;
      getActiveSW().then(sw => {
        if (sw && e.newValue) {
          sw.postMessage({ type: 'TOKEN_REFRESH', token: e.newValue });
        }
      });
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}

// ─── Helper: get the active SW controller ────────────────────────────────────
async function getActiveSW() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.active || navigator.serviceWorker.controller;
}