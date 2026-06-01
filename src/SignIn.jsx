import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './SignIn.css';

function SignIn({ onSignIn }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSuccess, setApiSuccess] = useState('');

  // ── Forgot-password state ──────────────────────────────────────────────────
  const [showForgot,    setShowForgot]    = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError,   setForgotError]   = useState('');
  const [forgotSent,    setForgotSent]    = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  const validate = () => {
    const newErrors = {};
    if (!form.email) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = 'Invalid email format';
    if (!form.password) newErrors.password = 'Password is required';
    return newErrors;
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: undefined });
    setApiError(''); setApiSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(''); setApiSuccess('');
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const result = await response.json();

      if (result.success) {
        localStorage.setItem('token',        result.token);
        localStorage.setItem('refreshToken', result.refreshToken);
        localStorage.setItem('userEmail',    result.data.email);

        // Trust ONLY the backend role — never infer admin from email domain
        const backendRole = result.data.role || 'user';
        const isOrgAdmin  = backendRole === 'admin';

        const userData = {
          email:     result.data.email,
          firstName: result.data.firstName || 'User',
          lastName:  result.data.lastName  || '',
          id:        result.data._id,
          role:      backendRole,
        };

        localStorage.setItem('userInfo', JSON.stringify(userData));
        login(userData);

        setApiSuccess('Welcome back! Signing you in…');
        setForm({ email: '', password: '' });

        const from = location.state?.from?.pathname || (isOrgAdmin ? '/admin-dashboard' : '/dashboard');
        setTimeout(() => { navigate(from, { replace: true }); onSignIn?.(); }, 100);
      } else {
        setApiError(result.error || (result.errors?.[0]?.msg) || 'Invalid email or password.');
      }
    } catch {
      setApiError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password ────────────────────────────────────────────────────────
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError('');
    if (!forgotEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
      setForgotError('Please enter a valid email address.'); return;
    }
    setForgotLoading(true);
    try {
      const res    = await fetch(`${API_BASE_URL}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const result = await res.json();
      if (result.success) { setForgotSent(true); }
      else { setForgotError(result.error || 'Something went wrong. Please try again.'); }
    } catch {
      setForgotError('Network error. Please check your connection and try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgotPanel = () => {
    setShowForgot(false); setForgotEmail('');
    setForgotError(''); setForgotSent(false);
  };

  return (
    <div className="nxl-signin-bg">
      <div className="nxl-signin-card">

        <div className="nxl-signin-brand">
          <div className="nxl-signin-dot-ring"></div>
          <h1>Welcome Back</h1>
          <p>Sign in to your NXL Beauty Bar account</p>
        </div>

        {/* ── Forgot Password panel ─────────────────────────────────── */}
        {showForgot ? (
          <div className="nxl-signin-panel">
            {forgotSent ? (
              <div className="nxl-forgot-sent">
                <div className="nxl-forgot-sent-icon">📧</div>
                <h2>Check Your Email</h2>
                <p>If <strong>{forgotEmail}</strong> is registered, a reset link has been sent. Check your inbox and spam folder.</p>
                <button className="nxl-forgot-back-btn" onClick={resetForgotPanel}>← Back to Sign In</button>
              </div>
            ) : (
              <>
                <div className="nxl-forgot-header">
                  <h2>Reset Password</h2>
                  <p>Enter your account email and we'll send a reset link.</p>
                </div>
                <form onSubmit={handleForgotSubmit} noValidate>
                  <div className="nxl-signin-field">
                    <label>Email Address</label>
                    <input type="email" value={forgotEmail} autoFocus
                      onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                      disabled={forgotLoading} placeholder="Enter your registered email" />
                    {forgotError && <span className="nxl-signin-error-inline">{forgotError}</span>}
                  </div>
                  <button type="submit" className="nxl-signin-submit" disabled={forgotLoading}>
                    {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
                <div className="nxl-signin-footer">
                  <button className="nxl-forgot-back-btn" onClick={resetForgotPanel}>← Back to Sign In</button>
                </div>
              </>
            )}
          </div>

        ) : (
        /* ── Sign In panel ───────────────────────────────────────────── */
          <div className="nxl-signin-panel">
            <form onSubmit={handleSubmit} noValidate>
              <div className="nxl-signin-field">
                <label>Email Address</label>
                <input type="email" name="email" value={form.email}
                  onChange={handleChange} disabled={loading}
                  placeholder="Enter your email address" />
                {errors.email && <span className="nxl-signin-error-inline">{errors.email}</span>}
              </div>

              <div className="nxl-signin-field">
                <label>Password</label>
                <input type="password" name="password" value={form.password}
                  onChange={handleChange} disabled={loading}
                  placeholder="Enter your password" />
                {errors.password && <span className="nxl-signin-error-inline">{errors.password}</span>}
              </div>

              <div className="nxl-forgot-link-row">
                <button type="button" className="nxl-forgot-link"
                  onClick={() => { setShowForgot(true); setApiError(''); setApiSuccess(''); }}>
                  Forgot password?
                </button>
              </div>

              <button type="submit" className="nxl-signin-submit" disabled={loading}>
                {loading ? 'Signing In…' : 'Sign In'}
              </button>

              {apiSuccess && <div className="nxl-signin-success-msg">{apiSuccess}</div>}
              {apiError   && <div className="nxl-signin-error-msg">{apiError}</div>}
            </form>

            <div className="nxl-signin-footer">
              <p>Don't have an account? <Link to="/signup">Create Account</Link></p>
              <Link to="/" className="nxl-signin-back">← Back to Home</Link>
            </div>
          </div>
        )}

      </div>
      <div className="nxl-signin-footer-bar">NXL Beauty Bar</div>
    </div>
  );
}

export default SignIn;