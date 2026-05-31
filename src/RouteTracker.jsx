import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from './analytics';

// Map of paths to human-readable page titles
const PAGE_TITLES = {
  '/':                    'Home — NXL Beauty Bar',
  '/login':               'Sign In — NXL Beauty Bar',
  '/signup':              'Create Account — NXL Beauty Bar',
  '/dashboard':           'My Bookings — NXL Beauty Bar',
  '/shop':                'Shop — NXL Beauty Bar',
  '/cart':                'Cart — NXL Beauty Bar',
  '/checkout':            'Checkout — NXL Beauty Bar',
  '/shop/order-success':  'Order Confirmed — NXL Beauty Bar',
  '/orders':              'My Orders — NXL Beauty Bar',
  '/admin-dashboard':     'Admin Dashboard — NXL Beauty Bar',
  '/payment':             'Payment — NXL Beauty Bar',
  '/payment-success':     'Payment Successful — NXL Beauty Bar',
  '/payment-cancel':      'Payment Cancelled — NXL Beauty Bar',
  '/reset-password':      'Reset Password — NXL Beauty Bar',
  '/profile':             'My Profile — NXL Beauty Bar',
};

function getTitle(pathname) {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Dynamic routes
  if (pathname.startsWith('/shop/product/')) return 'Product — NXL Beauty Bar';
  return 'NXL Beauty Bar';
}

export default function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    const title = getTitle(location.pathname);
    // Update document title
    document.title = title;
    // Track in GA4
    trackPageView(location.pathname + location.search, title);
  }, [location]);

  return null; // renders nothing
}