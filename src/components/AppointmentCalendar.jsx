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

export default function AppointmentCalendar({ appointments, staff, services, onSelectSlot, onSelectEvent }) {
  const [view, setView] = useState('week');

  const events = useMemo(() => {
    return appointments.map(appt => {
      const staffMember = staff.find(s => s._id === appt.employeeId);
      const serviceNames = (appt.serviceIds || [])
        .map(id => services.find(s => s._id === id)?.name)
        .filter(Boolean)
        .join(', ');
      
      const [hours, minutes] = (appt.time || '09:00').split(':');
      const start = new Date(appt.date);
      start.setHours(parseInt(hours), parseInt(minutes), 0);
      
      const totalDuration = (appt.serviceIds || [])
        .reduce((sum, id) => {
          const service = services.find(s => s._id === id);
          return sum + (service?.durationMinutes || 60);
        }, 0);
      
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + totalDuration);
      
      return {
        id: appt._id,
        title: `${appt.clientName || 'Unknown'} - ${serviceNames}`,
        start,
        end,
        resource: {
          ...appt,
          staffName: staffMember?.name || 'Unknown'
        }
      };
    });
  }, [appointments, staff, services]);

  const eventStyleGetter = (event) => {
    const status = event.resource.status;
    let backgroundColor = '#667eea';
    
    if (status === 'completed') backgroundColor = '#43e97b';
    if (status === 'cancelled') backgroundColor = '#f56565';
    if (status === 'no-show') backgroundColor = '#ed8936';
    
    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        display: 'block',
        fontSize: '0.85rem',
        padding: '2px 5px'
      }
    };
  };

  return (
    <div style={{ height: 600 }}>
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
  );
}
