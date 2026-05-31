import nxlLogo from './assets/images/Logo.jpeg';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from './hooks/useCart';
import './CartPage.css';

export default function CartPage() {
  const { items, subtotal, shippingFee, total, updateQuantity, removeItem, itemCount } = useCart();
  const navigate = useNavigate();

  // Check if user is logged in
  const handleCheckout = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { state: { from: '/checkout' } });
      return;
    }
    navigate('/checkout');
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
            <div key={item.productId} className="cp-item">

              {/* Image */}
              <div className="cp-item-img-wrap">
                {item.image
                  ? <img src={item.image} alt={item.name} className="cp-item-img" />
                  : <div className="cp-item-img-ph">💅</div>
                }
              </div>

              {/* Info */}
              <div className="cp-item-info">
                <Link to={`/shop/product/${item.productId}`} className="cp-item-name">
                  {item.name}
                </Link>
                <p className="cp-item-unit">R{item.price.toFixed(2)} each</p>

                {/* Qty controls */}
                <div className="cp-item-row">
                  <div className="cp-qty-ctrl">
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      aria-label="Decrease quantity"
                    >−</button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      aria-label="Increase quantity"
                    >+</button>
                  </div>

                  {item.quantity >= item.stock && (
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
            <div className="cp-summary-row">
              <span>Shipping</span>
              <span className={shippingFee === 0 ? 'cp-free' : ''}>
                {shippingFee === 0 ? 'FREE' : `R${shippingFee.toFixed(2)}`}
              </span>
            </div>
            {shippingFee > 0 && (
              <p className="cp-shipping-note">
                Add R{(500 - subtotal).toFixed(2)} more for free shipping
              </p>
            )}
          </div>

          {/* Free shipping progress bar */}
          {shippingFee > 0 && (
            <div className="cp-progress-wrap">
              <div
                className="cp-progress-bar"
                style={{ width: `${Math.min((subtotal / 500) * 100, 100)}%` }}
              />
            </div>
          )}

          <div className="cp-summary-divider" />

          <div className="cp-summary-total">
            <span>Total</span>
            <span>R{total.toFixed(2)}</span>
          </div>

          <button className="cp-btn-checkout" onClick={handleCheckout}>
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