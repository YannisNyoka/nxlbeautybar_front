import { useState, useEffect } from 'react';

export default function EditAppointmentModal({ appointment, services, staff, clients, onClose, onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({
    clientId: '',
    employeeId: '',
    serviceIds: [],
    date: '',
    time: '',
    notes: '',
    status: 'booked'
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (appointment) {
      setFormData({
        clientId: appointment.userId || '',
        employeeId: appointment.employeeId || '',
        serviceIds: appointment.serviceIds || [],
        date: appointment.date || '',
        time: appointment.time || '',
        notes: appointment.notes || '',
        status: appointment.status || 'booked'
      });
    }
  }, [appointment]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    
    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.time) newErrors.time = 'Time is required';
    if (!formData.employeeId) newErrors.employeeId = 'Staff member is required';
    if (formData.serviceIds.length === 0) newErrors.serviceIds = 'At least one service is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSubmit(formData);
  };

  const toggleService = (serviceId) => {
    setFormData(prev => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter(id => id !== serviceId)
        : [...prev.serviceIds, serviceId]
    }));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Edit Appointment</h3>
          <button onClick={onClose}>✕</button>
        </header>
        
        <form onSubmit={handleSubmit} className="form-grid">
          <div>
            <label>Staff Member *</label>
            <select
              value={formData.employeeId}
              onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
            >
              <option value="">Select staff</option>
              {staff.filter(s => s.isActive).map(emp => (
                <option key={emp._id} value={emp._id}>{emp.name}</option>
              ))}
            </select>
            {errors.employeeId && <span className="error">{errors.employeeId}</span>}
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label>Services *</label>
            <div className="service-checkboxes">
              {services.filter(s => s.isActive).map(service => (
                <label key={service._id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.serviceIds.includes(service._id)}
                    onChange={() => toggleService(service._id)}
                  />
                  {service.name} (R{service.price.toFixed(2)} - {service.durationMinutes}min)
                </label>
              ))}
            </div>
            {errors.serviceIds && <span className="error">{errors.serviceIds}</span>}
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
            <label>Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="booked">Booked</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no-show">No Show</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any special requests or notes"
            />
          </div>

          <footer className="modal-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Appointment'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
