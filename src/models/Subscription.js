import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

const subscriptionSchema = new mongoose.Schema(
  {
    // Link to admin/salon
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false, // Optional for now, will be required in production
    },
    salonId: {
      type: String,
      default: "default",
      required: true,
    },

    // Stripe IDs
    stripeCustomerId: {
      type: String,
      required: true,
    },
    stripeSubscriptionId: {
      type: String,
      required: true,
      unique: true,
    },
    stripePriceId: {
      type: String,
      required: true,
    },

    // Subscription status
    status: {
      type: String,
      enum: [
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
      ],
      required: true,
    },

    // Billing period
    currentPeriodStart: {
      type: Number, // Unix timestamp
      required: true,
    },
    currentPeriodEnd: {
      type: Number, // Unix timestamp
      required: true,
    },

    // Cancellation
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    canceledAt: {
      type: Number, // Unix timestamp
    },

    // Trial
    trialStart: {
      type: Number, // Unix timestamp
    },
    trialEnd: {
      type: Number, // Unix timestamp
    },

    // Metadata
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster lookups
subscriptionSchema.index({ salonId: 1 });
subscriptionSchema.index({ adminId: 1 });
subscriptionSchema.index({ stripeCustomerId: 1 });

// Apply multi-tenant plugin
subscriptionSchema.plugin(multiTenantPlugin);

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
