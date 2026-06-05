import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSEO, faqSchema } from './useSEO';

const SUBSCRIPTION_FAQS = [
  { question: 'Can I cancel my NXL Beauty Bar subscription anytime?', answer: 'Yes! You can cancel anytime from your profile. Your remaining bookings stay valid until the end of your billing period.' },
  { question: 'Do unused bookings roll over each month?', answer: 'Bookings reset each month on your renewal date. We recommend booking regularly to get full value from your plan.' },
  { question: 'How do I use my monthly subscription booking credits?', answer: 'When booking an appointment on our app or website, select "Use subscription credit" and your booking will be deducted from your monthly credits at no extra charge.' },
  { question: 'What happens when my subscription renews?', answer: 'Your plan automatically renews each month and your booking credits reset. You\'ll receive an in-app notification and email reminder before renewal.' },
];
import './SubscriptionsPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export default function SubscriptionsPage() {
  const navigate      = useNavigate();
  const [searchParams]= useSearchParams();
  const [plans,       setPlans]      = useState([]);
  const [mySub,       setMySub]      = useState(null);
  const [loading,     setLoading]    = useState(true);
  const [subscribing, setSubscribing]= useState(null); // planId being subscribed to
  const [error,       setError]      = useState('');
  const [success,     setSuccess]    = useState('');

  const isLoggedIn = !!localStorage.getItem('token');
  const subId      = searchParams.get('subId');
  const cancelled  = searchParams.get('cancelled');

  useSEO({
    title:       'Monthly Nail Care Plans — NXL Beauty Bar',
    description: 'Subscribe to a monthly nail care plan at NXL Beauty Bar. Get regular appointments, priority booking and exclusive member discounts.',
    url:         '/subscriptions',
    schema:      faqSchema(SUBSCRIPTION_FAQS),
    keywords:    'nail subscription Soweto, monthly nail plan, nail care plan South Africa, NXL Beauty Bar subscription',
  });

  useEffect(() => {
    loadPlans();
    if (isLoggedIn) loadMySub();
    if (subId) confirmSubscription(subId);
    if (cancelled) setError('Subscription was cancelled. You have not been charged.');
  }, []);

  const loadPlans = async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/subscription-plans`);
      const data = await res.json();
      if (data.success) setPlans(data.data);
    } catch {}
    finally { setLoading(false); }
  };

  const loadMySub = async () => {
    try {
      const token = localStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/subscriptions/my`, { headers: { Authorization: `Bearer ${token}` } });
      const data  = await res.json();
      if (data.success) setMySub(data.data);
    } catch {}
  };

  const confirmSubscription = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/subscriptions/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subId: id }),
      });
      const data = await res.json();
      if (data.success) {
        setMySub(data.data);
        setSuccess(`🎉 Your ${data.data.planName} subscription is now active! You have ${data.data.bookingsPerMonth} bookings this month.`);
        window.history.replaceState({}, '', '/subscriptions');
      }
    } catch {}
  };

  const handleSubscribe = async (planId) => {
    if (!isLoggedIn) { navigate('/login', { state: { from: '/subscriptions' } }); return; }
    setSubscribing(planId); setError('');
    try {
      const token = localStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Could not start subscription.'); return; }
      window.location.href = data.data.checkoutUrl;
    } catch { setError('Network error. Please try again.'); }
    finally { setSubscribing(null); }
  };

  const handleCancel = async () => {
    if (!mySub) return;
    if (!window.confirm(`Cancel your ${mySub.planName} subscription?\n\nYou'll keep your remaining ${mySub.bookingsRemaining} bookings until ${new Date(mySub.renewalDate).toLocaleDateString('en-ZA')}.`)) return;
    try {
      const token = localStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/subscriptions/${mySub._id}/cancel`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) { setMySub(null); setSuccess('Subscription cancelled. Your credits remain valid until renewal date.'); }
      else setError(data.error || 'Could not cancel subscription.');
    } catch { setError('Network error. Please try again.'); }
  };

  const BADGE_COLORS = {
    '#6366f1': { bg:'#eef2ff', text:'#4f46e5', border:'#c7d2fe' },
    '#10b981': { bg:'#f0fdf4', text:'#059669', border:'#a7f3d0' },
    '#f59e0b': { bg:'#fffbeb', text:'#d97706', border:'#fde68a' },
    '#ec4899': { bg:'#fdf4ff', text:'#db2777', border:'#f9a8d4' },
    '#3b82f6': { bg:'#eff6ff', text:'#2563eb', border:'#bfdbfe' },
  };

  return (
    <div className="sp-root">
      <div className="sp-inner">

        {/* Header */}
        <div className="sp-header">
          <Link to="/" className="sp-back">← Home</Link>
          <h1 className="sp-title">Monthly Nail Care Plans</h1>
          <p className="sp-subtitle">Subscribe and never miss a nail appointment — priority booking, exclusive rates, all year round.</p>
        </div>

        {success && <div className="sp-success-banner">✅ {success}</div>}
        {error   && <div className="sp-error-banner">⚠️ {error}</div>}

        {/* Active subscription card */}
        {mySub && (
          <div className="sp-active-card">
            <div className="sp-active-badge">✅ Active Subscription</div>
            <h2 className="sp-active-name">{mySub.planName}</h2>
            <div className="sp-active-stats">
              <div className="sp-active-stat">
                <span className="sp-active-stat-value">{mySub.bookingsRemaining}</span>
                <span className="sp-active-stat-label">Bookings left this month</span>
              </div>
              <div className="sp-active-stat">
                <span className="sp-active-stat-value">R{parseFloat(mySub.planPrice || 0).toFixed(0)}</span>
                <span className="sp-active-stat-label">per month</span>
              </div>
              <div className="sp-active-stat">
                <span className="sp-active-stat-value">{new Date(mySub.renewalDate).toLocaleDateString('en-ZA', { day:'numeric', month:'short' })}</span>
                <span className="sp-active-stat-label">Renews</span>
              </div>
            </div>
            <div className="sp-active-actions">
              <Link to="/dashboard" className="sp-btn-gold">📅 Book Appointment</Link>
              <button className="sp-btn-outline sp-cancel-btn" onClick={handleCancel}>Cancel Subscription</button>
            </div>
          </div>
        )}

        {/* Plans grid */}
        {loading ? (
          <div className="sp-loading">
            {[1,2,3].map(i => <div key={i} className="sp-skeleton" />)}
          </div>
        ) : plans.length === 0 ? (
          <div className="sp-empty">
            <span>💅</span>
            <p>No subscription plans available yet. Check back soon!</p>
          </div>
        ) : (
          <div className="sp-plans-grid">
            {plans.map(plan => {
              const isCurrent = mySub?.planId?.toString() === plan._id?.toString();
              const accent    = BADGE_COLORS[plan.color] || BADGE_COLORS['#6366f1'];
              return (
                <div key={plan._id} className={`sp-plan-card ${plan.isPopular ? 'popular' : ''} ${isCurrent ? 'current' : ''}`} style={{ '--plan-color': plan.color }}>
                  {plan.isPopular && <div className="sp-popular-badge">⭐ Most Popular</div>}
                  {isCurrent     && <div className="sp-current-badge">Your Plan</div>}

                  <div className="sp-plan-header">
                    <h2 className="sp-plan-name">{plan.name}</h2>
                    {plan.description && <p className="sp-plan-desc">{plan.description}</p>}
                  </div>

                  <div className="sp-plan-price">
                    <span className="sp-price-amount">R{parseFloat(plan.price || 0).toFixed(0)}</span>
                    <span className="sp-price-period">/month</span>
                  </div>

                  <div className="sp-plan-highlight">
                    <span className="sp-highlight-num">{plan.bookingsPerMonth}</span>
                    <span className="sp-highlight-label">booking{plan.bookingsPerMonth > 1 ? 's' : ''} included</span>
                  </div>

                  {plan.discountPct > 0 && (
                    <div className="sp-plan-discount" style={{ background: accent.bg, color: accent.text, borderColor: accent.border }}>
                      🏷️ {plan.discountPct}% off all services
                    </div>
                  )}

                  <ul className="sp-features">
                    <li>✅ {plan.bookingsPerMonth} appointment{plan.bookingsPerMonth > 1 ? 's' : ''} per month</li>
                    <li>✅ Priority booking slots</li>
                    <li>✅ Cancel anytime</li>
                    {plan.features?.map((f, i) => <li key={i}>✅ {f}</li>)}
                  </ul>

                  <div className="sp-plan-footer">
                    {isCurrent ? (
                      <button className="sp-btn-current" disabled>Your current plan</button>
                    ) : mySub ? (
                      <button className="sp-btn-outline" disabled>Switch available after cancellation</button>
                    ) : (
                      <button
                        className="sp-btn-subscribe"
                        style={{ background: plan.color }}
                        onClick={() => handleSubscribe(plan._id)}
                        disabled={!!subscribing}
                      >
                        {subscribing === plan._id ? 'Redirecting…' : isLoggedIn ? 'Subscribe Now' : 'Sign in to Subscribe'}
                      </button>
                    )}
                    {plan.subscriberCount > 0 && (
                      <p className="sp-sub-count">{plan.subscriberCount} active subscriber{plan.subscriberCount > 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FAQ */}
        <div className="sp-faq">
          <h3 className="sp-faq-title">Frequently Asked Questions</h3>
          {[
            { q:'Can I cancel anytime?', a:'Yes! Cancel anytime from your profile. Your remaining bookings stay valid until the end of your billing period.' },
            { q:'Do unused bookings roll over?', a:'Bookings reset each month on your renewal date. We recommend booking regularly to get full value.' },
            { q:'How do I use my subscription bookings?', a:'When booking an appointment, select "Use subscription credit" and your booking will be deducted from your monthly credits.' },
            { q:'What happens on renewal?', a:'Your plan automatically renews each month. You\'ll receive a notification and your booking credits reset.' },
          ].map((item, i) => (
            <FaqItem key={i} question={item.q} answer={item.a} />
          ))}
        </div>

      </div>
    </div>
  );
}

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`sp-faq-item ${open ? 'open' : ''}`}>
      <button className="sp-faq-q" onClick={() => setOpen(o => !o)}>
        <span>{question}</span>
        <span className="sp-faq-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && <p className="sp-faq-a">{answer}</p>}
    </div>
  );
}