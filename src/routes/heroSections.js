import { Router } from "express";
import HeroSection from "../models/HeroSection.js";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
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

// GET all hero sections
r.get("/", async (req, res) => {
  try {
    const sections = await HeroSection.find().sort({ order: 1 }).lean();
    res.json(sections);
  } catch (error) {
    console.error("Error fetching hero sections:", error);
    res.status(500).json({ error: "Failed to fetch hero sections" });
  }
});

// GET single hero section
r.get("/:id", async (req, res) => {
  try {
    const section = await HeroSection.findById(req.params.id).lean();
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
r.post("/", async (req, res) => {
  try {
    const section = new HeroSection(req.body);
    await section.save();
    res.status(201).json(section);
  } catch (error) {
    console.error("Error creating hero section:", error);
    res.status(500).json({ error: "Failed to create hero section" });
  }
});

// PATCH update hero section
r.patch("/:id", async (req, res) => {
  try {
    const section = await HeroSection.findByIdAndUpdate(
      req.params.id,
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
r.delete("/:id", async (req, res) => {
  try {
    const section = await HeroSection.findById(req.params.id);
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
r.post("/:id/upload-center-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const section = await HeroSection.findById(req.params.id);
    if (!section) {
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
});

// POST upload right image (Image 2)
r.post("/:id/upload-right-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const section = await HeroSection.findById(req.params.id);
    if (!section) {
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
});

export default r;
