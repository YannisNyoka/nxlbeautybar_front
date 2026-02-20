import { useEffect, useMemo, useState } from 'react';
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

// --- API helpers ------------------------------------------------------------
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const API_ENDPOINTS = {
  appointments: `${API_BASE_URL}/appointments`,
  services: `${API_BASE_URL}/services`,
  staff: `${API_BASE_URL}/employees`,
  availability: `${API_BASE_URL}/availability`,
  clients: `${API_BASE_URL}/users`,
  payments: `${API_BASE_URL}/payments`
};

const decimalToFloat = value => {
  if (value == null) return 0;
  if (typeof value === 'object' && '$numberDecimal' in value) return parseFloat(value.$numberDecimal);
  return Number(value);
};

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token
    ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    : {};
};

async function apiRequest(endpoint, options = {}) {
  const res = await fetch(endpoint, { headers: { ...authHeaders(), ...(options.headers || {}) }, ...options });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  return res.json();
}

// --- Dashboard component ----------------------------------------------------
function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();

  // --- UI state ------------------------------------------------------------
  const [activeSection, setActiveSection] = useState(() => {
    // Restore active section from localStorage on initial load
    return localStorage.getItem('adminActiveSection') || 'overview';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    dateRange: { start: null, end: null },
    staff: 'all',
    service: 'all',
    status: 'all',
    client: ''
  });

  // --- Data stores ---------------------------------------------------------
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [clients, setClients] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [payments, setPayments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [reportMeta, setReportMeta] = useState({
    totalRevenueToday: 0,
    totalRevenueWeek: 0,
    totalRevenueMonth: 0,
    bookingsToday: 0,
    upcomingBookings: 0,
    cancellations: 0,
    noShows: 0,
    unpaidCount: 0
  });
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    name: '',
    duration: '',
    price: '',
    description: '',
    category: ''
  });
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chartRange, setChartRange] = useState('week');
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [showEditAppointmentModal, setShowEditAppointmentModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  // --- Access control ------------------------------------------------------ 
  // REMOVED: This conflicts with App.jsx ProtectedRoute
  // The route is already protected by <ProtectedRoute adminOnly>
  // No need to check again here - it creates a redirect loop

  // --- Initial load --------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    
    console.log('AdminDashboard - Loading data for user:', user);
    
    const loadAll = async () => {
      try {
        setLoading(true);
        const [apptData, serviceData, staffData, availabilityData, clientData, paymentData] = await Promise.all([
          apiRequest(API_ENDPOINTS.appointments),
          apiRequest(API_ENDPOINTS.services),
          apiRequest(API_ENDPOINTS.staff),
          apiRequest(API_ENDPOINTS.availability),
          apiRequest(API_ENDPOINTS.clients),
          apiRequest(API_ENDPOINTS.payments)
        ]);
        setAppointments(apptData.data || []);
        setServices(
          (serviceData.data || []).map(service => ({
            ...service,
            price: decimalToFloat(service.price),
            durationMinutes: service.durationMinutes || service.duration
          }))
        );
        setStaff(staffData.data || []);
        setAvailability(availabilityData.data || []);
        // Filter admin-only from clients list if backend enforces; front-end still guards usage.
        setClients((clientData.data || []).filter(c => c.role !== 'admin'));
        setPayments((paymentData.data || []).map(pay => ({
          ...pay,
          amount: decimalToFloat(pay.amount)
        })));
        computeReportMeta(apptData.data || [], paymentData.data || []);
      } catch (err) {
        console.error('AdminDashboard - Data load error:', err);
        setError(err.message || 'Failed to load admin data');
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [isAuthenticated, authLoading, user]);

  // Persist active section to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('adminActiveSection', activeSection);
  }, [activeSection]);

  // --- Derived stats -------------------------------------------------------
  const filteredAppointments = useMemo(() => {
    return appointments.filter(appt => {
      const matchesStaff = filters.staff === 'all' || appt.employeeId === filters.staff;
      const matchesService =
        filters.service === 'all' || (appt.serviceIds || []).includes(filters.service);
      const matchesStatus = filters.status === 'all' || appt.status === filters.status;
      const matchesClient =
        !filters.client ||
        appt.clientName?.toLowerCase().includes(filters.client.toLowerCase()) ||
        appt.clientEmail?.toLowerCase().includes(filters.client.toLowerCase());
      let matchesDate = true;
      if (filters.dateRange.start && filters.dateRange.end) {
        const apptDate = new Date(appt.date);
        matchesDate =
          apptDate >= new Date(filters.dateRange.start) &&
          apptDate <= new Date(filters.dateRange.end);
      }
      return matchesStaff && matchesService && matchesStatus && matchesClient && matchesDate;
    });
  }, [appointments, filters]);

  const staffWorkload = useMemo(() => {
    const workload = {};
    staff.forEach(s => (workload[s._id] = 0));
    filteredAppointments.forEach(appt => {
      if (workload[appt.employeeId] !== undefined) workload[appt.employeeId] += 1;
    });
    return workload;
  }, [filteredAppointments, staff]);

  const clientStats = useMemo(() => {
    const stats = {};
    appointments.forEach(appt => {
      const key = String(appt.userId || '');
      if (!stats[key]) stats[key] = { total: 0, last: null };
      stats[key].total += 1;
      const apptDate = new Date(appt.date);
      if (!stats[key].last || apptDate > stats[key].last) stats[key].last = apptDate;
    });
    return stats;
  }, [appointments]);

  // --- Helpers -------------------------------------------------------------
  function computeReportMeta(apptList, paymentList) {
    const today = new Date();
    const sameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
    const withinDays = (date, days) => (new Date(date) - today) / (1000 * 60 * 60 * 24) < days;

    const bookingsToday = apptList.filter(appt => sameDay(new Date(appt.date), today)).length;
    const upcomingBookings = apptList.filter(appt => new Date(appt.date) >= today).length;
    const cancellations = apptList.filter(appt => appt.status === 'cancelled').length;
    const noShows = apptList.filter(appt => appt.status === 'no-show').length;

    const revenueToday = paymentList
      .filter(pay => sameDay(new Date(pay.createdAt), today))
      .reduce((sum, pay) => sum + decimalToFloat(pay.amount), 0);
    const revenueWeek = paymentList
      .filter(pay => withinDays(pay.createdAt, 7))
      .reduce((sum, pay) => sum + decimalToFloat(pay.amount), 0);
    const revenueMonth = paymentList
      .filter(pay => withinDays(pay.createdAt, 30))
      .reduce((sum, pay) => sum + decimalToFloat(pay.amount), 0);
    const unpaidCount = apptList.filter(appt => appt.paymentStatus !== 'paid').length;

    setReportMeta({
      bookingsToday,
      upcomingBookings,
      cancellations,
      noShows,
      totalRevenueToday: revenueToday,
      totalRevenueWeek: revenueWeek,
      totalRevenueMonth: revenueMonth,
      unpaidCount
    });
  }

  async function mutateAppointment(id, payload) {
    await apiRequest(`${API_ENDPOINTS.appointments}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    // re-fetch lightweight
    const apptData = await apiRequest(API_ENDPOINTS.appointments);
    setAppointments(apptData.data || []);
  }

  async function mutateService(id, payload, method) {
    try {
      const options = { method };
      if (method !== 'DELETE') {
        // Ensure price is a number, not Decimal128 object
        if (payload.price !== undefined) {
          payload.price = Number(payload.price);
        }
        if (payload.durationMinutes !== undefined) {
          payload.durationMinutes = Number(payload.durationMinutes);
        }
        options.body = JSON.stringify(payload);
      }
      
      // For updates, make sure we have a valid ID
      const endpoint = (id && method !== 'POST') ? `${API_ENDPOINTS.services}/${id}` : API_ENDPOINTS.services;
      console.log('Updating service:', { endpoint, method, payload, id });
      
      const result = await apiRequest(endpoint, options);
      console.log('Service update result:', result);
      
      // Re-fetch services to get updated list without page refresh
      const serviceData = await apiRequest(API_ENDPOINTS.services);
      setServices((serviceData.data || []).map(service => ({
        ...service,
        price: decimalToFloat(service.price),
        durationMinutes: service.durationMinutes || service.duration
      })));
      
      return result;
    } catch (err) {
      console.error('Service mutation failed:', err);
      throw err;
    }
  }

  async function mutateStaff(id, payload, method = 'PUT') {
    try {
      const options = { method };
      if (method !== 'DELETE') {
        options.body = JSON.stringify(payload);
      }
      await apiRequest(id ? `${API_ENDPOINTS.staff}/${id}` : API_ENDPOINTS.staff, options);
      const staffData = await apiRequest(API_ENDPOINTS.staff);
      setStaff(staffData.data || []);
    } catch (err) {
      console.error('Staff mutation failed:', err);
      throw err;
    }
  }

  async function mutateAvailability(id, payload, method = 'PUT') {
    try {
      const options = { method };
      if (method !== 'DELETE') {
        options.body = JSON.stringify(payload);
      }
      await apiRequest(id ? `${API_ENDPOINTS.availability}/${id}` : API_ENDPOINTS.availability, options);
      const availData = await apiRequest(API_ENDPOINTS.availability);
      setAvailability(availData.data || []);
    } catch (err) {
      console.error('Availability mutation failed:', err);
      throw err;
    }
  }

  async function blockClient(clientId, block) {
    await apiRequest(`${API_ENDPOINTS.clients}/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: !block })
    });
    const clientData = await apiRequest(API_ENDPOINTS.clients);
    setClients((clientData.data || []).filter(c => c.role !== 'admin'));
  }

  const exportReport = (format = 'csv') => {
    const rows = [
      ['Date', 'Client', 'Staff', 'Services', 'Status', 'Payment', 'Amount'],
      ...appointments.map(appt => [
        appt.date,
        appt.clientName || appt.clientEmail || 'Unknown',
        staff.find(s => s._id === appt.employeeId)?.name || '—',
        (appt.serviceIds || []).map(id => services.find(s => s._id === id)?.name).join('; '),
        appt.status,
        appt.paymentStatus || 'unpaid',
        (payments.find(p => p.appointmentId === appt._id)?.amount ?? 0).toFixed(2)
      ])
    ];
    const csv = rows.map(r => r.map(field => `"${String(field ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {
      type: format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8;'
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = format === 'pdf' ? 'nxl-report.pdf' : 'nxl-report.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const sendNotification = async message => {
    setNotifications(prev => [...prev, { id: Date.now(), message, createdAt: new Date() }]);
    // integrate: await apiRequest(`${API_BASE_URL}/notifications`, { method:'POST', body: JSON.stringify({ message }) });
  };

  // --- Render fragments ----------------------------------------------------
  const renderStatCards = () => (
    <div className="grid grid-responsive">
      <StatCard label="Bookings Today" value={reportMeta.bookingsToday} icon="📅" />
      <StatCard label="Upcoming Bookings" value={reportMeta.upcomingBookings} icon="⏰" />
      <StatCard label="Revenue Today" value={`R${reportMeta.totalRevenueToday.toFixed(2)}`} icon="💰" />
      <StatCard label="Revenue (Week)" value={`R${reportMeta.totalRevenueWeek.toFixed(2)}`} icon="📈" />
      <StatCard label="Revenue (Month)" value={`R${reportMeta.totalRevenueMonth.toFixed(2)}`} icon="📊" />
      <StatCard label="Cancellations" value={reportMeta.cancellations} icon="⚠️" />
      <StatCard label="No Shows" value={reportMeta.noShows} icon="🚫" />
      <StatCard label="Unpaid Bookings" value={reportMeta.unpaidCount} icon="💳" />
    </div>
  );

  const renderOverview = () => (
    <>
      {renderStatCards()}
      <section className="panel">
        <header>
          <h3>Revenue Trend</h3>
          <div className="button-row">
            <button 
              className={`btn ${chartRange === 'week' ? 'primary' : 'ghost'}`}
              onClick={() => setChartRange('week')}
            >
              Week
            </button>
            <button 
              className={`btn ${chartRange === 'month' ? 'primary' : 'ghost'}`}
              onClick={() => setChartRange('month')}
            >
              Month
            </button>
            <button 
              className={`btn ${chartRange === 'year' ? 'primary' : 'ghost'}`}
              onClick={() => setChartRange('year')}
            >
              Year
            </button>
          </div>
        </header>
        <RevenueChart payments={payments} range={chartRange} />
      </section>

      <section className="panel">
        <header>
          <h3>Bookings Trend</h3>
        </header>
        <BookingsChart appointments={appointments} range={chartRange} />
      </section>

      <section className="panel quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button className="btn primary" onClick={() => setShowAppointmentModal(true)}>
            ➕ Add Booking
          </button>
          <button className="btn primary" onClick={() => setActiveSection('services')}>
            💅 Add Service
          </button>
          <button className="btn primary" onClick={() => setShowAvailabilityModal(true)}>
            🚫 Block Time
          </button>
        </div>
      </section>
    </>
  );

  const renderAppointments = () => (
    <>
      <section className="panel filters">
        <h3>Appointment Filters</h3>
        <div className="filter-grid">
          <select
            value={filters.staff}
            onChange={e => setFilters({ ...filters, staff: e.target.value })}
          >
            <option value="all">All Staff</option>
            {staff.map(s => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={filters.service}
            onChange={e => setFilters({ ...filters, service: e.target.value })}
          >
            <option value="all">All Services</option>
            {services.map(s => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={e => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="all">All Statuses</option>
            <option value="booked">Booked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no-show">No Show</option>
          </select>
          <input
            placeholder="Filter by client"
            value={filters.client}
            onChange={e => setFilters({ ...filters, client: e.target.value })}
          />
        </div>
      </section>

      <section className="panel">
        <header>
          <h3>Appointments List</h3>
          <div className="button-row">
            <button className="btn ghost" onClick={handleExportAppointmentsPDF}>
              📄 Export PDF
            </button>
            <button className="btn ghost" onClick={() => sendNotification('Manual reminder sent')}>
              Notify
            </button>
            <button className="btn primary" onClick={() => setShowAppointmentModal(true)}>
              ➕ Create Appointment
            </button>
          </div>
        </header>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Client</th>
                <th>Services</th>
                <th>Staff</th>
                <th>Status</th>
                <th>Payment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map(appt => (
                <tr key={appt._id}>
                  <td>{appt.date}</td>
                  <td>{appt.time}</td>
                  <td>{appt.clientName}</td>
                  <td>{(appt.serviceIds || []).map(id => services.find(s => s._id === id)?.name).join(', ')}</td>
                  <td>{staff.find(s => s._id === appt.employeeId)?.name || '—'}</td>
                  <td className={`status ${appt.status}`}>{appt.status}</td>
                  <td>{appt.paymentStatus || 'unpaid'}</td>
                  <td className="row-actions">
                    <button onClick={() => {
                      setEditingAppointment(appt);
                      setShowEditAppointmentModal(true);
                    }} title="Edit">
                      ✏️
                    </button>
                    <button onClick={() => mutateAppointment(appt._id, { status: 'completed' })} title="Mark Complete">
                      ✓
                    </button>
                    <button onClick={() => mutateAppointment(appt._id, { status: 'cancelled' })} title="Cancel">
                      ✕
                    </button>
                    {appt.paymentStatus !== 'paid' && (
                      <button onClick={() => {
                        setSelectedAppointment(appt);
                        setShowPaymentModal(true);
                      }} title="Record Payment">
                        💳
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredAppointments.length && (
                <tr>
                  <td colSpan="8" className="empty-row">
                    No appointments match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel calendar-panel">
        <header>
          <h3>Calendar View</h3>
        </header>
        {filteredAppointments.length > 0 && (
          <AppointmentCalendar 
            appointments={filteredAppointments}
            staff={staff}
            services={services}
            onSelectSlot={(slotInfo) => {
              setShowAppointmentModal(true);
            }}
            onSelectEvent={(event) => {
              console.log('Selected appointment:', event.resource);
            }}
          />
        )}
        {filteredAppointments.length === 0 && (
          <div className="calendar-placeholder">
            No appointments to display. Create your first appointment to see it on the calendar.
          </div>
        )}
      </section>
    </>
  );

  const renderServices = () => (
    <section className="panel">
      <header>
        <h3>Services</h3>
        <button className="btn primary" onClick={() => {
          setEditingService(null);
          setServiceForm({ name: '', duration: '', price: '', description: '', category: '' });
          setShowServiceForm(true);
        }}>
          + Add Service
        </button>
      </header>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Duration</th>
              <th>Price</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {services.map(service => (
              <tr key={service._id}>
                <td>{service.name}</td>
                <td>{service.category || 'Uncategorized'}</td>
                <td>{service.durationMinutes} min</td>
                <td>R{(decimalToFloat(service.price) || 0).toFixed(2)}</td>
                <td>{service.isActive ? 'Enabled' : 'Disabled'}</td>
                <td className="row-actions">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      console.log('Editing service:', service);
                      setEditingService(service);
                      setServiceForm({
                        name: service.name,
                        duration: service.durationMinutes,
                        price: decimalToFloat(service.price) || 0,
                        category: service.category || '',
                        description: service.description || ''
                      });
                      setShowServiceForm(true);
                    }}
                  >
                    Edit
                  </button>
                  <button onClick={async (e) => {
                    e.preventDefault();
                    try {
                      await mutateService(service._id, { isActive: !service.isActive }, 'PUT');
                      sendNotification(`Service ${service.isActive ? 'disabled' : 'enabled'} successfully`);
                    } catch (err) {
                      alert('Failed to update service: ' + err.message);
                    }
                  }}>
                    {service.isActive ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
            {!services.length && (
              <tr>
                <td colSpan="6" className="empty-row">
                  No services defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {showServiceForm && (
        <Modal title={editingService ? 'Edit Service' : 'Add Service'} onClose={() => {
          setShowServiceForm(false);
          setEditingService(null);
          setServiceForm({ name: '', duration: '', price: '', description: '', category: '' });
        }}>
          <form
            onSubmit={async e => {
              e.preventDefault();
              e.stopPropagation();
              setIsSubmitting(true);
              try {
                const duration = Number(serviceForm.duration);
                const price = Number(serviceForm.price);
                
                // Validate duration is multiple of 15
                if (duration % 15 !== 0) {
                  alert('Duration must be a multiple of 15 minutes (e.g., 15, 30, 45, 60)');
                  setIsSubmitting(false);
                  return;
                }
                
                // Validate price
                if (isNaN(price) || price < 0) {
                  alert('Please enter a valid price');
                  setIsSubmitting(false);
                  return;
                }
                
                const payload = {
                  name: serviceForm.name,
                  durationMinutes: duration,
                  price: price,
                  description: serviceForm.description,
                  category: serviceForm.category,
                  isActive: true
                };
                
                console.log('Submitting service:', { 
                  id: editingService?._id, 
                  payload, 
                  method: editingService ? 'PUT' : 'POST' 
                });
                
                await mutateService(editingService?._id, payload, editingService ? 'PUT' : 'POST');
                
                setShowServiceForm(false);
                setEditingService(null);
                setServiceForm({ name: '', duration: '', price: '', description: '', category: '' });
                sendNotification(`Service ${editingService ? 'updated' : 'created'} successfully`);
              } catch (err) {
                console.error('Service save error:', err);
                alert('Failed to save service: ' + err.message);
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="form-grid"
          >
            <input
              required
              placeholder="Service name"
              value={serviceForm.name}
              onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
              disabled={isSubmitting}
            />
            <input
              placeholder="Category"
              value={serviceForm.category || ''}
              onChange={e => setServiceForm({ ...serviceForm, category: e.target.value })}
              disabled={isSubmitting}
            />
            <input
              required
              type="number"
              min="15"
              step="15"
              placeholder="Duration (minutes - must be multiple of 15)"
              value={serviceForm.duration}
              onChange={e => setServiceForm({ ...serviceForm, duration: e.target.value })}
              disabled={isSubmitting}
            />
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Price (R)"
              value={serviceForm.price}
              onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })}
              disabled={isSubmitting}
            />
            <textarea
              placeholder="Description"
              value={serviceForm.description || ''}
              onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })}
              disabled={isSubmitting}
            />
            <footer className="modal-actions">
              <button type="button" onClick={() => {
                setShowServiceForm(false);
                setEditingService(null);
              }} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
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
        <button className="btn primary" onClick={() => {
          setEditingStaff(null);
          setShowStaffModal(true);
        }}>
          ➕ Add Technician
        </button>
      </header>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Services</th>
              <th>Working Hours</th>
              <th>Active</th>
              <th>Workload</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.map(emp => (
              <tr key={emp._id}>
                <td>{emp.name}</td>
                <td>{(emp.servicesOffered || []).map(id => services.find(s => s._id === id)?.name).join(', ')}</td>
                <td>{emp.workingHours ? 'Custom' : 'Default'}</td>
                <td>{emp.isActive ? 'Yes' : 'No'}</td>
                <td>{staffWorkload[emp._id] || 0} appts</td>
                <td className="row-actions">
                  <button onClick={() => {
                    setEditingStaff(emp);
                    setShowStaffModal(true);
                  }}>
                    Edit
                  </button>
                  <button onClick={() => mutateStaff(emp._id, { isActive: !emp.isActive }, 'PUT')}>
                    {emp.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => mutateStaff(emp._id, {}, 'DELETE')}>Remove</button>
                </td>
              </tr>
            ))}
            {!staff.length && (
              <tr>
                <td colSpan="6" className="empty-row">
                  No staff members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderClients = () => (
    <section className="panel">
      <header>
        <h3>Clients</h3>
        <input
          placeholder="Search clients"
          value={filters.client}
          onChange={e => setFilters({ ...filters, client: e.target.value })}
        />
      </header>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Total Bookings</th>
              <th>Last Booking</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {clients
              .filter(c => c.email?.toLowerCase().includes(filters.client.toLowerCase()))
              .map(client => {
                const stats = clientStats[client._id] || { total: 0, last: null };
                const isActive = client.isActive !== false;
                return (
                  <tr key={client._id}>
                    <td>{client.firstName} {client.lastName}</td>
                    <td>{client.email}</td>
                    <td>{stats.total}</td>
                    <td>{stats.last ? stats.last.toISOString().split('T')[0] : '—'}</td>
                    <td>{isActive ? 'Active' : 'Blocked'}</td>
                    <td className="row-actions">
                      <button onClick={() => sendNotification(`Reminder sent to ${client.email}`)}>Notify</button>
                      <button onClick={() => blockClient(client._id, isActive)}>
                        {isActive ? 'Block' : 'Unblock'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            {!clients.length && (
              <tr>
                <td colSpan="6" className="empty-row">
                  No clients registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderAvailability = () => (
    <section className="panel">
      <header>
        <h3>Availability & Scheduling</h3>
        <div className="button-row">
          <button className="btn primary" onClick={() => setShowAvailabilityModal(true)}>
            ➕ Block Time
          </button>
        </div>
      </header>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Employee</th>
              <th>Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {availability.map(slot => (
              <tr key={slot._id}>
                <td>{slot.date}</td>
                <td>{slot.time}</td>
                <td>{slot.employeeId === 'ALL' ? 'Salon-wide' : staff.find(s => s._id === slot.employeeId)?.name}</td>
                <td>{slot.reason}</td>
                <td className="row-actions">
                  <button onClick={() => mutateAvailability(slot._id, {}, 'DELETE')}>Remove</button>
                </td>
              </tr>
            ))}
            {!availability.length && (
              <tr>
                <td colSpan="5" className="empty-row">
                  No blocked time slots.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderPayments = () => (
    <section className="panel">
      <header>
        <h3>Payments & Reports</h3>
        <div className="button-row">
          <button className="btn ghost" onClick={() => exportReport('csv')}>
            📊 Export CSV
          </button>
          <button className="btn ghost" onClick={handleExportRevenuePDF}>
            📄 Export PDF
          </button>
        </div>
      </header>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Method</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {payments.map(pay => (
              <tr key={pay._id}>
                <td>{new Date(pay.createdAt).toLocaleString()}</td>
                <td>{pay.clientEmail || pay.clientName || 'Unknown'}</td>
                <td>R{decimalToFloat(pay.amount).toFixed(2)}</td>
                <td>{pay.type || 'full'}</td>
                <td>{pay.method}</td>
                <td className={`status ${pay.status}`}>{pay.status}</td>
                <td className="row-actions">
                  {pay.status === 'paid' && (
                    <button onClick={() => handleRefundPayment(pay._id)} title="Refund">
                      ↩️
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!payments.length && (
              <tr>
                <td colSpan="7" className="empty-row">
                  No payments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderNotifications = () => (
    <section className="panel">
      <header>
        <h3>Notifications & Announcements</h3>
        <button className="btn primary" onClick={() => sendNotification('Sample announcement')}>
          + New Announcement
        </button>
      </header>
      <ul className="notification-feed">
        {notifications.map(note => (
          <li key={note.id}>
            <span>{note.message}</span>
            <small>{new Date(note.createdAt).toLocaleString()}</small>
          </li>
        ))}
        {!notifications.length && <li className="empty-row">No notifications sent yet.</li>}
      </ul>
    </section>
  );

  // --- PDF export handlers -------------------------------------------------
  const handleExportAppointmentsPDF = () => {
    try {
      generateAppointmentsPDF(filteredAppointments, staff, services, payments);
      sendNotification('Appointments report exported to PDF');
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF: ' + err.message);
    }
  };

  const handleExportRevenuePDF = () => {
    try {
      generateRevenueReportPDF(payments, `Last ${chartRange}`);
      sendNotification('Revenue report exported to PDF');
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF: ' + err.message);
    }
  };

  // --- Modal handlers ------------------------------------------------------
  const handleCreateAppointment = async (formData) => {
    setIsSubmitting(true);
    try {
      await apiRequest(API_ENDPOINTS.appointments, {
        method: 'POST',
        body: JSON.stringify({
          userId: formData.clientId,
          employeeId: formData.employeeId,
          serviceIds: formData.serviceIds,
          date: formData.date,
          time: formData.time,
          notes: formData.notes
        })
      });
      
      const apptData = await apiRequest(API_ENDPOINTS.appointments);
      setAppointments(apptData.data || []);
      setShowAppointmentModal(false);
      sendNotification('New appointment created successfully');
    } catch (err) {
      console.error('Failed to create appointment:', err);
      alert('Failed to create appointment: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStaffSubmit = async (formData) => {
    setIsSubmitting(true);
    try {
      const method = editingStaff ? 'PUT' : 'POST';
      const endpoint = editingStaff 
        ? `${API_ENDPOINTS.staff}/${editingStaff._id}` 
        : API_ENDPOINTS.staff;
      
      await apiRequest(endpoint, {
        method,
        body: JSON.stringify(formData)
      });
      
      const staffData = await apiRequest(API_ENDPOINTS.staff);
      setStaff(staffData.data || []);
      setShowStaffModal(false);
      setEditingStaff(null);
      sendNotification(`Staff member ${editingStaff ? 'updated' : 'added'} successfully`);
    } catch (err) {
      console.error('Failed to save staff:', err);
      alert('Failed to save staff: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBlockTime = async (formData) => {
    setIsSubmitting(true);
    try {
      await apiRequest(API_ENDPOINTS.availability, {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      
      const availData = await apiRequest(API_ENDPOINTS.availability);
      setAvailability(availData.data || []);
      setShowAvailabilityModal(false);
      sendNotification('Time slot blocked successfully');
    } catch (err) {
      console.error('Failed to block time:', err);
      alert('Failed to block time: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAppointment = async (formData) => {
    setIsSubmitting(true);
    try {
      await apiRequest(`${API_ENDPOINTS.appointments}/${editingAppointment._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          employeeId: formData.employeeId,
          serviceIds: formData.serviceIds,
          date: formData.date,
          time: formData.time,
          notes: formData.notes,
          status: formData.status
        })
      });
      
      const apptData = await apiRequest(API_ENDPOINTS.appointments);
      setAppointments(apptData.data || []);
      setShowEditAppointmentModal(false);
      setEditingAppointment(null);
      sendNotification('Appointment updated successfully');
    } catch (err) {
      console.error('Failed to update appointment:', err);
      alert('Failed to update appointment: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePayment = async (formData) => {
    setIsSubmitting(true);
    try {
      await apiRequest(API_ENDPOINTS.payments, {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      
      const [apptData, paymentData] = await Promise.all([
        apiRequest(API_ENDPOINTS.appointments),
        apiRequest(API_ENDPOINTS.payments)
      ]);
      
      setAppointments(apptData.data || []);
      setPayments(paymentData.data || []);
      setShowPaymentModal(false);
      setSelectedAppointment(null);
      sendNotification('Payment recorded successfully');
    } catch (err) {
      console.error('Failed to record payment:', err);
      alert('Failed to record payment: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefundPayment = async (paymentId) => {
    if (!confirm('Are you sure you want to refund this payment?')) return;
    
    try {
      await apiRequest(`${API_ENDPOINTS.payments}/${paymentId}/refund`, {
        method: 'POST'
      });
      
      const [apptData, paymentData] = await Promise.all([
        apiRequest(API_ENDPOINTS.appointments),
        apiRequest(API_ENDPOINTS.payments)
      ]);
      
      setAppointments(apptData.data || []);
      setPayments(paymentData.data || []);
      sendNotification('Payment refunded successfully');
    } catch (err) {
      alert('Failed to refund payment: ' + err.message);
    }
  };

  // --- Main render ---------------------------------------------------------
  if (authLoading || loading) {
    return (
      <div className="admin-loading">
        <div className="spinner" />
        <span>Loading admin dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-error">
        <h2>Admin Dashboard</h2>
        <p>{error}</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  const sectionRenderer = () => {
    switch (activeSection) {
      case 'appointments':
        return renderAppointments();
      case 'services':
        return renderServices();
      case 'staff':
        return renderStaff();
      case 'clients':
        return renderClients();
      case 'availability':
        return renderAvailability();
      case 'payments':
        return renderPayments();
      case 'notifications':
        return renderNotifications();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <div>
            <h2>NXL Beauty Bar</h2>
            <p>Admin Panel</p>
          </div>
        </div>
        <nav>
          <SidebarBtn icon="🏠" label="Overview" active={activeSection === 'overview'} onClick={() => setActiveSection('overview')} />
          <SidebarBtn icon="📅" label="Appointments" active={activeSection === 'appointments'} onClick={() => setActiveSection('appointments')} />
          <SidebarBtn icon="💅" label="Services" active={activeSection === 'services'} onClick={() => setActiveSection('services')} />
          <SidebarBtn icon="👩‍💼" label="Staff" active={activeSection === 'staff'} onClick={() => setActiveSection('staff')} />
          <SidebarBtn icon="🧑‍🤝‍🧑" label="Clients" active={activeSection === 'clients'} onClick={() => setActiveSection('clients')} />
          <SidebarBtn icon="🗓️" label="Availability" active={activeSection === 'availability'} onClick={() => setActiveSection('availability')} />
          <SidebarBtn icon="💸" label="Payments" active={activeSection === 'payments'} onClick={() => setActiveSection('payments')} />
          <SidebarBtn icon="🔔" label="Notifications" active={activeSection === 'notifications'} onClick={() => setActiveSection('notifications')} />
        </nav>
        <footer>
          <button className="btn ghost" onClick={() => {
            // Clear the active section when navigating away
            localStorage.removeItem('adminActiveSection');
            navigate('/dashboard');
          }}>
            Return to User View
          </button>
          <button className="btn danger" onClick={logout}>
            Logout
          </button>
        </footer>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <h1>{sectionTitleMap[activeSection]}</h1>
            <p>Manage salon operations and monitor performance.</p>
          </div>
          <div className="admin-user">
            <span>{user?.firstName} {user?.lastName}</span>
            <small>{user?.email}</small>
          </div>
        </header>
        <div className="admin-content">{sectionRenderer()}</div>
      </main>

      {/* Modals */}
      {showAppointmentModal && (
        <AppointmentModal
          services={services}
          staff={staff}
          clients={clients}
          onClose={() => setShowAppointmentModal(false)}
          onSubmit={handleCreateAppointment}
          isSubmitting={isSubmitting}
        />
      )}

      {showEditAppointmentModal && (
        <EditAppointmentModal
          appointment={editingAppointment}
          services={services}
          staff={staff}
          clients={clients}
          onClose={() => {
            setShowEditAppointmentModal(false);
            setEditingAppointment(null);
          }}
          onSubmit={handleUpdateAppointment}
          isSubmitting={isSubmitting}
        />
      )}

      {showPaymentModal && (
        <PaymentModal
          appointment={selectedAppointment}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedAppointment(null);
          }}
          onSubmit={handleCreatePayment}
          isSubmitting={isSubmitting}
        />
      )}

      {/* ...existing other modals... */}
    </div>
  );
}

// --- Supporting UI components -----------------------------------------------
const sectionTitleMap = {
  overview: 'Dashboard Overview',
  appointments: 'Appointments Management',
  services: 'Services Management',
  staff: 'Staff Management',
  clients: 'Clients Management',
  availability: 'Availability & Scheduling',
  payments: 'Payments & Reports',
  notifications: 'Notifications & Announcements'
};

function StatCard({ label, value, icon }) {
  return (
    <div className="stat-card">
      <div className="icon">{icon}</div>
      <div>
        <p>{label}</p>
        <h3>{value}</h3>
      </div>
    </div>
  );
}

function TrendChartCard({ title }) {
  return (
    <div className="trend-card">
      <header>{title}</header>
      <div className="chart-placeholder">[Chart Placeholder]</div>
    </div>
  );
}

function SidebarBtn({ icon, label, active, onClick }) {
  return (
    <button className={`sidebar-btn ${active ? 'active' : ''}`} onClick={onClick}>
      <span>{icon}</span>
      {label}
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
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
