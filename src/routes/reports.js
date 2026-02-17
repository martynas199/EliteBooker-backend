import express from "express";
import Appointment from "../models/Appointment.js";
import Order from "../models/Order.js";
import Specialist from "../models/Specialist.js";
import mongoose from "mongoose";

const router = express.Router();

function buildDateFilter(startDate, endDate) {
  const dateFilter = {};
  if (startDate) {
    dateFilter.$gte = new Date(startDate);
  }
  if (endDate) {
    dateFilter.$lte = new Date(endDate);
  }
  return Object.keys(dateFilter).length > 0 ? dateFilter : null;
}

function normalizeObjectId(value) {
  if (!value) return null;
  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return value;
}

/**
 * GET /api/reports/revenue
 * Get comprehensive revenue data for admin dashboard
 * Query params:
 *   - startDate: ISO date string
 *   - endDate: ISO date string
 *   - specialistId: filter by specific specialist
 */
router.get("/revenue", async (req, res) => {
  try {
    const { startDate, endDate, specialistId } = req.query;

    // CRITICAL: Get tenantId from request (set by optionalAuth middleware)
    const tenantId = req.tenantId;

    if (!tenantId) {
      console.warn("[Reports Revenue] No tenantId found in request");
      return res.status(403).json({ error: "Tenant context required" });
    }

    const dateFilter = buildDateFilter(startDate, endDate);
    const normalizedTenantId = normalizeObjectId(tenantId);
    const normalizedSpecialistId = normalizeObjectId(specialistId);

    // 1. Aggregate booking revenue by specialist FOR THIS TENANT ONLY
    const bookingMatch = {
      tenantId: normalizedTenantId, // CRITICAL: Filter by tenant
      status: { $in: ["confirmed", "completed"] },
      "payment.status": "succeeded",
    };
    if (dateFilter) {
      bookingMatch.createdAt = dateFilter;
    }
    if (normalizedSpecialistId) {
      bookingMatch.specialistId = normalizedSpecialistId;
    }

    const bookingRevenue = await Appointment.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: "$specialistId",
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$price" },
          totalPlatformFees: { $sum: "$payment.stripe.platformFee" },
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
      { $unwind: "$specialist" },
      {
        $project: {
          specialistId: "$_id",
          beauticianName: "$specialist.name",
          beauticianEmail: "$specialist.email",
          totalBookings: 1,
          totalRevenue: 1,
          totalPlatformFees: 1,
          beauticianEarnings: {
            $subtract: ["$totalRevenue", "$totalPlatformFees"],
          },
        },
      },
    ]);

    // 2. Aggregate product revenue by specialist FOR THIS TENANT ONLY
    const orderMatch = {
      tenantId: normalizedTenantId, // CRITICAL: Filter by tenant
      paymentStatus: "paid",
      orderStatus: { $ne: "cancelled" },
    };
    if (dateFilter) {
      orderMatch.createdAt = dateFilter;
    }

    const productPipeline = [
      { $match: orderMatch },
      { $unwind: "$items" },
      {
        $match: {
          "items.specialistId": { $exists: true, $ne: null },
          ...(normalizedSpecialistId && {
            "items.specialistId": normalizedSpecialistId,
          }),
        },
      },
      {
        $group: {
          _id: "$items.specialistId",
          totalOrders: { $sum: 1 },
          totalRevenue: {
            $sum: {
              $multiply: [
                { $ifNull: ["$items.price", 0] },
                { $ifNull: ["$items.quantity", 1] },
              ],
            },
          },
        },
      },
    ];

    const productRevenue = await Order.aggregate(productPipeline);

    // 3. Combine booking and product revenue
    const revenueByBeautician = new Map();

    for (const booking of bookingRevenue) {
      const id = booking.specialistId.toString();
      revenueByBeautician.set(id, {
        specialistId: id,
        beauticianName: booking.beauticianName,
        beauticianEmail: booking.beauticianEmail,
        bookings: {
          count: booking.totalBookings,
          revenue: booking.totalRevenue,
          platformFees: booking.totalPlatformFees || 0,
          earnings: booking.beauticianEarnings || booking.totalRevenue,
        },
        products: {
          count: 0,
          revenue: 0,
        },
        totalEarnings: booking.beauticianEarnings || booking.totalRevenue,
      });
    }

    // Add product revenue
    const specialistIdsFromProducts = productRevenue.map((entry) => entry._id);
    const specialistLookup = specialistIdsFromProducts.length
      ? await Specialist.find({ _id: { $in: specialistIdsFromProducts } })
          .select("_id name email")
          .lean()
      : [];
    const specialistNameMap = new Map(
      specialistLookup.map((sp) => [sp._id.toString(), sp]),
    );

    for (const productData of productRevenue) {
      const specialistIdKey = productData._id.toString();
      const existing = revenueByBeautician.get(specialistIdKey);
      if (existing) {
        existing.products = {
          count: productData.totalOrders,
          revenue: productData.totalRevenue,
        };
        existing.totalEarnings += productData.totalRevenue;
      } else {
        const specialistMeta = specialistNameMap.get(specialistIdKey);
        revenueByBeautician.set(specialistIdKey, {
          specialistId: specialistIdKey,
          beauticianName: specialistMeta?.name || "Unknown Specialist",
          beauticianEmail: specialistMeta?.email || "",
          bookings: {
            count: 0,
            revenue: 0,
            platformFees: 0,
            earnings: 0,
          },
          products: {
            count: productData.totalOrders,
            revenue: productData.totalRevenue,
          },
          totalEarnings: productData.totalRevenue,
        });
      }
    }

    // 4. Calculate platform totals
    let totalPlatformFees = 0;
    let totalBookingRevenue = 0;
    let totalProductRevenue = 0;
    let totalBeauticianEarnings = 0;

    for (const data of revenueByBeautician.values()) {
      totalPlatformFees += data.bookings.platformFees;
      totalBookingRevenue += data.bookings.revenue;
      totalProductRevenue += data.products.revenue;
      totalBeauticianEarnings += data.totalEarnings;
    }

    res.json({
      success: true,
      dateRange: {
        start: startDate || null,
        end: endDate || null,
      },
      platform: {
        totalFees: totalPlatformFees,
        totalBookingRevenue,
        totalProductRevenue,
        totalRevenue: totalBookingRevenue + totalProductRevenue,
      },
      specialists: Array.from(revenueByBeautician.values()),
      summary: {
        totalBeauticianEarnings,
        totalPlatformEarnings: totalPlatformFees,
        beauticianCount: revenueByBeautician.size,
      },
    });
  } catch (error) {
    console.error("Revenue report error:", error);
    res.status(500).json({
      error: "Failed to generate revenue report",
      message: error.message,
    });
  }
});

