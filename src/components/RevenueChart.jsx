import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function RevenueChart({ payments, range = 'week' }) {
  const chartData = useMemo(() => {
    const now = new Date();
    const data = [];
    const days = range === 'week' ? 7 : range === 'month' ? 30 : 365;

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayPayments = payments.filter(p => {
        const pDate = new Date(p.createdAt).toISOString().split('T')[0];
        return pDate === dateStr;
      });

      const revenue = dayPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: parseFloat(revenue.toFixed(2)),
        count: dayPayments.length
      });
    }

    return data;
  }, [payments, range]);

  if (chartData.length === 0) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0' }}>
        No payment data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
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
          formatter={(value) => [`R${value.toFixed(2)}`, 'Revenue']}
        />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="revenue" 
          stroke="#667eea" 
          strokeWidth={3}
          dot={{ fill: '#667eea', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
