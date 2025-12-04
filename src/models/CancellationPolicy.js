import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

const PartialRefundSchema = new mongoose.Schema(
  {
    percent: { type: Number }, // 0..100
    fixed: { type: Number }, // pence
  },
  { _id: false }
);

const PolicySchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["salon", "beautician"],
      default: "salon",
      index: true,
    },
    beauticianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Beautician",
      index: true,
    },
    currency: { type: String, default: "GBP" },
    freeCancelHours: { type: Number, default: 24 },
    noRefundHours: { type: Number, default: 2 },
    partialRefund: { type: PartialRefundSchema, default: undefined },
    appliesTo: {
      type: String,
      enum: ["full", "deposit_only"],
      default: "deposit_only",
    },
    rescheduleAllowedHours: { type: Number, default: 2 },
    graceMinutes: { type: Number, default: 15 },
  },
  { timestamps: true }
);

// Apply multi-tenant plugin
PolicySchema.plugin(multiTenantPlugin);

export default mongoose.model("CancellationPolicy", PolicySchema);
