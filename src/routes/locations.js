import { Router } from "express";
import Location from "../models/Location.js";
import Specialist from "../models/Specialist.js";
import Service from "../models/Service.js";
import {
  validateCreateLocation,
  validateUpdateLocation,
  validateListLocationsQuery,
  validateLocationId,
} from "../validations/location.schema.js";
import requireAdmin from "../middleware/requireAdmin.js";
import optionalAuth from "../middleware/optionalAuth.js";

const router = Router();

/**
 * GET /api/locations
 * List all locations for the tenant
 * Public endpoint with optional auth (shows inactive only to admins)
 */
router.get("/", optionalAuth, async (req, res, next) => {
  try {
    console.log("[LOCATIONS] GET / - Request received");
    console.log("[LOCATIONS] Tenant ID:", req.tenantId);
    console.log("[LOCATIONS] Is Admin:", !!req.admin);
    console.log("[LOCATIONS] Headers:", req.headers["x-tenant-slug"]);
    console.log("[LOCATIONS] Query params:", req.query);

    const validation = validateListLocationsQuery(req.query);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: validation.errors,
      });
    }

    const query = { tenantId: req.tenantId };

    // Non-admin users only see active locations
    if (!req.admin) {
      query.isActive = true;
    } else if (req.query.isActive !== undefined) {
      // Only filter by isActive if explicitly provided in query
      query.isActive = validation.data.isActive;
    }

    if (req.query.isPrimary !== undefined) {
      // Only filter by isPrimary if explicitly provided in query
      query.isPrimary = validation.data.isPrimary;
    }

    console.log("[LOCATIONS] Query:", JSON.stringify(query));

    const locations = await Location.find(query).sort({
      displayOrder: 1,
      createdAt: 1,
    });

    console.log("[LOCATIONS] Found locations:", locations.length);
    console.log(
      "[LOCATIONS] Locations:",
      locations.map((l) => ({
        id: l._id,
        name: l.name,
        isActive: l.isActive,
        isPrimary: l.isPrimary,
      }))
    );

    res.json(locations);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/locations/:id
 * Get single location by ID
 */
router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const validation = validateLocationId(req.params);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid location ID",
        details: validation.errors,
      });
    }

    const location = await Location.findOne({
      _id: validation.data.id,
      tenantId: req.tenantId,
    });

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    // Non-admin users can't see inactive locations
    if (!req.admin && !location.isActive) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json(location);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/locations
 * Create a new location (admin only)
 */
router.post("/", requireAdmin, async (req, res, next) => {
  try {
    const validation = validateCreateLocation(req.body);
    if (!validation.success) {
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    const locationData = {
      ...validation.data,
      tenantId: req.tenantId || req.admin.tenantId,
    };

    const location = await Location.create(locationData);
    res.status(201).json(location);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Location already exists",
        details: "A location with this name already exists for your business",
      });
    }
    next(err);
  }
});

/**
 * PATCH /api/locations/:id
 * Update a location (admin only)
 */
router.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    const idValidation = validateLocationId(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid location ID",
        details: idValidation.errors,
      });
    }

    const dataValidation = validateUpdateLocation(req.body);
    if (!dataValidation.success) {
      const errorMessages = dataValidation.errors
        .map((e) => e.message)
        .join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: dataValidation.errors,
      });
    }

    const updated = await Location.findOneAndUpdate(
      { _id: idValidation.data.id, tenantId: req.tenantId },
      { $set: dataValidation.data },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Duplicate location name",
        details: "A location with this name already exists",
      });
    }
    next(err);
  }
});

/**
 * DELETE /api/locations/:id
 * Delete a location (admin only)
 * Soft delete - sets isActive to false
 */
router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const validation = validateLocationId(req.params);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid location ID",
        details: validation.errors,
      });
    }

    const location = await Location.findOne({
      _id: validation.data.id,
      tenantId: req.tenantId,
    });

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    // Check if this is the primary location
    if (location.isPrimary) {
      const locationCount = await Location.countDocuments({
        tenantId: req.tenantId,
        isActive: true,
      });

      if (locationCount > 1) {
        return res.status(400).json({
          error: "Cannot delete primary location",
          details:
            "Please set another location as primary before deleting this one",
        });
      }
    }

    // Soft delete
    location.isActive = false;
    await location.save();

    res.json({ message: "Location deleted successfully", location });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/locations/:id/specialists
 * Get all specialists working at this location
 */
router.get("/:id/specialists", optionalAuth, async (req, res, next) => {
  try {
    const validation = validateLocationId(req.params);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid location ID",
        details: validation.errors,
      });
    }

    const location = await Location.findOne({
      _id: validation.data.id,
      tenantId: req.tenantId,
    });

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    // Find specialists assigned to this location or with no location restrictions (legacy support)
    const specialists = await Specialist.find({
      tenantId: req.tenantId,
      active: true,
      $or: [
        { locationIds: validation.data.id },
        { locationIds: { $exists: false } },
        { locationIds: { $size: 0 } },
      ],
    }).select(
      "-legacyWorkingHours -googleCalendar.accessToken -googleCalendar.refreshToken"
    );

    res.json(specialists);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/locations/:id/services
 * Get all services available at this location
 */
router.get("/:id/services", optionalAuth, async (req, res, next) => {
  try {
    const validation = validateLocationId(req.params);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid location ID",
        details: validation.errors,
      });
    }

    const location = await Location.findOne({
      _id: validation.data.id,
      tenantId: req.tenantId,
    });

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    // Find services available at this location or with no location restrictions (legacy support)
    const services = await Service.find({
      tenantId: req.tenantId,
      active: true,
      $or: [
        { availableAt: validation.data.id },
        { availableAt: { $exists: false } },
        { availableAt: { $size: 0 } },
      ],
    });

    res.json(services);
  } catch (err) {
    next(err);
  }
});

export default router;
