import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Signup.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const api = {
  async signup(form) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      let data = {};
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else if (res.status === 404) {
        throw new Error('API endpoint not found. Is your backend running on port 3000?');
      } else {
        throw new Error('Server returned non-JSON response');
      }
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      return { success: true, ...data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

function SignupForm() {
  const { login } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSuccess, setApiSuccess] = useState('');

  const navigate = useNavigate();

  const validate = () => {
    const newErrors = {};
    if (!form.email) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = 'Invalid email format';
    if (!form.password) newErrors.password = 'Password is required';
    else if (
      form.password.length < 8 ||
      !/[A-Z]/.test(form.password) ||
      !/[a-z]/.test(form.password) ||
      !/[0-9]/.test(form.password) ||
      !/[^A-Za-z0-9]/.test(form.password)
    ) {
      newErrors.password = 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character';
    }
    if (!form.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (!form.firstName) newErrors.firstName = 'First name is required';
    if (!form.lastName) newErrors.lastName = 'Last name is required';
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
        const result = await api.signup(form);
        if (result.success) {
          localStorage.setItem('token', result.token);
          if (result.refreshToken) localStorage.setItem('refreshToken', result.refreshToken);
          localStorage.setItem('userEmail', result.data.email);

          const normalizedEmail = (result.data.email || '').toLowerCase();
          const backendRole = result.data.role || 'user';
          const isOrgAdmin = backendRole === 'admin' || normalizedEmail.includes('@nxlbeautybar.com');

          const userData = {
            email: result.data.email,
            firstName: result.data.firstName || form.firstName,
            lastName: result.data.lastName || form.lastName,
            id: result.data._id,
            role: isOrgAdmin ? 'admin' : backendRole
          };

          localStorage.setItem('userInfo', JSON.stringify(userData));
          login(userData);

          setApiSuccess('Welcome to NXL Beauty Bar! Your account has been created successfully.');
          setSubmitted(true);
          setForm({ email: '', password: '', confirmPassword: '', firstName: '', lastName: '' });

          const targetPath = isOrgAdmin ? '/admin-dashboard' : '/dashboard';
          setTimeout(() => { navigate(targetPath, { replace: true }); }, 1500);
        } else {
          setApiError(result.error || 'Signup failed. Please try again.');
          setSubmitted(false);
        }
      } catch (err) {
        setApiError('Network error. Please check your connection and try again.');
        setSubmitted(false);
      } finally {
        setLoading(false);
      }
    } else {
      setSubmitted(false);
    }
  };

  return (
    <div className="nxl-signup-bg">
      <div className="nxl-signup-card">

        {/* Brand */}
        <div className="nxl-signup-brand">
          <div className="nxl-signup-dot-ring">✨</div>
          <h1>Join NXL Beauty Bar</h1>
          <p>Create your account to start booking your nail appointments</p>
        </div>

        {/* Form Panel */}
        <div className="nxl-signup-panel">
          <form onSubmit={handleSubmit} noValidate>

            {/* Name row */}
            <div className="nxl-signup-row">
              <div className="nxl-signup-field">
                <label>First Name</label>
                <input
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="First name"
                />
                {errors.firstName && <span className="nxl-signup-error-inline">{errors.firstName}</span>}
              </div>

              <div className="nxl-signup-field">
                <label>Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  disabled={loading}
                  placeholder="Last name"
                />
                {errors.lastName && <span className="nxl-signup-error-inline">{errors.lastName}</span>}
              </div>
            </div>

            <div className="nxl-signup-field">
              <label>Email Address</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                disabled={loading}
                placeholder="Enter your email address"
              />
              {errors.email && <span className="nxl-signup-error-inline">{errors.email}</span>}
            </div>

            <div className="nxl-signup-field">
              <label>Password</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                disabled={loading}
                placeholder="Create a strong password"
              />
              {errors.password && <span className="nxl-signup-error-inline">{errors.password}</span>}
            </div>

            <div className="nxl-signup-field">
              <label>Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                disabled={loading}
                placeholder="Confirm your password"
              />
              {errors.confirmPassword && <span className="nxl-signup-error-inline">{errors.confirmPassword}</span>}
            </div>

            <button type="submit" className="nxl-signup-submit" disabled={loading}>
              {loading ? 'Creating Account…' : 'Create Account'}
            </button>

            {apiSuccess && <div className="nxl-signup-success-msg">{apiSuccess}</div>}
            {apiError   && <div className="nxl-signup-error-msg">{apiError}</div>}

          </form>

          {/* Footer Links */}
          <div className="nxl-signup-footer">
            <p>Already have an account? <Link to="/login">Sign In</Link></p>
            <Link to="/" className="nxl-signup-back">← Back to Home</Link>
          </div>
        </div>

      </div>

      {/* Footer Bar */}
      <div className="nxl-signup-footer-bar">NXL Beauty Bar</div>
    </div>
  );
}

export default SignupForm;