import mongoose from "mongoose";

const consentTemplateSectionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "header",
        "paragraph",
        "list",
        "declaration",
        "checkbox",
        "signature",
      ],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    order: {
      type: Number,
      required: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
    options: {
      type: mongoose.Schema.Types.Mixed, // For list items, checkbox labels, etc.
      default: null,
    },
  },
  { _id: false }
);

const consentTemplateSchema = new mongoose.Schema(
  {
    // Business Reference
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // Template Info
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    // Versioning
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },

    // Template Structure
    sections: {
      type: [consentTemplateSectionSchema],
      required: true,
      validate: {
        validator: function (sections) {
          return sections && sections.length > 0;
        },
        message: "Template must have at least one section",
      },
    },

    // Requirements
    requiredFor: {
      services: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Service",
        },
      ],
      frequency: {
        type: String,
        enum: ["first_visit", "every_visit", "until_changed"],
        default: "until_changed",
      },
    },

    // Validity Period (for UNTIL_CHANGED mode)
    validityPeriodDays: {
      type: Number,
      default: null, // null = no expiry, otherwise days until re-signature required
      min: 1,
    },

    // Content Hash (for change detection in UNTIL_CHANGED mode)
    contentHash: {
      type: String,
      default: null, // SHA-256 hash of critical fields for change detection
    },

    // Legal Content (rendered at publish time)
    legalText: {
      type: String,
      default: "",
    },
    disclaimers: [
      {
        type: String,
        trim: true,
      },
    ],
    risks: [
      {
        type: String,
        trim: true,
      },
    ],

    // Status Management
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      required: true,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },

    // Audit
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
consentTemplateSchema.index({ businessId: 1, status: 1 });
consentTemplateSchema.index({ businessId: 1, name: 1, version: 1 });
consentTemplateSchema.index({ "requiredFor.services": 1 });

// Virtual: Is published
consentTemplateSchema.virtual("isPublished").get(function () {
  return this.status === "published";
});

// Virtual: Is editable (only drafts can be edited)
consentTemplateSchema.virtual("isEditable").get(function () {
  return this.status === "draft";
});

// Pre-save validation: Cannot edit published templates
consentTemplateSchema.pre("save", function (next) {
  // Allow publishing (draft -> published) by checking if status was changed
  const isPublishing = this.isModified("status") && this.status === "published";

  // Block modifications to already-published templates
  if (
    !this.isNew &&
    this.isModified() &&
    this.status === "published" &&
    !isPublishing
  ) {
    // Check if only allowed fields are being modified
    const allowedModifications = [
      "status",
      "archivedAt",
      "updatedBy",
      "updatedAt",
    ];
    const modifiedPaths = this.modifiedPaths();
    const hasDisallowedModifications = modifiedPaths.some(
      (path) => !allowedModifications.includes(path)
    );

    if (hasDisallowedModifications) {
      return next(
        new Error(
          "Cannot modify published consent template. Create a new version instead."
        )
      );
    }
  }
  next();
});

// Method: Create new version
consentTemplateSchema.methods.createNewVersion = async function () {
  const ConsentTemplate = this.constructor;

  const newVersion = new ConsentTemplate({
    businessId: this.businessId,
    name: this.name,
    description: this.description,
    version: this.version + 1,
    sections: this.sections.map((s) => ({ ...s.toObject() })),
    requiredFor: {
      services: [...this.requiredFor.services],
      frequency: this.requiredFor.frequency,
    },
    disclaimers: [...this.disclaimers],
    risks: [...this.risks],
    status: "draft",
    createdBy: this.updatedBy || this.createdBy,
  });

  await newVersion.save();
  return newVersion;
};

// Method: Publish template (lock it)
consentTemplateSchema.methods.publish = async function (adminId) {
  if (this.status !== "draft") {
    throw new Error("Only draft templates can be published");
  }

  // Generate content hash for change detection
  const crypto = await import("crypto");
  const contentToHash = JSON.stringify({
    sections: this.sections,
    disclaimers: this.disclaimers,
    risks: this.risks,
    version: this.version,
  });
  this.contentHash = crypto
    .createHash("sha256")
    .update(contentToHash)
    .digest("hex");

  // Render legal text from sections
  this.legalText = this.sections
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      switch (section.type) {
        case "header":
          return `\n## ${section.content}\n`;
        case "paragraph":
          return `${section.content}\n`;
        case "list":
          return `- ${section.content}\n`;
        case "declaration":
          return `\n**${section.content}**\n`;
        default:
          return section.content;
      }
    })
    .join("\n");

  this.status = "published";
  this.publishedAt = new Date();
  this.updatedBy = adminId;

  await this.save();
  return this;
};

// Method: Archive template
consentTemplateSchema.methods.archive = async function (adminId) {
  this.status = "archived";
  this.archivedAt = new Date();
  this.updatedBy = adminId;
  await this.save();
  return this;
};

// Static: Get active template for service
consentTemplateSchema.statics.getActiveForService = async function (
  serviceId,
  businessId = null
) {
  const query = {
    "requiredFor.services": serviceId,
    status: "published",
  };

  if (businessId) {
    query.businessId = businessId;
  }

  return this.findOne(query).sort({ version: -1 });
};

