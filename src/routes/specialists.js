import { Router } from "express";
import mongoose from "mongoose";
import Specialist from "../models/Specialist.js";
import Service from "../models/Service.js";
import Admin from "../models/Admin.js";
import Location from "../models/Location.js";
import Tenant from "../models/Tenant.js";
import jwt from "jsonwebtoken";
import {
  validateCreateSpecialist,
  validateUpdateSpecialist,
  listSpecialistsQuerySchema,
  specialistIdSchema,
} from "../validations/specialist.schema.js";
import requireAdmin from "../middleware/requireAdmin.js";
import optionalAuth from "../middleware/optionalAuth.js";
import { attachTenantToModels } from "../middleware/multiTenantPlugin.js";
import multer from "multer";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import fs from "fs";
import { sendSpecialistCredentialsEmail } from "../emails/mailer.js";

const r = Router();

// Multer setup: Temporary file storage
const upload = multer({ dest: "uploads/" });

// Helper: Delete local file
const deleteLocalFile = (path) => {
  try {
    fs.unlinkSync(path);
  } catch (err) {
    console.error("Error deleting local file:", err);
  }
};

/**
 * GET /api/Specialists
 * List Specialists with optional filters
 * Query params: active, serviceId, page, limit
 */
r.get("/", optionalAuth, attachTenantToModels, async (req, res, next) => {
  try {
    // Validate query params
    const queryValidation = listSpecialistsQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: queryValidation.error.errors,
      });
    }

    const {
      active,
      serviceId,
      limit = 20,
      skip = 0,
      tenantId,
    } = queryValidation.data;

    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageLimit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit) || limit)
    );
    const pageSkip = req.query.page ? (page - 1) * pageLimit : skip;

    // Build query
    const query = {};

    // TENANT FILTERING
    // If tenantId is provided in query params (for super_admin/support viewing other tenants)
    if (tenantId) {
      // Only allow super_admin or support to query other tenants
      if (
        req.admin &&
        (req.admin.role === "super_admin" || req.admin.role === "support")
      ) {
        query.tenantId = new mongoose.Types.ObjectId(tenantId);
        console.log(
          "[SPECIALISTS] Super admin/support querying tenant:",
          tenantId
        );
        console.log("[SPECIALISTS] Logged-in admin tenantId:", req.tenantId);
        console.log(
          "[SPECIALISTS] Query tenantId being used (as ObjectId):",
          query.tenantId
        );
      } else {
        return res.status(403).json({
          error:
            "Access denied. Only super admin or support can query other tenants.",
        });
      }
    } else {
      // Use the tenant from the logged-in admin's context
      if (!req.tenantId) {
        console.log("[SPECIALISTS] ERROR: No tenantId found in request");
        return res.status(400).json({
          error: "Tenant context required. Please provide tenant information.",
        });
      }
      query.tenantId = req.tenantId;
      console.log("[SPECIALISTS] Adding tenant filter:", req.tenantId);
    }

    if (active && active !== "all") {
      query.active = active === "true";
    }

    // If filtering by service, find Specialists assigned to that service
    if (serviceId) {
      const service = await Service.findById(serviceId).lean();
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      const SpecialistIds = [
        service.primarySpecialistId,
        ...(service.additionalSpecialistIds || []),
      ].filter(Boolean);

      query._id = { $in: SpecialistIds };
    }

    console.log("[SPECIALISTS] Final query:", JSON.stringify(query));

    // Prepare query options with tenantId for the multiTenantPlugin
    const queryOptions = {};
    if (
      tenantId &&
      req.admin &&
      (req.admin.role === "super_admin" || req.admin.role === "support")
    ) {
      // Pass tenantId through options to override the plugin's automatic filtering
      queryOptions.tenantId = new mongoose.Types.ObjectId(tenantId);
    }

    // Get total count for pagination
    const total = await Specialist.countDocuments(query).setOptions(
      queryOptions
    );

    const docs = await Specialist.find(query)
      .setOptions(queryOptions)
      .limit(pageLimit)
      .skip(pageSkip)
      .sort({ name: 1 })
      .lean();

    console.log("[SPECIALISTS] Found specialists:", docs.length);
    if (docs.length > 0) {
      console.log("[SPECIALISTS] First specialist:", {
        name: docs[0].name,
        email: docs[0].email,
        tenantId: docs[0].tenantId,
      });
    }

    // Convert Map to plain object for customSchedule (if it's still a Map)
    docs.forEach((doc) => {
      if (doc.customSchedule && doc.customSchedule instanceof Map) {
        doc.customSchedule = Object.fromEntries(doc.customSchedule);
      }
    });

    // Return paginated response if page param is used
    if (req.query.page) {
      res.json({
        data: docs,
        pagination: {
          page,
          limit: pageLimit,
          total,
          totalPages: Math.ceil(total / pageLimit),
          hasMore: page * pageLimit < total,
        },
      });
    } else {
      // Backward compatibility: return array if no page param
      res.json(docs);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/Specialists/me/working-hours
 * Update working hours for the logged-in Specialist
 * Requires authentication but not admin
 */
r.patch("/me/working-hours", async (req, res, next) => {
  try {
    console.log("[Working Hours] Headers:", req.headers.authorization);
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      console.log("[Working Hours] No token found in request");
      return res.status(401).json({ error: "Authentication required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
      console.log("[Working Hours] Decoded token:", decoded);
    } catch (err) {
      console.log("[Working Hours] Token verification failed:", err.message);
      return res.status(401).json({ error: "Invalid token" });
    }

    // Support both admin tokens (id) and user tokens (userId)
    const userId = decoded.userId || decoded.id;
    console.log("[Working Hours] User ID from token:", userId);

    if (!userId) {
      console.log("[Working Hours] No userId in token payload");
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Find admin user to get their SpecialistId
    const admin = await Admin.findById(userId);
    console.log(
      "[Working Hours] Found admin:",
      admin ? admin._id : "null",
      "SpecialistId:",
      admin?.SpecialistId
    );

    if (!admin || !admin.SpecialistId) {
      return res.status(404).json({
        error: "No Specialist profile associated with this admin account",
      });
    }

    // Find Specialist by SpecialistId
    const specialist = await Specialist.findById(admin.SpecialistId);
    console.log(
      "[Working Hours] Found Specialist:",
      specialist ? specialist._id : "null"
    );

    if (!specialist) {
      return res.status(404).json({ error: "Specialist profile not found" });
    }

    const { workingHours } = req.body;

    // Validate working hours format
    if (!Array.isArray(workingHours)) {
      return res.status(400).json({ error: "workingHours must be an array" });
    }

    // Update working hours
    specialist.workingHours = workingHours;
    await specialist.save();

    console.log("[Working Hours] Successfully updated working hours");
    res.json(specialist);
  } catch (err) {
    console.error("[Working Hours] Error:", err);
    next(err);
  }
});

/**
 * GET /api/Specialists/:id
 * Get single Specialist by ID
 */
r.get("/:id", optionalAuth, attachTenantToModels, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = specialistIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid Specialist ID",
        details: idValidation.error.errors,
      });
    }

    const specialist = await Specialist.findById(req.params.id).lean();

    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Convert Map to plain object for customSchedule if it exists (only if it's still a Map)
    if (specialist.customSchedule && specialist.customSchedule instanceof Map) {
      specialist.customSchedule = Object.fromEntries(specialist.customSchedule);
    }

    res.json(specialist);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/Specialists
 * Create a new Specialist (admin only)
 */
r.post("/", requireAdmin, async (req, res, next) => {
  try {
    // Validate request body
    const validation = validateCreateSpecialist(req.body);
    if (!validation.success) {
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    // Add tenantId from authenticated admin
    const SpecialistData = {
      ...validation.data,
      tenantId: req.tenantId || req.admin.tenantId,
    };

    const created = await Specialist.create(SpecialistData);

    // Auto-assign to primary location if no locations specified
    if (!created.locationIds || created.locationIds.length === 0) {
      const primaryLocation = await Location.findOne({
        tenantId: created.tenantId,
        isPrimary: true,
      });

      if (primaryLocation) {
        created.locationIds = [primaryLocation._id];
        created.primaryLocationId = primaryLocation._id;
        await created.save();
        console.log(
          "[Specialist Create] Auto-assigned to primary location:",
          primaryLocation._id
        );
      }
    }

    // Auto-create admin account for the specialist if email is provided
    console.log("[Specialist Create] Checking if admin account needed for:", {
      specialistId: created._id,
      email: created.email,
      hasEmail: !!created.email,
    });

    if (created.email) {
      // Check if admin account already exists for this email
      const existingAdmin = await Admin.findOne({
        email: created.email,
        tenantId: created.tenantId,
      });

      console.log("[Specialist Create] Existing admin check:", {
        email: created.email,
        existingAdminId: existingAdmin?._id,
        exists: !!existingAdmin,
      });

      if (!existingAdmin) {
        // Generate a temporary password (specialist should change it)
        const tempPassword = Math.random().toString(36).slice(-12) + "@Temp1";

        const specialistAdmin = new Admin({
          name: created.name,
          email: created.email,
          password: tempPassword, // Will be hashed by pre-save hook
          role: "specialist", // Limited admin role for specialists
          tenantId: created.tenantId,
          specialistId: created._id, // Link admin to specialist for role-based filtering
          active: true,
        });

        await specialistAdmin.save();

        // Link the admin account to the specialist
        created.adminId = specialistAdmin._id;
        await created.save();

        console.log(
          "[Specialist Create] Auto-created admin account for specialist:",
          {
            specialistId: created._id,
            adminId: specialistAdmin._id,
            email: created.email,
            tempPassword, // Log for initial setup (remove in production)
          }
        );

        // Send credentials email to specialist
        try {
          const tenant = await Tenant.findById(created.tenantId);
          await sendSpecialistCredentialsEmail({
            specialistName: created.name,
            email: created.email,
            tempPassword,
            tenantName: tenant?.name || tenant?.businessName,
          });
          console.log(
            "[Specialist Create] Credentials email sent to:",
            created.email
          );
        } catch (emailError) {
          console.error(
            "[Specialist Create] Failed to send credentials email:",
            emailError
          );
          // Don't fail the request if email fails
        }
      }
    }

    res.status(201).json(created);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Specialist already exists",
        details: "A Specialist with this email may already exist",
      });
    }
    next(err);
  }
});

