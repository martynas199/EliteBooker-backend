import { Router } from "express";
import Beautician from "../models/Beautician.js";
import Service from "../models/Service.js";
import Admin from "../models/Admin.js";
import jwt from "jsonwebtoken";
import {
  validateCreateBeautician,
  validateUpdateBeautician,
  listBeauticiansQuerySchema,
  beauticianIdSchema,
} from "../validations/beautician.schema.js";
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
 * GET /api/beauticians
 * List beauticians with optional filters
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

    // TENANT FILTERING: Add tenantId filter if admin is authenticated
    if (req.tenantId) {
      query.tenantId = req.tenantId;
      console.log("[BEAUTICIANS] Adding tenant filter:", req.tenantId);
    }

    if (active && active !== "all") {
      query.active = active === "true";
    }

    // If filtering by service, find beauticians assigned to that service
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
    const total = await Beautician.countDocuments(query);

    const docs = await Beautician.find(query)
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
 * PATCH /api/beauticians/me/working-hours
 * Update working hours for the logged-in beautician
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
        error: "No beautician profile associated with this admin account",
      });
    }

    // Find beautician by beauticianId
    const beautician = await Beautician.findById(admin.beauticianId);
    console.log(
      "[Working Hours] Found beautician:",
      beautician ? beautician._id : "null"
    );

    if (!beautician) {
      return res.status(404).json({ error: "Beautician profile not found" });
    }

    const { workingHours } = req.body;

    // Validate working hours format
    if (!Array.isArray(workingHours)) {
      return res.status(400).json({ error: "workingHours must be an array" });
    }

    // Update working hours
    beautician.workingHours = workingHours;
    await beautician.save();

    console.log("[Working Hours] Successfully updated working hours");
    res.json(beautician);
  } catch (err) {
    console.error("[Working Hours] Error:", err);
    next(err);
  }
});

/**
 * GET /api/beauticians/:id
 * Get single beautician by ID
 */
r.get("/:id", async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = beauticianIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid beautician ID",
        details: idValidation.error.errors,
      });
    }

    const beautician = await Beautician.findById(req.params.id).lean();

    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    // Convert Map to plain object for customSchedule if it exists (only if it's still a Map)
    if (beautician.customSchedule && beautician.customSchedule instanceof Map) {
      beautician.customSchedule = Object.fromEntries(beautician.customSchedule);
    }

    res.json(beautician);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/beauticians
 * Create a new beautician (admin only)
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

    const created = await Beautician.create(beauticianData);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Beautician already exists",
        details: "A beautician with this email may already exist",
      });
    }
    next(err);
  }
});

/**
 * PATCH /api/beauticians/:id
 * Update a beautician (admin only)
 */
