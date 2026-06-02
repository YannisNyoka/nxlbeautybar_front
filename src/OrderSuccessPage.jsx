import nxlLogo from './assets/images/Logo.jpeg';
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import './OrderSuccessPage.css';
import { useSEO } from './useSEO';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export default function OrderSuccessPage() {
  const [searchParams]  = useSearchParams();
  const orderId         = searchParams.get('orderId');

  useSEO({ title: 'Order Confirmed', url: '/shop/order-success', noIndex: true });

  const [order,    setOrder]   = useState(null);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');

  useEffect(() => {
    if (!orderId) { setError('No order found.'); setLoading(false); return; }

    const confirm = async () => {
      const token = localStorage.getItem('token');
      try {
        // First verify / confirm the payment with the backend
        const verifyRes  = await fetch(`${API_BASE_URL}/shop/orders/verify`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ orderId }),
        });
        const verifyData = await verifyRes.json();

        if (!verifyData.success) {
          setError(verifyData.error || 'Could not confirm your order.');
          setLoading(false);
          return;
        }

        // Then fetch the full order details to display
        const orderRes  = await fetch(`${API_BASE_URL}/shop/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const orderData = await orderRes.json();

        if (orderData.success) setOrder(orderData.data);
        else setError('Order confirmed but could not load details.');
      } catch {
        setError('Network error. Your order may still have been placed — check My Orders.');
      } finally {
        setLoading(false);
      }
    };

    confirm();
  }, [orderId]);

  // ── Loading ──────────────────────────────────────────
  if (loading) return (
    <div className="osp-root">
      <div className="osp-loading">
        <div className="osp-spinner" />
        <p>Confirming your order…</p>
      </div>
    </div>
  );

  // ── Error ────────────────────────────────────────────
  if (error) return (
    <div className="osp-root">
      <header className="osp-topbar">
        <Link to="/shop" className="osp-logo"><img src={nxlLogo} alt="" className="osp-logo-img" /><span>NXL Beauty Bar</span></Link>
      </header>
      <div className="osp-error">
        <span>⚠️</span>
        <h2>Something went wrong</h2>
        <p>{error}</p>
        <div className="osp-error-actions">
          <Link to="/orders" className="osp-btn-gold">View My Orders</Link>
          <Link to="/shop"   className="osp-btn-outline">Continue Shopping</Link>
        </div>
      </div>
    </div>
  );

  const shortId = orderId?.slice(-6).toUpperCase() || '------';

  return (
    <div className="osp-root">

      {/* Top Bar */}
      <header className="osp-topbar">
        <Link to="/shop" className="osp-logo"><img src={nxlLogo} alt="" className="osp-logo-img" /><span>NXL Beauty Bar</span></Link>
        <nav className="osp-topbar-nav">
          <Link to="/shop">Shop</Link>
          <Link to="/orders">My Orders</Link>
        </nav>
      </header>

      {/* Success Hero */}
      <section className="osp-hero">
        <div className="osp-check-ring">
          <span className="osp-check">✓</span>
        </div>
        <h1 className="osp-hero-title">Order Confirmed!</h1>
        <p className="osp-hero-sub">
          Thank you{order?.shippingAddress?.fullName ? `, ${order.shippingAddress.fullName.split(' ')[0]}` : ''}!
          Your order <strong>#{shortId}</strong> has been placed successfully.
        </p>
        <p className="osp-email-note">
          A confirmation email has been sent to{' '}
          <strong>{order?.shippingAddress?.email || 'your email address'}</strong>
        </p>
      </section>

      {/* Order Details */}
      {order && (
        <div className="osp-layout">

          {/* Items */}
          <div className="osp-card">
            <h2 className="osp-card-title">Items Ordered</h2>
            <div className="osp-items">
              {(order.items || []).map((item, i) => (
                <div key={item.productId?.toString() || i} className="osp-item">
                  <div className="osp-item-img">
                    {item.productImage
                      ? <img src={item.productImage} alt={item.productName} />
                      : <span>💅</span>
                    }
                    <span className="osp-item-qty">{item.quantity}</span>
                  </div>
                  <div className="osp-item-info">
                    <p className="osp-item-name">{item.productName}</p>
                    <p className="osp-item-unit">R{parseFloat(item.unitPrice || 0).toFixed(2)} each</p>
                  </div>
                  <span className="osp-item-total">
                    R{parseFloat(item.lineTotal || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="osp-totals">
              <div className="osp-total-row">
                <span>Subtotal</span>
                <span>R{parseFloat(order.subtotal    || 0).toFixed(2)}</span>
              </div>
              <div className="osp-total-row">
                <span>{order.fulfillmentType === 'pickup' ? 'Pickup' : 'Shipping'}</span>
                <span className={parseFloat(order.shippingFee || 0) === 0 ? 'osp-free' : ''}>
                  {parseFloat(order.shippingFee || 0) === 0
                    ? order.fulfillmentType === 'pickup' ? '🏪 Free Pickup' : 'FREE'
                    : `R${parseFloat(order.shippingFee).toFixed(2)}`
                  }
                </span>
              </div>
              <div className="osp-total-row osp-total-row--grand">
                <span>Total Paid</span>
                <span>R{parseFloat(order.totalAmount || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shipping / Pickup Info */}
          <div className="osp-side">
            <div className="osp-card">
              {order.fulfillmentType === 'pickup' ? (
                <>
                  <h2 className="osp-card-title">📍 Salon Pickup</h2>
                  <div className="osp-pickup-info">
                    <p className="osp-pickup-name">NXL Beauty Bar</p>
                    <p>1948 Mahalefele Rd, Dube, Soweto, 1800</p>
                    <p>📞 068 511 3394</p>
                    <p>🕐 Mon–Sat 9AM–5PM</p>
                    <div className="osp-pickup-note">
                      We'll send you a WhatsApp when your order is ready to collect. Please bring your order number <strong>#{shortId}</strong>.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="osp-card-title">Delivery Address</h2>
                  {order.shippingAddress && (
                    <address className="osp-address">
                      <strong>{order.shippingAddress.fullName}</strong>
                      <span>{order.shippingAddress.address}</span>
                      <span>{order.shippingAddress.city}, {order.shippingAddress.province}</span>
                      <span>{order.shippingAddress.postalCode}</span>
                      <span>{order.shippingAddress.phone}</span>
                    </address>
                  )}
                </>
              )}
            </div>

            <div className="osp-card">
              <h2 className="osp-card-title">Order Status</h2>
              <div className="osp-status-timeline">
                {[
                  { label: 'Order Placed',   done: true,  active: false },
                  { label: 'Payment Confirmed', done: true, active: false },
                  { label: 'Processing',     done: false, active: true  },
                  { label: 'Shipped',        done: false, active: false },
                  { label: 'Delivered',      done: false, active: false },
                ].map((step, i) => (
                  <div key={i} className={`osp-timeline-step ${step.done ? 'done' : ''} ${step.active ? 'active' : ''}`}>
                    <div className="osp-timeline-dot" />
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>
              <p className="osp-tracking-note">
                We'll send you a tracking number once your order ships.
              </p>
            </div>

            {order.notes && (
              <div className="osp-card">
                <h2 className="osp-card-title">Order Notes</h2>
                <p className="osp-notes">{order.notes}</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Actions */}
      <div className="osp-actions">
        <Link to="/orders" className="osp-btn-gold">View All My Orders</Link>
        <Link to="/shop"   className="osp-btn-outline">Continue Shopping</Link>
        <a
          href={`https://wa.me/27685113394?text=Hi NXL Beauty Bar! My order reference is %23${shortId}`}
          target="_blank"
          rel="noreferrer"
          className="osp-btn-whatsapp"
        >
          💬 WhatsApp Us
        </a>
      </div>

      {/* Footer */}
      <footer className="osp-footer">
        <p>© {new Date().getFullYear()} NXL Beauty Bar · 1948 Mahalefele Rd, Dube, Soweto</p>
      </footer>

    </div>
  );
}