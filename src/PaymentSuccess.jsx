import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import emailjs from '@emailjs/browser';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    emailjs.init(import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'l7AiKNhYSfG_q4eot');

    const sendConfirmationEmail = async () => {
      try {
        // Get booking details from sessionStorage
        // (we'll save them there before redirecting to PayFast)
        const bookingDetails = JSON.parse(sessionStorage.getItem('pendingBooking') || '{}');
        if (!bookingDetails.email) return;

        const { name, appointmentDate, appointmentTime, selectedServices,
                selectedEmployee, totalPrice, totalDuration, contactNumber, email } = bookingDetails;

        const mins = totalDuration % 60;
        const hrs = Math.floor(totalDuration / 60);
        const durationStr = hrs > 0 ? `${hrs}h ${mins > 0 ? mins + 'min' : ''}` : `${mins}min`;

        const emailParams = {
          customer_name: name,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          services: Array.isArray(selectedServices) ? selectedServices.join(', ') : '',
          employee: selectedEmployee,
          total_price: `R${totalPrice}`,
          total_duration: durationStr,
          contact_number: String(contactNumber).replace(/\D/g, ''),
          salon_email: 'nxlbeautybar@gmail.com',
          salon_phone: '0685113394',
          email: email || 'nxlbeautybar@gmail.com',
        };

        const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_f0lbtzg';
        const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_sbxxbii';

        await emailjs.send(serviceId, templateId, emailParams);
        console.log('Confirmation email sent');
        sessionStorage.removeItem('pendingBooking');
      } catch (err) {
        console.error('EmailJS error:', err);
      }
    };

    sendConfirmationEmail();

    // Redirect to dashboard after 5 seconds
    const timer = setTimeout(() => navigate('/dashboard'), 5000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <h1>🎉 Payment Successful!</h1>
      <p>Your booking is confirmed. A confirmation email has been sent to you.</p>
      <p style={{ opacity: 0.6 }}>Redirecting to dashboard in 5 seconds...</p>
      <button onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
    </div>
  );
};

export default PaymentSuccess;