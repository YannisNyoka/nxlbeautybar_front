import { useState, useMemo } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = {
  'en-US': enUS
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales
});

// Same status → color language used everywhere else in the admin dashboard
// (see .status.* rules in AdminDashboard.css) — the calendar previously used
// a different, unrelated color set, so the same status meant different
// colors depending on which screen you were looking at.
const STATUS_COLORS = {
  booked:      '#059669', // green  — matches .status.booked
  completed:   '#2563eb', // blue   — matches .status.completed
  cancelled:   '#dc2626', // red    — matches .status.cancelled
  'no-show':   '#d97706', // amber  — matches .status.no-show
  pending:     '#ea580c', // orange — matches .status.pending
};
const DEFAULT_COLOR = '#6b7280'; // grey — unrecognized/unknown status only

const LEGEND_ITEMS = [
  { status: 'booked',    label: 'Booked' },
  { status: 'completed', label: 'Completed' },
  { status: 'pending',   label: 'Pending' },
  { status: 'no-show',   label: 'No-show' },
  { status: 'cancelled', label: 'Cancelled' },
];

export default function AppointmentCalendar({ appointments, staff, services, onSelectSlot, onSelectEvent }) {
  const [view, setView] = useState('week');

  const events = useMemo(() => {
    return appointments.map(appt => {
      // The backend already returns fully-resolved `employee` and `services`
      // on every appointment (see GET /appointments) — prefer those, and
      // only fall back to matching against the staff/services props if an
      // appointment is somehow missing them.
      const staffName = appt.employee?.name
        || staff.find(s => String(s._id) === String(appt.employeeId))?.name
        || 'Unassigned';

      const resolvedServices = appt.services?.length
        ? appt.services
        : (appt.serviceIds || []).map(id => services.find(s => String(s._id) === String(id))).filter(Boolean);
      const serviceNames = resolvedServices.map(s => s.name).join(', ') || 'Service';

      const clientName = appt.userName?.trim() || 'Client';

      const [hours, minutes] = (appt.time || '09:00').split(':');
      const start = new Date(appt.date);
      start.setHours(parseInt(hours), parseInt(minutes), 0);

      const totalDuration = appt.totalDuration
        || resolvedServices.reduce((sum, s) => sum + (s.durationMinutes || 60), 0);

      const end = new Date(start);
      end.setMinutes(end.getMinutes() + totalDuration);

      return {
        id: appt._id,
        title: `${clientName} · ${serviceNames}`,
        start,
        end,
        resource: {
          ...appt,
          staffName,
        }
      };
    });
  }, [appointments, staff, services]);

  const eventStyleGetter = (event) => {
    const backgroundColor = STATUS_COLORS[event.resource.status] || DEFAULT_COLOR;

    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        opacity: 0.95,
        color: 'white',
        border: 'none',
        display: 'block',
        fontSize: '0.8rem',
        fontWeight: 600,
        padding: '2px 6px',
        lineHeight: 1.3,
      }
    };
  };

  return (
    <div>
      <div className="nxl-calendar-legend">
        {LEGEND_ITEMS.map(({ status, label }) => (
          <span key={status} className="nxl-calendar-legend-item">
            <span className="nxl-calendar-legend-dot" style={{ background: STATUS_COLORS[status] }} />
            {label}
          </span>
        ))}
      </div>
      <div className="nxl-calendar-wrap">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setView}
          views={['day', 'week', 'month']}
          eventPropGetter={eventStyleGetter}
          onSelectSlot={onSelectSlot}
          onSelectEvent={onSelectEvent}
          selectable
          step={15}
          timeslots={4}
          min={new Date(2024, 0, 1, 8, 0)}
          max={new Date(2024, 0, 1, 20, 0)}
          tooltipAccessor={(event) =>
            `${event.title}\nStaff: ${event.resource.staffName}\nStatus: ${event.resource.status}`
          }
        />
      </div>
    </div>
  );
}
