import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';
import './UserProfile.css';

function UserProfile() {
  const { user, logout, triggerAppointmentRefresh } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [payingId, setPayingId] = useState(null);
  const [slotTakenId, setSlotTakenId] = useState(null);
  const [rescheduleId, setRescheduleId] = useState(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '' });
  const [savingReschedule, setSavingReschedule] = useState(false);

  const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const API_ROOT = RAW_API_BASE ? `${RAW_API_BASE.replace(/\/api$/, '')}/api` : '/api';
  const APPOINTMENTS_URL = `${API_ROOT}/appointments`;
  const BOOKING_FEE = Number(import.meta.env.VITE_BOOKING_FEE ?? 100);

  const normalizePrice = (val) => {
    if (val && typeof val === 'object' && '$numberDecimal' in val) {
      return Number(val.$numberDecimal || 0).toFixed(2);
    }
    const n = Number(val);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  };

  const getAppointmentDateTime = (appt) => {
    if (!appt?.date) return null;
    const [year, month, day] = appt.date.split('-').map(Number);
    if (!year || !month || !day) return null;
    let hours = 0, minutes = 0;
    if (appt.time) {
      const m = appt.time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
      if (m) {
        hours = parseInt(m[1], 10);
        minutes = parseInt(m[2], 10);
        const ampm = m[3]?.toLowerCase();
        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
      }
    }
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  };

  useEffect(() => { fetchUserAppointments(); }, []);

  const fetchUserAppointments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) { setError('You must be logged in.'); return; }
      const res = await fetch(APPOINTMENTS_URL, { headers: { Authorization: `Bearer ${token}` } });
      const result = await res.json();
      if (res.ok && result.success) {
        const allAppointments = result.data || [];
        const userAppointments = allAppointments.filter(appt => {
          const apptUserId = typeof appt.userId === 'object' ? appt.userId._id || appt.userId.$oid : appt.userId;
          const currentUserId = user?._id || user?.userId || user?.id;
          return String(apptUserId) === String(currentUserId);
        });
        const merged = userAppointments.map(a => ({ ...a, totalPrice: normalizePrice(a.totalPrice) }));
        setAppointments(merged);
        setError('');
      } else {
        setError(result.error || 'Failed to fetch appointments');
      }
    } catch (err) {
      setError('Error loading appointments');
    } finally {
      setLoading(false);
    }
  };

  // ── Pay Now — redirect to Yoco checkout ──────────────────────────────────

         const handlePayNow = async (appointment) => {
  setPayingId(appointment._id);
  setError('');
  setSlotTakenId(null);

  try {
    const token = localStorage.getItem('token');

    // 1. Check for overlap with confirmed bookings
    const checkRes = await fetch(`${API_ROOT}/appointments/check-availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        date: appointment.date,
        time: appointment.time,
        employeeId: appointment.employeeId?._id || appointment.employeeId,
        appointmentId: appointment._id,
      }),
    });

    const checkResult = await checkRes.json();

    if (!checkResult.available) {
      setSlotTakenId(appointment._id);
      setPayingId(null);
      return;
    }

    // 2. No conflict → proceed to payment
    localStorage.setItem('pendingBooking', JSON.stringify({
      name: appointment.userName || `${user?.firstName} ${user?.lastName}`,
      email: user?.email || '',
      appointmentDate: appointment.date,
      appointmentTime: appointment.time,
      selectedServices: appointment.services?.map(s => s.name) || [],
      selectedEmployee: appointment.employee?.name || '',
      totalPrice: Number(appointment.totalPrice) || 0,
      totalDuration: appointment.totalDuration || 0,
      contactNumber: '',
    }));

    const res = await fetch(`${API_ROOT}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ appointmentId: appointment._id }),
    });

    const result = await res.json();

    if (result.success && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    } else {
      setError(result.error || 'Could not initiate payment.');
      setPayingId(null);
    }

  } catch (err) {
    console.error(err);
    setError('Something went wrong. Please try again.');
    setPayingId(null);
  }
};

  const normalizeDateForApi = (dateStr) => {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())) return String(dateStr).trim();
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const normalizeTimeForApi = (timeStr) => {
    if (!timeStr) return null;
    const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = m[2];
    const ampm = m[3]?.toLowerCase();
    if (ampm === 'pm' && hh !== 12) hh += 12;
    if (ampm === 'am' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  };

  const toId = (val) => {
    if (!val) return null;
    if (typeof val === 'object') { if (val.$oid) return val.$oid; if (val._id) return val._id; }
    return String(val);
  };

  const buildUpdatePayload = (appointment, extra = {}) => {
    if (!appointment) return null;
    const date = normalizeDateForApi(extra.date ?? appointment.date);
    const time = normalizeTimeForApi(extra.time ?? appointment.time);
    const employeeId = toId(appointment.employeeId);
    const serviceIds = (appointment.serviceIds || []).map(toId).filter(Boolean);
    if (!date || !time || !employeeId || !serviceIds.length) return null;
    return { date, time, employeeId, serviceIds, ...extra };
  };

  const handleCancelAppointment = async (appointmentId) => {
    setCancellingId(appointmentId);
    try {
      const token = localStorage.getItem('token');
      const appt = appointments.find(a => a._id === appointmentId);
      const payload = buildUpdatePayload(appt, { status: 'cancelled' });
      if (!payload) throw new Error('Missing appointment data');
      const res = await fetch(`${APPOINTMENTS_URL}/${appointmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok || !result.success) { await fetchUserAppointments(); throw new Error(result.error || 'Cancel failed'); }
      await fetchUserAppointments();
      triggerAppointmentRefresh();
    } catch (err) {
      setError(err.message || 'Failed to cancel appointment');
    } finally {
      setCancellingId(null);
    }
  };

  const toDateInputValue = (value) => {
    try {
      if (!value) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) return String(value).trim();
      const d = new Date(value);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().slice(0, 10);
    } catch { return ''; }
  };

  const handleReschedule = (appointmentId) => {
    const appt = appointments.find(a => a._id === appointmentId);
    setRescheduleId(appointmentId);
    setRescheduleForm({ date: appt?.date ? toDateInputValue(appt.date) : '', time: appt?.time || '' });
    setShowReschedule(true);
  };

  const presetTimes = ['07:00 am','07:30 am','08:00 am','08:30 am','09:00 am', '9:30 am','10:00 am','10:30 am','11:00 am',
    '11:30 am', '12:00 pm','12:30 pm','01:00 pm','01:30 pm','02:00 pm','02:30 pm','03:00 pm','03:30 pm','04:00 pm', '04:30 pm','05:00 pm','05:30 pm','06:00 pm','06:30 pm','07:00 pm'];

  const saveReschedule = async () => {
    if (!rescheduleForm.date || !rescheduleForm.time) { setError('Please select both a date and a time.'); return; }
    setSavingReschedule(true);
    try {
      const token = localStorage.getItem('token');
      const appt = appointments.find(a => a._id === rescheduleId);
      const payload = buildUpdatePayload(appt, { date: rescheduleForm.date, time: rescheduleForm.time });
      if (!payload) throw new Error('Missing appointment data');
      const res = await fetch(`${APPOINTMENTS_URL}/${rescheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (res.ok && result.success) {
        const updated = result.data;
        setAppointments(prev => prev.map(a => a._id === rescheduleId ? { ...a, ...updated, totalPrice: normalizePrice(updated.totalPrice ?? a.totalPrice) } : a));
        setShowReschedule(false);
        setRescheduleId(null);
        setRescheduleForm({ date: '', time: '' });
        setError('');
        triggerAppointmentRefresh();
      } else {
        await fetchUserAppointments();
        setError(result.error || 'Failed to reschedule appointment');
      }
    } catch (e) {
      setError(e.message || 'Failed to reschedule appointment');
    } finally {
      setSavingReschedule(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    } catch { return dateString; }
  };

  const now = new Date();

  // Unpaid/pending — needs payment to confirm
  const unpaidAppointments = appointments
    .filter(appt => appt.paymentStatus === 'unpaid' && appt.status !== 'cancelled')
    .sort((a, b) => getAppointmentDateTime(a) - getAppointmentDateTime(b));

  // Upcoming — paid/confirmed, future date
  const upcomingAppointments = appointments
    .filter(appt => {
      const dt = getAppointmentDateTime(appt);
      return dt && dt > now && appt.status !== 'cancelled' && appt.paymentStatus !== 'unpaid';
    })
    .sort((a, b) => getAppointmentDateTime(a) - getAppointmentDateTime(b));

  // Past — completed, cancelled, or past date
  const pastAppointments = appointments
    .filter(appt => {
      const dt = getAppointmentDateTime(appt);
      return !dt || dt <= now || appt.status === 'completed' || appt.status === 'cancelled';
    })
    .sort((a, b) => getAppointmentDateTime(b) - getAppointmentDateTime(a));

  const handleLogout = () => {
    try { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); } catch {}
    logout();
    navigate('/login');
  };

  if (loading) {
    return <div className="nxl-profile-loading">Loading your profile…</div>;
  }

  return (
    <div className="nxl-profile-bg">
      <div className="nxl-profile-inner">

        {/* ── Header ── */}
        <div className="nxl-profile-header">
          <div className="nxl-profile-greeting">
            <div className="nxl-profile-avatar">👤</div>
            <div className="nxl-profile-greeting-text">
              <h1>Welcome, {user?.lastName}!</h1>
              <p>NXL Beauty Bar Member</p>
            </div>
          </div>
          <div className="nxl-profile-header-btns">
            <button className="nxl-profile-btn-primary" onClick={() => navigate('/dashboard')}>
              Book Appointment
            </button>
            <button className="nxl-profile-btn-danger" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && <div className="nxl-profile-error-banner">{error}</div>}

        {/* ── Unpaid Appointments ── */}
        {unpaidAppointments.length > 0 && (
          <div className="nxl-profile-section nxl-unpaid-section">
            <h2 className="nxl-profile-section-title">
              <span>⚠️</span> Awaiting Payment
              <span className="nxl-profile-section-count">{unpaidAppointments.length}</span>
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#c07a3a', marginBottom: '1rem', marginTop: '-0.5rem' }}>
              Complete your booking fee to secure these appointments.
            </p>
            <div className="nxl-profile-appts-grid">
              {unpaidAppointments.map((appointment) => (
                <div key={appointment._id} className="nxl-profile-appt-card nxl-unpaid-card">
                  <div className="nxl-profile-appt-details">
                    <h3 style={{ color: '#ffcc80' }}>
                      💄 {appointment.services?.map(s => s.name).join(', ') || 'Service Appointment'}
                    </h3>

                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Date</span>
                      <span className="nxl-val">{formatDate(appointment.date)}</span>
                    </div>
                    {appointment.time && (
                      <div className="nxl-profile-appt-row">
                        <span className="nxl-lbl">Time</span>
                        <span className="nxl-val">{appointment.time}</span>
                      </div>
                    )}
                    {appointment.employee?.name && (
                      <div className="nxl-profile-appt-row">
                        <span className="nxl-lbl">Stylist</span>
                        <span className="nxl-val">{appointment.employee.name}</span>
                      </div>
                    )}
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Total</span>
                      <span className="nxl-val">R{normalizePrice(appointment.totalPrice)}</span>
                    </div>

                    {/* Pay notice */}
                    {/* Pay notice — slot taken warning OR normal notice */}
{slotTakenId === appointment._id ? (
  <div style={{
    marginTop: '0.75rem',
    padding: '0.75rem 0.9rem',
    background: 'rgba(220, 50, 50, 0.15)',
    border: '1px solid rgba(220, 50, 50, 0.45)',
    borderRadius: '8px',
    fontSize: '0.78rem',
    color: '#ffb3a0',
    lineHeight: 1.6,
  }}>
    ⚠️ <strong>This time slot has been taken by another client.</strong><br />
    Please choose a different date and time to complete your booking.
  </div>
) : (
  <div style={{
    marginTop: '0.75rem',
    padding: '0.6rem 0.8rem',
    background: 'rgba(255, 180, 0, 0.12)',
    border: '1px solid rgba(255, 180, 0, 0.3)',
    borderRadius: '8px',
    fontSize: '0.78rem',
    color: '#ffcc80',
    lineHeight: 1.5,
  }}>
    🔒 Pay the <strong>R{BOOKING_FEE} booking fee</strong> to confirm this appointment.
  </div>
)}
                  </div>
<div className="nxl-profile-appt-actions">
  {slotTakenId === appointment._id ? (
    <button
      className="nxl-profile-btn-reschedule"
      onClick={() => {
        setSlotTakenId(null);
        handleReschedule(appointment._id);
      }}
    >
      📅 Choose New Time
    </button>
  ) : (
    <button
      className="nxl-profile-btn-paynow"
      onClick={() => handlePayNow(appointment)}
      disabled={payingId === appointment._id}
    >
      {payingId === appointment._id ? 'Checking…' : '💳 Pay Now'}
    </button>
  )}
  <button
    className="nxl-profile-btn-cancel"
    onClick={() => handleCancelAppointment(appointment._id)}
    disabled={cancellingId === appointment._id}
  >
    {cancellingId === appointment._id ? 'Cancelling…' : 'Cancel'}
  </button>
</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Upcoming Appointments ── */}
        <div className="nxl-profile-section">
          <h2 className="nxl-profile-section-title">
            <span>📅</span> Upcoming Appointments
            <span className="nxl-profile-section-count">{upcomingAppointments.length}</span>
          </h2>

          {upcomingAppointments.length === 0 ? (
            <div className="nxl-profile-empty">
              <p>No upcoming appointments scheduled.</p>
              <button className="nxl-profile-btn-primary" onClick={() => navigate('/dashboard')}>
                Book Your First Appointment
              </button>
            </div>
          ) : (
            <div className="nxl-profile-appts-grid">
              {upcomingAppointments.map((appointment) => (
                <div key={appointment._id} className="nxl-profile-appt-card">
                  <div className="nxl-profile-appt-details">
                    <h3>💄 {appointment.services?.map(s => s.name).join(', ') || 'Service Appointment'}</h3>

                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Date</span>
                      <span className="nxl-val">{formatDate(appointment.date)}</span>
                    </div>
                    {appointment.time && (
                      <div className="nxl-profile-appt-row">
                        <span className="nxl-lbl">Time</span>
                        <span className="nxl-val">{appointment.time}</span>
                      </div>
                    )}
                    {appointment.employee?.name && (
                      <div className="nxl-profile-appt-row">
                        <span className="nxl-lbl">Stylist</span>
                        <span className="nxl-val">{appointment.employee.name}</span>
                      </div>
                    )}
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Total</span>
                      <span className="nxl-val">R{normalizePrice(appointment.totalPrice)}</span>
                    </div>
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Duration</span>
                      <span className="nxl-val">{appointment.totalDuration} min</span>
                    </div>
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Status</span>
                      <span className="nxl-val">
                        <span className={`nxl-status-badge ${appointment.paymentStatus === 'deposit_paid' ? 'completed' : 'pending'}`}>
                          {appointment.paymentStatus === 'deposit_paid' ? '✅ Deposit Paid' : appointment.status}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="nxl-profile-appt-actions">
                    <button className="nxl-profile-btn-reschedule" onClick={() => handleReschedule(appointment._id)}>
                      Reschedule
                    </button>
                    <button
                      className="nxl-profile-btn-cancel"
                      onClick={() => handleCancelAppointment(appointment._id)}
                      disabled={cancellingId === appointment._id}
                    >
                      {cancellingId === appointment._id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Reschedule Modal ── */}
        {showReschedule && (
          <div className="nxl-profile-modal-overlay">
            <div className="nxl-profile-modal">
              <h3>Reschedule Appointment</h3>
              <div className="nxl-profile-modal-field">
                <label>Select Date</label>
                <input
                  type="date"
                  value={rescheduleForm.date}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })}
                />
              </div>
              <div className="nxl-profile-modal-field">
                <label>Select Time</label>
                <select
                  value={rescheduleForm.time}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, time: e.target.value })}
                >
                  <option value="">Choose a time</option>
                  {presetTimes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="nxl-profile-modal-actions">
                <button className="nxl-profile-modal-cancel" onClick={() => setShowReschedule(false)}>Cancel</button>
                <button className="nxl-profile-modal-save" onClick={saveReschedule} disabled={savingReschedule}>
                  {savingReschedule ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Past Appointments ── */}
        <div className="nxl-profile-section">
          <h2 className="nxl-profile-section-title">
            <span>🕐</span> Appointment History
            <span className="nxl-profile-section-count">{pastAppointments.length}</span>
          </h2>

          {pastAppointments.length === 0 ? (
            <div className="nxl-profile-empty">
              <p>You have no past appointments.</p>
            </div>
          ) : (
            <div className="nxl-profile-appts-grid">
              {pastAppointments.map((appointment) => (
                <div key={appointment._id} className="nxl-profile-appt-card past">
                  <div className="nxl-profile-appt-details">
                    <h3>{appointment.services?.map(s => s.name).join(', ') || 'Service Appointment'}</h3>
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Date</span>
                      <span className="nxl-val">{formatDate(appointment.date)}</span>
                    </div>
                    {appointment.time && (
                      <div className="nxl-profile-appt-row">
                        <span className="nxl-lbl">Time</span>
                        <span className="nxl-val">{appointment.time}</span>
                      </div>
                    )}
                    {appointment.employee?.name && (
                      <div className="nxl-profile-appt-row">
                        <span className="nxl-lbl">Stylist</span>
                        <span className="nxl-val">{appointment.employee.name}</span>
                      </div>
                    )}
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Total</span>
                      <span className="nxl-val">R{normalizePrice(appointment.totalPrice)}</span>
                    </div>
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Status</span>
                      <span className="nxl-val">
                        <span className={`nxl-status-badge ${appointment.status}`}>{appointment.status}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Fixed Footer Bar ── */}
      <div className="nxl-profile-footer-bar">NXL Beauty Bar</div>
    </div>
  );
}

export default UserProfile;