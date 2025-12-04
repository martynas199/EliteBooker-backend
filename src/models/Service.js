import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

const VariantSchema = new mongoose.Schema(
  {
    name: String,
    durationMin: Number,
    price: Number,
    promoPrice: Number, // Promotional price (optional) - if set, variant is on special offer
    bufferBeforeMin: { type: Number, default: 0 },
    bufferAfterMin: { type: Number, default: 10 },
  },
  { _id: false }
);
const ServiceSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    category: String,
    imageUrl: String,
    variants: [VariantSchema],
    // Admin system field (preferred) - single primary beautician
    primaryBeauticianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Beautician",
      index: true, // Index for role-based queries
    },
    // Admin system field - additional beauticians who can perform this service
    additionalBeauticianIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Beautician" },
    ],
    // Preferred single-beautician assignment (legacy)
    beauticianId: { type: mongoose.Schema.Types.ObjectId, ref: "Beautician" },
    // Backwards-compatibility for older data
    beauticianIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Beautician" },
    ],
    // Additional fields for admin system
    price: Number,
    promoPrice: Number, // Promotional price (optional) - if set, service is on special offer
    durationMin: Number,
    active: { type: Boolean, default: true, index: true }, // Index for filtering
    priceVaries: { type: Boolean, default: false }, // Indicates if price varies
    image: {
      provider: String,
      id: String,
      url: String,
      alt: String,
      width: Number,
      height: Number,
    },
    gallery: [
      {
        provider: String,
        id: String,
        url: String,
        alt: String,
        width: Number,
        height: Number,
      },
    ],
  },
  { timestamps: true }
);

// Performance indexes for common queries
ServiceSchema.index({ primaryBeauticianId: 1, active: 1 }); // Already exists
ServiceSchema.index({ additionalBeauticianIds: 1, active: 1 }); // Already exists
ServiceSchema.index({ category: 1, active: 1 }); // Category filtering
ServiceSchema.index({ active: 1, createdAt: -1 }); // Active services sorted by date
ServiceSchema.index({ name: "text", description: "text" }); // Text search

// Apply multi-tenant plugin
ServiceSchema.plugin(multiTenantPlugin);

export default mongoose.model("Service", ServiceSchema);
