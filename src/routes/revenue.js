import express from "express";
import Appointment from "../models/Appointment.js";
import dayjs from "dayjs";

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

    // Find all completed appointments in the date range FOR THIS TENANT ONLY
    // Use 'start' field instead of 'date' and 'confirmed' status
    const appointments = await Appointment.find({
      tenantId, // CRITICAL: Filter by tenant
      start: { $gte: start, $lte: end },
      status: { $in: ["completed", "confirmed"] },
    })
      .populate("specialistId", "name")
      .populate("serviceId", "name")
      .lean();

    // Group by specialist and calculate revenue
    const revenueByBeautician = {};

    appointments.forEach((apt) => {
      const beauticianName = apt.specialistId?.name || "Unknown Specialist";
      const specialistId = apt.specialistId?._id?.toString() || "unknown";
      const price = parseFloat(apt.price) || 0;

      if (!revenueByBeautician[specialistId]) {
        revenueByBeautician[specialistId] = {
          specialist: beauticianName,
          specialistId: specialistId,
          revenue: 0,
          bookings: 0,
          services: [],
        };
      }

      revenueByBeautician[specialistId].revenue += price;
      revenueByBeautician[specialistId].bookings += 1;

      // Track unique services
      const serviceName = apt.serviceId?.name || "Unknown Service";
      if (!revenueByBeautician[specialistId].services.includes(serviceName)) {
        revenueByBeautician[specialistId].services.push(serviceName);
      }
    });

    // Convert to array and sort by revenue (descending)
    const result = Object.values(revenueByBeautician)
      .map((item) => ({
        specialist: item.specialist,
        specialistId: item.specialistId,
        revenue: parseFloat(item.revenue.toFixed(2)),
        bookings: item.bookings,
        serviceCount: item.services.length,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Calculate total revenue
    const totalRevenue = result.reduce((sum, item) => sum + item.revenue, 0);

    res.json({
      startDate,
      endDate,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalBookings: appointments.length,
      specialists: result,
    });
  } catch (err) {
    console.error("Revenue API error:", err);
    res.status(500).json({ error: "Failed to fetch revenue data" });
  }
});

export default router;
