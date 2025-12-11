import mongoose from "mongoose";

/**
 * Tenant-Client Relationship Model (Business-Specific)
 * Links a global client to a specific business
 * Contains all business-specific client data
 */
const tenantClientSchema = new mongoose.Schema(
  {
    // Relationships
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },

    // Business-Specific Client Data
    displayName: {
      type: String,
      trim: true,
    },
    internalNotes: {
      type: String,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },

    // Business Relationship Metrics
    totalSpend: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalVisits: {
      type: Number,
      default: 0,
      min: 0,
    },
    averageSpend: {
      type: Number,
      default: 0,
      min: 0,
    },
    lifetimeValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Visit Tracking
    firstVisit: {
      type: Date,
      default: Date.now,
    },
    lastVisit: Date,
    lastBookingDate: Date,
    nextBookingDate: Date,

    // Business-Specific Status
    status: {
      type: String,
      enum: ["active", "inactive", "blocked", "vip"],
      default: "active",
      index: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockReason: String,
    blockedAt: Date,
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },

    // Preferences for This Business
    preferredSpecialist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Specialist",
    },
    preferredServices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
      },
    ],

    // Communication Preferences (Business-Specific)
    smsReminders: {
      type: Boolean,
      default: true,
    },
    emailReminders: {
      type: Boolean,
      default: true,
    },
    marketingEmails: {
      type: Boolean,
      default: false,
    },

    // Loyalty & Rewards (Business-Specific)
    loyaltyPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    membershipTier: {
      type: String,
      enum: ["bronze", "silver", "gold", "platinum"],
      default: "bronze",
    },

    // Metadata
    source: {
      type: String,
      enum: ["booking", "manual", "import"],
      default: "booking",
    },
  },
  {
    timestamps: true,
  }
);

// Compound Indexes
tenantClientSchema.index({ tenantId: 1, clientId: 1 }, { unique: true });
tenantClientSchema.index({ tenantId: 1, status: 1 });
tenantClientSchema.index({ tenantId: 1, lastVisit: -1 });
tenantClientSchema.index({ tenantId: 1, totalSpend: -1 });
tenantClientSchema.index({ tenantId: 1, totalVisits: -1 });
tenantClientSchema.index({ tenantId: 1, tags: 1 });

// Virtual for full name (uses client's name if displayName not set)
tenantClientSchema.virtual("fullName").get(function () {
  return this.displayName || (this.clientId && this.clientId.name) || "Unknown";
});

// Ensure virtuals are included in JSON
tenantClientSchema.set("toJSON", { virtuals: true });
tenantClientSchema.set("toObject", { virtuals: true });

const TenantClient = mongoose.model("TenantClient", tenantClientSchema);

export default TenantClient;
