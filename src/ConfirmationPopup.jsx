import React from 'react';
import './ConfirmationPopup.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const ConfirmationPopup = ({
  name = '',
  dateTime = '',
  onBookAnother,
  selectedManicureType = '',
  selectedPedicureType = '',
  selectedServices = [],
  selectedEmployee = '',
  totalPrice = 0,
  totalDuration = 0,
  contactNumber = '',
}) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // --- Build Google Calendar link ---
  const buildCalendarLink = () => {
    if (!dateTime) return '#';
    try {
      // Expected: "February 2026 20, 10:30 am"
      const match = dateTime.match(/(\w+)\s+(\d{4})\s+(\d+),\s+(.+)/);
      if (!match) return '#';
      const [, month, year, day, time] = match;
      const startDate = new Date(`${month} ${day}, ${year} ${time}`);
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
        `Services: ${selectedServices.join(', ')}`,
        selectedEmployee ? `Stylist: ${selectedEmployee}` : '',
        selectedManicureType ? `Manicure type: ${selectedManicureType}` : '',
        selectedPedicureType ? `Pedicure type: ${selectedPedicureType}` : '',
        `Total: R${totalPrice}`,
      ].filter(Boolean);
      const details = encodeURIComponent(detailLines.join('\n'));
      const location = encodeURIComponent('NXL Beauty Bar • Johannesburg, ZA');

      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}&ctz=Africa/Johannesburg`;
    } catch {
      return '#';
    }
  };

  const handleBookAnother = () => {
    if (onBookAnother) onBookAnother();
    // Replace history entry so back button doesn't return to payment
    navigate('/dashboard', { replace: true });
  };

  const handleSignOut = () => {
    logout();
    navigate('/', { replace: true });
  };

  const handlePrint = () => {
    window.print();
  };

  const durationStr = totalDuration
    ? totalDuration >= 60
      ? `${Math.floor(totalDuration / 60)}h ${totalDuration % 60 > 0 ? (totalDuration % 60) + 'min' : ''}`.trim()
      : `${totalDuration}min`
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
        <h1 className="cp-heading">Booking Confirmed!</h1>
        <p className="cp-subheading">
          Your appointment is secured. A confirmation email has been sent to you.
        </p>

        {/* Summary Card */}
        <div className="cp-card">
          <div className="cp-card-header">
            <span className="cp-logo-dot" />
            <span className="cp-salon-name">NXL Beauty Bar</span>
          </div>

          <div className="cp-divider" />

          <div className="cp-details">
            {name && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">👤</span>
                <div>
                  <div className="cp-detail-label">Client</div>
                  <div className="cp-detail-value">{name}</div>
                </div>
              </div>
            )}
            {dateTime && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">📅</span>
                <div>
                  <div className="cp-detail-label">Date & Time</div>
                  <div className="cp-detail-value">{dateTime}</div>
                </div>
              </div>
            )}
            {selectedServices.length > 0 && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">💄</span>
                <div>
                  <div className="cp-detail-label">Services</div>
                  <div className="cp-detail-value">{selectedServices.join(', ')}</div>
                  {selectedManicureType && (
                    <div className="cp-detail-subvalue">Manicure: {selectedManicureType}</div>
                  )}
                  {selectedPedicureType && (
                    <div className="cp-detail-subvalue">Pedicure: {selectedPedicureType}</div>
                  )}
                </div>
              </div>
            )}
            {selectedEmployee && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">👩‍💼</span>
                <div>
                  <div className="cp-detail-label">Stylist</div>
                  <div className="cp-detail-value">{selectedEmployee}</div>
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
            {contactNumber && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">📞</span>
                <div>
                  <div className="cp-detail-label">Contact</div>
                  <div className="cp-detail-value">{contactNumber}</div>
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
            {totalPrice > 0 && (
              <div className="cp-pricing-row">
                <span className="cp-pricing-label">Balance Due at Salon</span>
                <span className="cp-pricing-balance">R{Math.max(0, totalPrice - 100).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Calendar Link */}
        <a
          href={buildCalendarLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="cp-calendar-btn"
        >
          <span>📆</span> Add to Google Calendar
        </a>

        {/* Actions */}
        <div className="cp-actions">
          <button className="cp-book-btn" onClick={handleBookAnother}>
            Book Another Appointment
          </button>
          <button className="cp-print-btn" onClick={handlePrint}>
            🖨️ Print Receipt
          </button>
          <button className="cp-signout-btn" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>

        {/* Footer bar */}
        
      </div>
    </div>
  );
};

export default ConfirmationPopup;