/**
 * Google Calendar Integration
 *
 * Allows beauticians to sync appointments to their Google Calendar
 * Uses OAuth 2.0 for authentication
 */

import { google } from "googleapis";
import Beautician from "../models/Beautician.js";

// OAuth 2.0 Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:4000/api/calendar/callback";

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Scopes required for calendar access
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

/**
 * Generate Google OAuth URL for beautician to authorize
 */
export function getAuthUrl(beauticianId) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state: beauticianId, // Pass beautician ID in state parameter
    prompt: "consent", // Force consent screen to get refresh token
  });
  return authUrl;
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Store Google Calendar tokens for beautician
 */
export async function saveTokensForBeautician(beauticianId, tokens) {
  await Beautician.findByIdAndUpdate(beauticianId, {
    "googleCalendar.accessToken": tokens.access_token,
    "googleCalendar.refreshToken": tokens.refresh_token,
    "googleCalendar.expiryDate": tokens.expiry_date,
    "googleCalendar.enabled": true,
  });
}

/**
 * Get authenticated calendar client for beautician
 */
async function getCalendarClient(beauticianId) {
  const beautician = await Beautician.findById(beauticianId);

  if (
    !beautician?.googleCalendar?.enabled ||
    !beautician.googleCalendar.accessToken
  ) {
    throw new Error("Google Calendar not enabled for this beautician");
  }

  // Set credentials
  oauth2Client.setCredentials({
    access_token: beautician.googleCalendar.accessToken,
    refresh_token: beautician.googleCalendar.refreshToken,
    expiry_date: beautician.googleCalendar.expiryDate,
  });

  // Check if token needs refresh
  if (Date.now() >= beautician.googleCalendar.expiryDate) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await saveTokensForBeautician(beauticianId, credentials);
    oauth2Client.setCredentials(credentials);
  }

  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Create calendar event for appointment
 */
export async function createCalendarEvent(beauticianId, appointment) {
  try {
    const calendar = await getCalendarClient(beauticianId);

    // Format appointment data for Google Calendar
    const event = {
      summary: `${appointment.service?.name || "Appointment"} - ${
        appointment.customer?.name || "Customer"
      }`,
      description: `
Service: ${appointment.service?.name || "N/A"}
Variant: ${appointment.variantName || "N/A"}
Customer: ${appointment.customer?.name || "N/A"}
Phone: ${appointment.customer?.phone || "N/A"}
Email: ${appointment.customer?.email || "N/A"}
Price: £${(appointment.finalPrice / 100).toFixed(2)}
Status: ${appointment.status}

Booking Reference: ${appointment._id}
      `.trim(),
      start: {
        dateTime: appointment.startTime,
        timeZone: appointment.timezone || "Europe/London",
      },
      end: {
        dateTime: appointment.endTime,
        timeZone: appointment.timezone || "Europe/London",
      },
      location: appointment.salon?.address || "",
      colorId: "1", // Blue color
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 }, // 1 day before
          { method: "popup", minutes: 30 }, // 30 minutes before
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    console.log("[Google Calendar] Event created:", response.data.id);

    // Store event ID in appointment for future updates/deletions
    return response.data.id;
  } catch (error) {
    console.error("[Google Calendar] Failed to create event:", error.message);
    throw error;
  }
}

/**
 * Update calendar event
 */
export async function updateCalendarEvent(beauticianId, eventId, appointment) {
  try {
    const calendar = await getCalendarClient(beauticianId);

    const event = {
      summary: `${appointment.service?.name || "Appointment"} - ${
        appointment.customer?.name || "Customer"
      }`,
      description: `
Service: ${appointment.service?.name || "N/A"}
Variant: ${appointment.variantName || "N/A"}
Customer: ${appointment.customer?.name || "N/A"}
Phone: ${appointment.customer?.phone || "N/A"}
Email: ${appointment.customer?.email || "N/A"}
Price: £${(appointment.finalPrice / 100).toFixed(2)}
Status: ${appointment.status}

Booking Reference: ${appointment._id}
      `.trim(),
      start: {
        dateTime: appointment.startTime,
        timeZone: appointment.timezone || "Europe/London",
      },
      end: {
        dateTime: appointment.endTime,
        timeZone: appointment.timezone || "Europe/London",
      },
    };

    const response = await calendar.events.update({
      calendarId: "primary",
      eventId: eventId,
      resource: event,
    });

    console.log("[Google Calendar] Event updated:", response.data.id);
    return response.data.id;
  } catch (error) {
    console.error("[Google Calendar] Failed to update event:", error.message);
    throw error;
  }
}

/**
 * Delete calendar event
 */
export async function deleteCalendarEvent(beauticianId, eventId) {
  try {
    const calendar = await getCalendarClient(beauticianId);

    await calendar.events.delete({
      calendarId: "primary",
      eventId: eventId,
    });

    console.log("[Google Calendar] Event deleted:", eventId);
  } catch (error) {
    console.error("[Google Calendar] Failed to delete event:", error.message);
    throw error;
  }
}

/**
 * Disconnect Google Calendar for beautician
 */
export async function disconnectCalendar(beauticianId) {
  await Beautician.findByIdAndUpdate(beauticianId, {
    "googleCalendar.enabled": false,
    "googleCalendar.accessToken": null,
    "googleCalendar.refreshToken": null,
    "googleCalendar.expiryDate": null,
  });
}

export default {
  getAuthUrl,
  getTokensFromCode,
  saveTokensForBeautician,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  disconnectCalendar,
};
