import { useState, useEffect } from 'react';
import './LoyaltyWidget.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const TIER_CONFIG = {
  bronze:   { label: 'Bronze',   color: '#c97c2e', bg: '#fff8f0', icon: '🥉', next: 500,  nextLabel: 'Silver' },
  silver:   { label: 'Silver',   color: '#94a3b8', bg: '#f8fafc', icon: '🥈', next: 2000, nextLabel: 'Gold'   },
  gold:     { label: 'Gold',     color: '#d97706', bg: '#fffbeb', icon: '🥇', next: 5000, nextLabel: 'Platinum' },
  platinum: { label: 'Platinum', color: '#6366f1', bg: '#eef2ff', icon: '💎', next: null,  nextLabel: null     },
};

export default function LoyaltyWidget({ activeTab = 'loyalty' }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [showTxns, setShowTxns] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError('');
    fetch(`${API_BASE_URL}/loyalty/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); else setError(d.error); })
      .catch(() => setError('Could not load loyalty data.'))
      .finally(() => setLoading(false));
  }, [activeTab]); // Refetch whenever activeTab changes

  if (loading) return <div className="lw-skeleton" />;
  if (error || !data) return null;

  const tier   = TIER_CONFIG[data.tier] || TIER_CONFIG.bronze;
  const pct    = tier.next
    ? Math.min(100, Math.round((data.totalEarned / tier.next) * 100))
    : 100;

  return (
    <div className="lw-root">
      {/* Header */}
      <div className="lw-header" style={{ background: tier.bg, borderColor: tier.color + '44' }}>
        <div className="lw-tier-badge" style={{ background: tier.color }}>
          {tier.icon} {tier.label}
        </div>
        <div className="lw-points-display">
          <span className="lw-pts-num">{data.points.toLocaleString()}</span>
          <span className="lw-pts-label">points</span>
        </div>
        <p className="lw-rand-value">≈ <strong>R{parseFloat(data.randValue).toFixed(2)}</strong> in discounts</p>
      </div>

      {/* Progress to next tier */}
      {tier.next && (
        <div className="lw-progress-section">
          <div className="lw-progress-labels">
            <span>{tier.label}</span>
            <span>{tier.nextLabel} at {tier.next.toLocaleString()} pts</span>
          </div>
          <div className="lw-progress-bar">
            <div className="lw-progress-fill" style={{ width: `${pct}%`, background: tier.color }} />
          </div>
          <p className="lw-progress-note">
            {tier.next - data.totalEarned > 0
              ? `${(tier.next - data.totalEarned).toLocaleString()} more points to ${tier.nextLabel}`
              : `You've reached ${tier.label}!`}
          </p>
        </div>
      )}

      {/* How to earn */}
      <div className="lw-how-to">
        <p className="lw-how-title">How to earn points</p>
        <div className="lw-earn-items">
          <div className="lw-earn-item"><span>💅</span><span>1 pt per R1 spent on bookings</span></div>
          <div className="lw-earn-item"><span>🎁</span><span>Refer a friend — earn 200 pts when they book</span></div>
        </div>
        <p className="lw-redeem-note">Redeem at checkout — 100 points = R10 discount</p>
      </div>

      {/* Transaction history toggle */}
      {data.transactions?.length > 0 && (
        <div className="lw-txns">
          <button className="lw-txns-toggle" onClick={() => setShowTxns(v => !v)}>
            {showTxns ? '▲ Hide' : '▼ Show'} transaction history ({data.transactions.length})
          </button>
          {showTxns && (
            <div className="lw-txns-list">
              {data.transactions.map((t, i) => (
                <div key={i} className={`lw-txn ${t.points > 0 ? 'earn' : 'redeem'}`}>
                  <span className="lw-txn-reason">{t.reason}</span>
                  <div className="lw-txn-right">
                    <span className="lw-txn-pts">{t.points > 0 ? '+' : ''}{t.points} pts</span>
                    <span className="lw-txn-date">
                      {new Date(t.createdAt).toLocaleDateString('en-ZA', { day:'numeric', month:'short' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}