/**
 * PATCH /api/Specialists/:id
 * Update a Specialist (admin only)
 */
r.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = specialistIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid Specialist ID",
        details: idValidation.error.errors,
      });
    }

    // Validate request body
    const validation = validateUpdateSpecialist(req.body);
    if (!validation.success) {
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    const updated = await Specialist.findByIdAndUpdate(
      req.params.id,
      { $set: validation.data },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/Specialists/:id
 * Delete a Specialist (admin only)
 * Note: Consider soft-delete (active: false) in production
 * Also consider checking if Specialist is assigned to any services
 */
r.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = specialistIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid Specialist ID",
        details: idValidation.error.errors,
      });
    }

    // Check if Specialist is assigned to any services
    const servicesWithSpecialist = await Service.countDocuments({
      $or: [
        { primarySpecialistId: req.params.id },
        { additionalSpecialistIds: req.params.id },
      ],
    });

    if (servicesWithSpecialist > 0) {
      return res.status(400).json({
        error: "Cannot delete Specialist",
        details: `This Specialist is assigned to ${servicesWithSpecialist} service(s). Please reassign or remove them first.`,
      });
    }

    const deleted = await Specialist.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Delete associated admin account if it exists
    if (deleted.adminId) {
      try {
        const deletedAdmin = await Admin.findByIdAndDelete(deleted.adminId);
        if (deletedAdmin) {
          console.log(`[Specialist Delete] Associated admin account deleted:`, {
            specialistId: deleted._id,
            adminId: deleted.adminId,
            email: deletedAdmin.email,
          });
        }
      } catch (adminDeleteError) {
        console.error(
          "[Specialist Delete] Failed to delete associated admin account:",
          adminDeleteError
        );
        // Don't fail the request if admin deletion fails
      }
    } else if (deleted.email) {
      // Also try to delete admin by email if adminId field doesn't exist
      try {
        const adminByEmail = await Admin.findOne({
          email: deleted.email,
          tenantId: deleted.tenantId,
        });
        if (adminByEmail) {
          await Admin.findByIdAndDelete(adminByEmail._id);
          console.log(
            `[Specialist Delete] Associated admin account deleted by email:`,
            {
              specialistId: deleted._id,
              adminId: adminByEmail._id,
              email: adminByEmail.email,
            }
          );
        }
      } catch (adminDeleteError) {
        console.error(
          "[Specialist Delete] Failed to delete admin by email:",
          adminDeleteError
        );
      }
    }

    res.json({ ok: true, message: "Specialist deleted successfully" });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/Specialists/:id/upload-image
 * Upload profile image for a Specialist (admin only)
 */
