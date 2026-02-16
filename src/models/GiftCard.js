import mongoose from "mongoose";
import crypto from "crypto";

/**
 * GiftCard Model
 * Represents a digital gift card that can be purchased and redeemed for services
 */
const giftCardSchema = new mongoose.Schema(
  {
    // Unique gift card code
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },

    // Tenant/Salon this gift card is for
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    // Optional: Specific specialist (if gift card is for a specific specialist)
    specialistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Specialist",
      index: true,
    },

    // Purchase Information
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "GBP",
    },

    // Purchaser Details
    purchaserName: {
      type: String,
      required: true,
    },
    purchaserEmail: {
      type: String,
      required: true,
      lowercase: true,
    },
    purchaserClientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      index: true,
    },

    // Recipient Details
    recipientName: {
      type: String,
      required: true,
    },
    recipientEmail: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    message: {
      type: String,
      maxlength: 500,
    },
    deliveryType: {
      type: String,
      enum: ["immediate", "scheduled"],
      default: "immediate",
      index: true,
    },
    deliveryDate: {
      type: Date,
      index: true,
    },

    // Status
    status: {
      type: String,
      enum: ["pending", "sent", "redeemed", "expired", "cancelled"],
      default: "pending",
      index: true,
    },

    // Dates
    purchaseDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    sentDate: {
      type: Date,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    redeemedDate: {
      type: Date,
    },

    // Redemption tracking
    redeemedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
    },
    redeemedAmount: {
      type: Number,
      default: 0,
    },
    reservedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    pendingRedemptions: [
      {
        appointmentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Appointment",
          required: true,
        },
        sessionId: {
          type: String,
        },
        amount: {
          type: Number,
          required: true,
          min: 0,
        },
        expiresAt: {
          type: Date,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },

    // Payment tracking
    stripeCheckoutSessionId: {
      type: String,
      index: true,
    },
    stripePaymentIntentId: String,
    stripeChargeId: String,

    // Email send tracking
    purchaseConfirmationSentAt: Date,
    recipientEmailSentAt: {
      type: Date,
      index: true,
    },
    saleNotificationSentAt: Date,
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

// Generate unique gift card code
giftCardSchema.statics.generateCode = function () {
  // Generate format: GIFT-XXXX-XXXX-XXXX (16 chars)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars
  let code = "GIFT-";
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < 2) code += "-";
  }
  return code;
};

// Check if gift card is valid and can be used
giftCardSchema.methods.isValid = function () {
  const now = new Date();
  return (
    this.status === "sent" &&
    this.expiryDate > now &&
    this.redeemedAmount < this.amount
  );
};

// Get remaining balance
giftCardSchema.methods.getHeldAmount = function (at = new Date()) {
  const pending = Array.isArray(this.pendingRedemptions)
    ? this.pendingRedemptions
    : [];

  return pending.reduce((sum, entry) => {
    if (!entry?.expiresAt || new Date(entry.expiresAt) <= at) {
      return sum;
    }
    return sum + Number(entry.amount || 0);
  }, 0);
};

giftCardSchema.methods.getRemainingBalance = function () {
  const heldAmount = this.getHeldAmount();
  const remaining =
    Number(this.amount || 0) - Number(this.redeemedAmount || 0) - heldAmount;
  return Math.max(0, Math.round(remaining * 100) / 100);
};

giftCardSchema.methods.cleanupExpiredReservations = function () {
  const now = new Date();
  const pending = Array.isArray(this.pendingRedemptions)
    ? this.pendingRedemptions
    : [];

  this.pendingRedemptions = pending.filter(
    (entry) => entry?.expiresAt && new Date(entry.expiresAt) > now,
  );

  this.reservedAmount = this.pendingRedemptions.reduce(
    (sum, entry) => sum + Number(entry.amount || 0),
    0,
  );
};

// Mark as sent
giftCardSchema.methods.markAsSent = async function () {
  this.status = "sent";
  this.sentDate = new Date();
  return this.save();
};

