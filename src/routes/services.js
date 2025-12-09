import { Router } from "express";
import Service from "../models/Service.js";
import {
  validateCreateService,
  validateUpdateService,
  listServicesQuerySchema,
  serviceIdSchema,
} from "../validations/service.schema.js";
import requireAdmin from "../middleware/requireAdmin.js";
import optionalAuth from "../middleware/optionalAuth.js";
import checkServicePermission from "../middleware/checkServicePermission.js";
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
 * GET /api/services
 * List services with optional filters
 * Query params: active, category, specialistId, page, limit
 *
 * ROLE-BASED ACCESS:
 * - Public/Guest: Returns all active services
 * - BEAUTICIAN (admin): Returns only services assigned to them
 * - SUPER_ADMIN: Returns all services
 *
 * Uses optionalAuth middleware for optimized authentication check
 */
r.get("/", optionalAuth, attachTenantToModels, async (req, res, next) => {
  try {
    console.log("[SERVICES] Request context:", {
      hasAdmin: !!req.admin,
      adminEmail: req.admin?.email,
      tenantId: req.tenantId,
      isSuperAdmin: req.isSuperAdmin,
    });

    // Validate query params
    const queryValidation = listServicesQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: queryValidation.error.errors,
      });
    }

    const {
      active,
      category,
      specialistId,
      limit = 20,
      skip = 0,
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

    console.log("[SERVICES] Cookies:", {
      accessToken: req.cookies.accessToken ? "EXISTS" : "MISSING",
      refreshToken: req.cookies.refreshToken ? "EXISTS" : "MISSING",
      cookieKeys: Object.keys(req.cookies),
    });

    // TENANT FILTERING: REQUIRED - Multi-tenant app must always filter by tenant
    if (!req.tenantId) {
      console.log("[SERVICES] ERROR: No tenantId found in request");
      return res.status(400).json({
        error: "Tenant context required. Please provide tenant information.",
      });
    }

    query.tenantId = req.tenantId;
    console.log("[SERVICES] Adding tenant filter:", req.tenantId);

    if (active && active !== "all") {
      query.active = active === "true";
    }
    if (category) {
      query.category = category;
    }
    if (specialistId) {
      console.log(`[SERVICES] Filtering by specialistId: ${specialistId}`);
      // Check all possible specialist fields (including legacy fields)
      query.$or = [
        { primaryBeauticianId: specialistId },
        { additionalBeauticianIds: specialistId },
        { specialistId: specialistId }, // Legacy single specialist field
        { beauticianIds: specialistId }, // Legacy specialists array
      ];
    }

    // ROLE-BASED FILTERING: Apply access control if authenticated
    // req.admin is set by optionalAuth middleware if token is valid
    if (req.admin) {
      // BEAUTICIAN role: Only see services assigned to their specialistId
      if (req.admin.role === "admin" && req.admin.specialistId) {
        console.log(
          `[SERVICES] Filtering for BEAUTICIAN admin: ${req.admin.specialistId}`
        );
        // Override any existing $or filter to enforce role-based access
        query.$or = [
          { primaryBeauticianId: req.admin.specialistId },
          { additionalBeauticianIds: req.admin.specialistId },
          { specialistId: req.admin.specialistId }, // Legacy field
          { beauticianIds: req.admin.specialistId }, // Legacy field
        ];
      }
      // SUPER_ADMIN: See all services (no additional filter needed)
      else if (req.admin.role === "super_admin") {
        console.log("[SERVICES] SUPER_ADMIN: Showing all services");
      }
    }

    console.log("[SERVICES] Final query:", JSON.stringify(query, null, 2));

    // Get total count for pagination (uses indexed fields)
    const total = await Service.countDocuments(query);

    const docs = await Service.find(query)
      .populate({ path: "primaryBeauticianId", select: "name email" })
      .populate({ path: "additionalBeauticianIds", select: "name email" })
      .limit(pageLimit)
      .skip(pageSkip)
      .sort({ name: 1 })
      .lean();

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
 * GET /api/services/:id
 * Get single service by ID
 */
r.get("/:id", async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = serviceIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid service ID",
        details: idValidation.error.errors,
      });
    }

    const service = await Service.findById(req.params.id)
      .populate({ path: "primaryBeauticianId", select: "name email" })
      .populate({ path: "additionalBeauticianIds", select: "name email" })
      .lean();

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json(service);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/services
 * Create a new service
 * - SUPER_ADMIN: Can create services for any specialist
 * - BEAUTICIAN: Can only create services for themselves
 */
