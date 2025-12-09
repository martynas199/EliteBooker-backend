import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Appointment from "../models/Appointment.js";
import Order from "../models/Order.js";
import { authenticateUser } from "../middleware/userAuth.js";

const router = Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/users/me/bookings - Get user's bookings
router.get("/me/bookings", async (req, res) => {
  try {
    const bookings = await Appointment.find({ userId: req.userId })
      .populate("serviceId", "name description")
      .populate("specialistId", "name image")
      .sort({ start: -1 }) // Most recent first
      .lean();

    res.json({ bookings });
  } catch (error) {
    console.error("[USER] Get bookings error:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// GET /api/users/me/orders - Get user's product orders
router.get("/me/orders", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.userId })
      .populate("items.productId", "title images price")
      .sort({ createdAt: -1 }) // Most recent first
      .lean();

    res.json({ orders });
  } catch (error) {
    console.error("[USER] Get orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// PATCH /api/users/me - Update user profile
router.patch("/me", async (req, res) => {
  try {
    const { name, email, phone, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update basic fields
    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;

    // Email change requires verification
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        return res.status(400).json({ error: "Email already in use" });
      }
      user.email = email.toLowerCase();
    }

    // Password change requires current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password required" });
      }

      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: "New password must be at least 6 characters" });
      }

      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();

    console.log(`[USER] Profile updated: ${user.email}`);

    res.json({ user: user.toJSON() });
  } catch (error) {
    console.error("[USER] Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// DELETE /api/users/me - Delete user account
router.delete("/me", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res
        .status(400)
        .json({ error: "Password required to delete account" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    // Soft delete - deactivate account instead of deleting
    user.isActive = false;
    await user.save();

    console.log(`[USER] Account deactivated: ${user.email}`);

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("[USER] Delete account error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// PATCH /api/users/me/bookings/:id/cancel - Cancel a booking
router.patch("/me/bookings/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Verify ownership
    if (
      !appointment.userId ||
      appointment.userId.toString() !== req.userId.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to cancel this booking" });
    }

    // Check if already cancelled or completed
    if (
      [
        "completed",
        "cancelled_no_refund",
        "cancelled_partial_refund",
        "cancelled_full_refund",
      ].includes(appointment.status)
    ) {
      return res.status(400).json({ error: "Booking cannot be cancelled" });
    }

    // Check 24-hour cancellation policy
    const now = new Date();
    const appointmentTime = new Date(appointment.start);
    const hoursUntilAppointment = (appointmentTime - now) / (1000 * 60 * 60);

    let refundType = "cancelled_no_refund";
    if (hoursUntilAppointment >= 24) {
      refundType = "cancelled_full_refund";
    }

    // Update appointment
    appointment.status = refundType;
    appointment.audit.push({
      at: new Date(),
      action: "cancelled_by_customer",
      meta: { reason, hoursNotice: hoursUntilAppointment.toFixed(1) },
    });

    await appointment.save();

    console.log(`[USER] Booking cancelled: ${id} by user ${req.userId}`);

    res.json({
      message: "Booking cancelled successfully",
      refundType,
      appointment: appointment.toJSON(),
    });
  } catch (error) {
    console.error("[USER] Cancel booking error:", error);
    res.status(500).json({ error: "Failed to cancel booking" });
  }
});

export default router;
