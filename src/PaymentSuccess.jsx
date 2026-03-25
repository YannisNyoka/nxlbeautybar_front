import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import emailjs from '@emailjs/browser';
import './ConfirmationPopup.css';

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

  // Fetch full appointment details from backend (most reliable)
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
          totalDuration: appt.totalDuration || 
                        appt.serviceIds?.reduce((sum, id) => {
                          // You can improve this if you want to calculate from services
                          return sum + 30; // fallback
                        }, 0) || 0,
          contactNumber: '', // not stored on appointment
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

      // Refresh token if possible
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

      // Priority 1: Fetch from API (best for production)
      if (appointmentId && token) {
        details = await fetchAppointmentDetails(appointmentId, token);
      }

      // Priority 2: Fallback to localStorage (only if API fails)
      if (!details) {
        try {
          const fromLocal = localStorage.getItem('pendingBooking');
          if (fromLocal) details = JSON.parse(fromLocal);
        } catch (e) {
          console.error('Failed to parse localStorage:', e);
        }
      }

      // Final fallback
      if (!details) {
        details = {
          name: 'Client',
          email: '',
          appointmentDate: '',
          appointmentTime: '',
          selectedServices: [],
          selectedEmployee: '',
          totalPrice: 0,
          totalDuration: 0,
        };
      }

      setBookingDetails(details);
      setLoading(false);

      // Update appointment status (idempotent)
      if (appointmentId && token) {
        try {
          await fetch(`${API_ROOT}/payments/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ appointmentId }),
          });
        } catch (e) {
          console.warn('Verify call failed (webhook probably already did it)');
        }
      }

      // Send confirmation email
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
        {/* Success Icon + Heading */}
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
                  <div className="cp-detail-value">
                    {d.appointmentDate} {d.appointmentTime}
                  </div>
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