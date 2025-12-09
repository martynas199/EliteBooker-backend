import express from "express";
import Appointment from "../models/Appointment.js";
import Order from "../models/Order.js";
import Specialist from "../models/Specialist.js";

const router = express.Router();

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

    // Build date filter
    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }

    const hasDateFilter = Object.keys(dateFilter).length > 0;

    // 1. Aggregate booking revenue by specialist
    const bookingMatch = {
      status: { $in: ["confirmed", "completed"] },
      "payment.status": "succeeded",
    };
    if (hasDateFilter) {
      bookingMatch.createdAt = dateFilter;
    }
    if (specialistId) {
      bookingMatch.specialistId = specialistId;
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
          beauticianName: "$Specialist.name",
          beauticianEmail: "$Specialist.email",
          totalBookings: 1,
          totalRevenue: 1,
          totalPlatformFees: 1,
          beauticianEarnings: {
            $subtract: ["$totalRevenue", "$totalPlatformFees"],
          },
        },
      },
    ]);

    // 2. Aggregate product revenue by specialist
    const orderMatch = {
      paymentStatus: "paid",
      orderStatus: { $ne: "cancelled" },
    };
    if (hasDateFilter) {
      orderMatch.createdAt = dateFilter;
    }

    // Get orders and extract specialist revenue
    const orders = await Order.find(orderMatch).populate({
      path: "items.productId",
      select: "specialistId",
    });

    // Group product revenue by specialist
    const productRevenueMap = new Map();
    for (const order of orders) {
      for (const item of order.items) {
        const specialistId = item.productId?.specialistId?.toString();
        if (specialistId) {
          if (
            specialistId &&
            (!req.query.specialistId || specialistId === req.query.specialistId)
          ) {
            const current = productRevenueMap.get(specialistId) || {
              totalOrders: 0,
              totalRevenue: 0,
            };
            current.totalOrders += 1;
            current.totalRevenue += item.price * item.quantity;
            productRevenueMap.set(specialistId, current);
          }
        }
      }
    }

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
    for (const [specialistId, productData] of productRevenueMap) {
      const existing = revenueByBeautician.get(specialistId);
      if (existing) {
        existing.products = {
          count: productData.totalOrders,
          revenue: productData.totalRevenue,
        };
        existing.totalEarnings += productData.totalRevenue;
      } else {
        // Specialist only has product sales, no bookings
        const specialist = await Specialist.findById(specialistId);
        if (specialist) {
          revenueByBeautician.set(specialistId, {
            specialistId,
            beauticianName: Specialist.name,
            beauticianEmail: Specialist.email,
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
    const { specialistId } = req.params;
    const { startDate, endDate } = req.query;

    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    // Get completed bookings
    const bookingMatch = {
      specialistId,
      status: { $in: ["confirmed", "completed"] },
      "payment.status": "succeeded",
    };
    if (hasDateFilter) bookingMatch.createdAt = dateFilter;

    const bookings = await Appointment.find(bookingMatch).sort({
      createdAt: -1,
    });

    const bookingTotal = bookings.reduce((sum, b) => sum + (b.price || 0), 0);
    const platformFees =
      bookings.reduce(
        (sum, b) => sum + (b.payment?.stripe?.platformFee || 50),
        0
      ) / 100; // Convert pence to pounds
    const bookingEarnings = bookingTotal - platformFees;

    // Get product sales
    const orders = await Order.find({
      paymentStatus: "paid",
      orderStatus: { $ne: "cancelled" },
      ...(hasDateFilter && { createdAt: dateFilter }),
    }).populate("items.productId");

    let productSales = [];
    let productEarnings = 0;

    for (const order of orders) {
      for (const item of order.items) {
        if (item.productId?.specialistId?.toString() === specialistId) {
          const itemTotal = item.price * item.quantity;
          productSales.push({
            orderId: order._id,
            orderNumber: order.orderNumber,
            product: item.title,
            quantity: item.quantity,
            amount: itemTotal,
            date: order.createdAt,
          });
          productEarnings += itemTotal;
        }
      }
    }

    res.json({
      success: true,
      specialist: {
        id: Specialist._id,
        name: Specialist.name,
        email: Specialist.email,
        stripeStatus: Specialist.stripeStatus,
        stripeConnected: Specialist.stripeStatus === "connected",
      },
      bookings: {
        count: bookings.length,
        totalRevenue: bookingTotal,
        platformFees,
        earnings: bookingEarnings,
        recentBookings: bookings.slice(0, 10).map((b) => ({
          id: b._id,
          clientName: b.client.name,
          price: b.price,
          date: b.start,
          status: b.status,
        })),
      },
      products: {
        count: productSales.length,
        earnings: productEarnings,
        recentSales: productSales.slice(0, 10),
      },
      totals: {
        totalEarnings: bookingEarnings + productEarnings,
        bookingEarnings,
        productEarnings,
        platformFees,
      },
      stripe: {
        accountId: Specialist.stripeAccountId,
        totalPayouts: Specialist.totalPayouts || 0,
        lastPayoutDate: Specialist.lastPayoutDate,
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
