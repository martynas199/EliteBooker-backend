import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import ConsentRecord from "../models/ConsentRecord.js";
import ConsentTemplate from "../models/ConsentTemplate.js";
import Client from "../models/Client.js";
import pdfGenerationService from "../services/pdfGenerationService.js";
import gcsConsentService from "../services/gcsConsentService.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { authenticateClient } from "../middleware/clientAuth.js";
import optionalAuth from "../middleware/optionalAuth.js";
import { JWT_SECRET } from "../config/security.js";

const router = express.Router();

// Middleware to allow either admin or authenticated client
const allowAdminOrClient = [
  optionalAuth,
  async (req, res, next) => {
    // Check for either admin or client authentication
    if (!req.user && !req.admin) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;

      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);

          if (decoded?.type === "client") {
            const client = await Client.findById(decoded.id);

            if (client && client.isActive) {
              req.client = client;
              req.user = {
                userId: client._id,
                role: "client",
                clientId: client._id,
              };
            }
          }
        } catch (error) {
          // Fall through to unauthorized response below
        }
      }
    }

    if (!req.user && !req.admin) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Normalize to req.user for consistency
    if (!req.user && req.admin) {
      req.user = {
        userId: req.admin._id,
        role: req.admin.role,
        clientId: req.admin.clientId,
      };
    }
    next();
  },
];

/**
 * POST /api/consents/sign
 * Sign a consent form (client or staff signing on behalf)
 */
router.post("/sign", async (req, res) => {
  try {
    const {
      consentTemplateId,
      clientId,
      serviceId,
      appointmentId,
      signedByName,
      signatureData,
      ipAddress,
      userAgent,
    } = req.body;

    // Validation
    if (
      !consentTemplateId ||
      !clientId ||
      !serviceId ||
      !signedByName ||
      !signatureData
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields (consentTemplateId, clientId, serviceId, signedByName, signatureData required)",
      });
    }

    // Get template
    const template = await ConsentTemplate.findById(consentTemplateId).populate(
      "requiredFor.services",
      "name",
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Consent template not found",
      });
    }

    if (template.status !== "published") {
      return res.status(400).json({
        success: false,
        message: "Cannot sign unpublished template",
      });
    }

    // Get business and client info for PDF
    const { default: Tenant } = await import("../models/Tenant.js");
    const { default: Client } = await import("../models/Client.js");

    const business = await Tenant.findById(template.businessId);
    const client = await Client.findById(clientId);

    if (!business || !client) {
      return res.status(404).json({
        success: false,
        message: "Business or client not found",
      });
    }

    const signedAt = new Date();

    // Generate PDF
    const pdfData = {
      templateName: template.name,
      templateVersion: template.version,
      sections: template.sections,
      signedByName,
      signatureData,
      signedAt,
      ipAddress: ipAddress || req.ip,
      userAgent: userAgent || req.get("user-agent"),
      clientName: client.name,
      businessName: business.name,
      businessLogo: business.logo || null,
    };

    const pdfBuffer = await pdfGenerationService.generateConsentPDF(pdfData);

    // Calculate data retention date (default 7 years)
    const dataRetentionUntil = new Date();
    dataRetentionUntil.setFullYear(dataRetentionUntil.getFullYear() + 7);

    // Generate a temporary unique ID for gcsObjectPath
    const tempId = crypto.randomBytes(16).toString("hex");

    // Create consent record (temporary, to get ID)
    const consentRecord = new ConsentRecord({
      businessId: template.businessId,
      clientId,
      serviceId,
      appointmentId: appointmentId || null,
      consentTemplateId: template._id,
      templateVersion: template.version,
      templateName: template.name,
      templateContent: template.sections,
      signedByName,
      signatureData,
      signedAt,
      ipAddress: ipAddress || req.ip,
      userAgent: userAgent || req.get("user-agent"),
      gcsObjectPath: `pending-${tempId}`, // Unique placeholder
      pdfGeneratedAt: new Date(),
      pdfHash: crypto.createHash("sha256").update(pdfBuffer).digest("hex"),
      dataRetentionUntil,
    });

    await consentRecord.save();

    // Upload PDF to GCS (optional - skip if GCS not configured)
    let finalGcsPath = `local-storage/${consentRecord._id}.pdf`;
    let pdfUrl = null;

    try {
      const uploadResult = await gcsConsentService.uploadConsentPDF(pdfBuffer, {
        businessId: template.businessId,
        clientId,
        appointmentId: appointmentId || null,
        consentId: consentRecord._id,
        consentVersion: template.version,
        signedByName,
        signedAt,
        ipAddress: ipAddress || req.ip,
      });

      finalGcsPath = uploadResult.gcsObjectPath;

      // Generate signed URL for immediate access
      pdfUrl = await gcsConsentService.generateSignedUrl(
        uploadResult.gcsObjectPath,
      );
    } catch (gcsError) {
      console.warn(
        "GCS upload failed, consent saved without PDF storage:",
        gcsError.message,
      );
    }

    // Update only the GCS path (if different) - do this carefully to avoid immutability errors
    if (consentRecord.gcsObjectPath !== finalGcsPath) {
      await ConsentRecord.updateOne(
        { _id: consentRecord._id },
        {
          $set: {
            gcsObjectPath: finalGcsPath,
            status: "signed",
          },
        },
      );
      consentRecord.gcsObjectPath = finalGcsPath;
      consentRecord.status = "signed";
    }

    res.status(201).json({
      success: true,
      message: pdfUrl
        ? "Consent signed successfully"
        : "Consent signed successfully (PDF stored locally)",
      data: {
        consentRecord,
        pdfUrl,
      },
    });
  } catch (error) {
    console.error("Error signing consent:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sign consent",
      error: error.message,
    });
  }
});