r.post(
  "/:id/upload-image",
  requireAdmin,
  upload.single("image"),
  async (req, res, next) => {
    try {
      // Validate ID
      const idValidation = specialistIdSchema.safeParse(req.params);
      if (!idValidation.success) {
        return res.status(400).json({
          error: "Invalid Specialist ID",
          details: idValidation.error.errors,
        });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Find Specialist
      const specialist = await Specialist.findById(req.params.id);
      if (!specialist) {
        deleteLocalFile(req.file.path);
        return res.status(404).json({ error: "Specialist not found" });
      }

      try {
        // Delete old image from Cloudinary if exists
        if (
          specialist.image?.provider === "cloudinary" &&
          specialist.image?.id
        ) {
          try {
            await deleteImage(specialist.image.id);
          } catch (deleteErr) {
            console.error("Error deleting old image:", deleteErr);
            // Continue with upload even if old image deletion fails
          }
        }

        // Upload to Cloudinary
        const result = await uploadImage(req.file.path, "Specialists");

        // Update Specialist with new image
        specialist.image = {
          provider: "cloudinary",
          id: result.public_id,
          url: result.secure_url,
          alt: specialist.name,
          width: result.width,
          height: result.height,
        };

        await specialist.save();

        // Clean up temp file
        deleteLocalFile(req.file.path);

        res.json({
          message: "Image uploaded successfully",
          image: specialist.image,
        });
      } catch (uploadErr) {
        // Clean up temp file on error
        deleteLocalFile(req.file.path);
        throw uploadErr;
      }
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/Specialists/:id/stripe/onboard
 * Start Stripe Connect onboarding for a Specialist
 * Creates a Stripe Connect account and returns onboarding link
 */
r.post("/:id/stripe/onboard", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const specialist = await Specialist.findById(id);

    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Check if Specialist belongs to current tenant
    if (
      req.tenant &&
      specialist.tenantId.toString() !== req.tenant._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Access denied to this Specialist" });
    }

    // Import Stripe
    const { getStripe } = await import("../payments/stripe.js");
    const stripe = getStripe(); // Use platform account

    let accountId = specialist.stripeAccountId;

    // Create Connect account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: specialist.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: {
          SpecialistId: specialist._id.toString(),
          tenantId: specialist.tenantId.toString(),
        },
      });

      specialist.stripeAccountId = account.id;
      specialist.stripeStatus = "pending";
      await specialist.save();

      accountId = account.id;
      console.log(
        `[STRIPE] Created Connect account ${accountId} for Specialist ${id}`
      );
    }

    // Generate onboarding link
    const returnUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/admin/Specialists/${id}?stripe=success`;
    const refreshUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/admin/Specialists/${id}?stripe=refresh`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    res.json({
      url: accountLink.url,
      accountId,
      expiresAt: accountLink.expires_at,
    });
  } catch (err) {
    console.error("[STRIPE] Onboarding error:", err);
    next(err);
  }
});

