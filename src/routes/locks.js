/**
 * Lock Management Routes
 * Handles temporary slot locks for preventing double-booking
 */

import express from "express";
import { getLockService } from "../services/lockService.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();
const lockService = getLockService();

/**
 * @route   POST /api/locks/acquire
 * @desc    Acquire a temporary lock on a booking slot
 * @access  Public (customer flow) or Protected (admin booking)
 */
router.post("/acquire", async (req, res) => {
  try {
    const { resourceId, date, startTime, duration, ttl } = req.body;

    // Validation
    if (!resourceId || !date || !startTime) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["resourceId", "date", "startTime"],
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        error: "Invalid date format",
        expected: "YYYY-MM-DD",
      });
    }

    // Validate time format (HH:mm)
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(startTime)) {
      return res.status(400).json({
        success: false,
        error: "Invalid time format",
        expected: "HH:mm",
      });
    }

    // Acquire lock
    const result = await lockService.acquireLock({
      resourceId,
      date,
      startTime,
      duration,
      ttl,
    });

    if (!result.locked) {
      return res.status(409).json({
        success: false,
        locked: false,
        reason: result.reason,
        message: "Slot is currently locked by another user",
        remainingTTL: result.remainingTTL,
      });
    }

    res.status(200).json({
      success: true,
      locked: true,
      lockId: result.lockId,
      expiresIn: result.expiresIn,
      expiresAt: result.expiresAt,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("[Locks] Error acquiring lock:", error);
    res.status(500).json({
      success: false,
      error: "Failed to acquire lock",
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/locks/verify
 * @desc    Verify that a lock exists and is valid
 * @access  Public (used before booking creation)
 */
router.post("/verify", async (req, res) => {
  try {
    const { resourceId, date, startTime, lockId } = req.body;

    // Validation
    if (!resourceId || !date || !startTime || !lockId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["resourceId", "date", "startTime", "lockId"],
      });
    }

    // Verify lock
    const result = await lockService.verifyLock({
      resourceId,
      date,
      startTime,
      lockId,
    });

    if (!result.valid) {
      return res.status(409).json({
        success: false,
        valid: false,
        reason: result.reason,
        message: result.message,
      });
    }

    res.status(200).json({
      success: true,
      valid: true,
      remainingTTL: result.remainingTTL,
    });
  } catch (error) {
    console.error("[Locks] Error verifying lock:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify lock",
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/locks/release
 * @desc    Release a lock manually (user cancels flow)
 * @access  Public
 */
router.post("/release", async (req, res) => {
  try {
    const { resourceId, date, startTime, lockId } = req.body;

    // Validation
    if (!resourceId || !date || !startTime || !lockId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["resourceId", "date", "startTime", "lockId"],
      });
    }

    // Release lock
    const result = await lockService.releaseLock({
      resourceId,
      date,
      startTime,
      lockId,
    });

    if (!result.released) {
      return res.status(404).json({
        success: false,
        released: false,
        reason: result.reason,
        message: "Lock not found or lockId mismatch",
      });
    }

    res.status(200).json({
      success: true,
      released: true,
    });
  } catch (error) {
    console.error("[Locks] Error releasing lock:", error);
    res.status(500).json({
      success: false,
      error: "Failed to release lock",
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/locks/refresh
 * @desc    Refresh/extend the TTL of an existing lock
 * @access  Public (during checkout process)
 */
router.post("/refresh", async (req, res) => {
  try {
    const { resourceId, date, startTime, lockId, ttl } = req.body;

    // Validation
    if (!resourceId || !date || !startTime || !lockId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["resourceId", "date", "startTime", "lockId"],
      });
    }

    // Refresh lock
    const result = await lockService.refreshLock({
      resourceId,
      date,
      startTime,
      lockId,
      ttl,
    });

    if (!result.refreshed) {
      return res.status(404).json({
        success: false,
        refreshed: false,
        reason: result.reason,
        message: "Lock not found or lockId mismatch",
      });
    }

    res.status(200).json({
      success: true,
      refreshed: true,
      expiresIn: result.expiresIn,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    console.error("[Locks] Error refreshing lock:", error);
    res.status(500).json({
      success: false,
      error: "Failed to refresh lock",
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/locks/admin/active
 * @desc    Get all active locks for a tenant (Admin monitoring)
 * @access  Protected - Admin only
 */
router.get("/admin/active", requireAdmin, async (req, res) => {
  try {
    const { resourceId } = req.query;
    const limit = parseInt(req.query.limit, 10) || 100;

    // Get active locks (optionally filtered by resourceId/beautician)
    const locks = await lockService.getActiveLocks(resourceId || null, limit);

    res.status(200).json({
      success: true,
      count: locks.length,
      locks,
    });
  } catch (error) {
    console.error("[Locks] Error fetching active locks:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch active locks",
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/locks/admin/force-release
 * @desc    Force release a lock (Admin only, bypasses ownership check)
 * @access  Protected - Admin only
 */
router.post("/admin/force-release", requireAdmin, async (req, res) => {
  try {
    const { resourceId, date, startTime } = req.body;

    // Validation
    if (!resourceId || !date || !startTime) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["resourceId", "date", "startTime"],
      });
    }

    // Force release lock
    const result = await lockService.forceReleaseLock({
      resourceId,
      date,
      startTime,
    });

    if (!result.released) {
      return res.status(404).json({
        success: false,
        released: false,
        reason: result.reason,
        message: "Lock not found",
      });
    }

    res.status(200).json({
      success: true,
      released: true,
    });
  } catch (error) {
    console.error("[Locks] Error force releasing lock:", error);
    res.status(500).json({
      success: false,
      error: "Failed to force release lock",
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/locks/metrics
 * @desc    Get lock service metrics
 * @access  Protected - Admin only
 */
router.get("/metrics", requireAdmin, async (req, res) => {
  try {
    const metrics = lockService.getMetrics();

    res.status(200).json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error("[Locks] Error fetching metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch metrics",
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/locks/health
 * @desc    Health check for lock service
 * @access  Public
 */
router.get("/health", async (req, res) => {
  try {
    const isHealthy = await lockService.healthCheck();

    if (!isHealthy) {
      return res.status(503).json({
        success: false,
        healthy: false,
        message: "Redis connection is not healthy",
      });
    }

    res.status(200).json({
      success: true,
      healthy: true,
      message: "Lock service is operational",
    });
  } catch (error) {
    console.error("[Locks] Health check error:", error);
    res.status(503).json({
      success: false,
      healthy: false,
      message: error.message,
    });
  }
});

export default router;
