import { useState, useEffect } from 'react';
import './ReferralWidget.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export default function ReferralWidget() {
  const [data,     setData]    = useState(null);
  const [loading,  setLoading] = useState(true);
  const [copied,   setCopied]  = useState(false);
  const [shareTab, setShareTab]= useState('link');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE_URL}/referrals/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="rw-skeleton" />;
  if (!data) return null;

  const { referralCode, referralUrl, stats, config, referrals } = data;

  const copyLink = () => {
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const shareWhatsApp = () => {
    const text = `Hey! I love NXL Beauty Bar 💅 Use my referral link to sign up and get R${config.refereeDiscount} off your first order: ${referralUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareInstagram = () => {
    copyLink();
    window.open('https://www.instagram.com/', '_blank');
  };

  const STATUS_STYLE = {
    signed_up: { bg:'#fffbeb', color:'#92400e', border:'#fde68a', label:'Signed Up ⏳' },
    rewarded:  { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0', label:'Rewarded ✅'  },
    pending:   { bg:'#f8fafc', color:'#64748b', border:'#e2e8f0', label:'Pending'      },
  };

  return (
    <div className="rw-root">

      {/* Header */}
      <div className="rw-header">
        <div className="rw-header-text">
          <h2 className="rw-title">Refer Friends, Earn Points 🎁</h2>
          <p className="rw-subtitle">
            Share your link — your friend gets <strong>R{config.refereeDiscount} off</strong> their first order,
            you earn <strong>{config.referrerPoints} points</strong> when they book.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="rw-stats">
        {[
          { icon:'👥', label:'Total Referrals',    value: stats.totalReferrals     },
          { icon:'⏳', label:'Signed Up',           value: stats.pendingReferrals   },
          { icon:'✅', label:'Rewarded',            value: stats.completedReferrals },
          { icon:'⭐', label:'Points Earned',       value: stats.totalPointsEarned  },
        ].map((s, i) => (
          <div key={i} className="rw-stat">
            <span className="rw-stat-icon">{s.icon}</span>
            <span className="rw-stat-value">{s.value}</span>
            <span className="rw-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Your code */}
      <div className="rw-code-section">
        <p className="rw-code-label">Your referral code</p>
        <div className="rw-code-display">
          <span className="rw-code">{referralCode}</span>
          <button className="rw-copy-code" onClick={copyLink} title="Copy code">
            {copied ? '✓' : '📋'}
          </button>
        </div>
      </div>

      {/* Share options */}
      <div className="rw-share-section">
        <p className="rw-share-label">Share your link</p>

        {/* Link copy */}
        <div className="rw-link-row">
          <input readOnly value={referralUrl} className="rw-link-input" onClick={e => e.target.select()} />
          <button className={`rw-copy-btn ${copied ? 'copied' : ''}`} onClick={copyLink}>
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>

        {/* Share buttons */}
        <div className="rw-share-btns">
          <button className="rw-share-wa" onClick={shareWhatsApp}>
            <span>💬</span> Share via WhatsApp
          </button>
          <button className="rw-share-ig" onClick={shareInstagram}>
            <span>📸</span> Copy for Instagram
          </button>
        </div>

        {/* SMS share text preview */}
        <div className="rw-message-preview">
          <p className="rw-message-label">Or copy this message:</p>
          <div className="rw-message-text">
            Hey! I love NXL Beauty Bar 💅 Use my referral link to sign up and get R{config.refereeDiscount} off your first order: <strong>{referralUrl}</strong>
          </div>
          <button className="rw-copy-msg-btn" onClick={() => {
            navigator.clipboard.writeText(
              `Hey! I love NXL Beauty Bar 💅 Use my referral link to sign up and get R${config.refereeDiscount} off your first order: ${referralUrl}`
            );
            setCopied(true); setTimeout(() => setCopied(false), 2000);
          }}>
            {copied ? '✓ Copied' : 'Copy Message'}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="rw-how">
        <p className="rw-how-title">How it works</p>
        <div className="rw-steps">
          <div className="rw-step">
            <div className="rw-step-num">1</div>
            <div>
              <p className="rw-step-title">Share your link</p>
              <p className="rw-step-desc">Send it to friends via WhatsApp, Instagram or SMS</p>
            </div>
          </div>
          <div className="rw-step">
            <div className="rw-step-num">2</div>
            <div>
              <p className="rw-step-title">Friend signs up</p>
              <p className="rw-step-desc">They get a <strong>R{config.refereeDiscount} discount code</strong> instantly</p>
            </div>
          </div>
          <div className="rw-step">
            <div className="rw-step-num">3</div>
            <div>
              <p className="rw-step-title">You earn points</p>
              <p className="rw-step-desc"><strong>{config.signupBonus} pts</strong> when they sign up + <strong>{config.referrerPoints} pts</strong> when they book</p>
            </div>
          </div>
        </div>
      </div>

      {/* Referral history */}
      {referrals.length > 0 && (
        <div className="rw-history">
          <p className="rw-history-title">Your Referrals</p>
          <div className="rw-history-list">
            {referrals.map((r, i) => {
              const ss = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
              return (
                <div key={i} className="rw-history-item">
                  <div className="rw-history-avatar">{(r.refereeName || 'F')[0].toUpperCase()}</div>
                  <div className="rw-history-info">
                    <p className="rw-history-name">{r.refereeName}</p>
                    <p className="rw-history-date">{new Date(r.createdAt).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' })}</p>
                  </div>
                  <div className="rw-history-right">
                    <span className="rw-status-badge" style={{ background:ss.bg, color:ss.color, borderColor:ss.border }}>{ss.label}</span>
                    {r.pointsAwarded > 0 && <span className="rw-pts-earned">+{r.pointsAwarded} pts</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}