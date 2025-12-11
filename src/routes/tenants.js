/**
 * Tenant Routes
 *
 * Handles tenant provisioning, management, and configuration
 */

import { Router } from "express";
import { z } from "zod";
import Tenant from "../models/Tenant.js";
import Admin from "../models/Admin.js";
import Settings from "../models/Settings.js";
import Specialist from "../models/Specialist.js";
import { requireAdmin, requireSuperAdmin } from "../middleware/requireAdmin.js";
import { clearTenantCache } from "../middleware/resolveTenant.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const router = Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Validation schemas
const createTenantSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  name: z.string().min(1, "Salon name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  adminName: z.string().min(1, "Admin name is required"),
  adminEmail: z.string().email("Invalid admin email address"),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

const updateTenantSchema = z.object({
  businessName: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.object({}).passthrough().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  currency: z.enum(["GBP", "EUR", "USD"]).optional(),
  branding: z.object({}).passthrough().optional(),
  schedulingSettings: z.object({}).passthrough().optional(),
  paymentSettings: z.object({}).passthrough().optional(),
  features: z.object({}).passthrough().optional(),
});

/**
 * POST /api/tenants/create
 * Create a new tenant (salon) with admin account
 * Public route for new salon registration
 */
router.post("/create", async (req, res) => {
  try {
    const validatedData = createTenantSchema.parse(req.body);

    // Check if admin email already exists
    const existingAdmin = await Admin.findOne({
      email: validatedData.adminEmail,
    });
    if (existingAdmin) {
      return res.status(400).json({
        error: "Admin email already in use",
        message: "An account with this email address already exists.",
      });
    }

    // Check if business email already exists
    const existingTenant = await Tenant.findOne({ email: validatedData.email });
    if (existingTenant) {
      return res.status(400).json({
        error: "Business email already in use",
        message: "A salon with this email address already exists.",
      });
    }

    // Create tenant
    console.log("[Tenant Create] Creating tenant with:", {
      businessName: validatedData.businessName,
      name: validatedData.name,
      email: validatedData.email,
    });
    console.log(
      "[Tenant Create] Full validated data:",
      JSON.stringify(validatedData, null, 2)
    );

    const tenant = new Tenant({
      businessName: validatedData.businessName,
      name: validatedData.name,
      email: validatedData.email,
      phone: validatedData.phone,
      address: validatedData.address,
      domains: undefined, // Explicitly undefined - sparse index will ignore this
      status: "trial",
      isTrial: true,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      // Default working hours (Mon-Sat 9am-6pm)
      defaultWorkingHours: [
        { dayOfWeek: 1, start: "09:00", end: "18:00" }, // Monday
        { dayOfWeek: 2, start: "09:00", end: "18:00" }, // Tuesday
        { dayOfWeek: 3, start: "09:00", end: "18:00" }, // Wednesday
        { dayOfWeek: 4, start: "09:00", end: "18:00" }, // Thursday
        { dayOfWeek: 5, start: "09:00", end: "18:00" }, // Friday
        { dayOfWeek: 6, start: "09:00", end: "17:00" }, // Saturday
      ],
    });

    console.log("[Tenant Create] Tenant object created, before save:", {
      name: tenant.name,
      businessName: tenant.businessName,
      slug: tenant.slug,
      isNew: tenant.isNew,
    });

    await tenant.save();

    console.log("[Tenant Create] Tenant saved successfully!");
    console.log("[Tenant Create] - Slug:", tenant.slug);
    console.log("[Tenant Create] - ID:", tenant._id);
    console.log("[Tenant Create] - Name:", tenant.name);
    console.log("[Tenant Create] - BusinessName:", tenant.businessName);

    // Create admin user for this tenant
    const admin = new Admin({
      name: validatedData.adminName,
      email: validatedData.adminEmail,
      password: validatedData.adminPassword, // Will be hashed by pre-save hook
      role: "super_admin", // Salon owner gets full admin privileges
      tenantId: tenant._id,
      active: true,
    });

    await admin.save();

    // Update tenant with owner reference
    tenant.ownerId = admin._id;
    await tenant.save();

    // Create default settings for tenant
    const settings = new Settings({
      tenantId: tenant._id,
      salonName: tenant.name,
      salonDescription: `Welcome to ${tenant.businessName}`,
      salonAddress: validatedData.address || {
        street: "",
        city: "",
        postalCode: "",
        country: "United Kingdom",
      },
      salonPhone: tenant.phone || "",
      salonEmail: tenant.email,
    });

    await settings.save();

    // Create default location for the tenant
    const defaultLocation = new Location({
      name: `${tenant.businessName} - Main Location`,
      slug: "main",
      address: validatedData.address || {
        street: "",
        city: "",
        postalCode: "",
        country: "United Kingdom",
      },
      phone: tenant.phone || "",
      email: tenant.email,
      workingHours: tenant.defaultWorkingHours || [],
      isPrimary: true,
      isActive: true,
      displayOrder: 0,
      tenantId: tenant._id,
    });

    await defaultLocation.save();

    console.log(
      "[Tenant Create] Default location created:",
      defaultLocation._id
    );

    // Create default specialist for the business owner
    const defaultSpecialist = new Specialist({
      name: validatedData.adminName,
      email: validatedData.adminEmail,
      bio: `Professional beauty specialist at ${tenant.businessName}`,
      specialties: ["Beauty Services"],
      tenantId: tenant._id,
      adminId: admin._id, // Link to admin account
      locationIds: [defaultLocation._id], // Assign to default location
      primaryLocationId: defaultLocation._id,
    });

    await defaultSpecialist.save();

    console.log(
      "[Tenant Create] Default specialist created:",
      defaultSpecialist._id
    );

    // Generate JWT token for the new admin
    const token = jwt.sign(
      {
        id: admin._id,
        tenantId: tenant._id,
        role: admin.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log("[Tenant Create] Setting accessToken cookie for admin");

    // Cookie options matching auth.js
    const isProduction = process.env.NODE_ENV === "production";
    const accessTokenOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    };

    // Clear any old jwt cookie and set new accessToken cookie
    res
      .clearCookie("jwt", { path: "/" })
      .cookie("accessToken", token, accessTokenOptions)
      .status(201)
      .json({
        success: true,
        message: "Salon account created successfully!",
        tenant: {
          id: tenant._id,
          name: tenant.name,
          businessName: tenant.businessName,
          slug: tenant.slug,
          email: tenant.email,
          status: tenant.status,
          isTrial: tenant.isTrial,
          trialEndsAt: tenant.trialEndsAt,
        },
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
        token,
        onboardingUrl: `/onboarding/${tenant.slug}`,
      });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      });
    }

    console.error("[Tenant Create] ERROR - Tenant creation failed:", error);
    console.error("[Tenant Create] ERROR - Stack trace:", error.stack);
    console.error("[Tenant Create] ERROR - Request data:", {
      businessName: req.body.businessName,
      name: req.body.name,
      email: req.body.email,
    });
    res.status(500).json({
      error: "Failed to create salon account",
      message: error.message,
    });
  }
});

