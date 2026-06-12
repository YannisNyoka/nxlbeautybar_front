import React, { useState } from 'react';
import './BookingSummary.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const DEPOSIT = 100;

// ─── BookingSummary ───────────────────────────────────────────────────────────
const BookingSummary = ({
  open, onClose,
  service, totalDuration, totalPrice,
  dateTime, appointmentDate, appointmentTime,
  name, email, contactNumber,
  onEdit, onContactNumberChange,
  selectedServices = [], servicesList = [],
  selectedEmployee = '', employeesList = [],
  selectedManicureType = '', selectedPedicureType = '',
  onBookingConfirmed,
}) => {
  const [localContact,   setLocalContact]   = useState(contactNumber || '');
  const [error,          setError]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const [apiError,       setApiError]       = useState('');

  // ── Payment panel state (shown after appointment is created) ──────────────
  const [payStep,        setPayStep]        = useState(false); // true = show pay panel
  const [appointmentId,  setAppointmentId]  = useState(null);
  const [loyaltyData,    setLoyaltyData]    = useState(null);
  const [usePoints,      setUsePoints]      = useState(false);
  const [discountInput,  setDiscountInput]  = useState('');
  const [discountResult, setDiscountResult] = useState(null);
  const [discountError,  setDiscountError]  = useState('');
  const [discountBusy,   setDiscountBusy]   = useState(false);
  const [paying,         setPaying]         = useState(false);

  const navigate = useNavigate();
  const { user, triggerAppointmentRefresh } = useAuth();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  // Resolve display name
  let displayName = name;
  if (!displayName?.trim() || displayName.includes('undefined')) {
    displayName = user?.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : 'Guest';
  }
  const displayEmail = email || user?.email || '';

  if (!open) return null;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const formatPhone = (val) => {
    const d = val.replace(/\D/g,'').slice(0,10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)} ${d.slice(3)}`;
    return `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`;
  };
  const validatePhone = (val) => { const d = val.replace(/\D/g,''); return d.length >= 9; };

  const refreshToken = async () => {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return null;
    try {
      const r = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ refreshToken: rt }),
      });
      const d = await r.json();
      if (d.success && d.token) { localStorage.setItem('token', d.token); return d.token; }
    } catch {}
    return null;
  };

  const authFetch = async (url, opts = {}, retry = true) => {
    let token = localStorage.getItem('token');
    let res = await fetch(url, { ...opts, headers: { ...(opts.headers||{}), Authorization:`Bearer ${token}` } });
    if (res.status === 401 && retry) {
      token = await refreshToken();
      if (token) res = await fetch(url, { ...opts, headers: { ...(opts.headers||{}), Authorization:`Bearer ${token}` } });
    }
    return res;
  };

  // ── STEP 1: Create appointment ─────────────────────────────────────────
  const handleConfirm = async () => {
    if (!localContact.trim()) { setError('Please enter your contact number.'); return; }
    if (!validatePhone(localContact)) { setError('Please enter a valid phone number (9–10 digits).'); return; }
    setError(''); setLoading(true); setApiError('');

    try {
      const token = localStorage.getItem('token');
      if (!token) { setApiError('You must be logged in to book.'); setLoading(false); return; }

      const emp = employeesList?.find(e => e.name === selectedEmployee);
      const employeeId = emp?._id || emp?.id || null;
      if (!employeeId) { setApiError('Invalid stylist selection.'); setLoading(false); return; }

      const serviceIds = servicesList?.length
        ? selectedServices.map(n => { const s = servicesList.find(x => x.name === n); return s?._id || s?.id || null; }).filter(Boolean)
        : [];
      if (!serviceIds.length) { setApiError('Please select at least one service.'); setLoading(false); return; }

      const res = await authFetch(`${API_BASE_URL}/appointments`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          date: appointmentDate, time: appointmentTime,
          employeeId, serviceIds,
          userName: displayName, contactNumber: localContact,
          stylist: selectedEmployee, totalPrice, totalDuration,
          manicureType: selectedManicureType, pedicureType: selectedPedicureType,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        const msg = result.error || 'Failed to create appointment';
        setApiError(msg.toLowerCase().includes('not available') || msg.toLowerCase().includes('already booked')
          ? 'This time slot is no longer available. Please select another time.'
          : msg);
        setLoading(false); return;
      }

      const apptId = result.data?._id || result.data?.id;
      if (!apptId) { setApiError('Failed to retrieve appointment ID.'); setLoading(false); return; }

      if (onBookingConfirmed) onBookingConfirmed({ appointmentId:apptId, _id:apptId, date:result.data.date, time:result.data.time, userName:displayName, status:result.data.status||'booked' });
      if (typeof triggerAppointmentRefresh === 'function') triggerAppointmentRefresh();

      setAppointmentId(apptId);

      // Load loyalty preview for this appointment
      try {
        const loyRes = await authFetch(`${API_BASE_URL}/loyalty/booking-preview/${apptId}`);
        const loyData = await loyRes.json();
        setLoyaltyData(loyData.success ? loyData.data : null);
      } catch { setLoyaltyData(null); }

      setPayStep(true); // Show payment panel
    } catch { setApiError('Network error. Please check your connection.'); }
    finally { setLoading(false); }
  };

  // ── Validate discount code ────────────────────────────────────────────
  const applyDiscount = async () => {
    if (!discountInput.trim()) return;
    setDiscountBusy(true); setDiscountError(''); setDiscountResult(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/discount-codes/validate-booking`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ code: discountInput.trim().toUpperCase(), appointmentId }),
      });
      const data = await res.json();
      if (data.success) setDiscountResult(data.data);
      else setDiscountError(data.error || 'Invalid or expired code.');
    } catch { setDiscountError('Could not validate code. Try again.'); }
    finally { setDiscountBusy(false); }
  };

  // ── STEP 2: Pay deposit via Yoco ──────────────────────────────────────
  const handlePay = async () => {
    setPaying(true);
    try {
      const pts  = usePoints && loyaltyData?.canRedeem ? loyaltyData.maxPointsUsable : 0;
      const code = discountResult?.code || null;

      // Save pendingBooking before redirect
      const userInfo = (() => { try { return JSON.parse(localStorage.getItem('userInfo')||'{}'); } catch { return {}; } })();
      localStorage.setItem('pendingBooking', JSON.stringify({
        appointmentId,
        name:                  displayName,
        email:                 displayEmail,
        appointmentDate,
        appointmentTime,
        selectedServices,
        selectedEmployee,
        totalPrice:            parseFloat(totalPrice || 0),
        totalDuration:         totalDuration || 60,
        loyaltyPointsRedeemed: pts,
        loyaltyBalanceDiscount:pts ? parseFloat((pts * 0.10).toFixed(2)) : 0,
        discountCode:          code,
        discountAmount:        discountResult?.discountAmount || 0,
      }));

      const res = await authFetch(`${API_BASE_URL}/payments`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          appointmentId,
          loyaltyPointsToRedeem: pts || undefined,
          discountCode:          code || undefined,
        }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setApiError(data.error || 'Could not initiate payment. Please try again.');
        setPaying(false);
      }
    } catch { setApiError('Payment failed. Please try again.'); setPaying(false); }
  };

  // ── Calculated values ─────────────────────────────────────────────────
  const balance    = Math.max(0, parseFloat(totalPrice||0) - DEPOSIT);
  const loyaltyOff = usePoints && loyaltyData?.canRedeem ? (loyaltyData.discountAmount || 0) : 0;
  const codeOff    = discountResult ? discountResult.discountAmount : 0;
  const balanceDue = Math.max(0, balance - loyaltyOff - codeOff);
  const totalSaved = loyaltyOff + codeOff;

  const serviceIcon = (n = '') => {
    const l = n.toLowerCase();
    if (l.includes('manicure')) return '💅';
    if (l.includes('pedicure')) return '🦶';
    if (l.includes('lash'))     return '👁️';
    return '✨';
  };

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="bs-overlay" onClick={e => e.target === e.currentTarget && !payStep && onClose()}>
      <div className="bs-modal">

        {/* ══ STEP 1: Booking Summary ══════════════════════════════════════ */}
        {!payStep && (<>
          <div className="bs-header">
            <div className="bs-header-left">
              <span className="bs-logo-dot" />
              <h2 className="bs-title">Booking Summary</h2>
            </div>
            <button className="bs-close-btn" onClick={onClose}>✕</button>
          </div>
          <div className="bs-divider" />

          {/* Services */}
          <div className="bs-section">
            <div className="bs-section-label">Services Selected</div>
            <div className="bs-services-list">
              {selectedServices.map((svcName, i) => {
                const svc = servicesList.find(s => s.name === svcName);
                return (
                  <div key={i} className="bs-service-chip">
                    <span className="bs-service-chip-icon">{serviceIcon(svcName)}</span>
                    <div className="bs-service-chip-info">
                      <span className="bs-service-chip-name">{svcName}</span>
                      {svc && <span className="bs-service-chip-meta">{svc.duration} min · R{svc.price}</span>}
                      {svcName === 'Manicure' && selectedManicureType && <span className="bs-service-chip-sub">{selectedManicureType}</span>}
                      {svcName === 'Pedicure' && selectedPedicureType && <span className="bs-service-chip-sub">{selectedPedicureType}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="bs-totals">
              <div className="bs-total-row"><span>Total Duration</span><span>{totalDuration} min</span></div>
              <div className="bs-total-row bs-total-price"><span>Total Price</span><span>R{parseFloat(totalPrice||0).toFixed(2)}</span></div>
            </div>
          </div>
          <div className="bs-divider" />

          {/* Appointment details */}
          <div className="bs-section">
            <div className="bs-section-label">Appointment Details</div>
            <div className="bs-detail-row">
              <span className="bs-detail-icon">📅</span>
              <span className="bs-detail-text">{dateTime || 'No date selected'}</span>
              <button className="bs-edit-btn" onClick={onEdit}>Edit</button>
            </div>
            <div className="bs-detail-row">
              <span className="bs-detail-icon">👩‍💼</span>
              <span className="bs-detail-text">{selectedEmployee || 'No stylist selected'}</span>
            </div>
          </div>
          <div className="bs-divider" />

          {/* Client details */}
          <div className="bs-section">
            <div className="bs-section-label">Your Details</div>
            <div className="bs-client-row"><span className="bs-client-label">Name</span><span className="bs-client-value">{displayName}</span></div>
            <div className="bs-client-row"><span className="bs-client-label">Email</span><span className="bs-client-value">{displayEmail}</span></div>
            <div className="bs-client-row bs-phone-row">
              <label className="bs-client-label" htmlFor="bs-phone">Contact</label>
              <div className="bs-phone-wrap">
                <span className="bs-phone-prefix">+27</span>
                <input id="bs-phone" type="tel" value={localContact}
                  onChange={e => { const f = formatPhone(e.target.value); setLocalContact(f); setError(''); if (onContactNumberChange) onContactNumberChange(f); }}
                  placeholder="071 234 5678"
                  className={`bs-phone-input ${error ? 'bs-phone-error' : ''}`}
                  inputMode="numeric" autoComplete="tel" />
              </div>
            </div>
            {(error || apiError) && <div className="bs-error-msg">{error || apiError}</div>}
          </div>

          <button className="bs-confirm-btn" onClick={handleConfirm} disabled={loading}>
            {loading
              ? <span className="bs-spinner-wrap"><span className="bs-spinner" /> Saving…</span>
              : 'Confirm & Proceed to Payment →'}
          </button>
          <p className="bs-note">A non-refundable booking fee of <strong>R{DEPOSIT}</strong> will be charged on the next step.</p>
        </>)}

        {/* ══ STEP 2: Pay — discount code + loyalty + Yoco ════════════════ */}
        {payStep && (<>
          <div className="bs-header">
            <div className="bs-header-left">
              <span className="bs-logo-dot" />
              <h2 className="bs-title">Confirm & Pay</h2>
            </div>
          </div>
          <div className="bs-divider" />

          {/* Price breakdown */}
          <div className="bs-section">
            <div className="bs-section-label">Payment Breakdown</div>
            <div className="bs-pay-breakdown">
              <div className="bs-pay-row">
                <span>Service Total</span>
                <span>R{parseFloat(totalPrice||0).toFixed(2)}</span>
              </div>
              <div className="bs-pay-row">
                <span>Deposit (pay now online)</span>
                <span className="bs-pay-green">R{DEPOSIT}.00</span>
              </div>
              {codeOff > 0 && (
                <div className="bs-pay-row">
                  <span>🎟️ Code: <strong>{discountResult.code}</strong></span>
                  <span className="bs-pay-green">− R{codeOff.toFixed(2)}</span>
                </div>
              )}
              {loyaltyOff > 0 && (
                <div className="bs-pay-row">
                  <span>⭐ {loyaltyData.maxPointsUsable} loyalty pts</span>
                  <span className="bs-pay-green">− R{loyaltyOff.toFixed(2)}</span>
                </div>
              )}
              <div className="bs-pay-row bs-pay-total">
                <div>
                  <span>Balance due at salon</span>
                  {totalSaved > 0 && <div className="bs-pay-saving">You save R{totalSaved.toFixed(2)}! 🎉</div>}
                </div>
                <span>R{balanceDue.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="bs-divider" />

          {/* Discount code */}
          <div className="bs-section">
            <div className="bs-section-label">🎟️ Discount Code</div>
            {discountResult ? (
              <div className="bs-discount-applied">
                <span>✅ {discountResult.code} — R{discountResult.discountAmount.toFixed(2)} off your balance</span>
                <button onClick={() => { setDiscountResult(null); setDiscountInput(''); setDiscountError(''); }}>✕</button>
              </div>
            ) : (
              <>
                <div className="bs-discount-row">
                  <input
                    type="text"
                    placeholder="Enter code e.g. REFAB1234"
                    value={discountInput}
                    onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(''); }}
                    onKeyDown={e => e.key === 'Enter' && applyDiscount()}
                    className={`bs-discount-input ${discountError ? 'bs-input-error' : ''}`}
                  />
                  <button
                    className="bs-discount-btn"
                    onClick={applyDiscount}
                    disabled={discountBusy || !discountInput.trim()}>
                    {discountBusy ? '…' : 'Apply'}
                  </button>
                </div>
                {discountError && <p className="bs-discount-error">⚠️ {discountError}</p>}
              </>
            )}
          </div>

          {/* Loyalty points toggle — only if they have redeemable points */}
          {loyaltyData?.canRedeem && loyaltyData.maxPointsUsable > 0 && (
            <>
              <div className="bs-divider" />
              <div className="bs-section">
                <div className="bs-section-label">⭐ Loyalty Points</div>
                <div className={`bs-loyalty-toggle ${usePoints ? 'active' : ''}`} onClick={() => setUsePoints(u => !u)}>
                  <div className={`bs-toggle-switch ${usePoints ? 'on' : ''}`}>
                    <div className="bs-toggle-thumb" />
                  </div>
                  <div className="bs-loyalty-info">
                    <p className="bs-loyalty-title">
                      Use {loyaltyData.maxPointsUsable} pts — save R{loyaltyData.discountAmount.toFixed(2)} off balance
                    </p>
                    <p className="bs-loyalty-sub">
                      You have {loyaltyData.currentPoints.toLocaleString()} pts · 100 pts = R10
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* No points tip */}
          {(!loyaltyData?.canRedeem) && (
            <p className="bs-loyalty-tip">💡 Earn 1 pt per R1 spent — points build up fast!</p>
          )}

          {apiError && <div className="bs-error-msg" style={{marginTop:'0.5rem'}}>{apiError}</div>}
          <div className="bs-divider" />

          <button className="bs-confirm-btn" onClick={handlePay} disabled={paying}>
            {paying
              ? <span className="bs-spinner-wrap"><span className="bs-spinner" /> Redirecting…</span>
              : `Pay R${DEPOSIT} Deposit → Yoco`}
          </button>
          <p className="bs-note">
            Deposit is always <strong>R{DEPOSIT}</strong> · Discounts reduce your balance at the salon.
          </p>
        </>)}

      </div>
    </div>
  );
};

export default BookingSummary;