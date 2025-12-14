import { Router } from "express";
import Service from "../models/Service.js";
import Specialist from "../models/Specialist.js";
import Appointment from "../models/Appointment.js";
import CancellationPolicy from "../models/CancellationPolicy.js";
import { z } from "zod";
import { computeCancellationOutcome } from "../controllers/appointments/computeCancellationOutcome.js";
import { refundPayment } from "../payments/stripe.js";
import {
  sendCancellationEmails,
  sendConfirmationEmail,
} from "../emails/mailer.js";
import AppointmentService from "../services/appointmentService.js";
const r = Router();

r.get("/", async (req, res) => {
  try {
    // Check if pagination is requested
    const usePagination = req.query.page !== undefined;

    if (usePagination) {
      // Parse pagination params
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));

      // Use service layer for paginated results
      const result = await AppointmentService.getAppointmentsPaginated({
        page,
        limit,
      });

      res.json(result);
    } else {
      // Backward compatibility: return array if no page param
      const appointments = await AppointmentService.getAllAppointments();
      res.json(appointments);
    }
  } catch (err) {
    console.error("appointments_list_err", err);
    res.status(500).json({ error: "Failed to fetch appointments" });
  }
});

r.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const appointment = await AppointmentService.getAppointmentById(id);

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Fetch specialist separately (not in bulk for single appointment)
    const specialist = appointment.specialistId
      ? await Specialist.findById(appointment.specialistId).lean()
      : null;

    res.json({ ...appointment, specialist: specialist || null });
  } catch (err) {
    console.error("appointment_get_err", err);
    res.status(500).json({ error: "Failed to fetch appointment" });
  }
});
r.post("/", async (req, res) => {
  const {
    specialistId,
    any,
    serviceId,
    variantName,
    startISO,
    client,
    mode,
    userId,
    locationId, // NEW: Accept locationId
  } = req.body;
  const service = await Service.findById(serviceId).lean();
  if (!service) return res.status(404).json({ error: "Service not found" });
  const variant = (service.variants || []).find((v) => v.name === variantName);
  if (!variant) return res.status(404).json({ error: "Variant not found" });
  let specialist = null;
  if (any) {
    specialist = await Specialist.findOne({
      _id: { $in: service.beauticianIds },
      active: true,
    }).lean();
  } else {
    specialist = await Specialist.findById(specialistId).lean();
  }
  if (!specialist)
    return res.status(400).json({ error: "No specialist available" });
  const start = new Date(startISO);
  const end = new Date(
    start.getTime() +
      (variant.durationMin +
        (variant.bufferBeforeMin || 0) +
        (variant.bufferAfterMin || 0)) *
        60000
  );
  // Check for conflicts, excluding:
  // - Cancelled appointments
  // - reserved_unpaid appointments older than 3 minutes (expired)
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  const conflict = await Appointment.findOne({
    specialistId: Specialist._id,
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
  }).lean();
  if (conflict)
    return res.status(409).json({ error: "Slot no longer available" });
  const isInSalon = String(mode).toLowerCase() === "pay_in_salon";
  const status = isInSalon ? "confirmed" : "reserved_unpaid";
  const payment = isInSalon
    ? {
        mode: "pay_in_salon",
        provider: "cash",
        status: "unpaid",
        amountTotal: Math.round(Number(variant.price || 0) * 100),
      }
    : undefined;
  const appt = await Appointment.create({
    client,
    specialistId: Specialist._id,
    serviceId,
    variantName,
    start,
    end,
    price: variant.price,
    status,
    tenantId: req.tenantId, // Add tenantId from request context
    ...(userId ? { userId } : {}), // Add userId if provided (logged-in users)
    ...(payment ? { payment } : {}),
    ...(locationId ? { locationId } : {}), // Add locationId if provided
  });

  // Send confirmation email to customer
  sendConfirmationEmail({
    appointment: appt.toObject(),
    service,
    specialist,
  }).catch((err) => {
    console.error("Failed to send confirmation email:", err);
  });

  res.json({ ok: true, appointmentId: appt._id });
});

