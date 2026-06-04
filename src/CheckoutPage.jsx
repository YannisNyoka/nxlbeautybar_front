import nxlLogo from './assets/images/Logo.jpeg';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from './hooks/useCart';
import './CheckoutPage.css';
import { useSEO } from './useSEO';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
  'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
];

export default function CheckoutPage() {
  const { items, subtotal, shippingFee, total, clearCart } = useCart();
  const navigate = useNavigate();

  useSEO({ title: 'Checkout', url: '/checkout', noIndex: true });

  const [form, setForm] = useState({
    fullName:  '',
    phone:     '',
    email:     '',
    address:   '',
    city:      '',
    province:  'Gauteng',
    postalCode:'',
    notes:     '',
  });

  const [errors,        setErrors]        = useState({});
  const [loading,       setLoading]       = useState(false);
  const [apiError,      setApiError]      = useState('');

  // ── Fulfillment type ───────────────────────────────────────────────────
  const [fulfillmentType, setFulfillmentType] = useState('delivery'); // 'delivery' | 'pickup'
  const isPickup = fulfillmentType === 'pickup';
  // ──────────────────────────────────────────────────────────────────────

  // ── Discount code state ────────────────────────────────────────────────
  const [discountInput,  setDiscountInput]  = useState('');
  const [discountResult, setDiscountResult] = useState(null);
  const [discountError,  setDiscountError]  = useState('');
  const [discountLoading,setDiscountLoading]= useState(false);

  // ── Loyalty points state ────────────────────────────────────────────────
  const [loyalty,        setLoyalty]        = useState(null);
  const [loyaltyRedeem,  setLoyaltyRedeem]  = useState(0);
  const [loyaltyApplied, setLoyaltyApplied] = useState(null);
  const [loyaltyError,   setLoyaltyError]   = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE_URL}/loyalty/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setLoyalty(d.data); })
      .catch(() => {});
  }, []);

  const applyLoyaltyPoints = async () => {
    if (!loyaltyRedeem || loyaltyRedeem < (loyalty?.config?.minRedemption || 100)) {
      setLoyaltyError(`Minimum ${loyalty?.config?.minRedemption || 100} points to redeem.`); return;
    }
    setLoyaltyError('');
    const token = localStorage.getItem('token');
    try {
      const res  = await fetch(`${API_BASE_URL}/loyalty/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pointsToRedeem: loyaltyRedeem, orderSubtotal: subtotal }),
      });
      const data = await res.json();
      if (data.success) setLoyaltyApplied(data.data);
      else setLoyaltyError(data.error || 'Could not apply points.');
    } catch { setLoyaltyError('Network error.'); }
  };

  const loyaltyDiscountAmt = loyaltyApplied?.discountAmount || 0;
  // ─────────────────────────────────────────────────────────────────────

  const discountAmount     = discountResult?.discountAmount || 0;
  const discountedSubtotal = subtotal - discountAmount - loyaltyDiscountAmt;
  const effectiveShipping  = isPickup ? 0 : (discountedSubtotal >= 500 ? 0 : shippingFee);
  const effectiveTotal     = Math.max(0, discountedSubtotal + effectiveShipping);
  // ─────────────────────────────────────────────────────────────────────

  // Redirect if cart is empty
  if (items.length === 0) {
    return (
      <div className="chk-root">
        <div className="chk-empty">
          <span>🛒</span>
          <h2>Your cart is empty</h2>
          <Link to="/shop" className="chk-btn-gold">Browse Products</Link>
        </div>
      </div>
    );
  }

  const setField = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: '' }));
    setApiError('');
  };

  const validate = () => {
    const errs = {};
    if (!form.fullName.trim())   errs.fullName = 'Full name is required';
    if (!form.phone.trim())      errs.phone    = 'Phone number is required';
    if (!form.email.trim())      errs.email    = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    // Address fields only required for delivery
    if (!isPickup) {
      if (!form.address.trim())    errs.address    = 'Street address is required';
      if (!form.city.trim())       errs.city       = 'City is required';
      if (!form.postalCode.trim()) errs.postalCode = 'Postal code is required';
    }
    return errs;
  };

  const validateDiscount = async () => {
    if (!discountInput.trim()) return;
    setDiscountLoading(true);
    setDiscountError('');
    setDiscountResult(null);
    const token = localStorage.getItem('token');
    try {
      const res  = await fetch(`${API_BASE_URL}/discount-codes/validate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: discountInput.trim().toUpperCase(), subtotal }),
      });
      const data = await res.json();
      if (data.success) {
        setDiscountResult(data.data);
      } else {
        setDiscountError(data.error || 'Invalid code.');
      }
    } catch {
      setDiscountError('Could not validate code. Please try again.');
    } finally {
      setDiscountLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const token = localStorage.getItem('token');
    if (!token) { navigate('/login', { state: { from: '/checkout' } }); return; }

    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/shop/orders`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
          fulfillmentType,
          shippingAddress: isPickup ? {
            fullName:   form.fullName.trim(),
            phone:      form.phone.trim(),
            email:      form.email.trim(),
            address:    '1948 Mahalefele Rd, Dube, Soweto, 1800',
            city:       'Soweto',
            province:   'Gauteng',
            postalCode: '1800',
          } : {
            fullName:   form.fullName.trim(),
            phone:      form.phone.trim(),
            email:      form.email.trim(),
            address:    form.address.trim(),
            city:       form.city.trim(),
            province:   form.province,
            postalCode: form.postalCode.trim(),
          },
          notes:        form.notes.trim(),
          discountCode:          discountResult?.code || undefined,
          loyaltyPointsToRedeem: loyaltyApplied?.pointsRedeemed || undefined,
        }),
      });

      const data = await res.json();

      if (data.success && data.checkoutUrl) {
        // Clear cart then redirect to Yoco
        clearCart();
        window.location.href = data.checkoutUrl;
      } else {
        setApiError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setApiError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chk-root">

      {/* Top Bar */}
      <header className="chk-topbar">
        <Link to="/shop" className="chk-topbar-logo"><img src={nxlLogo} alt="" className="chk-topbar-logo-img" /><span>NXL Beauty Bar</span></Link>
        <div className="chk-steps">
          <span className="chk-step done">1. Cart</span>
          <span className="chk-step-arrow">›</span>
          <span className="chk-step active">2. Checkout</span>
          <span className="chk-step-arrow">›</span>
          <span className="chk-step">3. Confirmation</span>
        </div>
        <Link to="/cart" className="chk-topbar-back">← Back to Cart</Link>
      </header>

      <div className="chk-layout">

        {/* ── Left: Shipping Form ────────────────────────── */}
        <div className="chk-form-col">
          <h1 className="chk-title">Order Details</h1>

          {apiError && <div className="chk-api-error">{apiError}</div>}

          <form onSubmit={handleSubmit} noValidate className="chk-form">

            {/* ── Fulfillment Type ── */}
            <fieldset className="chk-fieldset">
              <legend>How would you like to receive your order?</legend>
              <div className="chk-fulfil-options">

                <label className={`chk-fulfil-card ${!isPickup ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="fulfillmentType"
                    value="delivery"
                    checked={!isPickup}
                    onChange={() => setFulfillmentType('delivery')}
                  />
                  <span className="chk-fulfil-icon">🚚</span>
                  <div className="chk-fulfil-text">
                    <strong>Home Delivery</strong>
                    <span>We deliver to your door{discountedSubtotal >= 500 ? ' — FREE on this order!' : ' · R80'}</span>
                  </div>
                  <span className="chk-fulfil-price">
                    {discountedSubtotal >= 500 ? 'FREE' : 'R80'}
                  </span>
                </label>

                <label className={`chk-fulfil-card ${isPickup ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="fulfillmentType"
                    value="pickup"
                    checked={isPickup}
                    onChange={() => setFulfillmentType('pickup')}
                  />
                  <span className="chk-fulfil-icon">🏪</span>
                  <div className="chk-fulfil-text">
                    <strong>Salon Pickup</strong>
                    <span>Collect at 1948 Mahalefele Rd, Dube, Soweto</span>
                  </div>
                  <span className="chk-fulfil-price free">FREE</span>
                </label>

              </div>

              {isPickup && (
                <div className="chk-pickup-info">
                  <p>📍 <strong>NXL Beauty Bar</strong> — 1948 Mahalefele Rd, Dube, Soweto, 1800</p>
                  <p>🕐 Mon–Sat 9AM–5PM &nbsp;|&nbsp; 📞 068 511 3394</p>
                  <p>We'll send you a WhatsApp when your order is ready to collect.</p>
                </div>
              )}
            </fieldset>
            <fieldset className="chk-fieldset">
              <legend>Contact Information</legend>
              <div className="chk-field-grid">
                <div className="chk-field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={e => setField('fullName', e.target.value)}
                    placeholder="e.g. Ayanda Dlamini"
                    className={errors.fullName ? 'error' : ''}
                  />
                  {errors.fullName && <span className="chk-err">{errors.fullName}</span>}
                </div>

                <div className="chk-field">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setField('phone', e.target.value)}
                    placeholder="e.g. 071 234 5678"
                    className={errors.phone ? 'error' : ''}
                  />
                  {errors.phone && <span className="chk-err">{errors.phone}</span>}
                </div>

                <div className="chk-field chk-field--full">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    placeholder="e.g. ayanda@email.com"
                    className={errors.email ? 'error' : ''}
                  />
                  {errors.email && <span className="chk-err">{errors.email}</span>}
                </div>
              </div>
            </fieldset>

            {/* Delivery Address — only shown for home delivery */}
            {!isPickup && (
            <fieldset className="chk-fieldset">
              <legend>Delivery Address</legend>
              <div className="chk-field-grid">
                <div className="chk-field chk-field--full">
                  <label>Street Address *</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => setField('address', e.target.value)}
                    placeholder="e.g. 12 Main Street, Apt 3"
                    className={errors.address ? 'error' : ''}
                  />
                  {errors.address && <span className="chk-err">{errors.address}</span>}
                </div>

                <div className="chk-field">
                  <label>City / Town *</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setField('city', e.target.value)}
                    placeholder="e.g. Soweto"
                    className={errors.city ? 'error' : ''}
                  />
                  {errors.city && <span className="chk-err">{errors.city}</span>}
                </div>

                <div className="chk-field">
                  <label>Postal Code *</label>
                  <input
                    type="text"
                    value={form.postalCode}
                    onChange={e => setField('postalCode', e.target.value)}
                    placeholder="e.g. 1800"
                    className={errors.postalCode ? 'error' : ''}
                  />
                  {errors.postalCode && <span className="chk-err">{errors.postalCode}</span>}
                </div>

                <div className="chk-field chk-field--full">
                  <label>Province</label>
                  <select
                    value={form.province}
                    onChange={e => setField('province', e.target.value)}
                  >
                    {PROVINCES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>
            )} {/* end !isPickup */}

            {/* Notes */}
            <fieldset className="chk-fieldset">
              <legend>Order Notes (optional)</legend>
              <textarea
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Special instructions, gate code, or anything else we should know…"
                rows={3}
              />
            </fieldset>

            <button type="submit" className="chk-btn-pay" disabled={loading}>
              {loading
                ? <><span className="chk-spinner" /> Processing…</>
                : <>🔒 Pay R{effectiveTotal.toFixed(2)} with Yoco</>
              }
            </button>

            <p className="chk-secure-note">
              Your payment is processed securely by Yoco. NXL Beauty Bar never stores your card details.
            </p>

          </form>
        </div>

        {/* ── Right: Order Summary ───────────────────────── */}
        <div className="chk-summary">
          <h2 className="chk-summary-title">Order Summary</h2>

          <div className="chk-summary-items">
            {items.map(item => (
              <div key={item.productId} className="chk-summary-item">
                <div className="chk-summary-img-wrap">
                  {item.image
                    ? <img src={item.image} alt={item.name} />
                    : <span>💅</span>
                  }
                  <span className="chk-qty-badge">{item.quantity}</span>
                </div>
                <div className="chk-summary-item-info">
                  <p className="chk-summary-item-name">{item.name}</p>
                  <p className="chk-summary-item-price">R{item.price.toFixed(2)} each</p>
                </div>
                <span className="chk-summary-item-total">
                  R{(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="chk-summary-divider" />

          <div className="chk-summary-lines">
            <div className="chk-summary-row">
              <span>Subtotal</span>
              <span>R{subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="chk-summary-row chk-discount-row">
                <span>Discount ({discountResult.code})</span>
                <span className="chk-discount-value">−R{discountAmount.toFixed(2)}</span>
              </div>
            )}
            {loyaltyDiscountAmt > 0 && (
              <div className="chk-summary-row chk-discount-row">
                <span>⭐ Loyalty ({loyaltyApplied.pointsRedeemed} pts)</span>
                <span className="chk-discount-value">−R{loyaltyDiscountAmt.toFixed(2)}</span>
              </div>
            )}
            <div className="chk-summary-row">
              <span>Shipping</span>
              <span className={effectiveShipping === 0 ? 'chk-free' : ''}>
                {effectiveShipping === 0 ? 'FREE' : `R${effectiveShipping.toFixed(2)}`}
              </span>
            </div>
          </div>

          <div className="chk-summary-divider" />

          <div className="chk-summary-total">
            <span>Total</span>
            <span>R{effectiveTotal.toFixed(2)}</span>
          </div>

          {/* ── Discount code input ── */}
          <div className="chk-discount-section">
            {discountResult ? (
              <div className="chk-discount-applied">
                <span className="chk-discount-badge">
                  🎉 <strong>{discountResult.code}</strong> applied —
                  {discountResult.type === 'percentage'
                    ? ` ${discountResult.value}% off`
                    : ` R${discountResult.value} off`}
                </span>
                <button className="chk-discount-remove" onClick={() => { setDiscountResult(null); setDiscountInput(''); setDiscountError(''); }}>
                  Remove
                </button>
              </div>
            ) : (
              <div className="chk-discount-input-row">
                <input
                  type="text"
                  placeholder="Discount code"
                  value={discountInput}
                  onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(''); }}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), validateDiscount())}
                  className="chk-discount-input"
                  maxLength={30}
                />
                <button
                  type="button"
                  onClick={validateDiscount}
                  disabled={discountLoading || !discountInput.trim()}
                  className="chk-discount-apply-btn"
                >
                  {discountLoading ? '…' : 'Apply'}
                </button>
              </div>
            )}
            {discountError && <p className="chk-discount-error">{discountError}</p>}
          </div>

          {/* ── Loyalty points redemption ── */}
          {loyalty && loyalty.points >= (loyalty.config?.minRedemption || 100) && (
            <div className="chk-loyalty-section">
              <div className="chk-loyalty-header">
                <span className="chk-loyalty-label">⭐ Loyalty Points</span>
                <span className="chk-loyalty-balance">{loyalty.points.toLocaleString()} pts available ≈ R{parseFloat(loyalty.randValue).toFixed(2)}</span>
              </div>
              {loyaltyApplied ? (
                <div className="chk-discount-applied">
                  <span className="chk-discount-badge">
                    ⭐ {loyaltyApplied.pointsRedeemed} pts applied — R{loyaltyApplied.discountAmount.toFixed(2)} off
                  </span>
                  <button className="chk-discount-remove" onClick={() => { setLoyaltyApplied(null); setLoyaltyRedeem(0); setLoyaltyError(''); }}>
                    Remove
                  </button>
                </div>
              ) : (
                <div className="chk-discount-input-row">
                  <input
                    type="number"
                    placeholder={`Min ${loyalty.config?.minRedemption || 100} pts`}
                    value={loyaltyRedeem || ''}
                    onChange={e => { setLoyaltyRedeem(Math.min(loyalty.points, parseInt(e.target.value) || 0)); setLoyaltyError(''); }}
                    className="chk-discount-input"
                    min={loyalty.config?.minRedemption || 100}
                    max={loyalty.points}
                    step={100}
                  />
                  <button
                    type="button"
                    onClick={applyLoyaltyPoints}
                    disabled={!loyaltyRedeem}
                    className="chk-discount-apply-btn"
                  >
                    Redeem
                  </button>
                </div>
              )}
              {loyaltyError && <p className="chk-discount-error">{loyaltyError}</p>}
              <p className="chk-loyalty-hint">100 points = R10 · Max {loyalty.config?.maxRedemptionPct || 50}% of order value</p>
            </div>
          )}

          {/* Trust badges */}
          <div className="chk-trust">
            <div className="chk-trust-item">🔒 Secure payment via Yoco</div>
            <div className="chk-trust-item">
              {isPickup
                ? '🏪 Collect at NXL Beauty Bar, Soweto — FREE'
                : effectiveShipping === 0 ? '🚚 Free shipping on this order' : '🚚 Standard delivery R80'}
            </div>
            <div className="chk-trust-item">✅ Authentic products guaranteed</div>
          </div>

          <Link to="/cart" className="chk-edit-cart">✏️ Edit cart</Link>
        </div>

      </div>

      {/* Footer */}
      <footer className="chk-footer">
        <p>© {new Date().getFullYear()} NXL Beauty Bar · 1948 Mahalefele Rd, Dube, Soweto</p>
      </footer>

    </div>
  );
}