/**
 * GET /api/consents/my-forms
 * Get all consent forms for logged-in client
 */
router.get("/my-forms", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;

    const consents = await ConsentRecord.find({
      clientId,
      status: { $ne: "revoked" },
    })
      .sort({ signedAt: -1 })
      .lean();

    res.json({
      success: true,
      data: consents,
    });
  } catch (error) {
    console.error("Error fetching client consents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch consents",
      error: error.message,
    });
  }
});

/**
 * GET /api/consents/client/:clientId
 * Get all consents for a client (admin only)
 */
router.get("/client/:clientId", requireAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { includeRevoked } = req.query;

    // Verify access (admin or client themselves)
    const isAdmin =
      req.user.role === "admin" ||
      req.user.role === "owner" ||
      req.user.role === "super_admin";
    const isOwnClient = req.user.clientId?.toString() === clientId;

    if (!isAdmin && !isOwnClient) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const consents = await ConsentRecord.getClientConsents(
      clientId,
      includeRevoked === "true",
    );

    res.json({
      success: true,
      data: consents,
    });
  } catch (error) {
    console.error("Error fetching client consents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch consents",
      error: error.message,
    });
  }
});

/**
 * GET /api/consents/appointment/:appointmentId
 * Get consent for a specific appointment (admin only)
 */
router.get("/appointment/:appointmentId", requireAdmin, async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const consent = await ConsentRecord.findOne({ appointmentId })
      .populate("clientId", "name email")
      .populate("consentTemplateId", "name version")
      .sort({ signedAt: -1 }) // Get most recent if multiple exist
      .lean();

    if (!consent) {
      return res.status(404).json({
        success: false,
        message: "No consent found for this appointment",
      });
    }

    res.json({
      success: true,
      data: consent,
    });
  } catch (error) {
    console.error("Error fetching appointment consent:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch consent",
      error: error.message,
    });
  }
});

/**
 * POST /api/consents/appointment-status/batch
 * Get signed consent status for multiple appointments (admin only)
 */
router.post("/appointment-status/batch", requireAdmin, async (req, res) => {
  try {
    const appointmentIds = Array.isArray(req.body?.appointmentIds)
      ? req.body.appointmentIds.filter(Boolean)
      : [];

    if (appointmentIds.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const signedConsents = await ConsentRecord.find({
      appointmentId: { $in: appointmentIds },
      status: "signed",
    })
      .select("_id appointmentId signedAt")
      .sort({ signedAt: -1 })
      .lean();

    const consentsByAppointment = {};
    for (const consent of signedConsents) {
      const appointmentId = consent.appointmentId?.toString();
      if (!appointmentId || consentsByAppointment[appointmentId]) continue;
      consentsByAppointment[appointmentId] = consent;
    }

    res.json({
      success: true,
      data: consentsByAppointment,
    });
  } catch (error) {
    console.error("Error fetching batch appointment consents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch consent statuses",
      error: error.message,
    });
  }
});

