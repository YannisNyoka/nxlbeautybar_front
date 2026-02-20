import { useState, useEffect } from 'react';

export default function StaffModal({ services, staff, onClose, onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    servicesOffered: [],
    workingHours: {
      monday: { start: '09:00', end: '17:00', enabled: true },
      tuesday: { start: '09:00', end: '17:00', enabled: true },
      wednesday: { start: '09:00', end: '17:00', enabled: true },
      thursday: { start: '09:00', end: '17:00', enabled: true },
      friday: { start: '09:00', end: '17:00', enabled: true },
      saturday: { start: '09:00', end: '14:00', enabled: true },
      sunday: { start: '09:00', end: '17:00', enabled: false }
    }
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (staff) {
      setFormData({
        name: staff.name || '',
        email: staff.email || '',
        servicesOffered: staff.servicesOffered || [],
        workingHours: staff.workingHours || formData.workingHours
      });
    }
  }, [staff]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (formData.servicesOffered.length === 0) {
      newErrors.servicesOffered = 'At least one service must be selected';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSubmit(formData);
  };

  const toggleService = (serviceId) => {
    setFormData(prev => ({
      ...prev,
      servicesOffered: prev.servicesOffered.includes(serviceId)
        ? prev.servicesOffered.filter(id => id !== serviceId)
        : [...prev.servicesOffered, serviceId]
    }));
  };

  const updateWorkingHours = (day, field, value) => {
    setFormData(prev => ({
      ...prev,
      workingHours: {
        ...prev.workingHours,
        [day]: {
          ...prev.workingHours[day],
          [field]: value
        }
      }
    }));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{staff ? 'Edit Staff Member' : 'Add Staff Member'}</h3>
          <button onClick={onClose}>✕</button>
        </header>
        
        <form onSubmit={handleSubmit} className="form-grid">
          <div>
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Full name"
            />
            {errors.name && <span className="error">{errors.name}</span>}
          </div>

          <div>
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@example.com"
            />
            {errors.email && <span className="error">{errors.email}</span>}
          </div>

          <div>
            <label>Services Offered *</label>
            <div className="service-checkboxes">
              {services.filter(s => s.isActive).map(service => (
                <label key={service._id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.servicesOffered.includes(service._id)}
                    onChange={() => toggleService(service._id)}
                  />
                  {service.name}
                </label>
              ))}
            </div>
            {errors.servicesOffered && <span className="error">{errors.servicesOffered}</span>}
          </div>

          <div className="working-hours-section">
            <label>Working Hours</label>
            {Object.entries(formData.workingHours).map(([day, hours]) => (
              <div key={day} className="working-hours-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hours.enabled}
                    onChange={(e) => updateWorkingHours(day, 'enabled', e.target.checked)}
                  />
                  <span className="day-name">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                </label>
                {hours.enabled && (
                  <>
                    <input
                      type="time"
                      value={hours.start}
                      onChange={(e) => updateWorkingHours(day, 'start', e.target.value)}
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={hours.end}
                      onChange={(e) => updateWorkingHours(day, 'end', e.target.value)}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          <footer className="modal-actions">
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : staff ? 'Update Staff' : 'Add Staff'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