r.post("/", requireAdmin, async (req, res, next) => {
  try {
    console.log("[SERVICE CREATE] Request received");
    console.log("[SERVICE CREATE] Admin:", {
      role: req.admin?.role,
      specialistId: req.admin?.specialistId,
    });
    console.log(
      "[SERVICE CREATE] Request body:",
      JSON.stringify(req.body, null, 2)
    );

    // Validate request body
    const validation = validateCreateService(req.body);
    if (!validation.success) {
      console.log("[SERVICE CREATE] Validation failed:", validation.errors);
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    console.log(
      "[SERVICE CREATE] Validation passed. Data:",
      JSON.stringify(validation.data, null, 2)
    );

    // BEAUTICIAN role: Can only create services for themselves
    if (req.admin.role === "admin" && req.admin.specialistId) {
      console.log("[SERVICE CREATE] Checking specialist permissions...");
      // Ensure the specialist is creating a service for themselves
      if (
        validation.data.primaryBeauticianId !==
        req.admin.specialistId.toString()
      ) {
        console.log("[SERVICE CREATE] Permission denied: specialist mismatch");
        return res.status(403).json({
          error: "Access denied",
          message: "You can only create services for yourself.",
        });
      }
      console.log("[SERVICE CREATE] Specialist permissions OK");
    }

    // Add tenantId from authenticated admin
    const serviceData = {
      ...validation.data,
      tenantId: req.tenantId || req.admin.tenantId,
    };

    console.log("[SERVICE CREATE] Creating service in database...");
    const created = await Service.create(serviceData);
    console.log("[SERVICE CREATE] Service created with ID:", created._id);

    console.log("[SERVICE CREATE] Populating service data...");
    const populated = await Service.findById(created._id)
      .populate({ path: "primaryBeauticianId", select: "name email" })
      .populate({ path: "additionalBeauticianIds", select: "name email" })
      .lean();

    console.log(
      "[SERVICE CREATE] ✓ Success! Returning service:",
      populated._id
    );
    res.status(201).json(populated);
  } catch (err) {
    console.error("[SERVICE CREATE] ✗ Error:", err);
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Service already exists",
        details: "A service with this name may already exist",
      });
    }
    next(err);
  }
});

/**
 * PATCH /api/services/:id
 * Update a service (admin with permission)
 */