/**
 * GET /api/reports/specialist-earnings/:specialistId
 * Get detailed earnings for a specific specialist
 */
router.get("/specialist-earnings/:specialistId", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ error: "Tenant context required" });
    }

    const normalizedTenantId = normalizeObjectId(tenantId);
    const { specialistId } = req.params;
    const normalizedSpecialistId = normalizeObjectId(specialistId);
    if (!normalizedSpecialistId) {
      return res.status(400).json({ error: "Invalid specialist ID" });
    }
    const { startDate, endDate } = req.query;

    const specialist = await Specialist.findOne({
      _id: normalizedSpecialistId,
      tenantId: normalizedTenantId,
    }).lean();
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    const dateFilter = buildDateFilter(startDate, endDate);

    const bookingMatch = {
      tenantId: normalizedTenantId,
      specialistId: normalizedSpecialistId,
      status: { $in: ["confirmed", "completed"] },
      "payment.status": "succeeded",
    };
    if (dateFilter) bookingMatch.createdAt = dateFilter;

    const [bookingSummary] = await Appointment.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalRevenue: { $sum: { $ifNull: ["$price", 0] } },
          totalPlatformFeesPence: {
            $sum: { $ifNull: ["$payment.stripe.platformFee", 99] },
          },
        },
      },
    ]);

    const recentBookings = await Appointment.find(bookingMatch)
      .select("_id client start price status")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const orderMatch = {
      tenantId: normalizedTenantId,
      paymentStatus: "paid",
      orderStatus: { $ne: "cancelled" },
      ...(dateFilter && { createdAt: dateFilter }),
    };

    const productAggregateBase = [
      { $match: orderMatch },
      { $unwind: "$items" },
      { $match: { "items.specialistId": normalizedSpecialistId } },
    ];

    const [productSummary] = await Order.aggregate([
      ...productAggregateBase,
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          earnings: {
            $sum: {
              $multiply: [
                { $ifNull: ["$items.price", 0] },
                { $ifNull: ["$items.quantity", 1] },
              ],
            },
          },
        },
      },
    ]);

    const recentSales = await Order.aggregate([
      ...productAggregateBase,
      {
        $project: {
          _id: 0,
          orderId: "$_id",
          orderNumber: 1,
          product: "$items.title",
          quantity: "$items.quantity",
          amount: {
            $multiply: [
              { $ifNull: ["$items.price", 0] },
              { $ifNull: ["$items.quantity", 1] },
            ],
          },
          date: "$createdAt",
        },
      },
      { $sort: { date: -1 } },
      { $limit: 10 },
    ]);

    const bookingCount = Number(bookingSummary?.count || 0);
    const bookingTotal = Number(bookingSummary?.totalRevenue || 0);
    const platformFees =
      Number(bookingSummary?.totalPlatformFeesPence || 0) / 100;
    const bookingEarnings = bookingTotal - platformFees;

    const productCount = Number(productSummary?.count || 0);
    const productEarnings = Number(productSummary?.earnings || 0);

    res.json({
      success: true,
      specialist: {
        id: specialist._id,
        name: specialist.name,
        email: specialist.email,
        stripeStatus: specialist.stripeStatus,
        stripeConnected: specialist.stripeStatus === "connected",
      },
      bookings: {
        count: bookingCount,
        totalRevenue: bookingTotal,
        platformFees,
        earnings: bookingEarnings,
        recentBookings: recentBookings.map((b) => ({
          id: b._id,
          clientName: b.client?.name,
          price: b.price,
          date: b.start,
          status: b.status,
        })),
      },
      products: {
        count: productCount,
        earnings: productEarnings,
        recentSales,
      },
      totals: {
        totalEarnings: bookingEarnings + productEarnings,
        bookingEarnings,
        productEarnings,
        platformFees,
      },
      stripe: {
        accountId: specialist.stripeAccountId,
        totalPayouts: specialist.totalPayouts || 0,
        lastPayoutDate: specialist.lastPayoutDate,
      },
    });
  } catch (error) {
    console.error("Specialist earnings error:", error);
    res.status(500).json({
      error: "Failed to get specialist earnings",
      message: error.message,
    });
  }
});

export default router;
