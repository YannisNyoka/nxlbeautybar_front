import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useSEO } from './useSEO';
import './OrderTrackingPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const STEPS = [
  { status: 'pending',    icon: '📋', label: 'Order Placed',    desc: 'We received your order' },
  { status: 'confirmed',  icon: '✅', label: 'Confirmed',        desc: 'Order confirmed & being prepared' },
  { status: 'processing', icon: '📦', label: 'Processing',       desc: 'Packing your products' },
  { status: 'shipped',    icon: '🚚', label: 'Shipped',          desc: 'On its way to you' },
  { status: 'delivered',  icon: '🎉', label: 'Delivered',        desc: 'Enjoy your products!' },
];

const PICKUP_STEPS = [
  { status: 'pending',    icon: '📋', label: 'Order Placed',    desc: 'We received your order' },
  { status: 'confirmed',  icon: '✅', label: 'Confirmed',        desc: 'Order confirmed' },
  { status: 'processing', icon: '📦', label: 'Preparing',        desc: 'Getting your order ready' },
  { status: 'ready',      icon: '🏪', label: 'Ready to Collect', desc: 'Come collect at the salon!' },
  { status: 'delivered',  icon: '🎉', label: 'Collected',        desc: 'Order complete!' },
];

const STATUS_COLORS = {
  pending:    '#f59e0b',
  confirmed:  '#3b82f6',
  processing: '#8b5cf6',
  ready:      '#10b981',
  shipped:    '#6366f1',
  delivered:  '#10b981',
  cancelled:  '#ef4444',
  refunded:   '#94a3b8',
};

function getStepIndex(status, isPickup) {
  const steps = isPickup ? PICKUP_STEPS : STEPS;
  const idx = steps.findIndex(s => s.status === status);
  return idx === -1 ? 0 : idx;
}

