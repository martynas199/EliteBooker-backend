import { Router } from "express";
import HeroSection from "../models/HeroSection.js";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import multer from "multer";
import fs from "fs";

const r = Router();
const upload = multer({ dest: "uploads/" });

// Helper: Delete local file
const deleteLocalFile = (path) => {
  try {
    fs.unlinkSync(path);
  } catch (err) {
    console.error("Error deleting local file:", err);
  }
};

// GET all hero sections (PUBLIC - for customer display)
r.get("/", async (req, res) => {
  try {
    // TENANT FILTERING: REQUIRED - Multi-tenant app must always filter by tenant
    if (!req.tenantId) {
      console.log("[HERO_SECTIONS] ERROR: No tenantId found in request");
      return res.status(400).json({
        error: "Tenant context required. Please provide tenant information.",
      });
    }

    // Check if this is an admin request (has admin auth)
    const isAdminRequest = req.admin && req.admin.role;

    // For admin, return all sections. For public, only return active sections
    const filter = {
      tenantId: req.tenantId,
      ...(isAdminRequest ? {} : { active: true }),
    };

    const sections = await HeroSection.find(filter).sort({ order: 1 }).lean();
    res.json(sections);
  } catch (error) {
    console.error("Error fetching hero sections:", error);
    res.status(500).json({ error: "Failed to fetch hero sections" });
  }
});

// GET single hero section
r.get("/:id", requireAdmin, async (req, res) => {
  try {
    // TENANT FILTERING: REQUIRED - Multi-tenant app must always filter by tenant
    if (!req.tenantId) {
      console.log("[HERO_SECTIONS] ERROR: No tenantId found in request");
      return res.status(400).json({
        error: "Tenant context required. Please provide tenant information.",
      });
    }

    const section = await HeroSection.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).lean();
    if (!section) {
      return res.status(404).json({ error: "Hero section not found" });
    }
    res.json(section);
  } catch (error) {
    console.error("Error fetching hero section:", error);
    res.status(500).json({ error: "Failed to fetch hero section" });
  }
});

// POST create new hero section
r.post("/", requireAdmin, async (req, res) => {
  try {
    // TENANT FILTERING: REQUIRED - Must validate tenant context
    if (!req.tenantId) {
      console.log("[HERO_SECTIONS] ERROR: No tenantId found in create request");
      return res.status(400).json({
        error: "Tenant context required. Please provide tenant information.",
      });
    }

    // Ensure tenantId is set from authenticated admin, not from request body
    const sectionData = {
      ...req.body,
      tenantId: req.tenantId, // Force tenant from auth context
    };

    const section = new HeroSection(sectionData);
    await section.save();
    res.status(201).json(section);
  } catch (error) {
    console.error("Error creating hero section:", error);
    res.status(500).json({ error: "Failed to create hero section" });
  }
});

// PATCH update hero section
r.patch("/:id", requireAdmin, async (req, res) => {
  try {
    // TENANT FILTERING: REQUIRED - Must validate tenant context
    if (!req.tenantId) {
      console.log("[HERO_SECTIONS] ERROR: No tenantId found in update request");
      return res.status(400).json({
        error: "Tenant context required. Please provide tenant information.",
      });
    }

    // Find and update only within tenant scope
    const section = await HeroSection.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!section) {
      return res.status(404).json({ error: "Hero section not found" });
    }
    res.json(section);
  } catch (error) {
    console.error("Error updating hero section:", error);
    res.status(500).json({ error: "Failed to update hero section" });
  }
});

// DELETE hero section
r.delete("/:id", requireAdmin, async (req, res) => {
  try {
    // TENANT FILTERING: REQUIRED - Must validate tenant context
    if (!req.tenantId) {
      console.log("[HERO_SECTIONS] ERROR: No tenantId found in delete request");
      return res.status(400).json({
        error: "Tenant context required. Please provide tenant information.",
      });
    }

    const section = await HeroSection.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });
    if (!section) {
      return res.status(404).json({ error: "Hero section not found" });
    }

    // Delete images from Cloudinary
    if (section.centerImage?.publicId) {
      try {
        await deleteImage(section.centerImage.publicId);
      } catch (err) {
        console.error("Failed to delete center image from Cloudinary:", err);
      }
    }
    if (section.rightImage?.publicId) {
      try {
        await deleteImage(section.rightImage.publicId);
      } catch (err) {
        console.error("Failed to delete right image from Cloudinary:", err);
      }
    }

    await section.deleteOne();
    res.json({ message: "Hero section deleted successfully" });
  } catch (error) {
    console.error("Error deleting hero section:", error);
    res.status(500).json({ error: "Failed to delete hero section" });
  }
});

// POST upload center image
r.post(
  "/:id/upload-center-image",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // TENANT FILTERING: REQUIRED - Must validate tenant context
      if (!req.tenantId) {
        deleteLocalFile(req.file.path);
        return res.status(400).json({
          error: "Tenant context required.",
        });
      }

      const section = await HeroSection.findOne({
        _id: req.params.id,
        tenantId: req.tenantId,
      });
      if (!section) {
        deleteLocalFile(req.file.path);
        return res.status(404).json({ error: "Hero section not found" });
      }

      try {
        // Upload new image to Cloudinary
        const result = await uploadImage(
          req.file.path,
          "beauty-salon/hero-sections"
        );

        // Delete old image if exists
        if (section.centerImage?.publicId) {
          try {
            await deleteImage(section.centerImage.publicId);
          } catch (err) {
            console.error("Failed to delete old image from Cloudinary:", err);
          }
        }

        // Update section with new image
        section.centerImage = {
          url: result.secure_url,
          publicId: result.public_id,
          provider: "cloudinary",
        };
        await section.save();

        // Clean up local file
        deleteLocalFile(req.file.path);

        res.json(section);
      } catch (err) {
        deleteLocalFile(req.file.path);
        throw err;
      }
    } catch (error) {
      console.error("Error uploading center image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

// POST upload right image (Image 2)
r.post(
  "/:id/upload-right-image",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // TENANT FILTERING: REQUIRED - Must validate tenant context
      if (!req.tenantId) {
        deleteLocalFile(req.file.path);
        return res.status(400).json({
          error: "Tenant context required.",
        });
      }

      const section = await HeroSection.findOne({
        _id: req.params.id,
        tenantId: req.tenantId,
      });
      if (!section) {
        deleteLocalFile(req.file.path);
        return res.status(404).json({ error: "Hero section not found" });
      }

      try {
        // Upload new image to Cloudinary
        const result = await uploadImage(
          req.file.path,
          "beauty-salon/hero-sections"
        );

        // Delete old image if exists
        if (section.rightImage?.publicId) {
          try {
            await deleteImage(section.rightImage.publicId);
          } catch (err) {
            console.error("Failed to delete old image from Cloudinary:", err);
          }
        }

        // Update section with new image
        section.rightImage = {
          url: result.secure_url,
          publicId: result.public_id,
          provider: "cloudinary",
        };
        await section.save();

        // Clean up local file
        deleteLocalFile(req.file.path);

        res.json(section);
      } catch (err) {
        deleteLocalFile(req.file.path);
        throw err;
      }
    } catch (error) {
      console.error("Error uploading right image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

export default r;
