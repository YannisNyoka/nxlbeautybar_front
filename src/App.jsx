import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomePage from './HomePage';
import Signup from './Signup';
import SignIn from './SignIn';
import Dashboard from './Dashboard';
import PaymentPage from './PaymentPage';
import UserProfile from './UserProfile';
import './App.css';
import AdminDashboard from './AdminDashboard';
import { useAuth } from './AuthContext';

const LoadingScreen = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    Loading...
  </div>
);

// --- ProtectedRoute component ---
function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  console.log('ProtectedRoute check:', { 
    path: location.pathname,
    isAuthenticated, 
    user, 
    loading, 
    adminOnly 
  });

  if (loading) return <LoadingScreen />;

  if (!isAuthenticated) {
    console.log('Not authenticated, redirecting to /login');
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (adminOnly) {
    const isOrgAdmin =
      user?.role === 'admin' ||
      user?.email?.toLowerCase().includes('@nxlbeautybar.com');
    
    console.log('Admin check:', { 
      userRole: user?.role, 
      userEmail: user?.email, 
      isOrgAdmin,
      willAllow: isOrgAdmin
    });
    
    if (!isOrgAdmin) {
      console.log('Not admin, redirecting to /dashboard');
      return <Navigate to="/dashboard" replace />;
    }
  }

  console.log('Access granted to:', location.pathname);
  return children;
}

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/signup" element={<Signup onSignup={() => window.location.replace('/')} />} />
        <Route path="/login" element={<SignIn />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <UserProfile />
            </ProtectedRoute>
          }
        />
        <Route path="/payment" element={<PaymentPage />} />
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute adminOnly>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default App;
