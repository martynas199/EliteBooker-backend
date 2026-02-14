import { Router } from "express";
import Settings from "../models/Settings.js";
import requireAdmin from "../middleware/requireAdmin.js";
import optionalAuth from "../middleware/optionalAuth.js";
import { attachTenantToModels } from "../middleware/multiTenantPlugin.js";

const r = Router();

const SOCIAL_LINK_KEYS = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
  "x",
];

const normalizeSocialLink = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const trimmedValue = String(value).trim();
  if (!trimmedValue) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
};

const sanitizeSocialLinks = (socialLinks = {}) => {
  const sanitizedLinks = {};

  for (const key of SOCIAL_LINK_KEYS) {
    sanitizedLinks[key] = normalizeSocialLink(socialLinks[key]);
  }

  return sanitizedLinks;
};

/**
 * GET /api/settings
 * Get salon settings
 */
r.get("/", optionalAuth, attachTenantToModels, async (req, res, next) => {
  try {
    if (!req.tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    let settings = await Settings.findOne({ tenantId: req.tenantId }).lean();

    // If no settings exist, create default ones
    if (!settings) {
      settings = await Settings.create({
        tenantId: req.tenantId,
        workingHours: {
          mon: { start: "09:00", end: "17:00" },
          tue: { start: "09:00", end: "17:00" },
          wed: { start: "09:00", end: "17:00" },
          thu: { start: "09:00", end: "17:00" },
          fri: { start: "09:00", end: "17:00" },
          sat: { start: "09:00", end: "13:00" },
          sun: null,
        },
        socialLinks: sanitizeSocialLinks({}),
      });
    }

    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/settings
 * Update salon settings (admin only)
 */
r.patch("/", requireAdmin, attachTenantToModels, async (req, res, next) => {
  try {
    const {
      workingHours,
      salonName,
      salonDescription,
      salonAddress,
      salonPhone,
      salonEmail,
      heroImage,
      socialLinks,
    } = req.body;

    // Validate working hours format if provided
    if (workingHours) {
      const validDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      for (const day of validDays) {
        if (workingHours[day] !== undefined && workingHours[day] !== null) {
          if (!workingHours[day].start || !workingHours[day].end) {
            return res.status(400).json({
              error: `Invalid working hours for ${day}`,
            });
          }
        }
      }
    }

    if (!req.tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    let settings = await Settings.findOne({ tenantId: req.tenantId });
    const sanitizedSocialLinks =
      socialLinks !== undefined ? sanitizeSocialLinks(socialLinks) : undefined;

    if (!settings) {
      // Create new settings if none exist
      settings = await Settings.create({
        tenantId: req.tenantId,
        workingHours: workingHours || {},
        salonName,
        salonDescription,
        salonAddress,
        salonPhone,
        salonEmail,
        heroImage,
        socialLinks: sanitizedSocialLinks || sanitizeSocialLinks({}),
      });
    } else {
      // Update existing settings
      if (workingHours !== undefined) settings.workingHours = workingHours;
      if (salonName !== undefined) settings.salonName = salonName;
      if (salonDescription !== undefined)
        settings.salonDescription = salonDescription;
      if (salonAddress !== undefined) settings.salonAddress = salonAddress;
      if (salonPhone !== undefined) settings.salonPhone = salonPhone;
      if (salonEmail !== undefined) settings.salonEmail = salonEmail;
      if (heroImage !== undefined) settings.heroImage = heroImage;
      if (sanitizedSocialLinks !== undefined) {
        settings.socialLinks = sanitizedSocialLinks;
      }

      await settings.save();
    }

    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/upload-hero
 * Upload hero image for salon (admin only)
 */
import multer from "multer";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import fs from "fs";

const upload = multer({ dest: "uploads/" });

const deleteLocalFile = (path) => {
  try {
    fs.unlinkSync(path);
  } catch (err) {
    console.error("Error deleting local file:", err);
  }
};

r.post(
  "/upload-hero",
  requireAdmin,
  attachTenantToModels,
  upload.single("image"),
  async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Upload to Cloudinary
      const cloudinaryResult = await uploadImage(req.file.path, "salon-hero");

      // Delete local temp file
      deleteLocalFile(req.file.path);

      // Update settings with new hero image
      let settings = await Settings.findOne({ tenantId: req.tenantId });

      if (!settings) {
        settings = await Settings.create({
          tenantId: req.tenantId,
          heroImage: {
            provider: "cloudinary",
            id: cloudinaryResult.public_id,
            url: cloudinaryResult.secure_url,
            alt: "Salon hero image",
            width: cloudinaryResult.width,
            height: cloudinaryResult.height,
          },
        });
      } else {
        // Delete old image from Cloudinary if it exists
        if (
          settings.heroImage?.id &&
          settings.heroImage?.provider === "cloudinary"
        ) {
          try {
            await deleteImage(settings.heroImage.id);
          } catch (err) {
            console.error("Failed to delete old image:", err);
          }
        }

        settings.heroImage = {
          provider: "cloudinary",
          id: cloudinaryResult.public_id,
          url: cloudinaryResult.secure_url,
          alt: "Salon hero image",
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
        };

        await settings.save();
      }

      res.json(settings);
    } catch (err) {
      // Clean up temp file on error
      if (req.file) {
        deleteLocalFile(req.file.path);
      }
      next(err);
    }
  }
);

/**
 * POST /api/settings/upload-products-hero
 * Upload hero image for products page (admin only)
 */
r.post(
  "/upload-products-hero",
  requireAdmin,
  attachTenantToModels,
  upload.single("image"),
  async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Upload to Cloudinary
      const cloudinaryResult = await uploadImage(
        req.file.path,
        "products-hero"
      );

      // Delete local temp file
      deleteLocalFile(req.file.path);

      // Update settings with new products hero image
      let settings = await Settings.findOne({ tenantId: req.tenantId });

      if (!settings) {
        settings = await Settings.create({
          tenantId: req.tenantId,
          productsHeroImage: {
            provider: "cloudinary",
            publicId: cloudinaryResult.public_id,
            url: cloudinaryResult.secure_url,
          },
        });
      } else {
        // Delete old image from Cloudinary if it exists
        if (
          settings.productsHeroImage?.publicId &&
          settings.productsHeroImage?.provider === "cloudinary"
        ) {
          try {
            await deleteImage(settings.productsHeroImage.publicId);
          } catch (err) {
            console.error("Failed to delete old products hero image:", err);
          }
        }

        settings.productsHeroImage = {
          provider: "cloudinary",
          publicId: cloudinaryResult.public_id,
          url: cloudinaryResult.secure_url,
          position: "center", // Default position
          zoom: 100, // Default zoom
        };

        await settings.save();
      }

      res.json(settings);
    } catch (err) {
      // Clean up temp file on error
      if (req.file) {
        deleteLocalFile(req.file.path);
      }
      next(err);
    }
  }
);

/**
 * PATCH /api/settings/products-hero-position
 * Update products hero image position and zoom (admin only)
 */
r.patch(
  "/products-hero-position",
  requireAdmin,
  attachTenantToModels,
  async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context required" });
      }

      const { position, zoom } = req.body;

      // Validate position if provided
      if (position && !["top", "center", "bottom"].includes(position)) {
        return res.status(400).json({
          error: "Invalid position. Must be 'top', 'center', or 'bottom'",
        });
      }

      // Validate zoom if provided
      if (
        zoom !== undefined &&
        (typeof zoom !== "number" || zoom < 50 || zoom > 200)
      ) {
        return res.status(400).json({
          error: "Invalid zoom. Must be a number between 50 and 200",
        });
      }

      let settings = await Settings.findOne({ tenantId: req.tenantId });

      if (!settings || !settings.productsHeroImage) {
        return res.status(404).json({
          error: "No products hero image found",
        });
      }

      // Update position if provided
      if (position) {
        settings.productsHeroImage.position = position;
      }

      // Update zoom if provided
      if (zoom !== undefined) {
        settings.productsHeroImage.zoom = zoom;
      }

      await settings.save();

      res.json(settings);
    } catch (err) {
      next(err);
    }
  }
);

export default r;
