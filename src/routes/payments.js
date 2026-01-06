import express from "express";
import Payment from "../models/Payment.js";
import Appointment from "../models/Appointment.js";
import Client from "../models/Client.js";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Stripe from "stripe";
import { z } from "zod";
import requireAdmin from "../middleware/requireAdmin.js";

const router = express.Router();

// Apply authentication to all payment routes
router.use(requireAdmin);

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
 * Security: All routes require authentication (requireAdmin middleware) and tenant isolation
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

// ==================== VALIDATION SCHEMAS ====================

const createPaymentIntentSchema = z.object({
  appointmentId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional()
    .nullable(),
  clientId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid client ID")
    .optional()
    .nullable(),
  amount: z
    .number()
    .int()
    .positive()
    .min(100, "Minimum payment is £1.00")
    .max(1000000, "Maximum payment is £10,000"),
  tip: z
    .number()
    .int()
    .nonnegative()
    .max(100000, "Maximum tip is £1,000")
    .optional()
    .default(0),
  currency: z.enum(["gbp", "usd", "eur"]).optional().default("gbp"),
  captureMethod: z
    .enum(["automatic", "manual"])
    .optional()
    .default("automatic"),
  metadata: z.record(z.string()).optional().default({}),
});

const confirmPaymentSchema = z.object({
  paymentIntentId: z.string().min(1, "Payment Intent ID is required"),
});

const refundPaymentSchema = z.object({
  paymentId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid payment ID"),
  amount: z.number().int().positive().optional(),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer", "other"]),
  notes: z.string().max(500).optional(),
});

const listPaymentsSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default("20"),
  status: z
    .enum([
      "pending",
      "processing",
      "succeeded",
      "failed",
      "canceled",
      "refunded",
      "partially_refunded",
    ])
    .optional(),
  staffId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
  clientId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
  appointmentId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

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
    // Authentication check
    if (!req.admin || !req.tenantId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Validate input
    const validation = createPaymentIntentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      });
    }

    const {
      appointmentId,
      clientId,
      amount,
      tip,
      currency,
      captureMethod,
      metadata,
    } = validation.data;

    const tenantId = req.tenantId;
    const staffId = req.admin._id.toString();

    // Verify client exists and belongs to tenant (if provided)
    let client = null;
    if (clientId) {
      client = await Client.findOne({ _id: clientId, tenant: tenantId });
      if (!client) {
        return res.status(404).json({
          success: false,
          message: "Client not found",
        });
      }
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
        req.admin.role === "specialist" &&
        appointment.specialist?.toString() !== staffId
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only process payments for your own appointments",
        });
      }
    }

    // Get Stripe Connect account
    // Priority: 1) Staff's linked specialist 2) Tenant's Stripe account
    const staff = await User.findById(staffId).select("specialistId role");
    
    let useConnectAccount = null;
    let specialist = null;

    // Try to get Stripe account from specialist link first
    if (staff?.specialistId) {
      const Specialist = (await import("../models/Specialist.js")).default;
      specialist = await Specialist.findById(staff.specialistId).select(
        "stripeAccountId stripeStatus"
      );
      useConnectAccount = specialist?.stripeAccountId;
    }

    // If no specialist link, get tenant's Stripe account
    if (!useConnectAccount) {
      const tenant = await Tenant.findById(tenantId).select("stripeAccountId");
      useConnectAccount = tenant?.stripeAccountId;
    }

    // In development, allow testing without Stripe Connect
    const isDevelopment = process.env.NODE_ENV !== "production";

    // Log for debugging
    console.log("[Payment Intent] Staff ID:", staffId);
    console.log("[Payment Intent] Staff Role:", staff?.role);
    console.log("[Payment Intent] Specialist ID:", staff?.specialistId);
    console.log("[Payment Intent] Stripe Account ID:", useConnectAccount);
    console.log("[Payment Intent] Stripe Status:", specialist?.stripeStatus);
    console.log("[Payment Intent] Is Development:", isDevelopment);
    console.log("[Payment Intent] NODE_ENV:", process.env.NODE_ENV);

    if (!useConnectAccount && !isDevelopment) {
      return res.status(400).json({
        success: false,
        message: "Stripe Connect not configured. Please complete your Stripe onboarding in Settings.",
      });
    }

    // Get tenant for settings
    const tenant = await Tenant.findById(tenantId).select("settings");

    // Calculate total and fees
    const total = amount + tip;

    // Platform fee calculation (configurable per tenant)
    const platformFeePercent = tenant.settings?.platformFeePercent || 0;
    const platformFee = Math.round((total * platformFeePercent) / 100);

    // Estimate Stripe fee (2.9% + 30p for card present)
    const stripeFee = Math.round(total * 0.029 + 30);
    const totalFees = platformFee + stripeFee;
    const netAmount = total - totalFees;

    // Create Payment record in database
    const payment = new Payment({
      tenant: tenantId,
      appointment: appointmentId || null,
      client: clientId || null,
      staff: staffId,
      method: "tap_to_pay",
      amount,
      currency: currency.toLowerCase(),
      tip,
      total,
      fees: {
        stripe: stripeFee,
        platform: platformFee,
        total: totalFees,
      },
      netAmount,
      status: "pending",
      stripe: {
        connectedAccountId: useConnectAccount || "dev_mode",
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

    // Create Stripe PaymentIntent on connected account (or direct in development)
    try {
      const paymentIntentParams = {
        amount: total,
        currency: currency.toLowerCase(),
        capture_method: captureMethod,
        payment_method_types: ["card_present"], // Tap to Pay requires card_present
        metadata: {
          tenantId: tenantId.toString(),
          appointmentId: appointmentId?.toString() || "custom",
          clientId: clientId?.toString() || "walk-in",
          staffId: staffId.toString(),
          paymentDbId: payment._id.toString(),
          tip: tip.toString(),
        },
      };

      // Add application fee if using connected account
      if (useConnectAccount) {
        paymentIntentParams.application_fee_amount = platformFee;
      }

      // Create payment intent with or without connected account
      const paymentIntent = useConnectAccount
        ? await stripe.paymentIntents.create(paymentIntentParams, {
            stripeAccount: useConnectAccount,
          })
        : await stripe.paymentIntents.create(paymentIntentParams);

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
          clientName: client
            ? `${client.firstName} ${client.lastName}`
            : "Walk-in Customer",
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
    // Authentication check
    if (!req.admin || !req.tenantId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Validate input
    const validation = confirmPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.error.errors,
      });
    }

    const { paymentIntentId } = validation.data;
    const tenantId = req.tenantId;

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
    // Authentication check
    if (!req.admin || !req.tenantId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { paymentIntentId } = req.params;
    const tenantId = req.tenantId;

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
    // Authentication check
    if (!req.admin || !req.tenantId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Permission check: Only owners and managers can refund
    if (!["owner", "manager", "salon-admin"].includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: "Only owners and managers can process refunds",
      });
    }

    // Validate input
    const validation = refundPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.error.errors,
      });
    }

    const { paymentId, amount, reason, notes } = validation.data;
    const tenantId = req.tenantId;
    const staffId = req.admin._id.toString();

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
    // Authentication check
    if (!req.admin || !req.tenantId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Validate query params
    const validation = listPaymentsSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        errors: validation.error.errors,
      });
    }

    const tenantId = req.tenantId;
    const {
      page,
      limit,
      status,
      staffId,
      clientId,
      appointmentId,
      startDate,
      endDate,
    } = validation.data;

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
    if (req.admin.role === "specialist") {
      query.staff = req.admin._id;
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
    // Authentication check
    if (!req.admin || !req.tenantId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const tenantId = req.tenantId;

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
      req.admin.role === "specialist" &&
      payment.staff._id.toString() !== req.admin._id.toString()
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
    // Authentication check
    if (!req.admin || !req.tenantId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const tenantId = req.tenantId;
    const staffId = req.admin._id.toString();

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
    if (req.admin.role === "specialist") {
      query.specialist = req.admin._id;
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
