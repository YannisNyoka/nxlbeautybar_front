import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import emailjs from '@emailjs/browser';
import './ConfirmationPopup.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '') || 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const policyHighlights = new Set([0, 1, 5, 7, 10, 11, 12]);
const policyItems = [
  'Check availability (date & time) on the App or WhatsApp for an appointment.',
  'Non-refundable deposit of R100 or full amount confirms appointment.',
  'Send proof of payment.',
  'Payment must reflect before appointment.',
  'No e-wallet or cash send — money to be deposited straight into account.',
  'NO KIDS ALLOWED AT THE SALON.',
  'No nail polish or extensions on nails unless soak off or buff off was included.',
  'If you have something on your nails, you will be charged full soak off price to remove them.',
  'WE STRICTLY WORK FROM 9AM TO 5PM. Appointments before/after will be charged R50 extra per person.',
  'R50 will be charged for every 15 minutes you are late.',
  '30 minutes late — your appointment will be cancelled.',
  'Cancellation only allowed 48 hours prior. Failure will incur a penalty fee of R100.',
  'NO CASH. NO PAYMENT, NO APPOINTMENT. NO REFUND.',
  'ONLY THE PERSON WITH AN APPOINTMENT WILL BE ALLOWED IN THE SALON.',
];

function BookingPolicyCard() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin:'1.5rem auto 0', maxWidth:'480px', background:'#fff', border:'1px solid #e0ccc4', borderRadius:'16px', boxShadow:'0 4px 20px rgba(61,31,21,0.10)', overflow:'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 1.25rem', background:'linear-gradient(135deg, #3d1f15 0%, #6b3528 100%)', border:'none', cursor:'pointer', color:'#ffe8d6', fontFamily:"'DM Sans', sans-serif", fontWeight:700, fontSize:'0.88rem', letterSpacing:'0.05em' }}>
        <span>📋 Booking Policy & Important Rules</span>
        <span style={{ fontSize:'0.8rem', opacity:0.8, transition:'transform 0.3s', transform:open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding:'1.25rem 1.5rem', textAlign:'left', fontFamily:"'DM Sans', sans-serif" }}>
          <p style={{ fontSize:'0.82rem', color:'#6b3528', marginBottom:'0.75rem', lineHeight:1.6, fontStyle:'italic' }}>
            Due to clients not arriving on time and cancelling last minute, we have put this policy in place:
          </p>
          <ul style={{ listStyle:'none', padding:0, margin:'0 0 1rem' }}>
            {policyItems.map((item, i) => (
              <li key={i} style={{ fontSize:'0.8rem', lineHeight:1.8, paddingLeft:'1.1rem', position:'relative', color:policyHighlights.has(i)?'#a0502e':'#3d1f15', fontWeight:policyHighlights.has(i)?700:400 }}>
                <span style={{ position:'absolute', left:0, top:'0.55em', width:'5px', height:'5px', background:policyHighlights.has(i)?'#a0502e':'#c07a5a', borderRadius:'50%', display:'block' }} />
                {item}
              </li>
            ))}
          </ul>
          <div style={{ background:'linear-gradient(135deg,#fdf6f0,#fce8db)', border:'1px solid #e0ccc4', borderRadius:'10px', padding:'1rem', textAlign:'center', marginTop:'0.5rem' }}>
            <div style={{ fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'#b08070', marginBottom:'0.4rem' }}>Banking Details</div>
            <div style={{ fontSize:'1rem', fontWeight:700, color:'#3d1f15' }}>6307553452</div>
            <div style={{ fontSize:'0.85rem', fontWeight:600, color:'#6b3528', marginTop:'0.15rem' }}>FNB (NXLBEAUTYBAR)</div>
          </div>
          <div style={{ marginTop:'0.75rem', fontSize:'0.78rem', color:'#9e7060', textAlign:'center', lineHeight:1.9 }}>
            <div><b>Instagram:</b> @nxlbeautybar</div>
            <div><b>TikTok:</b> @nxlbeautybar</div>
            <div><b>Facebook:</b> nxlbeautybar</div>
          </div>
        </div>
      )}
    </div>
  );
}

