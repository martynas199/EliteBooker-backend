/**
 * Enhanced Booking Routes with Redis Lock Integration
 * Prevents double-booking using temporary slot locks
 */

const express = require("express");
const { getLockService } = require("../services/lockService");
const Appointment = require("../models/Appointment");
const Specialist = require("../models/Specialist");
const Service = require("../models/Service");
const { requireAuth } = require("../middleware/auth");
const smsService = require("../services/smsService.cjs");

const router = express.Router();
const lockService = getLockService();

/**
 * @route   POST /api/bookings/create
 * @desc    Create a new booking with lock verification
 * @access  Public (customer) or Protected (admin)
 *
 * Flow:
 * 1. Verify lock exists and matches lockId
 * 2. Validate booking data
 * 3. Create booking in database
 * 4. Release lock
 * 5. Send confirmation
 */
router.post("/create", async (req, res) => {
  try {
    const {
      // Lock verification
      lockId,

      // Booking details
      tenantId,
      specialistId,
      serviceId,
      date,
      startTime,
      endTime,
      customerName,
      customerEmail,
      customerPhone,
      notes,

      // Optional fields
      variantName,
      price,
      duration,
      inSalonPayment,
      paymentIntentId,
    } = req.body;

    console.log("[Bookings] Creating booking with lock verification");

    // Validation
    if (
      !lockId ||
      !tenantId ||
      !specialistId ||
      !serviceId ||
      !date ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: [
          "lockId",
          "tenantId",
          "specialistId",
          "serviceId",
          "date",
          "startTime",
          "endTime",
        ],
      });
    }

    if (!customerName || !customerEmail || !customerPhone) {
      return res.status(400).json({
        success: false,
        error: "Missing customer information",
        required: ["customerName", "customerEmail", "customerPhone"],
      });
    }

    // Step 1: Verify lock
    console.log("[Bookings] Verifying lock...");
    const lockVerification = await lockService.verifyLock({
      tenantId,
      resourceId: specialistId,
      date,
      startTime,
      lockId,
    });

    if (!lockVerification.valid) {
      console.log(
        "[Bookings] Lock verification failed:",
        lockVerification.reason
      );
      return res.status(409).json({
        success: false,
        error: "Lock verification failed",
        reason: lockVerification.reason,
        message: lockVerification.message,
      });
    }

    console.log("[Bookings] Lock verified successfully");

    // Step 2: Validate booking data
    // Check if specialist exists and is active
    const specialist = await Specialist.findOne({
      _id: specialistId,
      tenantId,
      active: true,
    });

    if (!specialist) {
      // Release lock before returning error
      await lockService.releaseLock({
        tenantId,
        resourceId: specialistId,
        date,
        startTime,
        lockId,
      });

      return res.status(404).json({
        success: false,
        error: "Specialist not found or inactive",
      });
    }

    // Check if service exists and is active
    const service = await Service.findOne({
      _id: serviceId,
      tenantId,
      active: true,
    });

    if (!service) {
      // Release lock before returning error
      await lockService.releaseLock({
        tenantId,
        resourceId: specialistId,
        date,
        startTime,
        lockId,
      });

      return res.status(404).json({
        success: false,
        error: "Service not found or inactive",
      });
    }

    // Step 3: Double-check for existing booking (database-level safety)
    const existingBooking = await Appointment.findOne({
      tenantId,
      specialistId,
      date,
      startTime,
      status: { $nin: ["cancelled", "no-show"] },
    });

    if (existingBooking) {
      console.log("[Bookings] Conflict detected - booking already exists");

      // Release lock
      await lockService.releaseLock({
        tenantId,
        resourceId: specialistId,
        date,
        startTime,
        lockId,
      });

      return res.status(409).json({
        success: false,
        error: "Time slot is no longer available",
        message: "This slot has been booked by another customer",
      });
    }

    // Step 4: Create booking
    console.log("[Bookings] Creating appointment in database...");

    const appointment = new Appointment({
      tenantId,
      specialistId,
      serviceId,
      serviceName: service.name,
      variantName: variantName || null,
      date,
      startTime,
      endTime,
      customerName,
      customerEmail,
      customerPhone,
      notes: notes || "",
      price: price || service.price || 0,
      duration: duration || service.durationMin || 60,
      status: inSalonPayment ? "confirmed" : "pending", // If in-salon payment, auto-confirm
      paymentStatus: inSalonPayment
        ? "pending"
        : paymentIntentId
        ? "paid"
        : "pending",
      paymentIntentId: paymentIntentId || null,
      inSalonPayment: inSalonPayment || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await appointment.save();

    console.log(
      "[Bookings] Appointment created successfully:",
      appointment._id
    );

    // Step 5: Release lock (booking is now confirmed in DB)
    console.log("[Bookings] Releasing lock...");
    const releaseResult = await lockService.releaseLock({
      tenantId,
      resourceId: specialistId,
      date,
      startTime,
      lockId,
    });

    if (!releaseResult.released) {
      console.warn(
        "[Bookings] Warning: Lock was not released (may have expired)",
        releaseResult.reason
      );
    }

    // Step 6: Send response
    res.status(201).json({
      success: true,
      status: "success",
      bookingId: appointment._id,
      appointment: {
        id: appointment._id,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: appointment.status,
        paymentStatus: appointment.paymentStatus,
        customerName: appointment.customerName,
        customerEmail: appointment.customerEmail,
        serviceName: appointment.serviceName,
        variantName: appointment.variantName,
        price: appointment.price,
        duration: appointment.duration,
      },
      message: "Booking created successfully",
    });

    // Step 7: Send confirmation SMS (async, don't wait)
    if (customerPhone) {
      smsService
        .sendBookingConfirmation(appointment)
        .then(() => console.log("[Bookings] SMS confirmation sent"))
        .catch((err) => console.error("[Bookings] SMS failed:", err.message));
    }
  } catch (error) {
    console.error("[Bookings] Error creating booking:", error);

    // Attempt to release lock on error
    if (
      req.body.lockId &&
      req.body.tenantId &&
      req.body.specialistId &&
      req.body.date &&
      req.body.startTime
    ) {
      try {
        await lockService.releaseLock({
          tenantId: req.body.tenantId,
          resourceId: req.body.specialistId,
          date: req.body.date,
          startTime: req.body.startTime,
          lockId: req.body.lockId,
        });
      } catch (releaseError) {
        console.error(
          "[Bookings] Failed to release lock on error:",
          releaseError
        );
      }
    }

    res.status(500).json({
      success: false,
      error: "Failed to create booking",
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/bookings/:id
 * @desc    Get booking details
 * @access  Public (with booking ID) or Protected
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findById(id)
      .populate("specialistId", "name email phone")
      .populate("serviceId", "name category");

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: "Booking not found",
      });
    }

    res.status(200).json({
      success: true,
      appointment,
    });
  } catch (error) {
    console.error("[Bookings] Error fetching booking:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch booking",
      message: error.message,
    });
  }
});