// Redeem gift card
giftCardSchema.methods.redeem = async function (
  amount,
  clientId,
  appointmentId,
) {
  this.cleanupExpiredReservations();

  if (!this.isValid()) {
    throw new Error("Gift card is not valid for redemption");
  }

  const remaining = this.getRemainingBalance();
  if (amount > remaining) {
    throw new Error(`Insufficient balance. Remaining: ${remaining}`);
  }

  this.redeemedAmount += amount;
  this.redeemedBy = clientId;
  this.appointmentId = appointmentId;

  if (this.redeemedAmount >= this.amount) {
    this.status = "redeemed";
    this.redeemedDate = new Date();
  }

  return this.save();
};

giftCardSchema.methods.reserveForAppointment = async function ({
  appointmentId,
  amount,
  sessionId,
  holdMinutes = 30,
}) {
  this.cleanupExpiredReservations();

  const requested = Math.round((Number(amount) || 0) * 100) / 100;
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error("Invalid reservation amount");
  }

  const remaining = this.getRemainingBalance();
  if (requested > remaining) {
    throw new Error(`Insufficient balance. Remaining: ${remaining}`);
  }

  const pending = this.pendingRedemptions.find(
    (entry) => String(entry.appointmentId) === String(appointmentId),
  );

  const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);

  if (pending) {
    pending.amount = requested;
    pending.expiresAt = expiresAt;
    if (sessionId) {
      pending.sessionId = sessionId;
    }
  } else {
    this.pendingRedemptions.push({
      appointmentId,
      amount: requested,
      sessionId,
      expiresAt,
    });
  }

  this.reservedAmount = this.pendingRedemptions.reduce(
    (sum, entry) => sum + Number(entry.amount || 0),
    0,
  );

  return this.save();
};

giftCardSchema.methods.releaseReservation = async function ({ appointmentId }) {
  this.cleanupExpiredReservations();

  this.pendingRedemptions = this.pendingRedemptions.filter(
    (entry) => String(entry.appointmentId) !== String(appointmentId),
  );

  this.reservedAmount = this.pendingRedemptions.reduce(
    (sum, entry) => sum + Number(entry.amount || 0),
    0,
  );

  return this.save();
};

giftCardSchema.methods.consumeReservation = async function ({
  appointmentId,
  amount,
  clientId,
}) {
  this.cleanupExpiredReservations();

  const requested = Math.round((Number(amount) || 0) * 100) / 100;
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error("Invalid redemption amount");
  }

  const reservation = this.pendingRedemptions.find(
    (entry) => String(entry.appointmentId) === String(appointmentId),
  );

  if (!reservation) {
    throw new Error("No active gift card reservation found");
  }

  const reservedAmount =
    Math.round((Number(reservation.amount) || 0) * 100) / 100;
  if (Math.abs(reservedAmount - requested) > 0.009) {
    throw new Error("Reserved amount does not match redemption amount");
  }

  this.pendingRedemptions = this.pendingRedemptions.filter(
    (entry) => String(entry.appointmentId) !== String(appointmentId),
  );
  this.reservedAmount = this.pendingRedemptions.reduce(
    (sum, entry) => sum + Number(entry.amount || 0),
    0,
  );

  this.redeemedAmount += requested;
  this.redeemedBy = clientId;
  this.appointmentId = appointmentId;

  if (this.redeemedAmount >= this.amount) {
    this.status = "redeemed";
    this.redeemedDate = new Date();
  }

  return this.save();
};

// Indexes
giftCardSchema.index({ tenantId: 1, status: 1 });
giftCardSchema.index({ purchaserEmail: 1, purchaseDate: -1 });
giftCardSchema.index({ recipientEmail: 1, status: 1 });
giftCardSchema.index({ expiryDate: 1, status: 1 });
giftCardSchema.index({ stripeCheckoutSessionId: 1, status: 1 });

const GiftCard = mongoose.model("GiftCard", giftCardSchema);

export default GiftCard;
