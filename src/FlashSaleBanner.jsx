import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './FlashSaleBanner.css';

// ── Config — edit these to change the active promo ────────────────────────
const PROMO = {
  enabled:    false,
  code:       'BEAUTY10',
  message:    'Use code BEAUTY10 for 10% off your first order',
  cta:        'Shop Now',
  ctaLink:    '/shop',
  bgFrom:     '#3d1f15',
  bgTo:       '#6b3528',
  accent:     '#c9a96e',
  storageKey: 'nxl_flash_dismissed_v1',
};
// ─────────────────────────────────────────────────────────────────────────

export default function FlashSaleBanner() {
  const [visible, setVisible] = useState(false);
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    if (!PROMO.enabled) return;
    if (sessionStorage.getItem(PROMO.storageKey)) return;
    setVisible(true);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(PROMO.storageKey, '1');
    setVisible(false);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(PROMO.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!visible) return null;

  return (
    <div className="fsb-root" style={{ background: `linear-gradient(135deg, ${PROMO.bgFrom}, ${PROMO.bgTo})` }}>
      <div className="fsb-inner">
        <span className="fsb-icon">✨</span>
        <p className="fsb-message">{PROMO.message}</p>
        <button className="fsb-code" onClick={copyCode} title="Click to copy"
          style={{ borderColor: PROMO.accent, color: PROMO.accent }}>
          {PROMO.code}
          <span className="fsb-copy-hint">{copied ? '✓ Copied!' : 'Copy'}</span>
        </button>
        <Link to={PROMO.ctaLink} className="fsb-cta"
          style={{ background: PROMO.accent, color: PROMO.bgFrom }}>
          {PROMO.cta}
        </Link>
        <button className="fsb-close" onClick={dismiss} aria-label="Dismiss banner">✕</button>
      </div>
    </div>
  );
}