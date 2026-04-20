import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import emailjs from '@emailjs/browser';
import './ConfirmationPopup.css';

// ─── Booking Policy data (moved from HomePage) ────────────────────────────────
const policyHighlights = new Set([0, 1, 5, 7, 10, 11, 12]);
const policyItems = [
  'Check availability (date & time) on the App or WhatsApp for an appointment.',
  'Non-refundable deposit of R100 or full amount confirms appointment.',
  'Send proof of payment.',
  'Payment must reflect before appointment.',
  'No e-wallet or cash send — money to be deposited straight into account.',
  'NO KIDS ALLOWED AT THE SALON.',
  'No nail polish or extensions on nails unless soak off or buff off was included.',
  'If you have something on your nails, you will be charged full soak off price to remove them.',
  'WE STRICTLY WORK FROM 9AM TO 5PM. Appointments before/after will be charged R50 extra per person.',
  'R50 will be charged for every 15 minutes you are late.',
  '30 minutes late — your appointment will be cancelled.',
  'Cancellation only allowed 48 hours prior. Failure will incur a penalty fee of R100.',
  'NO CASH. NO PAYMENT, NO APPOINTMENT. NO REFUND.',
  'ONLY THE PERSON WITH AN APPOINTMENT WILL BE ALLOWED IN THE SALON.',
];