/**
 * @route   PATCH /api/bookings/:id/cancel
 * @desc    Cancel a booking
 * @access  Public (with booking ID) or Protected
 */
router.patch("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: "Booking not found",
      });
    }

    if (appointment.status === "cancelled") {
      return res.status(400).json({
        success: false,
        error: "Booking is already cancelled",
      });
    }

    appointment.status = "cancelled";
    appointment.cancellationReason = reason || "Cancelled by customer";
    appointment.cancelledAt = new Date();
    appointment.updatedAt = new Date();

    await appointment.save();

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      appointment,
    });

    // TODO: Send cancellation notification
    console.log("[Bookings] TODO: Send cancellation notification");
  } catch (error) {
    console.error("[Bookings] Error cancelling booking:", error);
    res.status(500).json({
      success: false,
      error: "Failed to cancel booking",
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/bookings/tenant/:tenantId
 * @desc    Get all bookings for a tenant (Admin)
 * @access  Protected - Admin only
 */
router.get("/tenant/:tenantId", requireAuth, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { date, status, specialistId, page = 1, limit = 50 } = req.query;

    // Verify admin has access to this tenant
    if (
      req.admin.role !== "super_admin" &&
      req.admin.tenantId.toString() !== tenantId
    ) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const query = { tenantId };

    if (date) {
      query.date = date;
    }

    if (status) {
      query.status = status;
    }

    if (specialistId) {
      query.specialistId = specialistId;
    }

    const skip = (page - 1) * limit;

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .populate("specialistId", "name email")
        .populate("serviceId", "name category")
        .sort({ date: -1, startTime: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Appointment.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      appointments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[Bookings] Error fetching tenant bookings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch bookings",
      message: error.message,
    });
  }
});

module.exports = router;
