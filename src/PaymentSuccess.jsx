import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import emailjs from '@emailjs/browser';
import './ConfirmationPopup.css';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [bookingDetails, setBookingDetails] = useState(null);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    emailjs.init(import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'l7AiKNhYSfG_q4eot');

    // Load booking details from localStorage
    const stored = localStorage.getItem('pendingBooking');
    const details = stored ? JSON.parse(stored) : {};
    setBookingDetails(details);

    const sendConfirmationEmail = async () => {
      try {
        if (!details.email) return;

        const { name, appointmentDate, appointmentTime, selectedServices,
                selectedEmployee, totalPrice, totalDuration, contactNumber, email } = details;

        const mins = totalDuration % 60;
        const hrs = Math.floor(totalDuration / 60);
        const durationStr = hrs > 0 ? `${hrs}h ${mins > 0 ? mins + 'min' : ''}` : `${mins}min`;

        const emailParams = {
          customer_name: name,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          services: Array.isArray(selectedServices) ? selectedServices.join(', ') : '',
          employee: selectedEmployee,
          total_price: `R${totalPrice}`,
          total_duration: durationStr,
          contact_number: String(contactNumber).replace(/\D/g, ''),
          salon_email: 'nxlbeautybar@gmail.com',
          salon_phone: '0685113394',
          email: email || 'nxlbeautybar@gmail.com',
        };

        const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_f0lbtzg';
        const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_sbxxbii';

        await emailjs.send(serviceId, templateId, emailParams);
        console.log('Confirmation email sent');
        localStorage.removeItem('pendingBooking');
      } catch (err) {
        console.error('EmailJS error:', err);
      }
    };

    sendConfirmationEmail();

    // Countdown timer
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate('/dashboard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [navigate]);

  // --- Build Google Calendar link ---
  const buildCalendarLink = () => {
    if (!bookingDetails?.appointmentDate || !bookingDetails?.appointmentTime) return '#';
    try {
      const { appointmentDate, appointmentTime, selectedServices, selectedEmployee, totalPrice, totalDuration } = bookingDetails;
      const startDate = new Date(`${appointmentDate}T${appointmentTime}`);
      if (isNaN(startDate.getTime())) return '#';
      const durationMs = (totalDuration || 60) * 60 * 1000;
      const endDate = new Date(startDate.getTime() + durationMs);

      const pad = (n) => String(n).padStart(2, '0');
      const toGoogleDate = (d) =>
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
        `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

      const dates = `${toGoogleDate(startDate)}/${toGoogleDate(endDate)}`;
      const text = encodeURIComponent('NXL Beauty Bar Appointment');
      const detailLines = [
        `Services: ${(selectedServices || []).join(', ')}`,
        selectedEmployee ? `Stylist: ${selectedEmployee}` : '',
        `Total: R${totalPrice}`,
      ].filter(Boolean);
      const details = encodeURIComponent(detailLines.join('\n'));
      const location = encodeURIComponent('NXL Beauty Bar • Johannesburg, ZA');

      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}&ctz=Africa/Johannesburg`;
    } catch {
      return '#';
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/', { replace: true });
  };

  const d = bookingDetails || {};
  const durationStr = d.totalDuration
    ? d.totalDuration >= 60
      ? `${Math.floor(d.totalDuration / 60)}h ${d.totalDuration % 60 > 0 ? (d.totalDuration % 60) + 'min' : ''}`.trim()
      : `${d.totalDuration}min`
    : '';

  return (
    <div className="cp-bg">
      <div className="cp-wrapper">

        {/* Success Icon */}
        <div className="cp-success-ring">
          <div className="cp-success-icon">
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <polyline
                points="8,20 16,28 30,12"
                stroke="#fff"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <h1 className="cp-heading">Payment Successful!</h1>
        <p className="cp-subheading">
          Your appointment is secured. A confirmation email has been sent to you.
          Redirecting to dashboard in {countdown}s...
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
                <span className="cp-pricing-balance">R{Math.max(0, d.totalPrice - 100).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Calendar Link */}
        
          href={buildCalendarLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="cp-calendar-btn"
        <a>
          <span>📆</span> Add to Google Calendar
        </a>

        {/* Actions */}
        <div className="cp-actions">
          <button className="cp-book-btn" onClick={() => navigate('/dashboard', { replace: true })}>
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