function BookingPolicyCard() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      margin: '1.5rem auto 0',
      maxWidth: '480px',
      background: '#fff',
      border: '1px solid #e0ccc4',
      borderRadius: '16px',
      boxShadow: '0 4px 20px rgba(61,31,21,0.10)',
      overflow: 'hidden',
    }}>
      {/* Accordion toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, #3d1f15 0%, #6b3528 100%)',
          border: 'none',
          cursor: 'pointer',
          color: '#ffe8d6',
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: '0.88rem',
          letterSpacing: '0.05em',
        }}
      >
        <span>📋 Booking Policy & Important Rules</span>
        <span style={{ fontSize: '0.8rem', opacity: 0.8, transition: 'transform 0.3s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>

      {open && (
        <div style={{ padding: '1.25rem 1.5rem', textAlign: 'left', fontFamily: "'DM Sans', sans-serif" }}>
          <p style={{ fontSize: '0.82rem', color: '#6b3528', marginBottom: '0.75rem', lineHeight: 1.6, fontStyle: 'italic' }}>
            Due to clients not arriving on time and cancelling last minute, we have put this policy in place:
          </p>

          <ul style={{ paddingLeft: '1rem', margin: '0 0 1rem', listStyle: 'none', padding: 0 }}>
            {policyItems.map((item, i) => (
              <li
                key={i}
                style={{
                  fontSize: '0.8rem',
                  lineHeight: 1.8,
                  paddingLeft: '1.1rem',
                  position: 'relative',
                  color: policyHighlights.has(i) ? '#a0502e' : '#3d1f15',
                  fontWeight: policyHighlights.has(i) ? 700 : 400,
                }}
              >
                <span style={{ position: 'absolute', left: 0, top: '0.55em', width: '5px', height: '5px', background: policyHighlights.has(i) ? '#a0502e' : '#c07a5a', borderRadius: '50%', display: 'block' }} />
                {item}
              </li>
            ))}
          </ul>

          {/* Banking Details */}
          <div style={{
            background: 'linear-gradient(135deg, #fdf6f0 0%, #fce8db 100%)',
            border: '1px solid #e0ccc4',
            borderRadius: '10px',
            padding: '1rem',
            textAlign: 'center',
            marginTop: '0.5rem',
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#b08070', marginBottom: '0.4rem' }}>
              Banking Details
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#3d1f15' }}>6307553452</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6b3528', marginTop: '0.15rem' }}>FNB (NXLBEAUTYBAR)</div>
          </div>

          {/* Social */}
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#9e7060', textAlign: 'center', lineHeight: 1.9 }}>
            <div><b>Instagram:</b> @nxlbeautybar</div>
            <div><b>TikTok:</b> @nxlbeautybar</div>
            <div><b>Facebook:</b> nxlbeautybar</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PaymentSuccess ───────────────────────────────────────────────────────────
const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const [bookingDetails, setBookingDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailStatus, setEmailStatus] = useState('');
  const hasRun = useRef(false);

  const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const API_ROOT = RAW_API_BASE
    ? `${RAW_API_BASE.replace(/\/api$/, '')}/api`
    : '/api';

  const fetchAppointmentDetails = async (appointmentId, token) => {
    try {
      const res = await fetch(`${API_ROOT}/appointments/${appointmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success && result.data) {
        const appt = result.data;
        const totalPrice = appt.totalPrice?.$numberDecimal
          ? parseFloat(appt.totalPrice.$numberDecimal)
          : Number(appt.totalPrice) || 0;
        return {
          name: appt.userName ||
                `${appt.user?.firstName || ''} ${appt.user?.lastName || ''}`.trim() || 'Client',
          email: appt.user?.email || '',
          appointmentDate: appt.date || '',
          appointmentTime: appt.time || '',
          selectedServices: appt.services?.map(s => s.name).filter(Boolean) || [],
          selectedEmployee: appt.employee?.name || '',
          totalPrice,
          totalDuration: appt.totalDuration || 0,
          contactNumber: '',
        };
      }
    } catch (err) {
      console.error('Failed to fetch appointment details:', err);
    }
    return null;
  };

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    emailjs.init(import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'l7AiKNhYSfG_q4eot');

    const run = async () => {
      const params = new URLSearchParams(location.search);
      const appointmentId = params.get('appointmentId');

      let token = localStorage.getItem('token');
      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_ROOT}/auth/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          const refreshData = await refreshRes.json();
          if (refreshData.success && refreshData.token) {
            token = refreshData.token;
            localStorage.setItem('token', token);
          }
        } catch (e) {
          console.warn('Token refresh failed');
        }
      }

      let details = null;
      if (appointmentId && token) {
        details = await fetchAppointmentDetails(appointmentId, token);
      }
      if (!details) {
        try {
          const fromLocal = localStorage.getItem('pendingBooking');
          if (fromLocal) details = JSON.parse(fromLocal);
        } catch (e) {
          console.error('Failed to parse localStorage:', e);
        }
      }
      if (!details) {
        details = {
          name: 'Client', email: '',
          appointmentDate: '', appointmentTime: '',
          selectedServices: [], selectedEmployee: '',
          totalPrice: 0, totalDuration: 0,
        };
      }

      setBookingDetails(details);
      setLoading(false);

      if (appointmentId && token) {
        try {
          await fetch(`${API_ROOT}/payments/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ appointmentId }),
          });
        } catch (e) {
          console.warn('Verify call failed (webhook probably already did it)');
        }
      }

      if (details.email) {
        try {
          if (localStorage.getItem('emailSent') === details.email) {
            setEmailStatus('sent');
            return;
          }
          const durationStr = details.totalDuration
            ? `${Math.floor(details.totalDuration / 60)}h ${details.totalDuration % 60}min`.trim()
            : '30min';
          const emailParams = {
            customer_name: details.name,
            appointment_date: details.appointmentDate,
            appointment_time: details.appointmentTime,
            services: details.selectedServices.join(', '),
            employee: details.selectedEmployee,
            total_price: `R${details.totalPrice}`,
            total_duration: durationStr,
            contact_number: details.contactNumber || '',
            salon_email: 'nxlbeautybar@gmail.com',
            salon_phone: '0685113394',
            email: details.email,
          };
          const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_f0lbtzg';
          const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_sbxxbii';
          await emailjs.send(serviceId, templateId, emailParams);
          localStorage.setItem('emailSent', details.email);
          setEmailStatus('sent');
        } catch (err) {
          console.error('Email send failed:', err);
          setEmailStatus('error');
        }
      }
    };

    run();
  }, [location.search]);

  if (loading) {
    return <div className="cp-bg"><div className="cp-wrapper">Loading receipt...</div></div>;
  }

  const d = bookingDetails || {};
  const durationStr = d.totalDuration
    ? `${Math.floor(d.totalDuration / 60)}h ${d.totalDuration % 60}min`.trim()
    : '30min';

  const clearBookingData = () => {
    localStorage.removeItem('pendingBooking');
    localStorage.removeItem('emailSent');
    sessionStorage.removeItem('pendingBooking');
  };

  const handleSignOut = () => {
    clearBookingData();
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="cp-bg">
      <div className="cp-wrapper">
        {/* Success Icon */}
        <div className="cp-success-ring">
          <div className="cp-success-icon">✓</div>
        </div>
        <h1 className="cp-heading">Payment Successful!</h1>
        <p className="cp-subheading">
          Your appointment is secured.
          {emailStatus === 'sent' && ' A confirmation email has been sent to you.'}
          {emailStatus === 'error' && ' Email could not be sent, but your booking is confirmed.'}
        </p>

        {/* Receipt Card */}
        <div className="cp-card">
          <div className="cp-card-header">
            <span className="cp-logo-dot" />
            <span className="cp-salon-name">NXL Beauty Bar</span>
          </div>

          <div className="cp-divider" />

          <div className="cp-details">
            <div className="cp-detail-row">
              <span className="cp-detail-icon">👤</span>
              <div>
                <div className="cp-detail-label">Client</div>
                <div className="cp-detail-value">{d.name || 'Client'}</div>
              </div>
            </div>

            {d.appointmentDate && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">📅</span>
                <div>
                  <div className="cp-detail-label">Date & Time</div>
                  <div className="cp-detail-value">{d.appointmentDate} {d.appointmentTime}</div>
                </div>
              </div>
            )}

            {d.selectedServices?.length > 0 && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">💄</span>
                <div>
                  <div className="cp-detail-label">Services</div>
                  <div className="cp-detail-value">{d.selectedServices.join(', ')}</div>
                </div>
              </div>
            )}

            {d.selectedEmployee && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">👩‍💼</span>
                <div>
                  <div className="cp-detail-label">Stylist</div>
                  <div className="cp-detail-value">{d.selectedEmployee}</div>
                </div>
              </div>
            )}

            <div className="cp-detail-row">
              <span className="cp-detail-icon">⏱️</span>
              <div>
                <div className="cp-detail-label">Duration</div>
                <div className="cp-detail-value">{durationStr}</div>
              </div>
            </div>
          </div>

          <div className="cp-divider" />

          <div className="cp-pricing">
            <div className="cp-pricing-row">
              <span className="cp-pricing-label">Booking Fee Paid</span>
              <span className="cp-pricing-paid">R100.00 ✓</span>
            </div>
            {d.totalPrice > 0 && (
              <div className="cp-pricing-row">
                <span className="cp-pricing-label">Balance Due at Salon</span>
                <span className="cp-pricing-balance">
                  R{Math.max(0, Number(d.totalPrice) - 100).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Booking Policy — collapsed accordion ── */}
        <BookingPolicyCard />

        {/* Actions */}
        <div className="cp-actions">
          <button
            className="cp-book-btn"
            onClick={() => { clearBookingData(); navigate('/dashboard', { replace: true }); }}
          >
            Book Another Appointment
          </button>
          <button className="cp-print-btn" onClick={() => window.print()}>
            🖨️ Print Receipt
          </button>
          <button className="cp-signout-btn" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;