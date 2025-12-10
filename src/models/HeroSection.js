import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

const ImageSchema = new mongoose.Schema(
  {
    url: String,
    publicId: String,
    provider: { type: String, enum: ["cloudinary", "url"], default: "url" },
  },
  { _id: false }
);

const HeroSectionSchema = new mongoose.Schema(
  {
    // Section 1: Text Content (Left)
    title: {
      type: String,
      default: "Refined Luxury Awaits",
    },
    subtitle: {
      type: String,
      default:
        "Where heritage meets artistry, our hair extensions, beauty products and services embodies the essence of timeless elegance.",
    },
    showCta: {
      type: Boolean,
      default: true,
    },
    ctaText: {
      type: String,
      default: "Shop all",
    },
    ctaLink: {
      type: String,
      default: "#services",
    },

    // Section 2: Center Image (Image 1)
    centerImage: {
      type: ImageSchema,
      default: undefined,
    },

    // Section 3: Right Image (Image 2)
    rightImage: {
      type: ImageSchema,
      default: undefined,
    },

    // Display settings
    order: {
      type: Number,
      default: 0,
    },
    overlayOpacity: {
      type: Number,
      default: 0.3,
      min: 0,
      max: 1,
    },
    overlayColor: {
      type: String,
      default: "#000000",
    },
  },
  { timestamps: true }
);

// Apply multi-tenant plugin
HeroSectionSchema.plugin(multiTenantPlugin);

export default mongoose.model("HeroSection", HeroSectionSchema);
