import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import './SignIn.css'; // reuses the same luxury sign-in stylesheet

/**
 * ResetPassword
 *
 * Rendered at /reset-password?token=<jwt>
 * Reads the token from the URL, lets the user set a new password,
 * then calls POST /auth/reset-password on the backend.
 *
 * Password rules (must match backend validators):
 *   - min 8 characters
 *   - at least one uppercase letter
 *   - at least one lowercase letter
 *   - at least one digit
 *   - at least one special character
 */
function ResetPassword() {
  const navigate  = useNavigate();
  const location  = useLocation();

  const [token,         setToken]         = useState('');
  const [form,          setForm]          = useState({ password: '', confirm: '' });
  const [errors,        setErrors]        = useState({});
  const [loading,       setLoading]       = useState(false);
  const [apiError,      setApiError]      = useState('');
  const [apiSuccess,    setApiSuccess]    = useState('');
  const [tokenMissing,  setTokenMissing]  = useState(false);
  const [showPassword,  setShowPassword]  = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  // Extract token from query string on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
    } else {
      setTokenMissing(true);
    }
  }, [location.search]);

  // Password strength rules
  const rules = [
    { label: '8+ characters',          test: v => v.length >= 8 },
    { label: 'Uppercase letter',        test: v => /[A-Z]/.test(v) },
    { label: 'Lowercase letter',        test: v => /[a-z]/.test(v) },
    { label: 'Number',                  test: v => /[0-9]/.test(v) },
    { label: 'Special character',       test: v => /[^A-Za-z0-9]/.test(v) },
  ];

  const validate = () => {
    const errs = {};
    if (!form.password) {
      errs.password = 'Password is required.';
    } else {
      const failing = rules.filter(r => !r.test(form.password));
      if (failing.length) errs.password = `Password must include: ${failing.map(r => r.label).join(', ')}.`;
    }
    if (!form.confirm) {
      errs.confirm = 'Please confirm your password.';
    } else if (form.password !== form.confirm) {
      errs.confirm = 'Passwords do not match.';
    }
    return errs;
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: undefined });
    setApiError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setApiSuccess('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: form.password }),
      });
      const result = await res.json();

      if (result.success) {
        setApiSuccess('Password reset successfully! Redirecting you to sign in…');
        setForm({ password: '', confirm: '' });
        setTimeout(() => navigate('/login', { replace: true }), 2500);
      } else {
        setApiError(result.error || 'Reset failed. The link may have expired. Please request a new one.');
      }
    } catch (err) {
      setApiError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Invalid / missing token state ──────────────────────────────────────────
  if (tokenMissing) {
    return (
      <div className="nxl-signin-bg">
        <div className="nxl-signin-card">
          <div className="nxl-signin-brand">
            <div className="nxl-signin-dot-ring">🔒</div>
            <h1>Invalid Link</h1>
            <p>This password reset link is missing or invalid.</p>
          </div>
          <div className="nxl-signin-panel" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
            <p style={{ color: '#9e7060', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Please request a new reset link from the sign-in page.
            </p>
            <Link to="/login" className="nxl-signin-submit" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
              Back to Sign In
            </Link>
          </div>
        </div>
        <div className="nxl-signin-footer-bar">NXL Beauty Bar</div>
      </div>
    );
  }

  // ── Main reset form ────────────────────────────────────────────────────────
  return (
    <div className="nxl-signin-bg">
      <div className="nxl-signin-card">

        {/* Brand */}
        <div className="nxl-signin-brand">
          <div className="nxl-signin-dot-ring">🔑</div>
          <h1>New Password</h1>
          <p>Choose a strong password for your NXL account</p>
        </div>

        <div className="nxl-signin-panel">
          {apiSuccess ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
              <div className="nxl-signin-success-msg" style={{ marginBottom: '1rem' }}>{apiSuccess}</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>

              {/* New password field */}
              <div className="nxl-signin-field">
                <label>New Password</label>
                <div className="nxl-password-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    className="nxl-password-toggle"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {errors.password && <span className="nxl-signin-error-inline">{errors.password}</span>}

                {/* Strength indicator */}
                {form.password && (
                  <div className="nxl-password-rules">
                    {rules.map(r => (
                      <div key={r.label} className={`nxl-password-rule ${r.test(form.password) ? 'pass' : 'fail'}`}>
                        <span>{r.test(form.password) ? '✓' : '○'}</span>
                        {r.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm password field */}
              <div className="nxl-signin-field">
                <label>Confirm Password</label>
                <div className="nxl-password-wrap">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    name="confirm"
                    value={form.confirm}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="Repeat new password"
                  />
                  <button
                    type="button"
                    className="nxl-password-toggle"
                    onClick={() => setShowConfirm(v => !v)}
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? '🙈' : '👁️'}
                  </button>
                </div>
                {errors.confirm && <span className="nxl-signin-error-inline">{errors.confirm}</span>}
              </div>

              <button type="submit" className="nxl-signin-submit" disabled={loading}>
                {loading ? 'Saving…' : 'Set New Password'}
              </button>

              {apiError && <div className="nxl-signin-error-msg">{apiError}</div>}
            </form>
          )}

          <div className="nxl-signin-footer">
            <Link to="/login" className="nxl-signin-back">← Back to Sign In</Link>
          </div>
        </div>

      </div>

      {/* Footer Bar */}
      <div className="nxl-signin-footer-bar">NXL Beauty Bar</div>
    </div>
  );
}

export default ResetPassword;