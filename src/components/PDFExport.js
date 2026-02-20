import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export function generateAppointmentsPDF(appointments, staff, services, payments) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(18);
  doc.setTextColor(102, 126, 234);
  doc.text('NXL Beauty Bar', 14, 20);
  
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Appointments Report', 14, 30);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 37);
  
  // Table data
  const tableData = appointments.map(appt => {
    const staffMember = staff.find(s => s._id === appt.employeeId);
    const serviceNames = (appt.serviceIds || [])
      .map(id => services.find(s => s._id === id)?.name)
      .filter(Boolean)
      .join(', ');
    const payment = payments.find(p => p.appointmentId === appt._id);
    
    return [
      appt.date,
      appt.time,
      appt.clientName || 'Unknown',
      serviceNames,
      staffMember?.name || '—',
      appt.status,
      appt.paymentStatus || 'unpaid',
      payment ? `R${payment.amount.toFixed(2)}` : 'R0.00'
    ];
  });
  
  // Generate table
  doc.autoTable({
    startY: 45,
    head: [['Date', 'Time', 'Client', 'Services', 'Staff', 'Status', 'Payment', 'Amount']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [102, 126, 234],
      textColor: 255,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 8,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 18 },
      2: { cellWidth: 30 },
      3: { cellWidth: 35 },
      4: { cellWidth: 25 },
      5: { cellWidth: 20 },
      6: { cellWidth: 20 },
      7: { cellWidth: 20 }
    }
  });
  
  // Summary
  const finalY = doc.lastAutoTable.finalY + 10;
  const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalAppointments = appointments.length;
  const completedAppointments = appointments.filter(a => a.status === 'completed').length;
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total Appointments: ${totalAppointments}`, 14, finalY);
  doc.text(`Completed: ${completedAppointments}`, 14, finalY + 7);
  doc.text(`Total Revenue: R${totalRevenue.toFixed(2)}`, 14, finalY + 14);
  
  // Save
  doc.save(`nxl-appointments-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function generateRevenueReportPDF(payments, dateRange) {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.setTextColor(102, 126, 234);
  doc.text('NXL Beauty Bar', 14, 20);
  
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Revenue Report', 14, 30);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Period: ${dateRange || 'All Time'}`, 14, 37);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 42);
  
  const tableData = payments.map(payment => [
    new Date(payment.createdAt).toLocaleDateString(),
    payment.clientEmail || payment.clientName || 'Unknown',
    payment.type || 'full',
    payment.method,
    payment.status,
    `R${payment.amount.toFixed(2)}`
  ]);
  
  doc.autoTable({
    startY: 50,
    head: [['Date', 'Client', 'Type', 'Method', 'Status', 'Amount']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [102, 126, 234],
      textColor: 255,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 9,
      cellPadding: 4
    }
  });
  
  const finalY = doc.lastAutoTable.finalY + 10;
  const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const paidPayments = payments.filter(p => p.status === 'paid');
  const pendingPayments = payments.filter(p => p.status === 'pending');
  
  doc.setFontSize(11);
  doc.setFontStyle('bold');
  doc.text('Summary', 14, finalY);
  
  doc.setFontSize(10);
  doc.setFontStyle('normal');
  doc.text(`Total Payments: ${payments.length}`, 14, finalY + 8);
  doc.text(`Paid: ${paidPayments.length}`, 14, finalY + 15);
  doc.text(`Pending: ${pendingPayments.length}`, 14, finalY + 22);
  doc.text(`Total Revenue: R${totalRevenue.toFixed(2)}`, 14, finalY + 29);
  
  doc.save(`nxl-revenue-${new Date().toISOString().split('T')[0]}.pdf`);
}
