import express from "express";
import Appointment from "../models/Appointment.js";
import dayjs from "dayjs";
import mongoose from "mongoose";

const router = express.Router();

/**
 * GET /api/revenue
 * Query params: startDate, endDate (YYYY-MM-DD)
 * Returns revenue analytics by specialist
 */
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // CRITICAL: Get tenantId from request (set by optionalAuth middleware)
    const tenantId = req.tenantId;

    if (!tenantId) {
      console.warn("[Revenue] No tenantId found in request");
      return res.status(403).json({ error: "Tenant context required" });
    }

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "Both startDate and endDate are required (YYYY-MM-DD format)",
      });
    }

    const start = dayjs(startDate).startOf("day").toDate();
    const end = dayjs(endDate).endOf("day").toDate();

    if (!dayjs(startDate).isValid() || !dayjs(endDate).isValid()) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    if (start > end) {
      return res
        .status(400)
        .json({ error: "startDate must be before or equal to endDate" });
    }

    const normalizedTenantId =
      typeof tenantId === "string" && mongoose.Types.ObjectId.isValid(tenantId)
        ? new mongoose.Types.ObjectId(tenantId)
        : tenantId;

    // Aggregate in MongoDB to reduce payload transfer and Node.js CPU work
    const specialists = await Appointment.aggregate([
      {
        $match: {
          tenantId: normalizedTenantId,
          start: { $gte: start, $lte: end },
          status: { $in: ["completed", "confirmed"] },
        },
      },
      {
        $group: {
          _id: "$specialistId",
          revenue: { $sum: { $ifNull: ["$price", 0] } },
          bookings: { $sum: 1 },
          serviceIds: { $addToSet: "$serviceId" },
        },
      },
      {
        $lookup: {
          from: "specialists",
          localField: "_id",
          foreignField: "_id",
          as: "specialist",
        },
      },
      {
        $unwind: {
          path: "$specialist",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          specialist: { $ifNull: ["$specialist.name", "Unknown Specialist"] },
          specialistId: {
            $cond: [
              { $ifNull: ["$_id", false] },
              { $toString: "$_id" },
              "unknown",
            ],
          },
          revenue: { $round: ["$revenue", 2] },
          bookings: 1,
          serviceCount: {
            $size: {
              $filter: {
                input: "$serviceIds",
                as: "serviceId",
                cond: { $ne: ["$$serviceId", null] },
              },
            },
          },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const totalRevenue = specialists.reduce(
      (sum, item) => sum + (Number(item.revenue) || 0),
      0,
    );
    const totalBookings = specialists.reduce(
      (sum, item) => sum + (Number(item.bookings) || 0),
      0,
    );

    res.json({
      startDate,
      endDate,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalBookings,
      specialists,
    });
  } catch (err) {
    console.error("Revenue API error:", err);
    res.status(500).json({ error: "Failed to fetch revenue data" });
  }
});

export default router;
