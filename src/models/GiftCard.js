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
  },
  {
    timestamps: true,
  }
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
giftCardSchema.methods.getRemainingBalance = function () {
  return this.amount - this.redeemedAmount;
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
  appointmentId
) {
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

// Indexes
giftCardSchema.index({ tenantId: 1, status: 1 });
giftCardSchema.index({ purchaserEmail: 1, purchaseDate: -1 });
giftCardSchema.index({ recipientEmail: 1, status: 1 });
giftCardSchema.index({ expiryDate: 1, status: 1 });
giftCardSchema.index({ stripeCheckoutSessionId: 1, status: 1 });

const GiftCard = mongoose.model("GiftCard", giftCardSchema);

export default GiftCard;
