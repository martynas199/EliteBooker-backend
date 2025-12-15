import mongoose from "mongoose";

/**
 * Payment Model - Stores all payment transactions for tap-to-pay and other payment methods
 *
 * Integrates with:
 * - Stripe Connect for payment processing
 * - Appointments for service payments
 * - Clients for customer records
 * - Staff for attribution
 *
 * Audit trail: All payment state changes are logged in history array
 */
const paymentSchema = new mongoose.Schema(
  {
    // Tenant isolation - CRITICAL for multi-tenant security
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    // Payment associations
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      index: true,
      // Nullable: custom payments don't have appointments
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      // Staff member who processed the payment
    },

    // Payment method
    method: {
      type: String,
      enum: [
        "tap_to_pay",
        "card_terminal",
        "card_manual",
        "cash",
        "bank_transfer",
        "other",
      ],
      required: true,
      default: "tap_to_pay",
    },

    // Amount details (stored in pence/cents to avoid floating point issues)
    amount: {
      type: Number,
      required: true,
      min: 0,
      // Amount in smallest currency unit (e.g., pence for GBP, cents for USD)
    },
    currency: {
      type: String,
      required: true,
      default: "gbp",
      uppercase: true,
    },
    tip: {
      type: Number,
      default: 0,
      min: 0,
      // Tip amount in smallest currency unit
    },
    total: {
      type: Number,
      required: true,
      min: 0,
      // Total = amount + tip (calculated before save)
    },

    // Fee structure
    fees: {
      stripe: {
        type: Number,
        default: 0,
        // Stripe processing fee
      },
      platform: {
        type: Number,
        default: 0,
        // Platform application fee
      },
      total: {
        type: Number,
        default: 0,
        // Total fees deducted
      },
    },

    // Net amount received by business (total - fees.total)
    netAmount: {
      type: Number,
      required: true,
    },

    // Payment status
    status: {
      type: String,
      enum: [
        "pending", // Payment intent created, awaiting confirmation
        "processing", // Payment is being processed by Stripe
        "succeeded", // Payment completed successfully
        "failed", // Payment failed
        "canceled", // Payment was canceled
        "refunded", // Full refund issued
        "partially_refunded", // Partial refund issued
      ],
      default: "pending",
      required: true,
      index: true,
    },

    // Stripe integration
    stripe: {
      paymentIntentId: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
        // Stripe PaymentIntent ID (pi_xxx)
      },
      chargeId: {
        type: String,
        index: true,
        // Stripe Charge ID (ch_xxx)
      },
      connectedAccountId: {
        type: String,
        required: true,
        // Stripe Connect account ID for the business
      },
      paymentMethodId: {
        type: String,
        // Stripe PaymentMethod ID (pm_xxx)
      },
      cardBrand: {
        type: String,
        // visa, mastercard, amex, etc.
      },
      cardLast4: {
        type: String,
        // Last 4 digits of card
      },
    },

    // Refund details
    refunds: [
      {
        amount: {
          type: Number,
          required: true,
        },
        reason: {
          type: String,
          enum: ["duplicate", "fraudulent", "requested_by_customer", "other"],
        },
        stripeRefundId: {
          type: String,
        },
        processedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        processedAt: {
          type: Date,
          default: Date.now,
        },
        notes: String,
      },
    ],

    // Payment metadata
    metadata: {
      // Device information
      deviceType: String, // ios, android, web
      deviceModel: String,
      osVersion: String,
      appVersion: String,

      // Location (if available)
      latitude: Number,
      longitude: Number,

      // Payment breakdown (for appointments)
      services: [
        {
          serviceId: mongoose.Schema.Types.ObjectId,
          name: String,
          price: Number,
          quantity: { type: Number, default: 1 },
        },
      ],

      // Custom fields
      notes: String,
      internalReference: String,
    },

    // Receipt
    receipt: {
      sent: {
        type: Boolean,
        default: false,
      },
      sentAt: Date,
      sentTo: String, // email or phone number
      method: {
        type: String,
        enum: ["email", "sms", "none"],
      },
      receiptNumber: {
        type: String,
        unique: true,
        sparse: true,
        // Auto-generated receipt number (e.g., RCP-2024-00001)
      },
    },

    // Error tracking
    error: {
      code: String,
      message: String,
      details: mongoose.Schema.Types.Mixed,
      occurredAt: Date,
    },

    // Audit trail
    history: [
      {
        status: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        notes: String,
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],

    // Timestamps
    processedAt: Date, // When payment was successfully processed
    failedAt: Date, // When payment failed
    refundedAt: Date, // When refund was issued
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Indexes for performance
paymentSchema.index({ tenant: 1, createdAt: -1 });
paymentSchema.index({ tenant: 1, status: 1, createdAt: -1 });
paymentSchema.index({ tenant: 1, staff: 1, createdAt: -1 });
paymentSchema.index({ tenant: 1, client: 1, createdAt: -1 });
paymentSchema.index({ "stripe.paymentIntentId": 1 });
paymentSchema.index({ "receipt.receiptNumber": 1 });

// Calculate total before saving
paymentSchema.pre("save", function (next) {
  // Calculate total if not already set
  if (this.isModified("amount") || this.isModified("tip")) {
    this.total = this.amount + (this.tip || 0);
  }

  // Calculate net amount
  if (this.isModified("total") || this.isModified("fees")) {
    const totalFees = this.fees?.total || 0;
    this.netAmount = this.total - totalFees;
  }

  next();
});

// Add status change to history
paymentSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.history.push({
      status: this.status,
      timestamp: new Date(),
      notes: `Status changed to ${this.status}`,
    });

    // Update timestamp fields based on status
    if (this.status === "succeeded" && !this.processedAt) {
      this.processedAt = new Date();
    } else if (this.status === "failed" && !this.failedAt) {
      this.failedAt = new Date();
    } else if (
      (this.status === "refunded" || this.status === "partially_refunded") &&
      !this.refundedAt
    ) {
      this.refundedAt = new Date();
    }
  }
  next();
});

