import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import emailjs from '@emailjs/browser';
import './ConfirmationPopup.css';

const PaymentSuccess = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { logout } = useAuth();
  const [bookingDetails, setBookingDetails] = useState(null);
  const [emailStatus, setEmailStatus] = useState('');
  const hasRun = useRef(false);

  const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const API_ROOT = RAW_API_BASE
    ? `${RAW_API_BASE.replace(/\/api$/, '')}/api`
    : '/api';

  const updateAppointmentStatus = async (appointmentId, token) => {
    try {
      const res = await fetch(`${API_ROOT}/appointments/${appointmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          status:        'booked',
          paymentStatus: 'deposit_paid',
        }),
      });
      const result = await res.json();
      if (result.success) {
        console.log('Appointment updated to booked + deposit_paid', { appointmentId });
      } else if (
        result.error?.includes('Invalid status transition') ||
        result.error?.includes('already booked')
      ) {
        console.log('Appointment already booked by webhook — no action needed', { appointmentId });
      } else {
        console.warn('Appointment update non-success:', result.error);
      }
    } catch (err) {
      console.error('Appointment update error:', err);
    }
  };

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    emailjs.init(import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'l7AiKNhYSfG_q4eot');

    const run = async () => {
      // ── Step 1: get appointmentId from URL ──────────────────────────
      const params        = new URLSearchParams(location.search);
      const appointmentId = params.get('appointmentId');

      // ── Step 2: load whatever localStorage has (may be empty in prod) ─
      let localDetails = {};
      try {
        const fromLocal   = localStorage.getItem('pendingBooking');
        const fromSession = sessionStorage.getItem('pendingBooking');
        if (fromLocal)   localDetails = JSON.parse(fromLocal);
        else if (fromSession) localDetails = JSON.parse(fromSession);
      } catch (e) {
        console.error('Could not parse localStorage booking details:', e);
      }

      // ── Step 3: refresh token ────────────────────────────────────────
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
            console.log('Token refreshed successfully');
          }
        } catch (e) {
          console.warn('Token refresh failed, using existing token:', e);
        }
      }

      // ── Step 4: fetch appointment from API (reliable in production) ──
      let details = { ...localDetails };

      if (appointmentId && token) {
        try {
          const res = await fetch(`${API_ROOT}/appointments/${appointmentId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const result = await res.json();

          if (result.success && result.data) {
            const appt = result.data;

            const totalPrice = appt.totalPrice?.$numberDecimal
              ? parseFloat(appt.totalPrice.$numberDecimal)
              : Number(appt.totalPrice) || localDetails.totalPrice || 0;

            details = {
              name:             appt.userName
                                  || `${appt.user?.firstName || ''} ${appt.user?.lastName || ''}`.trim()
                                  || localDetails.name
                                  || '',
              email:            appt.user?.email      || localDetails.email            || '',
              appointmentDate:  appt.date              || localDetails.appointmentDate  || '',
              appointmentTime:  appt.time              || localDetails.appointmentTime  || '',
              selectedServices: appt.services?.map(s => s.name).filter(Boolean)
                                  || localDetails.selectedServices
                                  || [],
              selectedEmployee: appt.employee?.name   || localDetails.selectedEmployee || '',
              totalPrice,
              totalDuration:    appt.totalDuration     || localDetails.totalDuration    || 0,
              // contactNumber is not stored on appointment — keep from localStorage
              contactNumber:    localDetails.contactNumber || '',
            };

            console.log('Booking details loaded from API:', details);
          } else {
            console.warn('API fetch failed, falling back to localStorage:', result.error);
          }
        } catch (e) {
          console.error('Failed to fetch appointment from API:', e);
        }
      } else {
        console.warn('No appointmentId or token — using localStorage only');
      }

      setBookingDetails(details);

      // ── Step 5: mark appointment as booked + deposit_paid ────────────
      if (appointmentId && token) {
        await updateAppointmentStatus(appointmentId, token);
      }

      // ── Step 6: send confirmation email ─────────────────────────────
      const sendConfirmationEmail = async () => {
        try {
          if (!details.email) {
            console.warn('No email found in booking details, skipping email');
            setEmailStatus('no-email');
            return;
          }

          if (localStorage.getItem('emailSent') === details.email) {
            console.log('Email already sent for this booking, skipping');
            setEmailStatus('sent');
            return;
          }

          const totalDur = Number(details.totalDuration) || 0;
          const mins = totalDur % 60;
          const hrs  = Math.floor(totalDur / 60);
          const durationStr = hrs > 0
            ? `${hrs}h ${mins > 0 ? mins + 'min' : ''}`.trim()
            : `${mins}min`;

          const emailParams = {
            customer_name:    details.name             || '',
            appointment_date: details.appointmentDate  || '',
            appointment_time: details.appointmentTime  || '',
            services:         Array.isArray(details.selectedServices)
                                ? details.selectedServices.join(', ')
                                : '',
            employee:         details.selectedEmployee || '',
            total_price:      `R${details.totalPrice  || 0}`,
            total_duration:   durationStr,
            contact_number:   String(details.contactNumber || '').replace(/\D/g, ''),
            salon_email:      'nxlbeautybar@gmail.com',
            salon_phone:      '0685113394',
            email:            details.email,
          };

          console.log('Sending email with params:', emailParams);

          localStorage.setItem('emailSent', details.email);

          const serviceId  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || 'service_f0lbtzg';
          const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_sbxxbii';

          await emailjs.send(serviceId, templateId, emailParams);
          console.log('Confirmation email sent successfully');
          setEmailStatus('sent');
        } catch (err) {
          console.error('EmailJS error:', err);
          localStorage.removeItem('emailSent');
          setEmailStatus('error');
        }
      };

      await sendConfirmationEmail();
    };

    run();
  }, []);

  const clearBookingData = () => {
    localStorage.removeItem('pendingBooking');
    localStorage.removeItem('emailSent');
    sessionStorage.removeItem('pendingBooking');
  };

  const buildCalendarLink = () => {
    if (!bookingDetails?.appointmentDate || !bookingDetails?.appointmentTime) return '#';
    try {
      const {
        appointmentDate, appointmentTime, selectedServices,
        selectedEmployee, totalPrice, totalDuration,
      } = bookingDetails;

      const convertTo24Hour = (timeStr) => {
        const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
        if (!m) return timeStr;
        let hh = parseInt(m[1], 10);
        const mm  = m[2];
        const ampm = m[3]?.toLowerCase();
        if (ampm === 'pm' && hh !== 12) hh += 12;
        if (ampm === 'am' && hh === 12) hh = 0;
        return `${String(hh).padStart(2, '0')}:${mm}`;
      };

      const time24    = convertTo24Hour(appointmentTime);
      const startDate = new Date(`${appointmentDate}T${time24}`);
      if (isNaN(startDate.getTime())) return '#';

      const durationMs = (Number(totalDuration) || 60) * 60 * 1000;
      const endDate    = new Date(startDate.getTime() + durationMs);

      const pad          = (n) => String(n).padStart(2, '0');
      const toGoogleDate = (d) =>
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
        `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

      const dates      = `${toGoogleDate(startDate)}/${toGoogleDate(endDate)}`;
      const text       = encodeURIComponent('NXL Beauty Bar Appointment');
      const detailLines = [
        `Services: ${(selectedServices || []).join(', ')}`,
        selectedEmployee ? `Stylist: ${selectedEmployee}` : '',
        `Total: R${totalPrice}`,
      ].filter(Boolean);
      const calDetails  = encodeURIComponent(detailLines.join('\n'));
      const calLocation = encodeURIComponent('NXL Beauty Bar • Johannesburg, ZA');

      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${calDetails}&location=${calLocation}&ctz=Africa/Johannesburg`;
    } catch {
      return '#';
    }
  };

  const handleSignOut = () => {
    clearBookingData();
    logout();
    navigate('/', { replace: true });
  };

  const d = bookingDetails || {};
  const durationStr = d.totalDuration
    ? Number(d.totalDuration) >= 60
      ? `${Math.floor(Number(d.totalDuration) / 60)}h ${Number(d.totalDuration) % 60 > 0 ? (Number(d.totalDuration) % 60) + 'min' : ''}`.trim()
      : `${d.totalDuration}min`
    : '';

  return (
    <div className="cp-bg">
      <div className="cp-wrapper">

        {/* Success Icon */}
        <div className="cp-success-ring">
          <div className="cp-success-icon">
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <polyline points="8,20 16,28 30,12" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <h1 className="cp-heading">Payment Successful!</h1>
        <p className="cp-subheading">
          Your appointment is secured.{' '}
          {emailStatus === 'sent'     && 'A confirmation email has been sent to you.'}
          {emailStatus === 'error'    && 'Email could not be sent, but your booking is confirmed.'}
          {emailStatus === 'no-email' && 'Your booking is confirmed.'}
        </p>

        {/* Summary Card */}
        <div className="cp-card">
          <div className="cp-card-header">
            <span className="cp-logo-dot" />
            <span className="cp-salon-name">NXL Beauty Bar</span>
          </div>

          <div className="cp-divider" />

          <div className="cp-details">
            {d.name && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">👤</span>
                <div>
                  <div className="cp-detail-label">Client</div>
                  <div className="cp-detail-value">{d.name}</div>
                </div>
              </div>
            )}
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
            {durationStr && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">⏱️</span>
                <div>
                  <div className="cp-detail-label">Duration</div>
                  <div className="cp-detail-value">{durationStr}</div>
                </div>
              </div>
            )}
            {d.contactNumber && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">📞</span>
                <div>
                  <div className="cp-detail-label">Contact</div>
                  <div className="cp-detail-value">{d.contactNumber}</div>
                </div>
              </div>
            )}
          </div>

          <div className="cp-divider" />

          {/* Pricing */}
          <div className="cp-pricing">
            <div className="cp-pricing-row">
              <span className="cp-pricing-label">Booking Fee Paid</span>
              <span className="cp-pricing-paid">R100.00 ✓</span>
            </div>
            {d.totalPrice > 0 && (
              <div className="cp-pricing-row">
                <span className="cp-pricing-label">Balance Due at Salon</span>
                <span className="cp-pricing-balance">R{Math.max(0, Number(d.totalPrice) - 100).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Calendar Link */}
        <a href={buildCalendarLink()} target="_blank" rel="noopener noreferrer" className="cp-calendar-btn">
          <span>📆</span> Add to Google Calendar
        </a>

        {/* Actions */}
        <div className="cp-actions">
          <button className="cp-book-btn" onClick={() => { clearBookingData(); navigate('/dashboard', { replace: true }); }}>
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