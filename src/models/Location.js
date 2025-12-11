import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";
import slugify from "slugify";

const AddressSchema = new mongoose.Schema(
  {
    street: { type: String, default: "" },
    city: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    country: { type: String, default: "United Kingdom" },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { _id: false }
);

const ImageSchema = new mongoose.Schema(
  {
    url: String,
    publicId: String,
    provider: { type: String, enum: ["cloudinary", "url"], default: "url" },
  },
  { _id: false }
);

const LocationSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },

    // Contact Information
    address: {
      type: AddressSchema,
      default: () => ({}),
    },
    phone: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },

    // Working Hours
    workingHours: [
      {
        dayOfWeek: {
          type: Number,
          required: true,
          min: 0,
          max: 6, // 0=Sunday, 1=Monday, ..., 6=Saturday
        },
        start: {
          type: String,
          required: true,
        },
        end: {
          type: String,
          required: true,
        },
      },
    ],

    // Location-Specific Settings
    settings: {
      images: {
        type: [ImageSchema],
        default: [],
      },
      amenities: {
        type: [String],
        default: [],
      },
      timezone: {
        type: String,
        default: "Europe/London",
      },
    },

    // Status & Organization
    isActive: {
      type: Boolean,
      default: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Apply multi-tenant plugin
LocationSchema.plugin(multiTenantPlugin);

// Create unique compound index for slug within tenant
LocationSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
LocationSchema.index({ tenantId: 1, displayOrder: 1 });
LocationSchema.index({ tenantId: 1, isPrimary: 1 });

// Auto-generate slug from name before saving
LocationSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("name")) {
    let baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;

    // Ensure slug is unique within this tenant
    while (
      await this.constructor.findOne({
        tenantId: this.tenantId,
        slug,
        _id: { $ne: this._id },
      })
    ) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }
  next();
});

// Ensure only one primary location per tenant
LocationSchema.pre("save", async function (next) {
  if (this.isPrimary && this.isModified("isPrimary")) {
    // Remove primary flag from other locations in this tenant
    await this.constructor.updateMany(
      { tenantId: this.tenantId, _id: { $ne: this._id } },
      { $set: { isPrimary: false } }
    );
  }
  next();
});

export default mongoose.model("Location", LocationSchema);
