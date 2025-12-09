import Order from "../models/Order.js";
import Product from "../models/Product.js";

/**
 * Get profit analytics and margin data
 * @route GET /api/analytics/profit
 * @access Private (Admin only)
 */
export const getProfitAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, productId, specialistId } = req.query;

    // Build query filters
    const matchFilters = {
      paymentStatus: "paid", // Only include paid orders
      orderStatus: { $nin: ["cancelled", "refunded"] }, // Exclude cancelled/refunded orders
    };

    // Date range filter
    if (startDate || endDate) {
      matchFilters.createdAt = {};
      if (startDate) {
        matchFilters.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set to end of day (23:59:59.999) instead of start of day
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        matchFilters.createdAt.$lte = endOfDay;
      }
    }

    console.log(`[ANALYTICS] Query filters:`, JSON.stringify(matchFilters));

    // Get orders with populated product data
    let orders = await Order.find(matchFilters)
      .populate({
        path: "items.productId",
        select: "title category specialistId variants purchasePrice",
        populate: {
          path: "specialistId",
          select: "name",
        },
      })
      .sort({ createdAt: -1 });

    console.log(`[ANALYTICS] Found ${orders.length} paid orders`);
    if (orders.length > 0) {
      console.log(
        `[ANALYTICS] Date range: ${orders[orders.length - 1].createdAt} to ${
          orders[0].createdAt
        }`
      );
    }

    // Filter by productId if specified
    if (productId) {
      const beforeFilter = orders.length;

      // Debug: Log product IDs from orders
      console.log(`[ANALYTICS] Looking for productId: ${productId}`);
      const foundProductIds = new Set();
      orders.forEach((order) => {
        order.items.forEach((item) => {
          if (item.productId?._id) {
            foundProductIds.add(item.productId._id.toString());
          }
        });
      });
      console.log(
        `[ANALYTICS] Product IDs in orders:`,
        Array.from(foundProductIds)
      );

      orders = orders.filter((order) =>
        order.items.some(
          (item) => item.productId?._id?.toString() === productId
        )
      );
      console.log(
        `[ANALYTICS] Filtered by productId ${productId}: ${beforeFilter} -> ${orders.length} orders`
      );
    }

    // Filter by specialistId if specified
    if (specialistId) {
      const beforeFilter = orders.length;
      orders = orders.filter((order) =>
        order.items.some(
          (item) =>
            item.productId?.specialistId?.toString() === specialistId ||
            item.specialistId?.toString() === specialistId
        )
      );
      console.log(
        `[ANALYTICS] Filtered by specialistId ${specialistId}: ${beforeFilter} -> ${orders.length} orders`
      );
    }

    // Calculate analytics
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalItems = 0;
    let profitableItems = 0;

    const productAnalytics = {};
    const categoryAnalytics = {};
    const monthlyAnalytics = {};
    const beauticianAnalytics = {};

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const product = item.productId;
        if (!product) return;

        const quantity = item.quantity;
        const salePrice = item.price;
        let purchasePrice = item.purchasePrice;

        // Fallback to product/variant purchase price if not in order
        if (!purchasePrice && product.variants?.length > 0) {
          const variant = product.variants.find(
            (v) => v._id.toString() === item.variantId?.toString()
          );
          purchasePrice = variant?.purchasePrice || 0;
        } else if (!purchasePrice) {
          purchasePrice = product.purchasePrice || 0;
        }

        const revenue = salePrice * quantity;
        const cost = purchasePrice * quantity;
        const profit = revenue - cost;
        const margin =
          salePrice > 0 ? ((salePrice - purchasePrice) / salePrice) * 100 : 0;

        // Totals
        totalRevenue += revenue;
        totalCost += cost;
        totalProfit += profit;
        totalItems += quantity;
        if (profit > 0) profitableItems += quantity;

        // Product analytics
        const productKey = product._id.toString();
        if (!productAnalytics[productKey]) {
          productAnalytics[productKey] = {
            productId: product._id,
            title: product.title,
            category: product.category,
            beauticianName: product.specialistId?.name || "Platform",
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            totalQuantity: 0,
            averageMargin: 0,
          };
        }
        productAnalytics[productKey].totalRevenue += revenue;
        productAnalytics[productKey].totalCost += cost;
        productAnalytics[productKey].totalProfit += profit;
        productAnalytics[productKey].totalQuantity += quantity;
        productAnalytics[productKey].averageMargin =
          productAnalytics[productKey].totalRevenue > 0
            ? ((productAnalytics[productKey].totalRevenue -
                productAnalytics[productKey].totalCost) /
                productAnalytics[productKey].totalRevenue) *
              100
            : 0;

        // Category analytics
        const category = product.category || "Uncategorized";
        if (!categoryAnalytics[category]) {
          categoryAnalytics[category] = {
            category,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            totalQuantity: 0,
            averageMargin: 0,
          };
        }
        categoryAnalytics[category].totalRevenue += revenue;
        categoryAnalytics[category].totalCost += cost;
        categoryAnalytics[category].totalProfit += profit;
        categoryAnalytics[category].totalQuantity += quantity;
        categoryAnalytics[category].averageMargin =
          categoryAnalytics[category].totalRevenue > 0
            ? ((categoryAnalytics[category].totalRevenue -
                categoryAnalytics[category].totalCost) /
                categoryAnalytics[category].totalRevenue) *
              100
            : 0;

        // Monthly analytics
        const month = order.createdAt.toISOString().slice(0, 7); // YYYY-MM
        if (!monthlyAnalytics[month]) {
          monthlyAnalytics[month] = {
            month,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            totalOrders: 0,
            averageMargin: 0,
          };
        }
        monthlyAnalytics[month].totalRevenue += revenue;
        monthlyAnalytics[month].totalCost += cost;
        monthlyAnalytics[month].totalProfit += profit;
        monthlyAnalytics[month].averageMargin =
          monthlyAnalytics[month].totalRevenue > 0
            ? ((monthlyAnalytics[month].totalRevenue -
                monthlyAnalytics[month].totalCost) /
                monthlyAnalytics[month].totalRevenue) *
              100
            : 0;

        // Specialist analytics
        const beauticianKey =
          product.specialistId?._id?.toString() || "platform";
        const beauticianName = product.specialistId?.name || "Platform";
        if (!beauticianAnalytics[beauticianKey]) {
          beauticianAnalytics[beauticianKey] = {
            specialistId:
              beauticianKey === "platform" ? null : product.specialistId._id,
            beauticianName,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            totalQuantity: 0,
            averageMargin: 0,
          };
        }
        beauticianAnalytics[beauticianKey].totalRevenue += revenue;
        beauticianAnalytics[beauticianKey].totalCost += cost;
        beauticianAnalytics[beauticianKey].totalProfit += profit;
        beauticianAnalytics[beauticianKey].totalQuantity += quantity;
        beauticianAnalytics[beauticianKey].averageMargin =
          beauticianAnalytics[beauticianKey].totalRevenue > 0
            ? ((beauticianAnalytics[beauticianKey].totalRevenue -
                beauticianAnalytics[beauticianKey].totalCost) /
                beauticianAnalytics[beauticianKey].totalRevenue) *
              100
            : 0;
      });

      // Count unique orders per month
      const month = order.createdAt.toISOString().slice(0, 7);
      if (monthlyAnalytics[month]) {
        const existingOrderIds = monthlyAnalytics[month].orderIds || new Set();
        if (!existingOrderIds.has(order._id.toString())) {
          existingOrderIds.add(order._id.toString());
          monthlyAnalytics[month].totalOrders = existingOrderIds.size;
          monthlyAnalytics[month].orderIds = existingOrderIds;
        }
      }
    });

    // Calculate overall metrics
    const overallMargin =
      totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const profitabilityRate =
      totalItems > 0 ? (profitableItems / totalItems) * 100 : 0;
    const averageOrderValue =
      orders.length > 0 ? totalRevenue / orders.length : 0;
    const averageProfitPerOrder =
      orders.length > 0 ? totalProfit / orders.length : 0;

    // Format response data
    const response = {
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        overallMargin: Math.round(overallMargin * 100) / 100,
        profitabilityRate: Math.round(profitabilityRate * 100) / 100,
        totalOrders: orders.length,
        totalItems,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        averageProfitPerOrder: Math.round(averageProfitPerOrder * 100) / 100,
      },
      products: Object.values(productAnalytics)
        .sort((a, b) => b.totalProfit - a.totalProfit)
        .map((item) => ({
          ...item,
          totalRevenue: Math.round(item.totalRevenue * 100) / 100,
          totalCost: Math.round(item.totalCost * 100) / 100,
          totalProfit: Math.round(item.totalProfit * 100) / 100,
          averageMargin: Math.round(item.averageMargin * 100) / 100,
        })),
      categories: Object.values(categoryAnalytics)
        .sort((a, b) => b.totalProfit - a.totalProfit)
        .map((item) => ({
          ...item,
          totalRevenue: Math.round(item.totalRevenue * 100) / 100,
          totalCost: Math.round(item.totalCost * 100) / 100,
          totalProfit: Math.round(item.totalProfit * 100) / 100,
          averageMargin: Math.round(item.averageMargin * 100) / 100,
        })),
      monthly: Object.values(monthlyAnalytics)
        .sort((a, b) => a.month.localeCompare(b.month))
        .map(({ orderIds, ...item }) => ({
          ...item,
          totalRevenue: Math.round(item.totalRevenue * 100) / 100,
          totalCost: Math.round(item.totalCost * 100) / 100,
          totalProfit: Math.round(item.totalProfit * 100) / 100,
          averageMargin: Math.round(item.averageMargin * 100) / 100,
        })),
      specialists: Object.values(beauticianAnalytics)
        .sort((a, b) => b.totalProfit - a.totalProfit)
        .map((item) => ({
          ...item,
          totalRevenue: Math.round(item.totalRevenue * 100) / 100,
          totalCost: Math.round(item.totalCost * 100) / 100,
          totalProfit: Math.round(item.totalProfit * 100) / 100,
          averageMargin: Math.round(item.averageMargin * 100) / 100,
        })),
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        productId: productId || null,
        specialistId: specialistId || null,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error getting profit analytics:", error);
    res.status(500).json({
      message: "Failed to get profit analytics",
      error: error.message,
    });
  }
};

