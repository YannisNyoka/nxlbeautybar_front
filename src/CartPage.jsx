import nxlLogo from './assets/images/Logo.jpeg';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useCart } from './hooks/useCart';
import './CartPage.css';
import { useSEO } from './useSEO';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem, itemCount } = useCart();
  const navigate = useNavigate();

  useSEO({ title: 'Your Cart', url: '/cart', noIndex: true });

  // Block checkout if any item is out of stock
  const hasOutOfStock = items.some(item => item.stock === 0);
  const hasOverStock  = items.some(item => item.quantity > item.stock && item.stock > 0);

  // Discount state
  const [discountInput,  setDiscountInput]  = useState('');
  const [discountData,   setDiscountData]   = useState(null); // { code, type, value, discountAmount }
  const [discountError,  setDiscountError]  = useState('');
  const [discountLoading,setDiscountLoading]= useState(false);

  const discountAmount = discountData?.discountAmount || 0;
  const discountedSubtotal = subtotal - discountAmount;
  const shippingFee = discountedSubtotal >= 500 ? 0 : 80;
  const total = discountedSubtotal + shippingFee;

  const applyDiscount = async () => {
    if (!discountInput.trim()) return;
    setDiscountError('');
    setDiscountLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/discount-codes/validate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body:    JSON.stringify({ code: discountInput.trim(), subtotal }),
      });
      const data = await res.json();
      if (data.success) {
        setDiscountData(data.data);
        setDiscountError('');
      } else {
        setDiscountData(null);
        setDiscountError(data.error || 'Invalid code');
      }
    } catch {
      setDiscountError('Could not validate code. Try again.');
    } finally {
      setDiscountLoading(false);
    }
  };

  const removeDiscount = () => {
    setDiscountData(null);
    setDiscountInput('');
    setDiscountError('');
  };

  // Check if user is logged in
  const handleCheckout = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { state: { from: '/checkout' } });
      return;
    }
    navigate('/checkout', { state: { discountCode: discountData?.code || null, discountAmount } });
  };

  if (items.length === 0) {
    return (
      <div className="cp-root">
        <header className="cp-topbar">
          <Link to="/shop" className="cp-topbar-logo"><img src={nxlLogo} alt="" className="cp-topbar-logo-img" /><span>NXL Beauty Bar</span></Link>
          <nav className="cp-topbar-nav">
            <Link to="/shop">Shop</Link>
            <Link to="/orders">My Orders</Link>
          </nav>
        </header>

        <div className="cp-empty">
          <div className="cp-empty-icon">🛒</div>
          <h2>Your cart is empty</h2>
          <p>Looks like you haven't added anything yet.</p>
          <Link to="/shop" className="cp-btn-gold">Browse Products</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-root">

      {/* Top Bar */}
      <header className="cp-topbar">
        <Link to="/shop" className="cp-topbar-logo"><img src={nxlLogo} alt="" className="cp-topbar-logo-img" /><span>NXL Beauty Bar</span></Link>
        <nav className="cp-topbar-nav">
          <Link to="/shop">← Continue Shopping</Link>
          <Link to="/orders">My Orders</Link>
        </nav>
        <span className="cp-topbar-count">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
      </header>

      {/* Page title */}
      <div className="cp-page-head">
        <h1>Your Cart</h1>
        <span className="cp-item-count">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
      </div>

      <div className="cp-layout">

        {/* ── Cart Items ─────────────────────────────────── */}
        <div className="cp-items">
          {items.map(item => (
            <div key={item.productId} className={`cp-item ${item.stock === 0 ? 'cp-item--oos' : ''}`}>

              {/* Image */}
              <div className="cp-item-img-wrap">
                {item.image
                  ? <img src={item.image} alt={item.name} className="cp-item-img" />
                  : <div className="cp-item-img-ph">💅</div>
                }
                {item.stock === 0 && <div className="cp-item-oos-badge">Out of Stock</div>}
              </div>

              {/* Info */}
              <div className="cp-item-info">
                <Link to={`/shop/product/${item.productId}`} className="cp-item-name">
                  {item.name}
                </Link>
                <p className="cp-item-unit">R{item.price.toFixed(2)} each</p>

                {/* Stock warnings */}
                {item.stock === 0 ? (
                  <p className="cp-stock-warn cp-stock-warn--oos">
                    ⚠️ This item is out of stock. Please remove it to proceed.
                  </p>
                ) : item.stock <= 5 ? (
                  <p className="cp-stock-warn cp-stock-warn--low">
                    Only {item.stock} left in stock
                  </p>
                ) : null}

                {/* Qty controls */}
                <div className="cp-item-row">
                  <div className="cp-qty-ctrl">
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      aria-label="Decrease quantity"
                      disabled={item.stock === 0}
                    >−</button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      aria-label="Increase quantity"
                    >+</button>
                  </div>

                  {item.quantity >= item.stock && item.stock > 0 && (
                    <span className="cp-max-note">Max stock reached</span>
                  )}
                </div>
              </div>

              {/* Right side — line total + remove */}
              <div className="cp-item-right">
                <span className="cp-item-total">
                  R{(item.price * item.quantity).toFixed(2)}
                </span>
                <button
                  className="cp-remove-btn"
                  onClick={() => removeItem(item.productId)}
                  aria-label="Remove item"
                >
                  ✕
                </button>
              </div>

            </div>
          ))}
        </div>

        {/* ── Order Summary ──────────────────────────────── */}
        <div className="cp-summary">
          <h2 className="cp-summary-title">Order Summary</h2>

          <div className="cp-summary-lines">
            <div className="cp-summary-row">
              <span>Subtotal ({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
              <span>R{subtotal.toFixed(2)}</span>
            </div>

            {/* Discount line */}
            {discountData && (
              <div className="cp-summary-row cp-discount-row">
                <span>
                  Discount
                  <span className="cp-discount-badge">{discountData.code}</span>
                </span>
                <span className="cp-discount-amount">−R{discountAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="cp-summary-row">
              <span>Shipping</span>
              <span className={shippingFee === 0 ? 'cp-free' : ''}>
                {shippingFee === 0 ? 'FREE' : `R${shippingFee.toFixed(2)}`}
              </span>
            </div>
            {shippingFee > 0 && (
              <p className="cp-shipping-note">
                Add R{(500 - discountedSubtotal).toFixed(2)} more for free shipping
              </p>
            )}
          </div>

          {/* Free shipping progress bar */}
          {shippingFee > 0 && (
            <div className="cp-progress-wrap">
              <div
                className="cp-progress-bar"
                style={{ width: `${Math.min((discountedSubtotal / 500) * 100, 100)}%` }}
              />
            </div>
          )}

          {/* Discount code input */}
          <div className="cp-discount-section">
            {discountData ? (
              <div className="cp-discount-applied">
                <span>✓ <strong>{discountData.code}</strong> applied — {discountData.type === 'percentage' ? `${discountData.value}% off` : `R${discountData.value} off`}</span>
                <button className="cp-discount-remove" onClick={removeDiscount}>Remove</button>
              </div>
            ) : (
              <div className="cp-discount-input-row">
                <input
                  type="text"
                  className={`cp-discount-input ${discountError ? 'cp-discount-input--error' : ''}`}
                  placeholder="Discount code"
                  value={discountInput}
                  onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(''); }}
                  onKeyDown={e => e.key === 'Enter' && applyDiscount()}
                />
                <button
                  className="cp-discount-apply"
                  onClick={applyDiscount}
                  disabled={discountLoading || !discountInput.trim()}
                >
                  {discountLoading ? '…' : 'Apply'}
                </button>
              </div>
            )}
            {discountError && <p className="cp-discount-error">{discountError}</p>}
          </div>

          <div className="cp-summary-divider" />

          <div className="cp-summary-total">
            <span>Total</span>
            <span>R{total.toFixed(2)}</span>
          </div>

          {(hasOutOfStock || hasOverStock) && (
            <div className="cp-stock-block-warn">
              ⚠️ {hasOutOfStock
                ? 'Remove out-of-stock items before checking out.'
                : 'Some items exceed available stock. Please reduce quantities.'}
            </div>
          )}

          <button
            className="cp-btn-checkout"
            onClick={handleCheckout}
            disabled={hasOutOfStock || hasOverStock}
          >
            Proceed to Checkout →
          </button>

          <div className="cp-secure-note">
            🔒 Secure checkout powered by Yoco
          </div>

          <Link to="/shop" className="cp-continue-link">
            ← Continue Shopping
          </Link>
        </div>

      </div>

      {/* Footer */}
      <footer className="cp-footer">
        <p>© {new Date().getFullYear()} NXL Beauty Bar · 1948 Mahalefele Rd, Dube, Soweto</p>
      </footer>

    </div>
  );
}