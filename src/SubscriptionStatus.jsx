import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export default function SubscriptionStatus() {
  const [sub,     setSub]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE_URL}/subscriptions/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setSub(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ height:120, borderRadius:12, background:'linear-gradient(90deg,#f0e4dc 25%,#f8ede6 50%,#f0e4dc 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite' }} />;

  if (!sub) return (
    <div style={{ background:'#fff8f3', border:'1px solid #e0ccc4', borderRadius:14, padding:'1.75rem', textAlign:'center', display:'flex', flexDirection:'column', gap:'0.875rem', alignItems:'center' }}>
      <span style={{ fontSize:'2.5rem' }}>💅</span>
      <p style={{ fontFamily:'Cormorant Garamond, serif', fontSize:'1.3rem', fontWeight:700, color:'#3d1f15', margin:0 }}>No Active Plan</p>
      <p style={{ fontSize:'0.85rem', color:'#9e7060', margin:0, lineHeight:1.6 }}>Subscribe to a monthly nail care plan for priority booking and exclusive rates.</p>
      <Link to="/subscriptions" style={{ display:'inline-block', padding:'0.75rem 2rem', background:'linear-gradient(135deg,#3d1f15,#a0502e)', color:'#ffe8d6', borderRadius:50, fontFamily:'DM Sans,sans-serif', fontSize:'0.9rem', fontWeight:700, textDecoration:'none', transition:'all 0.2s' }}>
        View Plans →
      </Link>
    </div>
  );

  const renewsIn = Math.ceil((new Date(sub.renewalDate) - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div style={{ background:'linear-gradient(135deg,#3d1f15,#6b3528)', border:'none', borderRadius:14, padding:'1.75rem', color:'#ffe8d6', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'0.5rem' }}>
        <div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', background:'rgba(134,239,172,0.15)', border:'1px solid rgba(134,239,172,0.3)', color:'#86efac', fontSize:'0.7rem', fontWeight:700, padding:'0.2rem 0.6rem', borderRadius:50, marginBottom:'0.5rem' }}>✅ Active</div>
          <h3 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.5rem', fontWeight:700, margin:0, color:'#ffe8d6' }}>{sub.planName}</h3>
          <p style={{ fontSize:'0.82rem', color:'rgba(255,232,214,0.6)', margin:'0.2rem 0 0' }}>R{parseFloat(sub.planPrice || 0).toFixed(0)}/month · Renews in {renewsIn} day{renewsIn !== 1 ? 's' : ''}</p>
        </div>
        <span style={{ fontSize:'2rem', fontWeight:800, color:'#ffe8d6' }}>R{parseFloat(sub.planPrice || 0).toFixed(0)}<span style={{ fontSize:'0.9rem', fontWeight:400, color:'rgba(255,232,214,0.5)' }}>/mo</span></span>
      </div>

      {/* Credits */}
      <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:10, padding:'1rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
          <span style={{ fontSize:'0.78rem', color:'rgba(255,232,214,0.6)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Bookings this month</span>
          <span style={{ fontSize:'0.78rem', color:'rgba(255,232,214,0.55)' }}>{sub.bookingsPerMonth} total</span>
        </div>
        <div style={{ height:8, background:'rgba(255,255,255,0.12)', borderRadius:50, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${Math.round((sub.bookingsRemaining / sub.bookingsPerMonth) * 100)}%`, background:'linear-gradient(90deg,#c9a96e,#ffb380)', borderRadius:50, transition:'width 0.5s' }} />
        </div>
        <p style={{ margin:'0.4rem 0 0', fontSize:'0.85rem', fontWeight:700, color:'#ffe8d6' }}>{sub.bookingsRemaining} booking{sub.bookingsRemaining !== 1 ? 's' : ''} remaining</p>
      </div>

      <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
        <Link to="/dashboard" style={{ flex:1, textAlign:'center', padding:'0.7rem 1rem', background:'linear-gradient(135deg,#c9a96e,#e8925a)', color:'#3d1f15', borderRadius:50, fontFamily:'DM Sans,sans-serif', fontSize:'0.85rem', fontWeight:700, textDecoration:'none', minWidth:120 }}>📅 Book Now</Link>
        <Link to="/subscriptions" style={{ flex:1, textAlign:'center', padding:'0.7rem 1rem', background:'rgba(255,255,255,0.1)', color:'#ffe8d6', border:'1px solid rgba(255,232,214,0.2)', borderRadius:50, fontFamily:'DM Sans,sans-serif', fontSize:'0.85rem', fontWeight:600, textDecoration:'none', minWidth:120 }}>Manage Plan</Link>
      </div>
    </div>
  );
}