function toCalDateStr(dateStr, timeStr) {
  if (!dateStr || !timeStr) return '';
  return `${dateStr.replace(/-/g,'')}T${timeStr.replace(/:/g,'')}00`;
}
function addMinutesToTime(timeStr, mins) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const total  = h * 60 + m + (mins || 60);
  return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function downloadICS({ dateStr, timeStr, endTimeStr, title, description, location }) {
  const start = toCalDateStr(dateStr, timeStr);
  const end   = toCalDateStr(dateStr, endTimeStr);
  if (!start || !end) return;
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NXL Beauty Bar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    `UID:nxl-${Date.now()}@nxlbeautybar.co.za`,`DTSTAMP:${toCalDateStr(new Date().toISOString().slice(0,10),new Date().toTimeString().slice(0,5))}Z`,
    `DTSTART:${start}`,`DTEND:${end}`,`SUMMARY:${title}`,`DESCRIPTION:${description.replace(/\n/g,'\\n')}`,`LOCATION:${location}`,
    'STATUS:CONFIRMED','BEGIN:VALARM','TRIGGER:-PT60M','ACTION:DISPLAY',`DESCRIPTION:Reminder: ${title}`,'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([ics],{type:'text/calendar'})), download:'nxl-appointment.ics' });
  a.click(); URL.revokeObjectURL(a.href);
}
function openGoogleCalendar({ dateStr, timeStr, endTimeStr, title, description, location }) {
  const start = toCalDateStr(dateStr, timeStr);
  const end   = toCalDateStr(dateStr, endTimeStr);
  if (!start || !end) return;
  window.open(`https://calendar.google.com/calendar/render?${new URLSearchParams({action:'TEMPLATE',text:title,dates:`${start}/${end}`,details:description,location})}`, '_blank');
}

const dropItemStyle = { display:'flex', alignItems:'center', gap:'0.6rem', width:'100%', padding:'0.75rem 1.1rem', background:'#fff', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.85rem', fontWeight:500, color:'#3d1f15', textAlign:'left' };

function AddToCalendarButton({ dateStr, timeStr, durationMins, services, employee }) {
  const [open, setOpen] = useState(false);
  const dropRef = useRef(null);
  const endTimeStr  = addMinutesToTime(timeStr, durationMins);
  const serviceList = Array.isArray(services) ? services.join(', ') : services || '';
  const description = ['Your NXL Beauty Bar appointment is confirmed.', serviceList?`Services: ${serviceList}`:'', employee?`Stylist: ${employee}`:'', 'Please arrive on time. Cancellations must be 48 hours prior.','Contact: 068 511 3394 | nxlbeautybar@gmail.com'].filter(Boolean).join('\n');
  const location    = 'NXLBEAUTYBAR, 1948 Mahalefele Rd, Dube, Soweto, 1800';
  const calArgs     = { dateStr, timeStr, endTimeStr, title:'NXL Beauty Bar Appointment', description, location };
  const disabled    = !dateStr || !timeStr;
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={dropRef} style={{ position:'relative', display:'inline-block' }}>
      <button onClick={() => !disabled && setOpen(o=>!o)} disabled={disabled}
        style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.75rem 1.5rem', background:disabled?'#e0ccc4':'linear-gradient(135deg,#3d1f15,#6b3528)', color:disabled?'#9e7060':'#ffe8d6', border:'none', borderRadius:'50px', fontFamily:"'DM Sans',sans-serif", fontWeight:600, fontSize:'0.88rem', cursor:disabled?'not-allowed':'pointer', boxShadow:disabled?'none':'0 4px 16px rgba(61,31,21,0.25)', whiteSpace:'nowrap' }}>
        📅 Add to Calendar <span style={{ fontSize:'0.7rem', opacity:0.75 }}>▼</span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 0.5rem)', left:'50%', transform:'translateX(-50%)', background:'#fff', border:'1px solid #e0ccc4', borderRadius:'12px', boxShadow:'0 8px 32px rgba(61,31,21,0.18)', overflow:'hidden', minWidth:'210px', zIndex:50 }}>
          <button onClick={() => { openGoogleCalendar(calArgs); setOpen(false); }} style={dropItemStyle} onMouseEnter={e=>e.currentTarget.style.background='#fdf6f0'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>🗓️ Google Calendar</button>
          <button onClick={() => { downloadICS(calArgs); setOpen(false); }} style={{...dropItemStyle, borderTop:'1px solid #f0e8e2'}} onMouseEnter={e=>e.currentTarget.style.background='#fdf6f0'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>📲 Apple / Outlook</button>
        </div>
      )}
    </div>
  );
}

