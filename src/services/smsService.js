import axios from "axios";

/**
 * Get SMS API URL from environment or fallback
 */
function getSmsApiUrl() {
  return process.env.SMS_API_URL || "http://localhost:3001";
}

/**
 * Send SMS via Raspberry Pi SMS gateway
 */
async function sendSMS(phone, message) {
  const SMS_API_URL = getSmsApiUrl();

  try {
    console.log(`[SMS] Sending to ${phone}: ${message}`);
    console.log(`[SMS] Using API URL: ${SMS_API_URL}`);

    const response = await axios.post(
      `${SMS_API_URL}/send-sms`,
      {
        phone,
        message,
      },
      {
        timeout: 10000, // 10 second timeout
      }
    );

    console.log("[SMS] ✓ Sent successfully:", response.data);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("[SMS] ✗ Failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send booking confirmation SMS
 */
async function sendBookingConfirmation(booking) {
  console.log("[SMS] Booking data received:", JSON.stringify(booking, null, 2));

  const serviceName =
    booking.serviceName || booking.service?.name || "your service";
  const phone = booking.customerPhone || booking.customer?.phone;
  const time = booking.startTime || booking.time || "your scheduled time";

  console.log(
    `[SMS] Extracted - Service: ${serviceName}, Date: ${booking.date}, Time: ${time}, Phone: ${phone}`
  );

  // Format date properly
  let dateStr = "your appointment date";
  if (booking.date) {
    try {
      const date = new Date(booking.date);
      console.log(`[SMS] Date object created:`, date);
      if (!isNaN(date.getTime())) {
        dateStr = date.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        console.log(`[SMS] Formatted date:`, dateStr);
      } else {
        console.log(`[SMS] Invalid date object`);
      }
    } catch (err) {
      console.error("[SMS] Date parsing error:", err);
    }
  } else {
    console.log(`[SMS] No date field in booking object`);
  }

  const message = `Booking Confirmed! ${serviceName} on ${dateStr} at ${time}. Thank you!`;

  return sendSMS(phone, message);
}

/**
 * Send booking reminder SMS (24 hours before)
 */
async function sendBookingReminder(booking) {
  const message = `Reminder: Your appointment for ${booking.service.name} is tomorrow at ${booking.time}. Location: ${booking.location.name}. See you then!`;

  return sendSMS(booking.customer.phone, message);
}

/**
 * Send booking cancellation SMS
 */
async function sendBookingCancellation(booking) {
  const message = `Your booking for ${booking.service.name} on ${new Date(
    booking.date
  ).toLocaleDateString()} has been cancelled. Contact us if you have questions.`;

  return sendSMS(booking.customer.phone, message);
}

/**
 * Send booking rescheduled SMS
 */
async function sendBookingRescheduled(booking, oldDate, oldTime) {
  const message = `Booking Rescheduled! From ${new Date(
    oldDate
  ).toLocaleDateString()} ${oldTime} to ${new Date(
    booking.date
  ).toLocaleDateString()} ${booking.time}. ${booking.service.name} at ${
    booking.location.name
  }.`;

  return sendSMS(booking.customer.phone, message);
}

export default {
  sendSMS,
  sendBookingConfirmation,
  sendBookingReminder,
  sendBookingCancellation,
  sendBookingRescheduled,
};
