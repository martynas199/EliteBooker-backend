import express from "express";
import Payment from "../models/Payment.js";
import Appointment from "../models/Appointment.js";
import Client from "../models/Client.js";
import Tenant from "../models/Tenant.js";
import Stripe from "stripe";

const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(
  process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY,
  {
    apiVersion: "2024-06-20",
  }
);

/**
 * TAP TO PAY API ROUTES
 *
 * Security: All routes require authentication and tenant isolation
 * Stripe Connect: All payments processed on connected accounts
 *
 * Flow:
 * 1. Client creates payment intent (with appointment or custom)
 * 2. Mobile device presents NFC reader
 * 3. Customer taps card/phone
 * 4. Stripe confirms payment
 * 5. Webhook updates status
 * 6. Receipt sent to customer
 */

// ==================== CREATE PAYMENT INTENT ====================

/**
 * POST /api/payments/intents
 *
 * Create a Stripe PaymentIntent for tap-to-pay
 *
 * Required permissions: Owner, Manager, or Specialist (own appointments only)
 *
 * Request body:
 * {
 *   appointmentId?: string,  // Optional: null for custom payments
 *   clientId: string,
 *   amount: number,          // In pence/cents
 *   tip?: number,            // In pence/cents
 *   currency?: string,       // Default: gbp
 *   captureMethod?: string,  // Default: automatic
 *   metadata?: object
 * }
 */
router.post("/intents", async (req, res) => {
  try {
    const {
      appointmentId,
      clientId,
      amount,
      tip = 0,
      currency = "gbp",
      captureMethod = "automatic",
      metadata = {},
    } = req.body;

    const tenantId = req.user.tenantId;
    const staffId = req.user.userId;

    // Validation
    if (!clientId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Client ID and valid amount are required",
      });
    }

    // Verify client exists and belongs to tenant
    const client = await Client.findOne({ _id: clientId, tenant: tenantId });
    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    // If appointment provided, verify it exists and check permissions
    let appointment = null;
    if (appointmentId) {
      appointment = await Appointment.findOne({
        _id: appointmentId,
        tenant: tenantId,
      }).populate("services.service", "name price");

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found",
        });
      }

      // Permission check: Specialists can only process their own appointments
      if (
        req.user.role === "specialist" &&
        appointment.specialist?.toString() !== staffId
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only process payments for your own appointments",
        });
      }
    }

    // Get tenant's Stripe Connect account
    const tenant = await Tenant.findById(tenantId).select(
      "stripeConnectAccountId settings"
    );
    if (!tenant?.stripeConnectAccountId) {
      return res.status(400).json({
        success: false,
        message: "Stripe Connect not configured for this business",
      });
    }

    // Calculate total and fees
    const total = amount + tip;

    // Platform fee calculation (configurable per tenant)
    const platformFeePercent = tenant.settings?.platformFeePercent || 0;
    const platformFee = Math.round((total * platformFeePercent) / 100);

    // Create Payment record in database
    const payment = new Payment({
      tenant: tenantId,
      appointment: appointmentId || null,
      client: clientId,
      staff: staffId,
      method: "tap_to_pay",
      amount,
      currency: currency.toLowerCase(),
      tip,
      total,
      fees: {
        platform: platformFee,
      },
      status: "pending",
      stripe: {
        connectedAccountId: tenant.stripeConnectAccountId,
      },
      metadata: {
        ...metadata,
        services: appointment?.services.map((s) => ({
          serviceId: s.service._id,
          name: s.service.name,
          price: s.service.price,
          quantity: s.quantity || 1,
        })),
      },
    });

    // Create Stripe PaymentIntent on connected account
    try {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: total,
          currency: currency.toLowerCase(),
          capture_method: captureMethod,
          application_fee_amount: platformFee,
          payment_method_types: ["card_present"], // Tap to Pay requires card_present
          metadata: {
            tenantId: tenantId.toString(),
            appointmentId: appointmentId?.toString() || "custom",
            clientId: clientId.toString(),
            staffId: staffId.toString(),
            paymentDbId: payment._id.toString(),
            tip: tip.toString(),
          },
        },
        {
          stripeAccount: tenant.stripeConnectAccountId,
        }
      );

      // Update payment with Stripe details
      payment.stripe.paymentIntentId = paymentIntent.id;
      await payment.save();

      // Return PaymentIntent client secret for mobile SDK
      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          paymentId: payment._id,
          amount: total,
          currency,
          tip,
          clientName: `${client.firstName} ${client.lastName}`,
          appointmentDetails: appointment
            ? {
                id: appointment._id,
                services: appointment.services
                  .map((s) => s.service.name)
                  .join(", "),
                date: appointment.date,
              }
            : null,
        },
      });
    } catch (stripeError) {
      // Log Stripe error and save to payment record
      payment.status = "failed";
      payment.error = {
        code: stripeError.code,
        message: stripeError.message,
        occurredAt: new Date(),
      };
      await payment.save();

      console.error(
        "[Stripe Error] Failed to create PaymentIntent:",
        stripeError
      );

      res.status(400).json({
        success: false,
        message: "Failed to create payment intent",
        error: stripeError.message,
      });
    }
  } catch (error) {
    console.error("[Payment Intent Error]:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating payment intent",
      error: error.message,
    });
  }
});