// Instance methods

/**
 * Check if payment can be refunded
 */
paymentSchema.methods.canRefund = function () {
  return this.status === "succeeded" || this.status === "partially_refunded";
};

/**
 * Get total refunded amount
 */
paymentSchema.methods.getTotalRefunded = function () {
  return this.refunds.reduce((sum, refund) => sum + refund.amount, 0);
};

/**
 * Get remaining refundable amount
 */
paymentSchema.methods.getRefundableAmount = function () {
  return this.total - this.getTotalRefunded();
};

/**
 * Format amount for display
 */
paymentSchema.methods.formatAmount = function (amount = this.total) {
  const value = (amount / 100).toFixed(2);
  const symbol =
    this.currency === "gbp" ? "£" : this.currency === "usd" ? "$" : "€";
  return `${symbol}${value}`;
};

/**
 * Generate receipt number
 */
paymentSchema.statics.generateReceiptNumber = async function (tenant) {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;

  // Find the last receipt number for this year
  const lastPayment = await this.findOne({
    tenant,
    "receipt.receiptNumber": { $regex: `^${prefix}` },
  })
    .sort({ "receipt.receiptNumber": -1 })
    .select("receipt.receiptNumber");

  let nextNumber = 1;
  if (lastPayment?.receipt?.receiptNumber) {
    const lastNumber = parseInt(
      lastPayment.receipt.receiptNumber.split("-").pop(),
      10
    );
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${String(nextNumber).padStart(5, "0")}`;
};

// Static methods for queries

/**
 * Get payments for a specific appointment
 */
paymentSchema.statics.getByAppointment = function (appointmentId) {
  return this.find({ appointment: appointmentId })
    .populate("client", "firstName lastName email phone")
    .populate("staff", "firstName lastName")
    .sort({ createdAt: -1 });
};

/**
 * Get daily summary for a tenant
 */
paymentSchema.statics.getDailySummary = async function (
  tenant,
  date = new Date()
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await this.aggregate([
    {
      $match: {
        tenant: mongoose.Types.ObjectId(tenant),
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        total: { $sum: "$total" },
        netAmount: { $sum: "$netAmount" },
        fees: { $sum: "$fees.total" },
        tips: { $sum: "$tip" },
      },
    },
  ]);

  return result;
};

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
