import { Router } from "express";
import Specialist from "../models/Specialist.js";
import Service from "../models/Service.js";
import Admin from "../models/Admin.js";
import jwt from "jsonwebtoken";
import {
  validateCreateSpecialist as validateCreateBeautician,
  validateUpdateSpecialist as validateUpdateBeautician,
  listSpecialistsQuerySchema as listBeauticiansQuerySchema,
  specialistIdSchema as beauticianIdSchema,
} from "../validations/specialist.schema.js";
import requireAdmin from "../middleware/requireAdmin.js";
import optionalAuth from "../middleware/optionalAuth.js";
import { attachTenantToModels } from "../middleware/multiTenantPlugin.js";
import multer from "multer";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import fs from "fs";

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
 * GET /api/specialists
 * List specialists with optional filters
 * Query params: active, serviceId, page, limit
 */
r.get("/", optionalAuth, attachTenantToModels, async (req, res, next) => {
  try {
    // Validate query params
    const queryValidation = listBeauticiansQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: queryValidation.error.errors,
      });
    }

    const { active, serviceId, limit = 20, skip = 0 } = queryValidation.data;

    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageLimit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit) || limit)
    );
    const pageSkip = req.query.page ? (page - 1) * pageLimit : skip;

    // Build query
    const query = {};

    // TENANT FILTERING: REQUIRED - Multi-tenant app must always filter by tenant
    if (!req.tenantId) {
      console.log("[BEAUTICIANS] ERROR: No tenantId found in request");
      return res.status(400).json({
        error: "Tenant context required. Please provide tenant information.",
      });
    }

    query.tenantId = req.tenantId;
    console.log("[BEAUTICIANS] Adding tenant filter:", req.tenantId);

    if (active && active !== "all") {
      query.active = active === "true";
    }

    // If filtering by service, find specialists assigned to that service
    if (serviceId) {
      const service = await Service.findById(serviceId).lean();
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      const beauticianIds = [
        service.primaryBeauticianId,
        ...(service.additionalBeauticianIds || []),
      ].filter(Boolean);

      query._id = { $in: beauticianIds };
    }

    // Get total count for pagination
    const total = await Specialist.countDocuments(query);

    const docs = await Specialist.find(query)
      .limit(pageLimit)
      .skip(pageSkip)
      .sort({ name: 1 })
      .lean();

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
 * PATCH /api/specialists/me/working-hours
 * Update working hours for the logged-in specialist
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

    // Find admin user to get their beauticianId
    const admin = await Admin.findById(userId);
    console.log(
      "[Working Hours] Found admin:",
      admin ? admin._id : "null",
      "beauticianId:",
      admin?.beauticianId
    );

    if (!admin || !admin.beauticianId) {
      return res.status(404).json({
        error: "No specialist profile associated with this admin account",
      });
    }

    // Find specialist by beauticianId
    const specialist = await Specialist.findById(admin.beauticianId);
    console.log(
      "[Working Hours] Found specialist:",
      specialist ? Specialist._id : "null"
    );

    if (!specialist) {
      return res.status(404).json({ error: "Beautician profile not found" });
    }

    const { workingHours } = req.body;

    // Validate working hours format
    if (!Array.isArray(workingHours)) {
      return res.status(400).json({ error: "workingHours must be an array" });
    }

    // Update working hours
    Specialist.workingHours = workingHours;
    await Specialist.save();

    console.log("[Working Hours] Successfully updated working hours");
    res.json(specialist);
  } catch (err) {
    console.error("[Working Hours] Error:", err);
    next(err);
  }
});

/**
 * GET /api/specialists/:id
 * Get single specialist by ID
 */
r.get("/:id", async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = beauticianIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid specialist ID",
        details: idValidation.error.errors,
      });
    }

    const specialist = await Specialist.findById(req.params.id).lean();

    if (!specialist) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    // Convert Map to plain object for customSchedule if it exists (only if it's still a Map)
    if (Specialist.customSchedule && Specialist.customSchedule instanceof Map) {
      Specialist.customSchedule = Object.fromEntries(Specialist.customSchedule);
    }

    res.json(specialist);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/specialists
 * Create a new specialist (admin only)
 */
r.post("/", requireAdmin, async (req, res, next) => {
  try {
    // Validate request body
    const validation = validateCreateBeautician(req.body);
    if (!validation.success) {
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    // Add tenantId from authenticated admin
    const beauticianData = {
      ...validation.data,
      tenantId: req.tenantId || req.admin.tenantId,
    };

    const created = await Specialist.create(beauticianData);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Beautician already exists",
        details: "A specialist with this email may already exist",
      });
    }
    next(err);
  }
});

/**
 * PATCH /api/specialists/:id
 * Update a specialist (admin only)
 */
