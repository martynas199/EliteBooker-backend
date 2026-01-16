import cron from "node-cron";
import mongoose from "mongoose";
import pLimit from "p-limit";
import Appointment from "../models/Appointment.js";
import smsService from "./smsService.js";
import { sendReminderEmail } from "../emails/mailer.js";

// Bounded concurrency limiter - process max 10 reminders concurrently
const limit = pLimit(10);

/**
 * Appointment Reminder Service
 *
 * Sends SMS and email reminders 24 hours before appointments
 *
 * Features:
 * - Runs every 1 hour
 * - Only sends between 07:00-21:00 (no nighttime spam)
 * - Handles all edge cases (last minute bookings, cancellations, etc.)
 * - Graceful SMS failure handling
 * - Prevents duplicate sends
 */

/**
 * Check if current time is within allowed reminder window (07:00-21:00)
 */
function isWithinAllowedHours() {
  const now = new Date();
  const hour = now.getHours();
  return hour >= 7 && hour < 21;
}

/**
 * Validate phone number format
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== "string") return false;
  // Basic validation - at least 10 digits
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length >= 10;
}

/**
 * Send SMS reminder for appointment
 */
async function sendSMSReminder(appointment) {
  if (!appointment.client?.phone) {
    console.log(`[Reminder] No phone for appointment ${appointment._id}`);
    return { success: false, reason: "no_phone" };
  }

  if (!isValidPhone(appointment.client.phone)) {
    console.log(
      `[Reminder] Invalid phone for appointment ${appointment._id}:`,
      appointment.client.phone
    );
    return { success: false, reason: "invalid_phone" };
  }

  try {
    // Format service names
    let serviceName = "your appointment";
    if (appointment.services && appointment.services.length > 0) {
      if (appointment.services.length === 1) {
        const svc = appointment.services[0];
        // Show service name with variant name if both exist
        if (svc.serviceName && svc.variantName) {
          serviceName = `${svc.serviceName} (${svc.variantName})`;
        } else {
          serviceName = svc.serviceName || svc.variantName || "your service";
        }
      } else {
        serviceName = `${appointment.services.length} services`;
      }
    } else if (appointment.serviceId?.name) {
      serviceName = appointment.serviceId.name;
    } else if (appointment.serviceName) {
      serviceName = appointment.serviceName;
    }

    // Format date and time
    const startDate = new Date(appointment.start);
    const dateStr = startDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
    const timeStr = startDate.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const specialistName = appointment.specialistId?.name || "your specialist";

    const message = `Reminder: ${serviceName} with ${specialistName} tomorrow at ${timeStr}. See you then!`;

    console.log(`[Reminder] Sending SMS to ${appointment.client.phone}`);
    const result = await smsService.sendSMS(appointment.client.phone, message);

    return result;
  } catch (error) {
    console.error(
      `[Reminder] SMS failed for appointment ${appointment._id}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Send email reminder for appointment
 */
async function sendEmailReminder(appointment) {
  if (!appointment.client?.email) {
    console.log(`[Reminder] No email for appointment ${appointment._id}`);
    return { success: false, reason: "no_email" };
  }

  try {
    console.log(`[Reminder] Sending email to ${appointment.client.email}`);

    // Send dedicated reminder email
    await sendReminderEmail({
      appointment,
      service: appointment.serviceId,
      specialist: appointment.specialistId,
    });

    return { success: true };
  } catch (error) {
    console.error(
      `[Reminder] Email failed for appointment ${appointment._id}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Process reminders for all eligible appointments
 */
async function processReminders() {
  const now = new Date();
  console.log("[Reminder] ========================================");
  console.log("[Reminder] Cron job triggered at:", now.toISOString());
  console.log("[Reminder] ========================================");

  // 🔒 CRITICAL: Check if within allowed hours (07:00-21:00)
  if (!isWithinAllowedHours()) {
    const hour = now.getHours();
    console.log(
      `[Reminder] Skipped - outside allowed hours (current: ${hour}:00, allowed: 07:00-21:00)`
    );
    return;
  }

  console.log("[Reminder] ✓ Within allowed hours, processing reminders...");

  try {
    // Find appointments that need reminders
    // Requirements:
    // - Status is "confirmed" (not cancelled, no-show, etc.)
    // - Reminder not already sent
    // - Start time is within next 24 hours
    // - Start time is in the future (not already started)

    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const appointments = await Appointment.find({
      status: "confirmed",
      "reminder.sent": { $ne: true }, // Reminder not sent yet
      start: {
        $gt: now, // Must be in the future
        $lte: next24Hours, // Within next 24 hours
      },
    })
      .populate("serviceId", "name")
      .populate("specialistId", "name subscription")
      .populate("services.serviceId", "name");

    console.log(
      `[Reminder] Found ${appointments.length} appointments needing reminders`
    );

    let successCount = 0;
    let failureCount = 0;
    let emailOnlyCount = 0;

    // Process appointments with bounded concurrency (max 10 concurrent)
    const processAppointment = async (appointment) => {
      if (process.env.LOG_VERBOSE) {
        console.log(
          `[Reminder] Processing appointment ${appointment._id} for ${appointment.client?.name}`
        );
      }

      let smsResult = { success: false, reason: "not_attempted" };
      let emailResult = { success: false, reason: "not_attempted" };
      let reminderTypes = [];

      // Try to send SMS
      if (appointment.client?.phone) {
        // Get tenant to check feature flag
        const Tenant = mongoose.model("Tenant");
        const tenant = await Tenant.findById(appointment.tenantId).select(
          "features"
        );

        // Check if SMS reminders feature is enabled
        const smsRemindersEnabled = tenant?.features?.smsReminders === true;

        if (!smsRemindersEnabled) {
          if (process.env.LOG_VERBOSE) {
            console.log(
              `[Reminder] SMS Reminders feature is disabled, skipping SMS for appointment ${appointment._id}`
            );
          }
        } else {
          smsResult = await sendSMSReminder(appointment);
          if (smsResult.success) {
            reminderTypes.push("sms");
            if (process.env.LOG_VERBOSE) {
              console.log(
                `[Reminder] ✓ SMS sent for appointment ${appointment._id}`
              );
            }
          } else {
            if (process.env.LOG_VERBOSE) {
              console.log(
                `[Reminder] ✗ SMS failed for appointment ${appointment._id}:`,
                smsResult.reason || smsResult.error
              );
            }
          }
        }
      } else {
        if (process.env.LOG_VERBOSE) {
          console.log(
            `[Reminder] No phone number for appointment ${appointment._id}`
          );
        }
      }

      // Try to send email
      if (appointment.client?.email) {
        emailResult = await sendEmailReminder(appointment);
        if (emailResult.success) {
          reminderTypes.push("email");
          if (process.env.LOG_VERBOSE) {
            console.log(
              `[Reminder] ✓ Email sent for appointment ${appointment._id}`
            );
          }
        } else {
          if (process.env.LOG_VERBOSE) {
            console.log(
              `[Reminder] ✗ Email failed for appointment ${appointment._id}:`,
              emailResult.reason || emailResult.error
            );
          }
        }
      } else {
        if (process.env.LOG_VERBOSE) {
          console.log(`[Reminder] No email for appointment ${appointment._id}`);
        }
      }

      // Update appointment
      // CRITICAL: Only mark as sent if at least one notification succeeded
      if (reminderTypes.length > 0) {
        appointment.reminder = {
          sent: true,
          sentAt: new Date(),
          types: reminderTypes,
        };
        await appointment.save();

        successCount++;
        if (reminderTypes.includes("email") && !reminderTypes.includes("sms")) {
          emailOnlyCount++;
        }
        if (process.env.LOG_VERBOSE) {
          console.log(
            `[Reminder] ✓ Appointment ${
              appointment._id
            } marked as reminded (${reminderTypes.join(", ")})`
          );
        }
      } else {
        failureCount++;
        console.log(
          `[Reminder] ✗ All notifications failed for appointment ${appointment._id}, will retry next cycle`
        );
        // Don't mark as sent so it will be retried
      }
    };

    // Process all appointments with bounded concurrency
    await Promise.all(
      appointments.map((appointment) =>
        limit(() => processAppointment(appointment))
      )
    );

    console.log("[Reminder] ========================================");
    console.log(`[Reminder] Summary:`);
    console.log(`[Reminder]   Total processed: ${appointments.length}`);
    console.log(`[Reminder]   Successful: ${successCount}`);
    console.log(`[Reminder]   Failed (will retry): ${failureCount}`);
    console.log(`[Reminder]   Email only: ${emailOnlyCount}`);
    console.log("[Reminder] ========================================");
  } catch (error) {
    console.error("[Reminder] Cron job error:", error);
  }
}

/**
 * Start the reminder cron job
 * Runs every 1 hour: 00:00, 01:00, 02:00, ..., 23:00
 */
export function startReminderCron() {
  console.log("[Reminder] Starting reminder cron job (every 1 hour)...");

  // Cron pattern: "minute hour day month weekday"
  // "0 * * * *" = At minute 0 of every hour
  const cronJob = cron.schedule("0 * * * *", processReminders, {
    scheduled: true,
    timezone: "Europe/London", // UK timezone
  });

  console.log("[Reminder] ✓ Cron job scheduled");
  console.log("[Reminder]   Pattern: Every 1 hour");
  console.log("[Reminder]   Active hours: 07:00-21:00");
  console.log("[Reminder]   Timezone: Europe/London");

  return cronJob;
}

/**
 * Reset reminder flag when appointment is rescheduled
 * Call this whenever an appointment's start time changes
 */
export async function resetReminderOnReschedule(
  appointmentId,
  oldStartTime,
  newStartTime
) {
  // Only reset if the date actually changed
  const oldDate = new Date(oldStartTime).toDateString();
  const newDate = new Date(newStartTime).toDateString();

  if (oldDate !== newDate) {
    console.log(
      `[Reminder] Appointment ${appointmentId} rescheduled from ${oldDate} to ${newDate}, resetting reminder`
    );

    await Appointment.findByIdAndUpdate(appointmentId, {
      $set: {
        "reminder.sent": false,
        "reminder.sentAt": null,
        "reminder.types": [],
      },
    });
  }
}

/**
 * Manual trigger for testing (call this from admin panel or CLI)
 */
export async function triggerReminderManually() {
  console.log("[Reminder] Manual trigger requested");
  await processReminders();
}

export default {
  startReminderCron,
  resetReminderOnReschedule,
  triggerReminderManually,
};
