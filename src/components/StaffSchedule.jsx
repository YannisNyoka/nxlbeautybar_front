/**
 * StaffSchedule — daily all-staff view + per-staff weekly calendar
 * Used inside AdminDashboard as the "Staff Schedule" section.
 */
import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const HOUR_SLOTS = Array.from({ length: 22 }, (_, i) => {
  const h = Math.floor(i / 2) + 7; // 07:00 – 17:30
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2,'0')}:${m}`;
});

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];

const STATUS_COLORS = {
  booked:     { bg:'#eff6ff', border:'#3b82f6', text:'#1d4ed8' },
  completed:  { bg:'#f0fdf4', border:'#10b981', text:'#15803d' },
  pending:    { bg:'#fffbeb', border:'#f59e0b', text:'#92400e' },
  'no-show':  { bg:'#fef2f2', border:'#ef4444', text:'#dc2626' },
};

function pad2(n) { return String(n).padStart(2,'0'); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function addDays(iso, n) { const d = new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function fmtDate(iso) { return new Date(iso+'T00:00:00').toLocaleDateString('en-ZA', { weekday:'short', day:'numeric', month:'short' }); }

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' } : {};
};

export default function StaffSchedule({ staff = [], services = [] }) {
  const [view,       setView]       = useState('daily');   // 'daily' | 'per-staff'
  const [date,       setDate]       = useState(todayISO());
  const [overview,   setOverview]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [empSchedule, setEmpSchedule] = useState(null);
  const [empLoading,  setEmpLoading]  = useState(false);
  const [weekStart,   setWeekStart]   = useState(todayISO());

  // Working hours editor
  const [editingHours, setEditingHours] = useState(null);
  const [workingHours, setWorkingHours] = useState({});
  const [savingHours,  setSavingHours]  = useState(false);

  const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
  const DAY_LABELS = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
  const DEFAULT_HOURS = { start:'09:00', end:'17:00', active:true };

  const loadOverview = useCallback(async (d = date) => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/staff/overview?date=${d}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setOverview(data.data);
    } catch {}
    finally { setLoading(false); }
  }, [date]);

  const loadEmpSchedule = useCallback(async (empId, start) => {
    setEmpLoading(true);
    const end = addDays(start, 6);
    try {
      const res  = await fetch(`${API_BASE_URL}/employees/${empId}/schedule?start=${start}&end=${end}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setEmpSchedule(data.data);
    } catch {}
    finally { setEmpLoading(false); }
  }, []);

  useEffect(() => { loadOverview(date); }, [date]);
  useEffect(() => {
    if (view === 'per-staff' && selectedEmp) loadEmpSchedule(selectedEmp, weekStart);
  }, [view, selectedEmp, weekStart]);

  const saveWorkingHours = async () => {
    if (!editingHours) return;
    setSavingHours(true);
    try {
      await fetch(`${API_BASE_URL}/employees/${editingHours}/working-hours`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ workingHours }),
      });
      setEditingHours(null);
      // Refresh
      if (view === 'per-staff' && selectedEmp === editingHours) loadEmpSchedule(editingHours, weekStart);
    } catch {}
    finally { setSavingHours(false); }
  };

  const openWorkingHours = (emp) => {
    setEditingHours(emp._id);
    const wh = {};
    DAYS.forEach(d => { wh[d] = emp.workingHours?.[d] || { ...DEFAULT_HOURS }; });
    setWorkingHours(wh);
  };

  // ── Daily overview ─────────────────────────────────────────────────────
  const renderDaily = () => {
    const empData = overview?.staff || [];
    const slotPx  = 52; // px per 30-min slot

    return (
      <div>
        {/* Date navigation */}
        <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1.25rem',flexWrap:'wrap'}}>
          <button onClick={() => setDate(addDays(date,-1))} style={navBtn}>‹ Prev</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{padding:'0.5rem 0.875rem',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'0.85rem',fontFamily:'inherit',color:'#374151'}} />
          <button onClick={() => setDate(addDays(date,1))} style={navBtn}>Next ›</button>
          <span style={{fontSize:'0.88rem',fontWeight:600,color:'#374151'}}>{fmtDate(date)}</span>
          <button onClick={() => setDate(todayISO())} style={{...navBtn,marginLeft:'auto',background:'#eff6ff',borderColor:'#bfdbfe',color:'#1d4ed8'}}>Today</button>
          <button onClick={() => loadOverview(date)} style={navBtn}>↻</button>
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>Loading schedule…</div>
        ) : !empData.length ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>No active staff found.</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <div style={{display:'grid',gridTemplateColumns:`80px repeat(${empData.length}, minmax(160px, 1fr))`,minWidth:'600px'}}>

              {/* Header row */}
              <div style={{background:'#f8fafc',borderBottom:'2px solid #e2e8f0',padding:'0.75rem 0.5rem',fontSize:'0.72rem',color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>Time</div>
              {empData.map((emp, i) => (
                <div key={emp._id} style={{background:'#f8fafc',borderBottom:'2px solid #e2e8f0',borderLeft:'1px solid #e2e8f0',padding:'0.75rem 0.875rem',display:'flex',alignItems:'center',gap:'0.5rem'}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:COLORS[i % COLORS.length],color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.78rem',fontWeight:800,flexShrink:0}}>
                    {emp.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p style={{margin:0,fontSize:'0.82rem',fontWeight:700,color:'#1e293b'}}>{emp.name}</p>
                    <p style={{margin:0,fontSize:'0.68rem',color:'#94a3b8'}}>{emp.appointments.length} appt{emp.appointments.length!==1?'s':''}</p>
                  </div>
                  <button onClick={() => openWorkingHours(emp)} title="Edit working hours"
                    style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',fontSize:'0.9rem',color:'#94a3b8',padding:'2px'}}>⚙️</button>
                </div>
              ))}

              {/* Time slots */}
              {HOUR_SLOTS.map((slot, si) => (
                <>
                  {/* Time label */}
                  <div key={`t-${slot}`} style={{borderBottom:'1px solid #f1f5f9',padding:'0 0.5rem',height:`${slotPx}px`,display:'flex',alignItems:'center',fontSize:'0.68rem',color:'#94a3b8',fontWeight:600,background:slot.endsWith(':00')?'#fafafa':'#fff'}}>
                    {slot.endsWith(':00') ? slot : ''}
                  </div>
                  {/* Staff columns */}
                  {empData.map((emp, i) => {
                    const appt    = emp.appointments.find(a => a.time === slot);
                    const blocked = emp.blockedSlots.includes(slot);
                    const color   = COLORS[i % COLORS.length];
                    return (
                      <div key={`${emp._id}-${slot}`} style={{borderBottom:'1px solid #f1f5f9',borderLeft:'1px solid #e2e8f0',height:`${slotPx}px`,position:'relative',background:blocked?'#fef2f2':slot.endsWith(':00')?'#fafafa':'#fff'}}>
                        {blocked && <div style={{position:'absolute',inset:0,background:'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(239,68,68,0.06) 4px,rgba(239,68,68,0.06) 8px)',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:'0.62rem',color:'#ef4444',fontWeight:600}}>Blocked</span></div>}
                        {appt && (
                          <div style={{position:'absolute',inset:'2px 4px',background:STATUS_COLORS[appt.status]?.bg||'#f0f9ff',border:`1.5px solid ${STATUS_COLORS[appt.status]?.border||color}`,borderRadius:'6px',padding:'3px 6px',overflow:'hidden',zIndex:2,height:`${(appt.durationMinutes/30)*slotPx - 4}px`}}>
                            <p style={{margin:0,fontSize:'0.7rem',fontWeight:700,color:STATUS_COLORS[appt.status]?.text||'#1e293b',lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{appt.clientName}</p>
                            <p style={{margin:'1px 0 0',fontSize:'0.62rem',color:'#64748b',lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{appt.serviceNames.join(', ')}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Per-staff weekly view ──────────────────────────────────────────────
  const renderPerStaff = () => {
    const weekDays = Array.from({length:7}, (_,i) => addDays(weekStart, i));

    return (
      <div>
        {/* Staff selector */}
        <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',marginBottom:'1.25rem'}}>
          {staff.map((emp, i) => (
            <button key={emp._id}
              onClick={() => setSelectedEmp(emp._id)}
              style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.45rem 0.875rem',border:`2px solid ${selectedEmp===emp._id?COLORS[i%COLORS.length]:'#e2e8f0'}`,borderRadius:'50px',background:selectedEmp===emp._id?COLORS[i%COLORS.length]+'22':'#fff',cursor:'pointer',fontSize:'0.82rem',fontWeight:600,color:selectedEmp===emp._id?COLORS[i%COLORS.length]:'#374151',transition:'all 0.15s'}}>
              <span style={{width:22,height:22,borderRadius:'50%',background:COLORS[i%COLORS.length],color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:800,flexShrink:0}}>{emp.name?.[0]}</span>
              {emp.name}
            </button>
          ))}
        </div>

        {!selectedEmp ? (
          <div style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>Select a staff member above to view their schedule.</div>
        ) : (
          <>
            {/* Week navigation */}
            <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1rem',flexWrap:'wrap'}}>
              <button onClick={() => setWeekStart(addDays(weekStart,-7))} style={navBtn}>‹ Prev Week</button>
              <span style={{fontSize:'0.85rem',fontWeight:600,color:'#374151'}}>{fmtDate(weekStart)} – {fmtDate(addDays(weekStart,6))}</span>
              <button onClick={() => setWeekStart(addDays(weekStart,7))} style={navBtn}>Next Week ›</button>
              <button onClick={() => setWeekStart(todayISO())} style={{...navBtn,marginLeft:'auto',background:'#eff6ff',borderColor:'#bfdbfe',color:'#1d4ed8'}}>This Week</button>
              {empSchedule?.employee && (
                <button onClick={() => openWorkingHours(empSchedule.employee)} style={{...navBtn,background:'#f0fdf4',borderColor:'#bbf7d0',color:'#15803d'}}>
                  ⚙️ Working Hours
                </button>
              )}
            </div>

            {empLoading ? (
              <div style={{textAlign:'center',padding:'3rem',color:'#94a3b8'}}>Loading…</div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <div style={{display:'grid',gridTemplateColumns:`60px repeat(7, minmax(120px, 1fr))`,minWidth:'600px'}}>
                  {/* Header */}
                  <div style={thStyle} />
                  {weekDays.map(d => (
                    <div key={d} style={{...thStyle,background:d===todayISO()?'#eff6ff':'#f8fafc',color:d===todayISO()?'#1d4ed8':'#374151'}}>
                      <p style={{margin:0,fontSize:'0.72rem',fontWeight:700}}>{new Date(d+'T00:00:00').toLocaleDateString('en-ZA',{weekday:'short'})}</p>
                      <p style={{margin:0,fontSize:'0.85rem',fontWeight:800}}>{new Date(d+'T00:00:00').getDate()}</p>
                    </div>
                  ))}

                  {/* Slots */}
                  {HOUR_SLOTS.map(slot => (
                    <>
                      <div key={`t-${slot}`} style={{...tdStyle,fontSize:'0.65rem',color:'#94a3b8',fontWeight:600,background:slot.endsWith(':00')?'#fafafa':'#fff',justifyContent:'center',display:'flex',alignItems:'center'}}>
                        {slot.endsWith(':00') ? slot : ''}
                      </div>
                      {weekDays.map(d => {
                        if (!empSchedule) return <div key={`${d}-${slot}`} style={{...tdStyle,height:'40px'}} />;
                        const appt    = empSchedule.appointments?.find(a => a.date===d && a.time===slot);
                        const blocked = empSchedule.blockedSlots?.find(b => b.date===d && b.time===slot);
                        return (
                          <div key={`${d}-${slot}`} style={{...tdStyle,height:'40px',position:'relative',background:d===todayISO()&&slot.endsWith(':00')?'#f0f9ff':blocked?'#fef2f2':slot.endsWith(':00')?'#fafafa':'#fff'}}>
                            {blocked && <div style={{position:'absolute',inset:0,background:'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(239,68,68,0.07) 3px,rgba(239,68,68,0.07) 6px)'}} />}
                            {appt && (
                              <div style={{position:'absolute',inset:'2px 3px',background:STATUS_COLORS[appt.status]?.bg||'#eff6ff',border:`1.5px solid ${STATUS_COLORS[appt.status]?.border||'#3b82f6'}`,borderRadius:'5px',padding:'2px 5px',overflow:'hidden',zIndex:2}}>
                                <p style={{margin:0,fontSize:'0.62rem',fontWeight:700,color:STATUS_COLORS[appt.status]?.text||'#1d4ed8',lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{appt.clientName}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ── Working hours editor modal ─────────────────────────────────────────
  const renderHoursModal = () => {
    if (!editingHours) return null;
    const emp = staff.find(s => s._id === editingHours);
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}
        onClick={e => e.target===e.currentTarget && setEditingHours(null)}>
        <div style={{background:'#fff',borderRadius:'16px',width:'100%',maxWidth:'480px',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.25)'}}>
          <div style={{padding:'1.25rem 1.5rem',borderBottom:'1px solid #f0f0f0',display:'flex',alignItems:'center',justifyContent:'space-between',background:'linear-gradient(135deg,#1a1a2e,#16213e)'}}>
            <div>
              <h3 style={{margin:0,color:'#fff',fontSize:'1rem',fontWeight:700}}>⏰ Working Hours — {emp?.name}</h3>
              <p style={{margin:'0.2rem 0 0',color:'rgba(255,255,255,0.5)',fontSize:'0.75rem'}}>Set regular working schedule</p>
            </div>
            <button onClick={() => setEditingHours(null)} style={{background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',width:32,height:32,borderRadius:8,cursor:'pointer',fontSize:'1rem'}}>✕</button>
          </div>
          <div style={{padding:'1.25rem'}}>
            {DAYS.map(day => (
              <div key={day} style={{display:'grid',gridTemplateColumns:'60px 1fr 1fr 40px',gap:'0.5rem',alignItems:'center',marginBottom:'0.625rem'}}>
                <span style={{fontSize:'0.82rem',fontWeight:600,color:'#374151',textTransform:'capitalize'}}>{DAY_LABELS[day]}</span>
                <input type="time" value={workingHours[day]?.start||'09:00'} disabled={!workingHours[day]?.active}
                  onChange={e => setWorkingHours(prev => ({...prev,[day]:{...prev[day],start:e.target.value}}))}
                  style={{padding:'0.45rem',border:'1px solid #e2e8f0',borderRadius:'6px',fontSize:'0.82rem',opacity:workingHours[day]?.active?1:0.4}} />
                <input type="time" value={workingHours[day]?.end||'17:00'} disabled={!workingHours[day]?.active}
                  onChange={e => setWorkingHours(prev => ({...prev,[day]:{...prev[day],end:e.target.value}}))}
                  style={{padding:'0.45rem',border:'1px solid #e2e8f0',borderRadius:'6px',fontSize:'0.82rem',opacity:workingHours[day]?.active?1:0.4}} />
                <input type="checkbox" checked={workingHours[day]?.active||false}
                  onChange={e => setWorkingHours(prev => ({...prev,[day]:{...prev[day],active:e.target.checked}}))}
                  style={{width:18,height:18,cursor:'pointer'}} />
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'flex-end',gap:'0.75rem',marginTop:'1.25rem',borderTop:'1px solid #f0f0f0',paddingTop:'1.25rem'}}>
              <button onClick={() => setEditingHours(null)} style={{padding:'0.6rem 1.25rem',border:'1px solid #e2e8f0',borderRadius:'8px',background:'#fff',cursor:'pointer',fontSize:'0.82rem',fontWeight:600,color:'#64748b'}}>Cancel</button>
              <button onClick={saveWorkingHours} disabled={savingHours} style={{padding:'0.6rem 1.5rem',border:'none',borderRadius:'8px',background:'linear-gradient(135deg,#1a1a2e,#4f46e5)',color:'#fff',cursor:savingHours?'not-allowed':'pointer',fontSize:'0.82rem',fontWeight:700,opacity:savingHours?0.6:1}}>
                {savingHours ? 'Saving…' : 'Save Hours'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const navBtn = {padding:'0.45rem 0.875rem',border:'1px solid #e2e8f0',borderRadius:'8px',background:'#fff',cursor:'pointer',fontSize:'0.82rem',fontWeight:600,color:'#374151',transition:'all 0.15s'};
  const thStyle = {padding:'0.75rem 0.5rem',background:'#f8fafc',borderBottom:'2px solid #e2e8f0',borderRight:'1px solid #e2e8f0',textAlign:'center'};
  const tdStyle = {borderBottom:'1px solid #f1f5f9',borderRight:'1px solid #e2e8f0',padding:'0 2px'};

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
      {/* View toggle */}
      <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
        <button onClick={() => setView('daily')} style={{padding:'0.5rem 1.25rem',border:'2px solid',borderColor:view==='daily'?'#4f46e5':'#e2e8f0',borderRadius:'50px',background:view==='daily'?'#4f46e5':'#fff',color:view==='daily'?'#fff':'#374151',cursor:'pointer',fontSize:'0.82rem',fontWeight:700,transition:'all 0.15s'}}>
          📅 Daily Overview
        </button>
        <button onClick={() => setView('per-staff')} style={{padding:'0.5rem 1.25rem',border:'2px solid',borderColor:view==='per-staff'?'#4f46e5':'#e2e8f0',borderRadius:'50px',background:view==='per-staff'?'#4f46e5':'#fff',color:view==='per-staff'?'#fff':'#374151',cursor:'pointer',fontSize:'0.82rem',fontWeight:700,transition:'all 0.15s'}}>
          👤 Per-Staff Weekly
        </button>
      </div>

      {view === 'daily' ? renderDaily() : renderPerStaff()}
      {renderHoursModal()}
    </div>
  );
}