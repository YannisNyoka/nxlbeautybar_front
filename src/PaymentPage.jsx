import React, { useState, useEffect } from 'react';
import './PaymentPage.css';
import ConfirmationPopup from './ConfirmationPopup';
import { useAuth } from './AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import emailjs from '@emailjs/browser';

const PaymentPage = ({ onSave }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [method, setMethod] = useState('card');
  const [country, setCountry] = useState('South Africa');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSuccess, setApiSuccess] = useState('');

  // Initialize EmailJS
  useEffect(() => {
    const key = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'l7AiKNhYSfG_q4eot';
    emailjs.init(key);
  }, []);

  // --- Guard: redirect if no booking state ---
  useEffect(() => {
    if (!location.state?.appointmentId) {
      navigate('/dashboard', { replace: true });
    }
  }, [location.state, navigate]);

  // Booking info from navigation state
  const name = location.state?.name || (user ? `${user.firstName} ${user.lastName}` : '');
  const dateTime = location.state?.dateTime || '';
  const appointmentId = location.state?.appointmentId;
  const totalPrice = location.state?.totalPrice ?? 0;
  const totalDuration = location.state?.totalDuration ?? 0;
  const selectedServices = location.state?.selectedServices ?? [];
  const selectedEmployee = location.state?.selectedEmployee ?? '';
  const appointmentDate = location.state?.appointmentDate ?? '';
  const appointmentTime = location.state?.appointmentTime ?? '';
  const contactNumber = location.state?.contactNumber ?? '';
  const BOOKING_FEE = Number(import.meta.env.VITE_BOOKING_FEE ?? 100);
  const email = user?.email ?? '';

  const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const API_ROOT = RAW_API_BASE
    ? `${RAW_API_BASE.replace(/\/api$/, '')}/api`
    : '/api';

  // --- Token refresh ---
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

  // --- Submit: initiate PayFast payment ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setApiError('');
    setApiSuccess('');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setApiError('You must be logged in to make a payment.');
        setLoading(false);
        return;
      }
      if (!appointmentId) {
        setApiError('Missing appointment ID. Please go back and book again.');
        setLoading(false);
        return;
      }

      const normalizedDeposit = Number.isFinite(BOOKING_FEE) && BOOKING_FEE > 0 ? BOOKING_FEE : 100;
      const total = Number(totalPrice ?? normalizedDeposit);
      const paymentAmount = total >= normalizedDeposit ? normalizedDeposit : total;
      const paymentType = total > normalizedDeposit ? 'deposit' : 'full';

      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        setApiError('Invalid payment amount. Please refresh and try again.');
        setLoading(false);
        return;
      }

      const res = await fetchWithAuth(`${API_ROOT}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          amount: paymentAmount.toFixed(2),
          type: paymentType,
        }),
      });

      const result = await res.json();

      if (result.success) {
        // Build a hidden form and redirect user to PayFast's hosted payment page
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = result.pfUrl;

        Object.entries(result.pfData).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });

        // Save booking details so PaymentSuccess.jsx can send the confirmation email
        localStorage.setItem('pendingBooking', JSON.stringify({
          name,
          appointmentDate,
          appointmentTime,
          selectedServices,
          selectedEmployee,
          totalPrice,
          totalDuration,
          contactNumber,
          email,
        }));

        document.body.appendChild(form);
        form.submit();
      } else {
        setApiError(result.error || 'Could not initiate payment. Please try again.');
      }
    } catch (err) {
      console.error('Payment error:', err);
      setApiError('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showConfirmation) {
    return (
      <ConfirmationPopup
        name={name}
        dateTime={dateTime}
        selectedServices={selectedServices}
        selectedEmployee={selectedEmployee}
        totalPrice={totalPrice}
        totalDuration={totalDuration}
        contactNumber={contactNumber}
        selectedManicureType={location.state?.selectedManicureType || ''}
        selectedPedicureType={location.state?.selectedPedicureType || ''}
      />
    );
  }

  return (
    <div className="pp-bg">
      <div className="pp-wrapper">

        {/* Back button */}
        <button className="pp-back-btn" onClick={() => navigate('/dashboard')}>
          ← Back to Booking
        </button>

        <div className="pp-layout">

          {/* LEFT: Booking Summary Panel */}
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
              The R{BOOKING_FEE} booking fee secures your appointment. The remaining balance is payable at the salon.
            </div>
          </div>

          {/* RIGHT: Payment Form */}
          <div className="pp-form-card">
            <h3 className="pp-form-title">Payment Details</h3>

            {/* Method Tabs */}
            <div className="pp-methods">
              <button
                type="button"
                className={`pp-method-btn ${method === 'card' ? 'pp-method-active' : ''}`}
                onClick={() => setMethod('card')}
              >
                <span>💳</span> Card
              </button>
              <button
                type="button"
                className={`pp-method-btn ${method === 'eft' ? 'pp-method-active' : ''}`}
                onClick={() => setMethod('eft')}
              >
                <span>🏦</span> EFT
              </button>
            </div>

            <form onSubmit={handleSubmit} className="pp-form">

              {/* Card via PayFast */}
              {method === 'card' && (
                <div className="pp-paypal-notice">
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💳</div>
                  <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
                    Secure Card Payment via PayFast
                  </p>
                  <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
                    Clicking Pay below will redirect you to PayFast's secure hosted
                    payment page where you can safely enter your card details.
                  </p>
                </div>
              )}

              {/* EFT via PayFast */}
              {method === 'eft' && (
                <div className="pp-paypal-notice">
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏦</div>
                  <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
                    EFT Payment via PayFast
                  </p>
                  <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
                    Clicking Pay below will redirect you to PayFast where you can
                    complete your payment via Instant EFT.
                  </p>
                </div>
              )}

              {/* Secure badge */}
              <div className="pp-secure-badge">
                🔒 Secured with 256-bit SSL encryption via PayFast
              </div>

              {apiError && <div className="pp-api-error">{apiError}</div>}
              {apiSuccess && <div className="pp-api-success">{apiSuccess}</div>}

              <button type="submit" className="pp-submit-btn" disabled={loading}>
                {loading ? (
                  <span className="pp-spinner-wrap">
                    <span className="pp-spinner" /> Redirecting to PayFast...
                  </span>
                ) : (
                  `Pay R${BOOKING_FEE.toFixed(2)} to Secure Booking`
                )}
              </button>

              <p className="pp-terms">
                By completing this payment you agree to our <a href="#">Terms & Conditions</a>.
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