import { Schema, model } from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

const ImageSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    provider: {
      type: String,
      enum: ["cloudinary", "url"],
      default: "cloudinary",
    },
  },
  { _id: false }
);

const VariantSchema = new Schema(
  {
    size: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    priceEUR: {
      type: Number,
      default: null,
      min: 0,
      // EUR price for multi-currency support
    },
    originalPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    originalPriceEUR: {
      type: Number,
      default: null,
      min: 0,
      // Original EUR price (before discount)
    },
    purchasePrice: {
      type: Number,
      default: null,
      min: 0,
      // Cost price for margin/profit calculations
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    sku: {
      type: String,
      default: "",
      trim: true,
    },
    weight: {
      type: Number,
      default: 0,
      min: 0,
      // Weight in grams for shipping calculations
    },
  },
  { _id: true }
);

const ProductSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    // Stripe Connect: Product belongs to a specialist
    specialistId: {
      type: Schema.Types.ObjectId,
      ref: "Specialist",
      index: true,
      default: null, // null means platform-owned products
    },
    keyBenefits: {
      type: [String],
      default: [],
    },
    ingredients: {
      type: String,
      default: "",
    },
    howToApply: {
      type: String,
      default: "",
    },
    // Variants: Array of size/price combinations
    variants: {
      type: [VariantSchema],
      default: [],
      validate: {
        validator: function (v) {
          return v.length > 0;
        },
        message: "Product must have at least one variant",
      },
    },
    // Legacy fields (for backward compatibility, will use first variant if exists)
    size: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    priceEUR: {
      type: Number,
      default: null,
      min: 0,
      // EUR price for multi-currency support
    },
    originalPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    originalPriceEUR: {
      type: Number,
      default: null,
      min: 0,
      // Original EUR price (before discount)
    },
    purchasePrice: {
      type: Number,
      default: null,
      min: 0,
      // Legacy cost price for margin/profit calculations
    },
    stock: {
      type: Number,
      default: 0,
    },
    image: {
      type: ImageSchema,
      default: null,
    },
    images: {
      type: [ImageSchema],
      default: [],
    },
    featured: {
      type: Boolean,
      default: false,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Performance indexes for common queries
ProductSchema.index({ featured: 1, order: 1 }); // Already exists
ProductSchema.index({ category: 1, active: 1 }); // Already exists
ProductSchema.index({ active: 1, createdAt: -1 }); // Active products
ProductSchema.index({ specialistId: 1, active: 1 }); // Specialist's products
ProductSchema.index({ title: "text", description: "text" }); // Text search
ProductSchema.index({ "variants.stock": 1 }); // Stock availability

// Apply multi-tenant plugin
ProductSchema.plugin(multiTenantPlugin);

const Product = model("Product", ProductSchema);

export default Product;
