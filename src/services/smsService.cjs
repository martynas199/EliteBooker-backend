const axios = require('axios');

/**
 * Get SMS API URL from environment or fallback
 */
function getSmsApiUrl() {
  return process.env.SMS_API_URL || 'http://localhost:3001';
}

/**
 * Send SMS via Raspberry Pi SMS gateway
 */
async function sendSMS(phone, message) {
  const SMS_API_URL = getSmsApiUrl();
  
  try {
    console.log(`[SMS] Sending to ${phone}: ${message}`);
    console.log(`[SMS] Using API URL: ${SMS_API_URL}`);
    
    const response = await axios.post(`${SMS_API_URL}/send-sms`, {
      phone,
      message
    }, {
      timeout: 10000 // 10 second timeout
    });

    console.log('[SMS] ✓ Sent successfully:', response.data);
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('[SMS] ✗ Failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send booking confirmation SMS
 */
async function sendBookingConfirmation(booking) {
  const message = `Booking Confirmed! ${booking.serviceName} on ${new Date(booking.date).toLocaleDateString('en-GB')} at ${booking.startTime}. Thank you for choosing us!`;
  
  return sendSMS(booking.customerPhone, message);
}

/**
 * Send booking reminder SMS (24 hours before)
 */
async function sendBookingReminder(booking) {
  const message = `Reminder: Your appointment for ${booking.serviceName} is tomorrow at ${booking.startTime}. See you then!`;
  
  return sendSMS(booking.customerPhone, message);
}

/**
 * Send booking cancellation SMS
 */
async function sendBookingCancellation(booking) {
  const message = `Your booking for ${booking.serviceName} on ${new Date(booking.date).toLocaleDateString('en-GB')} has been cancelled. Contact us if you have questions.`;
  
  return sendSMS(booking.customerPhone, message);
}

/**
 * Send booking rescheduled SMS
 */
async function sendBookingRescheduled(booking, oldDate, oldTime) {
  const message = `Booking Rescheduled! From ${new Date(oldDate).toLocaleDateString('en-GB')} ${oldTime} to ${new Date(booking.date).toLocaleDateString('en-GB')} ${booking.startTime}.`;
  
  return sendSMS(booking.customerPhone, message);
}

module.exports = {
  sendSMS,
  sendBookingConfirmation,
  sendBookingReminder,
  sendBookingCancellation,
  sendBookingRescheduled
};