/**
 * GET /api/tenants
 * List all tenants (Super Admin only)
 */
router.get("/", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { businessName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [tenants, total] = await Promise.all([
      Tenant.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("ownerId", "name email"),
      Tenant.countDocuments(query),
    ]);

    res.json({
      tenants,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("List tenants error:", error);
    res.status(500).json({
      error: "Failed to list tenants",
      message: error.message,
    });
  }
});

/**
 * GET /api/tenants/:id
 * Get tenant details
 * Super admin can view any tenant, salon admin can view their own
 */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    if (
      req.admin.role !== "super_admin" &&
      req.admin.tenantId?.toString() !== id
    ) {
      return res.status(403).json({
        error: "Access denied",
        message: "You can only view your own salon information.",
      });
    }

    const tenant = await Tenant.findById(id).populate("ownerId", "name email");

    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
      });
    }

    res.json({ tenant });
  } catch (error) {
    console.error("Get tenant error:", error);
    res.status(500).json({
      error: "Failed to get tenant",
      message: error.message,
    });
  }
});

/**
 * PUT /api/tenants/:id
 * Update tenant information
 * Salon admin can update their own tenant, super admin can update any
 */
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    if (
      req.admin.role !== "super_admin" &&
      req.admin.tenantId?.toString() !== id
    ) {
      return res.status(403).json({
        error: "Access denied",
        message: "You can only update your own salon information.",
      });
    }

    const validatedData = updateTenantSchema.parse(req.body);

    // Special handling for features - merge instead of replace
    let updateData = { ...validatedData };
    if (validatedData.features) {
      const tenant = await Tenant.findById(id).lean();
      if (!tenant) {
        return res.status(404).json({
          error: "Tenant not found",
        });
      }

      // Merge new features with existing ones (without schema defaults)
      updateData.features = {
        ...(tenant.features || {}),
        ...validatedData.features,
      };
    }

    const tenant = await Tenant.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
      });
    }

    // Clear cache after update
    clearTenantCache(id);

    res.json({
      success: true,
      message: "Salon information updated successfully",
      tenant,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      });
    }

    console.error("Update tenant error:", error);
    res.status(500).json({
      error: "Failed to update tenant",
      message: error.message,
    });
  }
});

