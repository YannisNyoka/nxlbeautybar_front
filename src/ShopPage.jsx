import nxlLogo from './assets/images/Logo.jpeg';
import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCart } from './hooks/useCart';
import './ShopPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const CATEGORIES = [
  { id: 'all',          label: 'All Products', emoji: '' },
  { id: 'nails',        label: 'Nails',        emoji: '' },
  { id: 'hair',         label: 'Hair',         emoji: '' },
  { id: 'skincare',     label: 'Skincare',     emoji: '🌿' },
  { id: 'accessories',  label: 'Accessories',  emoji: '💎' },
  { id: 'professional', label: 'Professional', emoji: '🛠️' },
];

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest First' },
  { value: 'price-asc',  label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'featured',   label: 'Featured' },
];

function StarRating({ rating, count }) {
  return (
    <div className="sp-stars">
      {[1,2,3,4,5].map(s => (
        <span key={s} className={s <= Math.round(rating) ? 'sp-star filled' : 'sp-star'}>★</span>
      ))}
      {count > 0 && <span className="sp-review-count">({count})</span>}
    </div>
  );
}

function ProductCard({ product }) {
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const discount = product.comparePrice && product.comparePrice > product.price
    ? Math.round((1 - product.price / product.comparePrice) * 100)
    : null;

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAdding(true);
    addItem(product);
    setTimeout(() => setAdding(false), 1000);
  };

  return (
    <Link to={`/shop/product/${product._id}`} className="sp-card">
      <div className="sp-card-img-wrap">
        {product.images?.[0]
          ? <img src={product.images[0]} alt={product.name} className="sp-card-img" loading="lazy" />
          : <div className="sp-card-img-placeholder">💅</div>
        }
        {discount && <span className="sp-card-badge">−{discount}%</span>}
        {product.stock <= 5 && product.stock > 0 && (
          <span className="sp-card-badge sp-badge-low">Only {product.stock} left</span>
        )}
        {product.stock === 0 && <span className="sp-card-badge sp-badge-out">Sold Out</span>}
        {product.isFeatured && <span className="sp-card-badge sp-badge-featured">★ Featured</span>}
      </div>

      <div className="sp-card-body">
        {product.brand && <p className="sp-card-brand">{product.brand}</p>}
        <h3 className="sp-card-name">{product.name}</h3>
        <StarRating rating={product.rating || 0} count={product.reviewCount || 0} />
        <div className="sp-card-price-row">
          <span className="sp-card-price">R{parseFloat(product.price).toFixed(2)}</span>
          {product.comparePrice && <span className="sp-card-compare">R{parseFloat(product.comparePrice).toFixed(2)}</span>}
        </div>
        <button
          className={`sp-card-btn ${adding ? 'sp-card-btn--added' : ''}`}
          onClick={handleAddToCart}
          disabled={product.stock === 0 || adding}
        >
          {product.stock === 0 ? 'Sold Out' : adding ? '✓ Added!' : 'Add to Cart'}
        </button>
      </div>
    </Link>
  );
}

