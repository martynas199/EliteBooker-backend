import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

// Legacy day schema for backward compatibility
const DaySchema = new mongoose.Schema(
  {
    start: String,
    end: String,
    breaks: [{ start: String, end: String }],
  },
  { _id: false }
);

// New working hours schema for admin system
const WorkingHoursSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6 }, // 0=Sunday, 6=Saturday
    start: String, // HH:mm format
    end: String, // HH:mm format
  },
  { _id: false }
);

const SpecialistSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    bio: String,
    specialties: [String],
    active: { type: Boolean, default: true },
    color: { type: String, default: "#3B82F6" }, // Calendar color

    // Admin system working hours (array format) - default weekly schedule
    workingHours: [WorkingHoursSchema],

    // Custom schedule for specific dates (overrides default weekly schedule)
    // Format: { "2025-12-05": [{ start: "09:00", end: "12:00" }], "2025-12-25": [] }
    customSchedule: {
      type: Map,
      of: [
        {
          start: String,
          end: String,
          _id: false,
        },
      ],
      default: {},
    },

    // Legacy working hours (object format) - kept for backward compatibility
    legacyWorkingHours: {
      mon: DaySchema,
      tue: DaySchema,
      wed: DaySchema,
      thu: DaySchema,
      fri: DaySchema,
      sat: DaySchema,
      sun: DaySchema,
    },

    // Time off periods
    timeOff: [
      {
        start: Date,
        end: Date,
        reason: String,
      },
    ],

    // Profile image for admin system
    image: {
      provider: String,
      id: String,
      url: String,
      alt: String,
      width: Number,
      height: Number,
    },

    // Stripe Connect fields
    stripeAccountId: { type: String, index: true },
    stripeAccountType: {
      type: String,
      enum: ["standard"],
      default: "standard",
    },
    stripeStatus: {
      type: String,
      enum: [
        "not_connected",
        "pending",
        "connected",
        "rejected",
        "disconnected",
      ],
      default: "not_connected",
    },
    stripeOnboardingCompleted: { type: Boolean, default: false },
    stripePayoutsEnabled: { type: Boolean, default: false }, // Whether specialist can receive payouts
    totalEarnings: { type: Number, default: 0 }, // Total revenue from bookings + products
    totalPayouts: { type: Number, default: 0 }, // Total amount paid out by Stripe
    lastPayoutDate: Date,

    // Payment preferences
    inSalonPayment: { type: Boolean, default: false }, // If true, accept payment in salon (no Stripe deposit, only booking fee)

    // Stripe customer ID for subscriptions
    stripeCustomerId: { type: String, index: true },

    // Premium features subscription
    subscription: {
      noFeeBookings: {
        enabled: { type: Boolean, default: false },
        stripeSubscriptionId: String,
        stripePriceId: String,
        status: {
          type: String,
          enum: [
            "inactive",
            "active",
            "past_due",
            "canceled",
            "incomplete",
            "incomplete_expired",
            "trialing",
            "unpaid",
          ],
          default: "inactive",
        },
        currentPeriodStart: Date,
        currentPeriodEnd: Date,
      },
      smsConfirmations: {
        enabled: { type: Boolean, default: false },
        stripeSubscriptionId: String,
        stripePriceId: String,
        status: {
          type: String,
          enum: [
            "inactive",
            "active",
            "past_due",
            "canceled",
            "incomplete",
            "incomplete_expired",
            "trialing",
            "unpaid",
          ],
          default: "inactive",
        },
        currentPeriodStart: Date,
        currentPeriodEnd: Date,
      },
    },

    // Google Calendar Integration
    googleCalendar: {
      enabled: { type: Boolean, default: false },
      accessToken: { type: String, select: false }, // Don't return in queries by default
      refreshToken: { type: String, select: false },
      expiryDate: { type: Number },
      email: String, // Google account email
      calendarId: { type: String, default: "primary" },
    },

    // Multi-Location Support
    locationIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Location" }],
      default: [],
    },
    primaryLocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
    },

    // Admin account link
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

// Performance indexes for common queries
SpecialistSchema.index({ active: 1, createdAt: -1 }); // Active specialists
SpecialistSchema.index({ email: 1 }); // Email lookups
SpecialistSchema.index({ stripeStatus: 1 }); // Stripe onboarding status
SpecialistSchema.index({ stripeAccountId: 1 }); // Already has index

// Apply multi-tenant plugin
SpecialistSchema.plugin(multiTenantPlugin);

// Export with collection name "specialists" to maintain backward compatibility with existing database
export default mongoose.model("Specialist", SpecialistSchema, "specialists");
