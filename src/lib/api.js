// ── Shared API client ───────────────────────────────────────────────────────
// Single source of truth for the backend base URL and authenticated fetch
// behavior, replacing the ~20 near-identical copies that used to live in
// individual page/component files.

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function authHeaders(extra = {}) {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function refreshAccessToken() {
  const rt = localStorage.getItem('refreshToken');
  if (!rt) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    const data = await res.json();
    if (data.success && data.token) {
      localStorage.setItem('token', data.token);
      return data.token;
    }
  } catch { /* fall through to null */ }
  return null;
}

function clearSessionAndRedirect() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login';
}

function resolveUrl(path) {
  return /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Low-level authenticated fetch: attaches the bearer token, retries once on
 * a 401 via the refresh token. Returns the raw Response and never redirects —
 * use this where a failed/expired session shouldn't yank the user to /login
 * (e.g. best-effort calls on otherwise-public pages).
 */
export async function authFetch(path, options = {}, { retry = true } = {}) {
  const url = resolveUrl(path);
  let res = await fetch(url, { ...options, headers: authHeaders(options.headers) });
  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await fetch(url, { ...options, headers: authHeaders(options.headers) });
  }
  return res;
}

/**
 * High-level authenticated request: same as authFetch, but parses JSON,
 * throws on non-2xx, and clears the session + redirects to /login if the
 * caller still isn't authenticated after the refresh attempt. Use this in
 * logged-in-only areas (dashboard, admin, checkout).
 */
export async function apiRequest(path, options = {}) {
  const res = await authFetch(path, options);
  if (res.status === 401 || res.status === 403) {
    clearSessionAndRedirect();
    return Promise.reject(new Error('Session expired. Please log in again.'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}
