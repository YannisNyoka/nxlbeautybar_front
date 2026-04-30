import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './SignIn.css';

function SignIn({ onSignIn }) {
  const [form, setForm] = useState({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSuccess, setApiSuccess] = useState('');

  // ── NEW: forgot-password state ─────────────────────────────────────────────
  const [showForgot, setShowForgot]         = useState(false);
  const [forgotEmail, setForgotEmail]       = useState('');
  const [forgotLoading, setForgotLoading]   = useState(false);
  const [forgotError, setForgotError]       = useState('');
  const [forgotSuccess, setForgotSuccess]   = useState('');
  // ──────────────────────────────────────────────────────────────────────────

  const { login } = useAuth();
  const navigate = useNavigate();

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  if (!import.meta.env.VITE_API_BASE_URL) {
    console.warn('VITE_API_BASE_URL is not set, using fallback:', API_BASE_URL);
  }

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
    setApiError('');
    setApiSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setApiSuccess('');
    const validationErrors = validate();
    setErrors(validationErrors);
    
    if (Object.keys(validationErrors).length === 0) {
      setLoading(true);
      try {
        console.log('Attempting login to:', `${API_BASE_URL}/auth/login`);
        
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email,
            password: form.password
          })
        });
        
        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Login response:', result);

        if (result.success) {
          localStorage.setItem('token', result.token);
          localStorage.setItem('refreshToken', result.refreshToken);
          localStorage.setItem('userEmail', result.data.email);

          const normalizedEmail = (result.data.email || '').toLowerCase();
          const backendRole = result.data.role || 'user';
          const emailIsAdmin = normalizedEmail.includes('@nxlbeautybar.com');
          const roleIsAdmin = backendRole === 'admin';
          const isOrgAdmin = roleIsAdmin || emailIsAdmin;

          console.log('Admin Detection:', { normalizedEmail, backendRole, emailIsAdmin, roleIsAdmin, isOrgAdmin });

          const userData = {
            email: result.data.email,
            firstName: result.data.firstName || 'User',
            lastName: result.data.lastName || '',
            id: result.data._id,
            role: isOrgAdmin ? 'admin' : backendRole
          };

          console.log('UserData created:', userData);
          localStorage.setItem('userInfo', JSON.stringify(userData));
          console.log('Stored in localStorage:', localStorage.getItem('userInfo'));

          login(userData);
          console.log('Called login() with userData');

          setApiSuccess('Welcome back! You have successfully signed in.');

          const targetPath = isOrgAdmin ? '/admin-dashboard' : '/dashboard';
          console.log('Navigation details:', { isOrgAdmin, targetPath, willNavigateTo: targetPath });

          setForm({ email: '', password: '' });

          setTimeout(() => {
            console.log('Navigating to:', targetPath);
            navigate(targetPath, { replace: true });
            onSignIn?.();
          }, 100);
        } else {
          console.error('Login failed:', result);
          setApiError(result.error || (result.errors && result.errors[0]?.msg) || 'Invalid email or password. Please try again.');
        }
      } catch (err) {
        console.error('Login error:', err);
        setApiError('Network error. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  // ── NEW: forgot-password submit ────────────────────────────────────────────
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
      setForgotError('Please enter a valid email address.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const result = await res.json();
      if (result.success) {
        // The backend always returns success (even for unknown emails) to
        // prevent user enumeration — so we always show the same message.
        setForgotSuccess('If that email is registered, a reset link has been sent. Please check your inbox.');
        setForgotEmail('');
      } else {
        setForgotError(result.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setForgotError('Network error. Please check your connection and try again.');
    } finally {
      setForgotLoading(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="nxl-signin-bg">
      <div className="nxl-signin-card">

        {/* Brand */}
        <div className="nxl-signin-brand">
          <div className="nxl-signin-dot-ring">💅</div>
          <h1>Welcome Back</h1>
          <p>Sign in to your NXL Beauty Bar account</p>
        </div>

        {/* ── NEW: Forgot Password panel ──────────────────────────────────────── */}
        {showForgot ? (
          <div className="nxl-signin-panel">
            <div className="nxl-forgot-header">
              <h2>Reset Password</h2>
              <p>Enter your account email and we'll send you a reset link.</p>
            </div>

            <form onSubmit={handleForgotSubmit} noValidate>
              <div className="nxl-signin-field">
                <label>Email Address</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => { setForgotEmail(e.target.value); setForgotError(''); setForgotSuccess(''); }}
                  disabled={forgotLoading}
                  placeholder="Enter your registered email"
                />
                {forgotError   && <span className="nxl-signin-error-inline">{forgotError}</span>}
              </div>

              <button type="submit" className="nxl-signin-submit" disabled={forgotLoading}>
                {forgotLoading ? 'Sending…' : 'Send Reset Link'}
              </button>

              {forgotSuccess && <div className="nxl-signin-success-msg">{forgotSuccess}</div>}
            </form>

            <div className="nxl-signin-footer">
              <button
                className="nxl-forgot-back-btn"
                onClick={() => { setShowForgot(false); setForgotEmail(''); setForgotError(''); setForgotSuccess(''); }}
              >
                ← Back to Sign In
              </button>
            </div>
          </div>
        ) : (
        /* ── Sign In panel (original, unchanged) ────────────────────────────── */
          <div className="nxl-signin-panel">
            <form onSubmit={handleSubmit} noValidate>

              <div className="nxl-signin-field">
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Enter your email address"
                />
                {errors.email && <span className="nxl-signin-error-inline">{errors.email}</span>}
              </div>

              <div className="nxl-signin-field">
                <label>Password</label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Enter your password"
                />
                {errors.password && <span className="nxl-signin-error-inline">{errors.password}</span>}
              </div>

              {/* NEW: Forgot password link — sits below the password field */}
              <div className="nxl-forgot-link-row">
                <button
                  type="button"
                  className="nxl-forgot-link"
                  onClick={() => { setShowForgot(true); setApiError(''); setApiSuccess(''); }}
                >
                  Forgot password?
                </button>
              </div>

              <button type="submit" className="nxl-signin-submit" disabled={loading}>
                {loading ? 'Signing In…' : 'Sign In'}
              </button>

              {apiSuccess && <div className="nxl-signin-success-msg">{apiSuccess}</div>}
              {apiError   && <div className="nxl-signin-error-msg">{apiError}</div>}

            </form>

            {/* Footer Links — unchanged */}
            <div className="nxl-signin-footer">
              <p>Don't have an account? <Link to="/signup" className="">Create Account</Link></p>
              <Link to="/" className="nxl-signin-back">← Back to Home</Link>
            </div>
          </div>
        )}
        {/* ────────────────────────────────────────────────────────────────────── */}

      </div>

      {/* Footer Bar */}
      <div className="nxl-signin-footer-bar">NXL Beauty Bar</div>
    </div>
  );
}

export default SignIn;