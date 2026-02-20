import { useState, useEffect, useMemo } from 'react';
import './Dashboard.css';
import BookingSummary from './BookingSummary';
import { useAuth } from './AuthContext';
import { Link, useNavigate } from 'react-router-dom';

// Helper to safely convert Decimal128 or numeric values to float
const decimalToFloat = (value) => {
  if (value == null) return 0;
  if (typeof value === 'object' && '$numberDecimal' in value) {
    return parseFloat(value.$numberDecimal);
  }
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

// Helper to convert 24-hour time to 12-hour format with am/pm
const convertTo12Hour = (time24) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours < 12 ? 'am' : 'pm';
  return `${hour12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Helper to convert 12-hour time with am/pm to 24-hour format
const convertTo24Hour = (time12) => {
  if (!time12) return '';
  const match = time12.match(/(\d+):(\d+)\s*(am|pm)/i);
  if (!match) return time12;
  let [, hours, minutes, period] = match;
  hours = parseInt(hours, 10);
  minutes = parseInt(minutes, 10);
  if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
  else if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

function Dashboard() {
  const pedicureTypes = [
    'Basic Pedicure','French Pedicure','Gel Pedicure','Spa Pedicure',
    'Paraffin Pedicure','Hot Stone Pedicure','Fish Pedicure','Mini Pedicure',
    'Athletic or Sports Pedicure','Luxury/Deluxe Pedicure'
  ];

  const defaultServices = [
    { name: 'Manicure', duration: 45, price: 150 },
    { name: 'Pedicure', duration: 30, price: 100 },
    { name: 'Lashes',   duration: 30, price: 120 },
    { name: 'Tinting',  duration: 30, price: 80  }
  ];

  const manicureTypes = [
    'Basic manicure','Classic gel manicure','Hard gel manicure','Acrylic full set',
    'Acrylic fill','Acrylic overlay','Full-coverage soft gel tips','Polygel manicure',
    'Dip manicure','Press-on manicure','Shellac manicure','Vinylux manicure'
  ];

  const [selectedPedicureType, setSelectedPedicureType] = useState('');
  const [selectedManicureType, setSelectedManicureType] = useState('');
  const { user, logout, appointmentRefreshTrigger } = useAuth();
  const navigate = useNavigate();
  const [selectedServices, setSelectedServices] = useState([]);

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today.getDate());
  const [selectedTime, setSelectedTime] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showSummary, setShowSummary] = useState(false);
  const [cellNumber, setCellNumber] = useState(user?.contactNumber || '');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeError, setEmployeeError] = useState('');
  const [servicesError, setServicesError] = useState('');
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

  const [collapsedPanels, setCollapsedPanels] = useState({
    services: false, date: false, time: false, employee: false
  });

  const [services, setServices] = useState(() => {
    try {
      const saved = localStorage.getItem('services');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(s => ({ _id: s._id || s.id, name: s.name, duration: s.duration, price: s.price }));
        }
      }
    } catch {}
    return defaultServices;
  });

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'services') {
        try {
          const parsed = JSON.parse(e.newValue || '[]');
          if (Array.isArray(parsed)) {
            setServices(parsed.map(s => ({ _id: s._id || s.id, name: s.name, duration: s.duration, price: s.price })));
          }
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const generateTimeSlots = (start = '09:00', end = '17:00', interval = 15) => {
    const slots = [];
    let [h, m] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    while (h < endH || (h === endH && m <= endM)) {
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? 'am' : 'pm';
      slots.push(`${hour12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`);
      m += interval;
      if (m >= 60) { h += 1; m -= 60; }
    }
    return slots;
  };

  const allTimeSlots = generateTimeSlots('09:00', '17:00', 15);

  const timeSlots = {
    morning: allTimeSlots.filter(t => {
      const h = parseInt(t.split(':')[0], 10);
      return t.includes('am') && h < 12;
    }),
    afternoon: allTimeSlots.filter(t => {
      const h = parseInt(t.split(':')[0], 10);
      return t.includes('pm') && (h < 5 || h === 12);
    }),
  };

  const [bookedSlots, setBookedSlots] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [unavailableSlots, setUnavailableSlots] = useState([]);

  const parseSlotDateTime = (slot) => {
    try {
      const dateStr = String(slot?.date || '').trim();
      const parts = dateStr.split(' ');
      if (parts.length < 3) return new Date(0);
      const [month, year, day] = parts;
      const base = new Date(`${month} ${day}, ${year}`);
      if (isNaN(base.getTime())) return new Date(0);
      base.setHours(23, 59, 59, 999);
      return base;
    } catch { return new Date(0); }
  };

  const pruneExpiredUnavailableSlots = (slots) => {
    const now = new Date();
    return (Array.isArray(slots) ? slots : []).filter(s => parseSlotDateTime(s) >= now);
  };

  useEffect(() => {
    let initial = [];
    try { initial = JSON.parse(localStorage.getItem('unavailableSlots') || '[]'); } catch { initial = []; }
    setUnavailableSlots(pruneExpiredUnavailableSlots(initial));
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'unavailableSlots') {
        try { setUnavailableSlots(pruneExpiredUnavailableSlots(JSON.parse(e.newValue || '[]'))); } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (appointmentRefreshTrigger > 0) fetchAppointments();
  }, [appointmentRefreshTrigger]);

  useEffect(() => {
    async function fetchServices() {
      try {
        setServicesError('');
        const token = localStorage.getItem('token');
        const response = await fetch(`${apiBase}/services`, { headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json();
        if (response.ok && result.success && Array.isArray(result.data)) {
          const active = result.data
            .filter(s => s.isActive !== false)
            .map(s => ({ _id: s._id || s.id, name: s.name, duration: s.durationMinutes, price: decimalToFloat(s.price) }));
          if (active.length > 0) { setServices(active); return; }
        }
        setServices(defaultServices);
        setServicesError('Showing default services (could not load from server).');
      } catch {
        setServices(defaultServices);
        setServicesError('Showing default services (could not load from server).');
      }
    }
    fetchServices();
  }, [apiBase]);

  useEffect(() => {
    if (services.length > 0) fetchAppointments();
  }, [services, apiBase]);

  const calculateRequiredSlots = (startTime, durationMinutes) => {
    const startIndex = allTimeSlots.indexOf(startTime);
    if (startIndex === -1) return [];
    const slotsNeeded = Math.ceil(durationMinutes / 15);
    if (startIndex + slotsNeeded > allTimeSlots.length) return [];
    return allTimeSlots.slice(startIndex, startIndex + slotsNeeded);
  };

  const fetchAppointments = async () => {
    try {
      setLoadingAppointments(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBase}/appointments`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (result.success) {
        const formattedSlots = result.data
          .map(appointment => {
            if (appointment.status === 'cancelled') return null;
            const isoDate = appointment.date.match(/^\d{4}-\d{2}-\d{2}$/)
              ? appointment.date
              : new Date(appointment.date).toISOString().split('T')[0];
            const time12Hour = convertTo12Hour(appointment.time);
            let totalDuration = appointment.totalDuration || 60;
            if (!appointment.totalDuration && appointment.serviceIds && Array.isArray(appointment.serviceIds)) {
              totalDuration = appointment.serviceIds.reduce((sum, serviceId) => {
                const service = services.find(s => s._id === serviceId);
                return sum + (service ? service.duration : 0);
              }, 0) || 60;
            }
            return { date: isoDate, time: time12Hour, userName: appointment.userName || 'Booked', serviceType: 'Service', appointmentId: appointment._id, duration: totalDuration };
          })
          .filter(slot => slot !== null && slot.time);
        setBookedSlots(formattedSlots);
      } else {
        setBookedSlots([]);
      }
    } catch {
      setBookedSlots([]);
    } finally {
      setLoadingAppointments(false);
    }
  };

  useEffect(() => {
    async function fetchUnavailableSlots() {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${apiBase}/availability`, { headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          setUnavailableSlots(result.data.map(slot => ({ ...slot, time: convertTo12Hour(slot.time) })));
        }
      } catch {
        let initial = [];
        try { initial = JSON.parse(localStorage.getItem('unavailableSlots') || '[]'); } catch { initial = []; }
        setUnavailableSlots(pruneExpiredUnavailableSlots(initial));
      }
    }
    fetchUnavailableSlots();
  }, [apiBase]);

  const handleLogout = () => {
    try { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); } catch {}
    logout();
    navigate('/login');
  };

  const togglePanel = (panelName) => {
    setCollapsedPanels(prev => ({ ...prev, [panelName]: !prev[panelName] }));
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startingDay = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < startingDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const getMonthName = (date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const dayToISO = (day) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return new Date(year, month, day).toISOString().split('T')[0];
  };

  const getTodayISO = () => new Date().toISOString().split('T')[0];

  const isDayInPast = (day) => {
    if (!day) return false;
    return dayToISO(day) < getTodayISO();
  };

  const isTimePast = (time) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const selectedFullDate = new Date(year, month, selectedDate);
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    selectedFullDate.setHours(0,0,0,0);
    if (selectedFullDate.getTime() !== todayMidnight.getTime()) return false;
    const time24 = convertTo24Hour(time);
    const [h, m] = time24.split(':').map(Number);
    const slotDate = new Date(); slotDate.setHours(h, m, 0, 0);
    return slotDate < new Date();
  };

  const handleMonthChange = (direction) => {
    const newMonth = new Date(currentMonth);
    if (direction === 'next') {
      newMonth.setMonth(newMonth.getMonth() + 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() - 1);
      const now = new Date();
      if (newMonth.getFullYear() < now.getFullYear() ||
        (newMonth.getFullYear() === now.getFullYear() && newMonth.getMonth() < now.getMonth())) return;
    }
    setCurrentMonth(newMonth);
  };

  const handleDateSelect = (day) => {
    if (!day) return;
    if (isDayInPast(day)) { alert('You cannot book an appointment in the past.'); return; }
    if (isDateFullyBooked(day)) { alert('This date is fully booked. Please select another date.'); return; }
    setSelectedDate(day);
    setSelectedTime('');
  };

  const handleServiceSelect = (service) => {
    setSelectedServices(prev => {
      if (prev.includes(service.name)) {
        if (service.name === 'Manicure') setSelectedManicureType('');
        if (service.name === 'Pedicure') setSelectedPedicureType('');
        setSelectedTime('');
        return prev.filter(s => s !== service.name);
      } else {
        setSelectedTime('');
        return [...prev, service.name];
      }
    });
  };

  const handleBookAppointment = () => {
    if (selectedServices.length && selectedDate && selectedTime) {
      setShowSummary(true);
    } else {
      alert('Please select a service, date, and time');
    }
  };

  const handleCloseSummary = () => setShowSummary(false);
  const handleEditDateTime = () => setShowSummary(false);

  const handleBookingConfirmed = async (bookingInfo) => {
    const totalDuration = getTotalServiceDuration();
    const requiredSlots = calculateRequiredSlots(selectedTime, totalDuration);
    const isoDate = dayToISO(selectedDate);
    const newBookings = requiredSlots.map(slot => ({
      date: isoDate, time: slot,
      userName: bookingInfo.userName || user?.firstName + ' ' + user?.lastName,
      serviceType: bookingInfo.serviceType || 'Service',
      duration: totalDuration,
      isMainSlot: slot === selectedTime,
      appointmentId: bookingInfo.appointmentId || bookingInfo._id
    }));
    setBookedSlots(prev => [...prev, ...newBookings]);
    setSelectedTime('');
    setShowSummary(false);
    navigate('/payment', {
      state: {
        appointmentId: bookingInfo.appointmentId || bookingInfo._id,
        name: user?.firstName + ' ' + user?.lastName,
        dateTime: `${getMonthName(currentMonth)} ${selectedDate}, ${selectedTime}`,
        appointmentDate: isoDate,
        appointmentTime: selectedTime,
        selectedServices,
        selectedEmployee,
        totalPrice: selectedServices.reduce((acc, s) => {
          const svc = services.find(x => x.name === s);
          return acc + (svc ? svc.price : 0);
        }, 0),
        totalDuration: getTotalServiceDuration(),
        contactNumber: cellNumber,
        selectedManicureType,
        selectedPedicureType,
      }
    });
  };

  const occupiedSlotsByDate = useMemo(() => {
    const map = {};
    bookedSlots.forEach(booking => {
      if (!map[booking.date]) map[booking.date] = new Set();
      calculateRequiredSlots(booking.time, booking.duration || 15).forEach(slot => map[booking.date].add(slot));
    });
    return map;
  }, [bookedSlots]);

  const isSlotRangeUnavailable = (day, startTime, durationMinutes = 15) => {
    const isoDate = dayToISO(day);
    const requiredSlots = calculateRequiredSlots(startTime, durationMinutes);
    return requiredSlots.some(slot =>
      unavailableSlots.some(s => s.date === isoDate && s.time === slot && (s.stylist === 'All' || s.stylist === selectedEmployee))
    );
  };

  const isDateFullyBooked = (day) => {
    const isoDate = dayToISO(day);
    return allTimeSlots.every(slot => {
      const isBlocked = unavailableSlots.some(s => s.date === isoDate && s.time === slot && (s.stylist === 'All' || s.stylist === selectedEmployee));
      const isBooked = bookedSlots.some(booking => {
        if (booking.date !== isoDate) return false;
        return calculateRequiredSlots(booking.time, booking.duration || 15).includes(slot);
      });
      return isBooked || isBlocked;
    });
  };

  const getTotalServiceDuration = () =>
    selectedServices.reduce((total, serviceName) => {
      const service = services.find(s => s.name === serviceName);
      return total + (service ? service.duration : 0);
    }, 0);

  const isPartOfBookedRange = (date, time) => {
    const isoDate = dayToISO(date);
    return occupiedSlotsByDate[isoDate]?.has(time) || false;
  };

  const isInSelectedRange = (time) => {
    if (!selectedTime) return false;
    return calculateRequiredSlots(selectedTime, getTotalServiceDuration()).includes(time);
  };

  const getSlotPositionInRange = (time) => {
    if (!selectedTime) return null;
    const requiredSlots = calculateRequiredSlots(selectedTime, getTotalServiceDuration());
    const index = requiredSlots.indexOf(time);
    if (index === -1) return null;
    return { isFirst: index === 0, isLast: index === requiredSlots.length - 1, position: index + 1, total: requiredSlots.length };
  };

  useEffect(() => {
    const controller = new AbortController();
    async function fetchEmployees() {
      setLoadingEmployees(true); setEmployeeError('');
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiBase}/employees`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
          signal: controller.signal,
        });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || 'Failed to fetch employees');
        const list = Array.isArray(result.data) ? result.data : [];
        setEmployees(list);
        if (!selectedEmployee && list.length > 0) setSelectedEmployee(list[0].name);
      } catch (err) {
        if (err.name !== 'AbortError') setEmployeeError(err.message || 'Failed to fetch employees');
      } finally { setLoadingEmployees(false); }
    }
    fetchEmployees();
    return () => controller.abort();
  }, [apiBase]);

  const selectedServiceIds = selectedServices
    .map(name => services.find(s => s.name === name)?._id)
    .filter(Boolean);

  const renderTimeSlot = (time, index) => {
    const totalDuration = selectedServices.length > 0 ? getTotalServiceDuration() : 15;
    const isOccupied = isPartOfBookedRange(selectedDate, time);
    const isBlocked = isSlotRangeUnavailable(selectedDate, time, totalDuration);
    const inSelectedRange = isInSelectedRange(time);
    const slotPosition = getSlotPositionInRange(time);
    const isPastSlot = isTimePast(time);
    const isUnavailableBooked = isOccupied || isBlocked || isPastSlot;
    const isClickable = selectedServices.length > 0 && !isUnavailableBooked;

    const getStatusLabel = () => {
      if (isPastSlot) return 'Passed';
      if (isUnavailableBooked) return 'Booked';
      if (inSelectedRange && slotPosition) {
        if (slotPosition.isFirst) return '▼ START';
        if (slotPosition.isLast && slotPosition.total > 1) return '▲ END';
        return `${slotPosition.position}/${slotPosition.total}`;
      }
      return null;
    };

    // Slot style — override only what the CSS can't do (dynamic states)
    const slotStyle = isUnavailableBooked
      ? {
          background: isPastSlot ? '#f5ece8' : '#ffe5e5',
          borderLeft: isPastSlot ? '3px solid #e0ccc4' : '3px solid #e05252',
          color: isPastSlot ? '#c4a898' : '#c0392b',
          opacity: 0.75,
          pointerEvents: 'none',
          cursor: 'not-allowed',
        }
      : inSelectedRange
      ? {
          background: 'linear-gradient(135deg, #fce8db 0%, #f9c8a8 100%)',
          borderLeft: '3px solid #a0502e',
          color: '#3d1f15',
          fontWeight: 700,
          boxShadow: '0 2px 10px rgba(160, 80, 46, 0.25)',
        }
      : selectedServices.length === 0
      ? { opacity: 0.5, cursor: 'default' }
      : {};

    return (
      <div key={index} className="time-slot-stack">
        <div
          className={`time-slot ${isUnavailableBooked ? 'unavailable' : ''} ${inSelectedRange ? 'selected' : ''}`}
          style={{ minHeight: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...slotStyle }}
          onClick={() => isClickable && setSelectedTime(time)}
          onMouseEnter={(e) => { if (isClickable && !inSelectedRange) e.currentTarget.style.background = 'linear-gradient(135deg, #fdf6f0 0%, #fce8db 100%)'; }}
          onMouseLeave={(e) => { if (isClickable && !inSelectedRange) e.currentTarget.style.background = ''; }}
        >
          <span style={{ fontSize: '0.78rem', textDecoration: isUnavailableBooked ? 'line-through' : 'none' }}>
            {time}
          </span>
          {getStatusLabel() && (
            <div style={{ fontSize: '0.6rem', marginTop: '2px', fontWeight: 700, color: 'inherit', opacity: 0.85 }}>
              {getStatusLabel()}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <BookingSummary
        open={showSummary}
        onClose={handleCloseSummary}
        service={selectedServices.map(s => {
          const svc = services.find(x => x.name === s);
          return svc ? `${svc.name} (${svc.duration} min, R${svc.price})` : s;
        }).join(', ')}
        totalDuration={selectedServices.reduce((acc, s) => { const svc = services.find(x => x.name === s); return acc + (svc ? svc.duration : 0); }, 0)}
        totalPrice={selectedServices.reduce((acc, s) => { const svc = services.find(x => x.name === s); return acc + (svc ? svc.price : 0); }, 0)}
        dateTime={selectedDate && selectedTime ? `${getMonthName(currentMonth)} ${selectedDate}, ${selectedTime}` : ''}
        appointmentDate={selectedDate ? dayToISO(selectedDate) : ''}
        appointmentTime={selectedTime}
        name={user?.firstName + ' ' + user?.lastName}
        email={user?.email}
        contactNumber={cellNumber}
        onEdit={handleEditDateTime}
        onContactNumberChange={setCellNumber}
        selectedServices={selectedServices}
        servicesList={services}
        selectedServiceIds={selectedServiceIds}
        selectedEmployee={selectedEmployee}
        employeesList={employees}
        selectedManicureType={selectedManicureType}
        selectedPedicureType={selectedPedicureType}
        onBookingConfirmed={handleBookingConfirmed}
      />

      {/* ---- Header ---- */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1>NXL Beauty Bar</h1>
        </div>
        <div className="header-right">
          <Link
            to="/profile"
            className="user-info"
            onMouseEnter={(e) => {}}
            onMouseLeave={(e) => {}}
          >
            <span className="user-icon">👤</span>
            <span className="user-name">{user?.firstName}</span>
          </Link>
        </div>
      </div>

      {/* ---- Welcome ---- */}
      <div className="welcome-section">
        <h2>Welcome back!</h2>
        <p>Book your appointment in a few simple steps — choose a service, pick your date and time. See you soon!</p>
      </div>

      {/* ---- Slots label ---- */}
      <div className="db-slots-label">
        Time slots for:
        <span>{getMonthName(currentMonth)} {selectedDate}</span>
      </div>

      {/* ---- Booking Grid ---- */}
      <div className="booking-interface">

        {/* Services Panel */}
        <div className="booking-panel">
          <div className="panel-header" onClick={() => togglePanel('services')}>
            <h3>Services</h3>
            <span className={`dropdown-arrow ${collapsedPanels.services ? 'collapsed' : ''}`}>▼</span>
          </div>
          {!collapsedPanels.services && (
            <div className="panel-content">
              {servicesError && <div style={{ color: '#c07a5a', marginBottom: '0.5rem', fontSize: '0.78rem' }}>{servicesError}</div>}
              {services.map((service, index) => (
                <div
                  key={index}
                  className={`service-item ${selectedServices.includes(service.name) ? 'selected' : ''}`}
                  onClick={() => handleServiceSelect(service)}
                >
                  <span className="service-name">{service.name}</span>
                  <span className="service-duration">{service.duration} min</span>
                  <span className="service-price">R{(decimalToFloat(service.price) || 0).toFixed(0)}</span>
                </div>
              ))}
              {selectedServices.includes('Manicure') && (
                <div style={{ marginTop: '0.8rem' }}>
                  <label htmlFor="manicure-type">Manicure Type</label>
                  <select id="manicure-type" value={selectedManicureType} onChange={e => setSelectedManicureType(e.target.value)} style={{ marginTop: '0.3rem', width: '100%' }}>
                    <option value="">— Choose —</option>
                    {manicureTypes.map((type, idx) => <option key={idx} value={type}>{type}</option>)}
                  </select>
                </div>
              )}
              {selectedServices.includes('Pedicure') && (
                <div style={{ marginTop: '0.8rem' }}>
                  <label htmlFor="pedicure-type">Pedicure Type</label>
                  <select id="pedicure-type" value={selectedPedicureType} onChange={e => setSelectedPedicureType(e.target.value)} style={{ marginTop: '0.3rem', width: '100%' }}>
                    <option value="">— Choose —</option>
                    {pedicureTypes.map((type, idx) => <option key={idx} value={type}>{type}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date Panel */}
        <div className="booking-panel">
          <div className="panel-header" onClick={() => togglePanel('date')}>
            <h3>Select Date</h3>
            <div className="date-navigation" onClick={e => e.stopPropagation()}>
              <button onClick={() => handleMonthChange('prev')}>‹</button>
              <span>{getMonthName(currentMonth)}</span>
              <button onClick={() => handleMonthChange('next')}>›</button>
            </div>
            <span className={`dropdown-arrow ${collapsedPanels.date ? 'collapsed' : ''}`}>▼</span>
          </div>
          {!collapsedPanels.date && (
            <div className="panel-content">
              <div className="calendar">
                <div className="calendar-header">
                  {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => <span key={d}>{d}</span>)}
                </div>
                <div className="calendar-grid" style={{ position: 'relative' }}>
                  {loadingAppointments && (
                    <div style={{ position:'absolute', inset:0, background:'rgba(253,248,245,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10, borderRadius:8 }}>
                      <span style={{ fontSize:'0.8rem', color:'#9e7060' }}>Loading...</span>
                    </div>
                  )}
                  {getDaysInMonth(currentMonth).map((day, index) => {
                    const fullyBooked = day && isDateFullyBooked(day);
                    const isPast = day && isDayInPast(day);
                    return (
                      <div
                        key={index}
                        className={`calendar-day ${day ? 'available' : 'empty'} ${selectedDate === day && !isPast ? 'selected' : ''} ${fullyBooked && !isPast ? 'fully-booked' : ''}`}
                        onClick={() => day && handleDateSelect(day)}
                        style={{
                          ...(isPast ? { opacity: 0.3, cursor: 'not-allowed', textDecoration: 'line-through', color: '#b08070' } :
                             fullyBooked ? { background: '#ffe5e5', cursor: 'not-allowed', color: '#c07a5a', fontSize: '0.7rem' } : {})
                        }}
                        title={isPast ? 'Past date' : fullyBooked ? 'Fully Booked' : day ? 'Select date' : ''}
                      >
                        {day}
                        {fullyBooked && !isPast && <div style={{ fontSize: '0.5rem', color: '#c07a5a', lineHeight: 1 }}>FULL</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Time Panel */}
        <div className="booking-panel">
          <div className="panel-header" onClick={() => togglePanel('time')}>
            <h3>Time Slots</h3>
            <span className={`dropdown-arrow ${collapsedPanels.time ? 'collapsed' : ''}`}>▼</span>
          </div>
          {!collapsedPanels.time && (
            <div className="panel-content">
              {selectedServices.length > 0 && (
                <div style={{ padding:'0.5rem 0.7rem', marginBottom:'0.6rem', background:'linear-gradient(135deg, #fdf6f0, #fce8db)', borderRadius:8, fontSize:'0.78rem', border:'1px solid #e0ccc4' }}>
                  <strong style={{ color:'#3d1f15' }}>{getTotalServiceDuration()} min</strong>
                  <span style={{ color:'#9e7060' }}> · {Math.ceil(getTotalServiceDuration() / 15)} slots</span>
                </div>
              )}
              <div className="time-section">
                <h4>Morning</h4>
                <div className="time-slots">
                  {timeSlots.morning.map((time, index) => renderTimeSlot(time, index))}
                </div>
              </div>
              <div className="time-section">
                <h4>Afternoon</h4>
                <div className="time-slots">
                  {timeSlots.afternoon.map((time, index) => renderTimeSlot(time, index))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stylist Panel */}
        <div className="booking-panel">
          <div className="panel-header" onClick={() => togglePanel('employee')}>
            <h3>Select Stylist</h3>
            <span className={`dropdown-arrow ${collapsedPanels.employee ? 'collapsed' : ''}`}>▼</span>
          </div>
          {!collapsedPanels.employee && (
            <div className="panel-content">
              {loadingEmployees && <div style={{ color:'#9e7060', fontSize:'0.82rem' }}>Loading stylists...</div>}
              {employeeError && <div style={{ color:'#c0392b', fontSize:'0.82rem' }}>{employeeError}</div>}
              {!loadingEmployees && !employeeError && employees.map((emp, idx) => (
                <div
                  key={idx}
                  className={`employee-item ${selectedEmployee === emp.name ? 'selected' : ''}`}
                  onClick={() => setSelectedEmployee(emp.name)}
                >
                  <span style={{ fontSize:'1.1rem' }}>👩‍💼</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{emp.name}</div>
                    {emp.position && <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>{emp.position}</div>}
                  </div>
                </div>
              ))}
              {!loadingEmployees && !employeeError && employees.length === 0 && (
                <div style={{ color:'#9e7060', fontSize:'0.82rem' }}>No stylists available</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- Book Button ---- */}
      <div className="booking-actions" style={{ position: 'relative', zIndex: 10 }}>
        <button
          className="book-appointment-btn"
          onClick={handleBookAppointment}
          style={{ position: 'relative', zIndex: 10, pointerEvents: 'auto', cursor: 'pointer' }}
        >
          Book Appointment
        </button>
      </div>

      {/* ---- Navigation ---- */}
      <div className="dashboard-navigation">
        <button onClick={handleLogout} className="logout-button">Sign Out</button>
        <Link to="/" className="back-home-link">← Back to Home</Link>
      </div>
    </div>
  );
}

export default Dashboard;