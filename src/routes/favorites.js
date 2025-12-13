import { Router } from "express";
import Client from "../models/Client.js";
import Tenant from "../models/Tenant.js";
import { authenticateClient } from "../middleware/clientAuth.js";

const router = Router();

// All routes require client authentication
router.use(authenticateClient);

/**
 * GET /api/favorites
 * Get client's favorite tenants
 */
router.get("/", async (req, res) => {
  try {
    const client = await Client.findById(req.clientId).populate(
      "favoriteTenants",
      "name slug description address"
    );

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json({ favorites: client.favoriteTenants || [] });
  } catch (error) {
    console.error("[FAVORITES] Get error:", error);
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

/**
 * POST /api/favorites/:tenantId
 * Add tenant to favorites
 */
router.post("/:tenantId", async (req, res) => {
  try {
    const { tenantId } = req.params;

    // Verify tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const client = await Client.findById(req.clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // Check if already in favorites
    if (client.favoriteTenants.includes(tenantId)) {
      return res.status(400).json({ error: "Already in favorites" });
    }

    // Add to favorites
    client.favoriteTenants.push(tenantId);
    await client.save();

    res.json({
      message: "Added to favorites",
      favorites: client.favoriteTenants,
    });
  } catch (error) {
    console.error("[FAVORITES] Add error:", error);
    res.status(500).json({ error: "Failed to add to favorites" });
  }
});

/**
 * DELETE /api/favorites/:tenantId
 * Remove tenant from favorites
 */
router.delete("/:tenantId", async (req, res) => {
  try {
    const { tenantId } = req.params;

    const client = await Client.findById(req.clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // Remove from favorites
    client.favoriteTenants = client.favoriteTenants.filter(
      (id) => id.toString() !== tenantId
    );
    await client.save();

    res.json({
      message: "Removed from favorites",
      favorites: client.favoriteTenants,
    });
  } catch (error) {
    console.error("[FAVORITES] Remove error:", error);
    res.status(500).json({ error: "Failed to remove from favorites" });
  }
});

export default router;