/**
 * GET /api/Specialists/:id/schedule
 * Get specialist's working hours/schedule
 */
r.get("/:id/schedule", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;

    // Build query to support cross-tenant access for super_admin/support
    let queryTenantId = req.tenantId;
    if (tenantId) {
      if (
        req.admin &&
        (req.admin.role === "super_admin" || req.admin.role === "support")
      ) {
        queryTenantId = new mongoose.Types.ObjectId(tenantId);
      } else {
        return res.status(403).json({
          error:
            "Access denied. Only super admin or support can query other tenants.",
        });
      }
    }

    const specialist = await Specialist.findById(id)
      .setOptions({ tenantId: queryTenantId })
      .lean();

    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Return working hours data
    res.json({
      workingHours: specialist.workingHours || [],
      customSchedule: specialist.customSchedule || {},
    });
  } catch (err) {
    console.error("[SCHEDULE] Error fetching schedule:", err);
    next(err);
  }
});

/**
 * GET /api/Specialists/:id/stripe/status
 * Check Stripe Connect account status for a Specialist
 */
r.get("/:id/stripe/status", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const specialist = await Specialist.findById(id);

    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Check tenant access
    if (
      req.tenant &&
      specialist.tenantId.toString() !== req.tenant._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Access denied to this Specialist" });
    }

    if (!specialist.stripeAccountId) {
      return res.json({
        connected: false,
        status: "not_connected",
        message: "Specialist has not started Stripe Connect onboarding",
      });
    }

    // Import Stripe
    const { getStripe } = await import("../payments/stripe.js");
    const stripe = getStripe();

    // Fetch account details from Stripe
    const account = await stripe.accounts.retrieve(specialist.stripeAccountId);

    const isComplete = account.details_submitted && account.charges_enabled;
    const status = isComplete ? "connected" : "pending";

    // Update local status if changed
    if (specialist.stripeStatus !== status) {
      specialist.stripeStatus = status;
      specialist.stripeOnboardingCompleted = isComplete;
      specialist.stripePayoutsEnabled = account.payouts_enabled || false;
      await specialist.save();
    }

    res.json({
      connected: isComplete,
      status: specialist.stripeStatus,
      accountId: specialist.stripeAccountId,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements,
    });
  } catch (err) {
    console.error("[STRIPE] Status check error:", err);
    next(err);
  }
});

/**
 * POST /api/Specialists/:id/stripe/disconnect
 * Disconnect Specialist's Stripe Connect account
 */
r.post("/:id/stripe/disconnect", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const specialist = await Specialist.findById(id);

    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Check tenant access
    if (
      req.tenant &&
      specialist.tenantId.toString() !== req.tenant._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Access denied to this Specialist" });
    }

    if (!specialist.stripeAccountId) {
      return res
        .status(400)
        .json({ error: "Specialist has no connected Stripe account" });
    }

    // Note: We don't delete the Stripe account (Stripe retains it)
    // We just disconnect it from our platform
    specialist.stripeAccountId = null;
    specialist.stripeStatus = "disconnected";
    specialist.stripeOnboardingCompleted = false;
    specialist.stripePayoutsEnabled = false;
    await specialist.save();

    res.json({
      message: "Stripe account disconnected successfully",
      status: "disconnected",
    });
  } catch (err) {
    console.error("[STRIPE] Disconnect error:", err);
    next(err);
  }
});

export default r;
