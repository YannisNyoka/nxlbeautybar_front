import { useState, useEffect } from 'react';
import './Dashboard.css';
import './BookingPage.css';
import { useAuth } from './AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { authFetch, API_BASE_URL } from './lib/api';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_DAY_HOURS = { open: '07:00', close: '18:00', closed: false };

const decimalToFloat = (value) => {
  if (value == null) return 0;
  if (typeof value === 'object' && '$numberDecimal' in value) return parseFloat(value.$numberDecimal);
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

function generateTimeSlots(start = '07:00', end = '18:00', step = 30) {
  const slots = []; let [h, m] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    m += step; if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

function pad2(n) { return String(n).padStart(2,'0'); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function getDayKey(iso) { return DAY_KEYS[new Date(iso + 'T00:00:00').getDay()]; }
function isOffPeakSlot(time) { if (!time) return false; const [h] = time.split(':').map(Number); return h < 9 || h >= 17; }
function formatDateTime(dateISO, time) {
  if (!dateISO || !time) return '';
  const d = new Date(dateISO + 'T00:00:00');
  return `${d.toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' })}, ${time}`;
}

// ─── Token-aware fetch helper ─────────────────────────────────────────────────
// Retries once via refresh token on 401/403; redirects to /login if the
// session still can't be established.
async function apiFetch(url, options = {}) {
  const res = await authFetch(url, options);
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
    return null; // prevent further processing
  }
  return res;
}

const STEP_LABELS = ['Services', 'Staff', 'Date & Time', 'Details', 'Review'];

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const apiBase = API_BASE_URL;

  const [step,        setStep]       = useState(0);
  const [services,    setServices]   = useState([]);
  const [staff,       setStaff]      = useState([]);
  const [takenSlots,  setTakenSlots] = useState([]);
  const [weeklyHours, setWeeklyHours] = useState(null); // from /salon-settings — real open/close + closed days
  const [loading,     setLoading]    = useState(true);
  const [servicesError, setServicesError] = useState('');
  const [submitting,  setSubmitting] = useState(false);
  const [error,       setError]      = useState('');

  // Step 0 — service selection
  const [selectedServices, setSelectedServices] = useState([]);
  const [filterCat,        setFilterCat]        = useState('all');

  // Step 1 — staff
  const [selectedStaff, setSelectedStaff] = useState('');

  // Step 2 — date/time
  const [selectedDate,  setSelectedDate]  = useState(addDays(todayISO(), 1));
  const [dateWindowStart, setDateWindowStart] = useState(addDays(todayISO(), 1));
  const [selectedTime,  setSelectedTime]  = useState('');

  // Step 3 — details
  const [notes, setNotes] = useState('');

  // Step 4 — review
  const [contactNumber, setContactNumber] = useState('');
  const [phoneError,    setPhoneError]    = useState('');

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [svcRes, empRes, settingsRes] = await Promise.all([
          apiFetch(`${apiBase}/services`),
          apiFetch(`${apiBase}/employees`),
          fetch(`${apiBase}/salon-settings`).then(r => r.json()).catch(() => ({ data: null })),
        ]);
        setWeeklyHours(settingsRes.data?.weeklyHours || null);

        if (svcRes) {
          const svcResult = await svcRes.json();
          if (svcRes.ok && svcResult.success && Array.isArray(svcResult.data)) {
            setServices(svcResult.data
              .filter(s => s.isActive !== false)
              .map(s => ({ _id: s._id, name: s.name, durationMinutes: s.durationMinutes, price: decimalToFloat(s.price), category: s.category || '' })));
          } else {
            setServicesError('Could not load services from the server.');
          }
        }
        if (empRes) {
          const empResult = await empRes.json();
          if (empRes.ok && empResult.success && Array.isArray(empResult.data)) {
            setStaff(empResult.data.filter(e => e.isActive !== false));
          }
        }
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, [apiBase]);

  useEffect(() => {
    if (!selectedDate || !selectedStaff) return;
    fetch(`${apiBase}/availability/slots?date=${selectedDate}&employeeId=${selectedStaff}`)
      .then(r => r.json())
      .then(d => setTakenSlots(d.data || []))
      .catch(() => {});
  }, [apiBase, selectedDate, selectedStaff]);

  const handleLogout = () => { try { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); } catch {} logout(); navigate('/login'); };

  // Category values in the database are inconsistently cased/spaced
  // ("Manicure", "manicure", "Manicure " all exist as separate stored
  // strings) — group and filter by a normalized key so those don't show
  // up as duplicate pills, without rewriting the underlying data.
  const normalizeCat = (c) => c?.trim().toLowerCase() || '';
  const categories = ['all', ...new Set(services.map(s => normalizeCat(s.category)).filter(Boolean))];
  const filteredServices = filterCat === 'all' ? services : services.filter(s => normalizeCat(s.category) === filterCat);
  const selectedSvcObjs  = selectedServices.map(id => services.find(s => s._id === id)).filter(Boolean);
  const totalDuration    = selectedSvcObjs.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const totalPrice       = selectedSvcObjs.reduce((sum, s) => sum + parseFloat(s.price || 0), 0);

  // Real operating hours from /salon-settings, not a hardcoded guess.
  const getHoursForDate = (iso) => (weeklyHours && weeklyHours[getDayKey(iso)]) || DEFAULT_DAY_HOURS;
  const isDayClosed = (iso) => getHoursForDate(iso).closed;
  const daySlots = selectedDate ? generateTimeSlots(getHoursForDate(selectedDate).open, getHoursForDate(selectedDate).close) : [];

  const toggleService = (id) => {
    setSelectedServices(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  // Date-scroll window navigation — lets the user page forward/backward
  // through future dates instead of being stuck on a fixed 21-day range.
  const DATE_WINDOW_SIZE = 21;
  const earliestWindowStart = addDays(todayISO(), 1);
  const goToPrevDates = () => {
    setDateWindowStart(prev => {
      const shifted = addDays(prev, -DATE_WINDOW_SIZE);
      return shifted < earliestWindowStart ? earliestWindowStart : shifted;
    });
  };
  const goToNextDates = () => setDateWindowStart(prev => addDays(prev, DATE_WINDOW_SIZE));

  const validateContactNumber = () => {
    const digits = contactNumber.replace(/\D/g, '');
    if (!contactNumber.trim() || digits.length < 9) { setPhoneError('Valid phone number required'); return false; }
    setPhoneError(''); return true;
  };

  const handleContinueToPayment = async () => {
    if (!validateContactNumber()) return;
    setSubmitting(true); setError('');
    try {
      const res = await authFetch(`${apiBase}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate, time: selectedTime,
          employeeId: selectedStaff, serviceIds: selectedServices,
          userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
          contactNumber, notes,
          totalPrice, totalDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const msg = data.error || 'Booking failed. Please try again.';
        setError(msg.toLowerCase().includes('overlap') || msg.toLowerCase().includes('unavailable')
          ? 'This time slot is no longer available. Please go back and pick another time.'
          : msg);
        return;
      }
      const appointmentId = data.data?._id || data.data?.id;
      const selectedEmployeeName = staff.find(s => s._id === selectedStaff)?.name || 'Any Available';
      navigate('/payment', {
        state: {
          appointmentId,
          name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
          dateTime: formatDateTime(selectedDate, selectedTime),
          appointmentDate: selectedDate, appointmentTime: selectedTime,
          selectedServices: selectedSvcObjs.map(s => s.name),
          selectedEmployee: selectedEmployeeName,
          totalPrice, totalDuration, contactNumber,
        },
      });
    } catch { setError('Network error. Please check your connection.'); }
    finally { setSubmitting(false); }
  };

  const canProceed0 = selectedServices.length > 0;
  const canProceed1 = !!selectedStaff;
  const canProceed2 = selectedDate && selectedTime;
  const fullyBooked  = selectedDate && !isDayClosed(selectedDate) && daySlots.length > 0 && daySlots.every(slot => takenSlots.includes(slot));

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-left"><h1>NXL Beauty Bar</h1></div>
        <div className="header-right">
          <Link to="/profile" className="user-info">
            <span className="user-icon">👤</span>
            <span className="user-name">{user?.firstName}</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="bp-root bp-loading" style={{ minHeight: '300px' }}>
          <div className="bp-spinner" />
          <p>Loading…</p>
        </div>
      ) : (
        <div className="bp-inner" style={{ padding: 0 }}>
          <div className="welcome-section">
            <h2>Welcome back!</h2>
            <p>Book your appointment in a few simple steps — choose a service, pick your date and time. See you soon!</p>
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
              {servicesError && <div className="bp-error-msg">{servicesError}</div>}

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
                        <p className="bp-svc-meta">{svc.durationMinutes} min · <strong>R{parseFloat(svc.price).toFixed(2)}</strong></p>
                      </div>
                    </div>
                  );
                })}
                {!filteredServices.length && <p className="bp-empty">No services available in this category.</p>}
              </div>

              {canProceed0 && (
                <div className="bp-selection-bar">
                  <div>
                    <p className="bp-sel-label">{selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} selected</p>
                    <p className="bp-sel-meta">{totalDuration} min · R{totalPrice.toFixed(2)}</p>
                  </div>
                  <button className="bp-btn-gold" onClick={() => setStep(1)}>Next: Choose Staff →</button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 1: Staff ──────────────────────────────────────────── */}
          {step === 1 && (
            <div className="bp-section">
              <h2 className="bp-section-title">Choose Your Staff</h2>

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
                {!staff.length && <p className="bp-empty">No stylists available.</p>}
              </div>

              <div className="bp-nav-row">
                <button className="bp-btn-outline" onClick={() => setStep(0)}>← Back</button>
                {canProceed1 && (
                  <button className="bp-btn-gold" onClick={() => setStep(2)}>Next: Date & Time →</button>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 2: Date & Time ────────────────────────────────────── */}
          {step === 2 && (
            <div className="bp-section">
              <h2 className="bp-section-title">Pick a Date & Time</h2>

              <div className="bp-date-nav-row">
                <h3 className="bp-subsection" style={{ margin: 0 }}>Select Date</h3>
                <div className="bp-date-nav-controls">
                  <button type="button" className="bp-date-nav-btn" onClick={goToPrevDates}
                    disabled={dateWindowStart <= earliestWindowStart}>
                    ‹ Prev
                  </button>
                  <span className="bp-date-nav-label">
                    {new Date(dateWindowStart + 'T00:00:00').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
                  </span>
                  <button type="button" className="bp-date-nav-btn" onClick={goToNextDates}>
                    Next ›
                  </button>
                </div>
              </div>
              <div className="bp-date-scroll">
                {Array.from({ length: DATE_WINDOW_SIZE }, (_, i) => {
                  const iso  = addDays(dateWindowStart, i);
                  const d    = new Date(iso + 'T00:00:00');
                  const day  = d.toLocaleDateString('en-ZA', { weekday: 'short' });
                  const date = d.getDate();
                  const isSelected = iso === selectedDate;
                  const closed = isDayClosed(iso);
                  return (
                    <button key={iso} disabled={closed}
                      className={`bp-date-btn ${isSelected ? 'selected' : ''} ${closed ? 'disabled' : ''}`}
                      onClick={() => { setSelectedDate(iso); setSelectedTime(''); }}>
                      <span className="bp-date-day">{day}</span>
                      <span className="bp-date-num">{date}</span>
                    </button>
                  );
                })}
              </div>

              {selectedDate && (
                <>
                  <h3 className="bp-subsection">Select Time</h3>
                  {isDayClosed(selectedDate) ? (
                    <p className="bp-empty">We're closed on this day — please pick another date.</p>
                  ) : fullyBooked ? (
                    <p className="bp-empty">This date is fully booked — please pick another date.</p>
                  ) : (
                    <div className="bp-slots-grid">
                      {daySlots.map(slot => {
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
                  )}
                </>
              )}

              {selectedTime && isOffPeakSlot(selectedTime) && (
                <div className="bp-offpeak-note">
                  ⚠️ Early/late slot — a R50 surcharge applies for bookings before 09:00 or after 17:00.
                </div>
              )}

              <div className="bp-nav-row">
                <button className="bp-btn-outline" onClick={() => setStep(1)}>← Back</button>
                {canProceed2 && (
                  <button className="bp-btn-gold" onClick={() => setStep(3)}>Next: Your Details →</button>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: Details ────────────────────────────────────────── */}
          {step === 3 && (
            <div className="bp-section">
              <h2 className="bp-section-title">Your Details</h2>

              <p className="bp-logged-in-note">✅ Booking as <strong>{user?.firstName} {user?.lastName}</strong> ({user?.email})</p>

              <div className="bp-form-grid">
                <div className="bp-field bp-field-full">
                  <label>Special Requests (optional)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for the technician…" rows={3} />
                </div>
              </div>

              <div className="bp-nav-row">
                <button className="bp-btn-outline" onClick={() => setStep(2)}>← Back</button>
                <button className="bp-btn-gold" onClick={() => setStep(4)}>Next: Review →</button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Review ─────────────────────────────────────────── */}
          {step === 4 && (
            <div className="bp-section">
              <h2 className="bp-section-title">Review Your Booking</h2>

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
                  <span>Estimated Total</span>
                  <strong>R{totalPrice.toFixed(2)}</strong>
                </div>
                {selectedTime && isOffPeakSlot(selectedTime) && (
                  <div className="bp-offpeak-note">
                    ⚠️ Early/late slot — a R50 surcharge applies for bookings before 09:00 or after 17:00.
                  </div>
                )}
                <p className="bp-confirm-deposit">
                  A deposit is required to confirm your booking. Final price and deposit are confirmed at checkout.
                </p>
              </div>

              <div className="bp-form-grid">
                <div className="bp-field bp-field-full">
                  <label>Contact Number *</label>
                  <input type="tel" value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="e.g. 071 234 5678" />
                  {phoneError && <span className="bp-err">{phoneError}</span>}
                </div>
              </div>

              {error && <div className="bp-error-msg">{error}</div>}

              <div className="bp-nav-row">
                <button className="bp-btn-outline" onClick={() => setStep(3)}>← Back</button>
                <button className="bp-btn-gold" onClick={handleContinueToPayment} disabled={submitting}>
                  {submitting ? 'Processing…' : 'Continue to Payment →'}
                </button>
              </div>
              <p className="bp-terms">By continuing you agree to our cancellation policy. A non-refundable deposit is required to secure your appointment.</p>
            </div>
          )}
        </div>
      )}

      <div className="dashboard-navigation">
        <button onClick={handleLogout} className="logout-button">Sign Out</button>
        {user?.role === 'admin' && (
          <button onClick={() => navigate('/admin-dashboard')} style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.55rem 1.1rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 2px 8px rgba(79,70,229,0.35)' }}>🛠 Admin Panel</button>
        )}
        <Link to="/" className="back-home-link">← Back to Home</Link>
      </div>
    </div>
  );
}

export default Dashboard;
