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
  // Handle different data structures
  const serviceName =
    booking.serviceName ||
    booking.service?.name ||
    booking.serviceId?.name ||
    "your service";
  const phone =
    booking.customerPhone || booking.customer?.phone || booking.client?.phone;

  // Extract time - handle both Date objects and time strings
  let time = booking.startTime || booking.time || "your scheduled time";
  let dateObj = booking.date || booking.start;

  // If we have a Date object for the appointment start, extract the time from it
  if (dateObj && typeof dateObj !== "string") {
    try {
      const startDate = new Date(dateObj);
      if (!isNaN(startDate.getTime())) {
        // Extract time if not already provided as a string
        if (!booking.startTime && !booking.time) {
          time = startDate.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }
    } catch (err) {
      console.error("[SMS] Time extraction error:", err);
    }
  }

  // Format date properly
  let dateStr = "your appointment date";
  if (dateObj) {
    try {
      const date = new Date(dateObj);
      if (!isNaN(date.getTime())) {
        dateStr = date.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
    } catch (err) {
      console.error("[SMS] Date parsing error:", err);
    }
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
