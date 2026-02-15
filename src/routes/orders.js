import { Router } from "express";
import Stripe from "stripe";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Specialist from "../models/Specialist.js";
import {
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendOrderReadyForCollectionEmail,
  sendBeauticianProductOrderNotification,
} from "../emails/mailer.js";
import {
  applyQueryOptimizations,
  executePaginatedQuery,
  MAX_LIMIT,
} from "../utils/queryHelpers.js";
import { createConsoleLogger } from "../utils/logger.js";

const router = Router();
const LOG_ORDERS =
  process.env.LOG_ORDERS === "true" || process.env.LOG_VERBOSE === "true";
const console = createConsoleLogger({ scope: "orders", verbose: LOG_ORDERS });

let stripeInstance = null;
function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

// GET /api/orders - List all orders (admin)
router.get("/", async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) filter.orderStatus = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

    // Pagination support
    const usePagination = req.query.page !== undefined;

    // Build optimized query with lean and select
    let orderQuery = Order.find(filter)
      .select(
        "orderNumber userId items subtotal shipping total orderStatus paymentStatus createdAt shippingAddress"
      )
      .lean();

    // Apply pagination and optimizations with enforced MAX_LIMIT
    orderQuery = applyQueryOptimizations(orderQuery, req.query, {
      defaultSort: "-createdAt",
      maxLimit: MAX_LIMIT,
      lean: false,
    });

    if (usePagination) {
      // Paginated response with caching
      const cacheKey = `orders:${req.query.status || "all"}:${req.query.paymentStatus || "all"}`;
      const result = await executePaginatedQuery(
        orderQuery,
        Order,
        filter,
        req.query,
        { useCache: true, cacheKey }
      );

      res.json(result);
    } else {
      // Legacy: return limited orders
      const orders = await orderQuery;
      res.json(orders);
    }
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/confirm-checkout - Confirm product checkout payment
// IMPORTANT: Must come BEFORE /:id route to avoid being caught as an ID
router.get("/confirm-checkout", async (req, res) => {
  try {
    const stripe = getStripe();
    const { session_id, orderId } = req.query;

    if (!session_id || !orderId) {
      return res.status(400).json({ error: "Missing session_id or orderId" });
    }

    const order = await Order.findById(orderId).populate("items.productId");
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent"],
    });

    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    // Update order payment status
    order.paymentStatus = "paid";
    order.orderStatus = "processing";
    order.stripePaymentIntentId =
      session.payment_intent?.id || session.payment_intent;

    // Process Stripe Connect payment for specialist-owned products
    // For destination charges, payment is automatically sent to specialist
    // We only need to update the payment status and specialist earnings
    if (order.stripeConnectPayments && order.stripeConnectPayments.length > 0) {
      for (const payment of order.stripeConnectPayments) {
        const specialist = await Specialist.findById(payment.specialistId);

        if (
          specialist &&
          Specialist.stripeAccountId &&
          Specialist.stripeStatus === "connected"
        ) {
          try {
            // Destination charge: payment already sent directly to specialist
            // Specialist pays all Stripe fees, platform pays nothing
            payment.status = "succeeded";
            payment.paymentIntentId =
              session.payment_intent?.id || session.payment_intent;

            // Update specialist earnings
            await Specialist.findByIdAndUpdate(Specialist._id, {
              $inc: { totalEarnings: payment.amount },
            });

            console.log(
              `[PRODUCT ORDER] Direct payment processed for specialist ${Specialist._id} - amount: £${payment.amount}`
            );
          } catch (error) {
            console.error(
              `[PRODUCT ORDER] Payment processing failed for specialist ${Specialist._id}:`,
              error
            );
            payment.status = "failed";
          }
        } else {
          console.log(
            `[PRODUCT ORDER] Specialist ${payment.specialistId} not connected to Stripe`
          );
          payment.status = "failed";
        }
      }
    }

    await order.save();

    // Update stock
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        if (item.variantId && product.variants) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            variant.stock -= item.quantity;
          }
        } else {
          product.stock -= item.quantity;
        }
        await product.save();
      }
    }

    // Send order confirmation emails
    console.log("[ORDER CONFIRM] About to send order confirmation emails...");
    try {
      // Reload order with populated product data for emails
      const populatedOrder = await Order.findById(order._id).populate(
        "items.productId"
      );
      console.log(
        "[ORDER CONFIRM] Loaded order with products. Customer email:",
        populatedOrder.customer?.email
      );

      // Send customer confirmation email
      await sendOrderConfirmationEmail({ order: populatedOrder });
      console.log(
        "[ORDER CONFIRM] Customer confirmation email sent to:",
        populatedOrder.customer?.email
      );

      // Send admin notification email

      // Send notifications to specialists for their products
      const itemsByBeautician = {};
      for (const item of populatedOrder.items) {
        const specialistId = item.productId?.specialistId;
        if (specialistId) {
          const beauticianIdStr = specialistId.toString();
          if (!itemsByBeautician[beauticianIdStr]) {
            itemsByBeautician[beauticianIdStr] = [];
          }
          itemsByBeautician[beauticianIdStr].push(item);
        }
      }

      for (const [specialistId, items] of Object.entries(itemsByBeautician)) {
        try {
          const specialist = await Specialist.findById(specialistId);
          if (specialist?.email) {
            await sendBeauticianProductOrderNotification({
              order: populatedOrder,
              specialist,
              beauticianItems: items,
            });
            console.log(
              `[ORDER CONFIRM] Specialist notification sent to ${Specialist.email} for ${items.length} product(s)`
            );
          }
        } catch (beauticianEmailErr) {
          console.error(
            `[ORDER CONFIRM] Failed to send specialist notification to ${specialistId}:`,
            beauticianEmailErr
          );
          // Continue with other specialists
        }
      }
    } catch (emailErr) {
      console.error("[ORDER CONFIRM] Failed to send order emails:", emailErr);
      // Don't fail the request if email fails
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error("Error confirming product checkout:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/number/:orderNumber - Get order by order number
router.get("/number/:orderNumber", async (req, res) => {
  try {
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
    });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/:id - Get single order by ID
// IMPORTANT: Must come AFTER specific routes like /confirm-checkout and /number/:orderNumber
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders/checkout - Create Stripe checkout session for product order
router.post("/checkout", async (req, res) => {
  try {
    const stripe = getStripe();
    const {
      items,
      shippingAddress,
      shippingMethod,
      currency: requestedCurrency,
    } = req.body;

    console.log("[CHECKOUT] Requested currency:", requestedCurrency);

    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ error: "Order must have at least one item" });
    }

    // Validate and prepare items with specialist info
    const validatedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId).populate(
        "specialistId"
      );
      if (!product) {
        return res
          .status(400)
          .json({ error: `Product not found: ${item.productId}` });
      }

      // Security: Validate specialist ownership
      if (!product.specialistId) {
        return res.status(400).json({
          error: `Product "${product.title}" is not assigned to a specialist`,
        });
      }

      let variant = null;
      let price, stock, size;

      if (item.variantId && product.variants && product.variants.length > 0) {
        variant = product.variants.id(item.variantId);
        if (!variant) {
          return res
            .status(400)
            .json({ error: `Variant not found for product: ${product.title}` });
        }
        // Security: Use actual price from database, ignore client-provided price
        price =
          requestedCurrency?.toUpperCase() === "EUR" && variant.priceEUR != null
            ? variant.priceEUR
            : variant.price;
        stock = variant.stock;
        size = variant.size;
      } else {
        // Security: Use actual price from database, ignore client-provided price
        price =
          requestedCurrency?.toUpperCase() === "EUR" && product.priceEUR != null
            ? product.priceEUR
            : product.price;
        stock = product.stock;
        size = product.size;
      }

      // Security: Validate quantity is positive integer
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return res.status(400).json({
          error: `Invalid quantity for ${product.title}`,
        });
      }

      // Security: Validate price is valid
      if (typeof price !== "number" || price < 0) {
        return res.status(400).json({
          error: `Invalid price for ${product.title}`,
        });
      }

      if (stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.title}. Available: ${stock}, Requested: ${item.quantity}`,
        });
      }

      // Security: Validate specialist has connected Stripe account
      if (
        !product.specialistId.stripeAccountId ||
        product.specialistId.stripeStatus !== "connected"
      ) {
        return res.status(400).json({
          error: `Product "${product.title}" belongs to a specialist who hasn't set up payment processing yet. Please contact support.`,
        });
      }

      validatedItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        title: product.title,
        size: size,
        price: price, // Always use database price, never client-provided
        quantity: item.quantity,
        image: product.image?.url || product.images?.[0]?.url || "",
        specialistId: product.specialistId._id,
        specialist: product.specialistId,
      });

      subtotal += price * item.quantity;
    }

    // Use selected shipping method price, or calculate default
    const shipping = shippingMethod?.price ?? (subtotal >= 50 ? 0 : 5.99);
    const total = subtotal + shipping;

    // Use requested currency or default to environment/gbp
    const currency = (
      requestedCurrency ||
      process.env.STRIPE_CURRENCY ||
      "gbp"
    ).toLowerCase();

    console.log("[CHECKOUT] Final currency for Stripe:", currency);

    // Create pending order
    const order = new Order({
      items: validatedItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        title: item.title,
        size: item.size,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
        specialistId: item.specialistId,
      })),
      shippingAddress,
      isCollection: req.body.isCollection || false,
      subtotal,
      shipping,
      tax: 0,
      total,
      currency: currency.toUpperCase(),
      paymentStatus: "pending",
      orderStatus: "pending",
      ...(req.body.userId ? { userId: req.body.userId } : {}), // Add userId if provided
    });

    await order.save();

    // Group items by specialist for Stripe Connect
    const itemsByBeautician = new Map();
    for (const item of validatedItems) {
      const specialistId = item.specialistId.toString();
      if (!itemsByBeautician.has(specialistId)) {
        itemsByBeautician.set(specialistId, []);
      }
      itemsByBeautician.get(specialistId).push(item);
    }

    // Security: Enforce single specialist per order
    if (itemsByBeautician.size > 1) {
      return res.status(400).json({
        error:
          "Cannot checkout with products from multiple specialists. Please complete separate orders for each Specialist.",
      });
    }

    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";

    // Build line items for Stripe
    const lineItems = [];
    const stripeConnectPayments = [];

    for (const [specialistId, items] of itemsByBeautician) {
      for (const item of items) {
        lineItems.push({
          price_data: {
            currency,
            unit_amount: Math.round(item.price * 100), // Convert to pence
            product_data: {
              name: item.title,
              description: item.size ? `Size: ${item.size}` : undefined,
              images: item.image ? [item.image] : undefined,
            },
          },
          quantity: item.quantity,
        });
      }

      // Track payment for specialist-owned products
      const firstItem = items[0];
      const itemsTotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      stripeConnectPayments.push({
        specialistId,
        beauticianStripeAccount: firstItem.Specialist.stripeAccountId,
        amount: itemsTotal,
        status: "pending",
      });
    }

    // Note: Shipping is now handled via shipping_options in Stripe Checkout
    // Don't add shipping as a line item since Stripe will add it based on shipping_options

    // Create or retrieve Stripe customer with pre-filled shipping address
    const customer = await stripe.customers.create({
      email: shippingAddress.email,
      name: `${shippingAddress.firstName} ${shippingAddress.lastName}`,
      phone: shippingAddress.phone,
      shipping: {
        name: `${shippingAddress.firstName} ${shippingAddress.lastName}`,
        phone: shippingAddress.phone,
        address: {
          line1: shippingAddress.address,
          city: shippingAddress.city,
          postal_code: shippingAddress.postalCode,
          country: shippingAddress.country === "United Kingdom" ? "GB" : "IE",
        },
      },
    });

    // Create Stripe Checkout session
    // IMPORTANT: For product orders, payments go directly to specialists
    // - Single specialist: destination charge (specialist pays ALL fees)
    // - Multiple specialists: RESTRICT to single specialist per order
    // - NO application_fee_amount for products (no platform fee)
    // - NO transfers (avoid platform paying fees)

    // Validate single specialist per order
    if (stripeConnectPayments.length > 1) {
      return res.status(400).json({
        error:
          "Cannot checkout with products from multiple specialists. Please complete separate orders for each Specialist.",
      });
    }

    // Validate specialist Stripe account
    if (stripeConnectPayments.length === 1) {
      const payment = stripeConnectPayments[0];
      if (!payment.beauticianStripeAccount) {
        return res.status(400).json({
          error:
            "Product owner has not set up payment processing. Please contact support.",
        });
      }
    }

    const sessionConfig = {
      mode: "payment",
      client_reference_id: String(order._id),
      customer: customer.id,
      success_url: `${frontend}/shop/success?orderId=${order._id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/shop/cancel?orderId=${order._id}`,
      metadata: {
        orderId: String(order._id),
        type: "product_order",
      },
      line_items: lineItems,
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
              amount: Math.round(shipping * 100),
              currency,
            },
            display_name:
              shippingMethod?.name ||
              (shipping === 0 ? "Free Shipping" : "Standard Shipping"),
            delivery_estimate: shippingMethod?.estimatedDays
              ? {
                  minimum: {
                    unit: "business_day",
                    value:
                      parseInt(shippingMethod.estimatedDays.split("-")[0]) || 3,
                  },
                  maximum: {
                    unit: "business_day",
                    value:
                      parseInt(shippingMethod.estimatedDays.split("-")[1]) || 5,
                  },
                }
              : {
                  minimum: {
                    unit: "business_day",
                    value: 3,
                  },
                  maximum: {
                    unit: "business_day",
                    value: 5,
                  },
                },
          },
        },
      ],
      phone_number_collection: {
        enabled: false, // Already have phone from customer
      },
      allow_promotion_codes: true,
    };

    // Multi-tenant: Apply platform fee for product orders
    const tenant = req.tenant;
    const platformFee =
      tenant?.paymentSettings?.platformFeePerProduct ||
      Number(process.env.STRIPE_PLATFORM_FEE || 99); // £0.99 in pence

    // For product orders: Use platform account with transfers and application fee
    if (
      stripeConnectPayments.length === 1 &&
      stripeConnectPayments[0].beauticianStripeAccount
    ) {
      const payment = stripeConnectPayments[0];
      sessionConfig.payment_intent_data = {
        application_fee_amount: platformFee, // Platform fee
        transfer_data: {
          destination: payment.beauticianStripeAccount,
        },
        metadata: {
          orderId: String(order._id),
          specialistId: String(payment.specialistId),
          tenantId: tenant?._id?.toString() || "default",
          type: "product_payment",
          platformFee: platformFee,
        },
      };

      console.log(
        `[PRODUCT CHECKOUT] Payment with ${platformFee}p platform fee to specialist ${payment.specialistId}`
      );
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Update order with session ID and Connect payment tracking
    order.stripePaymentIntentId = session.id;
    order.stripeConnectPayments = stripeConnectPayments;
    await order.save();

    res.json({
      url: session.url,
      sessionId: session.id,
      orderId: order._id,
    });
  } catch (error) {
    console.error("Error creating product checkout:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders - Create new order
router.post("/", async (req, res) => {
  try {
    const { items, shippingAddress, notes, userId } = req.body;

    // Validate items
    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ error: "Order must have at least one item" });
    }

    // Validate and check stock for each item
    const validatedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({
          error: `Product not found: ${item.productId}`,
        });
      }

      // Get variant or use legacy fields
      let variant = null;
      let price, stock, size;

      if (item.variantId && product.variants && product.variants.length > 0) {
        variant = product.variants.id(item.variantId);
        if (!variant) {
          return res.status(400).json({
            error: `Variant not found for product: ${product.title}`,
          });
        }
        price = variant.price;
        stock = variant.stock;
        size = variant.size;
      } else {
        price = product.price;
        stock = product.stock;
        size = product.size;
      }

      // Check stock availability
      if (stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.title}. Available: ${stock}, Requested: ${item.quantity}`,
        });
      }

      validatedItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        title: product.title,
        size: size,
        price: price,
        quantity: item.quantity,
        image: product.image?.url || product.images?.[0]?.url || "",
      });

      subtotal += price * item.quantity;
    }

    // Calculate shipping
    const shipping = subtotal >= 50 ? 0 : 5.99; // Free shipping over £50
    const total = subtotal + shipping;

    // Create order with userId if provided (logged-in users)
    const order = new Order({
      items: validatedItems,
      shippingAddress,
      subtotal,
      shipping,
      tax: 0,
      total,
      notes: notes || "",
      ...(userId ? { userId } : {}), // Add userId if provided
    });

    await order.save();

    // Update stock for each item
    for (const item of validatedItems) {
      const product = await Product.findById(item.productId);
      if (item.variantId && product.variants) {
        const variant = product.variants.id(item.variantId);
        if (variant) {
          variant.stock -= item.quantity;
        }
      } else {
        product.stock -= item.quantity;
      }
      await product.save();
    }

    res.status(201).json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(400).json({ error: error.message });
  }
});

// PATCH /api/orders/:id - Update order status
router.patch("/:id", async (req, res) => {
  try {
    const { orderStatus, paymentStatus, trackingNumber, notes } = req.body;
    const updates = {};

    if (orderStatus) {
      updates.orderStatus = orderStatus;
      if (orderStatus === "shipped" && !updates.shippedAt) {
        updates.shippedAt = new Date();
      }
      if (orderStatus === "delivered" && !updates.deliveredAt) {
        updates.deliveredAt = new Date();
      }
    }

    if (paymentStatus) updates.paymentStatus = paymentStatus;
    if (trackingNumber !== undefined) updates.trackingNumber = trackingNumber;
    if (notes !== undefined) updates.notes = notes;

    const order = await Order.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(400).json({ error: error.message });
  }
});

// PATCH /api/orders/:id/ready-for-collection - Mark collection order as ready
router.patch("/:id/ready-for-collection", async (req, res) => {
  try {
    console.log(
      "[ORDERS] Marking order as ready for collection:",
      req.params.id
    );

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Verify this is a collection order
    if (!order.isCollection) {
      return res.status(400).json({
        error: "This is not a collection order",
        message: "Only collection orders can be marked as ready for collection",
      });
    }

    // Check if already ready or collected
    if (order.collectionStatus === "ready") {
      return res.status(400).json({
        error: "Order is already marked as ready for collection",
      });
    }

    if (order.collectionStatus === "collected") {
      return res.status(400).json({
        error: "Order has already been collected",
      });
    }

    // Update collection status
    order.collectionStatus = "ready";
    order.collectionReadyAt = new Date();
    await order.save();

    console.log("[ORDERS] ✓ Order marked as ready for collection");

    // Send email notification to customer
    try {
      await sendOrderReadyForCollectionEmail({ order });
      console.log("[ORDERS] ✓ Collection ready email sent to customer");
    } catch (emailError) {
      console.error(
        "[ORDERS] ✗ Failed to send collection ready email:",
        emailError
      );
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: "Order marked as ready for collection and customer notified",
      data: order,
    });
  } catch (error) {
    console.error("[ORDERS] Error marking order ready for collection:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/orders/:id - Delete order (admin only)
router.delete("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Restore stock when deleting orders (except cancelled/refunded which already restored stock)
    if (!["cancelled", "refunded"].includes(order.orderStatus)) {
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          if (item.variantId && product.variants) {
            const variant = product.variants.id(item.variantId);
            if (variant) {
              variant.stock += item.quantity;
            }
          } else {
            product.stock += item.quantity;
          }
          await product.save();
        }
      }
    }

    await Order.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Order deleted successfully" });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders/:id/cancel - Cancel order
router.post("/:id/cancel", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only allow canceling pending or processing orders
    if (!["pending", "processing"].includes(order.orderStatus)) {
      return res.status(400).json({
        error: "Can only cancel pending or processing orders",
      });
    }

    order.orderStatus = "cancelled";
    await order.save();

    // Restore stock
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        if (item.variantId && product.variants) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            variant.stock += item.quantity;
          }
        } else {
          product.stock += item.quantity;
        }
        await product.save();
      }
    }

    res.json(order);
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders/:id/refund - Issue refund for order
router.post("/:id/refund", async (req, res) => {
  try {
    const stripe = getStripe();
    const { reason } = req.body;

    const order = await Order.findById(req.params.id).populate(
      "items.productId"
    );
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.paymentStatus !== "paid") {
      return res.status(400).json({ error: "Order payment not completed" });
    }

    if (order.refundStatus === "full") {
      return res.status(400).json({ error: "Order already fully refunded" });
    }

    // Create Stripe refund
    // For product orders with destination charges, use reverse_transfer
    const refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      reverse_transfer: true, // Return money from specialist to customer
      metadata: {
        orderId: String(order._id),
        reason: reason || "Customer request",
        type: "product_order_refund",
      },
    });

    // Update Connect payment statuses
    if (order.stripeConnectPayments && order.stripeConnectPayments.length > 0) {
      for (const payment of order.stripeConnectPayments) {
        if (payment.status === "succeeded") {
          payment.status = "refunded";

          // Deduct from specialist earnings
          await Specialist.findByIdAndUpdate(payment.specialistId, {
            $inc: { totalEarnings: -payment.amount },
          });
        }
      }
    }

    // Update order status
    order.paymentStatus = "refunded";
    order.orderStatus = "refunded";
    order.refundStatus = "full";
    order.refundedAt = new Date();
    order.refundReason = reason || "Customer request";
    await order.save();

    // Restore stock
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        if (item.variantId && product.variants) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            variant.stock += item.quantity;
          }
        } else {
          product.stock += item.quantity;
        }
        await product.save();
      }
    }

    console.log(`[ORDER REFUND] Order ${order._id} refunded: ${refund.id}`);
    res.json({ success: true, order, refund });
  } catch (error) {
    console.error("Error refunding order:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/orders/:id - Delete an order (admin only)
router.delete("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Restore stock if order was not already cancelled/refunded
    if (!["cancelled", "refunded"].includes(order.orderStatus)) {
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          if (item.variantId && product.variants) {
            const variant = product.variants.id(item.variantId);
            if (variant) {
              variant.stock += item.quantity;
            }
          } else {
            product.stock += item.quantity;
          }
          await product.save();
        }
      }
    }

    await Order.findByIdAndDelete(req.params.id);

    console.log(
      `[ORDER DELETE] Order ${order._id} (${order.orderNumber}) deleted`
    );
    res.json({
      success: true,
      message: `Order ${order.orderNumber} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