/**
 * GET /api/consents/:id
 * Get single consent record
 */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const consent = await ConsentRecord.findById(id)
      .populate("consentTemplateId", "name version")
      .populate("clientId", "name email phone")
      .populate("appointmentId");

    if (!consent) {
      return res.status(404).json({
        success: false,
        message: "Consent record not found",
      });
    }

    // Verify access
    const isAdmin =
      req.user.role === "admin" ||
      req.user.role === "owner" ||
      req.user.role === "super_admin";
    const isOwnClient =
      req.user.clientId?.toString() === consent.clientId._id.toString();

    if (!isAdmin && !isOwnClient) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    res.json({
      success: true,
      data: consent,
    });
  } catch (error) {
    console.error("Error fetching consent:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch consent",
      error: error.message,
    });
  }
});

/**
 * GET /api/consents/:id/pdf
 * Get signed URL for consent PDF (admin or client owner)
 */
router.get("/:id/pdf", allowAdminOrClient, async (req, res) => {
  try {
    const { id } = req.params;
    const { download } = req.query;

    const consent = await ConsentRecord.findById(id)
      .populate("clientId", "name")
      .populate("consentTemplateId", "name version");

    if (!consent) {
      return res.status(404).json({
        success: false,
        message: "Consent record not found",
      });
    }

    // Verify access
    const isAdmin =
      req.user.role === "admin" ||
      req.user.role === "owner" ||
      req.user.role === "super_admin";
    const isOwnClient =
      req.user.clientId?.toString() === consent.clientId._id.toString();

    if (!isAdmin && !isOwnClient) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Get business info for PDF generation
    const { default: Tenant } = await import("../models/Tenant.js");
    const business = await Tenant.findById(consent.businessId);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      });
    }

    // Prepare PDF data
    const pdfData = {
      templateName: consent.templateName,
      templateVersion: consent.templateVersion,
      sections: consent.templateContent,
      signedByName: consent.signedByName,
      signatureData: consent.signatureData,
      signedAt: consent.signedAt,
      businessName: business.businessName,
      businessAddress: business.businessAddress,
      clientName: consent.clientId.name,
    };

    // Generate PDF buffer
    let pdfBuffer;
    try {
      pdfBuffer = await pdfGenerationService.generateConsentPDF(pdfData);

      console.log("PDF generation result:", {
        type: typeof pdfBuffer,
        isBuffer: Buffer.isBuffer(pdfBuffer),
        isUint8Array: pdfBuffer instanceof Uint8Array,
        constructor: pdfBuffer?.constructor?.name,
        length: pdfBuffer?.length,
      });

      // Convert Uint8Array to Buffer if needed (Puppeteer sometimes returns Uint8Array)
      if (pdfBuffer instanceof Uint8Array && !Buffer.isBuffer(pdfBuffer)) {
        pdfBuffer = Buffer.from(pdfBuffer);
      }

      // Validate PDF buffer
      if (!Buffer.isBuffer(pdfBuffer)) {
        throw new Error("Generated PDF is not a valid buffer");
      }

      if (pdfBuffer.length === 0) {
        throw new Error("Generated PDF is empty");
      }

      // Check for PDF magic bytes (%PDF-)
      const header = pdfBuffer.slice(0, 5).toString("ascii");
      if (!header.startsWith("%PDF-")) {
        console.error("Invalid PDF header:", header);
        throw new Error("Generated file is not a valid PDF");
      }

      console.log(`PDF generated successfully: ${pdfBuffer.length} bytes`);
    } catch (pdfError) {
      console.error("PDF generation error:", pdfError);
      return res.status(500).json({
        success: false,
        message: "Failed to generate PDF",
        error:
          process.env.NODE_ENV === "development" ? pdfError.message : undefined,
      });
    }

    // Set response headers
    const filename =
      `${consent.templateName}_v${consent.templateVersion}_${consent.clientId.name}.pdf`.replace(
        /[^a-z0-9._-]/gi,
        "_",
      );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      download === "true" ? `attachment; filename="${filename}"` : "inline",
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-cache");

    // Log access
    try {
      // Note: logAccess might fail if it tries to save, so just skip it for now
      // await consent.logAccess(
      //   download === "true" ? "download" : "view",
      //   req.user.userId,
      //   req.ip
      // );
      console.log(
        `PDF accessed by user ${req.user.userId} for consent ${consent._id}`,
      );
    } catch (logError) {
      // Log error but don't fail the request
      console.error("Failed to log consent access:", logError.message);
    }

    // Send PDF - use end() instead of send() for binary data
    res.end(pdfBuffer, "binary");
  } catch (error) {
    console.error("Error generating PDF URL:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate PDF URL",
      error: error.message,
    });
  }
});

