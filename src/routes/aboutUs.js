import express from "express";
import { z } from "zod";
import multer from "multer";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import { requireAdmin, requireSuperAdmin } from "../middleware/requireAdmin.js";
import AboutUs from "../models/AboutUs.js";

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// GET /api/about-us - Public route to get About Us content
router.get("/", async (req, res) => {
  try {
    const aboutUs = await AboutUs.findOne({ isActive: true });

    if (!aboutUs) {
      return res.status(404).json({
        error: "About Us content not found",
        message: "No about us content has been configured yet.",
      });
    }
    res.json({
      success: true,
      data: {
        id: aboutUs._id,
        image: aboutUs.image,
        quote: aboutUs.quote,
        description: aboutUs.description,
        updatedAt: aboutUs.updatedAt,
      },
    });
  } catch (error) {
    console.error("[ABOUT-US] ✗ Error fetching About Us content:", error);
    res.status(500).json({
      error: "Failed to fetch About Us content",
      message: error.message,
    });
  }
});

// GET /api/admin/about-us - Admin route to get About Us for editing
router.get("/admin", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const aboutUs = await AboutUs.findOne({ isActive: true }).populate(
      "lastUpdatedBy",
      "name email"
    );

    res.json({
      success: true,
      data: aboutUs || null,
    });
  } catch (error) {
    console.error("[ABOUT-US] ✗ Admin error fetching About Us:", error);
    res.status(500).json({
      error: "Failed to fetch About Us content",
      message: error.message,
    });
  }
});

// PUT /api/admin/about-us - Admin route to update About Us content
router.put(
  "/admin",
  requireAdmin,
  requireSuperAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      // Validation schema
      const UpdateSchema = z.object({
        quote: z
          .string()
          .min(1, "Quote is required")
          .max(500, "Quote must be under 500 characters"),
        description: z
          .string()
          .min(1, "Description is required")
          .max(5000, "Description must be under 5000 characters"),
        keepExistingImage: z.string().optional(),
      });

      const { quote, description, keepExistingImage } = UpdateSchema.parse(
        req.body
      );

      // Get existing About Us content
      let aboutUs = await AboutUs.findOne({ isActive: true });
      let imageData = null;

      // Handle image upload
      if (req.file) {
        // Delete old image from Cloudinary if it exists
        if (aboutUs?.image?.publicId) {
          try {
            await deleteImage(aboutUs.image.publicId);
          } catch (deleteError) {
            console.warn(
              "[ABOUT-US] ⚠️ Failed to delete old image:",
              deleteError
            );
          }
        }

        // Upload new image
        const uploadResult = await uploadImage(req.file.buffer, {
          folder: "about-us",
          transformation: [
            { width: 1200, height: 800, crop: "fit", gravity: "center" },
            { quality: "auto", fetch_format: "auto" },
          ],
        });

        imageData = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
        };
      } else if (keepExistingImage === "true" && aboutUs?.image) {
        // Keep existing image
        imageData = aboutUs.image;
      } else if (!aboutUs?.image) {
        return res.status(400).json({
          error: "Image is required",
          message:
            "Please upload an image or there's no existing image to keep.",
        });
      } else {
        // Keep existing image by default
        imageData = aboutUs.image;
      }

      // Update or create About Us content
      const updateData = {
        tenantId: req.tenantId,
        image: imageData,
        quote,
        description,
        lastUpdatedBy: req.admin.id,
        isActive: true,
      };

      if (aboutUs) {
        // Update existing
        aboutUs = await AboutUs.findByIdAndUpdate(aboutUs._id, updateData, {
          new: true,
          runValidators: true,
        }).populate("lastUpdatedBy", "name email");

      } else {
        // Create new
        aboutUs = await AboutUs.create(updateData);
        aboutUs = await AboutUs.findById(aboutUs._id).populate(
          "lastUpdatedBy",
          "name email"
        );

      }

      res.json({
        success: true,
        message: "About Us content updated successfully",
        data: aboutUs,
      });
    } catch (error) {
      console.error("[ABOUT-US] ✗ Error updating About Us content:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          message: error.errors[0]?.message || "Invalid input data",
          details: error.errors,
        });
      }

      if (error instanceof multer.MulterError) {
        return res.status(400).json({
          error: "File upload error",
          message: error.message,
        });
      }

      res.status(500).json({
        error: "Failed to update About Us content",
        message: error.message,
      });
    }
  }
);

// DELETE /api/admin/about-us/image - Admin route to delete current image
router.delete(
  "/admin/image",
  requireAdmin,
  requireSuperAdmin,
  async (req, res) => {
    try {
      console.log("[ABOUT-US] Admin deleting About Us image");

      const aboutUs = await AboutUs.findOne({ isActive: true });

      if (!aboutUs || !aboutUs.image?.publicId) {
        return res.status(404).json({
          error: "No image found to delete",
        });
      }

      // Delete from Cloudinary
      await deleteImage(aboutUs.image.publicId);

      // Remove image from database
      aboutUs.image = undefined;
      await aboutUs.save();

      console.log("[ABOUT-US] ✓ Image deleted successfully");

      res.json({
        success: true,
        message: "Image deleted successfully",
      });
    } catch (error) {
      console.error("[ABOUT-US] ✗ Error deleting image:", error);
      res.status(500).json({
        error: "Failed to delete image",
        message: error.message,
      });
    }
  }
);

export default router;
