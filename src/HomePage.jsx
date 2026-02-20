import { Link } from 'react-router-dom';
import { useState } from 'react';
import './HomePage.css';
import noxoloImage from './assets/images/Logo.jpeg';
import manicureImage from './assets/images/NxlPic5.jpg';
import pedicureImage from './assets/images/ToesImage.jpg';
import eyelashesImage from './assets/images/EyeLashesImage.jpg';

const SALON_ADDRESS = 'NXLBEAUTYBAR, 1948 Mahalefele Rd, Dube, Soweto, 1800';

function getUserLocationAndRedirect() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${encodeURIComponent(SALON_ADDRESS)}`, '_blank');
      },
      () => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SALON_ADDRESS)}`, '_blank')
    );
  } else {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SALON_ADDRESS)}`, '_blank');
  }
}

// Shared flip-card face style
const cardFaceStyle = {
  position: 'absolute',
  inset: 0,
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
  background: '#fff',
  borderRadius: '18px',
  boxShadow: '0 8px 32px rgba(61,31,21,0.12)',
  border: '1px solid #e0ccc4',
  padding: '1.6rem 1.2rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
};

const imgWrapStyle = {
  width: '110px',
  height: '110px',
  borderRadius: '50%',
  overflow: 'hidden',
  marginBottom: '1rem',
  border: '3px solid #e0ccc4',
  boxShadow: '0 4px 14px rgba(61,31,21,0.10)',
};

function ServiceCard({ label, desc, image, backItems, flipped, onFlip }) {
  return (
    <div
      className="service-card"
      style={{ cursor: 'pointer', perspective: '1000px' }}
      onClick={onFlip}
    >
      {/* Flip hint */}
      <div style={{ position: 'relative', height: '260px', transition: 'transform 0.55s', transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}>

        {/* Front */}
        <div style={cardFaceStyle}>
          <div style={imgWrapStyle}>
            <img src={image} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h3 style={{ marginBottom: '0.3rem' }}>{label}</h3>
          <p style={{ fontSize: '0.82rem', color: '#9e7060', textAlign: 'center', lineHeight: 1.5 }}>{desc}</p>
          <span className="hp-flip-hint">Tap to see options</span>
        </div>

        {/* Back */}
        <div style={{ ...cardFaceStyle, transform: 'rotateY(180deg)', justifyContent: 'flex-start', paddingTop: '2rem' }}>
          <h3 style={{ marginBottom: '0.8rem' }}>{label}</h3>
          <ul className="hp-card-back-list">
            {backItems.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          <span className="hp-flip-hint" style={{ marginTop: '1rem' }}>Tap to go back</span>
        </div>
      </div>
    </div>
  );
}

function HomePage() {
  const [flipped, setFlipped] = useState({ manicure: false, pedicure: false, lashes: false });
  const [policyOpen, setPolicyOpen] = useState(false);
  const isLoggedIn = !!localStorage.getItem('token');

  const flip = (key) => setFlipped(prev => ({ ...prev, [key]: !prev[key] }));

  const policyHighlights = new Set([0, 1, 5, 7, 10, 11, 12]);
  const policyItems = [
    'Check availability (date & time) on the App or WhatsApp for an appointment.',
    'Non-refundable deposit of R100 or full amount confirms appointment.',
    'Send proof of payment.',
    'Payment must reflect before appointment.',
    'No e-wallet or cash send — money to be deposited straight into account.',
    'NO KIDS ALLOWED AT THE SALON.',
    'No nail polish or extensions on nails unless soak off or buff off was included.',
    'If you have something on your nails, you will be charged full soak off price to remove them.',
    'WE STRICTLY WORK FROM 9AM TO 5PM. Appointments before/after will be charged R50 extra per person.',
    'R50 will be charged for every 15 minutes you are late.',
    '30 minutes late — your appointment will be cancelled.',
    'Cancellation only allowed 48 hours prior. Failure will incur a penalty fee of R100.',
    'NO CASH. NO PAYMENT, NO APPOINTMENT. NO REFUND.',
    'ONLY THE PERSON WITH AN APPOINTMENT WILL BE ALLOWED IN THE SALON.',
  ];

  return (
    <div className="home-container">

      {/* ---- Hero ---- */}
      <div className="hero-section">

        {/* Booking Policy Button — top right */}
        <div style={{ position: 'absolute', top: '1.5rem', right: '2rem', zIndex: 100 }}>
          <button
            className={`hp-policy-btn ${!policyOpen ? 'hp-glow' : ''}`}
            onClick={() => setPolicyOpen(o => !o)}
          >
            {policyOpen ? 'Hide Policy ▲' : 'Booking Policy ▼'}
          </button>

          {policyOpen && (
            <div className="hp-policy-panel">
              <h2>Booking Policy</h2>
              <p>Due to clients not arriving on time and cancelling last minute, we have put this policy in place:</p>
              <ul>
                {policyItems.map((item, i) => (
                  <li key={i} className={policyHighlights.has(i) ? 'hp-policy-highlight' : ''}>{item}</li>
                ))}
              </ul>

              <div className="hp-policy-banking">
                <h3>Banking Details</h3>
                <div className="hp-bank-value">6307553452</div>
                <div className="hp-bank-value">FNB (NXLBEAUTYBAR)</div>
              </div>

              <div className="hp-policy-social">
                <div><b>Instagram:</b> @nxlbeautybar</div>
                <div><b>TikTok:</b> @nxlbeautybar</div>
                <div><b>Facebook:</b> nxlbeautybar</div>
              </div>

              <button className="hp-policy-close-btn" onClick={() => setPolicyOpen(false)}>
                Close ✕
              </button>
            </div>
          )}
        </div>

        {/* Title */}
        <h1>NXL Beauty Bar</h1>
        <p>Luxury Nail Studio</p>

        {/* Artist Image */}
        <div className="nail-artist-section">
          <div className="nail-text">
            <div className="artist-image">
              <img src={noxoloImage} alt="NXL Nail Artist" />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="location-bar" onClick={getUserLocationAndRedirect} role="button" tabIndex={0}>
          <span className="location-icon">📍</span>
          <span className="location-text">Johannesburg, Soweto</span>
        </div>
      </div>

      {/* ---- About ---- */}
      <div className="about-section">
        <h2 className="section-title">Say hello to your nail artist</h2>
        <div className="about-content">
          <p>
            Welcome to NXL Beauty Bar! We are passionate about creating beautiful,
            long-lasting nails and lashes that make you feel confident and radiant.
            With years of experience in the beauty industry, we specialise in all kinds
            of manicures, pedicures, and eyelash extensions. Every client receives
            personalised attention and care to ensure the perfect result — to your satisfaction.
          </p>
        </div>
      </div>

      {/* ---- Services ---- */}
      <div className="services-preview">
        <h2 className="section-title">Our Services</h2>
        <div className="services-grid">
          <ServiceCard
            label="Manicure"
            desc="Long-lasting, chip-resistant polish"
            image={manicureImage}
            backItems={['Rubberbase', 'Acrylic', 'Polygel', 'Shellac', 'Dip']}
            flipped={flipped.manicure}
            onFlip={() => flip('manicure')}
          />
          <ServiceCard
            label="Pedicure"
            desc="Custom designs and treatments"
            image={pedicureImage}
            backItems={['Classic Pedicure', 'Basic Pedicure', 'Acrylic Pedi', 'French Pedi', 'Spa Pedi']}
            flipped={flipped.pedicure}
            onFlip={() => flip('pedicure')}
          />
          <ServiceCard
            label="Eye Lashes"
            desc="Professional extensions"
            image={eyelashesImage}
            backItems={['Classic Set', 'Volume Set', 'Hybrid']}
            flipped={flipped.lashes}
            onFlip={() => flip('lashes')}
          />
        </div>
      </div>

      {/* ---- CTA ---- */}
      <div className="navigation-section">
        <h2 className="section-title">Ready to Book?</h2>
        <div className="navigation-links">
          <Link to="/signup" className="nav-link primary">Create Account</Link>
          <Link to="/login" className="nav-link secondary">Sign In</Link>
          {isLoggedIn && (
            <Link to="/dashboard" className="nav-link secondary">Dashboard</Link>
          )}
        </div>
      </div>

      {/* ---- Social / Contact ---- */}
      <div className="contact-info">
        <div className="contact-item">
          <span className="contact-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <rect x="1" y="1" width="22" height="22" rx="5" fill="#1877F2"/>
              <path d="M13.2 9.3h1.8V6.8h-1.8c-1.9 0-3.1 1.2-3.1 3.1v1.6H9.1v2.5h1.9v6h2.8v-6h2l.5-2.5h-2.5V9.9c0-.4.2-.6.9-.6z" fill="#fff"/>
            </svg>
          </span>
          <a href="https://www.facebook.com/share/17g73Pcr9j/" target="_blank" rel="noopener noreferrer">Facebook</a>
        </div>

        <div className="contact-item">
          <span className="contact-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <defs>
                <linearGradient id="igGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f58529"/>
                  <stop offset="50%" stopColor="#dd2a7b"/>
                  <stop offset="100%" stopColor="#8134af"/>
                </linearGradient>
              </defs>
              <rect x="1" y="1" width="22" height="22" rx="5" fill="url(#igGrad)"/>
              <rect x="7" y="7" width="10" height="10" rx="5" fill="none" stroke="#fff" strokeWidth="2"/>
              <circle cx="16.5" cy="7.5" r="1.3" fill="#fff"/>
            </svg>
          </span>
          <a href="https://www.instagram.com/nxlbeauty?igsh=Z2tnOTl0OXdmdmxz" target="_blank" rel="noopener noreferrer">Instagram</a>
        </div>

        <div className="contact-item">
          <span className="contact-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <rect x="1" y="1" width="22" height="22" rx="5" fill="#000"/>
              <path d="M9 7.5c1.7 0 3.2.9 4.1 2.3v6.7h-2v-4.2c-.6-.4-1.4-.6-2.1-.6-1.9 0-3.5 1.2-3.5 3.1 0 1.6 1.2 2.9 2.8 3.1-2.2-.2-4-2.1-4-4.4 0-2.5 2.1-4.4 4.7-4.4zM15 7.2c.7.3 1.3.8 1.8 1.4v6.9h-1.8V7.2z" fill="#fff"/>
            </svg>
          </span>
          <a href="https://www.tiktok.com/@nxlbeautybar?_r=1&_t=ZS-91Q3zPzMphH" target="_blank" rel="noopener noreferrer">TikTok</a>
        </div>
      </div>

    </div>
  );
}

export default HomePage;