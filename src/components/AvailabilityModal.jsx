import { useState } from 'react';

export default function AvailabilityModal({ staff, onClose, onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    employeeId: 'ALL',
    reason: ''
  });
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    
    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.time) newErrors.time = 'Time is required';
    if (!formData.reason.trim()) newErrors.reason = 'Reason is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSubmit(formData);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Block Time Slot</h3>
          <button onClick={onClose}>✕</button>
        </header>
        
        <form onSubmit={handleSubmit} className="form-grid">
          <div>
            <label>Employee *</label>
            <select
              value={formData.employeeId}
              onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
            >
              <option value="ALL">All Staff (Salon-wide)</option>
              {staff.filter(s => s.isActive).map(emp => (
                <option key={emp._id} value={emp._id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Date *</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
            />
            {errors.date && <span className="error">{errors.date}</span>}
          </div>

          <div>
            <label>Time *</label>
            <input
              type="time"
              value={formData.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
            />
            {errors.time && <span className="error">{errors.time}</span>}
          </div>

          <div>
            <label>Reason *</label>
            <input
              type="text"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="e.g., Holiday, Maintenance, Break"
            />
            {errors.reason && <span className="error">{errors.reason}</span>}
          </div>

          <footer className="modal-actions">
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Blocking...' : 'Block Time'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
