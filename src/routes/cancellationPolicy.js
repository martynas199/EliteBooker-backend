import express from "express";
import CancellationPolicy from "../models/CancellationPolicy.js";
import requireAdmin from "../middleware/requireAdmin.js";

const router = express.Router();

// GET /api/cancellation-policy/salon - Get salon-wide policy
router.get("/salon", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;

    let policy = await CancellationPolicy.findOne({
      tenantId,
      scope: "salon",
    }).lean();

    // Return defaults if no policy exists
    if (!policy) {
      policy = {
        scope: "salon",
        freeCancelHours: 24,
        noRefundHours: 2,
        rescheduleAllowedHours: 2,
        graceMinutes: 15,
        partialRefund: { percent: 50 },
        appliesTo: "auto",
      };
    }

    res.json(policy);
  } catch (error) {
    console.error("[CancellationPolicy] Error fetching salon policy:", error);
    res.status(500).json({ error: "Failed to fetch cancellation policy" });
  }
});

// PUT /api/cancellation-policy/salon - Update salon-wide policy
router.put("/salon", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const {
      freeCancelHours,
      noRefundHours,
      rescheduleAllowedHours,
      graceMinutes,
      partialRefund,
      appliesTo,
    } = req.body;

    // Validate inputs
    if (freeCancelHours < 0 || noRefundHours < 0) {
      return res.status(400).json({ error: "Hours must be non-negative" });
    }

    if (noRefundHours > freeCancelHours) {
      return res.status(400).json({
        error:
          "No refund window cannot be larger than free cancellation window",
      });
    }

    const updateData = {
      freeCancelHours: Number(freeCancelHours),
      noRefundHours: Number(noRefundHours),
      rescheduleAllowedHours: Number(rescheduleAllowedHours),
      graceMinutes: Number(graceMinutes),
      appliesTo,
    };

    if (partialRefund) {
      updateData.partialRefund = {
        percent: Number(partialRefund.percent || 50),
      };
    }

    const policy = await CancellationPolicy.findOneAndUpdate(
      { tenantId, scope: "salon" },
      updateData,
      { new: true, upsert: true }
    );

    console.log(
      `[CancellationPolicy] Updated salon policy for tenant ${tenantId}`
    );

    res.json(policy);
  } catch (error) {
    console.error("[CancellationPolicy] Error updating salon policy:", error);
    res.status(500).json({ error: "Failed to update cancellation policy" });
  }
});

// GET /api/cancellation-policy/specialist/:specialistId - Get specialist-specific policy
router.get("/specialist/:specialistId", requireAdmin, async (req, res) => {
  try {
    const { specialistId } = req.params;
    const tenantId = req.tenantId;

    let policy = await CancellationPolicy.findOne({
      tenantId,
      scope: "specialist",
      specialistId,
    }).lean();

    // Fallback to salon-wide policy if specialist doesn't have custom policy
    if (!policy) {
      policy = await CancellationPolicy.findOne({
        tenantId,
        scope: "salon",
      }).lean();
    }

    // Return defaults if nothing exists
    if (!policy) {
      policy = {
        scope: "salon",
        freeCancelHours: 24,
        noRefundHours: 2,
        rescheduleAllowedHours: 2,
        graceMinutes: 15,
        partialRefund: { percent: 50 },
        appliesTo: "auto",
      };
    }

    res.json(policy);
  } catch (error) {
    console.error(
      "[CancellationPolicy] Error fetching specialist policy:",
      error
    );
    res.status(500).json({ error: "Failed to fetch cancellation policy" });
  }
});

// PUT /api/cancellation-policy/specialist/:specialistId - Update specialist-specific policy
router.put("/specialist/:specialistId", requireAdmin, async (req, res) => {
  try {
    const { specialistId } = req.params;
    const tenantId = req.tenantId;
    const {
      freeCancelHours,
      noRefundHours,
      rescheduleAllowedHours,
      graceMinutes,
      partialRefund,
      appliesTo,
    } = req.body;

    // Validate inputs
    if (freeCancelHours < 0 || noRefundHours < 0) {
      return res.status(400).json({ error: "Hours must be non-negative" });
    }

    if (noRefundHours > freeCancelHours) {
      return res.status(400).json({
        error:
          "No refund window cannot be larger than free cancellation window",
      });
    }

    const updateData = {
      scope: "specialist",
      specialistId,
      freeCancelHours: Number(freeCancelHours),
      noRefundHours: Number(noRefundHours),
      rescheduleAllowedHours: Number(rescheduleAllowedHours),
      graceMinutes: Number(graceMinutes),
      appliesTo,
    };

    if (partialRefund) {
      updateData.partialRefund = {
        percent: Number(partialRefund.percent || 50),
      };
    }

    const policy = await CancellationPolicy.findOneAndUpdate(
      { tenantId, scope: "specialist", specialistId },
      updateData,
      { new: true, upsert: true }
    );

    console.log(
      `[CancellationPolicy] Updated specialist policy for ${specialistId}`
    );

    res.json(policy);
  } catch (error) {
    console.error(
      "[CancellationPolicy] Error updating specialist policy:",
      error
    );
    res.status(500).json({ error: "Failed to update cancellation policy" });
  }
});

// DELETE /api/cancellation-policy/specialist/:specialistId - Delete specialist-specific policy (reverts to salon-wide)
router.delete("/specialist/:specialistId", requireAdmin, async (req, res) => {
  try {
    const { specialistId } = req.params;
    const tenantId = req.tenantId;

    await CancellationPolicy.deleteOne({
      tenantId,
      scope: "specialist",
      specialistId,
    });

    console.log(
      `[CancellationPolicy] Deleted specialist policy for ${specialistId}`
    );

    res.json({ message: "Specialist policy deleted, using salon defaults" });
  } catch (error) {
    console.error(
      "[CancellationPolicy] Error deleting specialist policy:",
      error
    );
    res.status(500).json({ error: "Failed to delete cancellation policy" });
  }
});

export default router;
