import mongoose from "mongoose";

const seminarBookingSchema = new mongoose.Schema(
  {
    seminarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seminar",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      index: true,
    },
    specialistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Specialist",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    attendeeInfo: {
      name: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },
      phone: {
        type: String,
      },
      specialRequests: {
        type: String,
      },
    },
    payment: {
      stripeSessionId: {
        type: String,
      },
      stripePaymentIntentId: {
        type: String,
      },
      stripeChargeId: {
        type: String,
      },
      amount: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        default: "GBP",
      },
      status: {
        type: String,
        enum: ["pending", "paid", "refunded", "failed"],
        default: "pending",
      },
      paidAt: {
        type: Date,
      },
      refundAmount: {
        type: Number,
        default: 0,
      },
      refundedAt: {
        type: Date,
      },
    },
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "attended", "no-show"],
      default: "confirmed",
      index: true,
    },
    bookingReference: {
      type: String,
      unique: true,
      index: true,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    cancellationReason: {
      type: String,
    },
    cancelledAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
seminarBookingSchema.index({ seminarId: 1, sessionId: 1 });
seminarBookingSchema.index({ clientId: 1, status: 1 });
seminarBookingSchema.index({ specialistId: 1, status: 1 });
seminarBookingSchema.index({ "payment.status": 1 });
seminarBookingSchema.index({ createdAt: -1 });

// Generate booking reference before saving
seminarBookingSchema.pre("save", async function (next) {
  if (this.isNew && !this.bookingReference) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1),
      },
    });
    this.bookingReference = `SEM-${year}-${String(count + 1).padStart(5, "0")}`;
  }
  next();
});

// Virtual for checking if booking is cancellable
seminarBookingSchema.virtual("isCancellable").get(function () {
  // Can cancel if:
  // 1. Status is confirmed
  // 2. Payment is paid
  // 3. Session hasn't started yet
  // You can adjust this logic based on your cancellation policy
  return this.status === "confirmed" && this.payment.status === "paid";
});

// Method to check if refund is applicable
seminarBookingSchema.methods.calculateRefund = function (sessionDate) {
  if (this.payment.status !== "paid") return 0;

  const now = new Date();
  const session = new Date(sessionDate);
  const hoursUntilSession = (session - now) / (1000 * 60 * 60);

  // Refund policy (example):
  // - More than 48 hours: Full refund
  // - 24-48 hours: 50% refund
  // - Less than 24 hours: No refund
  if (hoursUntilSession > 48) {
    return this.payment.amount;
  } else if (hoursUntilSession > 24) {
    return this.payment.amount * 0.5;
  }
  return 0;
};

const SeminarBooking = mongoose.model("SeminarBooking", seminarBookingSchema);

export default SeminarBooking;