export default function OrderTrackingPage() {
  const { id }           = useParams();
  const [searchParams]   = useSearchParams();
  const emailParam       = searchParams.get('email');

  const [order,    setOrder]   = useState(null);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');
  const [email,    setEmail]   = useState(emailParam || '');
  const [looking,  setLooking] = useState(false);

  useSEO({
    title:    order ? `Order #${order._id?.slice(-6).toUpperCase()} — Track` : 'Track Your Order',
    url:      `/track/${id || ''}`,
    noIndex:  true,
  });

  const loadOrder = async (orderId, emailAddress) => {
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res  = await fetch(`${API_BASE_URL}/shop/orders/${orderId}`, { headers });
      const data = await res.json();

      if (!res.ok || !data.success) { setError('Order not found.'); return; }

      // Verify email matches if not logged in
      if (!token && emailAddress) {
        const orderEmail = data.data.shippingAddress?.email || data.data.customer?.email;
        if (orderEmail?.toLowerCase() !== emailAddress.toLowerCase()) {
          setError('Order not found or email does not match.'); return;
        }
      }
      setOrder(data.data);
    } catch { setError('Could not load order. Please try again.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (id) loadOrder(id, emailParam);
    else setLoading(false);
  }, [id]);

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!id) return;
    setLooking(true);
    await loadOrder(id, email);
    setLooking(false);
  };

  const isPickup    = order?.fulfillmentType === 'pickup';
  const steps       = isPickup ? PICKUP_STEPS : STEPS;
  const currentStep = order ? getStepIndex(order.status, isPickup) : 0;
  const isCancelled = order?.status === 'cancelled' || order?.status === 'refunded';
  const shortId     = order?._id?.slice(-6).toUpperCase();

  return (
    <div className="otp-root">
      <div className="otp-inner">

        {/* Header */}
        <div className="otp-header">
          <Link to="/shop" className="otp-back">← Back to Shop</Link>
          <h1 className="otp-title">Track Your Order</h1>
          {order && <p className="otp-subtitle">Order #{shortId}</p>}
        </div>

        {/* Email verification (if not logged in and order not loaded) */}
        {id && !order && !loading && (
          <div className="otp-verify-card">
            <div className="otp-verify-icon">📧</div>
            <h2>Verify Your Identity</h2>
            <p>Enter the email address you used when placing this order.</p>
            <form onSubmit={handleLookup} className="otp-verify-form">
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={looking}>
                {looking ? 'Looking up…' : 'Track Order →'}
              </button>
            </form>
            {error && <p className="otp-error">{error}</p>}
          </div>
        )}

        {/* No order ID — search form */}
        {!id && (
          <div className="otp-verify-card">
            <div className="otp-verify-icon">🔍</div>
            <h2>Find Your Order</h2>
            <p>Enter your order ID and email address to track your order.</p>
            <p className="otp-hint">Your order ID is in your confirmation email (e.g. <strong>AB12CD</strong>).</p>
            <div className="otp-no-id">
              <Link to="/orders" className="otp-btn-gold">View My Orders →</Link>
            </div>
          </div>
        )}

        {loading && (
          <div className="otp-loading">
            <div className="otp-spinner" />
            <p>Loading order details…</p>
          </div>
        )}

        {order && !isCancelled && (
          <>
            {/* Progress timeline */}
            <div className="otp-card">
              <h2 className="otp-card-title">
                {isPickup ? '🏪 Pickup Status' : '🚚 Delivery Status'}
              </h2>

              <div className="otp-timeline">
                {steps.map((step, i) => {
                  const isDone    = i < currentStep;
                  const isCurrent = i === currentStep;
                  const isPending = i > currentStep;
                  return (
                    <div key={step.status} className={`otp-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}>
                      <div className="otp-step-left">
                        <div className="otp-step-dot">
                          {isDone ? '✓' : isCurrent ? step.icon : ''}
                        </div>
                        {i < steps.length - 1 && <div className="otp-step-line" />}
                      </div>
                      <div className="otp-step-content">
                        <p className="otp-step-label">{step.label}</p>
                        <p className="otp-step-desc">{isCurrent ? step.desc : isDone ? 'Completed' : 'Pending'}</p>
                      </div>
                      {isCurrent && (
                        <span className="otp-step-badge" style={{ background: STATUS_COLORS[order.status] }}>
                          Current
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tracking number */}
              {order.trackingNumber && (
                <div className="otp-tracking-num">
                  <p className="otp-tracking-label">Tracking Number</p>
                  <p className="otp-tracking-val">{order.trackingNumber}</p>
                </div>
              )}

              {/* Pickup info */}
              {isPickup && order.status === 'ready' && (
                <div className="otp-pickup-ready">
                  <span className="otp-pickup-ready-icon">🏪</span>
                  <div>
                    <p className="otp-pickup-ready-title">Your order is ready to collect!</p>
                    <p>1948 Mahalefele Rd, Dube, Soweto &nbsp;|&nbsp; Mon–Sat 9AM–5PM</p>
                    <p>Please bring your order number <strong>#{shortId}</strong></p>
                  </div>
                </div>
              )}
            </div>

            {/* Order details */}
            <div className="otp-card">
              <h2 className="otp-card-title">Order Summary</h2>
              <div className="otp-items">
                {(order.items || []).map((item, i) => (
                  <div key={i} className="otp-item">
                    {item.productImage
                      ? <img src={item.productImage} alt={item.productName} className="otp-item-img" />
                      : <div className="otp-item-img otp-item-img-ph">💅</div>
                    }
                    <div className="otp-item-info">
                      <p className="otp-item-name">{item.productName}</p>
                      <p className="otp-item-qty">Qty: {item.quantity}</p>
                    </div>
                    <p className="otp-item-price">R{parseFloat(item.lineTotal || 0).toFixed(2)}</p>
                  </div>
                ))}
              </div>

              <div className="otp-totals">
                <div className="otp-total-row">
                  <span>Subtotal</span>
                  <span>R{parseFloat(order.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="otp-total-row">
                  <span>{isPickup ? 'Pickup' : 'Shipping'}</span>
                  <span className={parseFloat(order.shippingFee || 0) === 0 ? 'otp-free' : ''}>
                    {parseFloat(order.shippingFee || 0) === 0 ? 'FREE' : `R${parseFloat(order.shippingFee).toFixed(2)}`}
                  </span>
                </div>
                <div className="otp-divider" />
                <div className="otp-total-row otp-grand-total">
                  <span>Total</span>
                  <span>R{parseFloat(order.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Delivery address */}
            {!isPickup && order.shippingAddress && (
              <div className="otp-card">
                <h2 className="otp-card-title">Delivery Address</h2>
                <address className="otp-address">
                  <strong>{order.shippingAddress.fullName}</strong>
                  <span>{order.shippingAddress.address}</span>
                  <span>{order.shippingAddress.city}, {order.shippingAddress.province}</span>
                  <span>{order.shippingAddress.postalCode}</span>
                  <span>📞 {order.shippingAddress.phone}</span>
                </address>
              </div>
            )}
          </>
        )}

        {/* Cancelled / refunded */}
        {order && isCancelled && (
          <div className="otp-card otp-cancelled-card">
            <div className="otp-cancelled-icon">{order.status === 'refunded' ? '↩️' : '❌'}</div>
            <h2>{order.status === 'refunded' ? 'Order Refunded' : 'Order Cancelled'}</h2>
            <p>This order has been {order.status}.</p>
            {order.status === 'refunded' && <p className="otp-refund-note">Your refund will appear within 3–5 business days.</p>}
            <Link to="/shop" className="otp-btn-gold" style={{ marginTop: '1.25rem', display: 'inline-block' }}>
              Shop Again →
            </Link>
          </div>
        )}

        {/* Help */}
        <div className="otp-help">
          <p>Need help with your order?</p>
          <a href="https://wa.me/27685113394" target="_blank" rel="noopener noreferrer">
            💬 WhatsApp Us
          </a>
          <span>or</span>
          <a href="mailto:nxlbeautybar@gmail.com">📧 Email Us</a>
        </div>

      </div>
    </div>
  );
}