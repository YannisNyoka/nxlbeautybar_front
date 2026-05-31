import nxlLogo from './assets/images/Logo.jpeg';
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCart } from './hooks/useCart';
import './ProductDetailPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function StarRating({ rating, interactive = false, onRate }) {
  const [hovered, setHovered] = useState(0);
  const display = interactive ? (hovered || rating) : rating;
  return (
    <div className="pdp-stars">
      {[1,2,3,4,5].map(s => (
        <span
          key={s}
          className={`pdp-star ${s <= display ? 'filled' : ''} ${interactive ? 'interactive' : ''}`}
          onMouseEnter={() => interactive && setHovered(s)}
          onMouseLeave={() => interactive && setHovered(0)}
          onClick={() => interactive && onRate && onRate(s)}
        >★</span>
      ))}
    </div>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const [product,   setProduct]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [activeImg, setActiveImg] = useState(0);
  const [quantity,  setQuantity]  = useState(1);
  const [adding,    setAdding]    = useState(false);
  const [added,     setAdded]     = useState(false);

  const [reviewRating,  setReviewRating]  = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError,   setReviewError]   = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');

  const loadProduct = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/shop/products/${id}`);
      const data = await res.json();
      if (data.success) setProduct(data.data);
      else setError('Product not found.');
    } catch { setError('Failed to load product.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadProduct(); }, [id]);

  const handleAddToCart = () => {
    if (!product || product.stock === 0) return;
    setAdding(true);
    addItem(product, quantity);
    setTimeout(() => { setAdding(false); setAdded(true); }, 500);
    setTimeout(() => setAdded(false), 2200);
  };

  const handleBuyNow = () => {
    if (!product || product.stock === 0) return;
    addItem(product, quantity);
    navigate('/cart');
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setReviewError(''); setReviewSuccess('');
    const token = localStorage.getItem('token');
    if (!token) { setReviewError('Please sign in to leave a review.'); return; }
    setReviewLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/shop/products/${id}/reviews`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ rating: reviewRating, comment: reviewComment }),
      });
      const data = await res.json();
      if (data.success) {
        setReviewSuccess('Review submitted — thank you!');
        setReviewComment('');
        loadProduct();
      } else {
        setReviewError(data.error || 'Could not submit review.');
      }
    } catch { setReviewError('Network error. Please try again.'); }
    finally { setReviewLoading(false); }
  };

  const discount = product?.comparePrice && product.comparePrice > product.price
    ? Math.round((1 - product.price / product.comparePrice) * 100) : null;

  if (loading) return (
    <div className="pdp-root">
      <div className="pdp-loading">
        <div className="pdp-spinner" />
        <p>Loading…</p>
      </div>
    </div>
  );

  if (error || !product) return (
    <div className="pdp-root">
      <div className="pdp-error-state">
        <span>😕</span>
        <h2>{error || 'Product not found'}</h2>
        <Link to="/shop" className="pdp-btn-gold">← Back to Shop</Link>
      </div>
    </div>
  );

  const images = product.images?.length ? product.images : [];

  return (
    <div className="pdp-root">

      {/* Top Bar */}
      <header className="pdp-topbar">
        <Link to="/shop" className="pdp-topbar-logo"><img src={nxlLogo} alt="" className="pdp-topbar-logo-img" /><span>NXL Beauty Bar</span></Link>
        <nav className="pdp-topbar-nav">
          <Link to="/shop">Shop</Link>
          <Link to="/orders">My Orders</Link>
        </nav>
        <Link to="/cart" className="pdp-topbar-cart">🛒 Cart</Link>
      </header>

      {/* Breadcrumb */}
      <nav className="pdp-breadcrumb">
        <Link to="/shop">Shop</Link>
        <span>/</span>
        <Link to={`/shop?category=${product.category}`}>
          {product.category.charAt(0).toUpperCase() + product.category.slice(1)}
        </Link>
        <span>/</span>
        <span>{product.name}</span>
      </nav>

      {/* Product layout */}
      <div className="pdp-layout">

        {/* Gallery */}
        <div className="pdp-gallery">
          <div className="pdp-main-img-wrap">
            {images.length > 0
              ? <img src={images[activeImg]} alt={product.name} className="pdp-main-img" />
              : <div className="pdp-img-placeholder">💅</div>
            }
            {discount && <span className="pdp-discount-badge">−{discount}%</span>}
          </div>
          {images.length > 1 && (
            <div className="pdp-thumbs">
              {images.map((img, i) => (
                <button
                  key={i}
                  className={`pdp-thumb ${i === activeImg ? 'active' : ''}`}
                  onClick={() => setActiveImg(i)}
                >
                  <img src={img} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className="pdp-info">
          {product.brand && <p className="pdp-brand">{product.brand}</p>}
          <h1 className="pdp-name">{product.name}</h1>

          <div className="pdp-rating-row">
            <StarRating rating={product.rating || 0} />
            <span className="pdp-rating-text">
              {product.rating ? product.rating.toFixed(1) : 'No ratings'}
              <span className="pdp-review-count"> · {product.reviewCount || 0} review{product.reviewCount !== 1 ? 's' : ''}</span>
            </span>
          </div>

          <div className="pdp-price-block">
            <span className="pdp-price">R{parseFloat(product.price).toFixed(2)}</span>
            {product.comparePrice && (
              <span className="pdp-compare">R{parseFloat(product.comparePrice).toFixed(2)}</span>
            )}
            {discount && <span className="pdp-saving">Save {discount}%</span>}
          </div>

          {product.description && (
            <p className="pdp-description">{product.description}</p>
          )}

          {product.tags?.length > 0 && (
            <div className="pdp-tags">
              {product.tags.map(t => <span key={t} className="pdp-tag">{t}</span>)}
            </div>
          )}

          <div className="pdp-stock-row">
            {product.stock === 0
              ? <span className="pdp-stock out">● Out of Stock</span>
              : product.stock <= 5
                ? <span className="pdp-stock low">● Only {product.stock} left</span>
                : <span className="pdp-stock in">● In Stock</span>
            }
          </div>

          {product.stock > 0 && (
            <div className="pdp-qty-row">
              <span className="pdp-qty-label">Quantity</span>
              <div className="pdp-qty-ctrl">
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))}>−</button>
                <span>{quantity}</span>
                <button onClick={() => setQuantity(q => Math.min(product.stock, q + 1))}>+</button>
              </div>
            </div>
          )}

          <div className="pdp-actions">
            <button
              className={`pdp-btn-cart ${added ? 'added' : ''}`}
              onClick={handleAddToCart}
              disabled={product.stock === 0 || adding}
            >
              {adding ? '…' : added ? '✓ Added to Cart!' : '🛒 Add to Cart'}
            </button>
            <button
              className="pdp-btn-buy"
              onClick={handleBuyNow}
              disabled={product.stock === 0}
            >
              Buy Now
            </button>
          </div>

          <div className="pdp-meta">
            {product.sku && (
              <div className="pdp-meta-row">
                <span>SKU</span><span>{product.sku}</span>
              </div>
            )}
            <div className="pdp-meta-row">
              <span>Category</span>
              <span className="pdp-meta-cat">
                {product.category.charAt(0).toUpperCase() + product.category.slice(1)}
              </span>
            </div>
          </div>

          <div className="pdp-delivery-note">
            🚚 <strong>Free delivery</strong> on orders over R500 · Standard R80
          </div>
        </div>
      </div>

      {/* Reviews section */}
      <section className="pdp-reviews">
        <div className="pdp-reviews-inner">

          <div className="pdp-reviews-head">
            <h2>Customer Reviews</h2>
            <div className="pdp-reviews-summary">
              <span className="pdp-avg-num">{product.rating ? product.rating.toFixed(1) : '—'}</span>
              <div>
                <StarRating rating={product.rating || 0} />
                <p>{product.reviewCount || 0} review{product.reviewCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          {/* Review list */}
          <div className="pdp-review-list">
            {product.reviews?.length > 0 ? product.reviews.map((r, i) => (
              <div key={r._id || i} className="pdp-review-card">
                <div className="pdp-review-card-top">
                  <div className="pdp-avatar">
                    {(r.reviewerName || 'A')[0].toUpperCase()}
                  </div>
                  <div className="pdp-reviewer-info">
                    <p className="pdp-reviewer-name">{r.reviewerName || 'Anonymous'}</p>
                    <p className="pdp-review-date">
                      {new Date(r.createdAt).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' })}
                    </p>
                  </div>
                  <StarRating rating={r.rating} />
                </div>
                {r.comment && <p className="pdp-review-body">{r.comment}</p>}
              </div>
            )) : (
              <p className="pdp-no-reviews">No reviews yet. Be the first!</p>
            )}
          </div>

          {/* Write review */}
          <div className="pdp-write-review">
            <h3>Write a Review</h3>
            <p className="pdp-review-note">Only customers who purchased this product can review it.</p>

            {reviewSuccess && <div className="pdp-msg pdp-msg--success">{reviewSuccess}</div>}
            {reviewError   && <div className="pdp-msg pdp-msg--error">{reviewError}</div>}

            <form onSubmit={handleReviewSubmit} className="pdp-review-form">
              <div className="pdp-review-rating-pick">
                <span>Your rating</span>
                <StarRating rating={reviewRating} interactive onRate={setReviewRating} />
              </div>
              <textarea
                placeholder="Share your experience with this product…"
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                rows={4}
              />
              <button type="submit" className="pdp-btn-gold" disabled={reviewLoading}>
                {reviewLoading ? 'Submitting…' : 'Submit Review'}
              </button>
            </form>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="pdp-footer">
        <p>© {new Date().getFullYear()} NXL Beauty Bar · 1948 Mahalefele Rd, Dube, Soweto</p>
        <Link to="/shop">← Continue Shopping</Link>
      </footer>

    </div>
  );
}