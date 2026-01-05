import express from "express";
import mongoose from "mongoose";
import ClientService from "../services/clientService.js";
import Client from "../models/Client.js";
import Appointment from "../models/Appointment.js";
import Tenant from "../models/Tenant.js";
import Specialist from "../models/Specialist.js";
import jwt from "jsonwebtoken";
import smsService from "../services/smsService.js";
import { sendConfirmationEmail } from "../emails/mailer.js";
import { resetReminderOnReschedule } from "../services/reminderService.js";
import { updateCalendarEvent } from "../services/googleCalendar.js";

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Middleware to authenticate client
 */
const authenticateClient = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    const cookieToken = req.cookies?.clientToken;
    const headerToken = req.headers.authorization?.replace("Bearer ", "");
    const token = cookieToken || headerToken;

    console.log(
      "[Client Auth] Cookie token:",
      cookieToken ? "present" : "missing"
    );
    console.log(
      "[Client Auth] Header token:",
      headerToken ? "present" : "missing"
    );

    if (!token) {
      console.log("[Client Auth] No token found - returning 401");
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== "client") {
      return res.status(401).json({
        success: false,
        error: "Invalid token type",
      });
    }

    const client = await Client.findById(decoded.id);

    if (!client || !client.isActive) {
      return res.status(401).json({
        success: false,
        error: "Client not found or inactive",
      });
    }

    req.client = client;
    next();
  } catch (error) {
    console.error("[Client Auth] Error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

/**
 * POST /api/client/register
 * Register a new client account or upgrade from soft signup
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: "Email, password, and name are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters",
      });
    }

    const result = await ClientService.registerClient({
      email,
      password,
      name,
      phone,
    });

    // Generate JWT
    const token = jwt.sign(
      {
        id: result.client._id,
        email: result.client.email,
        type: "client",
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Keep cookie for backward compatibility, but also return token
    res.cookie("clientToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      success: true,
      message: "Registration successful. Please verify your email.",
      token, // Return token for localStorage
      client: {
        id: result.client._id,
        email: result.client.email,
        name: result.client.name,
        phone: result.client.phone,
        isEmailVerified: result.client.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("[Client Register] Error:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Registration failed",
    });
  }
});

/**
 * POST /api/client/login
 * Login client
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    const client = await ClientService.loginClient(email, password);

    // Generate JWT
    const token = jwt.sign(
      {
        id: client._id,
        email: client.email,
        type: "client",
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Keep cookie for backward compatibility, but also return token
    res.cookie("clientToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      success: true,
      token, // Return token for localStorage
      client: {
        id: client._id,
        email: client.email,
        name: client.name,
        phone: client.phone,
        isEmailVerified: client.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("[Client Login] Error:", error);
    res.status(401).json({
      success: false,
      error: error.message || "Login failed",
    });
  }
});

/**
 * POST /api/client/logout
 * Logout client (clear cookie)
 * IMPORTANT: clearCookie options must EXACTLY match the cookie() options used when setting it
 */
router.post("/logout", (req, res) => {
  console.log("[Client Logout] Clearing all auth cookies");

  // Must use EXACT same options as when cookie was set (see oauth.js)
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };

  // Clear both clientToken and refreshToken
  res.clearCookie("clientToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);

  console.log("[Client Logout] Cookies cleared:", {
    clientToken: "cleared",
    refreshToken: "cleared",
    options: cookieOptions,
  });

  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

/**
 * GET /api/client/profile
 * Get client's global profile across all businesses
 */
router.get("/profile", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;

    const profile = await ClientService.getClientGlobalProfile(clientId);

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("[Client Profile] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch profile",
    });
  }
});

/**
 * GET /api/client/bookings
 * Get all bookings across all businesses
 */
router.get("/bookings", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;
    const { status, tenantId, limit = 50, skip = 0 } = req.query;

    const filter = { clientId };
    if (status) filter.status = status;
    if (tenantId) filter.tenantId = tenantId;

    const bookings = await Appointment.find(filter)
      .populate("tenantId", "name slug branding")
      .populate("serviceId", "name category price duration")
      .populate("specialistId", "name email avatar")
      .sort({ start: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean(); // Return plain objects for better performance

    const total = await Appointment.countDocuments(filter);

    res.json({
      success: true,
      bookings,
      total,
      hasMore: skip + bookings.length < total,
    });
  } catch (error) {
    console.error("[Client Bookings] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch bookings",
    });
  }
});

