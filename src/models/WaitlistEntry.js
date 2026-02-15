import mongoose from "mongoose";
import { multiTenantPlugin } from "../middleware/multiTenantPlugin.js";

const WaitlistClientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
  },
  { _id: false }
);

const WaitlistAuditEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    at: { type: Date, default: Date.now },
    by: { type: String, default: "system", trim: true },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const WaitlistEntrySchema = new mongoose.Schema(
  {
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    variantName: { type: String, required: true, trim: true },
    specialistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Specialist",
      default: null,
      index: true,
    },
    desiredDate: {
      type: String,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    timePreference: {
      type: String,
      enum: ["morning", "afternoon", "evening", "any"],
      default: "any",
    },
    client: {
      type: WaitlistClientSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "converted", "expired", "removed"],
      default: "active",
      index: true,
    },
    source: {
      type: String,
      enum: ["public_booking", "admin_manual", "system"],
      default: "public_booking",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    priority: {
      type: Number,
      default: 0,
    },
    notifiedAt: Date,
    convertedAt: Date,
    convertedAppointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
    audit: {
      type: [WaitlistAuditEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

WaitlistEntrySchema.index({
  tenantId: 1,
  status: 1,
  serviceId: 1,
  variantName: 1,
  specialistId: 1,
  createdAt: 1,
});

WaitlistEntrySchema.index({
  tenantId: 1,
  "client.email": 1,
  status: 1,
});

WaitlistEntrySchema.plugin(multiTenantPlugin);

export default mongoose.model("WaitlistEntry", WaitlistEntrySchema);
