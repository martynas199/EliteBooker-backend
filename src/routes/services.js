import { Router } from "express";
import mongoose from "mongoose";
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
import {
  applyQueryOptimizations,
  executePaginatedQuery,
  populateProjections,
  MAX_LIMIT,
} from "../utils/queryHelpers.js";
import multer from "multer";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import fs from "fs";
import OpenAI from "openai";
import { createConsoleLogger } from "../utils/logger.js";

const r = Router();
const LOG_VERBOSE = process.env.LOG_VERBOSE === "true";
const console = createConsoleLogger({
  scope: "services",
  verbose: LOG_VERBOSE,
});

// Initialize OpenAI (only if API key is set)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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
    if (LOG_VERBOSE) {
      console.log("[SERVICES] Request context:", {
        hasAdmin: !!req.admin,
        adminEmail: req.admin?.email,
        tenantId: req.tenantId,
        isSuperAdmin: req.isSuperAdmin,
      });
    }

    // Validate query params
    const queryValidation = listServicesQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: queryValidation.error.errors,
      });
    }

    const { active, category, specialistId, tenantId } = queryValidation.data;

    // Build query
    const query = {};

    // TENANT FILTERING
    let queryTenantId;
    if (tenantId) {
      // Only allow super_admin or support to query other tenants
      if (
        req.admin &&
        (req.admin.role === "super_admin" || req.admin.role === "support")
      ) {
        queryTenantId = new mongoose.Types.ObjectId(tenantId);
        query.tenantId = queryTenantId;
        if (LOG_VERBOSE) {
          console.log(
            "[SERVICES] Super admin/support querying tenant:",
            tenantId,
          );
        }
      } else {
        return res.status(403).json({
          error:
            "Access denied. Only super admin or support can query other tenants.",
        });
      }
    } else {
      if (!req.tenantId) {
        console.error("[SERVICES] No tenantId found in request");
        return res.status(400).json({
          error: "Tenant context required. Please provide tenant information.",
        });
      }
      queryTenantId = req.tenantId;
      query.tenantId = req.tenantId;
    }

    if (active && active !== "all") {
      query.active = active === "true";
    }
    if (category) {
      query.category = category;
    }
    if (specialistId) {
      if (LOG_VERBOSE) {
        console.log(`[SERVICES] Filtering by specialistId: ${specialistId}`);
      }
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
      // SPECIALIST role: Only see services assigned to them
      if (req.admin.role === "specialist" && req.admin.specialistId) {
        if (LOG_VERBOSE) {
          console.log(
            `[SERVICES] Filtering for SPECIALIST: ${req.admin.specialistId}`,
          );
        }
        // Override any existing $or filter to enforce role-based access
        query.$or = [
          { primaryBeauticianId: req.admin.specialistId },
          { additionalBeauticianIds: req.admin.specialistId },
          { specialistId: req.admin.specialistId }, // Legacy field
          { beauticianIds: req.admin.specialistId }, // Legacy field
        ];
      }
      // BEAUTICIAN role (legacy): Only see services assigned to their specialistId
      else if (req.admin.role === "admin" && req.admin.specialistId) {
        if (LOG_VERBOSE) {
          console.log(
            `[SERVICES] Filtering for BEAUTICIAN admin: ${req.admin.specialistId}`,
          );
        }
        // Override any existing $or filter to enforce role-based access
        query.$or = [
          { primaryBeauticianId: req.admin.specialistId },
          { additionalBeauticianIds: req.admin.specialistId },
          { specialistId: req.admin.specialistId }, // Legacy field
          { beauticianIds: req.admin.specialistId }, // Legacy field
        ];
      }
    }

    if (LOG_VERBOSE) {
      console.log("[SERVICES] Final query:", JSON.stringify(query, null, 2));
    }

    // Prepare query options for multiTenantPlugin
    const queryOptions = {};
    if (
      tenantId &&
      req.admin &&
      (req.admin.role === "super_admin" || req.admin.role === "support")
    ) {
      queryOptions.tenantId = queryTenantId;
    }

    // Build optimized query with lean and projections
    let serviceQuery = Service.find(query)
      .setOptions(queryOptions)
      .populate({
        path: "primaryBeauticianId",
        select: populateProjections.specialist,
      })
      .populate({
        path: "additionalBeauticianIds",
        select: populateProjections.specialist,
      })
      .lean();

    // Apply pagination and optimizations
    serviceQuery = applyQueryOptimizations(serviceQuery, req.query, {
      defaultSort: "name",
      maxLimit: MAX_LIMIT,
      lean: false, // Already applied .lean() above
    });

    // Return paginated response if page param is used
    if (req.query.page) {
      const cacheKey = `services:${JSON.stringify(query)}`;
      const result = await executePaginatedQuery(
        serviceQuery,
        Service,
        query,
        req.query,
        { useCache: true, cacheKey, tenantId: req.tenantId },
      );
      res.json(result);
    } else {
      // Backward compatibility: return array if no page param
      const docs = await serviceQuery;
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
      .populate({
        path: "primaryBeauticianId",
        select: populateProjections.specialist,
      })
      .populate({
        path: "additionalBeauticianIds",
        select: populateProjections.specialist,
      })
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
      JSON.stringify(req.body, null, 2),
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
      JSON.stringify(validation.data, null, 2),
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
      .populate({
        path: "primaryBeauticianId",
        select: "name email stripeStatus subscription",
      })
      .populate({
        path: "additionalBeauticianIds",
        select: "name email stripeStatus subscription",
      })
      .lean();

    console.log(
      "[SERVICE CREATE] ✓ Success! Returning service:",
      populated._id,
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
        { new: true, runValidators: true },
      )
        .populate({
          path: "primaryBeauticianId",
          select: "name email stripeStatus subscription",
        })
        .populate({
          path: "additionalBeauticianIds",
          select: "name email stripeStatus subscription",
        })
        .lean();

      if (!updated) {
        return res.status(404).json({ error: "Service not found" });
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
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
  },
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
          "beauty-salon/services",
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
  },
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
              "beauty-salon/services/gallery",
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
  },
);

