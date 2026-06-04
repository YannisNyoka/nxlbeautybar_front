import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import WhatsAppButton   from './WhatsAppButton';
import WelcomeBanner    from './WelcomeBanner';
import RouteTracker     from './RouteTracker';
import FlashSaleBanner  from './FlashSaleBanner';
import InstallPrompt    from './InstallPrompt';

// ── Existing pages ─────────────────────────────────────────────────────────
import HomePage       from './HomePage';
import Signup         from './Signup';
import SignIn         from './SignIn';
import Dashboard      from './Dashboard';
import PaymentPage    from './PaymentPage';
import UserProfile    from './UserProfile';
import PaymentSuccess from './PaymentSuccess';
import PaymentCancel  from './PaymentCancel';
import AdminDashboard from './AdminDashboard';
import ResetPassword  from './ResetPassword';
import './App.css';

// ── Auth ───────────────────────────────────────────────────────────────────
import { useAuth }     from './AuthContext';
import { CartProvider } from './hooks/useCart';

// ── Shop pages ─────────────────────────────────────────────────────────────
import ShopPage          from './ShopPage';
import ProductDetailPage from './ProductDetailPage';
import CartPage          from './CartPage';
import CheckoutPage      from './CheckoutPage';
import OrderSuccessPage  from './OrderSuccessPage';
import OrdersPage        from './OrdersPage';
import OrderTrackingPage from './OrderTrackingPage';
import BookingPage       from './BookingPage';
import ClientGallery     from './ClientGallery';
import SubscriptionsPage from './SubscriptionsPage';

// ── Loading screen ─────────────────────────────────────────────────────────
const LoadingScreen = () => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0e0b09',
    color: '#c9a96e',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: '0.9rem',
    gap: '0.75rem',
    flexDirection: 'column',
  }}>
    <div style={{
      width: '36px',
      height: '36px',
      border: '3px solid rgba(201,169,110,0.2)',
      borderTopColor: '#c9a96e',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    Loading…
  </div>
);

// ── Protected Route ────────────────────────────────────────────────────────
function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  console.log('ProtectedRoute check:', {
    path: location.pathname,
    isAuthenticated,
    user,
    loading,
    adminOnly,
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
    });

    if (!isOrgAdmin) {
      console.log('Not admin, redirecting to /dashboard');
      return <Navigate to="/dashboard" replace />;
    }
  }

  console.log('Access granted to:', location.pathname);
  return children;
}

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  return (
    <CartProvider>
      <div className="App" style={{ width: '100%', maxWidth: '100%', padding: 0, margin: 0 }}>
        <FlashSaleBanner />
        <RouteTracker />
        <WelcomeBanner />
        <WhatsAppButton />
        <InstallPrompt />
        <Routes>

          {/* ── Public pages ───────────────────────────────────────────── */}
          <Route path="/"              element={<HomePage />} />
          <Route path="/login"         element={<SignIn />} />
          <Route path="/signup"        element={<Signup onSignup={() => window.location.replace('/')} />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* ── Shop ───────────────────────────────────────────────────── */}
          <Route path="/shop"                element={<ShopPage />} />
          <Route path="/shop/product/:id"    element={<ProductDetailPage />} />
          <Route path="/cart"                element={<CartPage />} />
          <Route path="/checkout"            element={<CheckoutPage />} />
          <Route path="/shop/order-success"  element={<OrderSuccessPage />} />
          <Route path="/orders"              element={<OrdersPage />} />
          <Route path="/track/:id"           element={<OrderTrackingPage />} />
          <Route path="/track"               element={<OrderTrackingPage />} />
          <Route path="/book"                element={<BookingPage />} />
          <Route path="/gallery"             element={<ClientGallery />} />
          <Route path="/subscriptions"       element={<SubscriptionsPage />} />
          <Route path="/subscriptions/success" element={<SubscriptionsPage />} />

          {/* ── Protected user pages ───────────────────────────────────── */}
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

          {/* ── Payment (appointment) ──────────────────────────────────── */}
          <Route path="/payment"         element={<PaymentPage />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/payment-cancel"  element={<PaymentCancel />} />

          {/* ── Admin ──────────────────────────────────────────────────── */}
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* ── Fallback ───────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" />} />

        </Routes>
      </div>
    </CartProvider>
  );
}

export default App;