import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import AppointmentModal from './components/AppointmentModal';
import StaffModal from './components/StaffModal';
import AppointmentCalendar from './components/AppointmentCalendar';
import RevenueChart from './components/RevenueChart';
import BookingsChart from './components/BookingsChart';
import { generateAppointmentsPDF, generateRevenueReportPDF } from './components/PDFExport';
import './AdminDashboard.css';
import EditAppointmentModal from './components/EditAppointmentModal';
import PaymentModal from './components/PaymentModal';

// ─── API helpers ─────────────────────────────────────────────────────────────
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const API_ENDPOINTS = {
  appointments: `${API_BASE_URL}/appointments`,
  services:     `${API_BASE_URL}/services`,
  staff:        `${API_BASE_URL}/employees`,
  availability: `${API_BASE_URL}/availability`,
  clients:      `${API_BASE_URL}/users?limit=500`,
  payments:     `${API_BASE_URL}/payments`,
  notifications: `${API_BASE_URL}/notifications`, 
};

const decimalToFloat = value => {
  if (value == null) return 0;
  if (typeof value === 'object' && '$numberDecimal' in value) return parseFloat(value.$numberDecimal);
  const n = Number(value);
  return isNaN(n) ? 0 : n;
};

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    : {};
};

// ─── UPDATED: apiRequest now auto-redirects to /login on 401/403 ─────────────
async function apiRequest(endpoint, options = {}) {
  const res = await fetch(endpoint, {
    headers: { ...authHeaders(), ...(options.headers || {}) },
    ...options,
  });

  // Token expired or invalid — clear storage and force redirect to login
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
    return Promise.reject(new Error('Session expired. Please log in again.'));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ─── AvailabilityModal ───────────────────────────────────────────────────────
function generateTimeSlots(start = '07:00', end = '19:00', interval = 15) {
  const slots = [];
  let [h, m] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  while (h < endH || (h === endH && m <= endM)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += interval;
    if (m >= 60) { h += 1; m -= 60; }
  }
  return slots;
}

const ALL_SLOTS = generateTimeSlots('07:00', '19:00', 15);

function avPad2(n) { return String(n).padStart(2, '0'); }

function getAvDaysInMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startingDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < startingDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

function toAvISO(year, month, day) {
  return `${year}-${avPad2(month + 1)}-${avPad2(day)}`;
}

function AvailabilityModal({ staff = [], onClose, onAllSubmitted }) {
  const today = new Date();
  const [calMonth, setCalMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [employeeId, setEmployeeId] = useState('ALL');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const days = getAvDaysInMonth(year, month);
  const monthName = calMonth.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const todayISO = toAvISO(today.getFullYear(), today.getMonth(), today.getDate());

  function isDayPast(day) {
    return day ? toAvISO(year, month, day) < todayISO : false;
  }

  function handleDateClick(day) {
    if (!day || isDayPast(day)) return;
    setSelectedDate(toAvISO(year, month, day));
    setSelectedSlots([]);
    setError('');
  }

  function toggleSlot(slot) {
    setSelectedSlots(prev =>
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]
    );
    setError('');
  }

  function selectRange(range) {
    if (range === 'morning') setSelectedSlots(ALL_SLOTS.filter(s => parseInt(s.split(':')[0], 10) < 12));
    else if (range === 'afternoon') setSelectedSlots(ALL_SLOTS.filter(s => parseInt(s.split(':')[0], 10) >= 12));
    else if (range === 'full') setSelectedSlots([...ALL_SLOTS]);
  }

  async function handleSubmit() {
    if (!selectedDate) { setError('Please select a date.'); return; }
    if (selectedSlots.length === 0) { setError('Please select at least one time slot.'); return; }
    if (!reason.trim()) { setError('Please enter a reason for blocking.'); return; }

    setBusy(true);
    setError('');
    let successCount = 0;
    let skippedCount = 0;

    for (const slot of selectedSlots) {
      try {
        await apiRequest(API_ENDPOINTS.availability, {
          method: 'POST',
          body: JSON.stringify({
            date: selectedDate,
            time: slot,
            employeeId: employeeId === 'ALL' ? 'ALL' : employeeId,
            reason: reason.trim(),
          }),
        });
        successCount++;
      } catch (e) {
        if (e.message?.toLowerCase().includes('duplicate') || e.message?.includes('409') || e.message?.includes('11000')) {
          skippedCount++;
        } else {
          setError(`Failed on slot ${slot}: ${e.message}`);
          setBusy(false);
          return;
        }
      }
    }

    setBusy(false);
    if (onAllSubmitted) await onAllSubmitted(successCount, skippedCount);
  }

  const slotsByHour = useMemo(() => {
    const groups = {};
    ALL_SLOTS.forEach(slot => {
      const h = slot.split(':')[0];
      if (!groups[h]) groups[h] = [];
      groups[h].push(slot);
    });
    return groups;
  }, []);

  function formatHour(h) {
    const n = parseInt(h, 10);
    if (n === 0) return '12 AM';
    if (n < 12) return `${n} AM`;
    if (n === 12) return '12 PM';
    return `${n - 12} PM`;
  }

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(15,15,25,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background:'#fff', borderRadius:'16px', width:'100%', maxWidth:'780px', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 25px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f0f0f0', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
          <div>
            <h3 style={{ margin:0, color:'#fff', fontSize:'1.1rem', fontWeight:700 }}>🚫 Block Time Slots</h3>
            <p style={{ margin:'0.2rem 0 0', color:'rgba(255,255,255,0.6)', fontSize:'0.78rem' }}>Select a date, choose time slots, then block them</p>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', width:'32px', height:'32px', borderRadius:'8px', cursor:'pointer', fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>

          {/* LEFT */}
          <div style={{ width:'260px', minWidth:'260px', borderRight:'1px solid #f0f0f0', padding:'1.25rem', overflowY:'auto', display:'flex', flexDirection:'column', gap:'1rem' }}>

            {/* Calendar */}
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
                <button
                  onClick={() => setCalMonth(new Date(year, month - 1, 1))}
                  disabled={year === today.getFullYear() && month <= today.getMonth()}
                  style={{ background:'none', border:'1px solid #e2e8f0', borderRadius:'6px', width:'28px', height:'28px', cursor:'pointer', fontSize:'0.9rem', color:'#64748b', display:'flex', alignItems:'center', justifyContent:'center' }}
                >‹</button>
                <span style={{ fontSize:'0.82rem', fontWeight:600, color:'#1e293b' }}>{monthName}</span>
                <button
                  onClick={() => setCalMonth(new Date(year, month + 1, 1))}
                  style={{ background:'none', border:'1px solid #e2e8f0', borderRadius:'6px', width:'28px', height:'28px', cursor:'pointer', fontSize:'0.9rem', color:'#64748b', display:'flex', alignItems:'center', justifyContent:'center' }}
                >›</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'2px', marginBottom:'4px' }}>
                {['M','T','W','T','F','S','S'].map((d, i) => (
                  <div key={i} style={{ textAlign:'center', fontSize:'0.65rem', color:'#94a3b8', fontWeight:600, padding:'2px 0' }}>{d}</div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'2px' }}>
                {days.map((day, i) => {
                  const iso = day ? toAvISO(year, month, day) : null;
                  const isPast = day && isDayPast(day);
                  const isSelected = iso === selectedDate;
                  const isToday = iso === todayISO;
                  return (
                    <div key={i} onClick={() => handleDateClick(day)} style={{
                      height:'30px', display:'flex', alignItems:'center', justifyContent:'center',
                      borderRadius:'6px', fontSize:'0.75rem', fontWeight: isToday ? 700 : 400,
                      cursor: day && !isPast ? 'pointer' : 'default',
                      background: isSelected ? 'linear-gradient(135deg, #1a1a2e, #4f46e5)' : isToday ? '#eff6ff' : 'transparent',
                      color: isSelected ? '#fff' : isPast ? '#cbd5e1' : isToday ? '#4f46e5' : '#374151',
                      opacity: isPast ? 0.4 : 1,
                      textDecoration: isPast ? 'line-through' : 'none',
                      transition: 'all 0.15s',
                    }}>{day || ''}</div>
                  );
                })}
              </div>
            </div>

            {/* Staff selector */}
            <div>
              <label style={{ fontSize:'0.75rem', fontWeight:600, color:'#374151', display:'block', marginBottom:'0.4rem' }}>Block for</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
                style={{ width:'100%', padding:'0.5rem 0.75rem', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.82rem', color:'#374151', background:'#fff', cursor:'pointer' }}
              >
                <option value="ALL">🏠 Entire Salon</option>
                {staff.filter(s => s.isActive !== false).map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Reason */}
            <div>
              <label style={{ fontSize:'0.75rem', fontWeight:600, color:'#374151', display:'block', marginBottom:'0.4rem' }}>Reason *</label>
              <input
                type="text"
                placeholder="e.g. Public holiday, Training..."
                value={reason}
                onChange={e => { setReason(e.target.value); setError(''); }}
                style={{ width:'100%', padding:'0.5rem 0.75rem', border:`1px solid ${error && !reason.trim() ? '#fca5a5' : '#e2e8f0'}`, borderRadius:'8px', fontSize:'0.82rem', color:'#374151', boxSizing:'border-box' }}
              />
            </div>

            {/* Summary */}
            {selectedDate && (
              <div style={{ padding:'0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0', fontSize:'0.75rem', color:'#64748b' }}>
                <div style={{ fontWeight:600, color:'#374151', marginBottom:'0.25rem' }}>
                  📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-ZA', { weekday:'long', day:'numeric', month:'long' })}
                </div>
                <div>
                  {selectedSlots.length === 0 ? 'No slots selected'
                    : selectedSlots.length === ALL_SLOTS.length ? '🚫 Full day blocked'
                    : `${selectedSlots.length} slot${selectedSlots.length > 1 ? 's' : ''} selected`}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Toolbar */}
            <div style={{ padding:'0.75rem 1.25rem', borderBottom:'1px solid #f0f0f0', display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', background:'#fafafa' }}>
              <span style={{ fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginRight:'0.25rem' }}>Quick select:</span>
              {[{ label:'🌅 Morning', range:'morning' }, { label:'☀️ Afternoon', range:'afternoon' }, { label:'📅 Full Day', range:'full' }].map(({ label, range }) => (
                <button key={range} onClick={() => { if (selectedDate) selectRange(range); }} disabled={!selectedDate}
                  style={{ padding:'0.3rem 0.7rem', fontSize:'0.72rem', fontWeight:600, border:'1px solid #e2e8f0', borderRadius:'20px', cursor: selectedDate ? 'pointer' : 'not-allowed', background:'#fff', color:'#374151', opacity: selectedDate ? 1 : 0.4, transition:'all 0.15s' }}
                  onMouseEnter={e => { if (selectedDate) e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                >{label}</button>
              ))}
              {selectedSlots.length > 0 && (
                <button onClick={() => setSelectedSlots([])}
                  style={{ padding:'0.3rem 0.7rem', fontSize:'0.72rem', fontWeight:600, border:'1px solid #fca5a5', borderRadius:'20px', cursor:'pointer', background:'#fff5f5', color:'#dc2626', marginLeft:'auto' }}
                >✕ Clear</button>
              )}
            </div>

            {/* Slots */}
            <div style={{ flex:1, overflowY:'auto', padding:'1rem 1.25rem' }}>
              {!selectedDate ? (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'#94a3b8', gap:'0.75rem' }}>
                  <span style={{ fontSize:'2.5rem' }}>📅</span>
                  <p style={{ margin:0, fontSize:'0.85rem', fontWeight:500 }}>Select a date to choose time slots</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  {Object.entries(slotsByHour).map(([hour, slots]) => (
                    <div key={hour}>
                      <div style={{ fontSize:'0.7rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.35rem' }}>
                        {formatHour(hour)}
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'0.35rem' }}>
                        {slots.map(slot => {
                          const isSelected = selectedSlots.includes(slot);
                          return (
                            <button key={slot} onClick={() => toggleSlot(slot)} style={{
                              padding:'0.45rem 0.25rem', fontSize:'0.75rem', fontWeight: isSelected ? 700 : 500,
                              border:`2px solid ${isSelected ? '#4f46e5' : '#e2e8f0'}`,
                              borderRadius:'8px', cursor:'pointer', transition:'all 0.12s',
                              background: isSelected ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : '#fff',
                              color: isSelected ? '#fff' : '#374151',
                              boxShadow: isSelected ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
                            }}>{slot}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding:'1rem 1.25rem', borderTop:'1px solid #f0f0f0', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.75rem', background:'#fafafa' }}>
              {error ? (
                <div style={{ flex:1, padding:'0.5rem 0.75rem', background:'#fff5f5', border:'1px solid #fca5a5', borderRadius:'8px', fontSize:'0.78rem', color:'#dc2626', fontWeight:500 }}>
                  ⚠️ {error}
                </div>
              ) : <div style={{ flex:1 }} />}
              <button onClick={onClose} disabled={busy}
                style={{ padding:'0.6rem 1.2rem', fontSize:'0.82rem', fontWeight:600, border:'1px solid #e2e8f0', borderRadius:'8px', cursor: busy ? 'not-allowed' : 'pointer', background:'#fff', color:'#64748b', opacity: busy ? 0.6 : 1 }}
              >Cancel</button>
              <button onClick={handleSubmit} disabled={busy || !selectedDate || selectedSlots.length === 0}
                style={{
                  padding:'0.6rem 1.4rem', fontSize:'0.82rem', fontWeight:700, border:'none', borderRadius:'8px',
                  cursor: busy || !selectedDate || selectedSlots.length === 0 ? 'not-allowed' : 'pointer',
                  background: busy || !selectedDate || selectedSlots.length === 0 ? '#e2e8f0' : 'linear-gradient(135deg, #1a1a2e, #4f46e5)',
                  color: busy || !selectedDate || selectedSlots.length === 0 ? '#94a3b8' : '#fff',
                  transition:'all 0.15s', minWidth:'140px',
                }}
              >
                {busy ? 'Blocking...' : selectedSlots.length > 0 ? `🚫 Block ${selectedSlots.length} Slot${selectedSlots.length > 1 ? 's' : ''}` : 'Block Slots'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Payment status badge ─────────────────────────────────────────────────────
function PaymentBadge({ status }) {
  const cfg = {
    unpaid:       { bg:'#fff0f0', color:'#c53030', border:'#fed7d7', label:'⚠️ Unpaid',       fw:700 },
    deposit_paid: { bg:'#f0fff4', color:'#276749', border:'#c6f6d5', label:'✅ Deposit Paid', fw:600 },
    paid:         { bg:'#ebf8ff', color:'#2c5282', border:'#bee3f8', label:'✅ Paid',          fw:600 },
    refunded:     { bg:'#fffaf0', color:'#c05621', border:'#feebc8', label:'↩️ Refunded',      fw:600 },
  };
  const c = cfg[status] || cfg.unpaid;
  return (
    <span style={{ background:c.bg, color:c.color, border:`1px solid ${c.border}`, fontWeight:c.fw, padding:'0.25rem 0.65rem', borderRadius:'20px', fontSize:'0.72rem', display:'inline-block', whiteSpace:'nowrap' }}>
      {c.label}
    </span>
  );
}

function appointmentAge(createdAt) {
  if (!createdAt) return '';
  const mins = Math.floor((Date.now() - new Date(createdAt)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function confirmHardDelete(appt) {
  const name = appt.userName || appt.clientName || 'Unknown client';
  return window.confirm(
    `⚠️  PERMANENTLY DELETE APPOINTMENT\n\nClient : ${name}\nDate   : ${appt.date}  ${appt.time}\nStatus : ${appt.paymentStatus || 'unpaid'}\n\nThis removes the appointment AND any associated payment records from the database.\nThis action CANNOT be undone.\n\nAre you absolutely sure?`
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AdminDashboard
// ════════════════════════════════════════════════════════════════════════════
function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();

  const [activeSection, setActiveSection] = useState(() => localStorage.getItem('adminActiveSection') || 'overview');
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [deletingId, setDeletingId]     = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chartRange, setChartRange]     = useState('week');
  const [toast, setToast]               = useState(null);

  const [filters, setFilters] = useState({ dateRange:{ start:null, end:null }, staff:'all', service:'all', status:'all', client:'' });

  const [appointments, setAppointments] = useState([]);
  const [services,     setServices]     = useState([]);
  const [staff,        setStaff]        = useState([]);
  const [clients,      setClients]      = useState([]);
  const [availability, setAvailability] = useState([]);
  const [payments,     setPayments]     = useState([]);
  const [notifications, setNotifications] = useState([]);

  const [reportMeta, setReportMeta] = useState({ totalRevenueToday:0, totalRevenueWeek:0, totalRevenueMonth:0, bookingsToday:0, upcomingBookings:0, cancellations:0, noShows:0, unpaidCount:0 });

  const [showServiceForm,          setShowServiceForm]          = useState(false);
  const [editingService,           setEditingService]           = useState(null);
  const [serviceForm,              setServiceForm]              = useState({ name:'', duration:'', price:'', description:'', category:'' });
  const [showAppointmentModal,     setShowAppointmentModal]     = useState(false);
  const [showStaffModal,           setShowStaffModal]           = useState(false);
  const [showAvailabilityModal,    setShowAvailabilityModal]    = useState(false);
  const [editingStaff,             setEditingStaff]             = useState(null);
  const [editingAppointment,       setEditingAppointment]       = useState(null);
  const [showEditAppointmentModal, setShowEditAppointmentModal] = useState(false);
  const [showPaymentModal,         setShowPaymentModal]         = useState(false);
  const [selectedAppointment,      setSelectedAppointment]      = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => { localStorage.setItem('adminActiveSection', activeSection); }, [activeSection]);

  useEffect(() => { if (!isAuthenticated || authLoading) return; loadAll(); }, [isAuthenticated, authLoading, user]);

  const loadAll = async () => {
    try {
      setLoading(true); setError('');

      const [apptData, svcData, staffData, availData, clientData, payData, notifData] = await Promise.all([
  apiRequest(API_ENDPOINTS.appointments),
  apiRequest(API_ENDPOINTS.services),
  apiRequest(API_ENDPOINTS.staff),
  apiRequest(API_ENDPOINTS.availability),
  apiRequest(API_ENDPOINTS.clients),
  apiRequest(API_ENDPOINTS.payments),
  apiRequest(API_ENDPOINTS.notifications),
]);

      const appts = apptData.data || [];
      const pays  = (payData.data || []).map(p => ({ ...p, amount: decimalToFloat(p.amount) }));
      setAppointments(appts);
      setServices((svcData.data || []).map(s => ({ ...s, price: decimalToFloat(s.price), durationMinutes: s.durationMinutes || s.duration })));
      setStaff(staffData.data || []);
      setAvailability(availData.data || []);
      setClients((clientData.data || []).filter(c => c.role !== 'admin'));
      setPayments(pays);
      computeReportMeta(appts, pays);
      setNotifications(notifData.data || []);
    } catch (err) {
      console.error('AdminDashboard load error:', err);
      // Don't set error if we're being redirected due to auth failure
      if (!err.message.includes('Session expired')) {
        setError(err.message || 'Failed to load admin data');
      }
    } finally { setLoading(false); }
  };

  const unpaidAppointments = useMemo(() => appointments.filter(a => a.paymentStatus === 'unpaid'), [appointments]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter(appt => {
      const matchStaff   = filters.staff   === 'all' || String(appt.employeeId) === String(filters.staff);
      const matchService = filters.service === 'all' || (appt.serviceIds || []).some(id => String(id) === String(filters.service));
      const matchStatus  = filters.status  === 'all' || appt.status === filters.status;
      const matchClient  = !filters.client || appt.userName?.toLowerCase().includes(filters.client.toLowerCase()) || appt.clientName?.toLowerCase().includes(filters.client.toLowerCase()) || appt.user?.email?.toLowerCase().includes(filters.client.toLowerCase());
      let matchDate = true;
      if (filters.dateRange.start && filters.dateRange.end) {
        const d = new Date(appt.date);
        matchDate = d >= new Date(filters.dateRange.start) && d <= new Date(filters.dateRange.end);
      }
      return matchStaff && matchService && matchStatus && matchClient && matchDate;
    });
  }, [appointments, filters]);

  const staffWorkload = useMemo(() => {
    const w = {};
    staff.forEach(s => (w[String(s._id)] = 0));
    filteredAppointments.forEach(a => { const k = String(a.employeeId); if (k in w) w[k]++; });
    return w;
  }, [filteredAppointments, staff]);

  const clientStats = useMemo(() => {
    const stats = {};
    appointments.forEach(a => {
      const k = String(a.userId || '');
      if (!stats[k]) stats[k] = { total:0, last:null };
      stats[k].total++;
      const d = new Date(a.date);
      if (!stats[k].last || d > stats[k].last) stats[k].last = d;
    });
    return stats;
  }, [appointments]);

  function computeReportMeta(apptList, payList) {
    const today = new Date();
    const sameDay = (d1, d2) => d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate();
    const withinDays = (date, n) => (today - new Date(date)) / (1000*60*60*24) < n;
    setReportMeta({
      bookingsToday:     apptList.filter(a => sameDay(new Date(a.date), today)).length,
      upcomingBookings:  apptList.filter(a => new Date(a.date) >= today).length,
      cancellations:     apptList.filter(a => a.status === 'cancelled').length,
      noShows:           apptList.filter(a => a.status === 'no-show').length,
      unpaidCount:       apptList.filter(a => a.paymentStatus === 'unpaid').length,
      totalRevenueToday: payList.filter(p => sameDay(new Date(p.createdAt), today) && p.status==='paid').reduce((s,p)=>s+decimalToFloat(p.amount),0),
      totalRevenueWeek:  payList.filter(p => withinDays(p.createdAt,7)  && p.status==='paid').reduce((s,p)=>s+decimalToFloat(p.amount),0),
      totalRevenueMonth: payList.filter(p => withinDays(p.createdAt,30) && p.status==='paid').reduce((s,p)=>s+decimalToFloat(p.amount),0),
    });
  }

  async function hardDeleteAppointment(appt) {
    if (appt.paymentStatus !== 'unpaid') { alert('Only unpaid appointments can be permanently deleted.'); return; }
    if (!confirmHardDelete(appt)) return;
    setDeletingId(appt._id);
    try {
      await apiRequest(`${API_ENDPOINTS.appointments}/${appt._id}`, { method:'DELETE' });
      const linked = payments.filter(p => String(p.appointmentId) === String(appt._id) && p.status === 'pending');
      await Promise.allSettled(linked.map(p => apiRequest(`${API_ENDPOINTS.payments}/${p._id}`, { method:'DELETE' })));
      const [apptData, payData] = await Promise.all([apiRequest(API_ENDPOINTS.appointments), apiRequest(API_ENDPOINTS.payments)]);
      const appts = apptData.data || [];
      const pays  = (payData.data || []).map(p => ({ ...p, amount: decimalToFloat(p.amount) }));
      setAppointments(appts); setPayments(pays); computeReportMeta(appts, pays);
      showToast(`Appointment for ${appt.userName || 'client'} permanently deleted.`);
      addNotification(`Deleted unpaid appointment for ${appt.userName || 'client'} on ${appt.date}`);
    } catch (err) { alert('Delete failed: ' + err.message); }
    finally { setDeletingId(null); }
  }

  async function mutateAppointment(id, payload) {
    await apiRequest(`${API_ENDPOINTS.appointments}/${id}`, { method:'PUT', body:JSON.stringify(payload) });
    const apptData = await apiRequest(API_ENDPOINTS.appointments);
    const appts = apptData.data || [];
    setAppointments(appts); computeReportMeta(appts, payments);
  }

  async function mutateService(id, payload, method) {
    const opts = { method };
    if (method !== 'DELETE') {
      if (payload.price !== undefined) payload.price = Number(payload.price);
      if (payload.durationMinutes !== undefined) payload.durationMinutes = Number(payload.durationMinutes);
      opts.body = JSON.stringify(payload);
    }
    const endpoint = id && method !== 'POST' ? `${API_ENDPOINTS.services}/${id}` : API_ENDPOINTS.services;
    const result = await apiRequest(endpoint, opts);
    const svcData = await apiRequest(API_ENDPOINTS.services);
    setServices((svcData.data || []).map(s => ({ ...s, price:decimalToFloat(s.price), durationMinutes:s.durationMinutes||s.duration })));
    return result;
  }

  async function mutateStaff(id, payload, method = 'PUT') {
    const opts = { method };
    if (method !== 'DELETE') opts.body = JSON.stringify(payload);
    await apiRequest(id ? `${API_ENDPOINTS.staff}/${id}` : API_ENDPOINTS.staff, opts);
    const staffData = await apiRequest(API_ENDPOINTS.staff);
    setStaff(staffData.data || []);
  }

  async function mutateAvailability(id, payload, method = 'PUT') {
    const opts = { method };
    if (method !== 'DELETE') opts.body = JSON.stringify(payload);
    await apiRequest(id ? `${API_ENDPOINTS.availability}/${id}` : API_ENDPOINTS.availability, opts);
    const availData = await apiRequest(API_ENDPOINTS.availability);
    setAvailability(availData.data || []);
  }

  async function blockClient(clientId, block) {
    await apiRequest(`${API_BASE_URL}/users/${clientId}`, { method:'PUT', body:JSON.stringify({ isActive:!block }) });
    const clientData = await apiRequest(API_ENDPOINTS.clients);
    setClients((clientData.data || []).filter(c => c.role !== 'admin'));
  }

  async function addNotification(msg) {
  try {
    const data = await apiRequest(API_ENDPOINTS.notifications, {
      method: 'POST',
      body: JSON.stringify({ message: msg, target: 'staff' }),
    });
    setNotifications(prev => [data.data, ...prev]);
  } catch (err) {
    // Fallback to local state if API fails
    setNotifications(prev => [{ id: Date.now(), message: msg, createdAt: new Date() }, ...prev]);
  }
}

  const exportCSV = () => {
    const rows = [
      ['Date','Client','Staff','Services','Status','Payment','Amount (R)'],
      ...appointments.map(appt => [
        appt.date,
        appt.userName || appt.clientName || 'Unknown',
        staff.find(s => String(s._id) === String(appt.employeeId))?.name || '—',
        (appt.serviceIds || []).map(id => services.find(s => String(s._id) === String(id))?.name).filter(Boolean).join('; '),
        appt.status,
        appt.paymentStatus || 'unpaid',
        (payments.find(p => String(p.appointmentId) === String(appt._id))?.amount ?? 0).toFixed(2),
      ]),
    ];
    const csv  = rows.map(r => r.map(f => `"${String(f ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'nxl-report.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const renderUnpaidPanel = () => {
    if (!unpaidAppointments.length) return null;
    return (
      <section className="panel unpaid-panel">
        <header>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <span className="unpaid-badge-icon">⚠️</span>
            <div>
              <h3 style={{ color:'#c53030', marginBottom:'0.15rem' }}>Unpaid Appointments — Admin Review Required</h3>
              <p style={{ color:'#718096', fontSize:'0.78rem', fontWeight:400 }}>These bookings were started but payment was never completed. Review and permanently delete to free the time slot.</p>
            </div>
          </div>
          <span className="unpaid-count-badge">{unpaidAppointments.length}</span>
        </header>
        <div className="table-responsive">
          <table>
            <thead><tr><th>Client</th><th>Date & Time</th><th>Services</th><th>Stylist</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {unpaidAppointments.map(appt => (
                <tr key={appt._id} className="unpaid-row">
                  <td><div style={{ fontWeight:600 }}>{appt.userName || appt.clientName || '—'}</div>{appt.user?.email && <div className="sub-text">{appt.user.email}</div>}</td>
                  <td><div style={{ fontWeight:600 }}>{appt.date}</div><div className="sub-text">{appt.time}</div></td>
                  <td>{(appt.serviceIds || []).map(id => services.find(s => String(s._id) === String(id))?.name).filter(Boolean).join(', ') || '—'}</td>
                  <td>{staff.find(s => String(s._id) === String(appt.employeeId))?.name || appt.employee?.name || '—'}</td>
                  <td><span className="age-label">{appointmentAge(appt.createdAt)}</span></td>
                  <td className="row-actions">
                    <button className="action-btn cancel-btn" onClick={async () => { await mutateAppointment(appt._id, { status:'cancelled' }); showToast('Appointment cancelled.'); addNotification(`Cancelled unpaid appointment for ${appt.userName || 'client'}`); }}>Cancel</button>
                    <button className="action-btn delete-btn" disabled={deletingId === appt._id} onClick={() => hardDeleteAppointment(appt)}>{deletingId === appt._id ? 'Deleting…' : '🗑 Delete'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const renderOverview = () => (
    <>
      <div className="grid grid-responsive">
        <StatCard label="Bookings Today"  value={reportMeta.bookingsToday}                         icon="📅" color="rose" />
        <StatCard label="Upcoming"        value={reportMeta.upcomingBookings}                      icon="⏰" color="sky" />
        <StatCard label="Revenue Today"   value={`R${reportMeta.totalRevenueToday.toFixed(2)}`}   icon="💰" color="emerald" />
        <StatCard label="Revenue (Week)"  value={`R${reportMeta.totalRevenueWeek.toFixed(2)}`}    icon="📈" color="violet" />
        <StatCard label="Revenue (Month)" value={`R${reportMeta.totalRevenueMonth.toFixed(2)}`}   icon="📊" color="amber" />
        <StatCard label="Cancellations"   value={reportMeta.cancellations}                         icon="✕"  color="slate" />
        <StatCard label="No-Shows"        value={reportMeta.noShows}                               icon="🚫" color="slate" />
        <StatCard label="Unpaid Bookings" value={reportMeta.unpaidCount} icon="💳" color={reportMeta.unpaidCount > 0 ? 'danger' : 'slate'} onClick={reportMeta.unpaidCount > 0 ? () => setActiveSection('appointments') : undefined} clickable={reportMeta.unpaidCount > 0} />
      </div>
      {renderUnpaidPanel()}
      <section className="panel">
        <header>
          <h3>Revenue Trend</h3>
          <div className="button-row">
            {['week','month','year'].map(r => (
              <button key={r} className={`btn ${chartRange === r ? 'primary' : 'ghost'}`} onClick={() => setChartRange(r)}>{r.charAt(0).toUpperCase() + r.slice(1)}</button>
            ))}
          </div>
        </header>
        <RevenueChart payments={payments} range={chartRange} />
      </section>
      <section className="panel"><header><h3>Bookings Trend</h3></header><BookingsChart appointments={appointments} range={chartRange} /></section>
      <section className="panel quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button className="btn primary" onClick={() => setShowAppointmentModal(true)}>➕ Add Booking</button>
          <button className="btn primary" onClick={() => setActiveSection('services')}>💅 Add Service</button>
          <button className="btn primary" onClick={() => setShowAvailabilityModal(true)}>🚫 Block Time</button>
          {reportMeta.unpaidCount > 0 && (
            <button className="btn" style={{ background:'#c53030', color:'white' }} onClick={() => { setFilters(f => ({ ...f, status:'pending' })); setActiveSection('appointments'); }}>⚠️ Review {reportMeta.unpaidCount} Unpaid</button>
          )}
        </div>
      </section>
    </>
  );

  const renderAppointments = () => (
    <>
      {renderUnpaidPanel()}
      <section className="panel filters">
        <h3>Filters</h3>
        <div className="filter-grid">
          <select value={filters.staff} onChange={e => setFilters({ ...filters, staff:e.target.value })}>
            <option value="all">All Staff</option>
            {staff.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <select value={filters.service} onChange={e => setFilters({ ...filters, service:e.target.value })}>
            <option value="all">All Services</option>
            {services.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <select value={filters.status} onChange={e => setFilters({ ...filters, status:e.target.value })}>
            <option value="all">All Statuses</option>
            <option value="pending">⚠️ Pending Payment</option>
            <option value="booked">Booked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no-show">No Show</option>
          </select>
          <input placeholder="Search client…" value={filters.client} onChange={e => setFilters({ ...filters, client:e.target.value })} />
        </div>
      </section>
      <section className="panel">
        <header>
          <h3>Appointments <span className="count-chip">{filteredAppointments.length}</span></h3>
          <div className="button-row">
            <button className="btn ghost" onClick={() => { try { generateAppointmentsPDF(filteredAppointments, staff, services, payments); } catch (e) { alert('PDF export failed: ' + e.message); } }}>📄 PDF</button>
            <button className="btn ghost" onClick={exportCSV}>📊 CSV</button>
            <button className="btn primary" onClick={() => setShowAppointmentModal(true)}>➕ New</button>
          </div>
        </header>
        <div className="table-responsive">
          <table>
            <thead><tr><th>Date</th><th>Time</th><th>Client</th><th className="hide-mobile">Services</th><th className="hide-mobile">Staff</th><th>Status</th><th>Payment</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredAppointments.map(appt => (
                <tr key={appt._id} className={appt.paymentStatus === 'unpaid' ? 'unpaid-row' : ''}>
                  <td>{appt.date}</td>
                  <td>{appt.time}</td>
                  <td><div style={{ fontWeight:600 }}>{appt.userName || appt.clientName || '—'}</div>{appt.user?.email && <div className="sub-text">{appt.user.email}</div>}</td>
                  <td className="hide-mobile">{(appt.serviceIds || []).map(id => services.find(s => String(s._id) === String(id))?.name).filter(Boolean).join(', ') || '—'}</td>
                  <td className="hide-mobile">{staff.find(s => String(s._id) === String(appt.employeeId))?.name || appt.employee?.name || '—'}</td>
                  <td><span className={`status ${appt.status}`}>{appt.status}</span></td>
                  <td><PaymentBadge status={appt.paymentStatus || 'unpaid'} /></td>
                  <td className="row-actions">
                    <button className="action-btn" title="Edit" onClick={() => { setEditingAppointment(appt); setShowEditAppointmentModal(true); }}>✏️</button>
                    <button className="action-btn" title="Mark Complete" onClick={() => mutateAppointment(appt._id, { status:'completed' }).then(() => showToast('Marked complete.'))}>✓</button>
                    <button className="action-btn" title="Cancel" onClick={() => mutateAppointment(appt._id, { status:'cancelled' }).then(() => showToast('Appointment cancelled.'))}>✕</button>
                    {(appt.paymentStatus === 'unpaid' || appt.paymentStatus === 'deposit_paid') && (
                      <button className="action-btn" title="Record Payment" onClick={() => { setSelectedAppointment(appt); setShowPaymentModal(true); }}>💳</button>
                    )}
                    {appt.paymentStatus === 'unpaid' && (
                      <button className="action-btn delete-btn" title="Permanently delete (unpaid only)" disabled={deletingId === appt._id} onClick={() => hardDeleteAppointment(appt)}>
                        {deletingId === appt._id ? '…' : '🗑'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredAppointments.length && <tr><td colSpan="8" className="empty-row">No appointments match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel calendar-panel">
        <header><h3>Calendar View</h3></header>
        {filteredAppointments.length > 0
          ? <AppointmentCalendar appointments={filteredAppointments} staff={staff} services={services} onSelectSlot={() => setShowAppointmentModal(true)} onSelectEvent={ev => console.log('Selected:', ev.resource)} />
          : <div className="calendar-placeholder">No appointments to display.</div>
        }
      </section>
    </>
  );

  const renderServices = () => (
    <section className="panel">
      <header>
        <h3>Services</h3>
        <button className="btn primary" onClick={() => { setEditingService(null); setServiceForm({ name:'', duration:'', price:'', description:'', category:'' }); setShowServiceForm(true); }}>+ Add Service</button>
      </header>
      <div className="table-responsive">
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Duration</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {services.map(svc => (
              <tr key={svc._id}>
                <td style={{ fontWeight:600 }}>{svc.name}</td>
                <td>{svc.category || 'Uncategorized'}</td>
                <td>{svc.durationMinutes} min</td>
                <td>R{decimalToFloat(svc.price).toFixed(2)}</td>
                <td><span className={`status ${svc.isActive ? 'booked' : 'cancelled'}`}>{svc.isActive ? 'Active' : 'Disabled'}</span></td>
                <td className="row-actions">
                  <button className="action-btn" onClick={() => { setEditingService(svc); setServiceForm({ name:svc.name, duration:svc.durationMinutes, price:decimalToFloat(svc.price), category:svc.category||'', description:svc.description||'' }); setShowServiceForm(true); }}>Edit</button>
                  <button className="action-btn" onClick={async () => { try { await mutateService(svc._id, { isActive:!svc.isActive }, 'PUT'); showToast(`Service ${svc.isActive ? 'disabled' : 'enabled'}.`); } catch (e) { alert(e.message); } }}>{svc.isActive ? 'Disable' : 'Enable'}</button>
                  <button className="action-btn delete-btn" onClick={async () => { if (!window.confirm(`Delete "${svc.name}"?`)) return; try { await mutateService(svc._id, {}, 'DELETE'); showToast(`"${svc.name}" deleted.`); } catch (e) { alert(e.message); } }}>Delete</button>
                </td>
              </tr>
            ))}
            {!services.length && <tr><td colSpan="6" className="empty-row">No services defined yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {showServiceForm && (
        <Modal title={editingService ? 'Edit Service' : 'Add Service'} onClose={() => { setShowServiceForm(false); setEditingService(null); }}>
          <form onSubmit={async e => {
            e.preventDefault(); e.stopPropagation(); setIsSubmitting(true);
            try {
              const dur = Number(serviceForm.duration); const price = Number(serviceForm.price);
              if (dur % 15 !== 0) { alert('Duration must be a multiple of 15 minutes.'); return; }
              if (isNaN(price) || price < 0) { alert('Enter a valid price.'); return; }
              await mutateService(editingService?._id, { name:serviceForm.name, durationMinutes:dur, price, description:serviceForm.description, category:serviceForm.category, isActive:true }, editingService ? 'PUT' : 'POST');
              setShowServiceForm(false); setEditingService(null);
              showToast(`Service ${editingService ? 'updated' : 'created'}.`);
            } catch (e) { alert(e.message); } finally { setIsSubmitting(false); }
          }} className="form-grid">
            <input required placeholder="Service name" value={serviceForm.name} onChange={e => setServiceForm({...serviceForm, name:e.target.value})} />
            <input placeholder="Category (e.g. Manicure)" value={serviceForm.category} onChange={e => setServiceForm({...serviceForm, category:e.target.value})} />
            <input required type="number" min="15" step="15" placeholder="Duration (min)" value={serviceForm.duration} onChange={e => setServiceForm({...serviceForm, duration:e.target.value})} />
            <input required type="number" min="0" step="0.01" placeholder="Price (R)" value={serviceForm.price} onChange={e => setServiceForm({...serviceForm, price:e.target.value})} />
            <textarea placeholder="Description (optional)" value={serviceForm.description} onChange={e => setServiceForm({...serviceForm, description:e.target.value})} />
            <footer className="modal-actions">
              <button type="button" onClick={() => { setShowServiceForm(false); setEditingService(null); }}>Cancel</button>
              <button type="submit" className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save Service'}</button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );

  const renderStaff = () => (
    <section className="panel">
      <header><h3>Staff Management</h3><button className="btn primary" onClick={() => { setEditingStaff(null); setShowStaffModal(true); }}>➕ Add Technician</button></header>
      <div className="table-responsive">
        <table>
          <thead><tr><th>Name</th><th>Services</th><th>Active</th><th>Workload</th><th>Actions</th></tr></thead>
          <tbody>
            {staff.map(emp => (
              <tr key={emp._id}>
                <td style={{ fontWeight:600 }}>{emp.name}</td>
                <td>{(emp.servicesOffered || []).map(id => services.find(s => String(s._id) === String(id))?.name).filter(Boolean).join(', ') || '—'}</td>
                <td><span className={`status ${emp.isActive ? 'booked' : 'cancelled'}`}>{emp.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>{staffWorkload[String(emp._id)] || 0} appts</td>
                <td className="row-actions">
                  <button className="action-btn" onClick={() => { setEditingStaff(emp); setShowStaffModal(true); }}>Edit</button>
                  <button className="action-btn" onClick={async () => { if (!window.confirm(`${emp.isActive ? 'Deactivate' : 'Activate'} ${emp.name}?`)) return; try { await mutateStaff(emp._id, { isActive:!emp.isActive }, 'PUT'); showToast(`${emp.name} ${emp.isActive ? 'deactivated' : 'activated'}.`); } catch (e) { alert(e.message); } }}>{emp.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button className="action-btn delete-btn" onClick={async () => { if (!window.confirm(`Remove ${emp.name}?`)) return; try { await mutateStaff(emp._id, {}, 'DELETE'); showToast(`${emp.name} removed.`); } catch (e) { alert(e.message); } }}>Remove</button>
                </td>
              </tr>
            ))}
            {!staff.length && <tr><td colSpan="5" className="empty-row">No staff members yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderClients = () => (
    <section className="panel">
      <header>
        <h3>Clients <span className="count-chip">{clients.length}</span></h3>
        <input placeholder="Search clients…" value={filters.client} onChange={e => setFilters({...filters, client:e.target.value})} style={{ padding:'0.5rem 0.75rem', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.875rem' }} />
      </header>
      <div className="table-responsive">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Bookings</th><th>Last Booking</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {clients.filter(c => c.email?.toLowerCase().includes(filters.client.toLowerCase()) || `${c.firstName} ${c.lastName}`.toLowerCase().includes(filters.client.toLowerCase())).map(client => {
              const stats = clientStats[String(client._id)] || { total:0, last:null };
              const active = client.isActive !== false;
              return (
                <tr key={client._id}>
                  <td style={{ fontWeight:600 }}>{client.firstName} {client.lastName}</td>
                  <td>{client.email}</td>
                  <td>{stats.total}</td>
                  <td>{stats.last ? stats.last.toISOString().split('T')[0] : '—'}</td>
                  <td><span className={`status ${active ? 'booked' : 'cancelled'}`}>{active ? 'Active' : 'Blocked'}</span></td>
                  <td className="row-actions">
                    <button className="action-btn" onClick={() => { addNotification(`Reminder sent to ${client.email}`); showToast('Reminder sent.'); }}>Notify</button>
                    <button className={`action-btn ${active ? 'delete-btn' : ''}`} onClick={() => blockClient(client._id, active).then(() => showToast(`Client ${active ? 'blocked' : 'unblocked'}.`))}>{active ? 'Block' : 'Unblock'}</button>
                  </td>
                </tr>
              );
            })}
            {!clients.length && <tr><td colSpan="6" className="empty-row">No clients registered yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderAvailability = () => (
    <section className="panel">
      <header><h3>Availability & Blocked Slots</h3><button className="btn primary" onClick={() => setShowAvailabilityModal(true)}>➕ Block Time</button></header>
      <div className="table-responsive">
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Employee</th><th>Reason</th><th>Actions</th></tr></thead>
          <tbody>
            {availability.map(slot => (
              <tr key={slot._id}>
                <td>{slot.date}</td>
                <td>{slot.time}</td>
                <td>{slot.employeeId === 'ALL' ? 'Salon-wide' : staff.find(s => String(s._id) === String(slot.employeeId))?.name || '—'}</td>
                <td>{slot.reason}</td>
                <td className="row-actions"><button className="action-btn delete-btn" onClick={() => mutateAvailability(slot._id, {}, 'DELETE').then(() => showToast('Slot unblocked.'))}>Remove</button></td>
              </tr>
            ))}
            {!availability.length && <tr><td colSpan="5" className="empty-row">No blocked time slots.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderPayments = () => (
    <section className="panel">
      <header>
        <h3>Payments</h3>
        <div className="button-row">
          <button className="btn ghost" onClick={exportCSV}>📊 CSV</button>
          <button className="btn ghost" onClick={() => { try { generateRevenueReportPDF(payments, `Last ${chartRange}`); } catch (e) { alert(e.message); } }}>📄 PDF</button>
        </div>
      </header>
      <div className="table-responsive">
        <table>
          <thead><tr><th>Date</th><th>Amount</th><th>Type</th><th>Method</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {payments.map(pay => (
              <tr key={pay._id}>
                <td>{new Date(pay.createdAt).toLocaleString()}</td>
                <td style={{ fontWeight:600 }}>R{decimalToFloat(pay.amount).toFixed(2)}</td>
                <td>{pay.type || 'full'}</td>
                <td>{pay.method}</td>
                <td><span className={`status ${pay.status === 'paid' ? 'booked' : pay.status === 'refunded' ? 'no-show' : 'cancelled'}`}>{pay.status}</span></td>
                <td className="row-actions">
                  {pay.status === 'paid' && (
                    <button className="action-btn" title="Issue Refund" onClick={async () => {
                      if (!window.confirm('Refund this payment?')) return;
                      try { await apiRequest(`${API_ENDPOINTS.payments}/${pay._id}`, { method:'PUT', body:JSON.stringify({ status:'refunded' }) }); await loadAll(); showToast('Payment refunded.'); } catch (e) { alert(e.message); }
                    }}>↩️ Refund</button>
                  )}
                </td>
              </tr>
            ))}
            {!payments.length && <tr><td colSpan="6" className="empty-row">No payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderNotifications = () => (
    <section className="panel">
      <header><h3>Activity Log</h3><button className="btn ghost" onClick={async () => {
  try {
    await apiRequest(API_ENDPOINTS.notifications, { method: 'DELETE' });
    setNotifications([]);
  } catch (e) {
    alert('Failed to clear notifications: ' + e.message);
  }
}}>Clear All</button></header>
      <ul className="notification-feed">
        {notifications.map(n => (<li key={n.id}><span>{n.message}</span><small>{new Date(n.createdAt).toLocaleString()}</small></li>))}
        {!notifications.length && <li className="empty-row">No activity yet.</li>}
      </ul>
    </section>
  );

  if (authLoading || loading) {
    return (<div className="admin-loading"><div className="spinner" /><span>Loading admin dashboard…</span></div>);
  }
  if (error) {
    return (<div className="admin-error"><h2>Admin Dashboard</h2><p>{error}</p><button className="btn primary" onClick={loadAll}>Retry</button></div>);
  }

  const sectionRenderer = () => {
    switch (activeSection) {
      case 'appointments':  return renderAppointments();
      case 'services':      return renderServices();
      case 'staff':         return renderStaff();
      case 'clients':       return renderClients();
      case 'availability':  return renderAvailability();
      case 'payments':      return renderPayments();
      case 'notifications': return renderNotifications();
      default:              return renderOverview();
    }
  };

  return (
    <div className="admin-shell">
      {toast && (
        <div className={`toast toast-${toast.type}`} key={toast.id}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}
      <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><div><h2>NXL Beauty Bar</h2><p>Admin Panel</p></div></div>
        <nav>
          <SidebarBtn icon="🏠" label="Overview"      section="overview"      active={activeSection} onClick={setActiveSection} onNavigate={() => setSidebarOpen(false)} />
          <SidebarBtn icon="📅" label="Appointments"  section="appointments"  active={activeSection} onClick={setActiveSection} onNavigate={() => setSidebarOpen(false)} badge={unpaidAppointments.length || null} />
          <SidebarBtn icon="💅" label="Services"      section="services"      active={activeSection} onClick={setActiveSection} onNavigate={() => setSidebarOpen(false)} />
          <SidebarBtn icon="👩‍💼" label="Staff"         section="staff"         active={activeSection} onClick={setActiveSection} onNavigate={() => setSidebarOpen(false)} />
          <SidebarBtn icon="🧑‍🤝‍🧑" label="Clients"      section="clients"       active={activeSection} onClick={setActiveSection} onNavigate={() => setSidebarOpen(false)} />
          <SidebarBtn icon="🗓️" label="Availability"  section="availability"  active={activeSection} onClick={setActiveSection} onNavigate={() => setSidebarOpen(false)} />
          <SidebarBtn icon="💸" label="Payments"      section="payments"      active={activeSection} onClick={setActiveSection} onNavigate={() => setSidebarOpen(false)} />
          <SidebarBtn icon="🔔" label="Activity Log"  section="notifications" active={activeSection} onClick={setActiveSection} onNavigate={() => setSidebarOpen(false)} badge={notifications.length || null} />
        </nav>
        <footer>
          <button className="btn ghost" onClick={() => { localStorage.removeItem('adminActiveSection'); navigate('/dashboard'); }}>← User View</button>
          <button className="btn danger" onClick={logout}>Logout</button>
        </footer>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div className="admin-header-left">
            <button className="admin-header-hamburger" onClick={() => setSidebarOpen(s => !s)} aria-label="Open menu">☰</button>
            <div><h1>{SECTION_TITLES[activeSection]}</h1><p>NXL Beauty Bar · Admin Panel</p></div>
          </div>
          <div className="admin-header-right">
            {unpaidAppointments.length > 0 && (
              <button className="unpaid-alert-btn" onClick={() => { setFilters(f => ({...f, status:'pending'})); setActiveSection('appointments'); }}>
                ⚠️ {unpaidAppointments.length} Unpaid
              </button>
            )}
            <div className="admin-user"><span>{user?.firstName} {user?.lastName}</span><small>{user?.email}</small></div>
          </div>
        </header>
        <div className="admin-content">{sectionRenderer()}</div>
      </main>

      {/* Modals */}
      {showAppointmentModal && (
        <AppointmentModal services={services} staff={staff} clients={clients} onClose={() => setShowAppointmentModal(false)}
          onSubmit={async fd => {
            setIsSubmitting(true);
            try { await apiRequest(API_ENDPOINTS.appointments, { method:'POST', body:JSON.stringify({ userId:fd.clientId, employeeId:fd.employeeId, serviceIds:fd.serviceIds, date:fd.date, time:fd.time, notes:fd.notes, paymentStatus:fd.paymentStatus, paymentMethod:fd.paymentMethod }) }); await loadAll(); setShowAppointmentModal(false); showToast('Appointment created.'); }
            catch (e) { alert(e.message); } finally { setIsSubmitting(false); }
          }} isSubmitting={isSubmitting}
        />
      )}
      {showEditAppointmentModal && (
        <EditAppointmentModal appointment={editingAppointment} services={services} staff={staff} clients={clients}
          onClose={() => { setShowEditAppointmentModal(false); setEditingAppointment(null); }}
          onSubmit={async fd => {
            setIsSubmitting(true);
            try { await apiRequest(`${API_ENDPOINTS.appointments}/${editingAppointment._id}`, { method:'PUT', body:JSON.stringify({ employeeId:fd.employeeId, serviceIds:fd.serviceIds, date:fd.date, time:fd.time, notes:fd.notes, status:fd.status, paymentStatus:fd.paymentStatus, paymentMethod:fd.paymentMethod }) }); await loadAll(); setShowEditAppointmentModal(false); setEditingAppointment(null); showToast('Appointment updated.'); }
            catch (e) { alert(e.message); } finally { setIsSubmitting(false); }
          }} isSubmitting={isSubmitting}
        />
      )}
      {showPaymentModal && (
        <PaymentModal appointment={selectedAppointment} onClose={() => { setShowPaymentModal(false); setSelectedAppointment(null); }}
          onSubmit={async fd => {
            setIsSubmitting(true);
            try { await apiRequest(API_ENDPOINTS.payments, { method:'POST', body:JSON.stringify(fd) }); await loadAll(); setShowPaymentModal(false); setSelectedAppointment(null); showToast('Payment recorded.'); }
            catch (e) { alert(e.message); } finally { setIsSubmitting(false); }
          }} isSubmitting={isSubmitting}
        />
      )}
      {showStaffModal && (
        <StaffModal staff={editingStaff} services={services} onClose={() => { setShowStaffModal(false); setEditingStaff(null); }}
          onSubmit={async fd => {
            setIsSubmitting(true);
            try {
              const method = editingStaff ? 'PUT' : 'POST';
              const endpoint = editingStaff ? `${API_ENDPOINTS.staff}/${editingStaff._id}` : API_ENDPOINTS.staff;
              await apiRequest(endpoint, { method, body:JSON.stringify(fd) });
              const staffData = await apiRequest(API_ENDPOINTS.staff);
              setStaff(staffData.data || []);
              setShowStaffModal(false); setEditingStaff(null);
              showToast(`Staff member ${editingStaff ? 'updated' : 'added'}.`);
            } catch (e) { alert(e.message); } finally { setIsSubmitting(false); }
          }} isSubmitting={isSubmitting}
        />
      )}

      {/* ─── Availability Modal (inline) ──────────────────────────────────── */}
      {showAvailabilityModal && (
        <AvailabilityModal
          staff={staff}
          onClose={() => setShowAvailabilityModal(false)}
          onAllSubmitted={async (successCount, skippedCount) => {
            const availData = await apiRequest(API_ENDPOINTS.availability);
            setAvailability(availData.data || []);
            setShowAvailabilityModal(false);
            showToast(`${successCount} slot${successCount !== 1 ? 's' : ''} blocked${skippedCount > 0 ? ` (${skippedCount} already blocked)` : ''}.`);
          }}
        />
      )}
    </div>
  );
}

// ─── Supporting components ────────────────────────────────────────────────────
const SECTION_TITLES = {
  overview:      'Dashboard Overview',
  appointments:  'Appointments',
  services:      'Services',
  staff:         'Staff Management',
  clients:       'Clients',
  availability:  'Availability',
  payments:      'Payments & Reports',
  notifications: 'Activity Log',
};

const COLOR_MAP = {
  rose:    'linear-gradient(135deg,#f87171,#ef4444)',
  sky:     'linear-gradient(135deg,#38bdf8,#0ea5e9)',
  emerald: 'linear-gradient(135deg,#34d399,#10b981)',
  violet:  'linear-gradient(135deg,#a78bfa,#7c3aed)',
  amber:   'linear-gradient(135deg,#fbbf24,#d97706)',
  slate:   'linear-gradient(135deg,#94a3b8,#64748b)',
  danger:  'linear-gradient(135deg,#f87171,#dc2626)',
};

function StatCard({ label, value, icon, color = 'slate', onClick, clickable }) {
  return (
    <div className={`stat-card${clickable ? ' stat-card-clickable' : ''}`} style={{ background:COLOR_MAP[color]||COLOR_MAP.slate, cursor:clickable?'pointer':'default' }} onClick={onClick}>
      <div className="icon">{icon}</div>
      <div><p>{label}</p><h3>{value}</h3></div>
    </div>
  );
}

function SidebarBtn({ icon, label, section, active, onClick, badge, onNavigate }) {
  return (
    <button className={`sidebar-btn ${active === section ? 'active' : ''}`} onClick={() => { onClick(section); if (onNavigate) onNavigate(); }}>
      <span className="sb-icon">{icon}</span>
      <span className="sb-label">{label}</span>
      {badge ? <span className="sb-badge">{badge}</span> : null}
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header><h3>{title}</h3><button onClick={onClose}>✕</button></header>
        {children}
      </div>
    </div>
  );
}

export default AdminDashboard;