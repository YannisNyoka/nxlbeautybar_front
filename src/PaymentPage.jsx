import React, { useState, useEffect } from 'react';
import './PaymentPage.css';
import { useAuth } from './AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

const DEPOSIT = Number(import.meta.env.VITE_BOOKING_FEE ?? 100);

const LOYALTY_CONFIG = {
  minRedemption: 100,
  pointValue: 0.10,
  maxRedemptionPct: 50,
};

const PaymentPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [loading,  setLoading]  = useState(false);
  const [apiError, setApiError] = useState('');

  // ── Loyalty + discount state ─────────────────────────────────────────────
  const [loyaltyData,    setLoyaltyData]    = useState(null); // from /loyalty/booking-preview
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);
  const [usePoints,      setUsePoints]      = useState(false);
  const [discountInput,  setDiscountInput]  = useState('');
  const [discountResult, setDiscountResult] = useState(null);
  const [discountError,  setDiscountError]  = useState('');
  const [discountBusy,   setDiscountBusy]   = useState(false);

  // Guard: redirect if no appointmentId
  useEffect(() => {
    if (!location.state?.appointmentId) {
      navigate('/dashboard', { replace: true });
    }
  }, [location.state, navigate]);

  // Booking info from navigation state
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

  const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const API_ROOT = RAW_API_BASE
    ? `${RAW_API_BASE.replace(/\/api$/, '')}/api`
    : '/api';

  const refreshAccessToken = async () => {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return null;
    try {
      const res = await fetch(`${API_ROOT}/auth/refresh-token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
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

  // ── Load loyalty preview for this appointment ────────────────────────────
  useEffect(() => {
    if (!appointmentId) return;
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_ROOT}/loyalty/booking-preview/${appointmentId}`);
        if (!res.ok) { 
          console.log('[LOYALTY] Endpoint returned', res.status, '— hiding loyalty section');
          setLoyaltyData(null); 
          return; 
        }
        const data = await res.json();
        console.log('[LOYALTY] Preview loaded:', data.data);
        setLoyaltyData(data.success ? data.data : null);
      } catch (err) {
        console.error('[LOYALTY] Load error:', err);
        setLoyaltyData(null);
      } finally {
        setLoyaltyLoading(false);
      }
    })();
  }, [appointmentId]);

  // ── Apply discount code ───────────────────────────────────────────────────
  const applyDiscount = async () => {
    if (!discountInput.trim()) return;
    setDiscountBusy(true); setDiscountError(''); setDiscountResult(null);
    try {
      const res = await fetchWithAuth(`${API_ROOT}/discount-codes/validate-booking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountInput.trim().toUpperCase(), appointmentId }),
      });
      if (!res.ok) {
        setDiscountError(res.status === 404 ? 'Discount codes are not available right now.' : 'Invalid or expired code.');
        return;
      }
      const data = await res.json();
      if (data.success) setDiscountResult(data.data);
      else setDiscountError(data.error || 'Invalid or expired code.');
    } catch {
      setDiscountError('Could not validate code. Try again.');
    } finally {
      setDiscountBusy(false);
    }
  };

  const removeDiscount = () => {
    setDiscountResult(null); setDiscountInput(''); setDiscountError('');
  };

  // ── Calculated breakdown ───────────────────────────────────────────────────
  const balance    = Math.max(0, Number(totalPrice || 0) - DEPOSIT);
  const loyaltyOff = usePoints && loyaltyData?.canRedeem ? (loyaltyData.discountAmount || 0) : 0;
  const codeOff    = discountResult ? discountResult.discountAmount : 0;
  const balanceDue = Math.max(0, balance - loyaltyOff - codeOff);
  const totalSaved = loyaltyOff + codeOff;

  // ── Submit: POST /payments → Yoco checkout ────────────────────────────────
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

      const pts  = usePoints && loyaltyData?.canRedeem ? loyaltyData.maxPointsUsable : 0;
      const code = discountResult?.code || null;

      // Save booking details + loyalty/discount info so PaymentSuccess can show them
      localStorage.setItem('pendingBooking', JSON.stringify({
        appointmentId, name, email, dateTime,
        appointmentDate, appointmentTime,
        selectedServices, selectedEmployee,
        totalPrice, totalDuration, contactNumber,
        loyaltyPointsRedeemed:   pts,
        loyaltyBalanceDiscount:  pts ? parseFloat((pts * (loyaltyData?.pointValue || 0.10)).toFixed(2)) : 0,
        discountCode:            code,
        discountAmount:          discountResult?.discountAmount || 0,
      }));

      // POST /payments — pass loyalty + discount selections
      // Points will be redeemed by POST /payments/verify after Yoco confirms payment
      const res = await fetchWithAuth(`${API_ROOT}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          loyaltyPointsToRedeem: pts || undefined,
          discountCode:          code || undefined,
        }),
      });

      const result = await res.json();

      if (result.success && result.checkoutUrl) {
        localStorage.setItem('yocoCheckoutId', result.checkoutId || '');
        console.log('[PAYMENT] Redirecting to Yoco for payment...');
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
              <span className="pp-amount-label">Deposit (Pay Now)</span>
              <span className="pp-amount-value">R{DEPOSIT.toFixed(2)}</span>
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
            </div>
            <div className="pp-divider" />

            {/* ── Payment breakdown ── */}
            <div className="pp-breakdown">
              <div className="pp-breakdown-row">
                <span>Service Total</span>
                <span>R{Number(totalPrice || 0).toFixed(2)}</span>
              </div>
              <div className="pp-breakdown-row">
                <span>Deposit (pay now)</span>
                <span className="pp-green">R{DEPOSIT.toFixed(2)}</span>
              </div>
              {codeOff > 0 && (
                <div className="pp-breakdown-row">
                  <span>🎟️ Code: {discountResult.code}</span>
                  <span className="pp-green">− R{codeOff.toFixed(2)}</span>
                </div>
              )}
              {loyaltyOff > 0 && (
                <div className="pp-breakdown-row">
                  <span>⭐ Using {loyaltyData.maxPointsUsable} pts</span>
                  <span className="pp-green">− R{loyaltyOff.toFixed(2)}</span>
                </div>
              )}
              {loyaltyOff > 0 && (
                <div className="pp-breakdown-row" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                  <span>Remaining pts after</span>
                  <span>{(loyaltyData.currentPoints - loyaltyData.maxPointsUsable).toLocaleString()}</span>
                </div>
              )}
              <div className="pp-breakdown-row pp-breakdown-total">
                <div>
                  <span>Balance due at salon</span>
                  {totalSaved > 0 && <div className="pp-saving">You save R{totalSaved.toFixed(2)}! 🎉</div>}
                </div>
                <span>R{balanceDue.toFixed(2)}</span>
              </div>
            </div>

            <div className="pp-divider" />
            <div className="pp-summary-note">
              The R{DEPOSIT.toFixed(2)} deposit secures your appointment and is paid online now.
              The remaining balance is payable at the salon.
            </div>
          </div>

          {/* RIGHT: Payment Form */}
          <div className="pp-form-card">
            <h3 className="pp-form-title">Payment Details</h3>

            {/* ── Discount code ── */}
            <div className="pp-field" style={{ marginBottom: '1.2rem' }}>
              <label className="pp-label">🎟️ Have a discount code?</label>
              {discountResult ? (
                <div className="pp-discount-applied">
                  <span>✅ {discountResult.code} — R{discountResult.discountAmount.toFixed(2)} off your balance</span>
                  <button type="button" onClick={removeDiscount}>✕</button>
                </div>
              ) : (
                <>
                  <div className="pp-discount-row">
                    <input
                      type="text"
                      className={`pp-input ${discountError ? 'pp-input-error' : ''}`}
                      placeholder="Enter code e.g. REFAB1234"
                      value={discountInput}
                      onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(''); }}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), applyDiscount())}
                      style={{ marginBottom: 0 }}
                    />
                    <button
                      type="button"
                      className="pp-discount-btn"
                      onClick={applyDiscount}
                      disabled={discountBusy || !discountInput.trim()}>
                      {discountBusy ? '…' : 'Apply'}
                    </button>
                  </div>
                  {discountError && <p className="pp-field-error">⚠️ {discountError}</p>}
                </>
              )}
            </div>

            {/* ── Loyalty points toggle ── */}
            {!loyaltyLoading && loyaltyData?.canRedeem && loyaltyData.maxPointsUsable > 0 && (
              <div className="pp-field" style={{ marginBottom: '1.2rem' }}>
                <label className="pp-label">⭐ Loyalty Points</label>
                <div className={`pp-loyalty-toggle ${usePoints ? 'active' : ''}`} onClick={() => {
                  setUsePoints(u => !u);
                  console.log('[LOYALTY] Toggled usePoints to', !usePoints, '— discountAmount:', loyaltyData.discountAmount);
                }}>
                  <div className={`pp-toggle-switch ${usePoints ? 'on' : ''}`}>
                    <div className="pp-toggle-thumb" />
                  </div>
                  <div className="pp-loyalty-info">
                    <p className="pp-loyalty-title">
                      Use {loyaltyData.maxPointsUsable} pts — save R{loyaltyData.discountAmount.toFixed(2)} off balance
                    </p>
                    <p className="pp-loyalty-sub">
                      You have {loyaltyData.currentPoints.toLocaleString()} pts · 100 pts = R10
                    </p>
                  </div>
                </div>
              </div>
            )}
            {!loyaltyLoading && !loyaltyData?.canRedeem && (
              <p className="pp-loyalty-tip">💡 Earn 1 pt per R1 spent on every booking.</p>
            )}

            <div className="pp-methods">
              <div className="pp-method-btn pp-method-active" style={{ cursor: 'default', flex: 1, justifyContent: 'center' }}>
                <span>💳</span> Pay with Yoco
              </div>
            </div>

            <form onSubmit={handleSubmit} className="pp-form">

              <div className="pp-paypal-notice">
                <div className="pp-secure-icon">🔒</div>
                <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Secure Payment via Yoco</p>
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
                  <span className="pp-spinner-wrap"><span className="pp-spinner" /> Redirecting to Yoco...</span>
                ) : (
                  `Pay R${DEPOSIT.toFixed(2)} Deposit →`
                )}
              </button>

              <p className="pp-terms">
                By completing this payment you agree to our{' '}
                <a href="#">Terms & Conditions</a>.
                This deposit is non-refundable.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;