// ─── PaymentSuccess ───────────────────────────────────────────────────────────
const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const [details,     setDetails]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [emailStatus, setEmailStatus] = useState('');
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    emailjs.init(import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'l7AiKNhYSfG_q4eot');
    load();
  }, []);

  const load = async () => {
    const params        = new URLSearchParams(location.search);
    const appointmentId = params.get('appointmentId');

    // ── STEP 1: localStorage (set by UserProfile before redirect — most reliable) ──
    let data = null;
    try {
      const raw = localStorage.getItem('pendingBooking');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Use it if it matches this appointmentId, or if there's no appointmentId to check against
        if (parsed && (
          !appointmentId ||
          !parsed.appointmentId ||
          String(parsed.appointmentId) === String(appointmentId)
        )) {
          // Only trust it if it has real data, not just placeholders
          if (parsed.name && parsed.name !== 'Client' && parsed.appointmentDate) {
            data = parsed;
          }
        }
      }
    } catch {}

    // ── STEP 2: API fetch with current token ──────────────────────────────────────
    if (appointmentId && !data) {
      data = await fetchFromAPI(appointmentId, localStorage.getItem('token'));
    }

    // ── STEP 3: Refresh token then retry API ──────────────────────────────────────
    if (appointmentId && !data) {
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const rRes  = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ refreshToken }),
          });
          const rData = await rRes.json();
          if (rData.success && rData.token) {
            localStorage.setItem('token', rData.token);
            data = await fetchFromAPI(appointmentId, rData.token);
          }
        }
      } catch {}
    }

    // ── STEP 4: Public receipt endpoint (no token needed — verified by email) ─────
    if (appointmentId && !data) {
      try {
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        const email    = userInfo?.email || '';
        if (email) {
          const res  = await fetch(`${API_BASE_URL}/appointments/${appointmentId}/receipt?email=${encodeURIComponent(email)}`);
          const json = await res.json();
          if (json.success && json.data?.appointmentDate) {
            data = json.data;
          }
        }
      } catch {}
    }

    // ── STEP 5: Use localStorage even if name is 'Client' (better than nothing) ──
    if (!data) {
      try {
        const raw = localStorage.getItem('pendingBooking');
        if (raw) data = JSON.parse(raw);
      } catch {}
    }

    // ── Fallback: userInfo for at least the name ──────────────────────────────────
    if (!data || !data.name || data.name === 'Client') {
      try {
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        if (userInfo?.firstName) {
          data = {
            ...(data || {}),
            name: `${userInfo.firstName} ${userInfo.lastName || ''}`.trim(),
            email: data?.email || userInfo.email || '',
          };
        }
      } catch {}
    }

    const final = data || {};
    setDetails(final);
    setLoading(false);

    // ── Fire verify in background ─────────────────────────────────────────────────
    if (appointmentId) {
      const token = localStorage.getItem('token');
      if (token) {
        fetch(`${API_BASE_URL}/payments/verify`, {
          method:'POST',
          headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
          body: JSON.stringify({ appointmentId }),
        }).catch(() => {});
      }
    }

    // ── Send confirmation email ───────────────────────────────────────────────────
    if (final.email) {
      sendConfirmationEmail(final, appointmentId);
    }
  };

  const fetchFromAPI = async (appointmentId, token) => {
    if (!token) return null;
    try {
      const res  = await fetch(`${API_BASE_URL}/appointments/${appointmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.success || !json.data) return null;
      const appt = json.data;
      return {
        appointmentId,
        name:             (appt.user?.firstName && appt.user?.lastName)
                            ? `${appt.user.firstName} ${appt.user.lastName}`.trim()
                            : appt.userName || 'Client',
        email:            appt.user?.email || '',
        appointmentDate:  appt.date || '',
        appointmentTime:  appt.time || '',
        selectedServices: (appt.services || []).map(s => s?.name).filter(Boolean),
        selectedEmployee: appt.employee?.name || '',
        totalPrice:       parseFloat(appt.totalPrice?.$numberDecimal || appt.totalPrice || 0),
        totalDuration:    appt.totalDuration
                            || (appt.services || []).reduce((sum, s) => sum + (s?.durationMinutes || 0), 0)
                            || 60,
      };
    } catch {
      return null;
    }
  };

  const sendConfirmationEmail = async (d, appointmentId) => {
    try {
      const emailKey = `emailSent_${appointmentId || d.email}`;
      if (localStorage.getItem(emailKey)) { setEmailStatus('sent'); return; }
      const dur = d.totalDuration
        ? `${Math.floor(d.totalDuration/60)||''}${Math.floor(d.totalDuration/60)?'h ':' '}${d.totalDuration%60||''}${d.totalDuration%60?'min':''}`.trim()
        : '';
      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID  || 'service_f0lbtzg',
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_sbxxbii',
        {
          customer_name:    d.name || 'Client',
          appointment_date: d.appointmentDate || '',
          appointment_time: d.appointmentTime || '',
          services:         (d.selectedServices || []).join(', '),
          employee:         d.selectedEmployee || '',
          total_price:      `R${d.totalPrice || 0}`,
          total_duration:   dur,
          contact_number:   '',
          salon_email:      'nxlbeautybar@gmail.com',
          salon_phone:      '0685113394',
          email:            d.email,
        }
      );
      localStorage.setItem(emailKey, '1');
      setEmailStatus('sent');
    } catch {
      setEmailStatus('error');
    }
  };

  const clearAndGo = (path) => {
    localStorage.removeItem('pendingBooking');
    sessionStorage.removeItem('pendingBooking');
    navigate(path, { replace: true });
  };

  if (loading) return (
    <div className="cp-bg">
      <div className="cp-wrapper" style={{ textAlign:'center', padding:'4rem 2rem' }}>
        <div style={{ width:48, height:48, border:'3px solid #e0ccc4', borderTopColor:'#c9a96e', borderRadius:'50%', animation:'cp-spin 0.7s linear infinite', margin:'0 auto 1rem' }} />
        <p style={{ color:'#9e7060', fontFamily:"'DM Sans',sans-serif" }}>Loading your receipt…</p>
        <style>{`@keyframes cp-spin { to { transform:rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  const d = details || {};
  const durationStr = d.totalDuration
    ? `${Math.floor(d.totalDuration/60)||''}${Math.floor(d.totalDuration/60) ? 'h ' : ''}${d.totalDuration%60||''}${d.totalDuration%60 ? 'min' : ''}`.trim() || '30min'
    : '30min';

  return (
    <div className="cp-bg">
      <div className="cp-wrapper">

        {/* Success Icon */}
        <div className="cp-success-ring">
          <div className="cp-success-icon">✓</div>
        </div>
        <h1 className="cp-heading">Payment Successful!</h1>
        <p className="cp-subheading">
          Your appointment is secured.{' '}
          {emailStatus === 'sent'  && 'A confirmation email has been sent.'}
          {emailStatus === 'error' && 'Email could not be sent, but your booking is confirmed.'}
        </p>

        {/* Receipt Card */}
        <div className="cp-card">
          <div className="cp-card-header">
            <span className="cp-logo-dot" />
            <span className="cp-salon-name">NXL Beauty Bar</span>
          </div>

          <div className="cp-divider" />

          <div className="cp-details">
            <div className="cp-detail-row">
              <span className="cp-detail-icon">👤</span>
              <div>
                <div className="cp-detail-label">CLIENT</div>
                <div className="cp-detail-value">{d.name || 'Client'}</div>
              </div>
            </div>

            {(d.appointmentDate || d.appointmentTime) && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">📅</span>
                <div>
                  <div className="cp-detail-label">DATE & TIME</div>
                  <div className="cp-detail-value">{[d.appointmentDate, d.appointmentTime].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
            )}

            {d.selectedServices?.length > 0 && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">💅</span>
                <div>
                  <div className="cp-detail-label">SERVICES</div>
                  <div className="cp-detail-value">{d.selectedServices.join(', ')}</div>
                </div>
              </div>
            )}

            {d.selectedEmployee && (
              <div className="cp-detail-row">
                <span className="cp-detail-icon">👩‍💼</span>
                <div>
                  <div className="cp-detail-label">STYLIST</div>
                  <div className="cp-detail-value">{d.selectedEmployee}</div>
                </div>
              </div>
            )}

            <div className="cp-detail-row">
              <span className="cp-detail-icon">⏱️</span>
              <div>
                <div className="cp-detail-label">DURATION</div>
                <div className="cp-detail-value">{durationStr}</div>
              </div>
            </div>
          </div>

          <div className="cp-divider" />

          <div className="cp-pricing">
            <div className="cp-pricing-row">
              <span className="cp-pricing-label">Booking Fee Paid</span>
              <span className="cp-pricing-paid">R100.00 ✓</span>
            </div>
            {Number(d.totalPrice) > 100 && (
              <div className="cp-pricing-row">
                <span className="cp-pricing-label">Balance Due at Salon</span>
                <span className="cp-pricing-balance">R{(Number(d.totalPrice) - 100).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Booking Policy */}
        <BookingPolicyCard />

        {/* Actions */}
        <div className="cp-actions">
          <button className="cp-book-btn" onClick={() => clearAndGo('/dashboard')}>
            Book Another Appointment
          </button>

          <AddToCalendarButton
            dateStr={d.appointmentDate}
            timeStr={d.appointmentTime}
            durationMins={d.totalDuration || 60}
            services={d.selectedServices}
            employee={d.selectedEmployee}
          />

          <button className="cp-print-btn" onClick={() => window.print()}>
            🖨️ Print Receipt
          </button>

          <button className="cp-signout-btn" onClick={() => { clearAndGo('/'); logout(); }}>
            Sign Out
          </button>
        </div>

      </div>
    </div>
  );
};

export default PaymentSuccess;