// ==================== CONFIRM PAYMENT ====================

/**
 * POST /api/payments/confirm
 *
 * Manually confirm a payment (used as fallback or for testing)
 * Normally, Stripe SDK confirms automatically via NFC
 *
 * Request body:
 * {
 *   paymentIntentId: string
 * }
 */
router.post("/confirm", async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const tenantId = req.user.tenantId;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "Payment Intent ID is required",
      });
    }

    // Find payment in database
    const payment = await Payment.findOne({
      "stripe.paymentIntentId": paymentIntentId,
      tenant: tenantId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Retrieve PaymentIntent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {
        stripeAccount: payment.stripe.connectedAccountId,
      }
    );

    // Update payment status based on Stripe status
    payment.status =
      paymentIntent.status === "succeeded" ? "succeeded" : "processing";

    if (paymentIntent.charges?.data?.[0]) {
      const charge = paymentIntent.charges.data[0];
      payment.stripe.chargeId = charge.id;
      payment.stripe.paymentMethodId = charge.payment_method;

      if (charge.payment_method_details?.card_present) {
        payment.stripe.cardBrand =
          charge.payment_method_details.card_present.brand;
        payment.stripe.cardLast4 =
          charge.payment_method_details.card_present.last4;
      }
    }

    await payment.save();

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        status: payment.status,
        amount: payment.total,
        currency: payment.currency,
      },
    });
  } catch (error) {
    console.error("[Payment Confirm Error]:", error);
    res.status(500).json({
      success: false,
      message: "Server error confirming payment",
      error: error.message,
    });
  }
});

// ==================== GET PAYMENT STATUS ====================

/**
 * GET /api/payments/status/:paymentIntentId
 *
 * Get current status of a payment
 * Used by mobile app to poll payment status
 */
router.get("/status/:paymentIntentId", async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const tenantId = req.user.tenantId;

    const payment = await Payment.findOne({
      "stripe.paymentIntentId": paymentIntentId,
      tenant: tenantId,
    })
      .populate("client", "firstName lastName email phone")
      .populate("staff", "firstName lastName")
      .populate("appointment", "date services");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        status: payment.status,
        amount: payment.total,
        tip: payment.tip,
        currency: payment.currency,
        method: payment.method,
        client: payment.client,
        staff: payment.staff,
        appointment: payment.appointment,
        processedAt: payment.processedAt,
        receiptNumber: payment.receipt?.receiptNumber,
        cardBrand: payment.stripe.cardBrand,
        cardLast4: payment.stripe.cardLast4,
        error: payment.error,
      },
    });
  } catch (error) {
    console.error("[Payment Status Error]:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving payment status",
      error: error.message,
    });
  }
});

// ==================== REFUND PAYMENT ====================

/**
 * POST /api/payments/refund
 *
 * Issue a full or partial refund
 *
 * Required permissions: Owner or Manager only
 *
 * Request body:
 * {
 *   paymentId: string,
 *   amount?: number,    // Optional: defaults to full refund
 *   reason: string,     // duplicate | fraudulent | requested_by_customer | other
 *   notes?: string
 * }
 */
router.post("/refund", async (req, res) => {
  try {
    const { paymentId, amount, reason, notes } = req.body;
    const tenantId = req.user.tenantId;
    const staffId = req.user.userId;

    // Permission check: Only owners and managers can refund
    if (!["owner", "manager"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only owners and managers can process refunds",
      });
    }

    // Validation
    if (!paymentId || !reason) {
      return res.status(400).json({
        success: false,
        message: "Payment ID and reason are required",
      });
    }

    // Find payment
    const payment = await Payment.findOne({
      _id: paymentId,
      tenant: tenantId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Check if payment can be refunded
    if (!payment.canRefund()) {
      return res.status(400).json({
        success: false,
        message: `Payment cannot be refunded. Current status: ${payment.status}`,
      });
    }

    // Determine refund amount
    const refundAmount = amount || payment.getRefundableAmount();

    if (refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid refund amount",
      });
    }

    if (refundAmount > payment.getRefundableAmount()) {
      return res.status(400).json({
        success: false,
        message: `Refund amount exceeds refundable amount of ${payment.formatAmount(
          payment.getRefundableAmount()
        )}`,
      });
    }

    // Process refund with Stripe
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: payment.stripe.paymentIntentId,
          amount: refundAmount,
          reason:
            reason === "duplicate"
              ? "duplicate"
              : reason === "fraudulent"
              ? "fraudulent"
              : "requested_by_customer",
        },
        {
          stripeAccount: payment.stripe.connectedAccountId,
        }
      );

      // Add refund to payment record
      payment.refunds.push({
        amount: refundAmount,
        reason,
        stripeRefundId: refund.id,
        processedBy: staffId,
        processedAt: new Date(),
        notes,
      });

      // Update payment status
      const totalRefunded = payment.getTotalRefunded() + refundAmount;
      if (totalRefunded >= payment.total) {
        payment.status = "refunded";
      } else {
        payment.status = "partially_refunded";
      }

      await payment.save();

      res.json({
        success: true,
        data: {
          paymentId: payment._id,
          refundAmount: refundAmount,
          totalRefunded: payment.getTotalRefunded(),
          remainingRefundable: payment.getRefundableAmount(),
          status: payment.status,
        },
      });
    } catch (stripeError) {
      console.error("[Stripe Refund Error]:", stripeError);
      res.status(400).json({
        success: false,
        message: "Failed to process refund with Stripe",
        error: stripeError.message,
      });
    }
  } catch (error) {
    console.error("[Refund Error]:", error);
    res.status(500).json({
      success: false,
      message: "Server error processing refund",
      error: error.message,
    });
  }
});