/**
 * PATCH /api/client/profile
 * Update client's global profile
 */
router.patch("/profile", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;
    const { name, phone, preferredLanguage, preferredCurrency } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (preferredLanguage) updates.preferredLanguage = preferredLanguage;
    if (preferredCurrency) updates.preferredCurrency = preferredCurrency;

    const client = await Client.findByIdAndUpdate(
      clientId,
      { $set: updates },
      { new: true }
    );

    res.json({
      success: true,
      client: {
        id: client._id,
        email: client.email,
        name: client.name,
        phone: client.phone,
        preferredLanguage: client.preferredLanguage,
        preferredCurrency: client.preferredCurrency,
      },
    });
  } catch (error) {
    console.error("[Client Update Profile] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update profile",
    });
  }
});

/**
 * GET /api/client/export
 * GDPR: Export all client data
 */
router.get("/export", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;

    const data = await ClientService.exportClientData(clientId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[Client Export] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to export data",
    });
  }
});

/**
 * DELETE /api/client/account
 * GDPR: Delete all client data
 */
router.delete("/account", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;
    const { confirmEmail } = req.body;

    if (confirmEmail !== req.client.email) {
      return res.status(400).json({
        success: false,
        error: "Email confirmation does not match",
      });
    }

    await ClientService.deleteClientData(clientId);

    res.json({
      success: true,
      message: "All your data has been deleted",
    });
  } catch (error) {
    console.error("[Client Delete] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to delete account",
    });
  }
});

/**
 * GET /api/client/me
 * Get current authenticated client info
 */
router.get("/me", authenticateClient, async (req, res) => {
  try {
    res.json({
      success: true,
      client: {
        id: req.client._id,
        email: req.client.email,
        name: req.client.name,
        phone: req.client.phone,
        avatar: req.client.avatar,
        isEmailVerified: req.client.isEmailVerified,
        memberSince: req.client.memberSince,
        totalBookings: req.client.totalBookings,
        preferredLanguage: req.client.preferredLanguage,
        preferredCurrency: req.client.preferredCurrency,
      },
    });
  } catch (error) {
    console.error("[Client Me] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch client info",
    });
  }
});

/**
 * POST /api/client/bookings/:id/reschedule
 * Reschedule an appointment
 */
