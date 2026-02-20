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
  const [rescheduleId, setRescheduleId] = useState(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '' });
  const [savingReschedule, setSavingReschedule] = useState(false);

  const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const API_ROOT = RAW_API_BASE ? `${RAW_API_BASE.replace(/\/api$/, '')}/api` : '/api';
  const APPOINTMENTS_URL = `${API_ROOT}/appointments`;

  const normalizePrice = (val) => {
    if (val && typeof val === 'object' && '$numberDecimal' in val) {
      return Number(val.$numberDecimal || 0).toFixed(2);
    }
    const n = Number(val);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  };

  const getAppointmentDateTime = (appt) => {
    if (!appt?.date) return null;
    const dateObj = new Date(appt.date);
    if (isNaN(dateObj)) return null;
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
    const combined = new Date(dateObj);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
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
          const currentUserId = user?._id || user?.userId;
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

  const normalizeDateForApi = (dateStr) => {
    if (!dateStr) return null;
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
    try { const d = new Date(value); if (isNaN(d.getTime())) return ''; return d.toISOString().slice(0, 10); }
    catch { return ''; }
  };

  const handleReschedule = (appointmentId) => {
    const appt = appointments.find(a => a._id === appointmentId);
    setRescheduleId(appointmentId);
    setRescheduleForm({ date: appt?.date ? toDateInputValue(appt.date) : '', time: appt?.time || '' });
    setShowReschedule(true);
  };

  const presetTimes = ['09:00 am', '10:30 am', '12:00 pm', '01:30 pm', '03:00 pm', '04:30 pm'];

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
    try { return new Date(dateString).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return dateString; }
  };

  const now = new Date();
  const upcomingAppointments = appointments
    .filter(appt => { const dt = getAppointmentDateTime(appt); return dt && dt > now && appt.status !== 'cancelled'; })
    .sort((a, b) => getAppointmentDateTime(a) - getAppointmentDateTime(b));

  const pastAppointments = appointments
    .filter(appt => { const dt = getAppointmentDateTime(appt); return !dt || dt <= now || appt.status === 'completed' || appt.status === 'cancelled'; })
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
                    <h3>💄 {appointment.serviceIds ? 'Multiple Services' : 'Service Appointment'}</h3>

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
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Stylist</span>
                      <span className="nxl-val">{appointment.stylist}</span>
                    </div>
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Total</span>
                      <span className="nxl-val">R{normalizePrice(appointment.totalPrice)}</span>
                    </div>
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Duration</span>
                      <span className="nxl-val">{appointment.totalDuration} min</span>
                    </div>
                    {appointment.manicureType && (
                      <div className="nxl-profile-appt-row">
                        <span className="nxl-lbl">Manicure</span>
                        <span className="nxl-val">{appointment.manicureType}</span>
                      </div>
                    )}
                    {appointment.pedicureType && (
                      <div className="nxl-profile-appt-row">
                        <span className="nxl-lbl">Pedicure</span>
                        <span className="nxl-val">{appointment.pedicureType}</span>
                      </div>
                    )}
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
                <button className="nxl-profile-modal-cancel" onClick={() => setShowReschedule(false)}>
                  Cancel
                </button>
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
                    <h3>{appointment.serviceIds ? 'Multiple Services' : 'Service Appointment'}</h3>

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
                    <div className="nxl-profile-appt-row">
                      <span className="nxl-lbl">Stylist</span>
                      <span className="nxl-val">{appointment.stylist}</span>
                    </div>
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