r.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = beauticianIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid specialist ID",
        details: idValidation.error.errors,
      });
    }

    // Validate request body
    const validation = validateUpdateBeautician(req.body);
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
      return res.status(404).json({ error: "Beautician not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/specialists/:id
 * Delete a specialist (admin only)
 * Note: Consider soft-delete (active: false) in production
 * Also consider checking if specialist is assigned to any services
 */
r.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = beauticianIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid specialist ID",
        details: idValidation.error.errors,
      });
    }

    // Check if specialist is assigned to any services
    const servicesWithBeautician = await Service.countDocuments({
      $or: [
        { primaryBeauticianId: req.params.id },
        { additionalBeauticianIds: req.params.id },
      ],
    });

    if (servicesWithBeautician > 0) {
      return res.status(400).json({
        error: "Cannot delete specialist",
        details: `This specialist is assigned to ${servicesWithBeautician} service(s). Please reassign or remove them first.`,
      });
    }

    const deleted = await Specialist.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    res.json({ ok: true, message: "Beautician deleted successfully" });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/specialists/:id/upload-image
 * Upload profile image for a specialist (admin only)
 */
r.post(
  "/:id/upload-image",
  requireAdmin,
  upload.single("image"),
  async (req, res, next) => {
    try {
      // Validate ID
      const idValidation = beauticianIdSchema.safeParse(req.params);
      if (!idValidation.success) {
        return res.status(400).json({
          error: "Invalid specialist ID",
          details: idValidation.error.errors,
        });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Find specialist
      const specialist = await Specialist.findById(req.params.id);
      if (!specialist) {
        deleteLocalFile(req.file.path);
        return res.status(404).json({ error: "Beautician not found" });
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
        const result = await uploadImage(req.file.path, "specialists");

        // Update specialist with new image
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
 * POST /api/specialists/:id/stripe/onboard
 * Start Stripe Connect onboarding for a specialist
 * Creates a Stripe Connect account and returns onboarding link
 */
r.post("/:id/stripe/onboard", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const specialist = await Specialist.findById(id);

    if (!specialist) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    // Check if specialist belongs to current tenant
    if (
      req.tenant &&
      Specialist.tenantId.toString() !== req.tenant._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Access denied to this specialist" });
    }

    // Import Stripe
    const { getStripe } = await import("../payments/stripe.js");
    const stripe = getStripe(); // Use platform account

    let accountId = Specialist.stripeAccountId;

    // Create Connect account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: Specialist.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: {
          beauticianId: Specialist._id.toString(),
          tenantId: Specialist.tenantId.toString(),
        },
      });

      Specialist.stripeAccountId = account.id;
      Specialist.stripeStatus = "pending";
      await Specialist.save();

      accountId = account.id;
      console.log(
        `[STRIPE] Created Connect account ${accountId} for specialist ${id}`
      );
    }

    // Generate onboarding link
    const returnUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/admin/specialists/${id}?stripe=success`;
    const refreshUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/admin/specialists/${id}?stripe=refresh`;

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
 * GET /api/specialists/:id/stripe/status
 * Check Stripe Connect account status for a specialist
 */
r.get("/:id/stripe/status", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const specialist = await Specialist.findById(id);

    if (!specialist) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    // Check tenant access
    if (
      req.tenant &&
      Specialist.tenantId.toString() !== req.tenant._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Access denied to this specialist" });
    }

    if (!Specialist.stripeAccountId) {
      return res.json({
        connected: false,
        status: "not_connected",
        message: "Beautician has not started Stripe Connect onboarding",
      });
    }

    // Import Stripe
    const { getStripe } = await import("../payments/stripe.js");
    const stripe = getStripe();

    // Fetch account details from Stripe
    const account = await stripe.accounts.retrieve(Specialist.stripeAccountId);

    const isComplete = account.details_submitted && account.charges_enabled;
    const status = isComplete ? "connected" : "pending";

    // Update local status if changed
    if (Specialist.stripeStatus !== status) {
      Specialist.stripeStatus = status;
      Specialist.stripeOnboardingCompleted = isComplete;
      Specialist.stripePayoutsEnabled = account.payouts_enabled || false;
      await Specialist.save();
    }

    res.json({
      connected: isComplete,
      status: Specialist.stripeStatus,
      accountId: Specialist.stripeAccountId,
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
 * POST /api/specialists/:id/stripe/disconnect
 * Disconnect specialist's Stripe Connect account
 */
r.post("/:id/stripe/disconnect", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const specialist = await Specialist.findById(id);

    if (!specialist) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    // Check tenant access
    if (
      req.tenant &&
      Specialist.tenantId.toString() !== req.tenant._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Access denied to this specialist" });
    }

    if (!Specialist.stripeAccountId) {
      return res
        .status(400)
        .json({ error: "Beautician has no connected Stripe account" });
    }

    // Note: We don't delete the Stripe account (Stripe retains it)
    // We just disconnect it from our platform
    Specialist.stripeAccountId = null;
    Specialist.stripeStatus = "disconnected";
    Specialist.stripeOnboardingCompleted = false;
    Specialist.stripePayoutsEnabled = false;
    await Specialist.save();

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
