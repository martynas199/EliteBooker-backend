import express from "express";
import ClientService from "../../services/clientService.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";

const router = express.Router();

/**
 * GET /api/admin/clients
 * Get all clients for the current tenant
 * Access: Admin only, tenant-scoped
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { tenantId } = req.admin;
    const { status, search, sortBy, order, limit, skip } = req.query;

    const result = await ClientService.getClientsForTenant(tenantId, {
      status,
      search,
      sortBy: sortBy || "lastVisit",
      order: order || "desc",
      limit: parseInt(limit) || 100,
      skip: parseInt(skip) || 0,
    });

    res.json({
      success: true,
      clients: result.clients.map((tc) => ({
        id: tc.clientId._id,
        name: tc.displayName || tc.clientId.name,
        email: tc.clientId.email,
        phone: tc.clientId.phone,
        memberSince: tc.clientId.memberSince,
        totalSpend: tc.totalSpend,
        totalVisits: tc.totalVisits,
        lastVisit: tc.lastVisit,
        firstVisit: tc.firstVisit,
        status: tc.status,
        tags: tc.tags,
        loyaltyPoints: tc.loyaltyPoints,
        membershipTier: tc.membershipTier,
        isBlocked: tc.isBlocked,
      })),
      total: result.total,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error("[Admin Clients] Error fetching clients:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch clients",
    });
  }
});

/**
 * GET /api/admin/clients/:clientId
 * Get detailed client information for the current tenant
 * Access: Admin only, tenant-scoped
 */
router.get("/:clientId", requireAdmin, async (req, res) => {
  try {
    const { tenantId } = req.admin;
    const { clientId } = req.params;

    const clientDetails = await ClientService.getClientDetailsForTenant(
      tenantId,
      clientId
    );

    if (!clientDetails) {
      return res.status(404).json({
        success: false,
        error: "Client not found for this business",
      });
    }

    res.json({
      success: true,
      client: {
        id: clientDetails.client._id,
        name: clientDetails.client.name,
        email: clientDetails.client.email,
        phone: clientDetails.client.phone,
        memberSince: clientDetails.client.memberSince,
        isActive: clientDetails.client.isActive,
      },
      relationship: {
        displayName: clientDetails.relationship.displayName,
        totalSpend: clientDetails.relationship.totalSpend,
        totalVisits: clientDetails.relationship.totalVisits,
        averageSpend: clientDetails.relationship.averageSpend,
        lifetimeValue: clientDetails.relationship.lifetimeValue,
        firstVisit: clientDetails.relationship.firstVisit,
        lastVisit: clientDetails.relationship.lastVisit,
        status: clientDetails.relationship.status,
        isBlocked: clientDetails.relationship.isBlocked,
        blockReason: clientDetails.relationship.blockReason,
        internalNotes: clientDetails.relationship.internalNotes,
        tags: clientDetails.relationship.tags,
        loyaltyPoints: clientDetails.relationship.loyaltyPoints,
        membershipTier: clientDetails.relationship.membershipTier,
        preferredSpecialist: clientDetails.relationship.preferredSpecialist,
        preferredServices: clientDetails.relationship.preferredServices,
        smsReminders: clientDetails.relationship.smsReminders,
        emailReminders: clientDetails.relationship.emailReminders,
        marketingEmails: clientDetails.relationship.marketingEmails,
      },
      bookings: clientDetails.bookings,
    });
  } catch (error) {
    console.error("[Admin Clients] Error fetching client details:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch client details",
    });
  }
});

/**
 * PATCH /api/admin/clients/:clientId
 * Update tenant-specific client data
 * Access: Admin only, tenant-scoped
 */
router.patch("/:clientId", requireAdmin, async (req, res) => {
  try {
    const { tenantId } = req.admin;
    const { clientId } = req.params;
    const updates = req.body;

    const tenantClient = await ClientService.updateTenantClient(
      tenantId,
      clientId,
      updates
    );

    if (!tenantClient) {
      return res.status(404).json({
        success: false,
        error: "Client not found for this business",
      });
    }

    res.json({
      success: true,
      tenantClient,
    });
  } catch (error) {
    console.error("[Admin Clients] Error updating client:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update client",
    });
  }
});

/**
 * POST /api/admin/clients/:clientId/block
 * Block a client from booking
 * Access: Admin only, tenant-scoped
 */
router.post("/:clientId/block", requireAdmin, async (req, res) => {
  try {
    const { tenantId, _id: adminId } = req.admin;
    const { clientId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: "Block reason is required",
      });
    }

    const tenantClient = await ClientService.blockClient(
      tenantId,
      clientId,
      reason,
      adminId
    );

    if (!tenantClient) {
      return res.status(404).json({
        success: false,
        error: "Client not found for this business",
      });
    }

    res.json({
      success: true,
      message: "Client blocked successfully",
      tenantClient,
    });
  } catch (error) {
    console.error("[Admin Clients] Error blocking client:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to block client",
    });
  }
});

/**
 * POST /api/admin/clients/:clientId/unblock
 * Unblock a client
 * Access: Admin only, tenant-scoped
 */
router.post("/:clientId/unblock", requireAdmin, async (req, res) => {
  try {
    const { tenantId } = req.admin;
    const { clientId } = req.params;

    const tenantClient = await ClientService.unblockClient(tenantId, clientId);

    if (!tenantClient) {
      return res.status(404).json({
        success: false,
        error: "Client not found for this business",
      });
    }

    res.json({
      success: true,
      message: "Client unblocked successfully",
      tenantClient,
    });
  } catch (error) {
    console.error("[Admin Clients] Error unblocking client:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to unblock client",
    });
  }
});

/**
 * GET /api/admin/clients/segments/all
 * Get client segments (VIP, at-risk, new, active)
 * Access: Admin only, tenant-scoped
 */
router.get("/segments/all", requireAdmin, async (req, res) => {
  try {
    const { tenantId } = req.admin;

    const segments = await ClientService.segmentClients(tenantId);

    res.json({
      success: true,
      segments: {
        vip: segments.vip.length,
        atRisk: segments.atRisk.length,
        new: segments.new.length,
        active: segments.active.length,
      },
      details: segments,
    });
  } catch (error) {
    console.error("[Admin Clients] Error fetching segments:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch client segments",
    });
  }
});

export default router;
