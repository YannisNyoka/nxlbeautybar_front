import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
import { usePushAlarm } from './hooks/UsePushAlarm';
import { usePushNotifications, requestNotificationPermission } from './usePushNotifications';
import StaffSchedule from './components/StaffSchedule';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const API_ENDPOINTS = {
  appointments:      `${API_BASE_URL}/appointments`,
  services:          `${API_BASE_URL}/services`,
  staff:             `${API_BASE_URL}/employees`,
  availability:      `${API_BASE_URL}/availability`,
  clients:           `${API_BASE_URL}/users?limit=500`,
  payments:          `${API_BASE_URL}/payments`,
  notifications:     `${API_BASE_URL}/notifications`,
  notifMarkRead:     `${API_BASE_URL}/notifications/mark-read`,
  gallery:           `${API_BASE_URL}/gallery`,
  shopProducts:      `${API_BASE_URL}/shop/admin/products`,
  discountCodes:     `${API_BASE_URL}/discount-codes`,
  shopProductsWrite: `${API_BASE_URL}/shop/products`,
  shopOrders:        `${API_BASE_URL}/shop/admin/orders`,
  shopOrderUpdate:   `${API_BASE_URL}/shop/admin/orders`,
  shopStats:         `${API_BASE_URL}/shop/admin/stats`,
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

function generateTimeSlots(start = '07:00', end = '19:00', interval = 30) {
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

const ALL_SLOTS = generateTimeSlots('07:00', '19:00', 30);
function avPad2(n) { return String(n).padStart(2, '0'); }
function getAvDaysInMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startingDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < startingDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}
function toAvISO(year, month, day) { return `${year}-${avPad2(month + 1)}-${avPad2(day)}`; }

function AvailabilityModal({ staff = [], onClose, onAllSubmitted }) {
  const today = new Date();
  const [calMonth, setCalMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [employeeId, setEmployeeId] = useState('ALL');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const year = calMonth.getFullYear(); const month = calMonth.getMonth();
  const days = getAvDaysInMonth(year, month);
  const monthName = calMonth.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const todayISO = toAvISO(today.getFullYear(), today.getMonth(), today.getDate());
  function isDayPast(day) { return day ? toAvISO(year, month, day) < todayISO : false; }
  function handleDateClick(day) { if (!day || isDayPast(day)) return; setSelectedDate(toAvISO(year, month, day)); setSelectedSlots([]); setError(''); }
  function toggleSlot(slot) { setSelectedSlots(prev => prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]); setError(''); }
  function selectRange(range) {
    if (range === 'morning') setSelectedSlots(ALL_SLOTS.filter(s => parseInt(s.split(':')[0], 10) < 12));
    else if (range === 'afternoon') setSelectedSlots(ALL_SLOTS.filter(s => parseInt(s.split(':')[0], 10) >= 12));
    else if (range === 'full') setSelectedSlots([...ALL_SLOTS]);
  }
  async function handleSubmit() {
    if (!selectedDate) { setError('Please select a date.'); return; }
    if (selectedSlots.length === 0) { setError('Please select at least one time slot.'); return; }
    if (!reason.trim()) { setError('Please enter a reason for blocking.'); return; }
    setBusy(true); setError(''); let successCount = 0; let skippedCount = 0;
    for (const slot of selectedSlots) {
      try {
        await apiRequest(API_ENDPOINTS.availability, { method:'POST', body:JSON.stringify({ date:selectedDate, time:slot, employeeId:employeeId==='ALL'?'ALL':employeeId, reason:reason.trim() }) });
        successCount++;
      } catch (e) {
        if (e.message?.toLowerCase().includes('duplicate') || e.message?.includes('409') || e.message?.includes('11000')) skippedCount++;
        else { setError(`Failed on slot ${slot}: ${e.message}`); setBusy(false); return; }
      }
    }
    setBusy(false); if (onAllSubmitted) await onAllSubmitted(successCount, skippedCount);
  }
  const slotsByHour = useMemo(() => { const groups = {}; ALL_SLOTS.forEach(slot => { const h = slot.split(':')[0]; if (!groups[h]) groups[h] = []; groups[h].push(slot); }); return groups; }, []);
  function formatHour(h) { const n = parseInt(h, 10); if (n===0) return '12 AM'; if (n<12) return `${n} AM`; if (n===12) return '12 PM'; return `${n-12} PM`; }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,15,25,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:'16px', width:'100%', maxWidth:'780px', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 25px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f0f0f0', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
          <div><h3 style={{ margin:0, color:'#fff', fontSize:'1.1rem', fontWeight:700 }}>🚫 Block Time Slots</h3><p style={{ margin:'0.2rem 0 0', color:'rgba(255,255,255,0.6)', fontSize:'0.78rem' }}>Select a date, choose time slots, then block them</p></div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', width:'32px', height:'32px', borderRadius:'8px', cursor:'pointer', fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>
          <div style={{ width:'260px', minWidth:'260px', borderRight:'1px solid #f0f0f0', padding:'1.25rem', overflowY:'auto', display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
                <button onClick={() => setCalMonth(new Date(year,month-1,1))} disabled={year===today.getFullYear()&&month<=today.getMonth()} style={{ background:'none', border:'1px solid #e2e8f0', borderRadius:'6px', width:'28px', height:'28px', cursor:'pointer', fontSize:'0.9rem', color:'#64748b', display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
                <span style={{ fontSize:'0.82rem', fontWeight:600, color:'#1e293b' }}>{monthName}</span>
                <button onClick={() => setCalMonth(new Date(year,month+1,1))} style={{ background:'none', border:'1px solid #e2e8f0', borderRadius:'6px', width:'28px', height:'28px', cursor:'pointer', fontSize:'0.9rem', color:'#64748b', display:'flex', alignItems:'center', justifyContent:'center' }}>›</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'2px', marginBottom:'4px' }}>{['M','T','W','T','F','S','S'].map((d,i) => <div key={i} style={{ textAlign:'center', fontSize:'0.65rem', color:'#94a3b8', fontWeight:600, padding:'2px 0' }}>{d}</div>)}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'2px' }}>
                {days.map((day,i) => { const iso=day?toAvISO(year,month,day):null; const isPast=day&&isDayPast(day); const isSel=iso===selectedDate; const isToday=iso===todayISO; return <div key={i} onClick={() => handleDateClick(day)} style={{ height:'30px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'6px', fontSize:'0.75rem', fontWeight:isToday?700:400, cursor:day&&!isPast?'pointer':'default', background:isSel?'linear-gradient(135deg, #1a1a2e, #4f46e5)':isToday?'#eff6ff':'transparent', color:isSel?'#fff':isPast?'#cbd5e1':isToday?'#4f46e5':'#374151', opacity:isPast?0.4:1, textDecoration:isPast?'line-through':'none', transition:'all 0.15s' }}>{day||''}</div>; })}
              </div>
            </div>
            <div>
              <label style={{ fontSize:'0.75rem', fontWeight:600, color:'#374151', display:'block', marginBottom:'0.4rem' }}>Block for</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={{ width:'100%', padding:'0.5rem 0.75rem', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.82rem', color:'#374151', background:'#fff', cursor:'pointer' }}>
                <option value="ALL">🏠 Entire Salon</option>{staff.filter(s => s.isActive!==false).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:'0.75rem', fontWeight:600, color:'#374151', display:'block', marginBottom:'0.4rem' }}>Reason *</label>
              <input type="text" placeholder="e.g. Public holiday, Training..." value={reason} onChange={e => { setReason(e.target.value); setError(''); }} style={{ width:'100%', padding:'0.5rem 0.75rem', border:`1px solid ${error&&!reason.trim()?'#fca5a5':'#e2e8f0'}`, borderRadius:'8px', fontSize:'0.82rem', color:'#374151', boxSizing:'border-box' }} />
            </div>
            {selectedDate && <div style={{ padding:'0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0', fontSize:'0.75rem', color:'#64748b' }}><div style={{ fontWeight:600, color:'#374151', marginBottom:'0.25rem' }}>📅 {new Date(selectedDate+'T00:00:00').toLocaleDateString('en-ZA',{ weekday:'long', day:'numeric', month:'long' })}</div><div>{selectedSlots.length===0?'No slots selected':selectedSlots.length===ALL_SLOTS.length?'🚫 Full day blocked':`${selectedSlots.length} slot${selectedSlots.length>1?'s':''} selected`}</div></div>}
          </div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'0.75rem 1.25rem', borderBottom:'1px solid #f0f0f0', display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', background:'#fafafa' }}>
              <span style={{ fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginRight:'0.25rem' }}>Quick select:</span>
              {[{label:'🌅 Morning',range:'morning'},{label:'☀️ Afternoon',range:'afternoon'},{label:'📅 Full Day',range:'full'}].map(({label,range}) => (
                <button key={range} onClick={() => { if(selectedDate) selectRange(range); }} disabled={!selectedDate} style={{ padding:'0.3rem 0.7rem', fontSize:'0.72rem', fontWeight:600, border:'1px solid #e2e8f0', borderRadius:'20px', cursor:selectedDate?'pointer':'not-allowed', background:'#fff', color:'#374151', opacity:selectedDate?1:0.4, transition:'all 0.15s' }} onMouseEnter={e => { if(selectedDate) e.currentTarget.style.background='#f1f5f9'; }} onMouseLeave={e => { e.currentTarget.style.background='#fff'; }}>{label}</button>
              ))}
              {selectedSlots.length>0 && <button onClick={() => setSelectedSlots([])} style={{ padding:'0.3rem 0.7rem', fontSize:'0.72rem', fontWeight:600, border:'1px solid #fca5a5', borderRadius:'20px', cursor:'pointer', background:'#fff5f5', color:'#dc2626', marginLeft:'auto' }}>✕ Clear</button>}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'1rem 1.25rem' }}>
              {!selectedDate ? (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'#94a3b8', gap:'0.75rem' }}><span style={{ fontSize:'2.5rem' }}>📅</span><p style={{ margin:0, fontSize:'0.85rem', fontWeight:500 }}>Select a date to choose time slots</p></div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  {Object.entries(slotsByHour).map(([hour,slots]) => (
                    <div key={hour}>
                      <div style={{ fontSize:'0.7rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.35rem' }}>{formatHour(hour)}</div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'0.35rem' }}>
                        {slots.map(slot => { const isSel=selectedSlots.includes(slot); return <button key={slot} onClick={() => toggleSlot(slot)} style={{ padding:'0.45rem 0.25rem', fontSize:'0.75rem', fontWeight:isSel?700:500, border:`2px solid ${isSel?'#4f46e5':'#e2e8f0'}`, borderRadius:'8px', cursor:'pointer', transition:'all 0.12s', background:isSel?'linear-gradient(135deg, #4f46e5, #7c3aed)':'#fff', color:isSel?'#fff':'#374151', boxShadow:isSel?'0 2px 8px rgba(79,70,229,0.3)':'none' }}>{slot}</button>; })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding:'1rem 1.25rem', borderTop:'1px solid #f0f0f0', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.75rem', background:'#fafafa' }}>
              {error ? <div style={{ flex:1, padding:'0.5rem 0.75rem', background:'#fff5f5', border:'1px solid #fca5a5', borderRadius:'8px', fontSize:'0.78rem', color:'#dc2626', fontWeight:500 }}>⚠️ {error}</div> : <div style={{ flex:1 }} />}
              <button onClick={onClose} disabled={busy} style={{ padding:'0.6rem 1.2rem', fontSize:'0.82rem', fontWeight:600, border:'1px solid #e2e8f0', borderRadius:'8px', cursor:busy?'not-allowed':'pointer', background:'#fff', color:'#64748b', opacity:busy?0.6:1 }}>Cancel</button>
              <button onClick={handleSubmit} disabled={busy||!selectedDate||selectedSlots.length===0} style={{ padding:'0.6rem 1.4rem', fontSize:'0.82rem', fontWeight:700, border:'none', borderRadius:'8px', cursor:busy||!selectedDate||selectedSlots.length===0?'not-allowed':'pointer', background:busy||!selectedDate||selectedSlots.length===0?'#e2e8f0':'linear-gradient(135deg, #1a1a2e, #4f46e5)', color:busy||!selectedDate||selectedSlots.length===0?'#94a3b8':'#fff', transition:'all 0.15s', minWidth:'140px' }}>
                {busy?'Blocking...':selectedSlots.length>0?`🚫 Block ${selectedSlots.length} Slot${selectedSlots.length>1?'s':''}` :'Block Slots'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentBadge({ status }) {
  const cfg = { unpaid:{bg:'#fff0f0',color:'#c53030',border:'#fed7d7',label:'⚠️ Unpaid',fw:700}, deposit_paid:{bg:'#f0fff4',color:'#276749',border:'#c6f6d5',label:'✅ Deposit Paid',fw:600}, paid:{bg:'#ebf8ff',color:'#2c5282',border:'#bee3f8',label:'✅ Paid',fw:600}, refunded:{bg:'#fffaf0',color:'#c05621',border:'#feebc8',label:'↩️ Refunded',fw:600} };
  const c = cfg[status] || cfg.unpaid;
  return <span style={{ background:c.bg, color:c.color, border:`1px solid ${c.border}`, fontWeight:c.fw, padding:'0.25rem 0.65rem', borderRadius:'20px', fontSize:'0.72rem', display:'inline-block', whiteSpace:'nowrap' }}>{c.label}</span>;
}

function appointmentAge(createdAt) {
  if (!createdAt) return '';
  const mins = Math.floor((Date.now()-new Date(createdAt))/60000);
  if (mins<60) return `${mins}m ago`; const hrs=Math.floor(mins/60); if (hrs<24) return `${hrs}h ago`; return `${Math.floor(hrs/24)}d ago`;
}

function confirmHardDelete(appt) {
  return window.confirm(`⚠️  PERMANENTLY DELETE APPOINTMENT\n\nClient : ${appt.userName||appt.clientName||'Unknown client'}\nDate   : ${appt.date}  ${appt.time}\nStatus : ${appt.paymentStatus||'unpaid'}\n\nThis removes the appointment AND any associated payment records from the database.\nThis action CANNOT be undone.\n\nAre you absolutely sure?`);
}

const SECTION_TITLES = {
  overview:       'Dashboard Overview',
  appointments:   'Appointments',
  schedule:       'Staff Schedule',
  services:       'Services',
  staff:          'Staff Management',
  clients:        'Clients',
  availability:   'Availability',
  payments:       'Payments & Reports',
  notifications:  'Activity Log',
  gallery:        'Gallery Management',
  'shop-products':'Shop — Products',
  'shop-orders':  'Shop — Orders',
  'discounts':     'Discount Codes',
  'subscriptions': 'Subscription Plans',
  'inventory':     'Inventory Management',
  'shop-revenue': 'Shop — Revenue',
  'analytics':    'Business Analytics',
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

function StatCard({ label, value, icon, color='slate', onClick, clickable }) {
  return <div className={`stat-card${clickable?' stat-card-clickable':''}`} style={{background:COLOR_MAP[color]||COLOR_MAP.slate,cursor:clickable?'pointer':'default'}} onClick={onClick}><div className="icon">{icon}</div><div><p>{label}</p><h3>{value}</h3></div></div>;
}

function SidebarBtn({ icon, label, section, active, onClick, badge, onNavigate }) {
  return <button className={`sidebar-btn ${active===section?'active':''}`} onClick={()=>{onClick(section);if(onNavigate)onNavigate();}}><span className="sb-icon">{icon}</span><span className="sb-label">{label}</span>{badge?<span className="sb-badge">{badge}</span>:null}</button>;
}

function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><header><h3>{title}</h3><button onClick={onClose}>✕</button></header>{children}</div></div>;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [activeSection, setActiveSection] = useState(() => localStorage.getItem('adminActiveSection') || 'overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chartRange, setChartRange] = useState('week');
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({ dateRange:{start:null,end:null}, staff:'all', service:'all', status:'all', client:'' });
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [clients, setClients] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [payments, setPayments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const lastNotifCountRef = useRef(null);
  const [reportMeta, setReportMeta] = useState({ totalRevenueToday:0, totalRevenueWeek:0, totalRevenueMonth:0, bookingsToday:0, upcomingBookings:0, cancellations:0, noShows:0, unpaidCount:0 });
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({ name:'', duration:'', price:'', description:'', category:'' });
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [showEditAppointmentModal, setShowEditAppointmentModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryForm, setGalleryForm] = useState({ imageUrl:'', clientName:'', caption:'' });
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [shopProducts,     setShopProducts]    = useState([]);
  const [shopOrders,       setShopOrders]      = useState([]);
  const [shopStats,        setShopStats]       = useState(null);
  const [shopStatsLoad,    setShopStatsLoad]   = useState(false);
  const [shopLoading,      setShopLoading]     = useState(false);
  const [productForm,      setProductForm]     = useState({ name:'', description:'', price:'', comparePrice:'', category:'nails', stock:'', sku:'', brand:'', tags:'', isFeatured:false, isActive:true });
  const [showProductForm,  setShowProductForm] = useState(false);
  const [editingProduct,   setEditingProduct]  = useState(null);
  const [productImgUrl,    setProductImgUrl]   = useState('');
  const [productImages,    setProductImages]   = useState([]);
  const [imgUploading,     setImgUploading]    = useState(false);
  const [orderFilter,      setOrderFilter]     = useState('all');
  const [discountCodes,    setDiscountCodes]   = useState([]);
  const [discountLoading,  setDiscountLoading] = useState(false);
  const [discountForm,     setDiscountForm]    = useState({ code:'', type:'percentage', value:'', description:'', minOrderAmount:'', usageLimit:'', expiresAt:'', isActive:true });
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [editingDiscount,  setEditingDiscount] = useState(null);

  // ── Analytics state ───────────────────────────────────────────────────
  // ── Subscription state ────────────────────────────────────────────────
  const [subPlans,      setSubPlans]      = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subStats,      setSubStats]      = useState(null);
  const [subLoading,    setSubLoading]    = useState(false);
  const [showPlanForm,  setShowPlanForm]  = useState(false);
  const [planForm,      setPlanForm]      = useState({ name:'', description:'', price:'', bookingsPerMonth:'', discountPct:'', features:'', color:'#6366f1', isPopular:false, sortOrder:'0' });

  const [analyticsData,  setAnalyticsData]  = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState('30');
  const [analyticsLoad,  setAnalyticsLoad]  = useState(false);

  // ── Inventory state ───────────────────────────────────────────────────
  const [inventory,    setInventory]    = useState(null);
  const [invHistory,   setInvHistory]   = useState([]);
  const [suppliers,    setSuppliers]    = useState([]);
  const [invLoading,   setInvLoading]   = useState(false);
  const [showRestock,  setShowRestock]  = useState(false);
  const [restockForm,  setRestockForm]  = useState({ productId:'', quantity:'', costPerUnit:'', supplier:'', invoiceRef:'', notes:'' });

  const showToast = useCallback((msg, type='success') => { setToast({ msg, type, id:Date.now() }); setTimeout(() => setToast(null), 3500); }, []);

  const loadAnalytics = useCallback(async (range) => {
    const r = range || '30';
    setAnalyticsLoad(true);
    try {
      const data = await apiRequest(`${API_BASE_URL}/analytics?range=${r}`);
      setAnalyticsData(data.data);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setAnalyticsLoad(false); }
  }, [showToast]);

  useEffect(() => {
    if (activeSection === 'analytics' && !analyticsData && !analyticsLoad) {
      loadAnalytics(analyticsRange);
    }
  }, [activeSection]);

  usePushAlarm({ isAuthenticated, notifications, activeSection });
  usePushNotifications({ notifications, isAdmin: user?.role === 'admin' });

  const [notifPermission, setNotifPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
    if (result === 'granted') showToast('🔔 Browser notifications enabled!');
  };

  useEffect(() => { localStorage.setItem('adminActiveSection', activeSection); }, [activeSection]);
  useEffect(() => { if (!isAuthenticated || authLoading) return; loadAll(); }, [isAuthenticated, authLoading, user]);

  useEffect(() => {
    if (activeSection !== 'notifications') return;
    apiRequest(API_ENDPOINTS.notifMarkRead, { method:'POST' })
      .then(() => { setNotifications(prev => prev.map(n => ({ ...n, read:true, readAt:n.readAt||new Date() }))); lastNotifCountRef.current = 0; })
      .catch(() => {});
  }, [activeSection]);

  useEffect(() => {
    if (!isAuthenticated) return;
    async function pollNotifications() {
      try {
        const data = await apiRequest(API_ENDPOINTS.notifications);
        const fresh = data.data || [];
        const unreadCount = fresh.filter(n => !n.read).length;
        if (lastNotifCountRef.current !== null && unreadCount > lastNotifCountRef.current) showToast('📅 New appointment booked!', 'success');
        lastNotifCountRef.current = unreadCount;
        setNotifications(fresh);
      } catch {}
    }
    const interval = setInterval(pollNotifications, 20000);
    return () => clearInterval(interval);
  }, [isAuthenticated, showToast]);

  const loadGallery = async () => { try { setGalleryLoading(true); const data = await apiRequest(API_ENDPOINTS.gallery); setGalleryItems(data.data || []); } catch (e) { console.error(e); } finally { setGalleryLoading(false); } };

  useEffect(() => { if (activeSection === 'gallery') loadGallery(); }, [activeSection]);

  // ── Load section data when tab is first opened ───────────────────────
  useEffect(() => {
    if (activeSection === 'shop-products' && shopProducts.length === 0 && !shopLoading) {
      apiRequest(API_ENDPOINTS.shopProducts).then(d => setShopProducts(d.data || [])).catch(() => {});
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'shop-orders' && shopOrders.length === 0 && !shopLoading) {
      const params = orderFilter !== 'all' ? `?status=${orderFilter}` : '';
      setShopLoading(true);
      apiRequest(`${API_ENDPOINTS.shopOrders}${params}`)
        .then(d => setShopOrders(d.data || []))
        .catch(() => {})
        .finally(() => setShopLoading(false));
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'shop-revenue' && !shopStats && !shopStatsLoad) {
      setShopStatsLoad(true);
      apiRequest(API_ENDPOINTS.shopStats)
        .then(d => setShopStats(d.data))
        .catch(e => showToast(e.message, 'error'))
        .finally(() => setShopStatsLoad(false));
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'discounts' && discountCodes.length === 0 && !discountLoading) {
      setDiscountLoading(true);
      apiRequest(API_ENDPOINTS.discountCodes)
        .then(d => setDiscountCodes(d.data || []))
        .catch(() => {})
        .finally(() => setDiscountLoading(false));
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'inventory' && !inventory && !invLoading) {
      setInvLoading(true);
      Promise.all([
        apiRequest(`${API_BASE_URL}/inventory`),
        apiRequest(`${API_BASE_URL}/inventory/history?limit=20`),
        apiRequest(`${API_BASE_URL}/suppliers`),
      ]).then(([inv, hist, sups]) => {
        setInventory(inv.data);
        setInvHistory(hist.data || []);
        setSuppliers(sups.data || []);
      }).catch(e => showToast(e.message, 'error'))
        .finally(() => setInvLoading(false));
    }
  }, [activeSection]);
  // ─────────────────────────────────────────────────────────────────────

  const loadAll = async () => {
    try {
      setLoading(true); setError('');
      const [apptData, svcData, staffData, availData, clientData, payData, notifData] = await Promise.all([
        apiRequest(API_ENDPOINTS.appointments), apiRequest(API_ENDPOINTS.services), apiRequest(API_ENDPOINTS.staff),
        apiRequest(API_ENDPOINTS.availability), apiRequest(API_ENDPOINTS.clients), apiRequest(API_ENDPOINTS.payments), apiRequest(API_ENDPOINTS.notifications),
      ]);
      const appts = apptData.data || []; const pays = (payData.data || []).map(p => ({ ...p, amount:decimalToFloat(p.amount) }));
      setAppointments(appts);
      setServices((svcData.data || []).map(s => ({ ...s, price:decimalToFloat(s.price), durationMinutes:s.durationMinutes||s.duration })));
      setStaff(staffData.data || []); setAvailability(availData.data || []);
      setClients((clientData.data || []).filter(c => c.role !== 'admin'));
      setPayments(pays); computeReportMeta(appts, pays);
      const freshNotifs = notifData.data || []; setNotifications(freshNotifs);
      lastNotifCountRef.current = freshNotifs.filter(n => !n.read).length;
    } catch (err) {
      console.error('AdminDashboard load error:', err);
      if (!err.message.includes('Session expired')) setError(err.message || 'Failed to load admin data');
    } finally { setLoading(false); }
  };

  const unpaidAppointments = useMemo(() => appointments.filter(a => a.paymentStatus === 'unpaid'), [appointments]);
  const unreadNotifCount   = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const filteredAppointments = useMemo(() => appointments.filter(appt => {
    const matchStaff   = filters.staff  ==='all' || String(appt.employeeId)===String(filters.staff);
    const matchService = filters.service==='all' || (appt.serviceIds||[]).some(id => String(id)===String(filters.service));
    const matchStatus  = filters.status ==='all' || appt.status===filters.status;
    const matchClient  = !filters.client || appt.userName?.toLowerCase().includes(filters.client.toLowerCase()) || appt.clientName?.toLowerCase().includes(filters.client.toLowerCase()) || appt.user?.email?.toLowerCase().includes(filters.client.toLowerCase());
    let matchDate = true;
    if (filters.dateRange.start && filters.dateRange.end) { const d=new Date(appt.date); matchDate=d>=new Date(filters.dateRange.start)&&d<=new Date(filters.dateRange.end); }
    return matchStaff && matchService && matchStatus && matchClient && matchDate;
  }), [appointments, filters]);

  const staffWorkload = useMemo(() => { const w={}; staff.forEach(s=>(w[String(s._id)]=0)); filteredAppointments.forEach(a=>{ const k=String(a.employeeId); if(k in w) w[k]++; }); return w; }, [filteredAppointments, staff]);

  const clientStats = useMemo(() => {
    const stats={};
    appointments.forEach(a => { const k=String(a.userId||''); if(!stats[k]) stats[k]={total:0,last:null}; stats[k].total++; const d=new Date(a.date); if(!stats[k].last||d>stats[k].last) stats[k].last=d; });
    return stats;
  }, [appointments]);

  function computeReportMeta(apptList, payList) {
    const today=new Date();
    const sameDay=(d1,d2)=>d1.getFullYear()===d2.getFullYear()&&d1.getMonth()===d2.getMonth()&&d1.getDate()===d2.getDate();
    const withinDays=(date,n)=>(today-new Date(date))/(1000*60*60*24)<n;
    setReportMeta({
      bookingsToday:    apptList.filter(a=>sameDay(new Date(a.date),today)).length,
      upcomingBookings: apptList.filter(a=>new Date(a.date)>=today).length,
      cancellations:    apptList.filter(a=>a.status==='cancelled').length,
      noShows:          apptList.filter(a=>a.status==='no-show').length,
      unpaidCount:      apptList.filter(a=>a.paymentStatus==='unpaid').length,
      totalRevenueToday: payList.filter(p=>sameDay(new Date(p.createdAt),today)&&p.status==='paid').reduce((s,p)=>s+decimalToFloat(p.amount),0),
      totalRevenueWeek:  payList.filter(p=>withinDays(p.createdAt,7)&&p.status==='paid').reduce((s,p)=>s+decimalToFloat(p.amount),0),
      totalRevenueMonth: payList.filter(p=>withinDays(p.createdAt,30)&&p.status==='paid').reduce((s,p)=>s+decimalToFloat(p.amount),0),
    });
  }

  async function hardDeleteAppointment(appt) {
    if (appt.paymentStatus!=='unpaid') { alert('Only unpaid appointments can be permanently deleted.'); return; }
    if (!confirmHardDelete(appt)) return;
    setDeletingId(appt._id);
    try {
      await apiRequest(`${API_ENDPOINTS.appointments}/${appt._id}`, { method:'DELETE' });
      const linked = payments.filter(p=>String(p.appointmentId)===String(appt._id)&&p.status==='pending');
      await Promise.allSettled(linked.map(p=>apiRequest(`${API_ENDPOINTS.payments}/${p._id}`,{method:'DELETE'})));
      const [apptData,payData] = await Promise.all([apiRequest(API_ENDPOINTS.appointments),apiRequest(API_ENDPOINTS.payments)]);
      const appts=apptData.data||[]; const pays=(payData.data||[]).map(p=>({...p,amount:decimalToFloat(p.amount)}));
      setAppointments(appts); setPayments(pays); computeReportMeta(appts,pays);
      showToast(`Appointment for ${appt.userName||'client'} permanently deleted.`);
      addNotification(`Deleted unpaid appointment for ${appt.userName||'client'} on ${appt.date}`);
    } catch (err) { alert('Delete failed: '+err.message); } finally { setDeletingId(null); }
  }

  async function mutateAppointment(id,payload) { await apiRequest(`${API_ENDPOINTS.appointments}/${id}`,{method:'PUT',body:JSON.stringify(payload)}); const apptData=await apiRequest(API_ENDPOINTS.appointments); const appts=apptData.data||[]; setAppointments(appts); computeReportMeta(appts,payments); }
  async function mutateService(id,payload,method) { const opts={method}; if(method!=='DELETE'){if(payload.price!==undefined)payload.price=Number(payload.price);if(payload.durationMinutes!==undefined)payload.durationMinutes=Number(payload.durationMinutes);opts.body=JSON.stringify(payload);} const endpoint=id&&method!=='POST'?`${API_ENDPOINTS.services}/${id}`:API_ENDPOINTS.services; const result=await apiRequest(endpoint,opts); const svcData=await apiRequest(API_ENDPOINTS.services); setServices((svcData.data||[]).map(s=>({...s,price:decimalToFloat(s.price),durationMinutes:s.durationMinutes||s.duration}))); return result; }
  async function mutateStaff(id,payload,method='PUT') { const opts={method}; if(method!=='DELETE') opts.body=JSON.stringify(payload); await apiRequest(id?`${API_ENDPOINTS.staff}/${id}`:API_ENDPOINTS.staff,opts); const staffData=await apiRequest(API_ENDPOINTS.staff); setStaff(staffData.data||[]); }
  async function mutateAvailability(id,payload,method='PUT') { const opts={method}; if(method!=='DELETE') opts.body=JSON.stringify(payload); await apiRequest(id?`${API_ENDPOINTS.availability}/${id}`:API_ENDPOINTS.availability,opts); const availData=await apiRequest(API_ENDPOINTS.availability); setAvailability(availData.data||[]); }
  async function blockClient(clientId,block) { await apiRequest(`${API_BASE_URL}/users/${clientId}`,{method:'PUT',body:JSON.stringify({isActive:!block})}); const clientData=await apiRequest(API_ENDPOINTS.clients); setClients((clientData.data||[]).filter(c=>c.role!=='admin')); }
  async function addNotification(msg) {
    try { const data=await apiRequest(API_ENDPOINTS.notifications,{method:'POST',body:JSON.stringify({message:msg,target:'staff'})}); setNotifications(prev=>[data.data,...prev]); }
    catch { setNotifications(prev=>[{id:Date.now(),message:msg,createdAt:new Date(),read:false,readAt:null},...prev]); }
  }

  const exportCSV = () => {
    const rows=[['Date','Client','Staff','Services','Status','Payment','Amount (R)'],...appointments.map(appt=>[appt.date,appt.userName||appt.clientName||'Unknown',staff.find(s=>String(s._id)===String(appt.employeeId))?.name||'—',(appt.serviceIds||[]).map(id=>services.find(s=>String(s._id)===String(id))?.name).filter(Boolean).join('; '),appt.status,appt.paymentStatus||'unpaid',(payments.find(p=>String(p.appointmentId)===String(appt._id))?.amount??0).toFixed(2)])];
    const csv=rows.map(r=>r.map(f=>`"${String(f??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download='nxl-appointments.csv'; link.click(); URL.revokeObjectURL(link.href);
  };

  const renderUnpaidPanel = () => {
    if (!unpaidAppointments.length) return null;
    return (
      <section className="panel unpaid-panel">
        <header>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}><span className="unpaid-badge-icon">⚠️</span><div><h3 style={{color:'#c53030',marginBottom:'0.15rem'}}>Unpaid Appointments — Admin Review Required</h3><p style={{color:'#718096',fontSize:'0.78rem',fontWeight:400}}>These bookings were started but payment was never completed.</p></div></div>
          <span className="unpaid-count-badge">{unpaidAppointments.length}</span>
        </header>
        <div className="table-responsive"><table>
          <thead><tr><th>Client</th><th>Date & Time</th><th>Services</th><th>Stylist</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>{unpaidAppointments.map(appt=>(
            <tr key={appt._id} className="unpaid-row">
              <td><div style={{fontWeight:600}}>{appt.userName||appt.clientName||'—'}</div>{appt.user?.email&&<div className="sub-text">{appt.user.email}</div>}</td>
              <td><div style={{fontWeight:600}}>{appt.date}</div><div className="sub-text">{appt.time}</div></td>
              <td>{(appt.serviceIds||[]).map(id=>services.find(s=>String(s._id)===String(id))?.name).filter(Boolean).join(', ')||'—'}</td>
              <td>{staff.find(s=>String(s._id)===String(appt.employeeId))?.name||appt.employee?.name||'—'}</td>
              <td><span className="age-label">{appointmentAge(appt.createdAt)}</span></td>
              <td className="row-actions">
                <button className="action-btn cancel-btn" onClick={async()=>{await mutateAppointment(appt._id,{status:'cancelled'});showToast('Appointment cancelled.');addNotification(`Cancelled unpaid appointment for ${appt.userName||'client'}`);}}>Cancel</button>
                <button className="action-btn delete-btn" disabled={deletingId===appt._id} onClick={()=>hardDeleteAppointment(appt)}>{deletingId===appt._id?'Deleting…':'🗑 Delete'}</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    );
  };

  const renderOverview = () => (<>
    <div className="grid grid-responsive">
      <StatCard label="Bookings Today"  value={reportMeta.bookingsToday}                        icon="📅" color="rose" />
      <StatCard label="Upcoming"        value={reportMeta.upcomingBookings}                     icon="⏰" color="sky" />
      <StatCard label="Revenue Today"   value={`R${reportMeta.totalRevenueToday.toFixed(2)}`}  icon="💰" color="emerald" />
      <StatCard label="Revenue (Week)"  value={`R${reportMeta.totalRevenueWeek.toFixed(2)}`}   icon="📈" color="violet" />
      <StatCard label="Revenue (Month)" value={`R${reportMeta.totalRevenueMonth.toFixed(2)}`}  icon="📊" color="amber" />
      <StatCard label="Cancellations"   value={reportMeta.cancellations}                        icon="✕"  color="slate" />
      <StatCard label="No-Shows"        value={reportMeta.noShows}                              icon="🚫" color="slate" />
      <StatCard label="Unpaid Bookings" value={reportMeta.unpaidCount} icon="💳" color={reportMeta.unpaidCount>0?'danger':'slate'} onClick={reportMeta.unpaidCount>0?()=>setActiveSection('appointments'):undefined} clickable={reportMeta.unpaidCount>0} />
    </div>
    {renderUnpaidPanel()}
    <section className="panel"><header><h3>Revenue Trend</h3><div className="button-row">{['week','month','year'].map(r=><button key={r} className={`btn ${chartRange===r?'primary':'ghost'}`} onClick={()=>setChartRange(r)}>{r.charAt(0).toUpperCase()+r.slice(1)}</button>)}</div></header><RevenueChart payments={payments} range={chartRange} /></section>
    <section className="panel"><header><h3>Bookings Trend</h3></header><BookingsChart appointments={appointments} range={chartRange} /></section>
    <section className="panel quick-actions"><h3>Quick Actions</h3><div className="action-buttons">
      <button className="btn primary" onClick={()=>setShowAppointmentModal(true)}>➕ Add Booking</button>
      <button className="btn primary" onClick={()=>setActiveSection('services')}>💅 Add Service</button>
      <button className="btn primary" onClick={()=>setShowAvailabilityModal(true)}>🚫 Block Time</button>
      {reportMeta.unpaidCount>0 && <button className="btn" style={{background:'#c53030',color:'white'}} onClick={()=>{setFilters(f=>({...f,status:'pending'}));setActiveSection('appointments');}}>⚠️ Review {reportMeta.unpaidCount} Unpaid</button>}
    </div></section>
  </>);

  const renderAppointments = () => (<>
    {renderUnpaidPanel()}
    <section className="panel filters"><h3>Filters</h3><div className="filter-grid">
      <select value={filters.staff} onChange={e=>setFilters({...filters,staff:e.target.value})}><option value="all">All Staff</option>{staff.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select>
      <select value={filters.service} onChange={e=>setFilters({...filters,service:e.target.value})}><option value="all">All Services</option>{services.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select>
      <select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="all">All Statuses</option><option value="pending">⚠️ Pending Payment</option><option value="booked">Booked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no-show">No Show</option></select>
      <input placeholder="Search client…" value={filters.client} onChange={e=>setFilters({...filters,client:e.target.value})} />
    </div></section>
    <section className="panel">
      <header><h3>Appointments <span className="count-chip">{filteredAppointments.length}</span></h3><div className="button-row">
        <button className="btn ghost" onClick={()=>{try{generateAppointmentsPDF(filteredAppointments,staff,services,payments);}catch(e){alert('PDF export failed: '+e.message);}}}>📄 PDF</button>
        <button className="btn ghost" onClick={exportCSV}>📊 CSV</button>
        <button className="btn primary" onClick={()=>setShowAppointmentModal(true)}>➕ New</button>
      </div></header>
      <div className="table-responsive"><table>
        <thead><tr><th>Date</th><th>Time</th><th>Client</th><th className="hide-mobile">Services</th><th className="hide-mobile">Staff</th><th>Status</th><th>Payment</th><th>Actions</th></tr></thead>
        <tbody>
          {filteredAppointments.map(appt=>(
            <tr key={appt._id} className={appt.paymentStatus==='unpaid'?'unpaid-row':''}>
              <td>{appt.date}</td><td>{appt.time}</td>
              <td><div style={{fontWeight:600}}>{appt.userName||appt.clientName||'—'}</div>{appt.user?.email&&<div className="sub-text">{appt.user.email}</div>}</td>
              <td className="hide-mobile">{(appt.serviceIds||[]).map(id=>services.find(s=>String(s._id)===String(id))?.name).filter(Boolean).join(', ')||'—'}</td>
              <td className="hide-mobile">{staff.find(s=>String(s._id)===String(appt.employeeId))?.name||appt.employee?.name||'—'}</td>
              <td><span className={`status ${appt.status}`}>{appt.status}</span></td>
              <td><PaymentBadge status={appt.paymentStatus||'unpaid'} /></td>
              <td className="row-actions">
                <button className="action-btn" title="Edit" onClick={()=>{setEditingAppointment(appt);setShowEditAppointmentModal(true);}}>✏️</button>
                <button className="action-btn" title="Mark Complete" onClick={()=>mutateAppointment(appt._id,{status:'completed'}).then(()=>showToast('Marked complete.'))}>✓</button>
                <button className="action-btn" title="Cancel" onClick={()=>mutateAppointment(appt._id,{status:'cancelled'}).then(()=>showToast('Appointment cancelled.'))}>✕</button>
                <button className="action-btn" title="WhatsApp Reminder" style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac'}}
                  onClick={async () => {
                    try {
                      const res = await apiRequest(`${API_ENDPOINTS.appointments}/${appt._id}/whatsapp-reminder`, { method:'POST' });
                      if (res.data?.waUrl) window.open(res.data.waUrl, '_blank');
                    } catch { showToast('Add phone number to client profile first.', 'error'); }
                  }}>💬</button>
                {(appt.paymentStatus==='unpaid'||appt.paymentStatus==='deposit_paid')&&<button className="action-btn" title="Record Payment" onClick={()=>{setSelectedAppointment(appt);setShowPaymentModal(true);}}>💳</button>}
                {appt.paymentStatus==='unpaid'&&<button className="action-btn delete-btn" title="Permanently delete" disabled={deletingId===appt._id} onClick={()=>hardDeleteAppointment(appt)}>{deletingId===appt._id?'…':'🗑'}</button>}
              </td>
            </tr>
          ))}
          {!filteredAppointments.length&&<tr><td colSpan="8" className="empty-row">No appointments match the current filters.</td></tr>}
        </tbody>
      </table></div>
    </section>
    <section className="panel calendar-panel"><header><h3>Calendar View</h3></header>
      {filteredAppointments.length>0?<AppointmentCalendar appointments={filteredAppointments} staff={staff} services={services} onSelectSlot={()=>setShowAppointmentModal(true)} onSelectEvent={ev=>console.log('Selected:',ev.resource)} />:<div className="calendar-placeholder">No appointments to display.</div>}
    </section>
  </>);

  const renderServices = () => (
    <section className="panel">
      <header><h3>Services</h3><button className="btn primary" onClick={()=>{setEditingService(null);setServiceForm({name:'',duration:'',price:'',description:'',category:''});setShowServiceForm(true);}}>+ Add Service</button></header>
      <div className="table-responsive"><table>
        <thead><tr><th>Name</th><th>Category</th><th>Duration</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {services.map(svc=>(<tr key={svc._id}>
            <td style={{fontWeight:600}}>{svc.name}</td><td>{svc.category||'Uncategorized'}</td><td>{svc.durationMinutes} min</td><td>R{decimalToFloat(svc.price).toFixed(2)}</td>
            <td><span className={`status ${svc.isActive?'booked':'cancelled'}`}>{svc.isActive?'Active':'Disabled'}</span></td>
            <td className="row-actions">
              <button className="action-btn" onClick={()=>{setEditingService(svc);setServiceForm({name:svc.name,duration:svc.durationMinutes,price:decimalToFloat(svc.price),category:svc.category||'',description:svc.description||''});setShowServiceForm(true);}}>Edit</button>
              <button className="action-btn" onClick={async()=>{try{await mutateService(svc._id,{isActive:!svc.isActive},'PUT');showToast(`Service ${svc.isActive?'disabled':'enabled'}.`);}catch(e){alert(e.message);}}}>{svc.isActive?'Disable':'Enable'}</button>
              <button className="action-btn delete-btn" onClick={async()=>{if(!window.confirm(`Delete "${svc.name}"?`))return;try{await mutateService(svc._id,{},'DELETE');showToast(`"${svc.name}" deleted.`);}catch(e){alert(e.message);}}}>Delete</button>
            </td>
          </tr>))}
          {!services.length&&<tr><td colSpan="6" className="empty-row">No services defined yet.</td></tr>}
        </tbody>
      </table></div>
      {showServiceForm&&(
        <Modal title={editingService?'Edit Service':'Add Service'} onClose={()=>{setShowServiceForm(false);setEditingService(null);}}>
          <form onSubmit={async e=>{e.preventDefault();e.stopPropagation();setIsSubmitting(true);try{const dur=Number(serviceForm.duration);const price=Number(serviceForm.price);if(dur%15!==0){alert('Duration must be a multiple of 15 minutes.');return;}if(isNaN(price)||price<0){alert('Enter a valid price.');return;}await mutateService(editingService?._id,{name:serviceForm.name,durationMinutes:dur,price,description:serviceForm.description,category:serviceForm.category,isActive:true},editingService?'PUT':'POST');setShowServiceForm(false);setEditingService(null);showToast(`Service ${editingService?'updated':'created'}.`);}catch(e){alert(e.message);}finally{setIsSubmitting(false);}}} className="form-grid">
            <input required placeholder="Service name" value={serviceForm.name} onChange={e=>setServiceForm({...serviceForm,name:e.target.value})} />
            <input placeholder="Category (e.g. Manicure)" value={serviceForm.category} onChange={e=>setServiceForm({...serviceForm,category:e.target.value})} />
            <input required type="number" min="15" step="15" placeholder="Duration (min)" value={serviceForm.duration} onChange={e=>setServiceForm({...serviceForm,duration:e.target.value})} />
            <input required type="number" min="0" step="0.01" placeholder="Price (R)" value={serviceForm.price} onChange={e=>setServiceForm({...serviceForm,price:e.target.value})} />
            <textarea placeholder="Description (optional)" value={serviceForm.description} onChange={e=>setServiceForm({...serviceForm,description:e.target.value})} />
            <footer className="modal-actions"><button type="button" onClick={()=>{setShowServiceForm(false);setEditingService(null);}}>Cancel</button><button type="submit" className="btn primary" disabled={isSubmitting}>{isSubmitting?'Saving…':'Save Service'}</button></footer>
          </form>
        </Modal>
      )}
    </section>
  );

  const renderStaff = () => (
    <section className="panel">
      <header><h3>Staff Management</h3><button className="btn primary" onClick={()=>{setEditingStaff(null);setShowStaffModal(true);}}>➕ Add Technician</button></header>
      <div className="table-responsive"><table>
        <thead><tr><th>Name</th><th>Services</th><th>Active</th><th>Workload</th><th>Actions</th></tr></thead>
        <tbody>
          {staff.map(emp=>(<tr key={emp._id}>
            <td style={{fontWeight:600}}>{emp.name}</td>
            <td>{(emp.servicesOffered||[]).map(id=>services.find(s=>String(s._id)===String(id))?.name).filter(Boolean).join(', ')||'—'}</td>
            <td><span className={`status ${emp.isActive?'booked':'cancelled'}`}>{emp.isActive?'Active':'Inactive'}</span></td>
            <td>{staffWorkload[String(emp._id)]||0} appts</td>
            <td className="row-actions">
              <button className="action-btn" onClick={()=>{setEditingStaff(emp);setShowStaffModal(true);}}>Edit</button>
              <button className="action-btn" onClick={async()=>{if(!window.confirm(`${emp.isActive?'Deactivate':'Activate'} ${emp.name}?`))return;try{await mutateStaff(emp._id,{isActive:!emp.isActive},'PUT');showToast(`${emp.name} ${emp.isActive?'deactivated':'activated'}.`);}catch(e){alert(e.message);}}}>{emp.isActive?'Deactivate':'Activate'}</button>
              <button className="action-btn delete-btn" onClick={async()=>{if(!window.confirm(`Remove ${emp.name}?`))return;try{await mutateStaff(emp._id,{},'DELETE');showToast(`${emp.name} removed.`);}catch(e){alert(e.message);}}}>Remove</button>
            </td>
          </tr>))}
          {!staff.length&&<tr><td colSpan="5" className="empty-row">No staff members yet.</td></tr>}
        </tbody>
      </table></div>
    </section>
  );

  const renderClients = () => (
    <section className="panel">
      <header><h3>Clients <span className="count-chip">{clients.length}</span></h3><input placeholder="Search clients…" value={filters.client} onChange={e=>setFilters({...filters,client:e.target.value})} style={{padding:'0.5rem 0.75rem',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'0.875rem'}} /></header>
      <div className="table-responsive"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Bookings</th><th>Last Booking</th><th>Loyalty</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {clients.filter(c=>c.email?.toLowerCase().includes(filters.client.toLowerCase())||`${c.firstName} ${c.lastName}`.toLowerCase().includes(filters.client.toLowerCase())).map(client=>{
            const stats=clientStats[String(client._id)]||{total:0,last:null}; const active=client.isActive!==false;
            return (<tr key={client._id}>
              <td style={{fontWeight:600}}>{client.firstName} {client.lastName}</td><td>{client.email}</td><td>{stats.total}</td>
              <td>{stats.last?stats.last.toISOString().split('T')[0]:'—'}</td>
              <td>
                <button
                  className="action-btn"
                  style={{fontSize:'0.72rem',background:'#fffbeb',border:'1px solid #fde68a',color:'#92400e'}}
                  onClick={async () => {
                    const pts = window.prompt(`Adjust loyalty points for ${client.firstName} ${client.lastName}\n\nEnter amount (+100 to add, -50 to deduct):`);
                    if (!pts) return;
                    const parsed = parseInt(pts, 10);
                    if (isNaN(parsed)) { showToast('Enter a valid number.', 'error'); return; }
                    const reason = window.prompt('Reason for adjustment:') || 'Admin adjustment';
                    try {
                      const token = localStorage.getItem('token');
                      const res = await fetch(`${API_BASE_URL}/loyalty/admin/adjust`, {
                        method: 'POST',
                        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
                        body: JSON.stringify({ userId: client._id, points: parsed, reason }),
                      });
                      const data = await res.json();
                      if (data.success) showToast(`Points adjusted. New balance: ${data.data.points} pts`);
                      else showToast(data.error || 'Adjustment failed.', 'error');
                    } catch { showToast('Network error.', 'error'); }
                  }}
                >⭐ Adjust Pts</button>
              </td>
              <td><span className={`status ${active?'booked':'cancelled'}`}>{active?'Active':'Blocked'}</span></td>
              <td className="row-actions">
                <button className="action-btn" onClick={()=>{addNotification(`Reminder sent to ${client.email}`);showToast('Reminder sent.');}}>Notify</button>
                <button className="action-btn" style={{background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0'}}
                  onClick={async () => {
                    if (!client.phone) { showToast('No phone number on file for this client.', 'error'); return; }
                    const msg = window.prompt(`SMS to ${client.firstName} (${client.phone}):\n\nMax 160 characters.`,
                      `Hi ${client.firstName}! This is NXL Beauty Bar. Book your next appointment at nxlbeautybar.co.za 💅`);
                    if (!msg) return;
                    try {
                      const token = localStorage.getItem('token');
                      const res = await fetch(`${API_BASE_URL}/sms/send`, {
                        method: 'POST',
                        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
                        body: JSON.stringify({ phone: client.phone, message: msg }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        showToast(data.data?.sent ? `SMS sent to ${client.phone}` : `SMS queued (wa.me fallback)`);
                        if (data.data?.waUrl) window.open(data.data.waUrl, '_blank');
                      } else showToast(data.error || 'SMS failed.', 'error');
                    } catch { showToast('Network error.', 'error'); }
                  }}>📱 SMS</button>
                <button className={`action-btn ${active?'delete-btn':''}`} onClick={()=>blockClient(client._id,active).then(()=>showToast(`Client ${active?'blocked':'unblocked'}.`))}>{active?'Block':'Unblock'}</button>
              </td>
            </tr>);
          })}
          {!clients.length&&<tr><td colSpan="7" className="empty-row">No clients registered yet.</td></tr>}
        </tbody>
      </table></div>
    </section>
  );

  const renderAvailability = () => (
    <section className="panel">
      <header><h3>Availability & Blocked Slots</h3><button className="btn primary" onClick={()=>setShowAvailabilityModal(true)}>➕ Block Time</button></header>
      <div className="table-responsive"><table>
        <thead><tr><th>Date</th><th>Time</th><th>Employee</th><th>Reason</th><th>Actions</th></tr></thead>
        <tbody>
          {availability.map(slot=>(<tr key={slot._id}>
            <td>{slot.date}</td><td>{slot.time}</td>
            <td>{slot.employeeId==='ALL'?'Salon-wide':staff.find(s=>String(s._id)===String(slot.employeeId))?.name||'—'}</td>
            <td>{slot.reason}</td>
            <td className="row-actions"><button className="action-btn delete-btn" onClick={()=>mutateAvailability(slot._id,{},'DELETE').then(()=>showToast('Slot unblocked.'))}>Remove</button></td>
          </tr>))}
          {!availability.length&&<tr><td colSpan="5" className="empty-row">No blocked time slots.</td></tr>}
        </tbody>
      </table></div>
    </section>
  );

  const renderPayments = () => (
    <section className="panel">
      <header><h3>Payments</h3><div className="button-row">
        <button className="btn ghost" onClick={exportCSV}>📊 CSV</button>
        <button className="btn ghost" onClick={()=>{try{generateRevenueReportPDF(payments,`Last ${chartRange}`);}catch(e){alert(e.message);}}}>📄 PDF</button>
      </div></header>
      <div className="table-responsive"><table>
        <thead><tr><th>Date</th><th>Amount</th><th>Type</th><th>Method</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {payments.map(pay=>(<tr key={pay._id}>
            <td>{new Date(pay.createdAt).toLocaleString()}</td><td style={{fontWeight:600}}>R{decimalToFloat(pay.amount).toFixed(2)}</td>
            <td>{pay.type||'full'}</td><td>{pay.method}</td>
            <td><span className={`status ${pay.status==='paid'?'booked':pay.status==='refunded'?'no-show':'cancelled'}`}>{pay.status}</span></td>
            <td className="row-actions">
              {pay.status==='paid'&&<button className="action-btn" title="Issue Refund" onClick={async()=>{if(!window.confirm('Refund this payment?'))return;try{await apiRequest(`${API_ENDPOINTS.payments}/${pay._id}`,{method:'PUT',body:JSON.stringify({status:'refunded'})});await loadAll();showToast('Payment refunded.');}catch(e){alert(e.message);}}}>↩️ Refund</button>}
            </td>
          </tr>))}
          {!payments.length&&<tr><td colSpan="6" className="empty-row">No payments recorded yet.</td></tr>}
        </tbody>
      </table></div>
    </section>
  );

  const renderNotifications = () => {
    const sendBroadcast = async () => {
      const title = window.prompt('Notification title (e.g. "Flash Sale Today! 🎉"):');
      if (!title) return;
      const body  = window.prompt('Message body:');
      if (!body) return;
      const link  = window.prompt('Link (optional, e.g. /shop):') || null;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/client-notifications/admin-send`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
          body: JSON.stringify({ title, body, type:'promotion', link }),
        });
        const data = await res.json();
        if (data.success) showToast(`Notification sent to ${data.data.sent} clients.`);
        else showToast(data.error || 'Failed.', 'error');
      } catch { showToast('Network error.', 'error'); }
    };

    return (
    <section className="panel">
      <header><h3>Activity Log</h3>
        <div className="button-row">
          <button className="btn ghost" style={{background:'#fff7ed',borderColor:'#fed7aa',color:'#c2410c'}}
            onClick={sendBroadcast} title="Send in-app notification to all clients">
            📢 Notify All Clients
          </button>
          <button className="btn ghost" onClick={async()=>{try{await apiRequest(API_ENDPOINTS.notifications,{method:'DELETE'});setNotifications([]);lastNotifCountRef.current=0;}catch(e){alert('Failed to clear notifications: '+e.message);}}}>Clear All</button>
        </div>
      </header>
      <ul className="notification-feed">
        {notifications.map(n=>(<li key={n._id||n.id} style={{opacity:n.read?0.7:1,fontWeight:n.read?400:600}}><span>{n.message}</span><small>{new Date(n.createdAt).toLocaleString()}</small></li>))}
        {!notifications.length&&<li className="empty-row">No activity yet.</li>}
      </ul>
    </section>
  );
  };

  const renderGallery = () => {
    const [clientPosts, setClientPosts] = useState([]);
    const [clientPostsLoading, setClientPostsLoading] = useState(false);
    const [galleryTab, setGalleryTab] = useState('admin'); // 'admin' | 'client'

    const loadClientPosts = async (status = 'pending') => {
      setClientPostsLoading(true);
      try { const data = await apiRequest(`${API_BASE_URL}/client-gallery/admin?status=${status}`); setClientPosts(data.data || []); }
      catch (e) { showToast(e.message, 'error'); }
      finally { setClientPostsLoading(false); }
    };

    const handleApprove = async (id, status) => {
      try {
        await apiRequest(`${API_BASE_URL}/client-gallery/${id}/approve`, { method:'PUT', body:JSON.stringify({ status }) });
        showToast(`Photo ${status}.`);
        loadClientPosts();
      } catch (e) { showToast(e.message, 'error'); }
    };

    return (
    <section className="panel">
      <header><h3>Gallery Management</h3>
        <div className="button-row">
          <button className={`btn ${galleryTab==='admin'?'primary':'ghost'}`} onClick={()=>setGalleryTab('admin')}>Admin Posts</button>
          <button className={`btn ${galleryTab==='client'?'primary':'ghost'}`} onClick={()=>{ setGalleryTab('client'); if(!clientPosts.length) loadClientPosts(); }}>
            Client Submissions
          </button>
        </div>
      </header>

      {galleryTab === 'client' ? (
        <div>
          <div style={{display:'flex',gap:'0.5rem',marginBottom:'1rem'}}>
            {['pending','approved','rejected','all'].map(s => (
              <button key={s} className="btn ghost" style={{fontSize:'0.78rem',textTransform:'capitalize'}} onClick={()=>loadClientPosts(s)}>{s}</button>
            ))}
          </div>
          {clientPostsLoading ? <div style={{textAlign:'center',padding:'2rem',color:'#94a3b8'}}>Loading…</div> : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'1rem'}}>
              {clientPosts.map(post => (
                <div key={post._id} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:'10px',overflow:'hidden'}}>
                  <div style={{position:'relative',aspectRatio:'1',overflow:'hidden'}}>
                    <img src={post.afterImageUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} />
                    {post.beforeImageUrl && <div style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,0.6)',color:'#fff',fontSize:'0.6rem',padding:'2px 6px',borderRadius:'4px',fontWeight:700}}>B/A</div>}
                  </div>
                  <div style={{padding:'0.75rem'}}>
                    <div style={{fontWeight:700,fontSize:'0.82rem',color:'#111'}}>{post.clientName}</div>
                    {post.caption && <div style={{fontSize:'0.72rem',color:'#6b7280',marginTop:'0.15rem',lineHeight:1.4}}>{post.caption}</div>}
                    <div style={{display:'flex',alignItems:'center',gap:'0.35rem',marginTop:'0.35rem'}}>
                      <span style={{fontSize:'0.68rem',padding:'0.15rem 0.5rem',borderRadius:'50px',fontWeight:700,background:post.status==='approved'?'#f0fdf4':post.status==='rejected'?'#fef2f2':'#fffbeb',color:post.status==='approved'?'#15803d':post.status==='rejected'?'#dc2626':'#92400e',border:`1px solid ${post.status==='approved'?'#bbf7d0':post.status==='rejected'?'#fecaca':'#fde68a'}`}}>{post.status}</span>
                    </div>
                    {post.status === 'pending' && (
                      <div style={{display:'flex',gap:'0.35rem',marginTop:'0.5rem'}}>
                        <button className="action-btn" style={{flex:1,justifyContent:'center',background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',fontSize:'0.72rem'}} onClick={()=>handleApprove(post._id,'approved')}>✓ Approve</button>
                        <button className="action-btn delete-btn" style={{flex:1,justifyContent:'center',fontSize:'0.72rem'}} onClick={()=>handleApprove(post._id,'rejected')}>✕ Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!clientPosts.length && <div style={{gridColumn:'1/-1',textAlign:'center',padding:'2rem',color:'#9ca3af',fontStyle:'italic'}}>No submissions found.</div>}
            </div>
          )}
        </div>
      ) : (
      <>
      <div style={{background:'#f9fafb',borderRadius:'10px',padding:'1.25rem',marginBottom:'1.25rem',border:'1px solid #e5e7eb'}}>
        <h4 style={{marginBottom:'0.875rem',fontSize:'0.875rem',fontWeight:700,color:'#374151'}}>➕ Add New Post</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.65rem'}}>
          <input type="file" accept="image/*,video/*" onChange={async(e)=>{const file=e.target.files[0];if(!file)return;setGalleryUploading(true);try{const formData=new FormData();formData.append('file',file);formData.append('upload_preset','NXLBEAUTYBAR');formData.append('cloud_name','djjxu9yg9');const res=await fetch(`https://api.cloudinary.com/v1_1/djjxu9yg9/auto/upload`,{method:'POST',body:formData});const data=await res.json();setGalleryForm(f=>({...f,imageUrl:data.secure_url}));showToast('File uploaded!');}catch(err){alert('Upload failed: '+err.message);}finally{setGalleryUploading(false);}}} style={{gridColumn:'1 / -1',padding:'0.6rem 0.875rem',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'0.85rem'}} />
          {galleryForm.imageUrl&&<div style={{gridColumn:'1 / -1',marginTop:'0.5rem'}}>{galleryForm.imageUrl.match(/\.(mp4|webm|mov)$/i)?<video src={galleryForm.imageUrl} style={{width:'100%',maxHeight:'200px',borderRadius:'8px'}} controls muted />:<img src={galleryForm.imageUrl} style={{width:'100%',maxHeight:'200px',objectFit:'cover',borderRadius:'8px'}} alt="preview" />}</div>}
          {galleryUploading&&<div style={{gridColumn:'1 / -1',color:'#6b7280',fontSize:'0.82rem'}}>Uploading…</div>}
          <input placeholder="Client name (e.g. Ayanda R.)" value={galleryForm.clientName} onChange={e=>setGalleryForm(f=>({...f,clientName:e.target.value}))} style={{padding:'0.6rem 0.875rem',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'0.85rem',fontFamily:'inherit'}} />
          <input placeholder="Caption (optional)" value={galleryForm.caption} onChange={e=>setGalleryForm(f=>({...f,caption:e.target.value}))} style={{padding:'0.6rem 0.875rem',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'0.85rem',fontFamily:'inherit'}} />
        </div>
        <button className="btn primary" style={{marginTop:'0.875rem'}} disabled={!galleryForm.imageUrl.trim()||isSubmitting||galleryUploading} onClick={async()=>{if(!galleryForm.imageUrl.trim())return;setIsSubmitting(true);try{await apiRequest(API_ENDPOINTS.gallery,{method:'POST',body:JSON.stringify(galleryForm)});setGalleryForm({imageUrl:'',clientName:'',caption:''});await loadGallery();showToast('Gallery post added.');await addNotification(`Admin added a gallery post for ${galleryForm.clientName||'a client'}`);}catch(e){alert(e.message);}finally{setIsSubmitting(false);}}}>{isSubmitting?'Posting…':'Post to Gallery'}</button>
      </div>
      {galleryLoading?<div style={{textAlign:'center',padding:'2rem',color:'#9ca3af'}}>Loading…</div>:(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:'1rem'}}>
          {galleryItems.map(item=>(<div key={item._id} style={{background:'#fff',borderRadius:'10px',overflow:'hidden',border:'1px solid #e5e7eb',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
            {item.imageUrl.match(/\.(mp4|webm|mov)$/i)?<video src={item.imageUrl} style={{width:'100%',height:'160px',objectFit:'cover'}} muted />:<img src={item.imageUrl} alt={item.clientName} style={{width:'100%',height:'160px',objectFit:'cover',display:'block'}} />}
            <div style={{padding:'0.75rem'}}>
              {item.clientName&&<div style={{fontWeight:700,fontSize:'0.82rem',color:'#111827'}}>{item.clientName}</div>}
              {item.caption&&<div style={{fontSize:'0.75rem',color:'#6b7280',marginTop:'0.2rem'}}>{item.caption}</div>}
              <button className="action-btn delete-btn" style={{marginTop:'0.6rem',width:'100%',justifyContent:'center'}} onClick={async()=>{if(!window.confirm('Delete this post?'))return;try{await apiRequest(`${API_ENDPOINTS.gallery}/${item._id}`,{method:'DELETE'});await loadGallery();showToast('Post deleted.');}catch(e){alert(e.message);}}}>🗑 Delete</button>
            </div>
          </div>))}
          {!galleryItems.length&&<div style={{gridColumn:'1 / -1',textAlign:'center',padding:'2rem',color:'#9ca3af',fontStyle:'italic'}}>No gallery posts yet.</div>}
        </div>
      )}
      </>
      )}
    </section>
  );
};

  const renderProducts = () => {
    const loadProducts = async () => { setShopLoading(true); try { const data = await apiRequest(API_ENDPOINTS.shopProducts); setShopProducts(data.data || []); } catch (e) { showToast(e.message, 'error'); } finally { setShopLoading(false); } };
    const handleProductImage = async (e) => { const file = e.target.files[0]; if (!file) return; setImgUploading(true); try { const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', 'NXLBEAUTYBAR'); formData.append('cloud_name', 'djjxu9yg9'); const res = await fetch('https://api.cloudinary.com/v1_1/djjxu9yg9/image/upload', { method:'POST', body:formData }); const data = await res.json(); setProductImgUrl(data.secure_url); setProductImages(prev => [...prev, data.secure_url]); showToast('Image uploaded!'); } catch { showToast('Image upload failed', 'error'); } finally { setImgUploading(false); } };
    const handleProductSubmit = async (e) => { e.preventDefault(); setIsSubmitting(true); try { const payload = { name:productForm.name, description:productForm.description, price:parseFloat(productForm.price), comparePrice:productForm.comparePrice?parseFloat(productForm.comparePrice):undefined, category:productForm.category, stock:parseInt(productForm.stock), sku:productForm.sku, brand:productForm.brand, tags:productForm.tags?productForm.tags.split(',').map(t=>t.trim()).filter(Boolean):[], isFeatured:productForm.isFeatured, isActive:productForm.isActive, images:productImages }; const method = editingProduct ? 'PUT' : 'POST'; const endpoint = editingProduct ? `${API_ENDPOINTS.shopProductsWrite}/${editingProduct._id}` : API_ENDPOINTS.shopProductsWrite; await apiRequest(endpoint, { method, body:JSON.stringify(payload) }); showToast(`Product ${editingProduct?'updated':'created'}.`); setShowProductForm(false); setEditingProduct(null); setProductImages([]); setProductImgUrl(''); loadProducts(); } catch (e) { showToast(e.message, 'error'); } finally { setIsSubmitting(false); } };
    const openEdit = (product) => { setEditingProduct(product); setProductForm({ name:product.name, description:product.description||'', price:String(product.price), comparePrice:product.comparePrice?String(product.comparePrice):'', category:product.category, stock:String(product.stock), sku:product.sku||'', brand:product.brand||'', tags:(product.tags||[]).join(', '), isFeatured:product.isFeatured||false, isActive:product.isActive!==false }); setProductImages(product.images||[]); setProductImgUrl(''); setShowProductForm(true); };
    const handleToggleActive = async (product) => { try { await apiRequest(`${API_ENDPOINTS.shopProductsWrite}/${product._id}`, { method:'PUT', body:JSON.stringify({ isActive:!product.isActive }) }); showToast(`Product ${product.isActive?'deactivated':'activated'}.`); loadProducts(); } catch (e) { showToast(e.message, 'error'); } };

    const handleStockUpdate = async (product) => {
      const input = window.prompt(`Update stock for "${product.name}"\nCurrent: ${product.stock} units\n\nNew quantity:`, String(product.stock));
      if (input === null) return;
      const qty = parseInt(input, 10);
      if (isNaN(qty) || qty < 0) { showToast('Enter a valid stock number (0 or more).', 'error'); return; }
      try {
        await apiRequest(`${API_ENDPOINTS.shopProductsWrite}/${product._id}`, { method:'PUT', body:JSON.stringify({ stock: qty }) });
        showToast(`"${product.name}" stock updated to ${qty}.`);
        loadProducts();
      } catch (e) { showToast(e.message, 'error'); }
    };

    const CATEGORIES = ['nails','hair','skincare','accessories','professional','other'];
    const CAT_EMOJI = { nails:'💅', hair:'💇‍♀️', skincare:'🌿', accessories:'💎', professional:'🛠️', other:'✨' };
    return (
      <section className="panel">
        <header><h3>Shop Products <span className="count-chip">{shopProducts.length}</span></h3><div className="button-row"><button className="btn ghost" onClick={loadProducts}>↻ Refresh</button><button className="btn primary" onClick={() => { setEditingProduct(null); setProductForm({name:'',description:'',price:'',comparePrice:'',category:'nails',stock:'',sku:'',brand:'',tags:'',isFeatured:false,isActive:true}); setProductImages([]); setProductImgUrl(''); setShowProductForm(true); }}>➕ Add Product</button></div></header>
        {shopLoading ? <div style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>Loading products…</div> : (
          <div className="table-responsive"><table>
            <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Featured</th><th>Actions</th></tr></thead>
            <tbody>
              {shopProducts.map(p => (
                <tr key={p._id} style={{opacity:p.isActive?1:0.5}}>
                  <td><div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>{p.images?.[0]?<img src={p.images[0]} alt={p.name} style={{width:42,height:42,objectFit:'cover',borderRadius:8,border:'1px solid #e2e8f0',flexShrink:0}} />:<div style={{width:42,height:42,background:'#f1f5f9',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem',flexShrink:0}}>{CAT_EMOJI[p.category]||'✨'}</div>}<div><div style={{fontWeight:600,fontSize:'0.88rem'}}>{p.name}</div>{p.brand&&<div style={{fontSize:'0.72rem',color:'#94a3b8'}}>{p.brand}</div>}</div></div></td>
                  <td style={{textTransform:'capitalize'}}>{CAT_EMOJI[p.category]} {p.category}</td>
                  <td><div style={{fontWeight:700}}>R{parseFloat(p.price).toFixed(2)}</div>{p.comparePrice&&<div style={{fontSize:'0.72rem',color:'#94a3b8',textDecoration:'line-through'}}>R{parseFloat(p.comparePrice).toFixed(2)}</div>}</td>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                      <span style={{fontWeight:700,fontSize:'1rem',color:p.stock===0?'#c53030':p.stock<=5?'#c05621':'#276749',minWidth:'28px'}}>{p.stock}</span>
                      {p.stock === 0 && <span style={{background:'#fee2e2',color:'#991b1b',fontSize:'0.62rem',fontWeight:700,padding:'0.1rem 0.4rem',borderRadius:'4px',whiteSpace:'nowrap'}}>OUT</span>}
                      {p.stock > 0 && p.stock <= 5 && <span style={{background:'#fef3c7',color:'#92400e',fontSize:'0.62rem',fontWeight:700,padding:'0.1rem 0.4rem',borderRadius:'4px',whiteSpace:'nowrap'}}>LOW</span>}
                    </div>
                  </td>
                  <td><span className={`status ${p.isActive?'booked':'cancelled'}`}>{p.isActive?'Active':'Inactive'}</span></td>
                  <td>{p.isFeatured?<span style={{color:'#d97706',fontWeight:700}}>★ Yes</span>:<span style={{color:'#94a3b8'}}>—</span>}</td>
                  <td className="row-actions">
                    <button className="action-btn" onClick={()=>openEdit(p)}>Edit</button>
                    <button className="action-btn" onClick={()=>handleStockUpdate(p)} title="Update stock" style={{fontWeight:700}}>📦 Stock</button>
                    <button className="action-btn" onClick={()=>handleToggleActive(p)}>{p.isActive?'Deactivate':'Activate'}</button>
                  </td>
                </tr>
              ))}
              {shopProducts.length===0&&<tr><td colSpan="7" className="empty-row">No products yet. Add your first product!</td></tr>}
            </tbody>
          </table></div>
        )}
        {showProductForm && (
          <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setShowProductForm(false)}>
            <div className="modal" style={{maxWidth:600,maxHeight:'90vh',overflowY:'auto'}}>
              <header><h3>{editingProduct?'Edit Product':'Add New Product'}</h3><button onClick={()=>setShowProductForm(false)}>✕</button></header>
              <form onSubmit={handleProductSubmit} className="form-grid">
                <div style={{gridColumn:'1 / -1'}}><label style={{fontSize:'0.78rem',fontWeight:600,color:'#64748b',display:'block',marginBottom:'0.4rem'}}>Product Images</label><input type="file" accept="image/*" onChange={handleProductImage} style={{marginBottom:'0.5rem',width:'100%'}} />{imgUploading&&<div style={{fontSize:'0.78rem',color:'#64748b'}}>Uploading…</div>}{productImages.length>0&&(<div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',marginTop:'0.5rem'}}>{productImages.map((url,i)=>(<div key={i} style={{position:'relative'}}><img src={url} alt="" style={{width:64,height:64,objectFit:'cover',borderRadius:8,border:'1px solid #e2e8f0'}} /><button type="button" onClick={()=>setProductImages(prev=>prev.filter((_,idx)=>idx!==i))} style={{position:'absolute',top:-6,right:-6,background:'#ef4444',border:'none',color:'#fff',borderRadius:'50%',width:18,height:18,fontSize:'0.6rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button></div>))}</div>)}</div>
                <div style={{gridColumn:'1 / -1'}}><label>Name *</label><input required placeholder="Product name" value={productForm.name} onChange={e=>setProductForm(f=>({...f,name:e.target.value}))} /></div>
                <div style={{gridColumn:'1 / -1'}}><label>Description</label><textarea rows={3} placeholder="Product description" value={productForm.description} onChange={e=>setProductForm(f=>({...f,description:e.target.value}))} /></div>
                <div><label>Price (R) *</label><input required type="number" min="0.01" step="0.01" placeholder="e.g. 250.00" value={productForm.price} onChange={e=>setProductForm(f=>({...f,price:e.target.value}))} /></div>
                <div><label>Compare Price (R)</label><input type="number" min="0" step="0.01" placeholder="Original price (optional)" value={productForm.comparePrice} onChange={e=>setProductForm(f=>({...f,comparePrice:e.target.value}))} /></div>
                <div><label>Category *</label><select required value={productForm.category} onChange={e=>setProductForm(f=>({...f,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c} value={c}>{CAT_EMOJI[c]} {c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</select></div>
                <div><label>Stock *</label><input required type="number" min="0" step="1" placeholder="e.g. 50" value={productForm.stock} onChange={e=>setProductForm(f=>({...f,stock:e.target.value}))} /></div>
                <div><label>Brand</label><input placeholder="e.g. OPI, Gelish" value={productForm.brand} onChange={e=>setProductForm(f=>({...f,brand:e.target.value}))} /></div>
                <div><label>SKU</label><input placeholder="e.g. GEL-001" value={productForm.sku} onChange={e=>setProductForm(f=>({...f,sku:e.target.value}))} /></div>
                <div style={{gridColumn:'1 / -1'}}><label>Tags (comma separated)</label><input placeholder="e.g. gel, nails, professional" value={productForm.tags} onChange={e=>setProductForm(f=>({...f,tags:e.target.value}))} /></div>
                <div style={{gridColumn:'1 / -1',display:'flex',gap:'1.5rem'}}>
                  <label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.88rem',fontWeight:500}}><input type="checkbox" checked={productForm.isFeatured} onChange={e=>setProductForm(f=>({...f,isFeatured:e.target.checked}))} />★ Featured product</label>
                  <label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.88rem',fontWeight:500}}><input type="checkbox" checked={productForm.isActive} onChange={e=>setProductForm(f=>({...f,isActive:e.target.checked}))} />Active (visible in shop)</label>
                </div>
                <footer className="modal-actions" style={{gridColumn:'1 / -1'}}><button type="button" onClick={()=>setShowProductForm(false)}>Cancel</button><button type="submit" className="btn primary" disabled={isSubmitting}>{isSubmitting?'Saving…':editingProduct?'Update Product':'Create Product'}</button></footer>
              </form>
            </div>
          </div>
        )}
      </section>
    );
  };

  // ── PATCHED: renderShopOrders — added exportOrdersCSV, fulfillment badge, ready status ──
  const renderShopOrders = () => {
    const loadOrders = async () => {
      setShopLoading(true);
      try {
        const params = orderFilter !== 'all' ? `?status=${orderFilter}` : '';
        const data   = await apiRequest(`${API_ENDPOINTS.shopOrders}${params}`);
        setShopOrders(data.data || []);
      } catch (e) { showToast(e.message, 'error'); }
      finally { setShopLoading(false); }
    };


    // ── PATCH: Export orders to CSV ──────────────────────────────────────────
    const exportOrdersCSV = async () => {
      try {
        const allData = await apiRequest(`${API_ENDPOINTS.shopOrders}?limit=1000`);
        const orders  = allData.data || [];
        const rows = [
          ['Order ID','Date','Fulfillment','Customer','Email','Phone','Items','Subtotal (R)','Shipping (R)','Total (R)','Status','Payment','Tracking','Address'],
          ...orders.map(o => [
            o._id?.slice(-6).toUpperCase(),
            new Date(o.createdAt).toLocaleDateString('en-ZA'),
            o.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery',
            `${o.customer?.firstName||''} ${o.customer?.lastName||''}`.trim() || '—',
            o.customer?.email || '—',
            o.shippingAddress?.phone || '—',
            (o.items||[]).map(i => `${i.productName} x${i.quantity}`).join('; '),
            parseFloat(o.subtotal    ||0).toFixed(2),
            parseFloat(o.shippingFee ||0).toFixed(2),
            parseFloat(o.totalAmount ||0).toFixed(2),
            o.status, o.paymentStatus,
            o.trackingNumber || '—',
            o.fulfillmentType === 'pickup' ? 'Salon Pickup' : `${o.shippingAddress?.address||''}, ${o.shippingAddress?.city||''}`,
          ]),
        ];
        const csv  = rows.map(r => r.map(f => `"${String(f??'').replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href     = URL.createObjectURL(blob);
        link.download = `nxl-shop-orders-${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Orders exported to CSV.');
      } catch (e) { showToast('Export failed: ' + e.message, 'error'); }
    };
    // ────────────────────────────────────────────────────────────────────────

    const STATUS_COLORS = {
      pending:    { bg:'#fff7ed', color:'#c2410c', border:'#fed7aa' },
      confirmed:  { bg:'#fefce8', color:'#a16207', border:'#fde047' },
      processing: { bg:'#eff6ff', color:'#1d4ed8', border:'#bfdbfe' },
      ready:      { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' }, // ← PATCH: pickup ready
      shipped:    { bg:'#f5f3ff', color:'#6d28d9', border:'#ddd6fe' },
      delivered:  { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
      cancelled:  { bg:'#f8fafc', color:'#64748b', border:'#e2e8f0' },
      refunded:   { bg:'#fef2f2', color:'#dc2626', border:'#fecaca' },
    };

    // ── PATCH: Added ready status for pickup orders ──────────────────────────
    const ORDER_TRANSITIONS = {
      pending:    ['confirmed', 'cancelled'],
      confirmed:  ['processing', 'ready', 'cancelled'],
      processing: ['shipped', 'ready', 'cancelled'],
      ready:      ['delivered'],         // pickup: ready to collect → collected
      shipped:    ['delivered'],
      delivered:  ['refunded'],
      cancelled:  [],
      refunded:   [],
    };
    // ────────────────────────────────────────────────────────────────────────

    const handleStatusChange = async (orderId, newStatus) => {
      try {
        await apiRequest(`${API_ENDPOINTS.shopOrderUpdate}/${orderId}`, {
          method: 'PUT',
          body:   JSON.stringify({ status: newStatus }),
        });
        showToast(`Order updated to ${newStatus}.`);
        loadOrders();
      } catch (e) { showToast(e.message, 'error'); }
    };

    const handleAddTracking = async (orderId) => {
      const trackingNumber = window.prompt('Enter tracking number:');
      if (!trackingNumber) return;
      try {
        await apiRequest(`${API_ENDPOINTS.shopOrderUpdate}/${orderId}`, {
          method: 'PUT',
          body:   JSON.stringify({ trackingNumber }),
        });
        showToast('Tracking number saved.');
        loadOrders();
      } catch (e) { showToast(e.message, 'error'); }
    };

    // ── PATCH: Added ready to filter options ────────────────────────────────
    const FILTER_OPTIONS = ['all','pending','confirmed','processing','ready','shipped','delivered','cancelled','refunded'];

    return (
      <section className="panel">
        <header>
          <h3>Shop Orders <span className="count-chip">{shopOrders.length}</span></h3>
          <div className="button-row">
            <select
              value={orderFilter}
              onChange={e => { setOrderFilter(e.target.value); setShopOrders([]); }}
              style={{ padding:'0.45rem 0.75rem', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'0.82rem' }}
            >
              {FILTER_OPTIONS.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Orders' : s.charAt(0).toUpperCase()+s.slice(1)}</option>
              ))}
            </select>
            <button className="btn ghost" onClick={loadOrders}>↻ Refresh</button>
            <button className="btn ghost" onClick={exportOrdersCSV}>📊 Export CSV</button>
          </div>
        </header>

        {shopLoading ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#94a3b8' }}>Loading orders…</div>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Fulfillment</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shopOrders.map(order => {
                  const sc = STATUS_COLORS[order.status] || STATUS_COLORS.pending;
                  const shortId = order._id?.slice(-6).toUpperCase();
                  const itemCount = (order.items || []).reduce((s,i) => s + i.quantity, 0);
                  const nextStatuses = ORDER_TRANSITIONS[order.status] || [];
                  const isPickup = order.fulfillmentType === 'pickup';

                  return (
                    <tr key={order._id}>
                      <td>
                        <div style={{ fontWeight:700, fontSize:'0.88rem' }}>#{shortId}</div>
                        {order.trackingNumber && (
                          <div style={{ fontSize:'0.68rem', color:'#6d28d9', fontFamily:'monospace', marginTop:2 }}>
                            📦 {order.trackingNumber}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight:600, fontSize:'0.85rem' }}>
                          {order.customer?.firstName} {order.customer?.lastName}
                        </div>
                        <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{order.customer?.email}</div>
                        {order.shippingAddress?.phone && (
                          <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{order.shippingAddress.phone}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:2, flexWrap:'wrap' }}>
                          {(order.items || []).slice(0,3).map((item,i) => (
                            item.productImage
                              ? <img key={i} src={item.productImage} alt="" style={{ width:28, height:28, objectFit:'cover', borderRadius:4, border:'1px solid #e2e8f0' }} />
                              : <div key={i} style={{ width:28, height:28, background:'#f1f5f9', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem' }}>💅</div>
                          ))}
                        </div>
                        <div style={{ fontSize:'0.72rem', color:'#94a3b8', marginTop:2 }}>{itemCount} item{itemCount !== 1 ? 's' : ''}</div>
                      </td>
                      <td style={{ fontWeight:700 }}>R{parseFloat(order.totalAmount || 0).toFixed(2)}</td>

                      {/* ── PATCH: Fulfillment badge ── */}
                      <td>
                        <span style={{
                          padding:'0.2rem 0.6rem', borderRadius:'50px', fontSize:'0.72rem', fontWeight:700, whiteSpace:'nowrap',
                          background: isPickup ? '#f0fdf4' : '#eff6ff',
                          color:      isPickup ? '#15803d' : '#1d4ed8',
                          border:     isPickup ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
                        }}>
                          {isPickup ? '🏪 Pickup' : '🚚 Delivery'}
                        </span>
                        {isPickup && <div style={{fontSize:'0.65rem',color:'#94a3b8',marginTop:2}}>Collect in salon</div>}
                        {!isPickup && order.shippingAddress?.city && <div style={{fontSize:'0.65rem',color:'#94a3b8',marginTop:2}}>{order.shippingAddress.city}</div>}
                      </td>

                      <td>
                        <span style={{ background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, padding:'0.2rem 0.6rem', borderRadius:'50px', fontSize:'0.72rem', fontWeight:700, whiteSpace:'nowrap' }}>
                          {order.status === 'ready' ? '🏪 Ready' : order.status}
                        </span>
                      </td>
                      <td>
                        <span className={`status ${order.paymentStatus === 'paid' ? 'booked' : 'cancelled'}`}>
                          {order.paymentStatus}
                        </span>
                      </td>
                      <td style={{ fontSize:'0.78rem', color:'#64748b', whiteSpace:'nowrap' }}>
                        {new Date(order.createdAt).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' })}
                      </td>
                      <td className="row-actions">
                        {nextStatuses.map(s => (
                          <button key={s} className="action-btn" style={{ fontSize:'0.72rem' }} onClick={() => handleStatusChange(order._id, s)}>
                            {s === 'ready' ? '🏪 Ready' : `→ ${s}`}
                          </button>
                        ))}
                        {['shipped','processing'].includes(order.status) && !isPickup && (
                          <button className="action-btn" style={{ fontSize:'0.72rem' }} onClick={() => handleAddTracking(order._id)}>
                            📦 Track
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {shopOrders.length === 0 && (
                  <tr><td colSpan="9" className="empty-row">No orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  const renderShopRevenue = () => {
    const loadStats = async () => { setShopStatsLoad(true); try { const data = await apiRequest(API_ENDPOINTS.shopStats); setShopStats(data.data); } catch (e) { showToast(e.message, 'error'); } finally { setShopStatsLoad(false); } };
    const buildChart = (dailyRevenue = []) => { if (!dailyRevenue.length) return []; const max = Math.max(...dailyRevenue.map(d => d.revenue), 1); return dailyRevenue.map(d => ({ date:d._id, revenue:d.revenue, orders:d.orders, pct:Math.round((d.revenue/max)*100), label:new Date(d._id+'T00:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short'}) })); };
    const chartData = buildChart(shopStats?.dailyRevenue || []);
    const STAT_CARDS = shopStats ? [
      { icon:'📦', label:'Total Products',   value:shopStats.totalProducts,   color:'#6366f1' },
      { icon:'✅', label:'Active Products',  value:shopStats.activeProducts,  color:'#10b981' },
      { icon:'⚠️', label:'Low Stock',        value:shopStats.lowStock,        color:shopStats.lowStock>0?'#ef4444':'#10b981' },
      { icon:'🛒', label:'Total Orders',     value:shopStats.totalOrders,     color:'#f59e0b' },
      { icon:'⏳', label:'Pending Orders',   value:shopStats.pendingOrders,   color:shopStats.pendingOrders>0?'#f59e0b':'#10b981' },
      { icon:'📅', label:'Orders Today',     value:shopStats.todayOrders,     color:'#3b82f6' },
      { icon:'💰', label:'Revenue (7 days)', value:`R${Number(shopStats.revenueWeek).toFixed(2)}`,  color:'#10b981' },
      { icon:'📈', label:'Revenue (30 days)',value:`R${Number(shopStats.revenueMonth).toFixed(2)}`, color:'#6366f1' },
    ] : [];
    return (
      <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>
        <section className="panel">
          <header><h3>Shop Overview</h3><div className="button-row"><button className="btn ghost" onClick={loadStats}>↻ Refresh</button></div></header>
          {shopStatsLoad ? <div style={{textAlign:'center',padding:'2rem',color:'#94a3b8'}}>Loading stats…</div> : (
            <div className="grid grid-responsive">
              {STAT_CARDS.map((c,i) => (
                <div key={i} style={{background:`linear-gradient(135deg, ${c.color}22 0%, ${c.color}11 100%)`,border:`1px solid ${c.color}44`,borderRadius:'14px',padding:'1.25rem 1.5rem',display:'flex',alignItems:'center',gap:'1rem'}}>
                  <span style={{fontSize:'1.75rem'}}>{c.icon}</span>
                  <div><p style={{margin:0,fontSize:'0.72rem',color:'#64748b',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{c.label}</p><h3 style={{margin:'0.15rem 0 0',fontSize:'1.4rem',fontWeight:800,color:c.color}}>{c.value}</h3></div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <header><h3>Daily Revenue — Last 30 Days</h3></header>
          {shopStatsLoad ? <div style={{textAlign:'center',padding:'2rem',color:'#94a3b8'}}>Loading chart…</div> : chartData.length === 0 ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>No paid orders in the last 30 days.</div>
          ) : (
            <div style={{overflowX:'auto',paddingBottom:'0.5rem'}}>
              <div style={{display:'flex',alignItems:'flex-end',gap:'6px',minWidth:`${chartData.length*36}px`,height:'200px',padding:'0 0.5rem'}}>
                {chartData.map((d,i) => (
                  <div key={i} title={`${d.label}\nRevenue: R${d.revenue.toFixed(2)}\nOrders: ${d.orders}`} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',flex:1,cursor:'default'}}>
                    <span style={{fontSize:'0.58rem',color:'#64748b',writingMode:'vertical-rl',transform:'rotate(180deg)',maxHeight:'60px',overflow:'hidden'}}>R{d.revenue>=1000?(d.revenue/1000).toFixed(1)+'k':d.revenue.toFixed(0)}</span>
                    <div style={{width:'100%',minWidth:'20px',height:`${Math.max(d.pct*1.4,4)}px`,background:d.pct>60?'linear-gradient(180deg, #6366f1, #4f46e5)':'linear-gradient(180deg, #818cf8, #6366f1)',borderRadius:'4px 4px 0 0',transition:'height 0.3s ease',boxShadow:'0 2px 8px rgba(99,102,241,0.3)'}} />
                    <span style={{fontSize:'0.56rem',color:'#94a3b8',transform:'rotate(-45deg)',transformOrigin:'top left',whiteSpace:'nowrap',marginTop:'8px'}}>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <header><h3>Top Selling Products</h3></header>
          {shopStatsLoad ? <div style={{textAlign:'center',padding:'2rem',color:'#94a3b8'}}>Loading…</div> : !shopStats?.topProducts?.length ? (
            <div style={{textAlign:'center',padding:'2rem',color:'#94a3b8'}}>No sales data yet.</div>
          ) : (
            <div className="table-responsive"><table>
              <thead><tr><th>#</th><th>Product</th><th>Units Sold</th><th>Revenue</th><th>Share</th></tr></thead>
              <tbody>
                {shopStats.topProducts.map((p,i) => { const maxSold=shopStats.topProducts[0]?.sold||1; const pct=Math.round((p.sold/maxSold)*100); return (
                  <tr key={i}>
                    <td style={{fontWeight:700,color:i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#c97c2e':'#64748b'}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</td>
                    <td style={{fontWeight:600}}>{p.name}</td>
                    <td style={{fontWeight:700}}>{p.sold}</td>
                    <td style={{fontWeight:700,color:'#10b981'}}>R{Number(p.revenue).toFixed(2)}</td>
                    <td style={{minWidth:'120px'}}><div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}><div style={{flex:1,height:'6px',background:'#f1f5f9',borderRadius:'3px',overflow:'hidden'}}><div style={{width:`${pct}%`,height:'100%',background:'linear-gradient(90deg, #6366f1, #818cf8)',borderRadius:'3px',transition:'width 0.4s'}} /></div><span style={{fontSize:'0.72rem',color:'#64748b',minWidth:'30px'}}>{pct}%</span></div></td>
                  </tr>
                ); })}
              </tbody>
            </table></div>
          )}
        </section>
        {shopStats?.lowStock > 0 && (
          <section className="panel" style={{border:'1.5px solid #fca5a5'}}>
            <header><h3 style={{color:'#dc2626'}}>⚠️ Low Stock Alert</h3><button className="btn ghost" onClick={()=>setActiveSection('shop-products')}>View Products →</button></header>
            <p style={{color:'#64748b',fontSize:'0.85rem',margin:0}}>{shopStats.lowStock} product{shopStats.lowStock>1?'s are':' is'} running low (5 or fewer units remaining). Restock soon to avoid stockouts.</p>
          </section>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (activeSection === 'subscriptions' && !subStats && !subLoading) {
      setSubLoading(true);
      Promise.all([
        apiRequest(`${API_BASE_URL}/subscription-plans`),
        apiRequest(`${API_BASE_URL}/subscriptions/admin?limit=50`),
      ]).then(([plans, subs]) => {
        setSubPlans(plans.data || []);
        setSubscriptions(subs.data || []);
        setSubStats(subs.stats);
      }).catch(e => showToast(e.message, 'error'))
        .finally(() => setSubLoading(false));
    }
  }, [activeSection]);

  const renderSubscriptions = () => {
    const loadSubs = async () => {
      setSubLoading(true);
      try {
        const [plans, subs] = await Promise.all([
          apiRequest(`${API_BASE_URL}/subscription-plans`),
          apiRequest(`${API_BASE_URL}/subscriptions/admin?limit=50`),
        ]);
        setSubPlans(plans.data || []);
        setSubscriptions(subs.data || []);
        setSubStats(subs.stats);
      } catch (e) { showToast(e.message, 'error'); }
      finally { setSubLoading(false); }
    };

    const handleCreatePlan = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
        const features = planForm.features.split('\n').map(f => f.trim()).filter(Boolean);
        await apiRequest(`${API_BASE_URL}/subscription-plans`, {
          method: 'POST',
          body: JSON.stringify({ ...planForm, price: parseFloat(planForm.price), bookingsPerMonth: parseInt(planForm.bookingsPerMonth), discountPct: parseInt(planForm.discountPct || '0'), features, sortOrder: parseInt(planForm.sortOrder || '0') }),
        });
        showToast('Plan created.');
        setShowPlanForm(false);
        setPlanForm({ name:'', description:'', price:'', bookingsPerMonth:'', discountPct:'', features:'', color:'#6366f1', isPopular:false, sortOrder:'0' });
        loadSubs();
      } catch (e) { showToast(e.message, 'error'); }
      finally { setIsSubmitting(false); }
    };

    const STATUS_STYLE = {
      active:          { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
      cancelled:       { bg:'#f8fafc', color:'#64748b', border:'#e2e8f0' },
      pending_payment: { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
      past_due:        { bg:'#fef2f2', color:'#dc2626', border:'#fecaca' },
    };

    return (
      <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>

        {/* MRR stats */}
        {subStats && (
          <section className="panel">
            <header><h3>💅 Subscription Overview</h3><div className="button-row">
              <button className="btn ghost" onClick={loadSubs}>↻ Refresh</button>
              <button className="btn primary" onClick={() => setShowPlanForm(true)}>➕ Create Plan</button>
            </div></header>
            <div className="grid grid-responsive">
              {[
                {icon:'👥',label:'Active Subscribers',value:subStats.active,color:'#10b981'},
                {icon:'💰',label:'Monthly Revenue (MRR)',value:`R${Number(subStats.mrr).toFixed(0)}`,color:'#6366f1'},
                {icon:'📋',label:'Total Subscriptions',value:subStats.total,color:'#3b82f6'},
                {icon:'❌',label:'Cancelled',value:subStats.cancelled,color:subStats.cancelled>0?'#ef4444':'#94a3b8'},
              ].map((c,i) => (
                <div key={i} style={{background:`linear-gradient(135deg,${c.color}22,${c.color}11)`,border:`1px solid ${c.color}44`,borderRadius:'14px',padding:'1.25rem 1.5rem',display:'flex',alignItems:'center',gap:'1rem'}}>
                  <span style={{fontSize:'1.75rem'}}>{c.icon}</span>
                  <div><p style={{margin:0,fontSize:'0.72rem',color:'#64748b',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{c.label}</p><h3 style={{margin:'0.1rem 0 0',fontSize:'1.4rem',fontWeight:800,color:c.color}}>{c.value}</h3></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Plans list */}
        <section className="panel">
          <header><h3>Plans <span className="count-chip">{subPlans.length}</span></h3></header>
          {subLoading ? <div style={{textAlign:'center',padding:'2rem',color:'#94a3b8'}}>Loading…</div> : (
            <div className="table-responsive"><table>
              <thead><tr><th>Name</th><th>Price</th><th>Bookings/mo</th><th>Discount</th><th>Subscribers</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {subPlans.map(p => (
                  <tr key={p._id}>
                    <td><div style={{fontWeight:700}}>{p.name}{p.isPopular&&<span style={{marginLeft:6,fontSize:'0.68rem',background:'#eef2ff',color:'#4f46e5',padding:'0.1rem 0.4rem',borderRadius:4,fontWeight:700}}>Popular</span>}</div></td>
                    <td style={{fontWeight:700}}>R{parseFloat(p.price||0).toFixed(0)}/mo</td>
                    <td>{p.bookingsPerMonth}</td>
                    <td>{p.discountPct > 0 ? `${p.discountPct}%` : '—'}</td>
                    <td><span style={{fontWeight:700,color:'#10b981'}}>{p.subscriberCount||0}</span></td>
                    <td><span className={`status ${p.isActive?'booked':'cancelled'}`}>{p.isActive?'Active':'Inactive'}</span></td>
                    <td className="row-actions">
                      <button className="action-btn" onClick={async()=>{await apiRequest(`${API_BASE_URL}/subscription-plans/${p._id}`,{method:'PUT',body:JSON.stringify({isActive:!p.isActive})});showToast(`Plan ${p.isActive?'deactivated':'activated'}.`);loadSubs();}}>{p.isActive?'Deactivate':'Activate'}</button>
                      <button className="action-btn delete-btn" onClick={async()=>{if(!window.confirm(`Delete "${p.name}"?`))return;try{await apiRequest(`${API_BASE_URL}/subscription-plans/${p._id}`,{method:'DELETE'});showToast('Plan deleted.');loadSubs();}catch(e){showToast(e.message,'error');}}} >Delete</button>
                    </td>
                  </tr>
                ))}
                {!subPlans.length&&<tr><td colSpan="7" className="empty-row">No plans yet. Create your first plan!</td></tr>}
              </tbody>
            </table></div>
          )}
        </section>

        {/* Subscribers list */}
        <section className="panel">
          <header><h3>Subscribers <span className="count-chip">{subscriptions.length}</span></h3></header>
          <div className="table-responsive"><table>
            <thead><tr><th>Client</th><th>Plan</th><th>Credits Left</th><th>Renews</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {subscriptions.map(sub => {
                const ss = STATUS_STYLE[sub.status] || STATUS_STYLE.cancelled;
                return (
                  <tr key={sub._id}>
                    <td><div style={{fontWeight:600}}>{sub.user?`${sub.user.firstName} ${sub.user.lastName}`:'—'}</div><div style={{fontSize:'0.72rem',color:'#94a3b8'}}>{sub.user?.email}</div></td>
                    <td style={{fontWeight:600}}>{sub.planName}</td>
                    <td><span style={{fontWeight:700,color:sub.bookingsRemaining===0?'#ef4444':'#10b981'}}>{sub.bookingsRemaining}</span> / {sub.bookingsPerMonth}</td>
                    <td style={{fontSize:'0.8rem',color:'#64748b'}}>{sub.renewalDate?new Date(sub.renewalDate).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}):'—'}</td>
                    <td><span style={{background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,padding:'0.2rem 0.6rem',borderRadius:'50px',fontSize:'0.72rem',fontWeight:700}}>{sub.status.replace('_',' ')}</span></td>
                    <td className="row-actions">
                      {sub.status==='active'&&<button className="action-btn delete-btn" style={{fontSize:'0.72rem'}} onClick={async()=>{if(!window.confirm(`Cancel ${sub.user?.firstName}'s subscription?`))return;await apiRequest(`${API_BASE_URL}/subscriptions/${sub._id}/cancel`,{method:'POST'});showToast('Subscription cancelled.');loadSubs();}}>Cancel</button>}
                    </td>
                  </tr>
                );
              })}
              {!subscriptions.length&&<tr><td colSpan="6" className="empty-row">No subscriptions yet.</td></tr>}
            </tbody>
          </table></div>
        </section>

        {/* Create plan modal */}
        {showPlanForm && (
          <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setShowPlanForm(false)}>
            <div className="modal" style={{maxWidth:560,maxHeight:'90vh',overflowY:'auto'}}>
              <header><h3>➕ Create Subscription Plan</h3><button onClick={()=>setShowPlanForm(false)}>✕</button></header>
              <form onSubmit={handleCreatePlan} className="form-grid">
                <div style={{gridColumn:'1/-1'}}><label>Plan Name *</label><input required placeholder="e.g. Basic Plan" value={planForm.name} onChange={e=>setPlanForm(f=>({...f,name:e.target.value}))} /></div>
                <div style={{gridColumn:'1/-1'}}><label>Description</label><input placeholder="Short description of the plan" value={planForm.description} onChange={e=>setPlanForm(f=>({...f,description:e.target.value}))} /></div>
                <div><label>Monthly Price (R) *</label><input required type="number" min="0.01" step="0.01" placeholder="e.g. 299" value={planForm.price} onChange={e=>setPlanForm(f=>({...f,price:e.target.value}))} /></div>
                <div><label>Bookings per Month *</label><input required type="number" min="1" step="1" placeholder="e.g. 2" value={planForm.bookingsPerMonth} onChange={e=>setPlanForm(f=>({...f,bookingsPerMonth:e.target.value}))} /></div>
                <div><label>Service Discount (%)</label><input type="number" min="0" max="100" step="1" placeholder="e.g. 10" value={planForm.discountPct} onChange={e=>setPlanForm(f=>({...f,discountPct:e.target.value}))} /></div>
                <div><label>Accent Color</label><input type="color" value={planForm.color} onChange={e=>setPlanForm(f=>({...f,color:e.target.value}))} style={{padding:'0.25rem',height:'42px',width:'100%',borderRadius:8,border:'1px solid #e2e8f0',cursor:'pointer'}} /></div>
                <div style={{gridColumn:'1/-1'}}><label>Extra Features (one per line)</label><textarea rows={4} placeholder="e.g. Free nail art design&#10;Priority WhatsApp booking&#10;10% off nail products" value={planForm.features} onChange={e=>setPlanForm(f=>({...f,features:e.target.value}))} /></div>
                <div style={{gridColumn:'1/-1',display:'flex',gap:'1.5rem'}}>
                  <label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.88rem',fontWeight:500}}><input type="checkbox" checked={planForm.isPopular} onChange={e=>setPlanForm(f=>({...f,isPopular:e.target.checked}))} />⭐ Mark as Most Popular</label>
                </div>
                <footer className="modal-actions" style={{gridColumn:'1/-1'}}><button type="button" onClick={()=>setShowPlanForm(false)}>Cancel</button><button type="submit" className="btn primary" disabled={isSubmitting}>{isSubmitting?'Creating…':'Create Plan'}</button></footer>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAnalytics = () => {
    const d = analyticsData;

    // Mini bar chart helper
    const MiniBar = ({ items, valueKey = 'count', labelKey = 'name', color = '#6366f1', maxItems = 8 }) => {
      if (!items?.length) return <div style={{color:'#94a3b8',fontSize:'0.82rem',padding:'1rem 0'}}>No data yet.</div>;
      const top = items.slice(0, maxItems);
      const max = Math.max(...top.map(i => i[valueKey] || 0), 1);
      return (
        <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
          {top.map((item, i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
              <span style={{fontSize:'0.72rem',color:'#64748b',minWidth:'100px',maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:0}}>{item[labelKey] || '—'}</span>
              <div style={{flex:1,height:'20px',background:'#f1f5f9',borderRadius:'4px',overflow:'hidden'}}>
                <div style={{height:'100%',width:`${Math.round((item[valueKey]/max)*100)}%`,background:color,borderRadius:'4px',transition:'width 0.4s',display:'flex',alignItems:'center',paddingLeft:'6px'}}>
                  {(item[valueKey]/max) > 0.2 && <span style={{fontSize:'0.65rem',color:'#fff',fontWeight:700}}>{item[valueKey]}</span>}
                </div>
              </div>
              {(item[valueKey]/max) <= 0.2 && <span style={{fontSize:'0.65rem',color:'#64748b',minWidth:'24px'}}>{item[valueKey]}</span>}
            </div>
          ))}
        </div>
      );
    };

    // Line/bar spark chart for daily data
    const SparkChart = ({ data: chartData = [], valueKey = 'count', color = '#6366f1', height = 80 }) => {
      if (!chartData.length) return null;
      const max = Math.max(...chartData.map(d => d[valueKey] || 0), 1);
      const w = 600; const h = height;
      const barW = Math.max(2, Math.floor(w / chartData.length) - 2);
      return (
        <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%',height:h}}>
          {chartData.map((d, i) => {
            const barH = Math.max(2, Math.round((d[valueKey] / max) * (h - 10)));
            const x = Math.round((i / chartData.length) * w);
            return (
              <g key={i}>
                <rect x={x} y={h - barH} width={barW} height={barH} fill={color} rx={2} opacity={0.85} />
                <title>{d._id}: {d[valueKey]}</title>
              </g>
            );
          })}
        </svg>
      );
    };

    const statCard = (icon, label, value, sub, color = '#6366f1') => (
      <div style={{background:`linear-gradient(135deg,${color}22,${color}11)`,border:`1px solid ${color}44`,borderRadius:'14px',padding:'1.25rem 1.5rem',display:'flex',alignItems:'center',gap:'1rem'}}>
        <span style={{fontSize:'1.75rem'}}>{icon}</span>
        <div>
          <p style={{margin:0,fontSize:'0.72rem',color:'#64748b',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</p>
          <h3 style={{margin:'0.1rem 0 0',fontSize:'1.35rem',fontWeight:800,color}}>{value}</h3>
          {sub && <p style={{margin:'0.1rem 0 0',fontSize:'0.7rem',color:'#94a3b8'}}>{sub}</p>}
        </div>
      </div>
    );

    return (
      <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>

        {/* Range selector */}
        <section className="panel">
          <header>
            <h3>📊 Business Analytics</h3>
            <div className="button-row">
              {[['7','7 days'],['30','30 days'],['90','90 days'],['365','1 year']].map(([val, label]) => (
                <button key={val} className={`btn ${analyticsRange===val?'primary':'ghost'}`}
                  onClick={() => { setAnalyticsRange(val); setAnalyticsData(null); loadAnalytics(val); }}>
                  {label}
                </button>
              ))}
              <button className="btn ghost" onClick={() => loadAnalytics(analyticsRange)}>↻ Refresh</button>
            </div>
          </header>

          {analyticsLoad ? (
            <div style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>Loading analytics…</div>
          ) : !d ? null : (
            <>
              {/* KPI row */}
              <div className="grid grid-responsive" style={{marginBottom:'1.5rem'}}>
                {statCard('💰', 'Combined Revenue', `R${Number(d.revenue.combined).toFixed(0)}`, `Last ${d.range} days`, '#10b981')}
                {statCard('📅', 'Bookings', d.bookings.period, `${d.bookings.today} today`, '#3b82f6')}
                {statCard('🛒', 'Shop Orders', d.shop.orders, `R${Number(d.shop.revenue).toFixed(0)} revenue`, '#f59e0b')}
                {statCard('👥', 'Total Clients', d.clients.total, `+${d.clients.newInPeriod} new`, '#8b5cf6')}
                {statCard('✅', 'Completion Rate', `${d.bookings.completionRate}%`, `${d.bookings.cancellationRate}% cancelled`, '#10b981')}
                {statCard('⭐', 'Loyalty Members', d.loyalty.members, `Avg ${d.loyalty.avgPoints} pts`, '#f59e0b')}
              </div>

              {/* Charts row */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem'}}>
                {/* Daily bookings spark */}
                <div style={{background:'#f8fafc',borderRadius:'12px',padding:'1.25rem',border:'1px solid #e2e8f0'}}>
                  <p style={{margin:'0 0 0.75rem',fontWeight:700,fontSize:'0.88rem',color:'#1e293b'}}>Daily Bookings</p>
                  <SparkChart data={d.bookings.daily} valueKey="count" color="#3b82f6" height={80} />
                  <p style={{margin:'0.5rem 0 0',fontSize:'0.72rem',color:'#94a3b8'}}>{d.bookings.period} bookings in last {d.range} days</p>
                </div>

                {/* Daily revenue spark */}
                <div style={{background:'#f8fafc',borderRadius:'12px',padding:'1.25rem',border:'1px solid #e2e8f0'}}>
                  <p style={{margin:'0 0 0.75rem',fontWeight:700,fontSize:'0.88rem',color:'#1e293b'}}>Daily Revenue (Bookings)</p>
                  <SparkChart data={d.revenue.daily} valueKey="revenue" color="#10b981" height={80} />
                  <p style={{margin:'0.5rem 0 0',fontSize:'0.72rem',color:'#94a3b8'}}>R{Number(d.revenue.period).toFixed(0)} in last {d.range} days</p>
                </div>
              </div>
            </>
          )}
        </section>

        {!analyticsLoad && d && (
          <>
            {/* Services + Staff */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem'}}>
              <section className="panel">
                <header><h3>Top Services</h3></header>
                <MiniBar items={d.bookings.byService} valueKey="count" labelKey="name" color="#6366f1" />
              </section>
              <section className="panel">
                <header><h3>Staff Bookings</h3></header>
                <MiniBar items={d.bookings.byStaff} valueKey="count" labelKey="name" color="#f59e0b" />
              </section>
            </div>

            {/* Booking status + payment methods */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem'}}>
              <section className="panel">
                <header><h3>Booking Status Breakdown</h3></header>
                <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                  {d.bookings.byStatus.map((s,i) => {
                    const colors = { booked:'#3b82f6', completed:'#10b981', cancelled:'#ef4444', pending:'#f59e0b', 'no-show':'#64748b' };
                    const col = colors[s._id] || '#94a3b8';
                    const pct = d.bookings.total > 0 ? Math.round((s.count/d.bookings.total)*100) : 0;
                    return (
                      <div key={i} style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                        <span style={{width:'80px',fontSize:'0.75rem',color:'#374151',textTransform:'capitalize',flexShrink:0}}>{s._id}</span>
                        <div style={{flex:1,height:'18px',background:'#f1f5f9',borderRadius:'4px',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:col,borderRadius:'4px'}} />
                        </div>
                        <span style={{fontSize:'0.72rem',color:'#64748b',minWidth:'50px',textAlign:'right'}}>{s.count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="panel">
                <header><h3>Revenue by Payment Method</h3></header>
                <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                  {d.revenue.byMethod.map((m,i) => {
                    const colors = { cash:'#10b981', card:'#3b82f6', online:'#8b5cf6', yoco:'#f59e0b' };
                    const col = colors[m._id] || '#94a3b8';
                    const maxVal = Math.max(...d.revenue.byMethod.map(x => x.total), 1);
                    const pct = Math.round((m.total/maxVal)*100);
                    return (
                      <div key={i} style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                        <span style={{width:'60px',fontSize:'0.75rem',color:'#374151',textTransform:'capitalize',flexShrink:0}}>{m._id}</span>
                        <div style={{flex:1,height:'18px',background:'#f1f5f9',borderRadius:'4px',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:col,borderRadius:'4px'}} />
                        </div>
                        <span style={{fontSize:'0.72rem',color:'#64748b',minWidth:'70px',textAlign:'right'}}>R{Number(m.total).toFixed(0)} ({m.count})</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Top clients */}
            <section className="panel">
              <header><h3>Top Clients by Bookings</h3></header>
              <div className="table-responsive"><table>
                <thead><tr><th>#</th><th>Client</th><th>Email</th><th>Bookings</th></tr></thead>
                <tbody>
                  {d.clients.top.map((c, i) => (
                    <tr key={i}>
                      <td style={{fontWeight:700,color:i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#c97c2e':'#64748b'}}>
                        {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
                      </td>
                      <td style={{fontWeight:600}}>{c.user ? `${c.user.firstName} ${c.user.lastName}` : '—'}</td>
                      <td style={{color:'#94a3b8',fontSize:'0.82rem'}}>{c.user?.email || '—'}</td>
                      <td style={{fontWeight:700}}>{c.bookings}</td>
                    </tr>
                  ))}
                  {!d.clients.top.length && <tr><td colSpan="4" className="empty-row">No data yet.</td></tr>}
                </tbody>
              </table></div>
            </section>

            {/* Referral config card */}
            <section className="panel">
              <header><h3>🎁 Referral Program Config</h3></header>
              <div className="grid grid-responsive">
                {[
                  {icon:'👥',label:'Referrer reward (1st booking)',value:'+200 pts',color:'#6366f1'},
                  {icon:'🎁',label:'Friend welcome discount',value:'R50 off 1st order',color:'#10b981'},
                  {icon:'⭐',label:'Signup bonus (referrer)',value:'+50 pts',color:'#f59e0b'},
                ].map((c,i) => (
                  <div key={i} style={{background:`linear-gradient(135deg,${c.color}22,${c.color}11)`,border:`1px solid ${c.color}44`,borderRadius:'12px',padding:'1rem',display:'flex',alignItems:'center',gap:'0.75rem'}}>
                    <span style={{fontSize:'1.5rem'}}>{c.icon}</span>
                    <div><p style={{margin:0,fontSize:'0.68rem',color:'#64748b',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{c.label}</p><h3 style={{margin:'0.1rem 0 0',fontSize:'1rem',fontWeight:800,color:c.color}}>{c.value}</h3></div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    );
  };

  const renderInventory = () => {
    const loadInventory = async () => {
      setInvLoading(true);
      try {
        const [inv, hist, sups] = await Promise.all([
          apiRequest(`${API_BASE_URL}/inventory`),
          apiRequest(`${API_BASE_URL}/inventory/history?limit=30`),
          apiRequest(`${API_BASE_URL}/suppliers`),
        ]);
        setInventory(inv.data);
        setInvHistory(hist.data || []);
        setSuppliers(sups.data || []);
      } catch (e) { showToast(e.message, 'error'); }
      finally { setInvLoading(false); }
    };

    const handleRestock = async (e) => {
      e.preventDefault();
      if (!restockForm.productId || !restockForm.quantity || !restockForm.costPerUnit) {
        showToast('Product, quantity and cost are required.', 'error'); return;
      }
      setIsSubmitting(true);
      try {
        await apiRequest(`${API_BASE_URL}/inventory/restock`, { method:'POST', body:JSON.stringify({
          ...restockForm, quantity:parseInt(restockForm.quantity), costPerUnit:parseFloat(restockForm.costPerUnit),
        })});
        showToast('Stock updated successfully.');
        setShowRestock(false);
        setRestockForm({ productId:'', quantity:'', costPerUnit:'', supplier:'', invoiceRef:'', notes:'' });
        setInventory(null); // force reload
        loadInventory();
      } catch (e) { showToast(e.message, 'error'); }
      finally { setIsSubmitting(false); }
    };

    const stats = inventory?.stats;
    const products = inventory?.products || [];
    const STATUS_STYLE = { ok:{bg:'#f0fdf4',color:'#15803d',border:'#bbf7d0',label:'✅ OK'}, low:{bg:'#fffbeb',color:'#92400e',border:'#fde68a',label:'⚠️ Low'}, out:{bg:'#fef2f2',color:'#dc2626',border:'#fecaca',label:'🔴 Out'} };

    return (
      <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>

        {/* Stats */}
        {stats && (
          <section className="panel">
            <header><h3>📦 Inventory Overview</h3><div className="button-row">
              <button className="btn ghost" onClick={loadInventory}>↻ Refresh</button>
              <button className="btn primary" onClick={() => setShowRestock(true)}>➕ Record Restock</button>
            </div></header>
            <div className="grid grid-responsive">
              {[
                {icon:'📦',label:'Total Products',value:stats.total,color:'#6366f1'},
                {icon:'✅',label:'In Stock',value:stats.ok,color:'#10b981'},
                {icon:'⚠️',label:'Low Stock',value:stats.low,color:stats.low>0?'#f59e0b':'#10b981'},
                {icon:'🔴',label:'Out of Stock',value:stats.out,color:stats.out>0?'#ef4444':'#10b981'},
                {icon:'💰',label:'Inventory Value',value:`R${stats.totalValue.toFixed(0)}`,color:'#8b5cf6'},
              ].map((c,i) => (
                <div key={i} style={{background:`linear-gradient(135deg,${c.color}22,${c.color}11)`,border:`1px solid ${c.color}44`,borderRadius:'14px',padding:'1.25rem 1.5rem',display:'flex',alignItems:'center',gap:'1rem'}}>
                  <span style={{fontSize:'1.75rem'}}>{c.icon}</span>
                  <div><p style={{margin:0,fontSize:'0.72rem',color:'#64748b',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{c.label}</p><h3 style={{margin:'0.1rem 0 0',fontSize:'1.35rem',fontWeight:800,color:c.color}}>{c.value}</h3></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Products table */}
        <section className="panel">
          <header><h3>Stock Levels</h3></header>
          {invLoading ? <div style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>Loading…</div> : (
            <div className="table-responsive"><table>
              <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {products.map(p => {
                  const ss = STATUS_STYLE[p.stockStatus] || STATUS_STYLE.ok;
                  return (
                    <tr key={p._id} style={{opacity:p.stock===0?0.7:1}}>
                      <td><div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                        {p.images?.[0] ? <img src={p.images[0]} alt="" style={{width:36,height:36,objectFit:'cover',borderRadius:6,border:'1px solid #e2e8f0',flexShrink:0}} /> : <div style={{width:36,height:36,background:'#f1f5f9',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem'}}>💅</div>}
                        <span style={{fontWeight:600,fontSize:'0.88rem'}}>{p.name}</span>
                      </div></td>
                      <td style={{fontFamily:'monospace',fontSize:'0.8rem',color:'#94a3b8'}}>{p.sku||'—'}</td>
                      <td style={{textTransform:'capitalize'}}>{p.category}</td>
                      <td><span style={{fontWeight:800,fontSize:'1rem',color:p.stock===0?'#dc2626':p.stock<=5?'#92400e':'#15803d'}}>{p.stock}</span></td>
                      <td><span style={{background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,padding:'0.2rem 0.6rem',borderRadius:'50px',fontSize:'0.72rem',fontWeight:700}}>{ss.label}</span></td>
                      <td className="row-actions">
                        <button className="action-btn" style={{background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0'}}
                          onClick={() => { setRestockForm(f=>({...f,productId:p._id.toString()})); setShowRestock(true); }}>
                          📦 Restock
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!products.length && <tr><td colSpan="6" className="empty-row">No products found.</td></tr>}
              </tbody>
            </table></div>
          )}
        </section>

        {/* Restock history */}
        <section className="panel">
          <header><h3>Restock History</h3><button className="btn ghost" onClick={() => apiRequest(`${API_BASE_URL}/inventory/history`).then(d => setInvHistory(d.data||[]))}>↻</button></header>
          <div className="table-responsive"><table>
            <thead><tr><th>Date</th><th>Product</th><th>Qty Added</th><th>Cost/Unit</th><th>Total Cost</th><th>Invoice</th><th>Supplier</th></tr></thead>
            <tbody>
              {invHistory.map(h => (
                <tr key={h._id}>
                  <td style={{color:'#94a3b8',fontSize:'0.8rem',whiteSpace:'nowrap'}}>{new Date(h.createdAt).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}</td>
                  <td style={{fontWeight:600}}>{h.productName}</td>
                  <td><span style={{color:'#15803d',fontWeight:700}}>+{h.quantity}</span></td>
                  <td>R{h.costPerUnit?.toFixed(2)}</td>
                  <td style={{fontWeight:700}}>R{h.totalCost?.toFixed(2)}</td>
                  <td style={{fontFamily:'monospace',fontSize:'0.8rem',color:'#64748b'}}>{h.invoiceRef||'—'}</td>
                  <td>{h.supplier||'—'}</td>
                </tr>
              ))}
              {!invHistory.length && <tr><td colSpan="7" className="empty-row">No restock records yet.</td></tr>}
            </tbody>
          </table></div>
        </section>

        {/* Restock modal */}
        {showRestock && (
          <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setShowRestock(false)}>
            <div className="modal" style={{maxWidth:520}}>
              <header><h3>📦 Record Restock</h3><button onClick={()=>setShowRestock(false)}>✕</button></header>
              <form onSubmit={handleRestock} className="form-grid">
                <div style={{gridColumn:'1/-1'}}><label>Product *</label>
                  <select value={restockForm.productId} onChange={e=>setRestockForm(f=>({...f,productId:e.target.value}))} required>
                    <option value="">— Select product —</option>
                    {(inventory?.products||[]).map(p=><option key={p._id} value={p._id}>{p.name} (stock: {p.stock})</option>)}
                  </select>
                </div>
                <div><label>Quantity Added *</label><input required type="number" min="1" step="1" placeholder="e.g. 50" value={restockForm.quantity} onChange={e=>setRestockForm(f=>({...f,quantity:e.target.value}))} /></div>
                <div><label>Cost Per Unit (R) *</label><input required type="number" min="0" step="0.01" placeholder="e.g. 45.00" value={restockForm.costPerUnit} onChange={e=>setRestockForm(f=>({...f,costPerUnit:e.target.value}))} /></div>
                <div><label>Supplier</label>
                  <select value={restockForm.supplier} onChange={e=>setRestockForm(f=>({...f,supplier:e.target.value}))}>
                    <option value="">— Select or type below —</option>
                    {suppliers.map(s=><option key={s._id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div><label>Invoice Ref</label><input placeholder="e.g. INV-2025-001" value={restockForm.invoiceRef} onChange={e=>setRestockForm(f=>({...f,invoiceRef:e.target.value}))} /></div>
                <div style={{gridColumn:'1/-1'}}><label>Notes</label><textarea rows={2} placeholder="Optional notes" value={restockForm.notes} onChange={e=>setRestockForm(f=>({...f,notes:e.target.value}))} /></div>
                <footer className="modal-actions" style={{gridColumn:'1/-1'}}><button type="button" onClick={()=>setShowRestock(false)}>Cancel</button><button type="submit" className="btn primary" disabled={isSubmitting}>{isSubmitting?'Saving…':'Record Restock'}</button></footer>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDiscounts = () => {
    const discountCodesEndpoint = API_ENDPOINTS.discountCodes;
    const loadDiscounts = async () => { setDiscountLoading(true); try { const data = await apiRequest(discountCodesEndpoint); setDiscountCodes(data.data || []); } catch (e) { showToast(e.message, 'error'); } finally { setDiscountLoading(false); } };
    const handleDiscountSubmit = async (e) => { e.preventDefault(); setIsSubmitting(true); try { const payload = { code:discountForm.code.toUpperCase().trim(), type:discountForm.type, value:parseFloat(discountForm.value), description:discountForm.description, minOrderAmount:discountForm.minOrderAmount?parseFloat(discountForm.minOrderAmount):0, usageLimit:discountForm.usageLimit?parseInt(discountForm.usageLimit):null, expiresAt:discountForm.expiresAt||null, isActive:discountForm.isActive }; const method = editingDiscount ? 'PUT' : 'POST'; const endpoint = editingDiscount ? `${discountCodesEndpoint}/${editingDiscount._id}` : discountCodesEndpoint; await apiRequest(endpoint, { method, body:JSON.stringify(payload) }); showToast(`Code ${editingDiscount?'updated':'created'}.`); setShowDiscountForm(false); setEditingDiscount(null); setDiscountForm({code:'',type:'percentage',value:'',description:'',minOrderAmount:'',usageLimit:'',expiresAt:'',isActive:true}); loadDiscounts(); } catch (e) { showToast(e.message, 'error'); } finally { setIsSubmitting(false); } };
    const handleToggleDiscount = async (dc) => { try { await apiRequest(`${discountCodesEndpoint}/${dc._id}`, { method:'PUT', body:JSON.stringify({isActive:!dc.isActive}) }); showToast(`Code ${dc.isActive?'deactivated':'activated'}.`); loadDiscounts(); } catch (e) { showToast(e.message, 'error'); } };
    const handleDeleteDiscount = async (dc) => { if (!window.confirm(`Delete code "${dc.code}"?`)) return; try { await apiRequest(`${discountCodesEndpoint}/${dc._id}`, { method:'DELETE' }); showToast(`Code "${dc.code}" deleted.`); loadDiscounts(); } catch (e) { showToast(e.message, 'error'); } };
    const openEdit = (dc) => { setEditingDiscount(dc); setDiscountForm({ code:dc.code, type:dc.type, value:String(dc.value), description:dc.description||'', minOrderAmount:dc.minOrderAmount?String(dc.minOrderAmount):'', usageLimit:dc.usageLimit?String(dc.usageLimit):'', expiresAt:dc.expiresAt?dc.expiresAt.slice(0,10):'', isActive:dc.isActive }); setShowDiscountForm(true); };
    const isExpired = (dc) => dc.expiresAt && new Date(dc.expiresAt) < new Date();
    const isLimitReached = (dc) => dc.usageLimit && dc.usedCount >= dc.usageLimit;
    return (
      <section className="panel">
        <header><h3>Discount Codes <span className="count-chip">{discountCodes.length}</span></h3><div className="button-row"><button className="btn ghost" onClick={loadDiscounts}>↻ Refresh</button><button className="btn primary" onClick={()=>{ setEditingDiscount(null); setDiscountForm({code:'',type:'percentage',value:'',description:'',minOrderAmount:'',usageLimit:'',expiresAt:'',isActive:true}); setShowDiscountForm(true); }}>➕ Add Code</button></div></header>
        {discountLoading ? <div style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>Loading…</div> : (
          <div className="table-responsive"><table>
            <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Min Order</th><th>Used / Limit</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {discountCodes.map(dc => (
                <tr key={dc._id} style={{opacity:(!dc.isActive||isExpired(dc)||isLimitReached(dc))?0.5:1}}>
                  <td><span style={{fontFamily:'monospace',fontWeight:700,fontSize:'0.9rem',letterSpacing:'0.08em',color:'#c9a96e'}}>{dc.code}</span>{dc.description&&<div style={{fontSize:'0.72rem',color:'#94a3b8',marginTop:'0.1rem'}}>{dc.description}</div>}</td>
                  <td style={{textTransform:'capitalize'}}>{dc.type}</td>
                  <td style={{fontWeight:700}}>{dc.type==='percentage'?`${dc.value}%`:`R${dc.value}`}</td>
                  <td>{dc.minOrderAmount>0?`R${dc.minOrderAmount}`:'—'}</td>
                  <td><span style={{fontWeight:600,color:isLimitReached(dc)?'#dc2626':'inherit'}}>{dc.usedCount||0}</span>{dc.usageLimit?` / ${dc.usageLimit}`:' / ∞'}</td>
                  <td>{dc.expiresAt?<span style={{color:isExpired(dc)?'#dc2626':'#94a3b8',fontSize:'0.8rem'}}>{new Date(dc.expiresAt).toLocaleDateString('en-ZA')}{isExpired(dc)&&' (Expired)'}</span>:<span style={{color:'#94a3b8'}}>Never</span>}</td>
                  <td><span className={`status ${dc.isActive&&!isExpired(dc)&&!isLimitReached(dc)?'booked':'cancelled'}`}>{isExpired(dc)?'Expired':isLimitReached(dc)?'Limit Reached':dc.isActive?'Active':'Inactive'}</span></td>
                  <td className="row-actions"><button className="action-btn" onClick={()=>openEdit(dc)}>Edit</button><button className="action-btn" onClick={()=>handleToggleDiscount(dc)}>{dc.isActive?'Deactivate':'Activate'}</button><button className="action-btn delete-btn" onClick={()=>handleDeleteDiscount(dc)}>Delete</button></td>
                </tr>
              ))}
              {discountCodes.length===0&&<tr><td colSpan="8" className="empty-row">No discount codes yet.</td></tr>}
            </tbody>
          </table></div>
        )}
        {showDiscountForm && (
          <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setShowDiscountForm(false)}>
            <div className="modal" style={{maxWidth:560}}>
              <header><h3>{editingDiscount?'Edit Code':'Create Discount Code'}</h3><button onClick={()=>setShowDiscountForm(false)}>✕</button></header>
              <form onSubmit={handleDiscountSubmit} className="form-grid">
                <div style={{gridColumn:'1 / -1'}}><label>Code *</label><input required placeholder="e.g. BEAUTY10" value={discountForm.code} onChange={e=>setDiscountForm(f=>({...f,code:e.target.value.toUpperCase()}))} style={{textTransform:'uppercase',fontFamily:'monospace',letterSpacing:'0.08em',fontWeight:700}} /></div>
                <div><label>Type *</label><select value={discountForm.type} onChange={e=>setDiscountForm(f=>({...f,type:e.target.value}))}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed Amount (R)</option></select></div>
                <div><label>Value * {discountForm.type==='percentage'?'(%)':'(R)'}</label><input required type="number" min="0.01" step="0.01" placeholder={discountForm.type==='percentage'?'e.g. 10':'e.g. 50'} value={discountForm.value} onChange={e=>setDiscountForm(f=>({...f,value:e.target.value}))} /></div>
                <div style={{gridColumn:'1 / -1'}}><label>Description (shown to customer)</label><input placeholder="e.g. 10% off your first order" value={discountForm.description} onChange={e=>setDiscountForm(f=>({...f,description:e.target.value}))} /></div>
                <div><label>Min Order Amount (R)</label><input type="number" min="0" step="0.01" placeholder="e.g. 200 (optional)" value={discountForm.minOrderAmount} onChange={e=>setDiscountForm(f=>({...f,minOrderAmount:e.target.value}))} /></div>
                <div><label>Usage Limit</label><input type="number" min="1" step="1" placeholder="e.g. 100 (blank = unlimited)" value={discountForm.usageLimit} onChange={e=>setDiscountForm(f=>({...f,usageLimit:e.target.value}))} /></div>
                <div style={{gridColumn:'1 / -1'}}><label>Expiry Date</label><input type="date" value={discountForm.expiresAt} onChange={e=>setDiscountForm(f=>({...f,expiresAt:e.target.value}))} /></div>
                <div style={{gridColumn:'1 / -1'}}><label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.88rem',fontWeight:500}}><input type="checkbox" checked={discountForm.isActive} onChange={e=>setDiscountForm(f=>({...f,isActive:e.target.checked}))} />Active (customers can use this code)</label></div>
                <footer className="modal-actions" style={{gridColumn:'1 / -1'}}><button type="button" onClick={()=>setShowDiscountForm(false)}>Cancel</button><button type="submit" className="btn primary" disabled={isSubmitting}>{isSubmitting?'Saving…':editingDiscount?'Update Code':'Create Code'}</button></footer>
              </form>
            </div>
          </div>
        )}
      </section>
    );
  };

  const sectionRenderer = () => {
    switch (activeSection) {
      case 'schedule':      return <section className="panel"><header><h3>Staff Schedule</h3></header><StaffSchedule staff={staff} services={services} /></section>;
      case 'appointments':  return renderAppointments();
      case 'services':      return renderServices();
      case 'staff':         return renderStaff();
      case 'clients':       return renderClients();
      case 'availability':  return renderAvailability();
      case 'payments':      return renderPayments();
      case 'notifications': return renderNotifications();
      case 'gallery':       return renderGallery();
      case 'shop-products': return renderProducts();
      case 'shop-orders':   return renderShopOrders();
      case 'subscriptions':  return renderSubscriptions();
      case 'inventory':     return renderInventory();
      case 'discounts':     return renderDiscounts();
      case 'shop-revenue':  return renderShopRevenue();
      case 'analytics':     return renderAnalytics();
      default:              return renderOverview();
    }
  };

  if (authLoading||loading) return <div className="admin-loading"><div className="spinner" /><span>Loading admin dashboard…</span></div>;
  if (error) return <div className="admin-error"><h2>Admin Dashboard</h2><p>{error}</p><button className="btn primary" onClick={loadAll}>Retry</button></div>;

  return (
    <div className="admin-shell">
      {toast&&<div className={`toast toast-${toast.type}`} key={toast.id}>{toast.type==='success'?'✓':'✕'} {toast.msg}</div>}
      <div className={`sidebar-overlay ${sidebarOpen?'visible':''}`} onClick={()=>setSidebarOpen(false)} />
      <aside className={`admin-sidebar ${sidebarOpen?'open':''}`}>
        <div className="brand"><div><h2>NXL Beauty Bar</h2><p>Admin Panel</p></div></div>
        <nav>
          <SidebarBtn icon="🏠" label="Overview"      section="overview"      active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="📅" label="Appointments"  section="appointments"  active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} badge={unpaidAppointments.length||null} />
          <SidebarBtn icon="🗓️" label="Schedule"       section="schedule"      active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="💅" label="Services"      section="services"      active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="👩‍💼" label="Staff"         section="staff"         active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="🧑‍🤝‍🧑" label="Clients"      section="clients"       active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="🗓️" label="Availability"  section="availability"  active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="💸" label="Payments"      section="payments"      active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="🔔" label="Activity Log"  section="notifications" active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} badge={unreadNotifCount||null} />
          <SidebarBtn icon="🖼️" label="Gallery"       section="gallery"       active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="🛍️" label="Products"      section="shop-products" active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="📦" label="Shop Orders"   section="shop-orders"   active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="🏷️" label="Discounts"     section="discounts"     active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="💅" label="Subscriptions"  section="subscriptions"  active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="📦" label="Inventory"     section="inventory"     active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="📊" label="Shop Revenue"  section="shop-revenue"  active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
          <SidebarBtn icon="📈" label="Analytics"     section="analytics"     active={activeSection} onClick={setActiveSection} onNavigate={()=>setSidebarOpen(false)} />
        </nav>
        <footer>
          <button className="btn ghost" onClick={()=>{localStorage.removeItem('adminActiveSection');navigate('/dashboard');}}>← User View</button>
          <button className="btn danger" onClick={logout}>Logout</button>
        </footer>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div className="admin-header-left">
            <button className="admin-header-hamburger" onClick={()=>setSidebarOpen(s=>!s)} aria-label="Open menu">☰</button>
            <div><h1>{SECTION_TITLES[activeSection]}</h1><p>NXL Beauty Bar · Admin Panel</p></div>
          </div>
          <div className="admin-header-right">
            {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
              <button
                className="btn ghost"
                onClick={handleEnableNotifications}
                title="Get browser notifications for new bookings"
                style={{ fontSize:'0.78rem', gap:'0.3rem' }}
              >
                🔔 Enable Alerts
              </button>
            )}
            {unpaidAppointments.length>0&&<button className="unpaid-alert-btn" onClick={()=>{setFilters(f=>({...f,status:'pending'}));setActiveSection('appointments');}}>⚠️ {unpaidAppointments.length} Unpaid</button>}
            <div className="admin-user"><span>{user?.firstName} {user?.lastName}</span><small>{user?.email}</small></div>
          </div>
        </header>
        <div className="admin-content">{sectionRenderer()}</div>
      </main>

      {showAppointmentModal&&<AppointmentModal services={services} staff={staff} clients={clients} onClose={()=>setShowAppointmentModal(false)} onSubmit={async fd=>{setIsSubmitting(true);try{await apiRequest(API_ENDPOINTS.appointments,{method:'POST',body:JSON.stringify({userId:fd.clientId,employeeId:fd.employeeId,serviceIds:fd.serviceIds,date:fd.date,time:fd.time,notes:fd.notes,paymentStatus:fd.paymentStatus,paymentMethod:fd.paymentMethod})});await loadAll();setShowAppointmentModal(false);showToast('Appointment created.');}catch(e){alert(e.message);}finally{setIsSubmitting(false);}}} isSubmitting={isSubmitting} />}
      {showEditAppointmentModal&&<EditAppointmentModal appointment={editingAppointment} services={services} staff={staff} clients={clients} onClose={()=>{setShowEditAppointmentModal(false);setEditingAppointment(null);}} onSubmit={async fd=>{setIsSubmitting(true);try{await apiRequest(`${API_ENDPOINTS.appointments}/${editingAppointment._id}`,{method:'PUT',body:JSON.stringify({employeeId:fd.employeeId,serviceIds:fd.serviceIds,date:fd.date,time:fd.time,notes:fd.notes,status:fd.status,paymentStatus:fd.paymentStatus,paymentMethod:fd.paymentMethod})});await loadAll();setShowEditAppointmentModal(false);setEditingAppointment(null);showToast('Appointment updated.');}catch(e){alert(e.message);}finally{setIsSubmitting(false);}}} isSubmitting={isSubmitting} />}
      {showPaymentModal&&<PaymentModal appointment={selectedAppointment} onClose={()=>{setShowPaymentModal(false);setSelectedAppointment(null);}} onSubmit={async fd=>{setIsSubmitting(true);try{await apiRequest(API_ENDPOINTS.payments,{method:'POST',body:JSON.stringify(fd)});await loadAll();setShowPaymentModal(false);setSelectedAppointment(null);showToast('Payment recorded.');}catch(e){alert(e.message);}finally{setIsSubmitting(false);}}} isSubmitting={isSubmitting} />}
      {showStaffModal&&<StaffModal staff={editingStaff} services={services} onClose={()=>{setShowStaffModal(false);setEditingStaff(null);}} onSubmit={async fd=>{setIsSubmitting(true);try{const method=editingStaff?'PUT':'POST';const endpoint=editingStaff?`${API_ENDPOINTS.staff}/${editingStaff._id}`:API_ENDPOINTS.staff;await apiRequest(endpoint,{method,body:JSON.stringify(fd)});const staffData=await apiRequest(API_ENDPOINTS.staff);setStaff(staffData.data||[]);setShowStaffModal(false);setEditingStaff(null);showToast(`Staff member ${editingStaff?'updated':'added'}.`);}catch(e){alert(e.message);}finally{setIsSubmitting(false);}}} isSubmitting={isSubmitting} />}
      {showAvailabilityModal&&<AvailabilityModal staff={staff} onClose={()=>setShowAvailabilityModal(false)} onAllSubmitted={async(successCount,skippedCount)=>{const availData=await apiRequest(API_ENDPOINTS.availability);setAvailability(availData.data||[]);setShowAvailabilityModal(false);showToast(`${successCount} slot${successCount!==1?'s':''} blocked${skippedCount>0?` (${skippedCount} already blocked)`:''}.`);}} />}
    </div>
  );
}


export default AdminDashboard;