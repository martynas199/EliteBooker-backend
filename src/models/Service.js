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
    // Admin system field (preferred) - single primary specialist
    primaryBeauticianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Specialist",
      index: true, // Index for role-based queries
    },
    // Admin system field - additional specialists who can perform this service
    additionalBeauticianIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Specialist" },
    ],
    // Preferred single-specialist assignment (legacy)
    specialistId: { type: mongoose.Schema.Types.ObjectId, ref: "Specialist" },
    // Backwards-compatibility for older data
    beauticianIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Specialist" },
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

    // Multi-Location Support
    availableAt: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Location" }],
      default: [],
    },

    // Fixed Time Slots (optional) - array of time strings like ['09:15', '11:30', '16:00']
    // When set, these exact times will be used instead of computed slots
    fixedTimeSlots: {
      type: [String],
      default: undefined, // undefined means use computed slots, empty array [] means no slots
      validate: {
        validator: function (times) {
          if (!times) return true;
          return times.every((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time));
        },
        message: 'Fixed time slots must be in HH:MM or H:MM format (e.g., "09:15", "14:30")',
      },
    },
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