// Cancellation routes
r.post("/:id/cancel", async (req, res) => {
  const IdSchema = z.object({ id: z.string() });
  const BodySchema = z.object({
    requestedBy: z.enum(["customer", "staff"]),
    reason: z.string().optional(),
  });
  try {
    const { id } = IdSchema.parse(req.params);
    const body = BodySchema.parse(req.body || {});
    const salonTz = process.env.SALON_TZ || "Europe/London";
    const appt = await Appointment.findById(id).lean();
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    if (
      [
        "cancelled_no_refund",
        "cancelled_partial_refund",
        "cancelled_full_refund",
      ].includes(appt.status)
    ) {
      return res.json({
        outcome: appt.status.replace("cancelled_", ""),
        refundAmount: 0,
        status: appt.status,
        alreadyCancelled: true,
      });
    }
    const policy = (await CancellationPolicy.findOne({
      scope: "specialist",
      specialistId: appt.specialistId,
    }).lean()) ||
      (await CancellationPolicy.findOne({ scope: "salon" }).lean()) || {
        freeCancelHours: 24,
        noRefundHours: 2,
        partialRefund: { percent: 50 },
        appliesTo: "deposit_only",
        graceMinutes: 15,
        currency: "GBP",
      };
    // For unpaid appointments, skip refund logic entirely
    let outcome;
    let stripeRefundId;
    let newStatus;

    if (appt.status === "reserved_unpaid") {
      // Unpaid appointment - no refund needed
      outcome = {
        refundAmount: 0,
        outcomeStatus: "cancelled_no_refund",
        reasonCode: "unpaid_appointment",
      };
      newStatus = "cancelled_no_refund";
    } else {
      // Paid appointment - calculate refund
      outcome = computeCancellationOutcome({
        appointment: appt,
        policy,
        now: new Date(),
        salonTz,
      });

      if (outcome.refundAmount > 0 && appt.payment?.provider === "stripe") {
        const key = `cancel:${id}:${new Date(
          appt.updatedAt || appt.createdAt || Date.now()
        ).getTime()}`;
        const ref = appt.payment?.stripe || {};
        try {
          const rf = await refundPayment({
            paymentIntentId: ref.paymentIntentId,
            chargeId: ref.chargeId,
            amount: outcome.refundAmount,
            idempotencyKey: key,
          });
          stripeRefundId = rf.id;
        } catch (e) {
          console.error("Refund error", { id, err: e.message });
          return res
            .status(502)
            .json({ error: "Refund failed", details: e.message });
        }
      }
      newStatus =
        outcome.refundAmount > 0
          ? outcome.outcomeStatus
          : "cancelled_no_refund";
    }
    const update = {
      $set: {
        status: newStatus,
        cancelledAt: new Date(),
        cancelledBy: body.requestedBy,
        cancelReason: body.reason,
        policySnapshot: policy,
      },
      $push: {
        audit: {
          at: new Date(),
          action: "cancel",
          by: body.requestedBy,
          meta: { outcome, stripeRefundId },
        },
      },
    };
    if (stripeRefundId) {
      update.$set["payment.status"] =
        outcome.refundAmount === (appt.payment?.amountTotal || 0)
          ? "refunded"
          : "partial_refunded";
      update.$set["payment.stripe.refundIds"] = [
        ...(appt.payment?.stripe?.refundIds || []),
        stripeRefundId,
      ];
    }
    const updated = await Appointment.findOneAndUpdate(
      { _id: id, status: { $in: ["confirmed", "reserved_unpaid"] } },
      update,
      { new: true }
    ).lean();
    if (!updated) {
      const cur = await Appointment.findById(id).lean();
      return res.json({
        outcome: cur?.status?.replace("cancelled_", "") || "no_refund",
        refundAmount: outcome.refundAmount,
        status: cur?.status || "unknown",
        alreadyProcessed: true,
      });
    }
    try {
      await sendCancellationEmails({
        appointment: updated,
        policySnapshot: policy,
        refundAmount: outcome.refundAmount,
        outcomeStatus: newStatus,
        reason: body.reason,
      });
    } catch (e) {
      console.error("email_err", e.message);
    }
    res.json({
      outcome: newStatus.replace("cancelled_", ""),
      refundAmount: outcome.refundAmount,
      status: newStatus,
      stripeRefundId,
    });
  } catch (err) {
    console.error("cancel_err", err);
    res.status(400).json({ error: err.message || "Bad Request" });
  }
});

