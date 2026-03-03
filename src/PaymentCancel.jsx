import { useNavigate } from 'react-router-dom';

const PaymentCancel = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem', background: '#fdf6f0' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>❌</div>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Payment Cancelled</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Your booking has not been confirmed. No money was taken.
      </p>
      <button
        onClick={() => navigate('/dashboard')}
        style={{ padding: '0.8rem 2rem', background: '#6b3f2a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}
      >
        Back to Dashboard
      </button>
    </div>
  );
};

export default PaymentCancel;