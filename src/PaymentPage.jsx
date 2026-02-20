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
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [country, setCountry] = useState('South Africa');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSuccess, setApiSuccess] = useState('');
  const [cardType, setCardType] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Initialize EmailJS from env variable
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

  // --- Card type detection ---
  const detectCardType = (num) => {
    const n = num.replace(/\s/g, '');
    if (/^4/.test(n)) return 'visa';
    if (/^5[1-5]/.test(n)) return 'mastercard';
    if (/^3[47]/.test(n)) return 'amex';
    return '';
  };

  // --- Card number formatting ---
  const formatCardNumber = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  // --- Expiry formatting ---
  const formatExpiry = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
    return digits;
  };

  const handleCardNumberChange = (e) => {
    const formatted = formatCardNumber(e.target.value);
    setCardNumber(formatted);
    setCardType(detectCardType(formatted));
    setFieldErrors(prev => ({ ...prev, cardNumber: '' }));
  };

  const handleExpiryChange = (e) => {
    setExpiry(formatExpiry(e.target.value));
    setFieldErrors(prev => ({ ...prev, expiry: '' }));
  };

  const handleCvcChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCvc(digits);
    setFieldErrors(prev => ({ ...prev, cvc: '' }));
  };

  // --- Validation ---
  const validate = () => {
    const errors = {};
    if (method === 'card') {
      const rawCard = cardNumber.replace(/\s/g, '');
      if (rawCard.length < 15 || rawCard.length > 16) {
        errors.cardNumber = 'Enter a valid 15–16 digit card number.';
      }
      const expiryMatch = expiry.replace(/\s/g, '').match(/^(\d{2})\/(\d{2})$/);
      if (!expiryMatch) {
        errors.expiry = 'Enter expiry as MM / YY.';
      } else {
        const [, mm, yy] = expiryMatch;
        const now = new Date();
        const expDate = new Date(2000 + parseInt(yy), parseInt(mm) - 1, 1);
        if (parseInt(mm) < 1 || parseInt(mm) > 12 || expDate < now) {
          errors.expiry = 'Card is expired or invalid month.';
        }
      }
      if (cvc.length < 3) {
        errors.cvc = 'Enter a valid CVC (3–4 digits).';
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // --- Submit ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

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

      const backendMethod = method === 'paypal' ? 'online' : 'card';
      const normalizedDeposit = Number.isFinite(BOOKING_FEE) && BOOKING_FEE > 0 ? BOOKING_FEE : 100;
      const total = Number(totalPrice ?? normalizedDeposit);
      const paymentAmount = total >= normalizedDeposit ? normalizedDeposit : total;

      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        setApiError('Invalid payment amount. Please refresh and try again.');
        setLoading(false);
        return;
      }

      const paymentType = total > normalizedDeposit ? 'deposit' : 'full';

      const paymentData = {
        appointmentId,
        amount: paymentAmount.toFixed(2),
        type: paymentType,
        method: backendMethod,
        status: 'paid',
      };

      const paymentRes = await fetchWithAuth(`${API_ROOT}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData),
      });
      const paymentResult = await paymentRes.json();

      if (paymentResult.success) {
        // Send email via EmailJS
        try {
          const mins = totalDuration % 60;
          const hrs = Math.floor(totalDuration / 60);
          const durationStr = hrs > 0 ? `${hrs}h ${mins > 0 ? mins + 'min' : ''}` : `${mins}min`;

          const emailParams = {
            customer_name: name,
            appointment_date: appointmentDate || dateTime,
            appointment_time: appointmentTime,
            services: Array.isArray(selectedServices) ? selectedServices.join(', ') : '',
            employee: selectedEmployee,
            total_price: `R${totalPrice}`,
            total_duration: durationStr,
            contact_number: contactNumber.replace(/\D/g, ''),
            salon_email: 'nxlbeautybar@gmail.com',
            salon_phone: '0685113394',
            email: email || 'nxlbeautybar@gmail.com',
          };

          const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_f0lbtzg';
          const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_sbxxbii';

          await emailjs.send(serviceId, templateId, emailParams);
          setApiSuccess(`Payment successful! Confirmation email sent to ${email}`);
        } catch (emailErr) {
          console.error('EmailJS error:', emailErr);
          setApiSuccess('Payment successful! Email confirmation could not be sent.');
        }

        setShowConfirmation(true);
        if (onSave) onSave({ method, country });
      } else {
        setApiError(paymentResult.error || 'Payment failed. Please try again.');
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

  const cardLogoSrc = {
    visa: 'https://upload.wikimedia.org/wikipedia/commons/0/04/Visa.svg',
    mastercard: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg',
    amex: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/American_Express_logo_%282018%29.svg',
  };

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
                className={`pp-method-btn ${method === 'paypal' ? 'pp-method-active' : ''}`}
                onClick={() => setMethod('paypal')}
              >
                <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" alt="PayPal" style={{ width: 20, height: 20 }} />
                PayPal
              </button>
            </div>

            <form onSubmit={handleSubmit} className="pp-form">
              {method === 'card' && (
                <>
                  {/* Card Number */}
                  <div className="pp-field">
                    <label className="pp-label">Card Number</label>
                    <div className={`pp-input-wrap ${fieldErrors.cardNumber ? 'pp-input-error' : ''}`}>
                      <input
                        type="text"
                        placeholder="1234 5678 9012 3456"
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        className="pp-input"
                        autoComplete="cc-number"
                        inputMode="numeric"
                      />
                      {cardType && cardLogoSrc[cardType] && (
                        <img src={cardLogoSrc[cardType]} alt={cardType} className="pp-card-logo" />
                      )}
                    </div>
                    {fieldErrors.cardNumber && <span className="pp-field-error">{fieldErrors.cardNumber}</span>}
                  </div>

                  {/* Expiry + CVC */}
                  <div className="pp-row">
                    <div className="pp-field">
                      <label className="pp-label">Expiry Date</label>
                      <input
                        type="text"
                        placeholder="MM / YY"
                        value={expiry}
                        onChange={handleExpiryChange}
                        className={`pp-input ${fieldErrors.expiry ? 'pp-input-error' : ''}`}
                        autoComplete="cc-exp"
                        inputMode="numeric"
                      />
                      {fieldErrors.expiry && <span className="pp-field-error">{fieldErrors.expiry}</span>}
                    </div>
                    <div className="pp-field">
                      <label className="pp-label">CVC</label>
                      <input
                        type="text"
                        placeholder="123"
                        value={cvc}
                        onChange={handleCvcChange}
                        className={`pp-input ${fieldErrors.cvc ? 'pp-input-error' : ''}`}
                        autoComplete="cc-csc"
                        inputMode="numeric"
                      />
                      {fieldErrors.cvc && <span className="pp-field-error">{fieldErrors.cvc}</span>}
                    </div>
                  </div>

                  {/* Country */}
                  <div className="pp-field">
                    <label className="pp-label">Country</label>
                    <select
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      className="pp-input pp-select"
                    >
                      <option value="South Africa">South Africa</option>
                      <option value="Namibia">Namibia</option>
                      <option value="Botswana">Botswana</option>
                      <option value="Zimbabwe">Zimbabwe</option>
                    </select>
                  </div>
                </>
              )}

              {method === 'paypal' && (
                <div className="pp-paypal-notice">
                  You will be redirected to PayPal to complete your R{BOOKING_FEE} payment securely.
                </div>
              )}

              {/* Secure badge */}
              <div className="pp-secure-badge">
                🔒 Secured with 256-bit SSL encryption
              </div>

              {apiError && <div className="pp-api-error">{apiError}</div>}
              {apiSuccess && <div className="pp-api-success">{apiSuccess}</div>}

              <button type="submit" className="pp-submit-btn" disabled={loading}>
                {loading ? (
                  <span className="pp-spinner-wrap">
                    <span className="pp-spinner" /> Processing...
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