r.patch(
  "/:id",
  requireAdmin,
  checkServicePermission("edit"),
  async (req, res, next) => {
    try {
      // Validate ID
      const idValidation = serviceIdSchema.safeParse(req.params);
      if (!idValidation.success) {
        return res.status(400).json({
          error: "Invalid service ID",
          details: idValidation.error.errors,
        });
      }

      // Validate request body
      const validation = validateUpdateService(req.body);
      if (!validation.success) {
        const errorMessages = validation.errors
          .map((e) => e.message)
          .join(", ");
        return res.status(400).json({
          error: errorMessages || "Validation failed",
          details: validation.errors,
        });
      }

      const updated = await Service.findByIdAndUpdate(
        req.params.id,
        { $set: validation.data },
        { new: true, runValidators: true }
      )
        .populate({ path: "primaryBeauticianId", select: "name email" })
        .populate({ path: "additionalBeauticianIds", select: "name email" })
        .lean();

      if (!updated) {
        return res.status(404).json({ error: "Service not found" });
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/services/:id
 * Delete a service (super_admin only)
 * Note: Consider soft-delete (active: false) in production
 */
r.delete(
  "/:id",
  requireAdmin,
  checkServicePermission("delete"),
  async (req, res, next) => {
    try {
      // Validate ID
      const idValidation = serviceIdSchema.safeParse(req.params);
      if (!idValidation.success) {
        return res.status(400).json({
          error: "Invalid service ID",
          details: idValidation.error.errors,
        });
      }

      const deleted = await Service.findByIdAndDelete(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: "Service not found" });
      }

      res.json({ ok: true, message: "Service deleted successfully" });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/services/:id/upload-image
 * Upload main service image to Cloudinary (admin with permission)
 */
r.post(
  "/:id/upload-image",
  requireAdmin,
  checkServicePermission("edit"),
  upload.single("image"),
  async (req, res, next) => {
    try {
      // Validate ID
      const idValidation = serviceIdSchema.safeParse(req.params);
      if (!idValidation.success) {
        return res.status(400).json({
          error: "Invalid service ID",
          details: idValidation.error.errors,
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Find service
      const service = await Service.findById(req.params.id);
      if (!service) {
        deleteLocalFile(req.file.path);
        return res.status(404).json({ error: "Service not found" });
      }

      try {
        // Upload new image to Cloudinary
        const result = await uploadImage(
          req.file.path,
          "beauty-salon/services"
        );

        // Delete old image from Cloudinary if exists
        if (service.image?.provider === "cloudinary" && service.image?.id) {
          try {
            await deleteImage(service.image.id);
          } catch (err) {
            console.error("Failed to delete old image from Cloudinary:", err);
          }
        }

        // Update service with new image
        service.image = {
          provider: "cloudinary",
          id: result.public_id,
          url: result.secure_url,
          alt: service.name,
          width: result.width,
          height: result.height,
        };
        await service.save();

        // Clean up local file
        deleteLocalFile(req.file.path);

        res.json({
          ok: true,
          message: "Image uploaded successfully",
          image: service.image,
        });
      } catch (err) {
        deleteLocalFile(req.file.path);
        throw err;
      }
    } catch (err) {
      if (req.file) deleteLocalFile(req.file.path);
      next(err);
    }
  }
);

/**
 * POST /api/services/:id/upload-gallery
 * Upload gallery images to Cloudinary (admin with permission)
 */
r.post(
  "/:id/upload-gallery",
  requireAdmin,
  checkServicePermission("edit"),
  upload.array("images", 10),
  async (req, res, next) => {
    try {
      // Validate ID
      const idValidation = serviceIdSchema.safeParse(req.params);
      if (!idValidation.success) {
        return res.status(400).json({
          error: "Invalid service ID",
          details: idValidation.error.errors,
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No image files provided" });
      }

      // Find service
      const service = await Service.findById(req.params.id);
      if (!service) {
        req.files.forEach((file) => deleteLocalFile(file.path));
        return res.status(404).json({ error: "Service not found" });
      }

      try {
        const uploadedImages = [];

        // Upload each image
        for (const file of req.files) {
          try {
            const result = await uploadImage(
              file.path,
              "beauty-salon/services/gallery"
            );
            uploadedImages.push({
              provider: "cloudinary",
              id: result.public_id,
              url: result.secure_url,
              alt: service.name,
              width: result.width,
              height: result.height,
            });
            deleteLocalFile(file.path);
          } catch (err) {
            console.error("Failed to upload gallery image:", err);
            deleteLocalFile(file.path);
          }
        }

        // Add to service gallery
        if (!service.gallery) service.gallery = [];
        service.gallery.push(...uploadedImages);
        await service.save();

        res.json({
          ok: true,
          message: `${uploadedImages.length} image(s) uploaded successfully`,
          gallery: service.gallery,
        });
      } catch (err) {
        req.files.forEach((file) => deleteLocalFile(file.path));
        throw err;
      }
    } catch (err) {
      if (req.files) {
        req.files.forEach((file) => deleteLocalFile(file.path));
      }
      next(err);
    }
  }
);

export default r;
