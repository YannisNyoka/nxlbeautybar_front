import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function BookingsChart({ appointments, range = 'week' }) {
  const chartData = useMemo(() => {
    const now = new Date();
    const data = [];
    const days = range === 'week' ? 7 : range === 'month' ? 30 : 365;

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayAppointments = appointments.filter(a => a.date === dateStr);

      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        booked: dayAppointments.filter(a => a.status === 'booked').length,
        completed: dayAppointments.filter(a => a.status === 'completed').length,
        cancelled: dayAppointments.filter(a => a.status === 'cancelled').length
      });
    }

    return data;
  }, [appointments, range]);

  if (chartData.length === 0) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0' }}>
        No appointment data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis 
          dataKey="date" 
          stroke="#718096"
          style={{ fontSize: '0.75rem' }}
        />
        <YAxis 
          stroke="#718096"
          style={{ fontSize: '0.75rem' }}
        />
        <Tooltip 
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px'
          }}
        />
        <Legend />
        <Bar dataKey="completed" fill="#43e97b" name="Completed" />
        <Bar dataKey="booked" fill="#667eea" name="Booked" />
        <Bar dataKey="cancelled" fill="#f56565" name="Cancelled" />
      </BarChart>
    </ResponsiveContainer>
  );
}