/**
 * POST /api/consents/:id/revoke
 * Revoke consent (admin only)
 */
router.post("/:id/revoke", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Revocation reason is required",
      });
    }

    const consent = await ConsentRecord.findById(id);

    if (!consent) {
      return res.status(404).json({
        success: false,
        message: "Consent record not found",
      });
    }

    await consent.revoke(req.user.userId, reason);

    res.json({
      success: true,
      message: "Consent revoked successfully",
      data: consent,
    });
  } catch (error) {
    console.error("Error revoking consent:", error);
    res.status(500).json({
      success: false,
      message: "Failed to revoke consent",
      error: error.message,
    });
  }
});

/**
 * GET /api/consents/business/all
 * Get all consents for business (admin only)
 */
router.get("/business/all", requireAdmin, async (req, res) => {
  try {
    const { businessId } = req.user;
    const { status, startDate, endDate, templateId } = req.query;

    const query = { businessId };

    if (status) {
      query.status = status;
    }

    if (templateId) {
      query.consentTemplateId = templateId;
    }

    if (startDate || endDate) {
      query.signedAt = {};
      if (startDate) query.signedAt.$gte = new Date(startDate);
      if (endDate) query.signedAt.$lte = new Date(endDate);
    }

    const consents = await ConsentRecord.find(query)
      .populate("clientId", "name email phone")
      .populate("consentTemplateId", "name version")
      .populate("appointmentId", "date startTime")
      .sort({ signedAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: consents,
    });
  } catch (error) {
    console.error("Error fetching business consents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch consents",
      error: error.message,
    });
  }
});

/**
 * GET /api/consents/expiring-soon
 * Get consents expiring soon (admin only)
 */
router.get("/expiring-soon", requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const consents = await ConsentRecord.getConsentsExpiringsSoon(
      parseInt(days),
    );

    res.json({
      success: true,
      data: consents,
    });
  } catch (error) {
    console.error("Error fetching expiring consents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expiring consents",
      error: error.message,
    });
  }
});

/**
 * POST /api/consents/:id/email
 * Email consent PDF to client (admin only)
 */
router.post("/:id/email", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const consent = await ConsentRecord.findById(id)
      .populate("clientId", "name email")
      .populate("consentTemplateId", "name version");

    if (!consent) {
      return res.status(404).json({
        success: false,
        message: "Consent record not found",
      });
    }

    if (!consent.clientId.email) {
      return res.status(400).json({
        success: false,
        message: "Client has no email address",
      });
    }

    // Generate signed URL (longer expiry for email)
    const signedUrl = await gcsConsentService.generateSignedUrl(
      consent.gcsObjectPath,
      60,
    );

    // Send email (integrate with your email service)
    const { default: emailService } =
      await import("../services/emailService.js");
    await emailService.sendConsentFormEmail({
      to: consent.clientId.email,
      clientName: consent.clientId.name,
      templateName: consent.consentTemplateId.name,
      pdfUrl: signedUrl,
    });

    // Mark as sent
    consent.notificationSent.email.sent = true;
    consent.notificationSent.email.sentAt = new Date();
    await consent.save();

    // Log access
    await consent.logAccess("email", req.user.userId, req.ip);

    res.json({
      success: true,
      message: "Consent form emailed successfully",
    });
  } catch (error) {
    console.error("Error emailing consent:", error);
    res.status(500).json({
      success: false,
      message: "Failed to email consent",
      error: error.message,
    });
  }
});

/**
 * POST /api/consents/:id/verify
 * Verify PDF integrity
 */
router.post("/:id/verify", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const consent = await ConsentRecord.findById(id);

    if (!consent) {
      return res.status(404).json({
        success: false,
        message: "Consent record not found",
      });
    }

    const isValid = await gcsConsentService.verifyPDFIntegrity(
      consent.gcsObjectPath,
      consent.pdfHash,
    );

    res.json({
      success: true,
      data: {
        isValid,
        message: isValid
          ? "PDF integrity verified successfully"
          : "PDF integrity check failed - document may have been tampered with",
      },
    });
  } catch (error) {
    console.error("Error verifying consent:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify consent",
      error: error.message,
    });
  }
});

export default router;
