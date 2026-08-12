import { useEffect, useState } from 'react';
import { authFetch } from '../lib/api';

const decimalToFloat = value => {
  if (value == null) return 0;
  if (typeof value === 'object' && '$numberDecimal' in value) return parseFloat(value.$numberDecimal);
  const n = Number(value);
  return isNaN(n) ? 0 : n;
};

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' }) : '—';
const fmtDateTime = d => d ? new Date(d).toLocaleString('en-ZA', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'history',  label: 'Service History' },
  { key: 'loyalty',  label: 'Loyalty' },
  { key: 'orders',   label: 'Shop Orders' },
];

export default function ClientDetailModal({ clientId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await authFetch(`/users/${clientId}/profile`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load client profile');
        if (!cancelled) setProfile(data.data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [clientId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={e => e.stopPropagation()}>
        <header>
          <h3>{profile ? `${profile.user.firstName} ${profile.user.lastName}` : 'Client Profile'}</h3>
          <button onClick={onClose}>✕</button>
        </header>

        {loading && <p style={{ padding: '1.5rem' }}>Loading client profile…</p>}
        {error && <p style={{ padding: '1.5rem', color: '#b91c1c' }}>{error}</p>}

        {profile && !loading && !error && (
          <div style={{ padding: '0 0.25rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', padding: '0.75rem 1rem 1rem', color: '#64748b', fontSize: '0.85rem' }}>
              <span>✉️ {profile.user.email}</span>
              {profile.user.phone && <span>📞 {profile.user.phone}</span>}
              <span>Member since {fmtDate(profile.visitStats.memberSince)}</span>
              <span className={`status ${profile.user.isActive !== false ? 'booked' : 'cancelled'}`}>
                {profile.user.isActive !== false ? 'Active' : 'Blocked'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', padding: '0 1rem 1rem' }}>
              <StatTile label="Total Bookings" value={profile.visitStats.totalBookings} />
              <StatTile label="Completed Visits" value={profile.visitStats.completedVisits} />
              <StatTile label="Site Logins" value={profile.visitStats.loginCount} />
              <StatTile label="Loyalty Points" value={profile.loyalty.points} accent="#92400e" />
              <StatTile label="Tier" value={profile.loyalty.tier} accent="#92400e" capitalize />
              <StatTile label="Last Visit" value={fmtDate(profile.visitStats.lastVisit)} small />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', padding: '0 1rem 0.75rem', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="action-btn"
                  style={{
                    background: tab === t.key ? '#1e293b' : '#f8fafc',
                    color: tab === t.key ? '#fff' : '#334155',
                    border: '1px solid #e2e8f0',
                  }}
                >{t.label}</button>
              ))}
            </div>

            <div style={{ padding: '1rem', maxHeight: '45vh', overflowY: 'auto' }}>
              {tab === 'overview' && (
                <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <Row label="Last login" value={fmtDateTime(profile.visitStats.lastLoginAt)} />
                  <Row label="Referred by" value={profile.referrals.referredBy || '—'} />
                  <Row label="Successful referrals made" value={profile.referrals.successfulReferrals} />
                  <Row label="Total loyalty points earned" value={profile.loyalty.totalEarned} />
                  <Row label="Total loyalty points redeemed" value={profile.loyalty.totalRedeemed} />
                  <Row label="Shop orders placed" value={profile.orders.length} />
                </div>
              )}

              {tab === 'history' && (
                <div className="table-responsive">
                  <table>
                    <thead><tr><th>Date</th><th>Services</th><th>Staff</th><th>Status</th><th>Payment</th><th>Price</th></tr></thead>
                    <tbody>
                      {profile.serviceHistory.map(a => (
                        <tr key={a._id}>
                          <td>{a.date} {a.time}</td>
                          <td>{a.services.join(', ') || '—'}</td>
                          <td>{a.employeeName || '—'}</td>
                          <td><span className={`status ${a.status}`}>{a.status}</span></td>
                          <td>{a.paymentStatus}</td>
                          <td>R{decimalToFloat(a.totalPrice).toFixed(2)}</td>
                        </tr>
                      ))}
                      {!profile.serviceHistory.length && <tr><td colSpan="6" className="empty-row">No bookings yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'loyalty' && (
                <div className="table-responsive">
                  <table>
                    <thead><tr><th>Date</th><th>Type</th><th>Points</th><th>Reason</th></tr></thead>
                    <tbody>
                      {profile.loyalty.transactions.map(t => (
                        <tr key={t._id}>
                          <td>{fmtDateTime(t.createdAt)}</td>
                          <td>{t.type}</td>
                          <td style={{ color: t.type === 'redeem' ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                            {t.type === 'redeem' ? '-' : '+'}{Math.abs(t.points)}
                          </td>
                          <td>{t.reason}</td>
                        </tr>
                      ))}
                      {!profile.loyalty.transactions.length && <tr><td colSpan="4" className="empty-row">No loyalty activity yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'orders' && (
                <div className="table-responsive">
                  <table>
                    <thead><tr><th>Date</th><th>Order</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead>
                    <tbody>
                      {profile.orders.map(o => (
                        <tr key={o._id}>
                          <td>{fmtDate(o.createdAt)}</td>
                          <td>{String(o._id).slice(-8)}</td>
                          <td><span className="status">{o.status}</span></td>
                          <td>{o.paymentStatus}</td>
                          <td>R{decimalToFloat(o.totalAmount).toFixed(2)}</td>
                        </tr>
                      ))}
                      {!profile.orders.length && <tr><td colSpan="5" className="empty-row">No shop orders yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, accent, small, capitalize }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: small ? '0.85rem' : '1.15rem', fontWeight: 700, color: accent || '#1e293b', textTransform: capitalize ? 'capitalize' : 'none' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '0.4rem' }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
