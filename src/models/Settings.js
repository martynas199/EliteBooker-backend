import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

const SettingsSchema = new mongoose.Schema(
  {
    // Note: In multi-tenant, each tenant has their own settings
    // No longer using singleton pattern with fixed _id

    // Salon Working Hours
    workingHours: {
      mon: { start: String, end: String },
      tue: { start: String, end: String },
      wed: { start: String, end: String },
      thu: { start: String, end: String },
      fri: { start: String, end: String },
      sat: { start: String, end: String },
      sun: { start: String, end: String },
    },

    // Salon Information
    salonName: String,
    salonDescription: String,
    salonAddress: {
      street: String,
      city: String,
      postalCode: String,
      country: String,
    },
    salonPhone: String,
    salonEmail: String,

    // Salon Images
    heroImage: {
      provider: String,
      id: String,
      url: String,
      alt: String,
      width: Number,
      height: Number,
    },

    // Products Page Hero Image
    productsHeroImage: {
      provider: String,
      publicId: String,
      url: String,
      position: { type: String, default: "center" }, // top, center, bottom
      zoom: { type: Number, default: 100 }, // 80, 100, 120, 150
    },
  },
  { timestamps: true }
);

// Apply multi-tenant plugin
SettingsSchema.plugin(multiTenantPlugin);

export default mongoose.model("Settings", SettingsSchema);
