// ============================================================
// NXL Beauty Bar — Google Analytics 4 Integration
// Measurement ID: G-3BKKGS0R98
// ============================================================
//
// Usage: import { trackEvent, trackPageView, ... } from './analytics'
//
// All functions are no-ops if gtag is not loaded (e.g. dev mode
// with no internet, or ad-blocker) so nothing breaks.
// ============================================================

const GA_ID = 'G-3BKKGS0R98';

// ── Safe gtag call ───────────────────────────────────────────
function gtag(...args) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag(...args);
  }
}

// ── Generic event ────────────────────────────────────────────
export function trackEvent(eventName, params = {}) {
  gtag('event', eventName, params);
}

// ── Page view (called on route changes) ─────────────────────
export function trackPageView(path, title) {
  gtag('config', GA_ID, {
    page_path:  path,
    page_title: title,
  });
}

// ============================================================
// BOOKING EVENTS
// ============================================================

// User views the booking / sign-in page
export function trackBookingStarted() {
  trackEvent('booking_started', {
    event_category: 'Booking',
    event_label:    'User started booking flow',
  });
}

// User successfully completed a booking + paid deposit
export function trackBookingCompleted({ serviceName, employeeName, date, amount }) {
  trackEvent('purchase', {
    transaction_id: `booking_${Date.now()}`,
    value:          amount,
    currency:       'ZAR',
    items: [{
      item_id:       'booking_deposit',
      item_name:     serviceName || 'Salon Appointment',
      item_category: 'Booking',
      item_brand:    employeeName || 'NXL Beauty Bar',
      price:         amount,
      quantity:      1,
    }],
  });
  trackEvent('booking_completed', {
    event_category: 'Booking',
    service_name:   serviceName,
    employee_name:  employeeName,
    booking_date:   date,
    value:          amount,
    currency:       'ZAR',
  });
}

// User cancelled an appointment
export function trackBookingCancelled({ serviceName }) {
  trackEvent('booking_cancelled', {
    event_category: 'Booking',
    service_name:   serviceName,
  });
}

// ============================================================
// SHOP EVENTS
// ============================================================

// User viewed the shop page
export function trackShopViewed(category = 'all') {
  trackEvent('view_item_list', {
    item_list_name: `Shop — ${category}`,
    event_category: 'Shop',
  });
}

// User viewed a product detail page
export function trackProductViewed({ productId, productName, category, price }) {
  trackEvent('view_item', {
    currency: 'ZAR',
    value:    price,
    items: [{
      item_id:       productId,
      item_name:     productName,
      item_category: category,
      price:         price,
      quantity:      1,
    }],
  });
}

// User added item to cart
export function trackAddToCart({ productId, productName, category, price, quantity }) {
  trackEvent('add_to_cart', {
    currency: 'ZAR',
    value:    price * quantity,
    items: [{
      item_id:       productId,
      item_name:     productName,
      item_category: category,
      price:         price,
      quantity,
    }],
  });
}

// User removed item from cart
export function trackRemoveFromCart({ productId, productName, price, quantity }) {
  trackEvent('remove_from_cart', {
    currency: 'ZAR',
    value:    price * quantity,
    items: [{
      item_id:  productId,
      item_name: productName,
      price,
      quantity,
    }],
  });
}

// User viewed cart
export function trackCartViewed({ items, total }) {
  trackEvent('view_cart', {
    currency: 'ZAR',
    value:    total,
    items:    items.map(i => ({
      item_id:   i.productId,
      item_name: i.name,
      price:     i.price,
      quantity:  i.quantity,
    })),
  });
}

// User started checkout
export function trackCheckoutStarted({ items, total }) {
  trackEvent('begin_checkout', {
    currency: 'ZAR',
    value:    total,
    items:    items.map(i => ({
      item_id:   i.productId,
      item_name: i.name,
      price:     i.price,
      quantity:  i.quantity,
    })),
  });
}

// User completed a shop order (after Yoco payment confirmed)
export function trackOrderCompleted({ orderId, items, subtotal, shippingFee, total }) {
  trackEvent('purchase', {
    transaction_id: orderId,
    value:          total,
    shipping:       shippingFee,
    currency:       'ZAR',
    items:          items.map(i => ({
      item_id:   i.productId || i.productName,
      item_name: i.productName || i.name,
      price:     parseFloat(i.unitPrice || i.price || 0),
      quantity:  i.quantity,
    })),
  });
}

// ============================================================
// USER EVENTS
// ============================================================

// User signed up
export function trackSignUp(method = 'email') {
  trackEvent('sign_up', {
    method,
    event_category: 'Auth',
  });
}

// User logged in
export function trackLogin(method = 'email') {
  trackEvent('login', {
    method,
    event_category: 'Auth',
  });
}

// ============================================================
// ENGAGEMENT EVENTS
// ============================================================

// User clicked WhatsApp button
export function trackWhatsAppClick(source = 'floating_button') {
  trackEvent('whatsapp_click', {
    event_category: 'Engagement',
    event_label:    source,
  });
}

// User clicked Get Directions
export function trackDirectionsClick() {
  trackEvent('get_directions', {
    event_category: 'Engagement',
    event_label:    'Hero location bar',
  });
}

// User dismissed welcome banner
export function trackBannerDismissed() {
  trackEvent('banner_dismissed', {
    event_category: 'Engagement',
    event_label:    'Welcome banner',
  });
}

// User clicked a banner CTA
export function trackBannerCTA(label) {
  trackEvent('banner_cta_click', {
    event_category: 'Engagement',
    event_label:    label,
  });
}