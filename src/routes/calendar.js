/**
 * Google Calendar Integration Routes
 */

import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin.js";
import * as calendarService from "../services/googleCalendar.js";
import Beautician from "../models/Beautician.js";

const router = Router();

/**
 * GET /api/calendar/connect
 * Get Google OAuth URL to connect calendar
 */
router.get("/connect", requireAdmin, async (req, res) => {
  try {
    const beauticianId = req.admin.beauticianId;

    if (!beauticianId) {
      return res.status(400).json({
        error: "Only beauticians can connect Google Calendar",
      });
    }

    const authUrl = calendarService.getAuthUrl(beauticianId);

    res.json({ authUrl });
  } catch (error) {
    console.error("[Calendar] Connect error:", error);
    res.status(500).json({
      error: "Failed to generate auth URL",
      message: error.message,
    });
  }
});

/**
 * GET /api/calendar/callback
 * OAuth callback handler
 */
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send("Authorization code missing");
    }

    const beauticianId = state; // We passed beautician ID in state parameter

    // Exchange code for tokens
    const tokens = await calendarService.getTokensFromCode(code);

    // Save tokens to beautician record
    await calendarService.saveTokensForBeautician(beauticianId, tokens);

    // Redirect to admin settings page with success message
    res.redirect("/admin/settings?calendar=connected");
  } catch (error) {
    console.error("[Calendar] Callback error:", error);
    res.redirect("/admin/settings?calendar=error");
  }
});

/**
 * POST /api/calendar/disconnect
 * Disconnect Google Calendar
 */
router.post("/disconnect", requireAdmin, async (req, res) => {
  try {
    const beauticianId = req.admin.beauticianId;

    if (!beauticianId) {
      return res.status(400).json({
        error: "Only beauticians can disconnect Google Calendar",
      });
    }

    await calendarService.disconnectCalendar(beauticianId);

    res.json({
      success: true,
      message: "Google Calendar disconnected successfully",
    });
  } catch (error) {
    console.error("[Calendar] Disconnect error:", error);
    res.status(500).json({
      error: "Failed to disconnect calendar",
      message: error.message,
    });
  }
});

/**
 * GET /api/calendar/status
 * Check if Google Calendar is connected
 */
router.get("/status", requireAdmin, async (req, res) => {
  try {
    const beauticianId = req.admin.beauticianId;

    if (!beauticianId) {
      return res.json({ connected: false });
    }

    const beautician = await Beautician.findById(beauticianId).select(
      "googleCalendar"
    );

    res.json({
      connected: beautician?.googleCalendar?.enabled || false,
      email: beautician?.googleCalendar?.email || null,
    });
  } catch (error) {
    console.error("[Calendar] Status error:", error);
    res.status(500).json({
      error: "Failed to check calendar status",
      message: error.message,
    });
  }
});

export default router;
