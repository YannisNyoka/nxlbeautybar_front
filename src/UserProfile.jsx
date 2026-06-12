import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';
import './UserProfile.css';
import LoyaltyWidget from './LoyaltyWidget';
import ReferralWidget from './ReferralWidget';
import NotificationBell from './NotificationBell';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function authHeaders() {
  const token = localStorage.getItem('token');
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

async function apiFetch(path, options = {}) {
  const res  = await fetch(`${API_BASE}${path}`, {
    headers: { ...authHeaders(), ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function normalizePrice(val) {
  if (val && typeof val === 'object' && '$numberDecimal' in val)
    return Number(val.$numberDecimal || 0).toFixed(2);
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function getApptDateTime(appt) {
  if (!appt?.date) return null;
  const [yr, mo, dy] = appt.date.split('-').map(Number);
  if (!yr || !mo || !dy) return null;
  let hh = 0, mm = 0;
  if (appt.time) {
    const m = appt.time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (m) {
      hh = parseInt(m[1], 10); mm = parseInt(m[2], 10);
      const ap = m[3]?.toLowerCase();
      if (ap === 'pm' && hh !== 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
    }
  }
  return new Date(yr, mo - 1, dy, hh, mm);
}

function formatDate(ds) {
  try {
    const [y, m, d] = ds.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-ZA', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return ds; }
}

function toDateInput(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const PRESET_TIMES = [
  '07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30',
  '11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00',
];

const BOOKING_FEE = Number(import.meta.env.VITE_BOOKING_FEE ?? 100);

// ─────────────────────────────────────────────────────────────────────────────
export default function UserProfile() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();

  // ── Appointments state ──────────────────────────────────────────────────
  const [appointments,   setAppointments]   = useState([]);
  const [apptLoading,    setApptLoading]    = useState(true);
  const [apptError,      setApptError]      = useState('');
  const [cancellingId,   setCancellingId]   = useState(null);
  const [confirmCancel,  setConfirmCancel]  = useState(null); // appt to confirm cancel
  const [payingId,       setPayingId]       = useState(null);
  const [slotTakenId,    setSlotTakenId]    = useState(null);

  // ── Reschedule state ────────────────────────────────────────────────────
  const [rescheduleAppt, setRescheduleAppt] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '' });
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [rescheduleError,  setRescheduleError]  = useState('');

  // ── Edit profile state ──────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState('appointments'); // 'appointments' | 'profile' | 'password'
  const [loyaltyRefreshKey, setLoyaltyRefreshKey] = useState(0); // Force LoyaltyWidget to remount
  const [profileForm,    setProfileForm]    = useState({ firstName: '', lastName: '', email: '' });
  const [profileSaving,  setProfileSaving]  = useState(false);
  const [profileMsg,     setProfileMsg]     = useState({ type: '', text: '' });
  const [pwForm,         setPwForm]         = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving,       setPwSaving]       = useState(false);
  const [pwMsg,          setPwMsg]          = useState({ type: '', text: '' });
  const [showPw,         setShowPw]         = useState({ old: false, new: false, confirm: false });

  // ── Load user profile form when tab opens ───────────────────────────────
  useEffect(() => {
    if (activeTab === 'profile' && user) {
      setProfileForm({
        firstName: user.firstName || '',
        lastName:  user.lastName  || '',
        email:     user.email     || '',
      });
      setProfileMsg({ type: '', text: '' });
    }
    if (activeTab === 'password') {
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setPwMsg({ type: '', text: '' });
    }
  }, [activeTab, user]);

  // ── Fetch appointments ──────────────────────────────────────────────────
  const fetchAppointments = useCallback(async () => {
    setApptLoading(true);
    setApptError('');
    try {
      const data = await apiFetch('/appointments');
      const all  = data.data || [];
      const mine = all.filter(a => {
        const apptUid = typeof a.userId === 'object'
          ? (a.userId._id || a.userId.$oid)
          : a.userId;
        const myId = user?._id || user?.userId || user?.id;
        return String(apptUid) === String(myId);
      });
      setAppointments(mine.map(a => ({ ...a, totalPrice: normalizePrice(a.totalPrice) })));
    } catch (e) {
      setApptError(e.message || 'Failed to load appointments.');
    } finally {
      setApptLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // ── Derived lists ───────────────────────────────────────────────────────
  const now = new Date();

  const unpaid = appointments
    .filter(a => a.paymentStatus === 'unpaid' && a.status !== 'cancelled')
    .sort((a, b) => getApptDateTime(a) - getApptDateTime(b));

  const upcoming = appointments
    .filter(a => {
      const dt = getApptDateTime(a);
      return dt && dt > now && a.status !== 'cancelled' && a.paymentStatus !== 'unpaid';
    })
    .sort((a, b) => getApptDateTime(a) - getApptDateTime(b));

  const past = appointments
    .filter(a => {
      const dt = getApptDateTime(a);
      return !dt || dt <= now || a.status === 'completed' || a.status === 'cancelled';
    })
    .sort((a, b) => getApptDateTime(b) - getApptDateTime(a));

  // ── Loyalty redemption for bookings ─────────────────────────────────────
  const [loyaltyPreview,   setLoyaltyPreview]   = useState(null); // { apptId, data }
  const [loyaltyRedeeming, setLoyaltyRedeeming] = useState(false);
  const [usePoints,        setUsePoints]        = useState(false);
  const [discountInput,    setDiscountInput]    = useState('');
  const [discountResult,   setDiscountResult]   = useState(null);
  const [discountError,    setDiscountError]    = useState('');
  const [discountLoading,  setDiscountLoading]  = useState(false);

  const validateBookingDiscount = async (code, apptId) => {
    if (!code?.trim()) return;
    setDiscountLoading(true); setDiscountError(''); setDiscountResult(null);
    try {
      const data = await apiFetch('/discount-codes/validate-booking', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim().toUpperCase(), appointmentId: apptId }),
      });
      if (data.success) setDiscountResult(data.data);
      else setDiscountError(data.error || 'Invalid code.');
    } catch (e) { setDiscountError(e.message || 'Could not validate code.'); }
    finally { setDiscountLoading(false); }
  };

  const loadLoyaltyPreview = async (appt) => {
    try {
      const data = await apiFetch(`/loyalty/booking-preview/${appt._id}`);
      // Always show the modal — even if no points, customer may have a discount code
      setLoyaltyPreview({
        apptId: appt._id,
        data: data.success ? data.data : {
          currentPoints:   0,
          maxPointsUsable: 0,
          discountAmount:  0,
          depositAmount:   100,
          totalPrice:      parseFloat(appt.totalPrice?.$numberDecimal || appt.totalPrice || 0),
          balance:         Math.max(0, parseFloat(appt.totalPrice?.$numberDecimal || appt.totalPrice || 0) - 100),
          newBalance:      Math.max(0, parseFloat(appt.totalPrice?.$numberDecimal || appt.totalPrice || 0) - 100),
          pointValue:      0.10,
          minRedemption:   100,
          canRedeem:       false,
        },
      });
      setUsePoints(false);
      setDiscountInput('');
      setDiscountResult(null);
      setDiscountError('');
    } catch {
      // Even on error — show the modal so discount codes still work
      setLoyaltyPreview({
        apptId: appt._id,
        data: {
          currentPoints:   0,
          maxPointsUsable: 0,
          discountAmount:  0,
          depositAmount:   100,
          totalPrice:      parseFloat(appt.totalPrice?.$numberDecimal || appt.totalPrice || 0),
          balance:         Math.max(0, parseFloat(appt.totalPrice?.$numberDecimal || appt.totalPrice || 0) - 100),
          newBalance:      Math.max(0, parseFloat(appt.totalPrice?.$numberDecimal || appt.totalPrice || 0) - 100),
          pointValue:      0.10,
          minRedemption:   100,
          canRedeem:       false,
        },
      });
      setUsePoints(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── Pay Now ─────────────────────────────────────────────────────────────
  const handlePayNow = async (appt) => {
    setPayingId(appt._id);
    setSlotTakenId(null);
    try {
      const checkData = await apiFetch('/appointments/check-availability', {
        method: 'POST',
        body: JSON.stringify({
          date: appt.date, time: appt.time,
          employeeId:    appt.employeeId?._id || appt.employeeId,
          appointmentId: appt._id,
        }),
      });
      if (!checkData.available) { setSlotTakenId(appt._id); setPayingId(null); return; }

      // Check if client has points to redeem before going to Yoco
      await loadLoyaltyPreview(appt);
    } catch (e) {
      setApptError(e.message || 'Payment failed. Please try again.');
    } finally {
      setPayingId(null);
    }
  };

  const proceedToPayment = async (appt, pointsToRedeem = 0, appliedDiscountCode = null) => {
    setLoyaltyRedeeming(true);
    try {
      const payData = await apiFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({ appointmentId: appt._id, loyaltyPointsToRedeem: pointsToRedeem || undefined }),
      });
      if (payData.checkoutUrl) {
        // ── Save booking details BEFORE redirect — PaymentSuccess reads this ──
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');

        // Extract service names robustly — handle both populated and unpopulated
        const serviceNames = (appt.services || [])
          .map(s => (typeof s === 'object' ? s.name : null))
          .filter(Boolean);

        // If services weren't populated, try to resolve from the serviceIds
        // using the already-loaded appointments list (which may have them enriched)
        const fullAppt = appointments.find(a => String(a._id) === String(appt._id)) || appt;
        const resolvedServiceNames = serviceNames.length > 0
          ? serviceNames
          : (fullAppt.services || []).map(s => typeof s === 'object' ? s.name : s).filter(s => s && typeof s === 'string' && !s.match(/^[a-f0-9]{24}$/i));

        // Employee name
        const employeeName = appt.employee?.name
          || fullAppt.employee?.name
          || (typeof appt.employeeId === 'object' ? appt.employeeId?.name : '')
          || '';

        // Duration — sum of service durations, or fall back to totalDuration
        const totalDuration = appt.totalDuration
          || fullAppt.totalDuration
          || (fullAppt.services || []).reduce((sum, s) => sum + (s.durationMinutes || 0), 0)
          || 60;

        localStorage.setItem('pendingBooking', JSON.stringify({
          appointmentId:        String(appt._id),
          name:                 `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim() || 'Client',
          email:                userInfo.email || '',
          appointmentDate:      appt.date || '',
          appointmentTime:      appt.time || '',
          selectedServices:     resolvedServiceNames,
          selectedEmployee:     employeeName,
          totalPrice:           parseFloat(appt.totalPrice?.$numberDecimal || appt.totalPrice || 0),
          totalDuration,
          loyaltyPointsRedeemed: pointsToRedeem || 0,
          loyaltyBalanceDiscount: pointsToRedeem ? parseFloat((pointsToRedeem * 0.10).toFixed(2)) : 0,
          discountCode:          appliedDiscountCode || null,
          discountAmount:        appliedDiscountCode && discountResult ? discountResult.discountAmount : 0,
        }));
        // ──────────────────────────────────────────────────────────────────────
        window.location.href = payData.checkoutUrl;
      }
    } catch (e) {
      setApptError(e.message || 'Payment failed. Please try again.');
    } finally {
      setLoyaltyRedeeming(false);
      setLoyaltyPreview(null);
      setDiscountInput('');
      setDiscountResult(null);
      setDiscountError('');
    }
  };

  // ── Cancel (with confirmation) ───────────────────────────────────────────
  const handleCancelConfirmed = async () => {
    const appt = confirmCancel;
    setConfirmCancel(null);
    setCancellingId(appt._id);
    try {
      const serviceIds = (appt.serviceIds || []).map(s =>
        typeof s === 'object' ? (s._id || s.$oid) : s
      ).filter(Boolean);
      const empId = typeof appt.employeeId === 'object'
        ? (appt.employeeId._id || appt.employeeId.$oid)
        : appt.employeeId;

      await apiFetch(`/appointments/${appt._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: appt.date, time: appt.time,
          employeeId: empId, serviceIds,
          status: 'cancelled',
        }),
      });
      await fetchAppointments();
    } catch (e) {
      setApptError(e.message || 'Failed to cancel appointment.');
    } finally {
      setCancellingId(null);
    }
  };

  // ── Reschedule ───────────────────────────────────────────────────────────
  const openReschedule = (appt) => {
    setRescheduleAppt(appt);
    setRescheduleForm({ date: toDateInput(appt.date), time: appt.time || '' });
    setRescheduleError('');
  };

  const saveReschedule = async () => {
    if (!rescheduleForm.date || !rescheduleForm.time) {
      setRescheduleError('Please select both a date and time.'); return;
    }
    if (rescheduleForm.date < todayISO()) {
      setRescheduleError('Please choose a future date.'); return;
    }
    setSavingReschedule(true);
    setRescheduleError('');
    try {
      const appt = rescheduleAppt;
      const serviceIds = (appt.serviceIds || []).map(s =>
        typeof s === 'object' ? (s._id || s.$oid) : s
      ).filter(Boolean);
      const empId = typeof appt.employeeId === 'object'
        ? (appt.employeeId._id || appt.employeeId.$oid)
        : appt.employeeId;

      await apiFetch(`/appointments/${appt._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: rescheduleForm.date,
          time: rescheduleForm.time,
          employeeId: empId,
          serviceIds,
        }),
      });
      setRescheduleAppt(null);
      await fetchAppointments();
    } catch (e) {
      setRescheduleError(e.message || 'Failed to reschedule.');
    } finally {
      setSavingReschedule(false);
    }
  };

  // ── Update profile ───────────────────────────────────────────────────────
  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg({ type: '', text: '' });
    try {
      const payload = {};
      if (profileForm.firstName.trim() !== (user?.firstName || ''))
        payload.firstName = profileForm.firstName.trim();
      if (profileForm.lastName.trim()  !== (user?.lastName  || ''))
        payload.lastName  = profileForm.lastName.trim();
      if (profileForm.email.trim()     !== (user?.email     || ''))
        payload.email     = profileForm.email.trim();

      if (!Object.keys(payload).length) {
        setProfileMsg({ type: 'info', text: 'No changes to save.' });
        return;
      }

      const data = await apiFetch('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      // Update auth context with new info
      const updated = data.data;
      const stored  = JSON.parse(localStorage.getItem('userInfo') || '{}');
      const merged  = { ...stored, firstName: updated.firstName, lastName: updated.lastName, email: updated.email };
      localStorage.setItem('userInfo', JSON.stringify(merged));
      login(merged);

      setProfileMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (e) {
      setProfileMsg({ type: 'error', text: e.message || 'Failed to update profile.' });
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Change password ──────────────────────────────────────────────────────
  const handlePasswordSave = async (e) => {
    e.preventDefault();
    setPwMsg({ type: '', text: '' });
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' }); return;
    }
    if (pwForm.newPassword.length < 8 || !/[A-Z]/.test(pwForm.newPassword) ||
        !/[a-z]/.test(pwForm.newPassword) || !/[0-9]/.test(pwForm.newPassword) ||
        !/[^A-Za-z0-9]/.test(pwForm.newPassword)) {
      setPwMsg({ type: 'error', text: 'Password must be 8+ chars with uppercase, lowercase, number and special character.' });
      return;
    }
    setPwSaving(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: pwForm.oldPassword, newPassword: pwForm.newPassword }),
      });
      setPwMsg({ type: 'success', text: 'Password changed successfully!' });
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e) {
      setPwMsg({ type: 'error', text: e.message || 'Failed to change password.' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    logout();
    navigate('/login');
  };

  // ── Render helpers ───────────────────────────────────────────────────────
  const StatusBadge = ({ appt }) => {
    const map = {
      deposit_paid: { label: '✅ Deposit Paid', cls: 'completed' },
      paid:         { label: '✅ Paid',         cls: 'completed' },
      unpaid:       { label: '⏳ Unpaid',        cls: 'pending'   },
    };
    const cfg = map[appt.paymentStatus] || { label: appt.status, cls: appt.status };
    return <span className={`nxl-status-badge ${cfg.cls}`}>{cfg.label}</span>;
  };

  const ApptCard = ({ appt, variant = 'upcoming' }) => {
    const isPast   = variant === 'past';
    const isUnpaid = variant === 'unpaid';
    const isTaken  = slotTakenId === appt._id;

    return (
      <div className={`nxl-appt-card ${isPast ? 'past' : ''} ${isUnpaid ? 'unpaid' : ''}`}>
        <div className="nxl-appt-body">
          <h3 className="nxl-appt-service">
            💄 {appt.services?.map(s => s.name).join(', ') || 'Appointment'}
          </h3>

          <div className="nxl-appt-rows">
            <div className="nxl-appt-row"><span>Date</span><span>{formatDate(appt.date)}</span></div>
            {appt.time    && <div className="nxl-appt-row"><span>Time</span><span>{appt.time}</span></div>}
            {appt.employee?.name && <div className="nxl-appt-row"><span>Stylist</span><span>{appt.employee.name}</span></div>}
            <div className="nxl-appt-row"><span>Total</span><span>R{normalizePrice(appt.totalPrice)}</span></div>
            {appt.totalDuration > 0 && <div className="nxl-appt-row"><span>Duration</span><span>{appt.totalDuration} min</span></div>}
            <div className="nxl-appt-row"><span>Status</span><span><StatusBadge appt={appt} /></span></div>
          </div>

          {isUnpaid && (
            isTaken ? (
              <div className="nxl-appt-alert nxl-alert-danger">
                ⚠️ <strong>This slot was taken.</strong> Please choose a new time.
              </div>
            ) : (
              <div className="nxl-appt-alert nxl-alert-warn">
                🔒 Pay <strong>R{BOOKING_FEE}</strong> booking fee to confirm this slot.
              </div>
            )
          )}
        </div>

        {!isPast && (
          <div className="nxl-appt-actions">
            {isUnpaid && (
              isTaken ? (
                <button className="nxl-btn nxl-btn-reschedule"
                  onClick={() => { setSlotTakenId(null); openReschedule(appt); }}>
                  📅 New Time
                </button>
              ) : (
                <button className="nxl-btn nxl-btn-pay"
                  disabled={payingId === appt._id}
                  onClick={() => handlePayNow(appt)}>
                  {payingId === appt._id ? 'Checking…' : '💳 Pay Now'}
                </button>
              )
            )}
            {!isUnpaid && (
              <button className="nxl-btn nxl-btn-reschedule"
                onClick={() => openReschedule(appt)}>
                📅 Reschedule
              </button>
            )}
            <button className="nxl-btn nxl-btn-cancel"
              disabled={cancellingId === appt._id}
              onClick={() => setConfirmCancel(appt)}>
              {cancellingId === appt._id ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="nxl-up-root">

      {/* Header */}
      <div className="nxl-up-header">
        <div className="nxl-up-header-left">
          <div className="nxl-up-avatar">
            {(user?.firstName?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <h1 className="nxl-up-name">{user?.firstName} {user?.lastName}</h1>
            <p className="nxl-up-email">{user?.email}</p>
          </div>
        </div>
        <div className="nxl-up-header-actions">
          <NotificationBell />
          <button className="nxl-btn nxl-btn-book" onClick={() => navigate('/dashboard')}>
            ＋ Book Appointment
          </button>
          <button className="nxl-btn nxl-btn-logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="nxl-up-tabs">
        {[
          { key: 'appointments', label: '📅 My Bookings' },
          { key: 'loyalty',      label: '⭐ Loyalty Points' },
          { key: 'referral',     label: '🎁 Refer Friends' },
          { key: 'profile',      label: '👤 Edit Profile' },
          { key: 'password',     label: '🔒 Password' },
        ].map(t => (
          <button key={t.key}
            className={`nxl-up-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(t.key);
              if (t.key === 'loyalty') setLoyaltyRefreshKey(k => k + 1);
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="nxl-up-body">

        {/* ── APPOINTMENTS TAB ────────────────────────────────────────── */}
        {activeTab === 'appointments' && (
          <>
            {apptError && <div className="nxl-up-alert nxl-alert-danger">{apptError}</div>}

            {apptLoading ? (
              <div className="nxl-up-skeleton">
                {[1,2,3].map(i => <div key={i} className="nxl-skeleton-card" />)}
              </div>
            ) : (
              <>
                {/* Unpaid */}
                {unpaid.length > 0 && (
                  <div className="nxl-up-section">
                    <h2 className="nxl-up-section-title warning">
                      ⚠️ Awaiting Payment
                      <span className="nxl-count">{unpaid.length}</span>
                    </h2>
                    <p className="nxl-up-section-sub">Complete payment to confirm your slot.</p>
                    <div className="nxl-appt-list">
                      {unpaid.map(a => <ApptCard key={a._id} appt={a} variant="unpaid" />)}
                    </div>
                  </div>
                )}

                {/* Upcoming */}
                <div className="nxl-up-section">
                  <h2 className="nxl-up-section-title">
                    📅 Upcoming
                    <span className="nxl-count">{upcoming.length}</span>
                  </h2>
                  {upcoming.length === 0 ? (
                    <div className="nxl-up-empty">
                      <span>🗓️</span>
                      <p>No upcoming appointments.</p>
                      <button className="nxl-btn nxl-btn-book"
                        onClick={() => navigate('/dashboard')}>
                        Book Now
                      </button>
                    </div>
                  ) : (
                    <div className="nxl-appt-list">
                      {upcoming.map(a => <ApptCard key={a._id} appt={a} variant="upcoming" />)}
                    </div>
                  )}
                </div>

                {/* Past */}
                <div className="nxl-up-section">
                  <h2 className="nxl-up-section-title muted">
                    🕐 History
                    <span className="nxl-count">{past.length}</span>
                  </h2>
                  {past.length === 0 ? (
                    <div className="nxl-up-empty"><p>No past appointments.</p></div>
                  ) : (
                    <div className="nxl-appt-list">
                      {past.map(a => <ApptCard key={a._id} appt={a} variant="past" />)}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ── REFERRAL TAB ────────────────────────────────────────────── */}
        {activeTab === 'referral' && (
          <div className="nxl-up-section">
            <h2 className="nxl-up-section-title">🎁 Refer Friends</h2>
            <ReferralWidget />
          </div>
        )}

        {/* ── LOYALTY TAB ─────────────────────────────────────────────── */}
        {activeTab === 'loyalty' && (
          <div className="nxl-up-section">
            <h2 className="nxl-up-section-title">⭐ Loyalty Points</h2>
            <LoyaltyWidget key={loyaltyRefreshKey} activeTab={activeTab} />
          </div>
        )}

        {/* ── EDIT PROFILE TAB ────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="nxl-up-section">
            <h2 className="nxl-up-section-title">👤 Edit Profile</h2>
            <form className="nxl-up-form" onSubmit={handleProfileSave}>
              <div className="nxl-up-form-row">
                <div className="nxl-up-field">
                  <label>First Name</label>
                  <input type="text" value={profileForm.firstName}
                    onChange={e => setProfileForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder="First name" maxLength={50} required />
                </div>
                <div className="nxl-up-field">
                  <label>Last Name</label>
                  <input type="text" value={profileForm.lastName}
                    onChange={e => setProfileForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder="Last name" maxLength={50} required />
                </div>
              </div>
              <div className="nxl-up-field">
                <label>Email Address</label>
                <input type="email" value={profileForm.email}
                  onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="your@email.com" required />
              </div>
              {profileMsg.text && (
                <div className={`nxl-up-alert nxl-alert-${profileMsg.type}`}>{profileMsg.text}</div>
              )}
              <button type="submit" className="nxl-btn nxl-btn-save" disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>
        )}

        {/* ── PASSWORD TAB ────────────────────────────────────────────── */}
        {activeTab === 'password' && (
          <div className="nxl-up-section">
            <h2 className="nxl-up-section-title">🔒 Change Password</h2>
            <form className="nxl-up-form" onSubmit={handlePasswordSave}>
              {[
                { key: 'oldPassword',     label: 'Current Password',  field: 'old'     },
                { key: 'newPassword',     label: 'New Password',       field: 'new'     },
                { key: 'confirmPassword', label: 'Confirm New Password', field: 'confirm' },
              ].map(({ key, label, field }) => (
                <div className="nxl-up-field" key={key}>
                  <label>{label}</label>
                  <div className="nxl-pw-wrap">
                    <input
                      type={showPw[field] ? 'text' : 'password'}
                      value={pwForm[key]}
                      onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={label}
                      required
                    />
                    <button type="button" className="nxl-pw-toggle"
                      onClick={() => setShowPw(p => ({ ...p, [field]: !p[field] }))}>
                      {showPw[field] ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Password rules */}
              {pwForm.newPassword && (
                <div className="nxl-pw-rules">
                  {[
                    { label: '8+ characters',     ok: pwForm.newPassword.length >= 8 },
                    { label: 'Uppercase letter',  ok: /[A-Z]/.test(pwForm.newPassword) },
                    { label: 'Lowercase letter',  ok: /[a-z]/.test(pwForm.newPassword) },
                    { label: 'Number',            ok: /[0-9]/.test(pwForm.newPassword) },
                    { label: 'Special character', ok: /[^A-Za-z0-9]/.test(pwForm.newPassword) },
                  ].map(r => (
                    <div key={r.label} className={`nxl-pw-rule ${r.ok ? 'ok' : ''}`}>
                      <span>{r.ok ? '✓' : '○'}</span>{r.label}
                    </div>
                  ))}
                </div>
              )}

              {pwMsg.text && (
                <div className={`nxl-up-alert nxl-alert-${pwMsg.type}`}>{pwMsg.text}</div>
              )}
              <button type="submit" className="nxl-btn nxl-btn-save" disabled={pwSaving}>
                {pwSaving ? 'Saving…' : 'Change Password'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ── Reschedule Modal ─────────────────────────────────────────────── */}
      {rescheduleAppt && (
        <div className="nxl-modal-overlay" onClick={e => e.target === e.currentTarget && setRescheduleAppt(null)}>
          <div className="nxl-modal">
            <div className="nxl-modal-header">
              <h3>Reschedule Appointment</h3>
              <button className="nxl-modal-close" onClick={() => setRescheduleAppt(null)}>✕</button>
            </div>
            <p className="nxl-modal-sub">
              {rescheduleAppt.services?.map(s => s.name).join(', ')}
            </p>
            <div className="nxl-up-field">
              <label>New Date</label>
              <input type="date" min={todayISO()}
                value={rescheduleForm.date}
                onChange={e => setRescheduleForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="nxl-up-field">
              <label>New Time</label>
              <select value={rescheduleForm.time}
                onChange={e => setRescheduleForm(f => ({ ...f, time: e.target.value }))}>
                <option value="">Choose a time</option>
                {PRESET_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {rescheduleError && (
              <div className="nxl-up-alert nxl-alert-error">{rescheduleError}</div>
            )}
            <div className="nxl-modal-actions">
              <button className="nxl-btn nxl-btn-outline"
                onClick={() => setRescheduleAppt(null)}>
                Cancel
              </button>
              <button className="nxl-btn nxl-btn-save"
                onClick={saveReschedule} disabled={savingReschedule}>
                {savingReschedule ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Confirmation Modal ─────────────────────────────────────── */}
      {confirmCancel && (
        <div className="nxl-modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmCancel(null)}>
          <div className="nxl-modal nxl-modal-sm">
            <div className="nxl-modal-header">
              <h3>Cancel Appointment?</h3>
              <button className="nxl-modal-close" onClick={() => setConfirmCancel(null)}>✕</button>
            </div>
            <p className="nxl-modal-body-text">
              Are you sure you want to cancel your <strong>{confirmCancel.services?.map(s => s.name).join(', ')}</strong> appointment on <strong>{formatDate(confirmCancel.date)}</strong> at <strong>{confirmCancel.time}</strong>?
            </p>
            {confirmCancel.paymentStatus !== 'unpaid' && (
              <div className="nxl-up-alert nxl-alert-warn" style={{ marginBottom: '1rem' }}>
                ⚠️ Your R{BOOKING_FEE} deposit is non-refundable. 48-hour notice required for cancellations.
              </div>
            )}
            <div className="nxl-modal-actions">
              <button className="nxl-btn nxl-btn-outline" onClick={() => setConfirmCancel(null)}>
                Keep Appointment
              </button>
              <button className="nxl-btn nxl-btn-danger-solid" onClick={handleCancelConfirmed}>
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pre-Payment Modal — always shown before Yoco ─────────────────── */}
      {loyaltyPreview && (() => {
        const d              = loyaltyPreview.data;
        const loyaltyOff     = usePoints ? (d.discountAmount || 0) : 0;
        const codeOff        = discountResult ? discountResult.discountAmount : 0;
        const balanceDue     = Math.max(0, (d.balance || 0) - loyaltyOff - codeOff);
        const totalSaving    = loyaltyOff + codeOff;

        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(5px)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
            onClick={e => e.target === e.currentTarget && setLoyaltyPreview(null)}>

            <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:'500px', maxHeight:'90vh', overflowY:'auto', display:'flex', flexDirection:'column', boxShadow:'0 -8px 40px rgba(0,0,0,0.25)' }}>

              {/* ── Header ── */}
              <div style={{ padding:'0.75rem 1.5rem 0', display:'flex', justifyContent:'center' }}>
                <div style={{ width:40, height:4, borderRadius:2, background:'#e0ccc4' }} />
              </div>
              <div style={{ padding:'1rem 1.5rem 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <h3 style={{ margin:0, fontFamily:"'Cormorant Garamond', serif", fontSize:'1.25rem', fontWeight:700, color:'#3d1f15' }}>
                  Confirm & Pay Deposit
                </h3>
                <button onClick={() => { setLoyaltyPreview(null); setUsePoints(false); setDiscountInput(''); setDiscountResult(null); setDiscountError(''); }}
                  style={{ background:'#f1f5f9', border:'none', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:'0.8rem', color:'#64748b', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              </div>

              <div style={{ padding:'1rem 1.5rem 1.5rem', display:'flex', flexDirection:'column', gap:'1rem' }}>

                {/* ── Price Breakdown ── */}
                <div style={{ background:'#fff8f3', border:'1px solid #e0ccc4', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'0.75rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:'0.85rem', color:'#6b3528' }}>Service Total</span>
                    <span style={{ fontSize:'0.9rem', fontWeight:700, color:'#3d1f15' }}>R{(d.totalPrice || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ padding:'0.75rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #f0e8e0' }}>
                    <span style={{ fontSize:'0.85rem', color:'#6b3528' }}>Deposit (pay online now)</span>
                    <span style={{ fontSize:'0.9rem', fontWeight:700, color:'#10b981' }}>R{(d.depositAmount || 100).toFixed(2)}</span>
                  </div>
                  {codeOff > 0 && (
                    <div style={{ padding:'0.75rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #f0e8e0', background:'#f0fdf4' }}>
                      <span style={{ fontSize:'0.85rem', color:'#15803d' }}>🎟️ Code: {discountResult.code}</span>
                      <span style={{ fontSize:'0.9rem', fontWeight:700, color:'#15803d' }}>− R{codeOff.toFixed(2)}</span>
                    </div>
                  )}
                  {loyaltyOff > 0 && (
                    <div style={{ padding:'0.75rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #f0e8e0', background:'#f0fdf4' }}>
                      <span style={{ fontSize:'0.85rem', color:'#15803d' }}>⭐ {d.maxPointsUsable} loyalty pts</span>
                      <span style={{ fontSize:'0.9rem', fontWeight:700, color:'#15803d' }}>− R{loyaltyOff.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ padding:'0.875rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'2px solid #e0ccc4', background:'linear-gradient(135deg,#fff8f3,#fdf6f0)' }}>
                    <div>
                      <span style={{ fontSize:'0.78rem', color:'#9e7060', display:'block' }}>Balance due at salon</span>
                      {totalSaving > 0 && <span style={{ fontSize:'0.7rem', color:'#10b981', fontWeight:600 }}>You save R{totalSaving.toFixed(2)}!</span>}
                    </div>
                    <span style={{ fontSize:'1.2rem', fontWeight:800, color:'#3d1f15' }}>R{balanceDue.toFixed(2)}</span>
                  </div>
                </div>

                {/* ── Discount Code ── */}
                <div>
                  <p style={{ margin:'0 0 0.5rem', fontSize:'0.75rem', fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'0.07em' }}>
                    🎟️ Have a discount code?
                  </p>
                  {discountResult ? (
                    <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:10, padding:'0.7rem 1rem' }}>
                      <span style={{ flex:1, fontSize:'0.88rem', fontWeight:700, color:'#15803d' }}>
                        ✅ {discountResult.code} — R{discountResult.discountAmount.toFixed(2)} off your balance
                      </span>
                      <button onClick={() => { setDiscountResult(null); setDiscountInput(''); setDiscountError(''); }}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:0, fontSize:'0.9rem' }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display:'flex', gap:'0.5rem' }}>
                        <input
                          type="text"
                          placeholder="Enter code e.g. REFAB1234"
                          value={discountInput}
                          onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(''); }}
                          onKeyDown={e => e.key === 'Enter' && validateBookingDiscount(discountInput, loyaltyPreview.apptId)}
                          style={{ flex:1, padding:'0.7rem 0.875rem', border:`1.5px solid ${discountError ? '#fca5a5' : '#e2e8f0'}`, borderRadius:10, fontSize:'0.88rem', fontFamily:"'DM Sans', sans-serif", outline:'none' }}
                        />
                        <button
                          onClick={() => validateBookingDiscount(discountInput, loyaltyPreview.apptId)}
                          disabled={discountLoading || !discountInput.trim()}
                          style={{ padding:'0 1.25rem', background: discountLoading || !discountInput.trim() ? '#e2e8f0' : 'linear-gradient(135deg,#3d1f15,#6b3528)', color: discountLoading || !discountInput.trim() ? '#94a3b8' : '#ffe8d6', border:'none', borderRadius:10, fontFamily:"'DM Sans', sans-serif", fontWeight:700, fontSize:'0.85rem', cursor: discountLoading || !discountInput.trim() ? 'not-allowed' : 'pointer' }}>
                          {discountLoading ? '…' : 'Apply'}
                        </button>
                      </div>
                      {discountError && <p style={{ margin:'0.4rem 0 0', fontSize:'0.78rem', color:'#dc2626' }}>⚠️ {discountError}</p>}
                    </>
                  )}
                </div>

                {/* ── Loyalty Points Toggle (only if they have redeemable points) ── */}
                {d.canRedeem && d.maxPointsUsable > 0 && (
                  <div>
                    <p style={{ margin:'0 0 0.5rem', fontSize:'0.75rem', fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'0.07em' }}>
                      ⭐ Loyalty Points
                    </p>
                    <div
                      onClick={() => setUsePoints(u => !u)}
                      style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'0.875rem 1rem', border:`1.5px solid ${usePoints ? '#10b981' : '#e2e8f0'}`, borderRadius:12, cursor:'pointer', background: usePoints ? '#f0fdf4' : '#fafafa', transition:'all 0.15s' }}>
                      {/* Toggle switch */}
                      <div style={{ width:46, height:26, borderRadius:50, background: usePoints ? '#10b981' : '#cbd5e1', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                        <div style={{ position:'absolute', top:3, left: usePoints ? 23 : 3, width:20, height:20, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,0.2)', transition:'left 0.2s' }} />
                      </div>
                      <div style={{ flex:1 }}>
                        <p style={{ margin:0, fontSize:'0.88rem', fontWeight:700, color: usePoints ? '#15803d' : '#3d1f15' }}>
                          Use {d.maxPointsUsable} pts — save R{(d.discountAmount || 0).toFixed(2)} at salon
                        </p>
                        <p style={{ margin:'0.1rem 0 0', fontSize:'0.75rem', color:'#64748b' }}>
                          You have {d.currentPoints.toLocaleString()} pts · 100 pts = R10 off balance
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── No points info (when they have none) ── */}
                {!d.canRedeem && (
                  <p style={{ margin:0, fontSize:'0.75rem', color:'#b0a090', textAlign:'center' }}>
                    💡 Earn points on every booking — 1 pt per R1 spent
                  </p>
                )}

                {/* ── Action Buttons ── */}
                <div style={{ display:'flex', gap:'0.75rem', paddingTop:'0.25rem' }}>
                  <button
                    onClick={() => { setLoyaltyPreview(null); setUsePoints(false); setDiscountInput(''); setDiscountResult(null); setDiscountError(''); }}
                    style={{ flex:1, padding:'0.875rem', border:'1.5px solid #e0ccc4', borderRadius:12, background:'#fff', fontFamily:"'DM Sans', sans-serif", fontSize:'0.88rem', fontWeight:600, color:'#64748b', cursor:'pointer' }}>
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const pts  = usePoints ? d.maxPointsUsable : 0;
                      const code = discountResult?.code || null;
                      const appt = appointments.find(a => String(a._id) === loyaltyPreview.apptId);
                      if (appt) proceedToPayment(appt, pts, code);
                    }}
                    disabled={loyaltyRedeeming}
                    style={{ flex:2, padding:'0.875rem', border:'none', borderRadius:12, background: loyaltyRedeeming ? '#e2e8f0' : 'linear-gradient(135deg,#3d1f15,#a0502e)', color: loyaltyRedeeming ? '#94a3b8' : '#ffe8d6', fontFamily:"'DM Sans', sans-serif", fontSize:'0.9rem', fontWeight:700, cursor: loyaltyRedeeming ? 'not-allowed' : 'pointer', transition:'all 0.15s' }}>
                    {loyaltyRedeeming ? 'Processing…' : `Pay R${(d.depositAmount || 100).toFixed(2)} Deposit →`}
                  </button>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      <div className="nxl-up-footer">NXL Beauty Bar</div>
    </div>
  );
}