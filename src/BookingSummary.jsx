import React, { useState } from 'react';
import './BookingSummary.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const BookingSummary = ({
  open,
  onClose,
  service,
  totalDuration,
  totalPrice,
  dateTime,
  appointmentDate,
  appointmentTime,
  name,
  email,
  contactNumber,
  onEdit,
  onContactNumberChange,
  selectedServices = [],
  servicesList = [],
  selectedEmployee = '',
  employeesList = [],
  selectedManicureType = '',
  selectedPedicureType = '',
  onBookingConfirmed
}) => {
  const [localContact, setLocalContact] = useState(contactNumber || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSuccess, setApiSuccess] = useState('');
  const navigate = useNavigate();
  const { user, triggerAppointmentRefresh } = useAuth();

  // Resolve display name
  let displayName = name;
  if (
    !displayName ||
    displayName.trim() === '' ||
    displayName.includes('undefined') ||
    displayName.trim() === 'undefined undefined'
  ) {
    if (user?.firstName && user?.lastName) {
      displayName = `${user.firstName} ${user.lastName}`.trim();
    } else if (user?.firstName) {
      displayName = user.firstName.trim();
    } else if (user?.lastName) {
      displayName = user.lastName.trim();
    } else {
      displayName = 'Guest';
    }
  }
  const displayEmail = email || user?.email || '';

  if (!open) return null;

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  // --- Phone number formatting (SA format) ---
  const formatPhone = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  };

  // --- Phone validation ---
  const validatePhone = (val) => {
    const digits = val.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 10;
  };

  const handleContactChange = (e) => {
    const formatted = formatPhone(e.target.value);
    setLocalContact(formatted);
    setError('');
    if (onContactNumberChange) onContactNumberChange(formatted);
  };

  // --- Token refresh ---
  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const result = await response.json();
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

  const handleConfirm = async () => {
    if (!localContact.trim()) {
      setError('Please enter your contact number before confirming.');
      return;
    }
    if (!validatePhone(localContact)) {
      setError('Please enter a valid South African phone number (9–10 digits).');
      return;
    }
    setError('');
    setLoading(true);
    setApiError('');
    setApiSuccess('');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setApiError('You must be logged in to book an appointment.');
        setLoading(false);
        return;
      }

      // Resolve employeeId
      let employeeId = null;
      if (employeesList?.length) {
        const emp = employeesList.find((e) => e.name === selectedEmployee);
        employeeId = emp?._id || emp?.id || null;
      }
      if (!employeeId) {
        setApiError('Invalid stylist selection. Please select a valid stylist.');
        setLoading(false);
        return;
      }

      // Resolve serviceIds
      const serviceIds = (servicesList?.length
        ? selectedServices
            .map((sName) => {
              const svc = servicesList.find((s) => s.name === sName);
              return svc?._id || svc?.id || null;
            })
            .filter(Boolean)
        : []);
      if (!serviceIds.length) {
        setApiError('Invalid service selection. Please select at least one valid service.');
        setLoading(false);
        return;
      }

      const appointmentPayload = {
        date: appointmentDate || '',
        time: appointmentTime || '',
        employeeId,
        serviceIds,
        userName: displayName,
        contactNumber: localContact,
        stylist: selectedEmployee,
        totalPrice,
        totalDuration,
        manicureType: selectedManicureType,
        pedicureType: selectedPedicureType,
      };

      const res = await fetchWithAuth(`${API_BASE_URL}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appointmentPayload),
      });
      const appointmentResult = await res.json();

      if (!appointmentResult.success) {
        const errorMsg = appointmentResult.error || 'Failed to create appointment';
        if (
          errorMsg.toLowerCase().includes('not available') ||
          errorMsg.toLowerCase().includes('already booked') ||
          errorMsg.toLowerCase().includes('time slot')
        ) {
          setApiError('This time slot is no longer available. Please select another time.');
        } else {
          setApiError(errorMsg);
        }
        setLoading(false);
        return;
      }

      const createdAppointment = appointmentResult.data;
      const appointmentId = createdAppointment?._id || createdAppointment?.id;
      if (!appointmentId) {
        setApiError('Failed to retrieve appointment ID. Please try again.');
        setLoading(false);
        return;
      }

      // Notify dashboard of new booking
      if (onBookingConfirmed) {
        onBookingConfirmed({
          appointmentId,
          _id: appointmentId,
          date: createdAppointment.date,
          time: createdAppointment.time,
          userName: displayName,
          serviceType: selectedServices.join(', '),
          duration: totalDuration,
          status: createdAppointment.status || 'booked',
        });
      }

      if (typeof triggerAppointmentRefresh === 'function') {
        triggerAppointmentRefresh();
      }

      setApiSuccess('Appointment saved! Redirecting to payment...');

      setTimeout(() => {
        navigate('/payment', {
          state: {
            name: displayName,
            dateTime,
            appointmentId,
            appointmentDate,
            appointmentTime,
            selectedServices,
            selectedEmployee,
            totalPrice,
            totalDuration,
            contactNumber: localContact,
            // FIX: pass these through so ConfirmationPopup can display them
            selectedManicureType,
            selectedPedicureType,
          },
        });
        if (onClose) onClose();
      }, 500);

    } catch (err) {
      console.error('Booking error:', err);
      setApiError('Failed to save booking. Please try again.');
      setLoading(false);
    }
  };

  // Service icon map
  const serviceIcon = (name) => {
    const n = name?.toLowerCase() || '';
    if (n.includes('manicure')) return '💅';
    if (n.includes('pedicure')) return '🦶';
    if (n.includes('lash')) return '👁️';
    if (n.includes('tint')) return '🎨';
    return '✨';
  };

  return (
    <div className="bs-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bs-modal">

        {/* Header */}
        <div className="bs-header">
          <div className="bs-header-left">
            <span className="bs-logo-dot" />
            <h2 className="bs-title">Booking Summary</h2>
          </div>
          <button className="bs-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="bs-divider" />

        {/* Services */}
        <div className="bs-section">
          <div className="bs-section-label">Services Selected</div>
          <div className="bs-services-list">
            {selectedServices.map((svcName, i) => {
              const svc = servicesList.find((s) => s.name === svcName);
              return (
                <div key={i} className="bs-service-chip">
                  <span className="bs-service-chip-icon">{serviceIcon(svcName)}</span>
                  <div className="bs-service-chip-info">
                    <span className="bs-service-chip-name">{svcName}</span>
                    {svc && (
                      <span className="bs-service-chip-meta">
                        {svc.duration} min · R{svc.price}
                      </span>
                    )}
                    {svcName === 'Manicure' && selectedManicureType && (
                      <span className="bs-service-chip-sub">{selectedManicureType}</span>
                    )}
                    {svcName === 'Pedicure' && selectedPedicureType && (
                      <span className="bs-service-chip-sub">{selectedPedicureType}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="bs-totals">
            <div className="bs-total-row">
              <span>Total Duration</span>
              <span>{totalDuration} min</span>
            </div>
            <div className="bs-total-row bs-total-price">
              <span>Total Price</span>
              <span>R{totalPrice}</span>
            </div>
          </div>
        </div>

        <div className="bs-divider" />

        {/* Date, Time & Stylist */}
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

        {/* Client Details */}
        <div className="bs-section">
          <div className="bs-section-label">Your Details</div>
          <div className="bs-client-row">
            <span className="bs-client-label">Name</span>
            <span className="bs-client-value">{displayName}</span>
          </div>
          <div className="bs-client-row">
            <span className="bs-client-label">Email</span>
            <span className="bs-client-value">{displayEmail}</span>
          </div>
          <div className="bs-client-row bs-phone-row">
            <label className="bs-client-label" htmlFor="bs-phone">Contact</label>
            <div className="bs-phone-wrap">
              <span className="bs-phone-prefix">+27</span>
              <input
                id="bs-phone"
                type="tel"
                value={localContact}
                onChange={handleContactChange}
                placeholder="071 234 5678"
                className={`bs-phone-input ${error ? 'bs-phone-error' : ''}`}
                inputMode="numeric"
                autoComplete="tel"
              />
            </div>
          </div>
          {(error || apiError) && (
            <div className="bs-error-msg">{error || apiError}</div>
          )}
          {apiSuccess && (
            <div className="bs-success-msg">{apiSuccess}</div>
          )}
        </div>

        {/* Confirm Button */}
        <button
          className="bs-confirm-btn"
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? (
            <span className="bs-spinner-wrap">
              <span className="bs-spinner" /> Saving...
            </span>
          ) : (
            'Confirm & Proceed to Payment →'
          )}
        </button>

        <p className="bs-note">
          A non-refundable booking fee of <strong>R100</strong> will be charged on the next step.
        </p>
      </div>
    </div>
  );
};

export default BookingSummary;