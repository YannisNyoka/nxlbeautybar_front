/**
 * NotificationBell — client-facing in-app notification centre
 * Drop-in anywhere in the nav. Shows unread count badge, opens a slide-out drawer.
 *
 * Usage:
 *   <NotificationBell />
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './NotificationBell.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const POLL_INTERVAL = 30_000; // 30 seconds

const TYPE_COLORS = {
  booking_confirmed:  { bg:'#eff6ff', icon:'📅', accent:'#3b82f6' },
  booking_cancelled:  { bg:'#fef2f2', icon:'❌', accent:'#ef4444' },
  booking_reminder:   { bg:'#fffbeb', icon:'⏰', accent:'#f59e0b' },
  order_confirmed:    { bg:'#f0fdf4', icon:'🛒', accent:'#10b981' },
  order_shipped:      { bg:'#f5f3ff', icon:'🚚', accent:'#8b5cf6' },
  order_ready:        { bg:'#f0fdf4', icon:'🏪', accent:'#10b981' },
  order_delivered:    { bg:'#f0fdf4', icon:'✅', accent:'#10b981' },
  loyalty_earned:     { bg:'#fffbeb', icon:'⭐', accent:'#f59e0b' },
  loyalty_redeemed:   { bg:'#faf5ff', icon:'🎁', accent:'#8b5cf6' },
  loyalty_tier_up:    { bg:'#faf5ff', icon:'🏆', accent:'#8b5cf6' },
  gift_card_received: { bg:'#fdf2f8', icon:'🎁', accent:'#ec4899' },
  promotion:          { bg:'#fff7ed', icon:'🎉', accent:'#f97316' },
  system:             { bg:'#f8fafc', icon:'💡', accent:'#64748b' },
};

function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60)   return 'Just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(date).toLocaleDateString('en-ZA', { day:'numeric', month:'short' });
}

export default function NotificationBell() {
  const [open,        setOpen]        = useState(false);
  const [notifs,      setNotifs]      = useState([]);
  const [unread,      setUnread]      = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(false);
  const drawerRef  = useRef(null);
  const prevUnread = useRef(0);

  const token = localStorage.getItem('token');

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  // Poll unread count
  const pollUnread = useCallback(async () => {
    if (!token) return;
    try {
      const res  = await fetch(`${API_BASE_URL}/client-notifications/unread-count`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        const count = data.data.count;
        if (prevUnread.current !== null && count > prevUnread.current) {
          // New notification arrived — play subtle sound
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'sine'; o.frequency.value = 660;
            g.gain.setValueAtTime(0.15, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            o.start(); o.stop(ctx.currentTime + 0.35);
          } catch {}
        }
        prevUnread.current = count;
        setUnread(count);
      }
    } catch {}
  }, [token, authHeaders]);

  // Load notifications
  const loadNotifs = useCallback(async (p = 1, append = false) => {
    if (!token) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/client-notifications?page=${p}&limit=15`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setNotifs(prev => append ? [...prev, ...data.data] : data.data);
        setUnread(data.unreadCount);
        setHasMore(p < data.pages);
        setPage(p);
      }
    } catch {}
    finally { setLoading(false); }
  }, [token, authHeaders]);

  // Mark all read when drawer opens
  const markAllRead = useCallback(async () => {
    if (!token || unread === 0) return;
    try {
      await fetch(`${API_BASE_URL}/client-notifications/mark-read`, { method:'POST', headers: authHeaders(), body: JSON.stringify({}) });
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
      prevUnread.current = 0;
    } catch {}
  }, [token, unread, authHeaders]);

  const markOneRead = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/client-notifications/mark-read`, { method:'POST', headers: authHeaders(), body: JSON.stringify({ id }) });
      setNotifs(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const deleteNotif = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/client-notifications/${id}`, { method:'DELETE', headers: authHeaders() });
      setNotifs(prev => prev.filter(n => n._id !== id));
    } catch {}
  };

  const clearAll = async () => {
    if (!window.confirm('Clear all notifications?')) return;
    try {
      await fetch(`${API_BASE_URL}/client-notifications`, { method:'DELETE', headers: authHeaders() });
      setNotifs([]); setUnread(0); prevUnread.current = 0;
    } catch {}
  };

  // Initial load + polling
  useEffect(() => {
    if (!token) return;
    pollUnread();
    const interval = setInterval(pollUnread, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [token, pollUnread]);

  // Open/close drawer
  useEffect(() => {
    if (open) { loadNotifs(1); markAllRead(); }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!token) return null;

  return (
    <div className="nb-root" ref={drawerRef}>
      {/* Bell button */}
      <button className="nb-bell" onClick={() => setOpen(o => !o)} aria-label="Notifications">
        🔔
        {unread > 0 && (
          <span className="nb-badge">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {/* Drawer */}
      <div className={`nb-drawer ${open ? 'open' : ''}`}>
        {/* Header */}
        <div className="nb-drawer-header">
          <div>
            <h3 className="nb-drawer-title">Notifications</h3>
            {unread > 0 && <span className="nb-unread-tag">{unread} unread</span>}
          </div>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            {notifs.length > 0 && (
              <button className="nb-clear-btn" onClick={clearAll}>Clear all</button>
            )}
            <button className="nb-close" onClick={() => setOpen(false)}>✕</button>
          </div>
        </div>

        {/* List */}
        <div className="nb-list">
          {loading && notifs.length === 0 ? (
            <div className="nb-loading">
              {[1,2,3].map(i => <div key={i} className="nb-skeleton" />)}
            </div>
          ) : notifs.length === 0 ? (
            <div className="nb-empty">
              <span>🔔</span>
              <p>No notifications yet</p>
              <small>We'll let you know when something happens</small>
            </div>
          ) : (
            <>
              {notifs.map(n => {
                const style = TYPE_COLORS[n.type] || TYPE_COLORS.system;
                return (
                  <div
                    key={n._id}
                    className={`nb-item ${!n.read ? 'unread' : ''}`}
                    style={{ '--nb-accent': style.accent }}
                    onClick={() => { if (!n.read) markOneRead(n._id); }}
                  >
                    <div className="nb-item-icon" style={{ background: style.bg }}>
                      {n.icon || style.icon}
                    </div>
                    <div className="nb-item-body">
                      <p className="nb-item-title">{n.title}</p>
                      <p className="nb-item-text">{n.body}</p>
                      <span className="nb-item-time">{timeAgo(n.createdAt)}</span>
                    </div>
                    <div className="nb-item-actions">
                      {n.link && (
                        <Link
                          to={n.link}
                          className="nb-item-link"
                          onClick={() => { setOpen(false); if (!n.read) markOneRead(n._id); }}
                        >
                          →
                        </Link>
                      )}
                      <button className="nb-item-delete" onClick={(e) => { e.stopPropagation(); deleteNotif(n._id); }} title="Remove">✕</button>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <button className="nb-load-more" onClick={() => loadNotifs(page + 1, true)} disabled={loading}>
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Backdrop on mobile */}
      {open && <div className="nb-backdrop" onClick={() => setOpen(false)} />}
    </div>
  );
}