import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [prompt,  setPrompt]  = useState(null);
  const [visible, setVisible] = useState(false);
  const [ios,     setIos]     = useState(false);

  useEffect(() => {
    // Detect iOS (Safari doesn't fire beforeinstallprompt)
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
      && !window.matchMedia('(display-mode: standalone)').matches;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone;

    if (isStandalone) return; // already installed
    if (sessionStorage.getItem('nxl_install_dismissed')) return;

    if (isIos) {
      // Show iOS instructions after 10s
      setTimeout(() => { setIos(true); setVisible(true); }, 10000);
      return;
    }

    // Android/Chrome — listen for the native prompt
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      setTimeout(() => setVisible(true), 5000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem('nxl_install_dismissed', '1');
    setVisible(false);
  };

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
    setPrompt(null);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '5.5rem', left: '1.25rem', right: '1.25rem',
      maxWidth: '400px', margin: '0 auto',
      background: 'linear-gradient(135deg, #3d1f15, #6b3528)',
      border: '1px solid rgba(201,169,110,0.3)',
      borderRadius: '16px',
      padding: '1.1rem 1.25rem',
      display: 'flex', alignItems: 'center', gap: '0.875rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      zIndex: 8000,
      animation: 'ip-slide-up 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      <style>{`
        @keyframes ip-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>

      <img src="/android-chrome-192x192.png" alt="NXL Beauty Bar" style={{ width: 44, height: 44, borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: '2px solid rgba(201,169,110,0.4)' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 0.2rem', fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', fontWeight: 700, color: '#fdf6f0' }}>
          Add to Home Screen
        </p>
        <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: '0.72rem', color: 'rgba(255,220,190,0.65)', lineHeight: 1.45 }}>
          {ios
            ? "Tap the Share button, then 'Add to Home Screen'"
            : 'Install NXL Beauty Bar for quick access'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
        {!ios && (
          <button onClick={install} style={{
            background: '#c9a96e', color: '#3d1f15', border: 'none',
            borderRadius: '8px', padding: '0.4rem 0.875rem',
            fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            Install
          </button>
        )}
        <button onClick={dismiss} style={{
          background: 'rgba(255,255,255,0.08)', color: 'rgba(255,220,190,0.6)',
          border: '1px solid rgba(255,220,190,0.15)', borderRadius: '8px',
          padding: '0.4rem 0.875rem', fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          Not now
        </button>
      </div>
    </div>
  );
}