/**
 * Get top performing products by profit
 * @route GET /api/analytics/top-products
 * @access Private (Admin only)
 */
export const getTopProducts = async (req, res) => {
  try {
    const { limit = 10, period = "30" } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const orders = await Order.find({
      paymentStatus: "paid",
      orderStatus: { $nin: ["cancelled", "refunded"] },
      createdAt: { $gte: startDate, $lte: endDate },
    }).populate({
      path: "items.productId",
      select: "title category specialistId variants purchasePrice",
    });

    const productStats = {};

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const product = item.productId;
        if (!product) return;

        const productKey = product._id.toString();
        let purchasePrice = item.purchasePrice;

        // Fallback to product/variant purchase price
        if (!purchasePrice && product.variants?.length > 0) {
          const variant = product.variants.find(
            (v) => v._id.toString() === item.variantId?.toString()
          );
          purchasePrice = variant?.purchasePrice || 0;
        } else if (!purchasePrice) {
          purchasePrice = product.purchasePrice || 0;
        }

        const revenue = item.price * item.quantity;
        const cost = purchasePrice * item.quantity;
        const profit = revenue - cost;

        if (!productStats[productKey]) {
          productStats[productKey] = {
            productId: product._id,
            title: product.title,
            category: product.category,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            totalQuantity: 0,
          };
        }

        productStats[productKey].totalRevenue += revenue;
        productStats[productKey].totalCost += cost;
        productStats[productKey].totalProfit += profit;
        productStats[productKey].totalQuantity += item.quantity;
      });
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, parseInt(limit))
      .map((item) => ({
        ...item,
        totalRevenue: Math.round(item.totalRevenue * 100) / 100,
        totalCost: Math.round(item.totalCost * 100) / 100,
        totalProfit: Math.round(item.totalProfit * 100) / 100,
        averageMargin:
          item.totalRevenue > 0
            ? Math.round(
                ((item.totalRevenue - item.totalCost) / item.totalRevenue) *
                  10000
              ) / 100
            : 0,
      }));

    res.json(topProducts);
  } catch (error) {
    console.error("Error getting top products:", error);
    res.status(500).json({
      message: "Failed to get top products",
      error: error.message,
    });
  }
};
