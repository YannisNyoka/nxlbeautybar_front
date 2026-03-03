import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/dashboard'), 5000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem', background: '#fdf6f0' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Payment Successful!</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Your booking is confirmed. A confirmation email has been sent to you.
      </p>
      <p style={{ fontSize: '0.85rem', color: '#999' }}>Redirecting to your dashboard in 5 seconds...</p>
      <button
        onClick={() => navigate('/dashboard')}
        style={{ marginTop: '1.5rem', padding: '0.8rem 2rem', background: '#6b3f2a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}
      >
        Go to Dashboard
      </button>
    </div>
  );
};

export default PaymentSuccess;