r.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = beauticianIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid beautician ID",
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

    const updated = await Beautician.findByIdAndUpdate(
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
 * DELETE /api/beauticians/:id
 * Delete a beautician (admin only)
 * Note: Consider soft-delete (active: false) in production
 * Also consider checking if beautician is assigned to any services
 */
r.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = beauticianIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid beautician ID",
        details: idValidation.error.errors,
      });
    }

    // Check if beautician is assigned to any services
    const servicesWithBeautician = await Service.countDocuments({
      $or: [
        { primaryBeauticianId: req.params.id },
        { additionalBeauticianIds: req.params.id },
      ],
    });

    if (servicesWithBeautician > 0) {
      return res.status(400).json({
        error: "Cannot delete beautician",
        details: `This beautician is assigned to ${servicesWithBeautician} service(s). Please reassign or remove them first.`,
      });
    }

    const deleted = await Beautician.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    res.json({ ok: true, message: "Beautician deleted successfully" });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/beauticians/:id/upload-image
 * Upload profile image for a beautician (admin only)
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
          error: "Invalid beautician ID",
          details: idValidation.error.errors,
        });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Find beautician
      const beautician = await Beautician.findById(req.params.id);
      if (!beautician) {
        deleteLocalFile(req.file.path);
        return res.status(404).json({ error: "Beautician not found" });
      }

      try {
        // Delete old image from Cloudinary if exists
        if (
          beautician.image?.provider === "cloudinary" &&
          beautician.image?.id
        ) {
          try {
            await deleteImage(beautician.image.id);
          } catch (deleteErr) {
            console.error("Error deleting old image:", deleteErr);
            // Continue with upload even if old image deletion fails
          }
        }

        // Upload to Cloudinary
        const result = await uploadImage(req.file.path, "beauticians");

        // Update beautician with new image
        beautician.image = {
          provider: "cloudinary",
          id: result.public_id,
          url: result.secure_url,
          alt: beautician.name,
          width: result.width,
          height: result.height,
        };

        await beautician.save();

        // Clean up temp file
        deleteLocalFile(req.file.path);

        res.json({
          message: "Image uploaded successfully",
          image: beautician.image,
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
 * POST /api/beauticians/:id/stripe/onboard
 * Start Stripe Connect onboarding for a beautician
 * Creates a Stripe Connect account and returns onboarding link
 */
r.post("/:id/stripe/onboard", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const beautician = await Beautician.findById(id);

    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    // Check if beautician belongs to current tenant
    if (
      req.tenant &&
      beautician.tenantId.toString() !== req.tenant._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Access denied to this beautician" });
    }

    // Import Stripe
    const { getStripe } = await import("../payments/stripe.js");
    const stripe = getStripe(); // Use platform account

    let accountId = beautician.stripeAccountId;

    // Create Connect account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: beautician.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: {
          beauticianId: beautician._id.toString(),
          tenantId: beautician.tenantId.toString(),
        },
      });

      beautician.stripeAccountId = account.id;
      beautician.stripeStatus = "pending";
      await beautician.save();

      accountId = account.id;
      console.log(
        `[STRIPE] Created Connect account ${accountId} for beautician ${id}`
      );
    }

    // Generate onboarding link
    const returnUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/admin/beauticians/${id}?stripe=success`;
    const refreshUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/admin/beauticians/${id}?stripe=refresh`;

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
 * GET /api/beauticians/:id/stripe/status
 * Check Stripe Connect account status for a beautician
 */
r.get("/:id/stripe/status", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const beautician = await Beautician.findById(id);

    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    // Check tenant access
    if (
      req.tenant &&
      beautician.tenantId.toString() !== req.tenant._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Access denied to this beautician" });
    }

    if (!beautician.stripeAccountId) {
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
    const account = await stripe.accounts.retrieve(beautician.stripeAccountId);

    const isComplete = account.details_submitted && account.charges_enabled;
    const status = isComplete ? "connected" : "pending";

    // Update local status if changed
    if (beautician.stripeStatus !== status) {
      beautician.stripeStatus = status;
      beautician.stripeOnboardingCompleted = isComplete;
      beautician.stripePayoutsEnabled = account.payouts_enabled || false;
      await beautician.save();
    }

    res.json({
      connected: isComplete,
      status: beautician.stripeStatus,
      accountId: beautician.stripeAccountId,
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
 * POST /api/beauticians/:id/stripe/disconnect
 * Disconnect beautician's Stripe Connect account
 */
r.post("/:id/stripe/disconnect", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const beautician = await Beautician.findById(id);

    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    // Check tenant access
    if (
      req.tenant &&
      beautician.tenantId.toString() !== req.tenant._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Access denied to this beautician" });
    }

    if (!beautician.stripeAccountId) {
      return res
        .status(400)
        .json({ error: "Beautician has no connected Stripe account" });
    }

    // Note: We don't delete the Stripe account (Stripe retains it)
    // We just disconnect it from our platform
    beautician.stripeAccountId = null;
    beautician.stripeStatus = "disconnected";
    beautician.stripeOnboardingCompleted = false;
    beautician.stripePayoutsEnabled = false;
    await beautician.save();

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
