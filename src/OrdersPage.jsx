import nxlLogo from './assets/images/Logo.jpeg';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './OrdersPage.css';
import { useSEO } from './useSEO';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const STATUS_CONFIG = {
  pending:    { label: 'Pending',    color: '#e07a2e', bg: 'rgba(224,122,46,0.12)',  icon: '⏳' },
  confirmed:  { label: 'Confirmed',  color: '#c9a96e', bg: 'rgba(201,169,110,0.12)', icon: '✅' },
  processing: { label: 'Processing', color: '#7b9fd4', bg: 'rgba(123,159,212,0.12)', icon: '⚙️' },
  shipped:    { label: 'Shipped',    color: '#9b7fd4', bg: 'rgba(155,127,212,0.12)', icon: '🚚' },
  delivered:  { label: 'Delivered',  color: '#5cb87a', bg: 'rgba(92,184,122,0.12)',  icon: '✓'  },
  cancelled:  { label: 'Cancelled',  color: '#8a7a6e', bg: 'rgba(138,122,110,0.12)', icon: '✕'  },
  refunded:   { label: 'Refunded',   color: '#e05c5c', bg: 'rgba(224,92,92,0.12)',   icon: '↩️' },
};

const TIMELINE_STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span
      className="op-badge"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

function OrderTimeline({ status }) {
  const currentIdx = TIMELINE_STEPS.indexOf(status);
  const isCancelled = status === 'cancelled' || status === 'refunded';

  if (isCancelled) {
    return (
      <div className="op-timeline-cancelled">
        <span>{STATUS_CONFIG[status]?.icon}</span>
        <span>Order {STATUS_CONFIG[status]?.label}</span>
      </div>
    );
  }

  return (
    <div className="op-timeline">
      {TIMELINE_STEPS.map((step, i) => {
        const done   = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step} className="op-timeline-step">
            <div className={`op-tl-dot ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
              {done ? '✓' : i + 1}
            </div>
            {i < TIMELINE_STEPS.length - 1 && (
              <div className={`op-tl-line ${done ? 'done' : ''}`} />
            )}
            <span className={`op-tl-label ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
              {STATUS_CONFIG[step]?.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({ order, expanded, onToggle }) {
  const shortId = order._id?.slice(-6).toUpperCase();
  const date    = new Date(order.createdAt).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  const itemCount = (order.items || []).reduce((s, i) => s + i.quantity, 0);

  return (
    <div className={`op-order-card ${expanded ? 'expanded' : ''}`}>

      {/* Card Header — always visible */}
      <button className="op-card-header" onClick={onToggle}>
        <div className="op-card-header-left">
          <div className="op-order-thumb-row">
            {(order.items || []).slice(0, 3).map((item, i) => (
              <div key={i} className="op-thumb">
                {item.productImage
                  ? <img src={item.productImage} alt={item.productName} />
                  : <span>💅</span>
                }
              </div>
            ))}
            {order.items?.length > 3 && (
              <div className="op-thumb op-thumb-more">+{order.items.length - 3}</div>
            )}
          </div>
          <div className="op-card-meta">
            <p className="op-order-ref">Order #{shortId}</p>
            <p className="op-order-date">{date} · {itemCount} item{itemCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="op-card-header-right">
          <span className="op-order-total">R{parseFloat(order.totalAmount || 0).toFixed(2)}</span>
          <StatusBadge status={order.status} />
          <span className="op-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="op-card-detail">

          {/* Timeline */}
          <div className="op-detail-section">
            <OrderTimeline status={order.status} />
          </div>

          {/* Items */}
          <div className="op-detail-section">
            <h3 className="op-detail-title">Items</h3>
            <div className="op-items-list">
              {(order.items || []).map((item, i) => (
                <div key={i} className="op-item-row">
                  <div className="op-item-img">
                    {item.productImage
                      ? <img src={item.productImage} alt={item.productName} />
                      : <span>💅</span>
                    }
                    <span className="op-item-qty-badge">{item.quantity}</span>
                  </div>
                  <div className="op-item-info">
                    <p className="op-item-name">{item.productName}</p>
                    <p className="op-item-price">R{parseFloat(item.unitPrice || 0).toFixed(2)} each</p>
                  </div>
                  <span className="op-item-line-total">
                    R{parseFloat(item.lineTotal || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals + Address in 2 cols */}
          <div className="op-detail-grid">

            <div className="op-detail-section">
              <h3 className="op-detail-title">Order Summary</h3>
              <div className="op-summary-rows">
                <div className="op-summary-row">
                  <span>Subtotal</span>
                  <span>R{parseFloat(order.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="op-summary-row">
                  <span>Shipping</span>
                  <span className={parseFloat(order.shippingFee || 0) === 0 ? 'op-free' : ''}>
                    {parseFloat(order.shippingFee || 0) === 0
                      ? 'FREE'
                      : `R${parseFloat(order.shippingFee).toFixed(2)}`
                    }
                  </span>
                </div>
                <div className="op-summary-row op-summary-row--total">
                  <span>Total</span>
                  <span>R{parseFloat(order.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="op-detail-section">
              <h3 className="op-detail-title">
                {order.fulfillmentType === 'pickup' ? '🏪 Salon Pickup' : '🚚 Delivery Address'}
              </h3>
              {order.fulfillmentType === 'pickup' ? (
                <div className="op-pickup-notice">
                  <p><strong>NXL Beauty Bar</strong></p>
                  <p>1948 Mahalefele Rd, Dube, Soweto, 1800</p>
                  <p>Mon–Sat 9AM–5PM · 068 511 3394</p>
                  <p style={{ marginTop:'0.5rem', color:'#86efac', fontSize:'0.8rem' }}>
                    We'll notify you via WhatsApp when your order is ready.
                  </p>
                </div>
              ) : (
                order.shippingAddress && (
                  <address className="op-address">
                    <strong>{order.shippingAddress.fullName}</strong>
                    <span>{order.shippingAddress.address}</span>
                    <span>{order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.postalCode}</span>
                    <span>{order.shippingAddress.phone}</span>
                  </address>
                )
              )}
              {order.trackingNumber && (
                <div className="op-tracking">
                  <span>📦 Tracking:</span>
                  <strong>{order.trackingNumber}</strong>
                </div>
              )}
            </div>

          </div>

          {order.notes && (
            <div className="op-detail-section">
              <h3 className="op-detail-title">Order Notes</h3>
              <p className="op-notes">{order.notes}</p>
            </div>
          )}

          {/* Footer actions */}
          <div className="op-card-actions">
            <Link to={`/track/${order._id}`} className="op-btn-track">📦 Track Order</Link>
            <a
              href={`https://wa.me/27685113394?text=Hi NXL Beauty Bar! I need help with order %23${shortId}`}
              target="_blank"
              rel="noreferrer"
              className="op-btn-whatsapp"
            >
              💬 Need Help?
            </a>
            <Link to="/shop" className="op-btn-shop">Shop Again</Link>
          </div>

        </div>
      )}

    </div>
  );
}

export default function OrdersPage() {
  const navigate = useNavigate();
  useSEO({ title: 'My Orders', url: '/orders', noIndex: true });
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [expanded, setExpanded] = useState(null);
  const [filter,   setFilter]   = useState('all');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login', { state: { from: '/orders' } }); return; }

    const fetchOrders = async () => {
      try {
        const res  = await fetch(`${API_BASE_URL}/shop/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setOrders(data.data);
          // Auto-expand the most recent order
          if (data.data.length > 0) setExpanded(data.data[0]._id);
        } else {
          setError(data.error || 'Could not load orders.');
        }
      } catch { setError('Network error. Please try again.'); }
      finally { setLoading(false); }
    };

    fetchOrders();
  }, [navigate]);

  const toggleOrder = (id) => setExpanded(prev => prev === id ? null : id);

  const filtered = filter === 'all'
    ? orders
    : orders.filter(o => o.status === filter);

  const FILTER_TABS = [
    { value: 'all',       label: 'All Orders' },
    { value: 'confirmed', label: 'Confirmed'  },
    { value: 'shipped',   label: 'Shipped'    },
    { value: 'delivered', label: 'Delivered'  },
    { value: 'cancelled', label: 'Cancelled'  },
  ];

  if (loading) return (
    <div className="op-root">
      <div className="op-loading">
        <div className="op-spinner" />
        <p>Loading your orders…</p>
      </div>
    </div>
  );

  return (
    <div className="op-root">

      {/* Top Bar */}
      <header className="op-topbar">
        <Link to="/shop" className="op-logo"><img src={nxlLogo} alt="" className="op-logo-img" /><span>NXL Beauty Bar</span></Link>
        <nav className="op-topbar-nav">
          <Link to="/shop">Shop</Link>
          <Link to="/cart">Cart</Link>
          <Link to="/dashboard">My Bookings</Link>
        </nav>
      </header>

      <div className="op-page">

        {/* Page Head */}
        <div className="op-page-head">
          <h1>My Orders</h1>
          <p className="op-page-sub">{orders.length} order{orders.length !== 1 ? 's' : ''} placed</p>
        </div>

        {error && (
          <div className="op-error-msg">{error}</div>
        )}

        {/* Filter tabs */}
        {orders.length > 0 && (
          <div className="op-filter-tabs">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.value}
                className={`op-filter-tab ${filter === tab.value ? 'active' : ''}`}
                onClick={() => setFilter(tab.value)}
              >
                {tab.label}
                {tab.value === 'all'
                  ? <span className="op-tab-count">{orders.length}</span>
                  : orders.filter(o => o.status === tab.value).length > 0
                    ? <span className="op-tab-count">{orders.filter(o => o.status === tab.value).length}</span>
                    : null
                }
              </button>
            ))}
          </div>
        )}

        {/* Orders list */}
        {filtered.length === 0 ? (
          <div className="op-empty">
            <div className="op-empty-icon">📦</div>
            {orders.length === 0 ? (
              <>
                <h2>No orders yet</h2>
                <p>You haven't placed any orders yet. Browse our products and find something you love!</p>
                <Link to="/shop" className="op-btn-gold">Start Shopping</Link>
              </>
            ) : (
              <>
                <h2>No {filter} orders</h2>
                <button className="op-btn-gold" onClick={() => setFilter('all')}>View All Orders</button>
              </>
            )}
          </div>
        ) : (
          <div className="op-orders-list">
            {filtered.map(order => (
              <OrderCard
                key={order._id}
                order={order}
                expanded={expanded === order._id}
                onToggle={() => toggleOrder(order._id)}
              />
            ))}
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="op-footer">
        <p>© {new Date().getFullYear()} NXL Beauty Bar · 1948 Mahalefele Rd, Dube, Soweto</p>
        <a
          href="https://wa.me/27685113394"
          target="_blank"
          rel="noreferrer"
          className="op-footer-wa"
        >
          💬 WhatsApp Support
        </a>
      </footer>

    </div>
  );
}