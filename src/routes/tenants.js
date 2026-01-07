/**
 * Tenant Routes
 *
 * Handles tenant provisioning, management, and configuration
 */

import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import Admin from "../models/Admin.js";
import Settings from "../models/Settings.js";
import HeroSection from "../models/HeroSection.js";
import Specialist from "../models/Specialist.js";
import Location from "../models/Location.js";
import { requireAdmin, requireSuperAdmin } from "../middleware/requireAdmin.js";
import { clearTenantCache } from "../middleware/resolveTenant.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

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
  location: z
    .object({
      coordinates: z.array(z.number()).length(2).optional(), // [longitude, latitude]
    })
    .optional(),
});

const updateTenantSchema = z.object({
  businessName: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.object({}).passthrough().optional(),
  location: z
    .object({
      coordinates: z.array(z.number()).length(2).optional(), // [longitude, latitude]
    })
    .optional(),
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
      location: validatedData.location?.coordinates
        ? {
            type: "Point",
            coordinates: validatedData.location.coordinates,
          }
        : undefined,
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

    // Link the admin account to the specialist
    admin.specialistId = defaultSpecialist._id;
    await admin.save();

    console.log(
      "[Tenant Create] Admin linked to specialist:",
      defaultSpecialist._id
    );

    // Send notification email to admin about new registration
    try {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const from = process.env.SMTP_FROM || process.env.SMTP_USER;

      await transport.sendMail({
        from,
        to: "martynas.20@hotmail.com",
        subject: "🎉 New Business Registration - Elite Booker",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1f2937; border-bottom: 3px solid #3b82f6; padding-bottom: 10px;">
              New Business Registration
            </h2>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">Business Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Business Name:</td>
                  <td style="padding: 8px 0;">${validatedData.businessName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Salon Name:</td>
                  <td style="padding: 8px 0;">${validatedData.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Business Email:</td>
                  <td style="padding: 8px 0;">${validatedData.email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Phone:</td>
                  <td style="padding: 8px 0;">${
                    validatedData.phone || "N/A"
                  }</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Slug:</td>
                  <td style="padding: 8px 0;">${tenant.slug}</td>
                </tr>
              </table>
            </div>

            <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">Admin Account</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Name:</td>
                  <td style="padding: 8px 0;">${validatedData.adminName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Email:</td>
                  <td style="padding: 8px 0;">${validatedData.adminEmail}</td>
                </tr>
              </table>
            </div>

            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e;">
                <strong>Trial Status:</strong> 14 days trial period<br>
                <strong>Trial Ends:</strong> ${new Date(
                  tenant.trialEndsAt
                ).toLocaleDateString("en-GB")}
              </p>
            </div>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
              <p>Registration completed at: ${new Date().toLocaleString(
                "en-GB"
              )}</p>
              <p>Tenant ID: ${tenant._id}</p>
            </div>
          </div>
        `,
        text: `New Business Registration

Business Details:
- Business Name: ${validatedData.businessName}
- Salon Name: ${validatedData.name}
- Email: ${validatedData.email}
- Phone: ${validatedData.phone || "N/A"}
- Slug: ${tenant.slug}

Admin Account:
- Name: ${validatedData.adminName}
- Email: ${validatedData.adminEmail}

Trial Status: 14 days
Trial Ends: ${new Date(tenant.trialEndsAt).toLocaleDateString("en-GB")}

Tenant ID: ${tenant._id}
Registered: ${new Date().toLocaleString("en-GB")}`,
      });

      console.log("[Tenant Create] Notification email sent to admin");
    } catch (emailError) {
      console.error(
        "[Tenant Create] Failed to send notification email:",
        emailError
      );
      // Don't fail the registration if email fails
    }

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
 * GET /api/tenants/public
 * Get all active public tenants (no authentication required)
 * This is used for the search page to list all available businesses
 */
router.get("/public", async (req, res) => {
  try {
    const { search, limit = 100 } = req.query;

    const query = {
      status: { $in: ["active", "trial"] }, // Show active and trial tenants
      isPublic: { $ne: false }, // Only show public tenants (default to public if field doesn't exist)
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { businessName: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const tenants = await Tenant.find(query)
      .select(
        "name slug address description location branding services rating reviewCount"
      )
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    // Enrich tenants with hero image from HeroSection or Settings
    console.log(
      `[TENANTS/PUBLIC] Enriching ${tenants.length} tenants with hero images...`
    );
    const enrichedTenants = await Promise.all(
      tenants.map(async (tenant) => {
        try {
          // Use base queries to bypass multi-tenant plugin
          // Check HeroSection first (like landing pages do)
          const heroSection = await HeroSection.findOne({
            tenantId: tenant._id,
          })
            .select("centerImage")
            .sort({ order: 1 })
            .lean()
            .exec();

          // Then check Settings as fallback
          const settings = await Settings.findOne({ tenantId: tenant._id })
            .select("heroImage")
            .lean()
            .exec();

          // Add centerImage directly to tenant (simpler structure)
          if (heroSection?.centerImage) {
            return {
              ...tenant,
              centerImage: heroSection.centerImage,
            };
          } else if (settings?.heroImage) {
            return {
              ...tenant,
              centerImage: settings.heroImage,
            };
          }

          return tenant;
        } catch (err) {
          console.error(
            `Error fetching hero image for tenant ${tenant._id}:`,
            err
          );
          return tenant;
        }
      })
    );

    res.json({
      success: true,
      tenants: enrichedTenants,
      count: enrichedTenants.length,
    });
  } catch (error) {
    console.error("Get public tenants error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get public tenants",
      message: error.message,
    });
  }
});

/**
 * GET /api/tenants/:id
 * Get tenant details
 * Super admin and support can view any tenant, salon admin can view their own
 */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions - allow super_admin and support to view any tenant
    if (
      req.admin.role !== "super_admin" &&
      req.admin.role !== "support" &&
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

    res.json(tenant);
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

    const tenant = await Tenant.findById(id);

    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
      });
    }

    // Start a session for transaction to ensure all data is deleted together
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Import all models that have tenant data
      const Service = mongoose.model("Service");
      const Appointment = mongoose.model("Appointment");
      const Order = mongoose.model("Order");
      const Product = mongoose.model("Product");
      const BlogPost = mongoose.model("BlogPost");
      const GiftCard = mongoose.model("GiftCard");

      // Delete all tenant-related data
      console.log(
        `[Tenant Delete] Deleting all data for tenant: ${tenant.slug} (${id})`
      );

      // Delete specialists (staff)
      const deletedSpecialists = await Specialist.deleteMany({
        tenantId: id,
      }).session(session);
      console.log(
        `[Tenant Delete] Deleted ${deletedSpecialists.deletedCount} specialists`
      );

      // Delete services
      const deletedServices = await Service.deleteMany({
        tenantId: id,
      }).session(session);
      console.log(
        `[Tenant Delete] Deleted ${deletedServices.deletedCount} services`
      );

      // Delete appointments
      const deletedAppointments = await Appointment.deleteMany({
        tenantId: id,
      }).session(session);
      console.log(
        `[Tenant Delete] Deleted ${deletedAppointments.deletedCount} appointments`
      );

      // Delete orders
      const deletedOrders = await Order.deleteMany({ tenantId: id }).session(
        session
      );
      console.log(
        `[Tenant Delete] Deleted ${deletedOrders.deletedCount} orders`
      );

      // Delete products
      const deletedProducts = await Product.deleteMany({
        tenantId: id,
      }).session(session);
      console.log(
        `[Tenant Delete] Deleted ${deletedProducts.deletedCount} products`
      );

      // Delete locations
      const deletedLocations = await Location.deleteMany({
        tenantId: id,
      }).session(session);
      console.log(
        `[Tenant Delete] Deleted ${deletedLocations.deletedCount} locations`
      );

      // Delete settings
      const deletedSettings = await Settings.deleteMany({
        tenantId: id,
      }).session(session);
      console.log(
        `[Tenant Delete] Deleted ${deletedSettings.deletedCount} settings`
      );

      // Delete hero sections
      const deletedHeroSections = await HeroSection.deleteMany({
        tenantId: id,
      }).session(session);
      console.log(
        `[Tenant Delete] Deleted ${deletedHeroSections.deletedCount} hero sections`
      );

      // Delete blog posts
      const deletedBlogPosts = await BlogPost.deleteMany({
        tenantId: id,
      }).session(session);
      console.log(
        `[Tenant Delete] Deleted ${deletedBlogPosts.deletedCount} blog posts`
      );

      // Delete gift cards
      const deletedGiftCards = await GiftCard.deleteMany({
        tenantId: id,
      }).session(session);
      console.log(
        `[Tenant Delete] Deleted ${deletedGiftCards.deletedCount} gift cards`
      );

      // Delete admins associated with this tenant
      const deletedAdmins = await Admin.deleteMany({ tenantId: id }).session(
        session
      );
      console.log(
        `[Tenant Delete] Deleted ${deletedAdmins.deletedCount} admin accounts`
      );

      // Finally delete the tenant itself
      await Tenant.findByIdAndDelete(id).session(session);
      console.log(`[Tenant Delete] Deleted tenant: ${tenant.slug}`);

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      clearTenantCache(id);

      res.json({
        success: true,
        message: "Tenant and all associated data deleted successfully",
        deletedData: {
          specialists: deletedSpecialists.deletedCount,
          services: deletedServices.deletedCount,
          appointments: deletedAppointments.deletedCount,
          orders: deletedOrders.deletedCount,
          products: deletedProducts.deletedCount,
          locations: deletedLocations.deletedCount,
          settings: deletedSettings.deletedCount,
          heroSections: deletedHeroSections.deletedCount,
          blogPosts: deletedBlogPosts.deletedCount,
          giftCards: deletedGiftCards.deletedCount,
          admins: deletedAdmins.deletedCount,
        },
      });
    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
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