// ==================== LIST PAYMENTS ====================

/**
 * GET /api/payments
 *
 * List payments for current tenant with filtering and pagination
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - status: string (pending | succeeded | failed | refunded)
 * - staffId: string
 * - clientId: string
 * - appointmentId: string
 * - startDate: ISO date string
 * - endDate: ISO date string
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const {
      page = 1,
      limit = 20,
      status,
      staffId,
      clientId,
      appointmentId,
      startDate,
      endDate,
    } = req.query;

    // Build query
    const query = { tenant: tenantId };

    if (status) query.status = status;
    if (staffId) query.staff = staffId;
    if (clientId) query.client = clientId;
    if (appointmentId) query.appointment = appointmentId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Specialists can only see their own payments
    if (req.user.role === "specialist") {
      query.staff = req.user.userId;
    }

    // Execute query with pagination
    const payments = await Payment.find(query)
      .populate("client", "firstName lastName email phone")
      .populate("staff", "firstName lastName")
      .populate("appointment", "date services")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Payment.countDocuments(query);

    res.json({
      success: true,
      data: {
        payments,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        totalCount: count,
      },
    });
  } catch (error) {
    console.error("[List Payments Error]:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving payments",
      error: error.message,
    });
  }
});

// ==================== GET PAYMENT BY ID ====================

/**
 * GET /api/payments/:id
 *
 * Get detailed information for a specific payment
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    const payment = await Payment.findOne({ _id: id, tenant: tenantId })
      .populate("client", "firstName lastName email phone")
      .populate("staff", "firstName lastName")
      .populate("appointment", "date services")
      .populate("refunds.processedBy", "firstName lastName");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Specialists can only see their own payments
    if (
      req.user.role === "specialist" &&
      payment.staff._id.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("[Get Payment Error]:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving payment",
      error: error.message,
    });
  }
});

// ==================== GET TODAY'S APPOINTMENTS ====================

/**
 * GET /api/payments/appointments/today
 *
 * Get today's appointments for payment processing
 * Used in Select Appointment screen
 */
router.get("/appointments/today", async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const staffId = req.user.userId;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Build query
    const query = {
      tenant: tenantId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ["confirmed", "completed", "in_progress"] },
    };

    // Specialists only see their own appointments
    if (req.user.role === "specialist") {
      query.specialist = staffId;
    }

    const appointments = await Appointment.find(query)
      .populate("client", "firstName lastName phone")
      .populate("services.service", "name price")
      .populate("specialist", "firstName lastName")
      .sort({ date: 1 });

    // Calculate payment status for each appointment
    const appointmentsWithPaymentStatus = await Promise.all(
      appointments.map(async (apt) => {
        const payments = await Payment.find({
          appointment: apt._id,
          status: { $in: ["succeeded", "processing"] },
        });

        const totalPaid = payments.reduce((sum, p) => sum + p.total, 0);
        const appointmentTotal = apt.services.reduce(
          (sum, s) => sum + s.service.price,
          0
        );
        const remainingBalance = appointmentTotal - totalPaid;

        return {
          _id: apt._id,
          date: apt.date,
          client: apt.client,
          specialist: apt.specialist,
          services: apt.services,
          totalPrice: appointmentTotal,
          totalPaid,
          remainingBalance,
          isPaid: remainingBalance <= 0,
        };
      })
    );

    res.json({
      success: true,
      data: appointmentsWithPaymentStatus,
    });
  } catch (error) {
    console.error("[Today's Appointments Error]:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving appointments",
      error: error.message,
    });
  }
});

export default router;