// Static: Get valid consent for client/service/template
consentTemplateSchema.statics.getValidConsent = async function (
  clientId,
  serviceId,
  templateId
) {
  const ConsentRecord = mongoose.model("ConsentRecord");

  return await ConsentRecord.findOne({
    clientId,
    serviceId,
    consentTemplateId: templateId,
    status: "signed",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).sort({ signedAt: -1 });
};

// Static: Check if consent is required for appointment
consentTemplateSchema.statics.requiresConsent = async function (appointment) {
  const ConsentRecord = mongoose.model("ConsentRecord");

  if (!appointment.serviceId) {
    return { required: false, reason: "no_service", signed: false };
  }

  const appointmentBusinessId =
    appointment.businessId || appointment.tenantId?._id || appointment.tenantId;

  // Get active template for this service
  const template = await this.getActiveForService(
    appointment.serviceId._id || appointment.serviceId,
    appointmentBusinessId || null
  );

  if (!template) {
    return { required: false, reason: "no_template", signed: false };
  }

  const clientId = appointment.clientId._id || appointment.clientId;
  const serviceId = appointment.serviceId._id || appointment.serviceId;
  const frequency = template.requiredFor.frequency;

  // EVERY_VISIT: Always requires new consent
  if (frequency === "every_visit") {
    // Check if already signed for THIS appointment
    const appointmentConsent = await ConsentRecord.findOne({
      appointmentId: appointment._id,
      consentTemplateId: template._id,
      status: "signed",
    });

    if (appointmentConsent) {
      return {
        required: false,
        reason: "already_signed_for_appointment",
        signed: true,
        template,
        consent: appointmentConsent,
      };
    }

    return {
      required: true,
      reason: "every_visit_policy",
      signed: false,
      template,
    };
  }

  // Get most recent consent for this client + service + template
  const existingConsent = await ConsentRecord.findOne({
    clientId,
    serviceId,
    consentTemplateId: template._id,
    status: "signed",
  }).sort({ signedAt: -1 });

  // FIRST_VISIT: Only required on first visit
  if (frequency === "first_visit") {
    if (!existingConsent) {
      return {
        required: true,
        reason: "first_visit_no_consent",
        signed: false,
        template,
      };
    }

    return {
      required: false,
      reason: "first_visit_already_signed",
      signed: true,
      template,
      consent: existingConsent,
    };
  }

  // UNTIL_CHANGED: Complex validation logic
  if (frequency === "until_changed") {
    // No existing consent = required
    if (!existingConsent) {
      return {
        required: true,
        reason: "no_existing_consent",
        signed: false,
        template,
      };
    }

    // Check if consent is expired (if validity period set)
    if (template.validityPeriodDays) {
      const expiryDate = new Date(existingConsent.signedAt);
      expiryDate.setDate(expiryDate.getDate() + template.validityPeriodDays);

      if (new Date() > expiryDate) {
        return {
          required: true,
          reason: "validity_period_expired",
          signed: false,
          template,
          lastSigned: existingConsent.signedAt,
          expiredOn: expiryDate,
        };
      }
    }

    // Check if consent is for older template version
    if (existingConsent.templateVersion !== template.version) {
      return {
        required: true,
        reason: "template_version_changed",
        signed: false,
        template,
        lastSigned: existingConsent.signedAt,
        previousVersion: existingConsent.templateVersion,
        currentVersion: template.version,
      };
    }

    // Check if template content changed (comparing content hash)
    const ConsentTemplate = this;
    const previousTemplate = await ConsentTemplate.findOne({
      _id: existingConsent.consentTemplateId,
      version: existingConsent.templateVersion,
    });

    if (
      previousTemplate &&
      previousTemplate.contentHash !== template.contentHash
    ) {
      return {
        required: true,
        reason: "template_content_changed",
        signed: false,
        template,
        lastSigned: existingConsent.signedAt,
      };
    }

    // Check if consent is revoked or expired
    if (
      existingConsent.status !== "signed" ||
      (existingConsent.expiresAt && existingConsent.expiresAt < new Date())
    ) {
      return {
        required: true,
        reason: "consent_revoked_or_expired",
        signed: false,
        template,
        lastSigned: existingConsent.signedAt,
      };
    }

    // Valid consent exists
    return {
      required: false,
      reason: "valid_consent_exists",
      signed: true,
      template,
      consent: existingConsent,
      lastSigned: existingConsent.signedAt,
    };
  }

  // Fallback
  return { required: false, reason: "unknown_frequency", signed: false };
};

// Static: Check if consent required (simplified for client-facing checks)
consentTemplateSchema.statics.isConsentRequired = async function (
  serviceId,
  clientId,
  businessId = null
) {
  const ConsentRecord = mongoose.model("ConsentRecord");

  const template = await this.getActiveForService(serviceId, businessId);

  if (!template) {
    return { required: false, signed: false };
  }

  const frequency = template.requiredFor.frequency;

  // EVERY_VISIT always shows as required (until linked to specific appointment)
  if (frequency === "every_visit") {
    return { required: true, signed: false, template };
  }

  // Check for existing valid consent
  const existingConsent = await ConsentRecord.findOne({
    clientId,
    serviceId,
    consentTemplateId: template._id,
    status: "signed",
  }).sort({ signedAt: -1 });

  if (!existingConsent) {
    return { required: true, signed: false, template };
  }

  // FIRST_VISIT: Check if any consent exists
  if (frequency === "first_visit") {
    return { required: false, signed: true, template };
  }

  // UNTIL_CHANGED: Check validity
  if (frequency === "until_changed") {
    // Check expiry
    if (template.validityPeriodDays) {
      const expiryDate = new Date(existingConsent.signedAt);
      expiryDate.setDate(expiryDate.getDate() + template.validityPeriodDays);

      if (new Date() > expiryDate) {
        return { required: true, signed: false, template };
      }
    }

    // Check version match
    if (existingConsent.templateVersion !== template.version) {
      return { required: true, signed: false, template };
    }

    return { required: false, signed: true, template };
  }

  return { required: false, signed: false };
};

export default mongoose.model("ConsentTemplate", consentTemplateSchema);
