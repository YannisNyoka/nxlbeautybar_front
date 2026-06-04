import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import './HomePage.css';
import noxoloImage    from './assets/images/Logo.jpeg';
import manicureImage  from './assets/images/NxlPic5.jpg';
import pedicureImage  from './assets/images/ToesImage.jpg';
import eyelashesImage from './assets/images/EyeLashesImage.jpg';
import nxlDesignBg    from './assets/images/nxl_design1.jpeg';
import { useSEO, LOCAL_BUSINESS_SCHEMA } from './useSEO';
import NotificationBell from './NotificationBell';

const SALON_ADDRESS = 'NXLBEAUTYBAR, 1948 Mahalefele Rd, Dube, Soweto, 1800';

function useCartCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const read = () => {
      try {
        const items = JSON.parse(localStorage.getItem('nxl_cart') || '[]');
        setCount(items.reduce((s, i) => s + (i.quantity || 0), 0));
      } catch { setCount(0); }
    };
    read();
    window.addEventListener('storage', read);
    const t = setInterval(read, 2000);
    return () => { window.removeEventListener('storage', read); clearInterval(t); };
  }, []);
  return count;
}

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const h = () => setY(window.scrollY);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  return y;
}

function getDirections() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) =>
        window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${encodeURIComponent(SALON_ADDRESS)}`, '_blank'),
      () => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SALON_ADDRESS)}`, '_blank')
    );
  } else {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SALON_ADDRESS)}`, '_blank');
  }
}

// ── Service flip card ──────────────────────────────────────────────────────
function ServiceCard({ label, desc, image, backItems, flipped, onFlip }) {
  return (
    <div className="hp-service-card" onClick={onFlip} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onFlip()}>
      <div className={`hp-service-inner ${flipped ? 'hp-flipped' : ''}`}>
        <div className="hp-service-face hp-service-front">
          <div className="hp-service-img">
            <img src={image} alt={label} />
          </div>
          <h3>{label}</h3>
          <p>{desc}</p>
          <span className="hp-service-hint">Tap to see options ↓</span>
        </div>
        <div className="hp-service-face hp-service-back">
          <h3>{label}</h3>
          <ul>
            {backItems.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          <span className="hp-service-hint">↑ Tap to go back</span>
        </div>
      </div>
    </div>
  );
}

// ── Gallery ────────────────────────────────────────────────────────────────
function GallerySection({ apiBase }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const trackRef = useRef(null);

  useEffect(() => {
    fetch(`${apiBase}/gallery`)
      .then(r => r.json())
      .then(d => { if (d.success) setItems(d.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase]);

  if (loading) return <div className="hp-gallery-loading">Loading gallery…</div>;
  if (!items.length) return null;

  return (
    <section className="hp-gallery-section" id="hp-our-work">
      <div className="hp-section-label">Our Work</div>
      <h2 className="hp-section-title">Real Clients. Real Results.</h2>
      <p className="hp-section-sub">Swipe to explore our portfolio</p>

      {lightbox && (
        <div className="hp-lightbox" onClick={() => setLightbox(null)}>
          <div className="hp-lightbox-card" onClick={e => e.stopPropagation()}>
            {lightbox.imageUrl.match(/\.(mp4|webm|mov)$/i)
              ? <video src={lightbox.imageUrl} controls autoPlay className="hp-lightbox-media" />
              : <img src={lightbox.imageUrl} alt={lightbox.clientName} className="hp-lightbox-media" />
            }
            <div className="hp-lightbox-info">
              {lightbox.clientName && <strong>{lightbox.clientName}</strong>}
              {lightbox.caption && <span>{lightbox.caption}</span>}
            </div>
            <button className="hp-lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          </div>
        </div>
      )}

      <div className="hp-gallery-track" ref={trackRef}
        onMouseDown={e => {
          const el = trackRef.current; el.style.cursor = 'grabbing';
          const startX = e.pageX - el.offsetLeft; const sl = el.scrollLeft;
          const onMove = ev => { el.scrollLeft = sl - (ev.pageX - el.offsetLeft - startX); };
          const onUp = () => { el.style.cursor = 'grab'; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
          window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        }}
      >
        {items.map(item => (
          <div key={item._id} className="hp-gallery-item" onClick={() => setLightbox(item)}>
            {item.imageUrl.match(/\.(mp4|webm|mov)$/i)
              ? <div className="hp-gallery-video"><video src={item.imageUrl} muted /><span className="hp-play">▶</span></div>
              : <img src={item.imageUrl} alt={item.clientName || 'Gallery'} />
            }
            <div className="hp-gallery-caption">
              {item.clientName && <strong>{item.clientName}</strong>}
              {item.caption && <span>{item.caption}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="hp-gallery-scroll-hint">← swipe to see more →</p>
    </section>
  );
}

// ── Stats bar ──────────────────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { value: '500+', label: 'Happy Clients' },
    { value: '5★',   label: 'Rating' },
    { value: '7+',   label: 'Years Experience' },
    { value: '20+',  label: 'Services' },
  ];
  return (
    <div className="hp-stats-bar">
      {stats.map((s, i) => (
        <div key={i} className="hp-stat">
          <span className="hp-stat-value">{s.value}</span>
          <span className="hp-stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Shop CTA ───────────────────────────────────────────────────────────────
function ShopCTA() {
  return (
    <section className="hp-shop-cta">
      <div className="hp-shop-cta-inner">
        <div className="hp-shop-cta-text">
          <span className="hp-shop-eyebrow"> Now Online</span>
          <h2>Shop Professional<br />Beauty Products</h2>
          <p>The same products we use in salon — delivered to your door. Free shipping on orders over <strong>R500</strong>.</p>
          <div className="hp-shop-cta-pills">
            <span> Nail Products</span>
            <span> Hair Care</span>
            <span>🌿 Skincare</span>
            <span>💎 Accessories</span>
          </div>
          <div className="hp-shop-cta-btns">
            <Link to="/shop" className="hp-shop-cta-primary">Browse Products →</Link>
            <Link to="/cart" className="hp-shop-cta-outline">🛒 View Cart</Link>
          </div>
        </div>
        <div className="hp-shop-cta-visual" aria-hidden="true">
          <div className="hp-shop-orb hp-orb1" />
          <div className="hp-shop-orb hp-orb2" />
          <div className="hp-shop-card-float hp-float1"><span></span><p>Gel &amp; Acrylic</p></div>
          <div className="hp-shop-card-float hp-float2"><span>🌿</span><p>Skincare</p></div>
          <div className="hp-shop-card-float hp-float3"><span>🚚</span><p>Free over R500</p></div>
        </div>
      </div>
    </section>
  );
}

// ── Booking CTA ────────────────────────────────────────────────────────────
function BookingCTA() {
  const isLoggedIn = !!localStorage.getItem('token');
  return (
    <section className="hp-booking-cta">
      <div className="hp-booking-cta-inner">
        <h2>Ready for Your Next Look?</h2>
        <p>Book your appointment online in minutes. We're open Mon–Sat, 9AM–5PM.</p>
        <div className="hp-booking-cta-btns">
          {isLoggedIn
            ? <Link to="/dashboard" className="hp-book-btn-primary">Book Appointment →</Link>
            : <>
                <Link to="/signup" className="hp-book-btn-primary">Create Account &amp; Book</Link>
                <Link to="/login" className="hp-book-btn-outline">Sign In</Link>
              </>
          }
        </div>
        <div className="hp-booking-meta">
          <span>📍 1948 Mahalefele Rd, Dube, Soweto</span>
          <span>📞 068 511 3394</span>
          <span>🕐 Tue–Sun 9AM–5PM</span>
        </div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="hp-footer">
      <div className="hp-footer-inner">
        <div className="hp-footer-brand">
          <h3>NXL Beauty Bar</h3>
          <p>Professional beauty services &amp; products in the heart of Soweto.</p>
          <div className="hp-footer-socials">
            <a href="https://wa.me/27685113394" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
              <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" fill="currentColor"/></svg>
            </a>
            <a href="https://www.instagram.com/nxlbeauty" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>
            </a>
            <a href="https://www.facebook.com/share/17g73Pcr9j/" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
            <a href="https://www.tiktok.com/@nxlbeautybar" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
              <svg viewBox="0 0 24 24"><path d="M9 12a4 4 0 104 4V4a5 5 0 005 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
          </div>
        </div>
        <div className="hp-footer-links">
          <h4>Quick Links</h4>
          <Link to="/shop">Shop Products</Link>
          <Link to="/login">Book Appointment</Link>
          <Link to="/signup">Create Account</Link>
          <Link to="/orders">My Orders</Link>
          <Link to="/dashboard">My Bookings</Link>
        </div>
        <div className="hp-footer-contact">
          <h4>Contact</h4>
          <p>📍 1948 Mahalefele Rd<br />Dube, Soweto, 1800</p>
          <p>📞 <a href="tel:+27685113394">068 511 3394</a></p>
          <p>✉️ <a href="mailto:nxlbeautybar@gmail.com">nxlbeautybar@gmail.com</a></p>
          <button className="hp-footer-directions" onClick={getDirections}>Get Directions →</button>
        </div>
      </div>
      <div className="hp-footer-bottom">
        <p>© {new Date().getFullYear()} NXL Beauty Bar. All rights reserved.</p>
        <p>Built with ❤️ in Soweto, South Africa</p>
      </div>
    </footer>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function HomePage() {
  const [flipped,  setFlipped]  = useState({ manicure: false, pedicure: false, lashes: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollY   = useScrollY();
  const cartCount = useCartCount();
  const isLoggedIn = !!localStorage.getItem('token');

  useSEO({
    title:       'NXL Beauty Bar — Nails, Hair & Beauty in Soweto',
    description: 'Book professional nail, hair and beauty services at NXL Beauty Bar in Dube, Soweto. Acrylic nails, gel polish, pedicures, lash extensions & more. Shop beauty products online.',
    url:         '/',
    schema:      LOCAL_BUSINESS_SCHEMA,
  });
  const flip = key => setFlipped(p => ({ ...p, [key]: !p[key] }));

  const scrollTo = id => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const navScrolled = scrollY > 60;

  return (
    <div className="hp-root">

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className={`hp-nav ${navScrolled ? 'hp-nav--scrolled' : ''}`}>
        <div className="hp-nav-inner">
          <div className="hp-nav-brand">
            <img src={noxoloImage} alt="NXL Beauty Bar" className="hp-nav-logo" />
            <span>NXL Beauty Bar</span>
          </div>

          <div className="hp-nav-links">
            <button onClick={() => scrollTo('hp-hero')}>Home</button>
            <button onClick={() => scrollTo('hp-our-work')}>Gallery</button>
            <button onClick={() => scrollTo('hp-services')}>Services</button>
            <Link to="/shop" className="hp-nav-shop">🛍️ Shop</Link>
            <Link to="/subscriptions" className="hp-nav-shop">💅 Plans</Link>
            <button onClick={() => scrollTo('hp-contact')}>Contact</button>
          </div>

          <div className="hp-nav-actions">
            <Link to="/cart" className="hp-nav-cart">
              🛒
              {cartCount > 0 && <span className="hp-nav-cart-badge">{cartCount}</span>}
            </Link>
            {isLoggedIn && <NotificationBell />}
            {isLoggedIn
              ? <Link to="/dashboard" className="hp-nav-cta">My Bookings</Link>
              : <Link to="/login"    className="hp-nav-cta">Book Now</Link>
            }
            <button className="hp-nav-burger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
              <span /><span /><span />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="hp-nav-mobile">
            <button onClick={() => scrollTo('hp-hero')}>Home</button>
            <button onClick={() => scrollTo('hp-our-work')}>Gallery</button>
            <button onClick={() => scrollTo('hp-services')}>Services</button>
            <Link to="/shop"      onClick={() => setMenuOpen(false)}>🛍️ Shop</Link>
            <Link to="/cart"      onClick={() => setMenuOpen(false)}>🛒 Cart {cartCount > 0 && `(${cartCount})`}</Link>
            <Link to="/orders"    onClick={() => setMenuOpen(false)}>My Orders</Link>
            {isLoggedIn
              ? <Link to="/dashboard"    onClick={() => setMenuOpen(false)}>My Bookings</Link>
              : <>
                  <Link to="/login"  onClick={() => setMenuOpen(false)}>Sign In</Link>
                  <Link to="/signup" onClick={() => setMenuOpen(false)}>Create Account</Link>
                </>
            }
            <button onClick={() => scrollTo('hp-contact')}>Contact</button>
          </div>
        )}
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section id="hp-hero" className="hp-hero">
        <div className="hp-hero-bg">
          <img src={nxlDesignBg} alt="" />
          <div className="hp-hero-overlay" />
        </div>
        <div className="hp-hero-content">
          <span className="hp-hero-eyebrow">Dube, Soweto · Est. 2019</span>
          <h1 className="hp-hero-title">
            
          </h1>
          <p className="hp-hero-tagline">Nails · Hair · Beauty · Confidence</p>
          <div className="hp-hero-cta">
            <Link to="/login"  className="hp-hero-btn-primary">Book Appointment</Link>
            <Link to="/shop"   className="hp-hero-btn-outline">Shop Products</Link>
          </div>
          <button className="hp-hero-location" onClick={getDirections}>
            <span>📍</span> 
          </button>
        </div>
        
        
      </section>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <StatsBar />

      {/* ── Gallery ─────────────────────────────────────────────────────── */}
      <GallerySection apiBase={import.meta.env.VITE_API_BASE_URL || ''} />

      {/* ── Services ────────────────────────────────────────────────────── */}
      <section id="hp-services" className="hp-services">
        <div className="hp-section-label">What We Do</div>
        <h2 className="hp-section-title">Our Services</h2>
        <p className="hp-section-sub">Click a card to see available styles</p>
        <div className="hp-services-grid">
          <ServiceCard label="Manicure"   desc="Long-lasting, chip-resistant polish"  image={manicureImage}  backItems={['Rubberbase', 'Acrylic', 'Polygel']}        flipped={flipped.manicure} onFlip={() => flip('manicure')} />
          <ServiceCard label="Pedicure"   desc="Custom designs and treatments"        image={pedicureImage}  backItems={['Rubberbase', 'Polygel', 'Gelish']}         flipped={flipped.pedicure} onFlip={() => flip('pedicure')} />
          <ServiceCard label="Eye Lashes" desc="Professional lash extensions"         image={eyelashesImage} backItems={['Classic Set', 'Volume Set', 'Hybrid Set']} flipped={flipped.lashes}   onFlip={() => flip('lashes')} />
        </div>
        <div className="hp-services-cta">
          <Link to="/login" className="hp-services-book-btn">Book a Service →</Link>
        </div>
      </section>

      {/* ── Shop CTA ────────────────────────────────────────────────────── */}
      <ShopCTA />

      {/* ── Booking CTA ─────────────────────────────────────────────────── */}
      <BookingCTA />

      {/* ── Contact / Social ────────────────────────────────────────────── */}
      <section id="hp-contact" className="hp-contact-section">
        <div className="hp-section-label">Find Us</div>
        <h2 className="hp-section-title">Get in Touch</h2>
        <div className="hp-contact-grid">
          <div className="hp-contact-card">
            <span>📍</span>
            <h4>Location</h4>
            <p>1948 Mahalefele Rd<br />Dube, Soweto, 1800</p>
            <button onClick={getDirections}>Get Directions →</button>
          </div>
          <div className="hp-contact-card">
            <span>🕐</span>
            <h4>Hours</h4>
            <p>Tuesday – Sunday<br />9:00 AM – 5:00 PM</p>
            <Link to="/login">Book Now →</Link>
          </div>
          <div className="hp-contact-card">
            <span>📞</span>
            <h4>Call or WhatsApp</h4>
            <p>068 511 3394</p>
            <a href="https://wa.me/27685113394" target="_blank" rel="noopener noreferrer">WhatsApp Us →</a>
          </div>
          <div className="hp-contact-card">
            <span>✉️</span>
            <h4>Email</h4>
            <p>nxlbeautybar@gmail.com</p>
            <a href="mailto:nxlbeautybar@gmail.com">Send Email →</a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <Footer />

    </div>
  );
}