/**
 * InstallPrompt — PWA install banner
 *
 * Shows a polished bottom sheet on mobile when the browser fires
 * `beforeinstallprompt`. Dismissed state is persisted so it doesn't
 * re-appear for 7 days. Also handles iOS Safari which doesn't fire
 * the event — shows a manual "Add to Home Screen" guide instead.
 */
import { useState, useEffect } from 'react';
import './InstallPrompt.css';

const DISMISS_KEY    = 'nxl-pwa-dismissed';
const DISMISS_DAYS   = 7;

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}
function wasDismissedRecently() {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return (Date.now() - parseInt(ts)) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible,        setVisible]        = useState(false);
  const [isIOSDevice,    setIsIOSDevice]     = useState(false);
  const [installing,     setInstalling]      = useState(false);
  const [installed,      setInstalled]       = useState(false);

  useEffect(() => {
    // Already installed or dismissed recently → don't show
    if (isInStandaloneMode() || wasDismissedRecently()) return;

    // iOS Safari — no beforeinstallprompt, show manual guide
    if (isIOS()) {
      setIsIOSDevice(true);
      // Show after a short delay so the page has loaded
      const timer = setTimeout(() => setVisible(true), 3500);
      return () => clearTimeout(timer);
    }

    // Chrome / Edge / Android
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setVisible(true), 3500);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // If already installed via a different path
    window.addEventListener('appinstalled', () => {
      setVisible(false);
      setInstalled(true);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setVisible(false);
      }
    } catch {}
    setInstalling(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  if (!visible && !installed) return null;

  if (installed) return (
    <div className="ip-toast" role="status">
      ✅ NXL Beauty Bar added to your home screen!
    </div>
  );

  return (
    <div className="ip-backdrop" role="dialog" aria-modal="true" aria-label="Install NXL Beauty Bar app">
      <div className="ip-sheet" onClick={(e) => e.stopPropagation()}>

        {/* Handle */}
        <div className="ip-handle" />

        {/* App info */}
        <div className="ip-app-row">
          <img src="/android-chrome-192x192.png" alt="NXL Beauty Bar" className="ip-app-icon" />
          <div className="ip-app-info">
            <p className="ip-app-name">NXL Beauty Bar</p>
            <p className="ip-app-url">nxlbeautybar.co.za</p>
            <div className="ip-app-stars">{'★'.repeat(5)}</div>
          </div>
          <button className="ip-close" onClick={handleDismiss} aria-label="Close">✕</button>
        </div>

        <p className="ip-tagline">Book appointments, shop products & track orders — all from your home screen, even offline.</p>

        {/* Benefits */}
        <div className="ip-benefits">
          <div className="ip-benefit"><span>⚡</span> Faster than the browser</div>
          <div className="ip-benefit"><span>📵</span> Works offline</div>
          <div className="ip-benefit"><span>🔔</span> Booking reminders</div>
          <div className="ip-benefit"><span>📲</span> No app store needed</div>
        </div>

        {isIOSDevice ? (
          /* iOS manual guide */
          <div className="ip-ios-guide">
            <p className="ip-ios-title">Add to Home Screen:</p>
            <div className="ip-ios-steps">
              <div className="ip-ios-step">
                <span className="ip-ios-num">1</span>
                <span>Tap the <strong>Share</strong> button <span style={{fontSize:'1.1em'}}>⎏</span> at the bottom of Safari</span>
              </div>
              <div className="ip-ios-step">
                <span className="ip-ios-num">2</span>
                <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
              </div>
              <div className="ip-ios-step">
                <span className="ip-ios-num">3</span>
                <span>Tap <strong>Add</strong> in the top right</span>
              </div>
            </div>
            <button className="ip-btn-secondary" onClick={handleDismiss}>Got it, thanks</button>
          </div>
        ) : (
          /* Standard install */
          <div className="ip-actions">
            <button className="ip-btn-primary" onClick={handleInstall} disabled={installing}>
              {installing ? (
                <><span className="ip-spinner" /> Installing…</>
              ) : (
                <><span>📲</span> Add to Home Screen</>
              )}
            </button>
            <button className="ip-btn-secondary" onClick={handleDismiss}>
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}