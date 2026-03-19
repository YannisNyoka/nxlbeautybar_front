import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import AppointmentModal from './components/AppointmentModal';
import StaffModal from './components/StaffModal';
import AvailabilityModal from './components/AvailabilityModal';
import AppointmentCalendar from './components/AppointmentCalendar';
import RevenueChart from './components/RevenueChart';
import BookingsChart from './components/BookingsChart';
import { generateAppointmentsPDF, generateRevenueReportPDF } from './components/PDFExport';
import './AdminDashboard.css';
import EditAppointmentModal from './components/EditAppointmentModal';
import PaymentModal from './components/PaymentModal';

// ─── API helpers ────────────────────────────────────────────────────────────
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const API_ENDPOINTS = {
  appointments: `${API_BASE_URL}/appointments`,
  services:     `${API_BASE_URL}/services`,
  staff:        `${API_BASE_URL}/employees`,
  availability: `${API_BASE_URL}/availability`,
  clients:      `${API_BASE_URL}/users?limit=500`,
  payments:     `${API_BASE_URL}/payments`,
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

async function apiRequest(endpoint, options = {}) {
  const res = await fetch(endpoint, {
    headers: { ...authHeaders(), ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ─── Payment status badge ────────────────────────────────────────────────────
function PaymentBadge({ status }) {
  const cfg = {
    unpaid:       { bg: '#fff0f0', color: '#c53030', border: '#fed7d7', label: '⚠️ Unpaid',       fw: 700 },
    deposit_paid: { bg: '#f0fff4', color: '#276749', border: '#c6f6d5', label: '✅ Deposit Paid', fw: 600 },
    paid:         { bg: '#ebf8ff', color: '#2c5282', border: '#bee3f8', label: '✅ Paid',          fw: 600 },
    refunded:     { bg: '#fffaf0', color: '#c05621', border: '#feebc8', label: '↩️ Refunded',      fw: 600 },
  };
  const c = cfg[status] || cfg.unpaid;
  return (
    <span style={{
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      fontWeight: c.fw,
      padding: '0.25rem 0.65rem',
      borderRadius: '20px',
      fontSize: '0.72rem',
      display: 'inline-block',
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  );
}

// ─── How long ago an appointment was created ─────────────────────────────────
function appointmentAge(createdAt) {
  if (!createdAt) return '';
  const mins = Math.floor((Date.now() - new Date(createdAt)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Confirm dialog helper ───────────────────────────────────────────────────
function confirmHardDelete(appt) {
  const name = appt.userName || appt.clientName || 'Unknown client';
  return window.confirm(
    `⚠️  PERMANENTLY DELETE APPOINTMENT\n\n` +
    `Client : ${name}\n` +
    `Date   : ${appt.date}  ${appt.time}\n` +
    `Status : ${appt.paymentStatus || 'unpaid'}\n\n` +
    `This removes the appointment AND any associated payment records from the database.\n` +
    `This action CANNOT be undone.\n\n` +
    `Are you absolutely sure?`
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AdminDashboard
// ════════════════════════════════════════════════════════════════════════════
function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState(
    () => localStorage.getItem('adminActiveSection') || 'overview'
  );
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [deletingId, setDeletingId]     = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chartRange, setChartRange]     = useState('week');
  const [toast, setToast]               = useState(null);

  // ── filter state ──────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({
    dateRange: { start: null, end: null },
    staff: 'all', service: 'all', status: 'all', client: '',
  });

  // ── data ──────────────────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState([]);
  const [services,     setServices]     = useState([]);
  const [staff,        setStaff]        = useState([]);
  const [clients,      setClients]      = useState([]);
  const [availability, setAvailability] = useState([]);
  const [payments,     setPayments]     = useState([]);
  const [notifications, setNotifications] = useState([]);

  const [reportMeta, setReportMeta] = useState({
    totalRevenueToday: 0, totalRevenueWeek: 0, totalRevenueMonth: 0,
    bookingsToday: 0, upcomingBookings: 0, cancellations: 0,
    noShows: 0, unpaidCount: 0,
  });

  // ── modal state ───────────────────────────────────────────────────────────
  const [showServiceForm,         setShowServiceForm]         = useState(false);
  const [editingService,          setEditingService]          = useState(null);
  const [serviceForm,             setServiceForm]             = useState({ name:'', duration:'', price:'', description:'', category:'' });
  const [showAppointmentModal,    setShowAppointmentModal]    = useState(false);
  const [showStaffModal,          setShowStaffModal]          = useState(false);
  const [showAvailabilityModal,   setShowAvailabilityModal]   = useState(false);
  const [editingStaff,            setEditingStaff]            = useState(null);
  const [editingAppointment,      setEditingAppointment]      = useState(null);
  const [showEditAppointmentModal,setShowEditAppointmentModal]= useState(false);
  const [showPaymentModal,        setShowPaymentModal]        = useState(false);
  const [selectedAppointment,     setSelectedAppointment]     = useState(null);

  // ── toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── persist active section ────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('adminActiveSection', activeSection);
  }, [activeSection]);

  // ── initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    loadAll();
  }, [isAuthenticated, authLoading, user]);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError('');
      const [apptData, svcData, staffData, availData, clientData, payData] =
        await Promise.all([
          apiRequest(API_ENDPOINTS.appointments),
          apiRequest(API_ENDPOINTS.services),
          apiRequest(API_ENDPOINTS.staff),
          apiRequest(API_ENDPOINTS.availability),
          apiRequest(API_ENDPOINTS.clients),
          apiRequest(API_ENDPOINTS.payments),
        ]);

      const appts = apptData.data || [];
      const pays  = (payData.data || []).map(p => ({ ...p, amount: decimalToFloat(p.amount) }));

      setAppointments(appts);
      setServices((svcData.data || []).map(s => ({
        ...s,
        price: decimalToFloat(s.price),
        durationMinutes: s.durationMinutes || s.duration,
      })));
      setStaff(staffData.data || []);
      setAvailability(availData.data || []);
      setClients((clientData.data || []).filter(c => c.role !== 'admin'));
      setPayments(pays);
      computeReportMeta(appts, pays);
    } catch (err) {
      console.error('AdminDashboard load error:', err);
      setError(err.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const unpaidAppointments = useMemo(
    () => appointments.filter(a => a.paymentStatus === 'unpaid'),
    [appointments]
  );

  const filteredAppointments = useMemo(() => {
    return appointments.filter(appt => {
      const matchStaff   = filters.staff   === 'all' || String(appt.employeeId) === String(filters.staff);
      const matchService = filters.service === 'all' || (appt.serviceIds || []).some(id => String(id) === String(filters.service));
      const matchStatus  = filters.status  === 'all' || appt.status === filters.status;
      const matchClient  = !filters.client ||
        appt.userName?.toLowerCase().includes(filters.client.toLowerCase()) ||
        appt.clientName?.toLowerCase().includes(filters.client.toLowerCase()) ||
        appt.user?.email?.toLowerCase().includes(filters.client.toLowerCase());
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
    filteredAppointments.forEach(a => {
      const k = String(a.employeeId);
      if (k in w) w[k]++;
    });
    return w;
  }, [filteredAppointments, staff]);

  const clientStats = useMemo(() => {
    const stats = {};
    appointments.forEach(a => {
      const k = String(a.userId || '');
      if (!stats[k]) stats[k] = { total: 0, last: null };
      stats[k].total++;
      const d = new Date(a.date);
      if (!stats[k].last || d > stats[k].last) stats[k].last = d;
    });
    return stats;
  }, [appointments]);

  // ── report meta ───────────────────────────────────────────────────────────
  function computeReportMeta(apptList, payList) {
    const today = new Date();
    const sameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth()    === d2.getMonth()    &&
      d1.getDate()     === d2.getDate();
    const withinDays = (date, n) =>
      (today - new Date(date)) / (1000 * 60 * 60 * 24) < n;

    setReportMeta({
      bookingsToday:      apptList.filter(a => sameDay(new Date(a.date), today)).length,
      upcomingBookings:   apptList.filter(a => new Date(a.date) >= today).length,
      cancellations:      apptList.filter(a => a.status === 'cancelled').length,
      noShows:            apptList.filter(a => a.status === 'no-show').length,
      unpaidCount:        apptList.filter(a => a.paymentStatus === 'unpaid').length,
      totalRevenueToday:  payList.filter(p => sameDay(new Date(p.createdAt), today) && p.status === 'paid').reduce((s, p) => s + decimalToFloat(p.amount), 0),
      totalRevenueWeek:   payList.filter(p => withinDays(p.createdAt, 7)  && p.status === 'paid').reduce((s, p) => s + decimalToFloat(p.amount), 0),
      totalRevenueMonth:  payList.filter(p => withinDays(p.createdAt, 30) && p.status === 'paid').reduce((s, p) => s + decimalToFloat(p.amount), 0),
    });
  }

  // ─── HARD DELETE ──────────────────────────────────────────────────────────
  // Only allowed for appointments where paymentStatus === 'unpaid'
  async function hardDeleteAppointment(appt) {
    if (appt.paymentStatus !== 'unpaid') {
      alert('Only unpaid appointments can be permanently deleted.');
      return;
    }
    if (!confirmHardDelete(appt)) return;

    setDeletingId(appt._id);
    try {
      // 1. Delete the appointment
      await apiRequest(`${API_ENDPOINTS.appointments}/${appt._id}`, { method: 'DELETE' });

      // 2. Delete any orphaned pending payment records for this appointment
      const linked = payments.filter(p => String(p.appointmentId) === String(appt._id) && p.status === 'pending');
      await Promise.allSettled(
        linked.map(p => apiRequest(`${API_ENDPOINTS.payments}/${p._id}`, { method: 'DELETE' }))
      );

      // 3. Refresh
      const [apptData, payData] = await Promise.all([
        apiRequest(API_ENDPOINTS.appointments),
        apiRequest(API_ENDPOINTS.payments),
      ]);
      const appts = apptData.data || [];
      const pays  = (payData.data || []).map(p => ({ ...p, amount: decimalToFloat(p.amount) }));
      setAppointments(appts);
      setPayments(pays);
      computeReportMeta(appts, pays);

      showToast(`Appointment for ${appt.userName || 'client'} permanently deleted.`);
      addNotification(`Deleted unpaid appointment for ${appt.userName || 'client'} on ${appt.date}`);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Mutations ────────────────────────────────────────────────────────────
  async function mutateAppointment(id, payload) {
    await apiRequest(`${API_ENDPOINTS.appointments}/${id}`, {
      method: 'PUT', body: JSON.stringify(payload),
    });
    const apptData = await apiRequest(API_ENDPOINTS.appointments);
    const appts = apptData.data || [];
    setAppointments(appts);
    computeReportMeta(appts, payments);
  }

  async function mutateService(id, payload, method) {
    const opts = { method };
    if (method !== 'DELETE') {
      if (payload.price !== undefined)         payload.price = Number(payload.price);
      if (payload.durationMinutes !== undefined) payload.durationMinutes = Number(payload.durationMinutes);
      opts.body = JSON.stringify(payload);
    }
    const endpoint = id && method !== 'POST'
      ? `${API_ENDPOINTS.services}/${id}`
      : API_ENDPOINTS.services;
    const result = await apiRequest(endpoint, opts);
    const svcData = await apiRequest(API_ENDPOINTS.services);
    setServices((svcData.data || []).map(s => ({
      ...s, price: decimalToFloat(s.price), durationMinutes: s.durationMinutes || s.duration,
    })));
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
    await apiRequest(`${API_BASE_URL}/users/${clientId}`, {
      method: 'PUT', body: JSON.stringify({ isActive: !block }),
    });
    const clientData = await apiRequest(API_ENDPOINTS.clients);
    setClients((clientData.data || []).filter(c => c.role !== 'admin'));
  }

  function addNotification(msg) {
    setNotifications(prev => [{ id: Date.now(), message: msg, createdAt: new Date() }, ...prev]);
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
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'nxl-report.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ─── Unpaid Review Panel ──────────────────────────────────────────────────
  const renderUnpaidPanel = () => {
    if (!unpaidAppointments.length) return null;
    return (
      <section className="panel unpaid-panel">
        <header>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <span className="unpaid-badge-icon">⚠️</span>
            <div>
              <h3 style={{ color:'#c53030', marginBottom:'0.15rem' }}>
                Unpaid Appointments — Admin Review Required
              </h3>
              <p style={{ color:'#718096', fontSize:'0.78rem', fontWeight:400 }}>
                These bookings were started but payment was never completed. Review and permanently delete to free the time slot.
              </p>
            </div>
          </div>
          <span className="unpaid-count-badge">{unpaidAppointments.length}</span>
        </header>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Date & Time</th>
                <th>Services</th>
                <th>Stylist</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {unpaidAppointments.map(appt => (
                <tr key={appt._id} className="unpaid-row">
                  <td>
                    <div style={{ fontWeight:600 }}>{appt.userName || appt.clientName || '—'}</div>
                    {appt.user?.email && <div className="sub-text">{appt.user.email}</div>}
                  </td>
                  <td>
                    <div style={{ fontWeight:600 }}>{appt.date}</div>
                    <div className="sub-text">{appt.time}</div>
                  </td>
                  <td>
                    {(appt.serviceIds || [])
                      .map(id => services.find(s => String(s._id) === String(id))?.name)
                      .filter(Boolean).join(', ') || '—'}
                  </td>
                  <td>
                    {staff.find(s => String(s._id) === String(appt.employeeId))?.name
                      || appt.employee?.name || '—'}
                  </td>
                  <td>
                    <span className="age-label">{appointmentAge(appt.createdAt)}</span>
                  </td>
                  <td className="row-actions">
                    {/* Cancel — keeps record, frees slot */}
                    <button
                      className="action-btn cancel-btn"
                      title="Cancel appointment (keeps record)"
                      onClick={async () => {
                        await mutateAppointment(appt._id, { status: 'cancelled' });
                        showToast('Appointment cancelled.');
                        addNotification(`Cancelled unpaid appointment for ${appt.userName || 'client'}`);
                      }}
                    >
                      Cancel
                    </button>
                    {/* Hard delete — permanently removes from DB */}
                    <button
                      className="action-btn delete-btn"
                      title="Permanently delete from database"
                      disabled={deletingId === appt._id}
                      onClick={() => hardDeleteAppointment(appt)}
                    >
                      {deletingId === appt._id ? 'Deleting…' : '🗑 Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  // ─── Section renderers ────────────────────────────────────────────────────
  const renderOverview = () => (
    <>
      <div className="grid grid-responsive">
        <StatCard label="Bookings Today"    value={reportMeta.bookingsToday}                          icon="📅" color="rose" />
        <StatCard label="Upcoming"          value={reportMeta.upcomingBookings}                       icon="⏰" color="sky" />
        <StatCard label="Revenue Today"     value={`R${reportMeta.totalRevenueToday.toFixed(2)}`}    icon="💰" color="emerald" />
        <StatCard label="Revenue (Week)"    value={`R${reportMeta.totalRevenueWeek.toFixed(2)}`}     icon="📈" color="violet" />
        <StatCard label="Revenue (Month)"   value={`R${reportMeta.totalRevenueMonth.toFixed(2)}`}    icon="📊" color="amber" />
        <StatCard label="Cancellations"     value={reportMeta.cancellations}                          icon="✕"  color="slate" />
        <StatCard label="No-Shows"          value={reportMeta.noShows}                                icon="🚫" color="slate" />
        <StatCard
          label="Unpaid Bookings"
          value={reportMeta.unpaidCount}
          icon="💳"
          color={reportMeta.unpaidCount > 0 ? 'danger' : 'slate'}
          onClick={reportMeta.unpaidCount > 0 ? () => setActiveSection('appointments') : undefined}
          clickable={reportMeta.unpaidCount > 0}
        />
      </div>

      {renderUnpaidPanel()}

      <section className="panel">
        <header>
          <h3>Revenue Trend</h3>
          <div className="button-row">
            {['week','month','year'].map(r => (
              <button key={r} className={`btn ${chartRange === r ? 'primary' : 'ghost'}`} onClick={() => setChartRange(r)}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </header>
        <RevenueChart payments={payments} range={chartRange} />
      </section>

      <section className="panel">
        <header><h3>Bookings Trend</h3></header>
        <BookingsChart appointments={appointments} range={chartRange} />
      </section>

      <section className="panel quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button className="btn primary" onClick={() => setShowAppointmentModal(true)}>➕ Add Booking</button>
          <button className="btn primary" onClick={() => setActiveSection('services')}>💅 Add Service</button>
          <button className="btn primary" onClick={() => setShowAvailabilityModal(true)}>🚫 Block Time</button>
          {reportMeta.unpaidCount > 0 && (
            <button
              className="btn"
              style={{ background:'#c53030', color:'white' }}
              onClick={() => { setFilters(f => ({ ...f, status:'pending' })); setActiveSection('appointments'); }}
            >
              ⚠️ Review {reportMeta.unpaidCount} Unpaid
            </button>
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
          <select value={filters.staff} onChange={e => setFilters({ ...filters, staff: e.target.value })}>
            <option value="all">All Staff</option>
            {staff.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <select value={filters.service} onChange={e => setFilters({ ...filters, service: e.target.value })}>
            <option value="all">All Services</option>
            {services.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="all">All Statuses</option>
            <option value="pending">⚠️ Pending Payment</option>
            <option value="booked">Booked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no-show">No Show</option>
          </select>
          <input
            placeholder="Search client…"
            value={filters.client}
            onChange={e => setFilters({ ...filters, client: e.target.value })}
          />
        </div>
      </section>

      <section className="panel">
        <header>
          <h3>Appointments <span className="count-chip">{filteredAppointments.length}</span></h3>
          <div className="button-row">
            <button className="btn ghost" onClick={() => {
              try { generateAppointmentsPDF(filteredAppointments, staff, services, payments); }
              catch (e) { alert('PDF export failed: ' + e.message); }
            }}>📄 PDF</button>
            <button className="btn ghost" onClick={exportCSV}>📊 CSV</button>
            <button className="btn primary" onClick={() => setShowAppointmentModal(true)}>➕ New</button>
          </div>
        </header>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Time</th><th>Client</th><th>Services</th>
                <th>Staff</th><th>Status</th><th>Payment</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map(appt => (
                <tr
                  key={appt._id}
                  className={appt.paymentStatus === 'unpaid' ? 'unpaid-row' : ''}
                >
                  <td>{appt.date}</td>
                  <td>{appt.time}</td>
                  <td>
                    <div style={{ fontWeight:600 }}>{appt.userName || appt.clientName || '—'}</div>
                    {appt.user?.email && <div className="sub-text">{appt.user.email}</div>}
                  </td>
                  <td>
                    {(appt.serviceIds || [])
                      .map(id => services.find(s => String(s._id) === String(id))?.name)
                      .filter(Boolean).join(', ') || '—'}
                  </td>
                  <td>
                    {staff.find(s => String(s._id) === String(appt.employeeId))?.name
                      || appt.employee?.name || '—'}
                  </td>
                  <td><span className={`status ${appt.status}`}>{appt.status}</span></td>
                  <td><PaymentBadge status={appt.paymentStatus || 'unpaid'} /></td>
                  <td className="row-actions">
                    <button
                      className="action-btn"
                      title="Edit"
                      onClick={() => { setEditingAppointment(appt); setShowEditAppointmentModal(true); }}
                    >✏️</button>
                    <button
                      className="action-btn"
                      title="Mark Complete"
                      onClick={() => mutateAppointment(appt._id, { status:'completed' }).then(() => showToast('Marked complete.'))}
                    >✓</button>
                    <button
                      className="action-btn"
                      title="Cancel"
                      onClick={() => mutateAppointment(appt._id, { status:'cancelled' }).then(() => showToast('Appointment cancelled.'))}
                    >✕</button>

                    {/* Record payment — show for unpaid and deposit_paid */}
                    {(appt.paymentStatus === 'unpaid' || appt.paymentStatus === 'deposit_paid') && (
                      <button
                        className="action-btn"
                        title="Record Payment"
                        onClick={() => { setSelectedAppointment(appt); setShowPaymentModal(true); }}
                      >💳</button>
                    )}

                    {/* Hard delete — ONLY for unpaid appointments */}
                    {appt.paymentStatus === 'unpaid' && (
                      <button
                        className="action-btn delete-btn"
                        title="Permanently delete (unpaid only)"
                        disabled={deletingId === appt._id}
                        onClick={() => hardDeleteAppointment(appt)}
                      >
                        {deletingId === appt._id ? '…' : '🗑'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredAppointments.length && (
                <tr><td colSpan="8" className="empty-row">No appointments match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel calendar-panel">
        <header><h3>Calendar View</h3></header>
        {filteredAppointments.length > 0
          ? <AppointmentCalendar
              appointments={filteredAppointments}
              staff={staff}
              services={services}
              onSelectSlot={() => setShowAppointmentModal(true)}
              onSelectEvent={ev => console.log('Selected:', ev.resource)}
            />
          : <div className="calendar-placeholder">No appointments to display.</div>
        }
      </section>
    </>
  );

  const renderServices = () => (
    <section className="panel">
      <header>
        <h3>Services</h3>
        <button className="btn primary" onClick={() => {
          setEditingService(null);
          setServiceForm({ name:'', duration:'', price:'', description:'', category:'' });
          setShowServiceForm(true);
        }}>+ Add Service</button>
      </header>
      <div className="table-responsive">
        <table>
          <thead>
            <tr><th>Name</th><th>Category</th><th>Duration</th><th>Price</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {services.map(svc => (
              <tr key={svc._id}>
                <td style={{ fontWeight:600 }}>{svc.name}</td>
                <td>{svc.category || 'Uncategorized'}</td>
                <td>{svc.durationMinutes} min</td>
                <td>R{(decimalToFloat(svc.price)).toFixed(2)}</td>
                <td>
                  <span className={`status ${svc.isActive ? 'booked' : 'cancelled'}`}>
                    {svc.isActive ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="row-actions">
                  <button className="action-btn" onClick={() => {
                    setEditingService(svc);
                    setServiceForm({ name:svc.name, duration:svc.durationMinutes, price:decimalToFloat(svc.price), category:svc.category||'', description:svc.description||'' });
                    setShowServiceForm(true);
                  }}>Edit</button>
                  <button className="action-btn" onClick={async () => {
                    try {
                      await mutateService(svc._id, { isActive: !svc.isActive }, 'PUT');
                      showToast(`Service ${svc.isActive ? 'disabled' : 'enabled'}.`);
                    } catch (e) { alert(e.message); }
                  }}>{svc.isActive ? 'Disable' : 'Enable'}</button>
                  <button className="action-btn delete-btn" onClick={async () => {
                    if (!window.confirm(`Delete "${svc.name}"? If it has future bookings it will be disabled instead.`)) return;
                    try { await mutateService(svc._id, {}, 'DELETE'); showToast(`"${svc.name}" deleted.`); }
                    catch (e) { alert(e.message); }
                  }}>Delete</button>
                </td>
              </tr>
            ))}
            {!services.length && <tr><td colSpan="6" className="empty-row">No services defined yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {showServiceForm && (
        <Modal
          title={editingService ? 'Edit Service' : 'Add Service'}
          onClose={() => { setShowServiceForm(false); setEditingService(null); }}
        >
          <form
            onSubmit={async e => {
              e.preventDefault();
              e.stopPropagation();
              setIsSubmitting(true);
              try {
                const dur   = Number(serviceForm.duration);
                const price = Number(serviceForm.price);
                if (dur % 15 !== 0) { alert('Duration must be a multiple of 15 minutes.'); return; }
                if (isNaN(price) || price < 0) { alert('Enter a valid price.'); return; }
                await mutateService(
                  editingService?._id,
                  { name:serviceForm.name, durationMinutes:dur, price, description:serviceForm.description, category:serviceForm.category, isActive:true },
                  editingService ? 'PUT' : 'POST'
                );
                setShowServiceForm(false);
                setEditingService(null);
                showToast(`Service ${editingService ? 'updated' : 'created'}.`);
              } catch (e) { alert(e.message); }
              finally { setIsSubmitting(false); }
            }}
            className="form-grid"
          >
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
      <header>
        <h3>Staff Management</h3>
        <button className="btn primary" onClick={() => { setEditingStaff(null); setShowStaffModal(true); }}>➕ Add Technician</button>
      </header>
      <div className="table-responsive">
        <table>
          <thead>
            <tr><th>Name</th><th>Services</th><th>Active</th><th>Workload</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {staff.map(emp => (
              <tr key={emp._id}>
                <td style={{ fontWeight:600 }}>{emp.name}</td>
                <td>
                  {(emp.servicesOffered || [])
                    .map(id => services.find(s => String(s._id) === String(id))?.name)
                    .filter(Boolean).join(', ') || '—'}
                </td>
                <td>
                  <span className={`status ${emp.isActive ? 'booked' : 'cancelled'}`}>
                    {emp.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{staffWorkload[String(emp._id)] || 0} appts</td>
                <td className="row-actions">
                  <button className="action-btn" onClick={() => { setEditingStaff(emp); setShowStaffModal(true); }}>Edit</button>
                  <button className="action-btn" onClick={async () => {
                    if (!window.confirm(`${emp.isActive ? 'Deactivate' : 'Activate'} ${emp.name}?`)) return;
                    try { await mutateStaff(emp._id, { isActive: !emp.isActive }, 'PUT'); showToast(`${emp.name} ${emp.isActive ? 'deactivated' : 'activated'}.`); }
                    catch (e) { alert(e.message); }
                  }}>{emp.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button className="action-btn delete-btn" onClick={async () => {
                    if (!window.confirm(`Remove ${emp.name}? This cannot be undone.`)) return;
                    try { await mutateStaff(emp._id, {}, 'DELETE'); showToast(`${emp.name} removed.`); }
                    catch (e) { alert(e.message); }
                  }}>Remove</button>
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
          <thead>
            <tr><th>Name</th><th>Email</th><th>Bookings</th><th>Last Booking</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {clients
              .filter(c => c.email?.toLowerCase().includes(filters.client.toLowerCase()) || `${c.firstName} ${c.lastName}`.toLowerCase().includes(filters.client.toLowerCase()))
              .map(client => {
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
                      <button className={`action-btn ${active ? 'delete-btn' : ''}`} onClick={() => blockClient(client._id, active).then(() => showToast(`Client ${active ? 'blocked' : 'unblocked'}.`))}>
                        {active ? 'Block' : 'Unblock'}
                      </button>
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
      <header>
        <h3>Availability & Blocked Slots</h3>
        <button className="btn primary" onClick={() => setShowAvailabilityModal(true)}>➕ Block Time</button>
      </header>
      <div className="table-responsive">
        <table>
          <thead>
            <tr><th>Date</th><th>Time</th><th>Employee</th><th>Reason</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {availability.map(slot => (
              <tr key={slot._id}>
                <td>{slot.date}</td>
                <td>{slot.time}</td>
                <td>{slot.employeeId === 'ALL' ? 'Salon-wide' : staff.find(s => String(s._id) === String(slot.employeeId))?.name || '—'}</td>
                <td>{slot.reason}</td>
                <td className="row-actions">
                  <button className="action-btn delete-btn" onClick={() => mutateAvailability(slot._id, {}, 'DELETE').then(() => showToast('Slot unblocked.'))}>Remove</button>
                </td>
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
          <button className="btn ghost" onClick={() => {
            try { generateRevenueReportPDF(payments, `Last ${chartRange}`); }
            catch (e) { alert(e.message); }
          }}>📄 PDF</button>
        </div>
      </header>
      <div className="table-responsive">
        <table>
          <thead>
            <tr><th>Date</th><th>Amount</th><th>Type</th><th>Method</th><th>Status</th><th>Actions</th></tr>
          </thead>
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
                      try {
                        await apiRequest(`${API_ENDPOINTS.payments}/${pay._id}`, { method:'PUT', body: JSON.stringify({ status:'refunded' }) });
                        await loadAll();
                        showToast('Payment refunded.');
                      } catch (e) { alert(e.message); }
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
      <header>
        <h3>Activity Log</h3>
        <button className="btn ghost" onClick={() => setNotifications([])}>Clear All</button>
      </header>
      <ul className="notification-feed">
        {notifications.map(n => (
          <li key={n.id}>
            <span>{n.message}</span>
            <small>{new Date(n.createdAt).toLocaleString()}</small>
          </li>
        ))}
        {!notifications.length && <li className="empty-row">No activity yet.</li>}
      </ul>
    </section>
  );

  // ─── Loading / error ──────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="admin-loading">
        <div className="spinner" />
        <span>Loading admin dashboard…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="admin-error">
        <h2>Admin Dashboard</h2>
        <p>{error}</p>
        <button className="btn primary" onClick={loadAll}>Retry</button>
      </div>
    );
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

  // ─── Main shell ───────────────────────────────────────────────────────────
  return (
    <div className="admin-shell">

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`} key={toast.id}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div>
            <h2>NXL Beauty Bar</h2>
            <p>Admin Panel</p>
          </div>
        </div>
        <nav>
          <SidebarBtn icon="🏠" label="Overview"      section="overview"      active={activeSection} onClick={setActiveSection} />
          <SidebarBtn icon="📅" label="Appointments"  section="appointments"  active={activeSection} onClick={setActiveSection} badge={unpaidAppointments.length || null} />
          <SidebarBtn icon="💅" label="Services"      section="services"      active={activeSection} onClick={setActiveSection} />
          <SidebarBtn icon="👩‍💼" label="Staff"         section="staff"         active={activeSection} onClick={setActiveSection} />
          <SidebarBtn icon="🧑‍🤝‍🧑" label="Clients"      section="clients"       active={activeSection} onClick={setActiveSection} />
          <SidebarBtn icon="🗓️" label="Availability"  section="availability"  active={activeSection} onClick={setActiveSection} />
          <SidebarBtn icon="💸" label="Payments"      section="payments"      active={activeSection} onClick={setActiveSection} />
          <SidebarBtn icon="🔔" label="Activity Log"  section="notifications" active={activeSection} onClick={setActiveSection} badge={notifications.length || null} />
        </nav>
        <footer>
          <button className="btn ghost" onClick={() => { localStorage.removeItem('adminActiveSection'); navigate('/dashboard'); }}>
            ← User View
          </button>
          <button className="btn danger" onClick={logout}>Logout</button>
        </footer>
      </aside>

      {/* Main */}
      <main className="admin-main">
        <header className="admin-header">
          <div>
            <h1>{SECTION_TITLES[activeSection]}</h1>
            <p>NXL Beauty Bar · Admin Panel</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
            {unpaidAppointments.length > 0 && (
              <button
                className="unpaid-alert-btn"
                onClick={() => { setFilters(f => ({...f, status:'pending'})); setActiveSection('appointments'); }}
              >
                ⚠️ {unpaidAppointments.length} Unpaid
              </button>
            )}
            <div className="admin-user">
              <span>{user?.firstName} {user?.lastName}</span>
              <small>{user?.email}</small>
            </div>
          </div>
        </header>
        <div className="admin-content">{sectionRenderer()}</div>
      </main>

      {/* Modals */}
      {showAppointmentModal && (
        <AppointmentModal
          services={services} staff={staff} clients={clients}
          onClose={() => setShowAppointmentModal(false)}
          onSubmit={async fd => {
            setIsSubmitting(true);
            try {
              await apiRequest(API_ENDPOINTS.appointments, { method:'POST', body: JSON.stringify({ userId:fd.clientId, employeeId:fd.employeeId, serviceIds:fd.serviceIds, date:fd.date, time:fd.time, notes:fd.notes }) });
              await loadAll();
              setShowAppointmentModal(false);
              showToast('Appointment created.');
            } catch (e) { alert(e.message); }
            finally { setIsSubmitting(false); }
          }}
          isSubmitting={isSubmitting}
        />
      )}
      {showEditAppointmentModal && (
        <EditAppointmentModal
          appointment={editingAppointment} services={services} staff={staff} clients={clients}
          onClose={() => { setShowEditAppointmentModal(false); setEditingAppointment(null); }}
          onSubmit={async fd => {
            setIsSubmitting(true);
            try {
              await apiRequest(`${API_ENDPOINTS.appointments}/${editingAppointment._id}`, { method:'PUT', body: JSON.stringify({ employeeId:fd.employeeId, serviceIds:fd.serviceIds, date:fd.date, time:fd.time, notes:fd.notes, status:fd.status }) });
              await loadAll();
              setShowEditAppointmentModal(false);
              setEditingAppointment(null);
              showToast('Appointment updated.');
            } catch (e) { alert(e.message); }
            finally { setIsSubmitting(false); }
          }}
          isSubmitting={isSubmitting}
        />
      )}
      {showPaymentModal && (
        <PaymentModal
          appointment={selectedAppointment}
          onClose={() => { setShowPaymentModal(false); setSelectedAppointment(null); }}
          onSubmit={async fd => {
            setIsSubmitting(true);
            try {
              await apiRequest(API_ENDPOINTS.payments, { method:'POST', body: JSON.stringify(fd) });
              await loadAll();
              setShowPaymentModal(false);
              setSelectedAppointment(null);
              showToast('Payment recorded.');
            } catch (e) { alert(e.message); }
            finally { setIsSubmitting(false); }
          }}
          isSubmitting={isSubmitting}
        />
      )}
      {showStaffModal && (
        <StaffModal
          staff={editingStaff} services={services}
          onClose={() => { setShowStaffModal(false); setEditingStaff(null); }}
          onSubmit={async fd => {
            setIsSubmitting(true);
            try {
              const method   = editingStaff ? 'PUT' : 'POST';
              const endpoint = editingStaff ? `${API_ENDPOINTS.staff}/${editingStaff._id}` : API_ENDPOINTS.staff;
              await apiRequest(endpoint, { method, body: JSON.stringify(fd) });
              const staffData = await apiRequest(API_ENDPOINTS.staff);
              setStaff(staffData.data || []);
              setShowStaffModal(false);
              setEditingStaff(null);
              showToast(`Staff member ${editingStaff ? 'updated' : 'added'}.`);
            } catch (e) { alert(e.message); }
            finally { setIsSubmitting(false); }
          }}
          isSubmitting={isSubmitting}
        />
      )}
      {showAvailabilityModal && (
        <AvailabilityModal
          staff={staff}
          onClose={() => setShowAvailabilityModal(false)}
          onSubmit={async fd => {
            setIsSubmitting(true);
            try {
              await apiRequest(API_ENDPOINTS.availability, { method:'POST', body: JSON.stringify(fd) });
              const availData = await apiRequest(API_ENDPOINTS.availability);
              setAvailability(availData.data || []);
              setShowAvailabilityModal(false);
              showToast('Time slot blocked.');
            } catch (e) { alert(e.message); }
            finally { setIsSubmitting(false); }
          }}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}

// ─── Supporting components ───────────────────────────────────────────────────
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
    <div
      className={`stat-card${clickable ? ' stat-card-clickable' : ''}`}
      style={{ background: COLOR_MAP[color] || COLOR_MAP.slate, cursor: clickable ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <div className="icon">{icon}</div>
      <div>
        <p>{label}</p>
        <h3>{value}</h3>
      </div>
    </div>
  );
}

function SidebarBtn({ icon, label, section, active, onClick, badge }) {
  return (
    <button
      className={`sidebar-btn ${active === section ? 'active' : ''}`}
      onClick={() => onClick(section)}
    >
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
        <header>
          <h3>{title}</h3>
          <button onClick={onClose}>✕</button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default AdminDashboard;