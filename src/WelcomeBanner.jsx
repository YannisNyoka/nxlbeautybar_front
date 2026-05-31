import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './WelcomeBanner.css';
import { trackBannerDismissed, trackBannerCTA } from './analytics';

const STORAGE_KEY = 'nxl_welcome_dismissed';
const RESHOW_DAYS = 7; // show again after 7 days

export default function WelcomeBanner() {
  const [visible, setVisible] = useState(false);
  const [hiding,  setHiding]  = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const daysSince = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (daysSince < RESHOW_DAYS) return;
    }
    // Show after a short delay so it doesn't clash with page load
    const t = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    trackBannerDismissed();
    setHiding(true);
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setTimeout(() => setVisible(false), 380);
  };

  if (!visible) return null;

  return (
    <div className={`wb-backdrop ${hiding ? 'wb-backdrop--out' : ''}`} onClick={dismiss}>
      <div
        className={`wb-card ${hiding ? 'wb-card--out' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button className="wb-close" onClick={dismiss} aria-label="Close">✕</button>

        {/* Badge */}
        <div className="wb-badge">✨ Welcome</div>

        {/* Headline */}
        <h2 className="wb-title">Beauty at Your Fingertips</h2>
        <p className="wb-sub">
          Book a nail appointment <strong>or</strong> shop professional beauty products — all in one place.
        </p>

        {/* Two CTAs */}
        <div className="wb-actions">
          <Link to="/login" className="wb-btn wb-btn--primary" onClick={() => { trackBannerCTA('Book Appointment'); dismiss(); }}>
            💅 Book Appointment
          </Link>
          <Link to="/shop" className="wb-btn wb-btn--secondary" onClick={() => { trackBannerCTA('Shop Products'); dismiss(); }}>
            🛍️ Shop Products
          </Link>
        </div>

        {/* Perks strip */}
        <div className="wb-perks">
          <span>🚚 Free delivery over R500</span>
          <span>🔒 Secure checkout</span>
          <span>⭐ 5-star rated</span>
        </div>

        {/* Dismiss link */}
        <button className="wb-skip" onClick={dismiss}>
          No thanks, continue browsing
        </button>
      </div>
    </div>
  );
}