r.get("/:id/cancel/preview", async (req, res) => {
  const IdSchema = z.object({ id: z.string() });
  try {
    const { id } = IdSchema.parse(req.params);
    const appt = await Appointment.findById(id).lean();
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    const policy = (await CancellationPolicy.findOne({
      scope: "specialist",
      specialistId: appt.specialistId,
    }).lean()) ||
      (await CancellationPolicy.findOne({ scope: "salon" }).lean()) || {
        freeCancelHours: 24,
        noRefundHours: 2,
        partialRefund: { percent: 50 },
        appliesTo: "deposit_only",
        graceMinutes: 15,
        currency: "GBP",
      };
    const outcome = computeCancellationOutcome({
      appointment: appt,
      policy,
      now: new Date(),
      salonTz: process.env.SALON_TZ || "Europe/London",
    });
    res.json({
      refundAmount: outcome.refundAmount,
      status: outcome.outcomeStatus,
      policy,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

r.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = [
      "reserved_unpaid",
      "confirmed",
      "cancelled_no_refund",
      "cancelled_partial_refund",
      "cancelled_full_refund",
      "no_show",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    appointment.status = status;
    await appointment.save();

    res.json({ success: true, status: appointment.status });
  } catch (err) {
    console.error("status_update_err", err);
    res.status(400).json({ error: err.message || "Failed to update status" });
  }
});

r.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { client, specialistId, serviceId, variantName, start, end, price } =
      req.body;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Check if time slot is available for the new time/specialist
    if (start && specialistId) {
      const appointmentStart = new Date(start);
      const appointmentEnd = end
        ? new Date(end)
        : new Date(appointmentStart.getTime() + 60 * 60000); // default 1 hour if no end

      const conflict = await Appointment.findOne({
        _id: { $ne: id }, // exclude current appointment
        specialistId: specialistId,
        start: { $lt: appointmentEnd },
        end: { $gt: appointmentStart },
      }).lean();

      if (conflict) {
        return res
          .status(409)
          .json({ error: "Time slot not available for this specialist" });
      }
    }

    // Update fields if provided
    if (client) appointment.client = { ...appointment.client, ...client };
    if (specialistId) appointment.specialistId = specialistId;
    if (serviceId) appointment.serviceId = serviceId;
    if (variantName) appointment.variantName = variantName;
    if (start) appointment.start = new Date(start);
    if (end) appointment.end = new Date(end);
    if (price !== undefined) appointment.price = price;

    await appointment.save();

    // Return populated appointment
    const updated = await Appointment.findById(id)
      .populate({ path: "serviceId", select: "name" })
      .populate({ path: "specialistId", select: "name" })
      .lean();

    res.json({
      success: true,
      appointment: {
        ...updated,
        service:
          updated.serviceId && typeof updated.serviceId === "object"
            ? updated.serviceId
            : null,
        specialist:
          updated.specialistId && typeof updated.specialistId === "object"
            ? updated.specialistId
            : null,
      },
    });
  } catch (err) {
    console.error("appointment_update_err", err);
    res
      .status(400)
      .json({ error: err.message || "Failed to update appointment" });
  }
});

// Delete all appointments for a specific specialist
r.delete("/specialist/:specialistId", async (req, res) => {
  try {
    const { specialistId } = req.params;

    // Verify specialist exists
    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Delete all appointments for this specialist
    const result = await Appointment.deleteMany({ specialistId });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} appointment(s) for ${Specialist.name}`,
    });
  } catch (err) {
    console.error("delete_beautician_appointments_err", err);
    res.status(400).json({
      error: err.message || "Failed to delete appointments",
    });
  }
});

// Delete a specific canceled appointment
r.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Find the appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Only allow deletion of canceled appointments
    if (!appointment.status.startsWith("cancelled_")) {
      return res.status(400).json({
        error: "Only canceled appointments can be deleted",
        currentStatus: appointment.status,
      });
    }

    // Delete the appointment
    await Appointment.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Canceled appointment deleted successfully",
    });
  } catch (err) {
    console.error("delete_appointment_err", err);
    res.status(400).json({
      error: err.message || "Failed to delete appointment",
    });
  }
});

export default r;
