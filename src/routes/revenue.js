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

    // Find all completed appointments in the date range
    // Use 'start' field instead of 'date' and 'confirmed' status
    const appointments = await Appointment.find({
      start: { $gte: start, $lte: end },
      status: { $in: ["completed", "confirmed"] },
    })
      .populate("beauticianId", "name")
      .populate("serviceId", "name")
      .lean();

    // Group by specialist and calculate revenue
    const revenueByBeautician = {};

    appointments.forEach((apt) => {
      const beauticianName = apt.beauticianId?.name || "Unknown Beautician";
      const beauticianId = apt.beauticianId?._id?.toString() || "unknown";
      const price = parseFloat(apt.price) || 0;

      if (!revenueByBeautician[beauticianId]) {
        revenueByBeautician[beauticianId] = {
          specialist: beauticianName,
          beauticianId: beauticianId,
          revenue: 0,
          bookings: 0,
          services: [],
        };
      }

      revenueByBeautician[beauticianId].revenue += price;
      revenueByBeautician[beauticianId].bookings += 1;

      // Track unique services
      const serviceName = apt.serviceId?.name || "Unknown Service";
      if (!revenueByBeautician[beauticianId].services.includes(serviceName)) {
        revenueByBeautician[beauticianId].services.push(serviceName);
      }
    });

    // Convert to array and sort by revenue (descending)
    const result = Object.values(revenueByBeautician)
      .map((item) => ({
        specialist: item.specialist,
        beauticianId: item.beauticianId,
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
