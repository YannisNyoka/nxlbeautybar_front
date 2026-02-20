import { useState } from 'react';

export default function PaymentModal({ appointment, onClose, onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({
    amount: appointment?.totalPrice || '',
    method: 'card',
    type: 'full'
  });
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    
    if (!formData.amount || formData.amount <= 0) newErrors.amount = 'Valid amount required';
    if (!formData.method) newErrors.method = 'Payment method required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSubmit({ ...formData, appointmentId: appointment._id });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Record Payment</h3>
          <button onClick={onClose}>✕</button>
        </header>
        
        <form onSubmit={handleSubmit} className="form-grid">
          <div>
            <label>Payment Type *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="full">Full Payment</option>
              <option value="deposit">Deposit</option>
            </select>
          </div>

          <div>
            <label>Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="R0.00"
            />
            {errors.amount && <span className="error">{errors.amount}</span>}
          </div>

          <div>
            <label>Payment Method *</label>
            <select
              value={formData.method}
              onChange={(e) => setFormData({ ...formData, method: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="online">Online</option>
            </select>
            {errors.method && <span className="error">{errors.method}</span>}
          </div>

          <footer className="modal-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Processing...' : 'Record Payment'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