/**
 * POST /api/tenants/:id/suspend
 * Suspend a tenant (Super Admin only)
 */
router.post(
  "/:id/suspend",
  requireAdmin,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const tenant = await Tenant.findByIdAndUpdate(
        id,
        {
          status: "suspended",
          active: false,
        },
        { new: true }
      );

      if (!tenant) {
        return res.status(404).json({
          error: "Tenant not found",
        });
      }

      clearTenantCache(id);

      res.json({
        success: true,
        message: "Tenant suspended successfully",
        tenant,
      });
    } catch (error) {
      console.error("Suspend tenant error:", error);
      res.status(500).json({
        error: "Failed to suspend tenant",
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/tenants/:id/activate
 * Activate a tenant (Super Admin only)
 */
router.post(
  "/:id/activate",
  requireAdmin,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const tenant = await Tenant.findByIdAndUpdate(
        id,
        {
          status: "active",
          active: true,
        },
        { new: true }
      );

      if (!tenant) {
        return res.status(404).json({
          error: "Tenant not found",
        });
      }

      clearTenantCache(id);

      res.json({
        success: true,
        message: "Tenant activated successfully",
        tenant,
      });
    } catch (error) {
      console.error("Activate tenant error:", error);
      res.status(500).json({
        error: "Failed to activate tenant",
        message: error.message,
      });
    }
  }
);

/**
 * DELETE /api/tenants/:id
 * Delete a tenant (Super Admin only)
 * WARNING: This is destructive and should be used with caution
 */
router.delete("/:id", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const tenant = await Tenant.findByIdAndDelete(id);

    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
      });
    }

    clearTenantCache(id);

    res.json({
      success: true,
      message: "Tenant deleted successfully",
    });
  } catch (error) {
    console.error("Delete tenant error:", error);
    res.status(500).json({
      error: "Failed to delete tenant",
      message: error.message,
    });
  }
});

/**
 * GET /api/tenants/slug/:slug
 * Get tenant by slug (public route for tenant discovery)
 */
router.get("/slug/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const tenant = await Tenant.findOne({ slug, active: true }).select(
      "name businessName slug branding email phone address seo features"
    );

    if (!tenant) {
      return res.status(404).json({
        error: "Salon not found",
      });
    }

    res.json({ tenant });
  } catch (error) {
    console.error("Get tenant by slug error:", error);
    res.status(500).json({
      error: "Failed to get tenant",
      message: error.message,
    });
  }
});

export default router;
