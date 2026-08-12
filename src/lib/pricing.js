// ── Shared pricing constants ────────────────────────────────────────────────
// Single source of truth for the booking deposit and loyalty math, replacing
// three different hardcoded/env-var values across BookingPage, BookingSummary,
// and PaymentPage (VITE_DEPOSIT_AMOUNT, VITE_BOOKING_FEE, and a bare 100).

export const DEPOSIT_AMOUNT = Number(import.meta.env.VITE_DEPOSIT_AMOUNT ?? 100);

// Must match LOYALTY_CONFIG in nxlbeautybar-api/server.js.
export const LOYALTY_CONFIG = {
  minRedemption: 100,
  pointValue: 0.10,
  maxRedemptionPct: 50,
};

export function loyaltyPointsToRands(points) {
  return parseFloat((points * LOYALTY_CONFIG.pointValue).toFixed(2));
}