router.post(
  "/bookings/:id/reschedule",
  authenticateClient,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { newStart, newEnd } = req.body;

      // Validate inputs
      if (!newStart || !newEnd) {
        return res.status(400).json({
          success: false,
          error: "New start and end times are required",
        });
      }

      // Find the appointment
      const appointment = await Appointment.findById(id)
        .populate("tenantId")
        .populate("specialistId");

      if (!appointment) {
        return res.status(404).json({
          success: false,
          error: "Appointment not found",
        });
      }

      // Verify the client owns this appointment
      if (appointment.clientId?.toString() !== req.client._id.toString()) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to reschedule this appointment",
        });
      }

      // Check if appointment can be rescheduled
      if (!["confirmed", "reserved_unpaid"].includes(appointment.status)) {
        return res.status(400).json({
          success: false,
          error: `Cannot reschedule ${appointment.status} appointments`,
        });
      }

      // Get reschedule policy - check specialist-specific first, then salon-wide
      const CancellationPolicy = mongoose.model("CancellationPolicy");
      let policy = await CancellationPolicy.findOne({
        tenantId: appointment.tenantId,
        scope: "specialist",
        specialistId: appointment.specialistId,
      }).lean();

      // Fallback to salon-wide policy
      if (!policy) {
        policy = await CancellationPolicy.findOne({
          tenantId: appointment.tenantId,
          scope: "salon",
        }).lean();
      }

      // Use defaults if no policy exists
      const rescheduleAllowedHours = policy?.rescheduleAllowedHours || 2;

      // Also check tenant setting for backwards compatibility
      const tenant = await Tenant.findById(appointment.tenantId);
      const allowRescheduling =
        tenant?.schedulingSettings?.allowClientRescheduling !== false;

      // Check if tenant allows client rescheduling
      if (!allowRescheduling) {
        return res.status(403).json({
          success: false,
          error:
            "Online rescheduling is not available. Please contact us directly.",
        });
      }

      // Check if reschedule is within allowed time
      const now = new Date();
      const hoursUntilAppointment =
        (new Date(appointment.start) - now) / (1000 * 60 * 60);

      if (hoursUntilAppointment < rescheduleAllowedHours) {
        return res.status(400).json({
          success: false,
          error: `Rescheduling requires at least ${rescheduleAllowedHours} hours notice. Please contact us directly.`,
        });
      }

      // Validate new time is in the future
      if (new Date(newStart) < now) {
        return res.status(400).json({
          success: false,
          error: "Cannot reschedule to a past time",
        });
      }

      // Check if new slot is available
      const conflictingAppointment = await Appointment.findOne({
        tenantId: appointment.tenantId,
        specialistId: appointment.specialistId,
        _id: { $ne: appointment._id },
        status: {
          $nin: [
            "cancelled_no_refund",
            "cancelled_partial_refund",
            "cancelled_full_refund",
          ],
        },
        $or: [
          {
            start: { $lt: new Date(newEnd) },
            end: { $gt: new Date(newStart) },
          },
        ],
      });

      if (conflictingAppointment) {
        return res.status(409).json({
          success: false,
          error:
            "This time slot is no longer available. Please select another time.",
        });
      }

      // Store old date/time for notifications
      const oldStart = new Date(appointment.start);
      const oldDate = oldStart.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const oldTime = oldStart.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Update appointment
      appointment.start = new Date(newStart);
      appointment.end = new Date(newEnd);
      appointment.audit.push({
        at: new Date(),
        action: "rescheduled",
        by: "client",
        meta: {
          oldStart: oldStart,
          newStart: new Date(newStart),
          clientId: req.client._id,
        },
      });

      await appointment.save();

      // Reset reminder flag so new reminder is sent
      await resetReminderOnReschedule(
        appointment._id,
        oldStart,
        new Date(newStart)
      );

      // Update Google Calendar if integrated
      if (
        appointment.googleCalendarEventId &&
        appointment.specialistId?.googleCalendar?.refreshToken
      ) {
        try {
          await updateCalendarEvent(
            appointment.specialistId._id,
            appointment.googleCalendarEventId,
            appointment
          );
        } catch (calErr) {
          console.error("[Reschedule] Google Calendar update failed:", calErr);
          // Don't fail the request if calendar update fails
        }
      }

      // Send notifications
      try {
        // Check if specialist has active SMS subscription AND tenant has SMS enabled
        const Specialist = mongoose.model("Specialist");
        const specialist = await Specialist.findById(
          appointment.specialistId
        ).select("subscription");

        const hasActiveSmsSubscription =
          specialist?.subscription?.smsConfirmations?.enabled === true;
        const tenantSmsEnabled = tenant?.features?.smsConfirmations === true;

        if (!hasActiveSmsSubscription) {
          console.log(
            "[Reschedule] Specialist does not have active SMS subscription (enabled=" +
              specialist?.subscription?.smsConfirmations?.enabled +
              "), skipping SMS"
          );
        } else if (!tenantSmsEnabled) {
          console.log(
            "[Reschedule] Tenant SMS feature is disabled, skipping SMS"
          );
        } else if (appointment.client?.phone) {
          await smsService.sendBookingRescheduled(
            appointment,
            oldDate,
            oldTime
          );
        }

        // Send email notification
        if (appointment.client?.email) {
          await sendConfirmationEmail({
            to: appointment.client.email,
            clientName: appointment.client.name,
            serviceName:
              appointment.services?.[0]?.serviceName || "Appointment",
            specialistName: appointment.specialistId?.name || "Your specialist",
            date: appointment.start,
            duration:
              appointment.totalDuration ||
              appointment.services?.[0]?.duration ||
              60,
            businessName: tenant?.name || "Our Business",
            rescheduleNote: `This appointment was rescheduled from ${oldDate} at ${oldTime}.`,
          });
        }
      } catch (notifErr) {
        console.error("[Reschedule] Notification error:", notifErr);
        // Don't fail the request if notifications fail
      }

      res.json({
        success: true,
        message: "Appointment rescheduled successfully",
        appointment: {
          id: appointment._id,
          start: appointment.start,
          end: appointment.end,
          status: appointment.status,
        },
      });
    } catch (error) {
      console.error("[Client Reschedule] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to reschedule appointment",
      });
    }
  }
);

export default router;
export { authenticateClient };