/**
 * POST /api/services/generate-description
 * Generate AI service description
 * Access: Private (Admin only)
 */
r.post(
  "/generate-description",
  requireAdmin,
  attachTenantToModels,
  async (req, res, next) => {
    try {
      const {
        serviceTitle,
        businessType,
        country = "UK",
        serviceDuration,
        serviceCategory,
      } = req.body;

      // Validation
      if (!serviceTitle || serviceTitle.trim().length <= 3) {
        return res.status(400).json({
          success: false,
          message: "Service title must be at least 4 characters long",
        });
      }

      // Check if OpenAI is configured
      if (!openai) {
        return res.status(503).json({
          success: false,
          message:
            "AI service not configured. Please enter description manually.",
          error: "openai_not_configured",
        });
      }

      // Build context string for the prompt
      let contextString = `Service: ${serviceTitle}`;
      if (businessType) contextString += `\nBusiness Type: ${businessType}`;
      if (serviceCategory) contextString += `\nCategory: ${serviceCategory}`;
      if (serviceDuration)
        contextString += `\nDuration: ${serviceDuration} minutes`;
      if (country) contextString += `\nCountry: ${country}`;

      // Safety-focused system prompt
      const systemPrompt = `You are a professional service description writer for a booking platform used by beauty salons, wellness centers, and clinics.

Your task is to write SAFE, NEUTRAL, CLIENT-FACING service descriptions.

## CRITICAL SAFETY RULES (MUST FOLLOW):
1. NO medical claims or health guarantees
2. NO promises of specific outcomes or results
3. NO diagnosis or treatment advice
4. NO words like "best", "guaranteed", "permanent", "cure", "treat"
5. NO regulatory or certification claims unless explicitly stated
6. Use SAFE phrases: "designed to", "commonly used for", "may help improve", "suitable for"

## Writing Style:
- Professional and informative tone
- Simple, clear English (readable by general public)
- 2-4 short paragraphs OR bullet-friendly format
- Client-facing language (avoid technical jargon)
- Similar tone to Fresha, Treatwell, Booksy

## What to INCLUDE:
- What the service involves
- General purpose/use case
- What clients can typically expect (process, not results)
- Duration context (if provided)
- Mention consultation if relevant

## What to EXCLUDE:
- Emojis
- Markdown formatting (plain text only)
- Medical terminology or diagnoses
- Pricing information
- Specific contraindications (unless very general)
- Marketing hype or exaggeration

## Output Format:
Return ONLY the description text. No title, no extra commentary.`;

      const userPrompt = `Generate a professional service description for:

${contextString}

Write 2-4 short paragraphs that:
1. EXPLAIN what this service actually is (the technique, procedure, or treatment involved)
2. Describe what happens during the appointment
3. Mention what clients can typically expect from the experience
4. Include any relevant preparation or aftercare notes if applicable

Be specific and educational. Don't just repeat the service name - actually explain what it involves. Keep it safe, neutral, and informative. No medical claims or guarantees.`;

      console.log("🤖 Generating AI description for:", serviceTitle);
      console.log("\n📋 SYSTEM PROMPT:");
      console.log(systemPrompt);
      console.log("\n📝 USER PROMPT:");
      console.log(userPrompt);
      console.log("\n🔄 Making OpenAI API call...\n");

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 300,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      });

      const generatedDescription = completion.choices[0].message.content.trim();

      // Additional safety check: scan for forbidden words
      const forbiddenWords = [
        "guaranteed",
        "guarantee",
        "cure",
        "cures",
        "treat disease",
        "medical condition",
        "diagnose",
        "prescription",
        "FDA approved",
        "clinically proven",
      ];

      const lowerDescription = generatedDescription.toLowerCase();
      const foundForbiddenWords = forbiddenWords.filter((word) =>
        lowerDescription.includes(word.toLowerCase()),
      );

      if (foundForbiddenWords.length > 0) {
        console.warn(
          "⚠️ Generated description contains forbidden words:",
          foundForbiddenWords,
        );
        console.log("🔄 Retrying with stricter instructions...");

        // Retry with stricter prompt
        const retryPrompt = `${userPrompt}

CRITICAL: Your previous response contained forbidden words (${foundForbiddenWords.join(
          ", ",
        )}). 
DO NOT use these words or make any permanent/guaranteed claims. 
Focus on describing the process and experience, NOT the results or duration of effects.
For PMU/cosmetic procedures, describe the technique and what happens during the appointment without claiming permanence.`;

        const retryCompletion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: retryPrompt },
          ],
          temperature: 0.5,
          max_tokens: 300,
        });

        const retryDescription =
          retryCompletion.choices[0].message.content.trim();

        // Check again
        const retryLower = retryDescription.toLowerCase();
        const stillForbidden = forbiddenWords.filter((word) =>
          retryLower.includes(word.toLowerCase()),
        );

        if (stillForbidden.length > 0) {
          console.warn(
            "⚠️ Retry still contains forbidden words. Using fallback.",
          );
          return res.status(200).json({
            success: true,
            data: {
              description: `This service provides ${serviceTitle.toLowerCase()}. A consultation is recommended to ensure this service is suitable for your needs. Please contact us for more information about what to expect during your appointment.`,
              source: "fallback",
              warning:
                "AI-generated description contained restricted terms. Using safe fallback.",
            },
          });
        }

        console.log("✅ Retry successful - clean description generated");
        return res.status(200).json({
          success: true,
          data: {
            description: retryDescription,
            source: "openai_retry",
            model: "gpt-3.5-turbo",
            tokensUsed: retryCompletion.usage.total_tokens,
          },
        });
      }

      // Log usage for monitoring
      console.log("✅ AI description generated successfully");
      console.log("📊 Tokens used:", completion.usage.total_tokens);

      res.status(200).json({
        success: true,
        data: {
          description: generatedDescription,
          source: "openai",
          model: "gpt-3.5-turbo",
          tokensUsed: completion.usage.total_tokens,
        },
      });
    } catch (error) {
      console.error("❌ Error generating AI description:", error);

      // Handle specific OpenAI errors
      if (error.code === "insufficient_quota") {
        return res.status(503).json({
          success: false,
          message:
            "AI service temporarily unavailable. Please enter description manually.",
          error: "quota_exceeded",
        });
      }

      if (error.code === "invalid_api_key") {
        return res.status(500).json({
          success: false,
          message: "AI service configuration error. Please contact support.",
          error: "configuration_error",
        });
      }

      // Generic error response
      res.status(500).json({
        success: false,
        message:
          "Failed to generate description. Please enter description manually.",
        error: error.message,
      });
    }
  },
);

export default r;
