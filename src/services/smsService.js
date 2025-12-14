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

  console.log("[SMS] Attempting to send SMS");
  console.log("[SMS] API URL:", SMS_API_URL);
  console.log("[SMS] Phone:", phone);
  console.log("[SMS] Message:", message);

  if (!phone) {
    console.error("[SMS] ✗ No phone number provided");
    return {
      success: false,
      error: "No phone number provided",
    };
  }

  try {
    console.log("[SMS] Making request to SMS gateway...");
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

    console.log("[SMS] ✓ SMS sent successfully:", response.data);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("[SMS] ✗ Failed:", error.message);
    if (error.response) {
      console.error("[SMS] Response status:", error.response.status);
      console.error("[SMS] Response data:", error.response.data);
    } else if (error.request) {
      console.error("[SMS] No response received. Gateway may be down.");
    } else {
      console.error("[SMS] Request setup error:", error.message);
    }
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
  console.log("[SMS] sendBookingConfirmation called");
  console.log("[SMS] Booking data:", JSON.stringify(booking, null, 2));

  // Handle different data structures for service name
  let serviceName = "your service";

  // Check if multiple services
  if (booking.services && booking.services.length > 0) {
    if (booking.services.length === 1) {
      serviceName =
        booking.services[0].variantName ||
        booking.services[0].serviceName ||
        "your service";
    } else {
      // Multiple services - list them
      serviceName = booking.services
        .map((s) => s.variantName || s.serviceName || "Service")
        .join(", ");
    }
  } else if (booking.serviceName) {
    serviceName = booking.serviceName;
  } else if (booking.service?.name) {
    serviceName = booking.service.name;
  } else if (booking.serviceId?.name) {
    serviceName = booking.serviceId.name;
  }

  // Get specialist/beautician name
  const specialistName =
    booking.specialistName ||
    booking.specialist?.name ||
    booking.specialistId?.name ||
    "our team";

  const phone =
    booking.customerPhone || booking.customer?.phone || booking.client?.phone;

  console.log("[SMS] Extracted service name:", serviceName);
  console.log("[SMS] Extracted specialist name:", specialistName);
  console.log("[SMS] Extracted phone:", phone);

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

  const message = `Booking Confirmed! ${serviceName} with ${specialistName} on ${dateStr} at ${time}. Thank you!`;
  console.log("[SMS] Final message:", message);

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
