import * as Sentry from "@sentry/node";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import Appointment from "../models/Appointment.js";
import Service from "../models/Service.js";
import Specialist from "../models/Specialist.js";
import WaitlistEntry from "../models/WaitlistEntry.js";
import { sendConfirmationEmail } from "../emails/mailer.js";
import smsService from "./smsService.js";

dayjs.extend(utc);
dayjs.extend(timezone);

function isCancelledStatus(status) {
  return typeof status === "string" && status.startsWith("cancelled");
}

function getDateKey(date, tz = "Europe/London") {
  return dayjs(date).tz(tz).format("YYYY-MM-DD");
}

function getTimePreference(date, tz = "Europe/London") {
  const hour = dayjs(date).tz(tz).hour();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function buildActiveAppointmentFilter({ start, end }) {
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  return {
    start: { $lt: end },
    end: { $gt: start },
    $and: [
      { status: { $not: /^cancelled/ } },
      {
        $or: [
          { status: { $ne: "reserved_unpaid" } },
          { createdAt: { $gte: threeMinutesAgo } },
        ],
      },
    ],
  };
}

async function sendWaitlistFillSms({
  to,
  serviceName,
  specialistName,
  start,
  tz,
}) {
  if (!to) return;

  const slotLabel = dayjs(start)
    .tz(tz)
    .format("ddd D MMM YYYY [at] HH:mm");
  const message = `Great news! A waitlist slot opened for ${serviceName} with ${specialistName} on ${slotLabel}. Your appointment is now confirmed.`;

  await smsService.sendSMS(to, message);
}

/**
 * Try to auto-fill a newly cancelled slot from active waitlist entries.
 */
export async function autoFillCancelledSlot({
  appointmentId,
  tenantId,
  logger = console,
  deps = {},
}) {
  if (!appointmentId || !tenantId) {
    return { filled: false, reason: "missing_context" };
  }

  const AppointmentModel = deps.AppointmentModel || Appointment;
  const WaitlistModel = deps.WaitlistModel || WaitlistEntry;
  const ServiceModel = deps.ServiceModel || Service;
  const SpecialistModel = deps.SpecialistModel || Specialist;
  const sendConfirmation = deps.sendConfirmationEmail || sendConfirmationEmail;
  const sendSms = deps.sendWaitlistFillSms || sendWaitlistFillSms;

  const salonTz = process.env.SALON_TZ || "Europe/London";

  try {
    const cancelledAppointment = await AppointmentModel.findOne({
      _id: appointmentId,
      tenantId,
    }).lean();

    if (!cancelledAppointment) {
      return { filled: false, reason: "appointment_not_found" };
    }

    if (!isCancelledStatus(cancelledAppointment.status)) {
      return { filled: false, reason: "appointment_not_cancelled" };
    }

    const targetServiceId =
      cancelledAppointment.serviceId ||
      cancelledAppointment.services?.[0]?.serviceId;
    const targetVariantName =
      cancelledAppointment.variantName ||
      cancelledAppointment.services?.[0]?.variantName;

    if (!targetServiceId || !targetVariantName) {
      return { filled: false, reason: "unsupported_service_shape" };
    }

    const desiredDate = getDateKey(cancelledAppointment.start, salonTz);
    const slotTimePreference = getTimePreference(cancelledAppointment.start, salonTz);

    const candidateQuery = {
      tenantId,
      status: "active",
      serviceId: targetServiceId,
      variantName: targetVariantName,
      $and: [
        {
          $or: [
            { specialistId: cancelledAppointment.specialistId },
            { specialistId: null },
            { specialistId: { $exists: false } },
          ],
        },
        {
          $or: [
            { desiredDate },
            { desiredDate: null },
            { desiredDate: "" },
            { desiredDate: { $exists: false } },
          ],
        },
        {
          $or: [
            { timePreference: slotTimePreference },
            { timePreference: "any" },
            { timePreference: { $exists: false } },
          ],
        },
      ],
    };

    const candidates = await WaitlistModel.find(candidateQuery)
      .sort({ priority: -1, createdAt: 1 })
      .limit(25)
      .lean();

    if (!candidates.length) {
      return { filled: false, reason: "no_waitlist_candidates" };
    }

    const service = await ServiceModel.findById(targetServiceId).lean();
    const specialist = await SpecialistModel.findById(
      cancelledAppointment.specialistId
    ).lean();

    const variant = (service?.variants || []).find(
      (entry) => entry.name === targetVariantName
    );
    const durationMin =
      variant?.durationMin ||
      cancelledAppointment.totalDuration ||
      cancelledAppointment.services?.[0]?.duration ||
      60;
    const finalPrice =
      Number(cancelledAppointment.price) ||
      Number(variant?.promoPrice) ||
      Number(variant?.price) ||
      0;

    for (const candidate of candidates) {
      if (!candidate.client?.email && !candidate.client?.phone) {
        continue;
      }

      // Skip if this client already has an active booking at this exact time.
      if (candidate.client?.email) {
        const existingClientBooking = await AppointmentModel.findOne({
          tenantId,
          "client.email": candidate.client.email.toLowerCase().trim(),
          ...buildActiveAppointmentFilter({
            start: cancelledAppointment.start,
            end: cancelledAppointment.end,
          }),
        }).lean();

        if (existingClientBooking) {
          continue;
        }
      }

      // Ensure the slot is still actually free.
      const slotConflict = await AppointmentModel.findOne({
        tenantId,
        _id: { $ne: cancelledAppointment._id },
        specialistId: cancelledAppointment.specialistId,
        ...buildActiveAppointmentFilter({
          start: cancelledAppointment.start,
          end: cancelledAppointment.end,
        }),
      }).lean();

      if (slotConflict) {
        return { filled: false, reason: "slot_already_taken" };
      }

      const createdAppointment = await AppointmentModel.create({
        tenantId,
        userId: candidate.client?.userId || null,
        client: {
          name: candidate.client?.name || "Client",
          email: candidate.client?.email || "",
          phone: candidate.client?.phone || "",
        },
        specialistId: cancelledAppointment.specialistId,
        serviceId: targetServiceId,
        variantName: targetVariantName,
        services: [
          {
            serviceId: targetServiceId,
            serviceName: service?.name || targetVariantName,
            variantName: targetVariantName,
            price: finalPrice,
            duration: durationMin,
          },
        ],
        start: cancelledAppointment.start,
        end: cancelledAppointment.end,
        totalDuration: durationMin,
        price: finalPrice,
        status: "confirmed",
        locationId: cancelledAppointment.locationId || undefined,
        payment: {
          mode: "pay_in_salon",
          provider: "cash",
          status: "unpaid",
          amountTotal: Math.round(finalPrice * 100),
        },
        audit: [
          {
            at: new Date(),
            action: "waitlist_auto_fill",
            by: "system",
            meta: {
              waitlistEntryId: String(candidate._id),
              cancelledAppointmentId: String(cancelledAppointment._id),
            },
          },
        ],
      });

      await WaitlistModel.findOneAndUpdate(
        {
          _id: candidate._id,
          tenantId,
          status: "active",
        },
        {
          $set: {
            status: "converted",
            notifiedAt: new Date(),
            convertedAt: new Date(),
            convertedAppointmentId: createdAppointment._id,
          },
          $push: {
            audit: {
              action: "waitlist_auto_fill_converted",
              at: new Date(),
              by: "system",
              meta: {
                convertedAppointmentId: String(createdAppointment._id),
                cancelledAppointmentId: String(cancelledAppointment._id),
              },
            },
          },
        },
        { new: true }
      ).lean();

      try {
        await sendConfirmation({
          appointment:
            typeof createdAppointment.toObject === "function"
              ? createdAppointment.toObject()
              : createdAppointment,
          service,
          specialist,
        });
      } catch (emailError) {
        logger.error?.("[Waitlist] Confirmation email failed", emailError);
      }

      try {
        await sendSms({
          to: candidate.client?.phone,
          serviceName: service?.name || targetVariantName,
          specialistName: specialist?.name || "our team",
          start: cancelledAppointment.start,
          tz: salonTz,
        });
      } catch (smsError) {
        logger.error?.("[Waitlist] SMS notification failed", smsError);
      }

      return {
        filled: true,
        appointmentId: String(createdAppointment._id),
        waitlistEntryId: String(candidate._id),
      };
    }

    return { filled: false, reason: "no_eligible_candidates" };
  } catch (error) {
    logger.error?.("[Waitlist] Auto-fill failed", error);
    Sentry.captureException(error, {
      tags: { module: "waitlist-autofill" },
      extra: {
        appointmentId: String(appointmentId),
        tenantId: String(tenantId),
      },
    });
    return { filled: false, reason: "autofill_error" };
  }
}

export default {
  autoFillCancelledSlot,
};
