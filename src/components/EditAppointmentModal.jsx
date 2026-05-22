import { useState, useEffect } from 'react';

/**
 * EditAppointmentModal
 *
 * Fix: Only sends `status` in the payload when the admin actually changes it.
 * This prevents the backend "Invalid status transition" error when the
 * appointment is already booked and the admin only wants to change date/time/services.
 *
 * Also fixes: the Status dropdown now only shows valid next transitions
 * based on the current status, so the admin can never accidentally pick
 * an invalid option.
 */
export default function EditAppointmentModal({
  appointment,
  services = [],
  staff = [],
  clients = [],
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const [formData, setFormData] = useState({
    employeeId:    '',
    serviceIds:    [],
    date:          '',
    time:          '',
    status:        '',
    paymentStatus: '',
    paymentMethod: 'cash',
    notes:         '',
  });
  const [errors, setErrors] = useState({});

  // Valid transitions — mirrors the backend rule exactly.
  // Key: current status → Value: array of statuses the admin can move to.
  // We add the current status itself so admins can "save without changing status".
  const TRANSITIONS = {
    pending:   ['pending',   'booked', 'cancelled'],
    booked:    ['booked',    'cancelled', 'completed', 'no-show'],
    cancelled: ['cancelled'],
    completed: ['completed'],
    'no-show': ['no-show'],
  };

  const STATUS_LABELS = {
    pending:   '⚠️ Pending Payment',
    booked:    '✅ Booked',
    cancelled: '✕ Cancelled',
    completed: '✓ Completed',
    'no-show': '🚫 No Show',
  };

  // Pre-fill form from the appointment prop
  useEffect(() => {
    if (!appointment) return;
    setFormData({
      employeeId:    String(appointment.employeeId?._id || appointment.employeeId || ''),
      serviceIds:    (appointment.serviceIds || []).map(id =>
        typeof id === 'object' ? String(id._id || id) : String(id)
      ),
      date:          appointment.date || '',
      time:          appointment.time || '',
      status:        appointment.status || 'booked',
      paymentStatus: appointment.paymentStatus || 'unpaid',
      paymentMethod: 'cash',
      notes:         appointment.notes || '',
    });
    setErrors({});
  }, [appointment]);

  const toggleService = (id) => {
    setFormData(prev => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(id)
        ? prev.serviceIds.filter(s => s !== id)
        : [...prev.serviceIds, id],
    }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.employeeId)        errs.employeeId = 'Staff member is required';
    if (!formData.serviceIds.length) errs.serviceIds = 'At least one service is required';
    if (!formData.date)              errs.date       = 'Date is required';
    if (!formData.time)              errs.time       = 'Time is required';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    // ── KEY FIX ──────────────────────────────────────────────────────────────
    // Only include `status` in the payload when it actually changed.
    // If the admin didn't change the status (e.g. appointment is already
    // "booked" and they just change the time), omitting status entirely
    // avoids triggering the backend's transition validator.
    // ─────────────────────────────────────────────────────────────────────────
    const originalStatus = appointment?.status || '';
    const payload = {
      employeeId:    formData.employeeId,
      serviceIds:    formData.serviceIds,
      date:          formData.date,
      time:          formData.time,
      paymentStatus: formData.paymentStatus,
      notes:         formData.notes,
    };

    // Only add status if the admin changed it
    if (formData.status !== originalStatus) {
      payload.status = formData.status;
    }

    // Only add paymentMethod when marking as fully paid
    if (formData.paymentStatus === 'paid') {
      payload.paymentMethod = formData.paymentMethod;
    }

    await onSubmit(payload);
  };

  const allowedStatuses = TRANSITIONS[appointment?.status] || [appointment?.status];

  // Price/duration summary for selected services
  const selectedServices = services.filter(s => formData.serviceIds.includes(String(s._id)));
  const totalPrice    = selectedServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  return (
    <div
      className="modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ maxWidth: '640px', width: '100%' }}>
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0 }}>Edit Appointment</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </header>

        <form onSubmit={handleSubmit} className="form-grid">

          {/* Staff */}
          <div>
            <label>Staff Member *</label>
            <select
              value={formData.employeeId}
              onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
            >
              <option value="">Select staff</option>
              {staff.filter(s => s.isActive !== false).map(emp => (
                <option key={emp._id} value={String(emp._id)}>{emp.name}</option>
              ))}
            </select>
            {errors.employeeId && <span className="error">{errors.employeeId}</span>}
          </div>

          {/* Status — only valid transitions shown */}
          <div>
            <label>Status</label>
            <select
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value })}
            >
              {allowedStatuses.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
              ))}
            </select>
            <small style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: '0.25rem', display: 'block' }}>
              Current: <strong>{STATUS_LABELS[appointment?.status] || appointment?.status}</strong>
            </small>
          </div>

          {/* Services */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label>Services *</label>
            <div className="service-checkboxes" style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem' }}>
              {services.filter(s => s.isActive !== false).map(service => (
                <label key={service._id} className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.serviceIds.includes(String(service._id))}
                    onChange={() => toggleService(String(service._id))}
                  />
                  {service.name} (R{(parseFloat(service.price)||0).toFixed(2)} · {service.durationMinutes}min)
                </label>
              ))}
            </div>
            {errors.serviceIds && <span className="error">{errors.serviceIds}</span>}
            {selectedServices.length > 0 && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.78rem', color: '#166534' }}>
                💰 Total: <strong>R{totalPrice.toFixed(2)}</strong> · ⏱ Duration: <strong>{totalDuration} min</strong>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label>Date *</label>
            <input
              type="date"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
            />
            {errors.date && <span className="error">{errors.date}</span>}
          </div>

          {/* Time */}
          <div>
            <label>Time *</label>
            <input
              type="time"
              value={formData.time}
              onChange={e => setFormData({ ...formData, time: e.target.value })}
            />
            {errors.time && <span className="error">{errors.time}</span>}
          </div>

          {/* Payment Status */}
          <div>
            <label>Payment Status</label>
            <select
              value={formData.paymentStatus}
              onChange={e => setFormData({ ...formData, paymentStatus: e.target.value })}
            >
              <option value="unpaid">⚠️ Unpaid</option>
              <option value="deposit_paid">✅ Deposit Paid</option>
              <option value="paid">✅ Fully Paid</option>
            </select>
          </div>

          {/* Payment Method — only when marking paid */}
          {formData.paymentStatus === 'paid' && (
            <div>
              <label>Payment Method</label>
              <select
                value={formData.paymentMethod}
                onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="online">Online</option>
              </select>
            </div>
          )}

          {/* Notes */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any special requests or notes"
              rows={3}
            />
          </div>

          {/* Actions */}
          <footer className="modal-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Updating…' : 'Save Changes'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}