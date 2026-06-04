/**
 * BookingPage — public-facing booking flow
 * Customers can browse services, pick a slot and book without creating an account.
 * Guest bookings are stored with guestEmail/guestPhone for admin visibility.
 */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSEO, serviceSchema, breadcrumbSchema } from './useSEO';
import './BookingPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function StarRow({ count = 5 }) {
  return <span style={{color:'#c9a96e',fontSize:'0.75rem',letterSpacing:'2px'}}>{'★'.repeat(count)}</span>;
}

function generateTimeSlots(start = '07:00', end = '18:00', step = 30) {
  const slots = []; let [h, m] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    m += step; if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}
const ALL_SLOTS = generateTimeSlots();

function pad2(n) { return String(n).padStart(2,'0'); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

const STEP_LABELS = ['Services', 'Staff & Time', 'Your Details', 'Confirm'];

export default function BookingPage() {
  const navigate = useNavigate();
  useSEO({
    title:       'Book an Appointment — NXL Beauty Bar',
    description: 'Book your nail, hair or beauty appointment at NXL Beauty Bar in Dube, Soweto. Choose your service, pick a time, done — no account needed.',
    url:         '/book',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        breadcrumbSchema([
          { name: 'Home', url: '/' },
          { name: 'Book an Appointment', url: '/book' },
        ]),
      ],
    },
  });

  const [step,        setStep]       = useState(0);
  const [services,    setServices]   = useState([]);
  const [staff,       setStaff]      = useState([]);
  const [takenSlots,  setTakenSlots] = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [submitting,  setSubmitting] = useState(false);
  const [success,     setSuccess]    = useState(false);
  const [error,       setError]      = useState('');

  // Step 0 — service selection
  const [selectedServices, setSelectedServices] = useState([]);
  const [filterCat,        setFilterCat]        = useState('all');

  // Step 1 — staff + date/time
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedDate,  setSelectedDate]  = useState(addDays(todayISO(), 1));
  const [selectedTime,  setSelectedTime]  = useState('');

  // Step 2 — guest details
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [notes,     setNotes]     = useState('');
  const [errors,    setFormErrors] = useState({});

  // Check if logged in — pre-fill details
  const token    = localStorage.getItem('token');
  const userInfo = (() => { try { return JSON.parse(localStorage.getItem('userInfo') || '{}'); } catch { return {}; } })();

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/services/public`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${API_BASE_URL}/employees/public`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([svcData, staffData]) => {
      setServices((svcData.data || []).filter(s => s.isActive !== false));
      setStaff((staffData.data || []).filter(s => s.isActive !== false));
    }).finally(() => setLoading(false));

    if (userInfo.firstName) {
      setFirstName(userInfo.firstName);
      setLastName(userInfo.lastName || '');
      setEmail(userInfo.email || '');
    }
  }, []);

  useEffect(() => {
    if (!selectedDate || !selectedStaff) return;
    fetch(`${API_BASE_URL}/availability/slots?date=${selectedDate}&employeeId=${selectedStaff}`)
      .then(r => r.json())
      .then(d => setTakenSlots(d.data || []))
      .catch(() => {});
  }, [selectedDate, selectedStaff]);

  const categories = ['all', ...new Set(services.map(s => s.category).filter(Boolean))];
  const filteredServices = filterCat === 'all' ? services : services.filter(s => s.category === filterCat);
  const selectedSvcObjs  = selectedServices.map(id => services.find(s => s._id === id)).filter(Boolean);
  const totalDuration    = selectedSvcObjs.reduce((sum, s) => sum + (s.durationMinutes || s.duration || 0), 0);
  const totalPrice       = selectedSvcObjs.reduce((sum, s) => sum + parseFloat(s.price || 0), 0);

  const toggleService = (id) => {
    setSelectedServices(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const validateStep2 = () => {
    const e = {};
    if (!firstName.trim()) e.firstName = 'Required';
    if (!lastName.trim())  e.lastName  = 'Required';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Valid email required';
    if (!phone.trim() || phone.replace(/\D/g,'').length < 9) e.phone = 'Valid phone number required';
    setFormErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;
    setSubmitting(true); setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res  = await fetch(`${API_BASE_URL}/appointments/guest`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          serviceIds: selectedServices,
          employeeId: selectedStaff,
          date:       selectedDate,
          time:       selectedTime,
          firstName, lastName, email, phone,
          notes,
          isGuest: !token,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || 'Booking failed. Please try again.'); return; }
      setSuccess(true);
    } catch { setError('Network error. Please check your connection.'); }
    finally { setSubmitting(false); }
  };

  const canProceed0 = selectedServices.length > 0;
  const canProceed1 = selectedStaff && selectedDate && selectedTime;

  if (loading) return (
    <div className="bp-root bp-loading">
      <div className="bp-spinner" />
      <p>Loading services…</p>
    </div>
  );

  if (success) return (
    <div className="bp-root">
      <div className="bp-success-card">
        <div className="bp-success-icon">🎉</div>
        <h1>Booking Confirmed!</h1>
        <p>Your appointment is booked for <strong>{selectedDate}</strong> at <strong>{selectedTime}</strong>.</p>
        <p>We'll send a confirmation to <strong>{email}</strong>. See you at NXL Beauty Bar!</p>
        <div className="bp-success-actions">
          <Link to="/" className="bp-btn-gold">Back to Home</Link>
          {!token && <Link to="/signup" className="bp-btn-outline">Create Account</Link>}
          {token  && <Link to="/dashboard" className="bp-btn-outline">My Bookings</Link>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="bp-root">
      <div className="bp-inner">

        {/* Header */}
        <div className="bp-page-header">
          <Link to="/" className="bp-back">← Home</Link>
          <h1 className="bp-title">Book an Appointment</h1>
          <p className="bp-subtitle">NXL Beauty Bar · 1948 Mahalefele Rd, Dube, Soweto</p>
        </div>

        {/* Step indicator */}
        <div className="bp-steps">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className={`bp-step ${i === step ? 'current' : i < step ? 'done' : ''}`}>
              <div className="bp-step-dot">{i < step ? '✓' : i + 1}</div>
              <span className="bp-step-label">{label}</span>
              {i < STEP_LABELS.length - 1 && <div className="bp-step-connector" />}
            </div>
          ))}
        </div>

        {/* ── STEP 0: Services ───────────────────────────────────────── */}
        {step === 0 && (
          <div className="bp-section">
            <h2 className="bp-section-title">Choose Your Services</h2>

            {/* Category filter */}
            <div className="bp-cat-filter">
              {categories.map(cat => (
                <button key={cat} className={`bp-cat-btn ${filterCat === cat ? 'active' : ''}`}
                  onClick={() => setFilterCat(cat)}>
                  {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            <div className="bp-services-grid">
              {filteredServices.map(svc => {
                const selected = selectedServices.includes(svc._id);
                return (
                  <div key={svc._id} className={`bp-service-card ${selected ? 'selected' : ''}`}
                    onClick={() => toggleService(svc._id)}>
                    <div className="bp-svc-check">{selected ? '✓' : ''}</div>
                    <div className="bp-svc-info">
                      <p className="bp-svc-name">{svc.name}</p>
                      <p className="bp-svc-meta">{svc.durationMinutes || svc.duration} min · <strong>R{parseFloat(svc.price).toFixed(2)}</strong></p>
                      {svc.description && <p className="bp-svc-desc">{svc.description}</p>}
                    </div>
                  </div>
                );
              })}
              {!filteredServices.length && <p className="bp-empty">No services available in this category.</p>}
            </div>

            {selectedServices.length > 0 && (
              <div className="bp-selection-bar">
                <div>
                  <p className="bp-sel-label">{selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} selected</p>
                  <p className="bp-sel-meta">{totalDuration} min · R{totalPrice.toFixed(2)}</p>
                </div>
                <button className="bp-btn-gold" onClick={() => setStep(1)}>Next: Pick a Time →</button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 1: Staff + Date + Time ────────────────────────────── */}
        {step === 1 && (
          <div className="bp-section">
            <h2 className="bp-section-title">Choose Staff & Time</h2>

            {/* Staff */}
            <div className="bp-staff-grid">
              {staff.map(emp => (
                <div key={emp._id} className={`bp-staff-card ${selectedStaff === emp._id ? 'selected' : ''}`}
                  onClick={() => setSelectedStaff(emp._id)}>
                  <div className="bp-staff-avatar">{emp.name?.[0] || '💅'}</div>
                  <p className="bp-staff-name">{emp.name}</p>
                  {emp.role && <p className="bp-staff-role">{emp.role}</p>}
                </div>
              ))}
              <div className={`bp-staff-card ${selectedStaff === 'any' ? 'selected' : ''}`}
                onClick={() => setSelectedStaff('any')}>
                <div className="bp-staff-avatar" style={{background:'#f1f5f9',color:'#64748b'}}>🎲</div>
                <p className="bp-staff-name">Any Available</p>
              </div>
            </div>

            {/* Date picker — next 14 days */}
            <h3 className="bp-subsection">Select Date</h3>
            <div className="bp-date-scroll">
              {Array.from({ length: 21 }, (_, i) => {
                const iso  = addDays(todayISO(), i + 1);
                const d    = new Date(iso + 'T00:00:00');
                const day  = d.toLocaleDateString('en-ZA', { weekday: 'short' });
                const date = d.getDate();
                const isSelected = iso === selectedDate;
                const isSun = d.getDay() === 0;
                return (
                  <button key={iso} disabled={isSun}
                    className={`bp-date-btn ${isSelected ? 'selected' : ''} ${isSun ? 'disabled' : ''}`}
                    onClick={() => { setSelectedDate(iso); setSelectedTime(''); }}>
                    <span className="bp-date-day">{day}</span>
                    <span className="bp-date-num">{date}</span>
                  </button>
                );
              })}
            </div>

            {/* Time slots */}
            {selectedDate && (
              <>
                <h3 className="bp-subsection">Select Time</h3>
                <div className="bp-slots-grid">
                  {ALL_SLOTS.map(slot => {
                    const taken = takenSlots.includes(slot);
                    return (
                      <button key={slot} disabled={taken}
                        className={`bp-slot ${selectedTime === slot ? 'selected' : ''} ${taken ? 'taken' : ''}`}
                        onClick={() => !taken && setSelectedTime(slot)}>
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="bp-nav-row">
              <button className="bp-btn-outline" onClick={() => setStep(0)}>← Back</button>
              {canProceed1 && (
                <button className="bp-btn-gold" onClick={() => setStep(2)}>Next: Your Details →</button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: Guest Details ───────────────────────────────────── */}
        {step === 2 && (
          <div className="bp-section">
            <h2 className="bp-section-title">Your Details</h2>
            {token
              ? <p className="bp-logged-in-note">✅ Booking as <strong>{userInfo.firstName} {userInfo.lastName}</strong> ({userInfo.email})</p>
              : <p className="bp-guest-note">No account needed — just fill in your details below. <Link to="/signup">Create an account</Link> to earn loyalty points!</p>
            }

            <div className="bp-form-grid">
              <div className="bp-field">
                <label>First Name *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" disabled={!!token} />
                {errors.firstName && <span className="bp-err">{errors.firstName}</span>}
              </div>
              <div className="bp-field">
                <label>Last Name *</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" disabled={!!token} />
                {errors.lastName && <span className="bp-err">{errors.lastName}</span>}
              </div>
              <div className="bp-field bp-field-full">
                <label>Email Address *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" disabled={!!token} />
                {errors.email && <span className="bp-err">{errors.email}</span>}
              </div>
              <div className="bp-field bp-field-full">
                <label>Phone Number *</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 071 234 5678" />
                {errors.phone && <span className="bp-err">{errors.phone}</span>}
              </div>
              <div className="bp-field bp-field-full">
                <label>Special Requests (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for the technician…" rows={3} />
              </div>
            </div>

            <div className="bp-nav-row">
              <button className="bp-btn-outline" onClick={() => setStep(1)}>← Back</button>
              <button className="bp-btn-gold" onClick={() => { if (validateStep2()) setStep(3); }}>Review Booking →</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Confirm ────────────────────────────────────────── */}
        {step === 3 && (
          <div className="bp-section">
            <h2 className="bp-section-title">Confirm Booking</h2>

            <div className="bp-confirm-card">
              <div className="bp-confirm-row"><span>📅 Date</span><strong>{selectedDate}</strong></div>
              <div className="bp-confirm-row"><span>🕐 Time</span><strong>{selectedTime}</strong></div>
              <div className="bp-confirm-row"><span>👩‍💼 Staff</span><strong>{staff.find(s => s._id === selectedStaff)?.name || 'Any Available'}</strong></div>
              <div className="bp-confirm-divider" />
              {selectedSvcObjs.map(svc => (
                <div key={svc._id} className="bp-confirm-row">
                  <span>{svc.name}</span>
                  <strong>R{parseFloat(svc.price).toFixed(2)}</strong>
                </div>
              ))}
              <div className="bp-confirm-divider" />
              <div className="bp-confirm-row bp-confirm-total">
                <span>Total</span>
                <strong>R{totalPrice.toFixed(2)}</strong>
              </div>
              <p className="bp-confirm-deposit">
                A R{Number(import.meta.env.VITE_DEPOSIT_AMOUNT || 100).toFixed(2)} deposit is required to confirm your booking.
              </p>
            </div>

            <div className="bp-confirm-client">
              <p><strong>{firstName} {lastName}</strong></p>
              <p>{email}</p>
              <p>📞 {phone}</p>
            </div>

            {error && <div className="bp-error-msg">{error}</div>}

            <div className="bp-nav-row">
              <button className="bp-btn-outline" onClick={() => setStep(2)}>← Back</button>
              <button className="bp-btn-gold" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Booking…' : '✅ Confirm Booking'}
              </button>
            </div>
            <p className="bp-terms">By booking you agree to our cancellation policy. A non-refundable deposit of R{Number(import.meta.env.VITE_DEPOSIT_AMOUNT || 100)} is required.</p>
          </div>
        )}

      </div>
    </div>
  );
}