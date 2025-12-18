import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

const PaymentStripeSchema = new mongoose.Schema(
  {
    paymentIntentId: String,
    chargeId: String,
    refundIds: [String],
    // Stripe Connect fields
    platformFee: { type: Number, default: 50 }, // £0.50 in pence
    beauticianStripeAccount: String, // Connected account ID
    transferId: String, // ID of the transfer to specialist
    // Payment error details (for failed/declined payments)
    lastPaymentError: {
      code: String, // e.g., 'card_declined', 'insufficient_funds'
      message: String, // Human-readable error message
      declineCode: String, // e.g., 'generic_decline', 'insufficient_funds'
      type: String, // e.g., 'card_error', 'validation_error'
    },
  },
  { _id: false }
);

const PaymentSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["pay_now", "deposit", "pay_in_salon"],
      index: true,
    },
    provider: {
      type: String,
      enum: ["stripe", "cash", "pos"],
      default: "stripe",
    },
    status: {
      type: String,
      enum: [
        "succeeded",
        "requires_action",
        "refunded",
        "partial_refunded",
        "unpaid",
      ],
      default: "unpaid",
    },
    sessionId: String,
    amountTotal: { type: Number, default: 0 },
    amountDeposit: { type: Number },
    amountBalance: { type: Number },
    stripe: { type: PaymentStripeSchema, default: undefined },
  },
  { _id: false }
);

const AuditSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: String,
    by: String,
    meta: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const AppointmentSchema = new mongoose.Schema(
  {
    // Link to registered user (optional - null for guest bookings)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    // Link to global client (new unified system)
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      index: true,
      sparse: true,
    },
    client: { name: String, email: String, phone: String, notes: String },
    specialistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Specialist",
      index: true,
    },
    // Multiple services support
    services: [
      {
        serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
        variantName: String,
        price: Number,
        duration: Number, // in minutes
        _id: false,
      },
    ],
    // Legacy single service fields (kept for backward compatibility)
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
    variantName: String,
    start: Date,
    end: Date,
    price: Number, // Total price of all services
    totalDuration: Number, // Total duration in minutes
    status: {
      type: String,
      enum: [
        "reserved_unpaid",
        "confirmed",
        "completed",
        "cancelled_no_refund",
        "cancelled_partial_refund",
        "cancelled_full_refund",
        "no_show",
      ],
      default: "confirmed",
      index: true,
    },
    cancelledAt: Date,
    cancelReason: String,
    cancelledBy: { type: String, enum: ["customer", "staff", "system"] },
    payment: { type: PaymentSchema, default: undefined },
    audit: { type: [AuditSchema], default: [] },
    policySnapshot: mongoose.Schema.Types.Mixed,

    // Google Calendar integration
    googleCalendarEventId: String, // Store event ID for updates/deletions

    // Reminder tracking
    reminder: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      types: [{ type: String, enum: ["sms", "email"] }], // Which notifications were sent
    },

    // Multi-Location Support
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      index: true,
    },
  },
  { timestamps: true }
);

// Performance indexes for common queries
AppointmentSchema.index({ specialistId: 1, start: 1 }); // Already exists
AppointmentSchema.index({ specialistId: 1, start: 1, status: 1 }); // Optimized for slot queries with status filter
AppointmentSchema.index({ start: 1, end: 1 }); // Date range queries
AppointmentSchema.index({ status: 1, start: 1 }); // Status-based filtering
AppointmentSchema.index({ userId: 1, start: -1 }); // User's appointments sorted by date
AppointmentSchema.index({ "client.email": 1 }); // Guest booking lookups
AppointmentSchema.index({ createdAt: -1 }); // Recent appointments

// TTL index to automatically delete abandoned unpaid reservations after 3 minutes
// This prevents reserved_unpaid appointments from blocking slots forever if payment is not completed
AppointmentSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 180, // 3 minutes
    partialFilterExpression: { status: "reserved_unpaid" },
  }
);

// Apply multi-tenant plugin
AppointmentSchema.plugin(multiTenantPlugin);

export default mongoose.model("Appointment", AppointmentSchema);