export default function ShopPage() {
  const { itemCount } = useCart();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts]   = useState([]);
  const [featured, setFeatured]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pages, setPages]         = useState(1);

  const category = searchParams.get('category') || 'all';
  const search   = searchParams.get('search')   || '';
  const sort     = searchParams.get('sort')     || 'newest';
  const [searchInput, setSearchInput] = useState(search);

  const fetchProducts = useCallback(async (cat, srch, srt, pg) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: srt, page: pg, limit: 12 });
      if (cat && cat !== 'all') params.set('category', cat);
      if (srch) params.set('search', srch);
      const res  = await fetch(`${API_BASE_URL}/shop/products?${params}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
        setTotal(data.total);
        setPages(data.pages);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetchFeatured = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/shop/products/featured`);
      const data = await res.json();
      if (data.success) setFeatured(data.data.slice(0, 4));
    } catch {}
  }, []);

  useEffect(() => { fetchFeatured(); }, [fetchFeatured]);
  useEffect(() => {
    setPage(1);
    fetchProducts(category, search, sort, 1);
  }, [category, search, sort, fetchProducts]);

  const setParam = (key, val) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val); else next.delete(key);
    setSearchParams(next);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setParam('search', searchInput.trim());
  };

  const goPage = (p) => {
    setPage(p);
    fetchProducts(category, search, sort, p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="sp-root">
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <header className="sp-topbar">
        <Link to="/" className="sp-topbar-logo"><img src={nxlLogo} alt="" className="sp-topbar-logo-img" /><span>NXL Beauty Bar</span></Link>
        <nav className="sp-topbar-nav">
          <Link to="/">Home</Link>
          <Link to="/shop" className="sp-topbar-nav--active">Shop</Link>
          <Link to="/dashboard">My Bookings</Link>
          <Link to="/orders">My Orders</Link>
        </nav>
        <Link to="/cart" className="sp-topbar-cart">
          🛒
          {itemCount > 0 && <span className="sp-cart-badge">{itemCount}</span>}
        </Link>
      </header>

      {/* ── Hero Banner ─────────────────────────────────────── */}
      <section className="sp-hero">
        <div className="sp-hero-content">
          <p className="sp-hero-eyebrow">NXL Beauty Bar</p>
          <h1 className="sp-hero-title">Beauty, Delivered<br/>to Your Door</h1>
          <p className="sp-hero-sub">Professional-grade products for nails, hair, skincare & more</p>
          <form onSubmit={handleSearch} className="sp-hero-search">
            <input
              type="text"
              placeholder="Search products…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>
        </div>
        <div className="sp-hero-graphic">
          <div className="sp-hero-orb sp-orb1" />
          <div className="sp-hero-orb sp-orb2" />
          <div className="sp-hero-orb sp-orb3" />
        </div>
      </section>

      {/* ── Featured Products ────────────────────────────────── */}
      {featured.length > 0 && category === 'all' && !search && (
        <section className="sp-featured">
          <div className="sp-section-head">
            <h2>Featured Products</h2>
            <span className="sp-section-line" />
          </div>
          <div className="sp-featured-grid">
            {featured.map(p => <ProductCard key={p._id} product={p} />)}
          </div>
        </section>
      )}

      {/* ── Main Shop ────────────────────────────────────────── */}
      <section className="sp-main">
        {/* Category Pills */}
        <div className="sp-categories">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              className={`sp-cat-pill ${category === c.id ? 'sp-cat-pill--active' : ''}`}
              onClick={() => setParam('category', c.id === 'all' ? '' : c.id)}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="sp-toolbar">
          <p className="sp-results-count">
            {loading ? 'Loading…' : `${total} product${total !== 1 ? 's' : ''}`}
            {search && <span> for "<em>{search}</em>"</span>}
          </p>
          <div className="sp-toolbar-right">
            {search && (
              <button className="sp-clear-search" onClick={() => { setSearchInput(''); setParam('search', ''); }}>
                ✕ Clear search
              </button>
            )}
            <select value={sort} onChange={e => setParam('sort', e.target.value)} className="sp-sort-select">
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="sp-skeleton-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="sp-skeleton-card">
                <div className="sp-skeleton-img" />
                <div className="sp-skeleton-line" />
                <div className="sp-skeleton-line sp-skeleton-line--short" />
                <div className="sp-skeleton-line sp-skeleton-line--price" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">🔍</div>
            <h3>No products found</h3>
            <p>Try a different category or search term</p>
            <button onClick={() => { setSearchInput(''); setSearchParams({}); }}>Browse All</button>
          </div>
        ) : (
          <div className="sp-grid">
            {products.map(p => <ProductCard key={p._id} product={p} />)}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="sp-pagination">
            <button disabled={page <= 1} onClick={() => goPage(page - 1)}>← Prev</button>
            {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                className={p === page ? 'sp-page-btn--active' : ''}
                onClick={() => goPage(p)}
              >{p}</button>
            ))}
            <button disabled={page >= pages} onClick={() => goPage(page + 1)}>Next →</button>
          </div>
        )}
      </section>

      {/* ── Trust Bar ────────────────────────────────────────── */}
      <section className="sp-trust">
        {[
          { icon: '🚚', title: 'Free Delivery',    sub: 'On orders over R500' },
          { icon: '✅', title: 'Authentic Products', sub: 'Professional grade only' },
          { icon: '🔒', title: 'Secure Checkout',  sub: 'Powered by Yoco' },
          { icon: '💬', title: 'Expert Advice',    sub: 'Chat us on WhatsApp' },
        ].map(t => (
          <div key={t.title} className="sp-trust-item">
            <span className="sp-trust-icon">{t.icon}</span>
            <div>
              <p className="sp-trust-title">{t.title}</p>
              <p className="sp-trust-sub">{t.sub}</p>
            </div>
          </div>
        ))}
      </section>

      <footer className="sp-footer">
        <p>© {new Date().getFullYear()} NXL Beauty Bar · 1948 Mahalefele Rd, Dube, Soweto</p>
        <div className="sp-footer-links">
          <Link to="/">Home</Link>
          <Link to="/shop">Shop</Link>
          <Link to="/login">Sign In</Link>
          <a href="https://wa.me/27685113394" target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </footer>
    </div>
  );
}