import React, { useState, useEffect } from 'react';
import './PaymentPage.css';
import { useAuth } from './AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

const PaymentPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Guard: redirect if no appointmentId
  useEffect(() => {
    if (!location.state?.appointmentId) {
      navigate('/dashboard', { replace: true });
    }
  }, [location.state, navigate]);

  // Booking info from navigation state (set by BookingSummary via handleBookingConfirmed)
  const name             = location.state?.name             || (user ? `${user.firstName} ${user.lastName}` : '');
  const email            = user?.email                      || '';
  const dateTime         = location.state?.dateTime         || '';
  const appointmentId    = location.state?.appointmentId;
  const totalPrice       = location.state?.totalPrice       ?? 0;
  const totalDuration    = location.state?.totalDuration    ?? 0;
  const selectedServices = location.state?.selectedServices ?? [];
  const selectedEmployee = location.state?.selectedEmployee ?? '';
  const appointmentDate  = location.state?.appointmentDate  ?? '';
  const appointmentTime  = location.state?.appointmentTime  ?? '';
  const contactNumber    = location.state?.contactNumber    ?? '';
  const BOOKING_FEE      = Number(import.meta.env.VITE_BOOKING_FEE ?? 100);

  const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const API_ROOT = RAW_API_BASE
    ? `${RAW_API_BASE.replace(/\/api$/, '')}/api`
    : '/api';

  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${API_ROOT}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const result = await res.json();
      if (result.success && result.token) {
        localStorage.setItem('token', result.token);
        return result.token;
      }
    } catch {}
    return null;
  };

  const fetchWithAuth = async (url, options = {}, retry = true) => {
    let token = localStorage.getItem('token');
    let res = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && retry) {
      token = await refreshAccessToken();
      if (token) {
        res = await fetch(url, {
          ...options,
          headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
        });
      }
    }
    return res;
  };

  // Submit: POST /payments with appointmentId → server creates Yoco checkout → redirect
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setApiError('');

    try {
      if (!localStorage.getItem('token')) {
        setApiError('You must be logged in to make a payment.');
        setLoading(false);
        return;
      }
      if (!appointmentId) {
        setApiError('Missing appointment ID. Please go back and book again.');
        setLoading(false);
        return;
      }

      // Save booking details so PaymentSuccess can send confirmation email
      localStorage.setItem('pendingBooking', JSON.stringify({
        name, email, dateTime,
        appointmentDate, appointmentTime,
        selectedServices, selectedEmployee,
        totalPrice, totalDuration, contactNumber,
      }));

      // POST /payments — server looks up appointment and creates Yoco checkout
      const res = await fetchWithAuth(`${API_ROOT}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      });

      const result = await res.json();

      if (result.success && result.checkoutUrl) {
        localStorage.setItem('yocoCheckoutId', result.checkoutId || '');
        // Redirect to Yoco hosted page — keep loading so button stays in "Redirecting..."
        window.location.href = result.checkoutUrl;
      } else {
        setApiError(result.error || 'Could not initiate payment. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Payment error:', err);
      setApiError('Payment failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="pp-bg">
      <div className="pp-wrapper">

        <button className="pp-back-btn" onClick={() => navigate('/dashboard')}>
          ← Back to Booking
        </button>

        <div className="pp-layout">

          {/* LEFT: Booking Summary */}
          <div className="pp-summary">
            <div className="pp-summary-header">
              <span className="pp-logo-dot" />
              <h2>NXL Beauty Bar</h2>
            </div>
            <div className="pp-summary-amount">
              <span className="pp-amount-label">Booking Fee (non-refundable)</span>
              <span className="pp-amount-value">R{BOOKING_FEE.toFixed(2)}</span>
            </div>
            <div className="pp-divider" />
            <div className="pp-summary-details">
              {selectedServices.length > 0 && (
                <div className="pp-detail-row">
                  <span className="pp-detail-icon">💄</span>
                  <div>
                    <div className="pp-detail-label">Services</div>
                    <div className="pp-detail-value">{selectedServices.join(', ')}</div>
                  </div>
                </div>
              )}
              {selectedEmployee && (
                <div className="pp-detail-row">
                  <span className="pp-detail-icon">👩‍💼</span>
                  <div>
                    <div className="pp-detail-label">Stylist</div>
                    <div className="pp-detail-value">{selectedEmployee}</div>
                  </div>
                </div>
              )}
              {dateTime && (
                <div className="pp-detail-row">
                  <span className="pp-detail-icon">📅</span>
                  <div>
                    <div className="pp-detail-label">Date & Time</div>
                    <div className="pp-detail-value">{dateTime}</div>
                  </div>
                </div>
              )}
              {totalDuration > 0 && (
                <div className="pp-detail-row">
                  <span className="pp-detail-icon">⏱️</span>
                  <div>
                    <div className="pp-detail-label">Duration</div>
                    <div className="pp-detail-value">{totalDuration} min</div>
                  </div>
                </div>
              )}
              {totalPrice > 0 && (
                <div className="pp-detail-row">
                  <span className="pp-detail-icon">💰</span>
                  <div>
                    <div className="pp-detail-label">Total Service Price</div>
                    <div className="pp-detail-value">R{totalPrice}</div>
                  </div>
                </div>
              )}
            </div>
            <div className="pp-divider" />
            <div className="pp-summary-note">
              The R{BOOKING_FEE} booking fee secures your appointment.
              The remaining balance is payable at the salon.
            </div>
          </div>

          {/* RIGHT: Payment Form */}
          <div className="pp-form-card">
            <h3 className="pp-form-title">Payment Details</h3>

            <div className="pp-methods">
              <div
                className="pp-method-btn pp-method-active"
                style={{ cursor: 'default', flex: 1, justifyContent: 'center' }}
              >
                <span>💳</span> Pay with Yoco
              </div>
            </div>

            <form onSubmit={handleSubmit} className="pp-form">

              <div className="pp-paypal-notice">
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🇿🇦</div>
                <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
                  Secure Payment via Yoco
                </p>
                <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
                  Clicking Pay below will redirect you to Yoco's secure hosted
                  payment page. Your card details are entered directly on Yoco —
                  we never see or store them.
                </p>
              </div>

              <div style={{
                display: 'flex', gap: '0.5rem', alignItems: 'center',
                justifyContent: 'center', padding: '0.6rem',
                background: '#f8fafc', borderRadius: '8px',
                border: '1px solid #e2e8f0', fontSize: '0.78rem',
                color: '#64748b', flexWrap: 'wrap',
              }}>
                <span>💳 Visa</span><span>·</span>
                <span>💳 Mastercard</span><span>·</span>
                <span>🏦 Instant EFT</span><span>·</span>
                <span>📱 Scan to Pay</span>
              </div>

              <div className="pp-secure-badge">
                🔒 Secured by Yoco — South Africa's trusted payment provider
              </div>

              {apiError && <div className="pp-api-error">{apiError}</div>}

              <button type="submit" className="pp-submit-btn" disabled={loading}>
                {loading ? (
                  <span className="pp-spinner-wrap">
                    <span className="pp-spinner" /> Redirecting to Yoco...
                  </span>
                ) : (
                  `Pay R${BOOKING_FEE.toFixed(2)} to Secure Booking`
                )}
              </button>

              <p className="pp-terms">
                By completing this payment you agree to our{' '}
                <a href="#">Terms & Conditions</a>.
                This booking fee is non-refundable.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;