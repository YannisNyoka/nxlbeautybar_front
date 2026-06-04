import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Signup.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function signupApi(form) {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const contentType = res.headers.get('content-type');
    let data = {};
    if (contentType?.includes('application/json')) data = await res.json();
    else if (res.status === 404) throw new Error('API endpoint not found. Is your backend running?');
    else throw new Error('Server returned a non-JSON response');
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    return { success: true, ...data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function SignupForm() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '', firstName: '', lastName: '',
  });
  const [errors,     setErrors]     = useState({});
  const [loading,    setLoading]    = useState(false);
  const [apiError,   setApiError]   = useState('');
  const [apiSuccess, setApiSuccess] = useState('');

  // ── Referral code state ─────────────────────────────────────────────────
  const [refCode,    setRefCode]    = useState(searchParams.get('ref') || '');
  const [refInfo,    setRefInfo]    = useState(null);   // { referrerName, discount, message }
  const [refLoading, setRefLoading] = useState(false);
  const [refError,   setRefError]   = useState('');

  // Auto-validate referral code from URL
  useEffect(() => {
    const code = searchParams.get('ref');
    if (code) validateRefCode(code);
  }, []);

  const validateRefCode = async (code) => {
    if (!code?.trim()) return;
    setRefLoading(true); setRefError('');
    try {
      const res  = await fetch(`${API_BASE_URL}/referrals/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (data.success) setRefInfo(data.data);
      else { setRefInfo(null); setRefError('Invalid referral code.'); }
    } catch { setRefError('Could not validate code.'); }
    finally { setRefLoading(false); }
  };
  // ───────────────────────────────────────────────────────────────────────

  const validate = () => {
    const e = {};
    if (!form.email) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format';
    if (!form.password) e.password = 'Password is required';
    else if (
      form.password.length < 8 || !/[A-Z]/.test(form.password) ||
      !/[a-z]/.test(form.password) || !/[0-9]/.test(form.password) ||
      !/[^A-Za-z0-9]/.test(form.password)
    ) e.password = 'Must be 8+ chars with uppercase, lowercase, number and special character';
    if (!form.confirmPassword) e.confirmPassword = 'Please confirm your password';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (!form.firstName) e.firstName = 'First name is required';
    if (!form.lastName)  e.lastName  = 'Last name is required';
    return e;
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: undefined });
    setApiError(''); setApiSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(''); setApiSuccess('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const result = await signupApi({ ...form, referralCode: refCode?.trim().toUpperCase() || undefined });
      if (result.success) {
        localStorage.setItem('token',        result.token);
        if (result.refreshToken) localStorage.setItem('refreshToken', result.refreshToken);
        localStorage.setItem('userEmail', result.data.email);

        // Trust ONLY the backend role — never infer admin from email domain
        const backendRole = result.data.role || 'user';
        const isOrgAdmin  = backendRole === 'admin';

        const userData = {
          email:     result.data.email,
          firstName: result.data.firstName || form.firstName,
          lastName:  result.data.lastName  || form.lastName,
          id:        result.data._id,
          role:      backendRole,
        };

        localStorage.setItem('userInfo', JSON.stringify(userData));
        login(userData);

        setApiSuccess('Welcome to NXL Beauty Bar! Your account has been created.');
        setForm({ email: '', password: '', confirmPassword: '', firstName: '', lastName: '' });

        setTimeout(() => navigate(isOrgAdmin ? '/admin-dashboard' : '/dashboard', { replace: true }), 1500);
      } else {
        setApiError(result.error || 'Signup failed. Please try again.');
      }
    } catch {
      setApiError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nxl-signup-bg">
      <div className="nxl-signup-card">

        <div className="nxl-signup-brand">
          <div className="nxl-signup-dot-ring">✨</div>
          <h1>Join NXL Beauty Bar</h1>
          <p>Create your account to start booking your nail appointments</p>
        </div>

        <div className="nxl-signup-panel">
          <form onSubmit={handleSubmit} noValidate>

            <div className="nxl-signup-row">
              <div className="nxl-signup-field">
                <label>First Name</label>
                <input type="text" name="firstName" value={form.firstName}
                  onChange={handleChange} disabled={loading} placeholder="First name" />
                {errors.firstName && <span className="nxl-signup-error-inline">{errors.firstName}</span>}
              </div>
              <div className="nxl-signup-field">
                <label>Last Name</label>
                <input type="text" name="lastName" value={form.lastName}
                  onChange={handleChange} disabled={loading} placeholder="Last name" />
                {errors.lastName && <span className="nxl-signup-error-inline">{errors.lastName}</span>}
              </div>
            </div>

            <div className="nxl-signup-field">
              <label>Email Address</label>
              <input type="email" name="email" value={form.email}
                onChange={handleChange} disabled={loading}
                placeholder="Enter your email address" />
              {errors.email && <span className="nxl-signup-error-inline">{errors.email}</span>}
            </div>

            <div className="nxl-signup-field">
              <label>Password</label>
              <input type="password" name="password" value={form.password}
                onChange={handleChange} disabled={loading}
                placeholder="Create a strong password" />
              {errors.password && <span className="nxl-signup-error-inline">{errors.password}</span>}
            </div>

            <div className="nxl-signup-field">
              <label>Confirm Password</label>
              <input type="password" name="confirmPassword" value={form.confirmPassword}
                onChange={handleChange} disabled={loading}
                placeholder="Confirm your password" />
              {errors.confirmPassword && <span className="nxl-signup-error-inline">{errors.confirmPassword}</span>}
            </div>

            {/* ── Referral code ── */}
            {refInfo ? (
              <div style={{background:'rgba(16,185,129,0.12)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:'10px',padding:'0.75rem 1rem',display:'flex',alignItems:'center',gap:'0.75rem'}}>
                <span style={{fontSize:'1.2rem'}}>🎁</span>
                <div>
                  <p style={{margin:0,fontSize:'0.82rem',fontWeight:700,color:'#7dca9e'}}>{refInfo.message}</p>
                  <p style={{margin:'0.1rem 0 0',fontSize:'0.72rem',color:'rgba(255,232,214,0.5)'}}>Code: <strong style={{color:'rgba(255,232,214,0.8)'}}>{refCode.toUpperCase()}</strong></p>
                </div>
                <button type="button" onClick={() => { setRefCode(''); setRefInfo(null); }} style={{marginLeft:'auto',background:'none',border:'none',color:'rgba(255,232,214,0.4)',cursor:'pointer',fontSize:'0.9rem'}}>✕</button>
              </div>
            ) : (
              <div className="nxl-signup-field">
                <label>Referral Code <span style={{opacity:0.5,fontWeight:400}}>(optional)</span></label>
                <div style={{display:'flex',gap:'0.5rem'}}>
                  <input
                    type="text"
                    value={refCode}
                    onChange={e => { setRefCode(e.target.value.toUpperCase()); setRefError(''); setRefInfo(null); }}
                    placeholder="e.g. NXLAB12CD34"
                    style={{flex:1,padding:'0.7rem 0.9rem',background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(255,232,214,0.2)',borderRadius:'10px',color:'#ffe8d6',fontFamily:'DM Sans, sans-serif',fontSize:'0.88rem',outline:'none',fontFamily:'monospace',letterSpacing:'0.08em'}}
                  />
                  <button type="button" onClick={() => validateRefCode(refCode)} disabled={!refCode.trim() || refLoading}
                    style={{padding:'0 1rem',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,232,214,0.2)',borderRadius:'10px',color:'rgba(255,232,214,0.7)',cursor:'pointer',fontSize:'0.8rem',fontWeight:600,whiteSpace:'nowrap'}}>
                    {refLoading ? '…' : 'Apply'}
                  </button>
                </div>
                {refError && <span className="nxl-signup-error-inline">{refError}</span>}
              </div>
            )}

            <button type="submit" className="nxl-signup-submit" disabled={loading}>
              {loading ? 'Creating Account…' : 'Create Account'}
            </button>

            {apiSuccess && <div className="nxl-signup-success-msg">{apiSuccess}</div>}
            {apiError   && <div className="nxl-signup-error-msg">{apiError}</div>}

          </form>

          <div className="nxl-signup-footer">
            <p>Already have an account? <Link to="/login">Sign In</Link></p>
            <Link to="/" className="nxl-signup-back">← Back to Home</Link>
          </div>
        </div>

      </div>
      <div className="nxl-signup-footer-bar">NXL Beauty Bar</div>
    </div>
  );
}

export default SignupForm;