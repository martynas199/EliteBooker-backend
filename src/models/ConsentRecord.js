import mongoose from "mongoose";

const consentRecordSchema = new mongoose.Schema(
  {
    // References
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
      index: true,
    },
    consentTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ConsentTemplate",
      required: true,
      index: true,
    },

    // Template Snapshot (immutable record of what was signed)
    templateVersion: {
      type: Number,
      required: true,
    },
    templateName: {
      type: String,
      required: true,
    },
    templateContent: {
      type: mongoose.Schema.Types.Mixed, // Full snapshot of sections
      required: true,
    },

    // Signature Data
    signedByName: {
      type: String,
      required: true,
      trim: true,
    },
    signatureData: {
      type: String, // Base64 encoded signature image data URL
      required: true,
    },
    signedAt: {
      type: Date,
      required: true,
      index: true,
    },

    // Audit Trail (IMMUTABLE)
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    signatureLocation: {
      lat: Number,
      lng: Number,
    },

    // PDF Storage (GCS)
    gcsObjectPath: {
      type: String,
      required: true,
      unique: true,
    },
    gcsGeneration: {
      type: String, // GCS object generation number for versioning
      default: null,
    },
    pdfGeneratedAt: {
      type: Date,
      required: true,
    },
    pdfHash: {
      type: String, // SHA-256 hash of PDF for integrity verification
      required: true,
    },

    // Status Management
    status: {
      type: String,
      enum: ["signed", "revoked", "expired"],
      default: "signed",
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    revokedReason: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    // Notification & Access
    notificationSent: {
      email: {
        sent: { type: Boolean, default: false },
        sentAt: { type: Date },
        opened: { type: Boolean, default: false },
        openedAt: { type: Date },
      },
      sms: {
        sent: { type: Boolean, default: false },
        sentAt: { type: Date },
        delivered: { type: Boolean, default: false },
        deliveredAt: { type: Date },
      },
    },
    accessLog: [
      {
        accessedAt: { type: Date, required: true },
        accessedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        ipAddress: { type: String },
        action: { type: String, enum: ["view", "download", "email"] },
      },
    ],

    // GDPR Compliance
    dataRetentionUntil: {
      type: Date,
      required: true,
      index: true,
    },
    anonymizedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound Indexes
consentRecordSchema.index({ businessId: 1, clientId: 1, status: 1 });
consentRecordSchema.index({ businessId: 1, appointmentId: 1 });
consentRecordSchema.index({
  clientId: 1,
  serviceId: 1,
  consentTemplateId: 1,
  signedAt: -1,
});
consentRecordSchema.index({ clientId: 1, consentTemplateId: 1, signedAt: -1 });
consentRecordSchema.index({ status: 1, expiresAt: 1 });
consentRecordSchema.index({ dataRetentionUntil: 1, anonymizedAt: 1 });

// Virtual: Is valid (not revoked or expired)
consentRecordSchema.virtual("isValid").get(function () {
  if (this.status !== "signed") return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
});

// Virtual: Days until expiry
consentRecordSchema.virtual("daysUntilExpiry").get(function () {
  if (!this.expiresAt) return null;
  const now = new Date();
  const diff = this.expiresAt - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Pre-save: Set data retention date (7 years from signing)
consentRecordSchema.pre("save", function (next) {
  if (this.isNew && !this.dataRetentionUntil) {
    const retentionDate = new Date(this.signedAt);
    retentionDate.setFullYear(retentionDate.getFullYear() + 7); // 7 years retention
    this.dataRetentionUntil = retentionDate;
  }
  next();
});

// Pre-save validation: Cannot modify signed records (except specific fields)
consentRecordSchema.pre("save", function (next) {
  if (!this.isNew && this.isModified()) {
    const allowedModifications = [
      "status",
      "revokedAt",
      "revokedBy",
      "revokedReason",
      "expiresAt",
      "notificationSent",
      "accessLog",
      "anonymizedAt",
      "updatedAt",
    ];

    const modifiedPaths = this.modifiedPaths();
    const hasDisallowedModifications = modifiedPaths.some(
      (path) =>
        !allowedModifications.some((allowed) => path.startsWith(allowed))
    );

    if (hasDisallowedModifications) {
      return next(new Error("Cannot modify immutable consent record fields"));
    }
  }
  next();
});

// Method: Revoke consent
consentRecordSchema.methods.revoke = async function (adminId, reason) {
  if (this.status !== "signed") {
    throw new Error("Can only revoke signed consents");
  }

  this.status = "revoked";
  this.revokedAt = new Date();
  this.revokedBy = adminId;
  this.revokedReason = reason;

  await this.save();
  return this;
};

// Method: Log access
consentRecordSchema.methods.logAccess = async function (
  action,
  adminId = null,
  ipAddress = null
) {
  this.accessLog.push({
    accessedAt: new Date(),
    accessedBy: adminId,
    ipAddress,
    action,
  });

  await this.save();
  return this;
};

// Method: Mark email opened
consentRecordSchema.methods.markEmailOpened = async function () {
  this.notificationSent.email.opened = true;
  this.notificationSent.email.openedAt = new Date();
  await this.save();
  return this;
};

// Method: Mark SMS delivered
consentRecordSchema.methods.markSMSDelivered = async function () {
  this.notificationSent.sms.delivered = true;
  this.notificationSent.sms.deliveredAt = new Date();
  await this.save();
  return this;
};

// Method: Anonymize (GDPR right to erasure)
consentRecordSchema.methods.anonymize = async function () {
  // Keep the record structure but anonymize personal data
  this.signedByName = "ANONYMIZED";
  this.signatureData = "data:image/png;base64,ANONYMIZED";
  this.ipAddress = "0.0.0.0";
  this.userAgent = "ANONYMIZED";
  this.signatureLocation = undefined;
  this.accessLog = [];
  this.anonymizedAt = new Date();

  // Note: The PDF in GCS should also be deleted or anonymized
  await this.save();
  return this;
};

// Static: Get valid consent for client and template
consentRecordSchema.statics.getValidConsent = async function (
  clientId,
  templateId
) {
  return this.findOne({
    clientId,
    consentTemplateId: templateId,
    status: "signed",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).sort({ signedAt: -1 });
};

// Static: Check if client has valid consent
consentRecordSchema.statics.hasValidConsent = async function (
  clientId,
  templateId
) {
  const consent = await this.getValidConsent(clientId, templateId);
  return !!consent;
};

// Static: Get all consents for client
consentRecordSchema.statics.getClientConsents = async function (
  clientId,
  includeRevoked = false
) {
  const query = { clientId };
  if (!includeRevoked) {
    query.status = "signed";
  }

  return this.find(query)
    .populate("consentTemplateId", "name version")
    .sort({ signedAt: -1 });
};

// Static: Get consents requiring renewal (expiring soon)
consentRecordSchema.statics.getConsentsExpiringsSoon = async function (
  days = 30
) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    status: "signed",
    expiresAt: {
      $gte: new Date(),
      $lte: futureDate,
    },
  }).populate("clientId consentTemplateId");
};

// Static: Get records for retention cleanup (past retention date)
consentRecordSchema.statics.getRecordsForCleanup = async function () {
  return this.find({
    dataRetentionUntil: { $lt: new Date() },
    anonymizedAt: null,
  });
};

export default mongoose.model("ConsentRecord", consentRecordSchema);
