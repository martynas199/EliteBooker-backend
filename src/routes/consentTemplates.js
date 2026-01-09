import express from "express";
import ConsentTemplate from "../models/ConsentTemplate.js";
import requireAdmin from "../middleware/requireAdmin.js";

const router = express.Router();

/**
 * GET /api/consent-templates
 * List all consent templates for business
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { status, serviceId } = req.query;

    const query = { businessId: tenantId };

    if (status) {
      query.status = status;
    }

    if (serviceId) {
      query["requiredFor.services"] = serviceId;
    }

    const templates = await ConsentTemplate.find(query)
      .populate("requiredFor.services", "name category")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error("Error fetching consent templates:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch consent templates",
      error: error.message,
    });
  }
});

/**
 * GET /api/consent-templates/:id
 * Get single consent template
 */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const template = await ConsentTemplate.findOne({
      _id: id,
      businessId: tenantId,
    })
      .populate("requiredFor.services", "name category duration price")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Consent template not found",
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error("Error fetching consent template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch consent template",
      error: error.message,
    });
  }
});

/**
 * POST /api/consent-templates
 * Create new consent template (draft)
 */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const adminId = req.admin._id;
    const { name, description, sections, requiredFor, disclaimers, risks } =
      req.body;

    // Validation
    if (!name || !sections || sections.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Template name and sections are required",
      });
    }

    // Check for duplicate name
    const existingTemplate = await ConsentTemplate.findOne({
      businessId: tenantId,
      name,
      status: { $ne: "archived" },
    });

    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        message: "A template with this name already exists",
      });
    }

    const template = new ConsentTemplate({
      businessId: tenantId,
      name,
      description,
      sections: sections.map((section, index) => ({
        ...section,
        order: section.order || index,
      })),
      requiredFor: requiredFor || {
        services: [],
        frequency: "first_visit_only",
      },
      disclaimers: disclaimers || [],
      risks: risks || [],
      status: "draft",
      createdBy: adminId,
    });

    await template.save();

    res.status(201).json({
      success: true,
      message: "Consent template created successfully",
      data: template,
    });
  } catch (error) {
    console.error("Error creating consent template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create consent template",
      error: error.message,
    });
  }
});

/**
 * PUT /api/consent-templates/:id
 * Update consent template (only drafts)
 */
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const adminId = req.admin._id;
    const { id } = req.params;
    const { name, description, sections, requiredFor, disclaimers, risks } =
      req.body;

    const template = await ConsentTemplate.findOne({
      _id: id,
      businessId: tenantId,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Consent template not found",
      });
    }

    if (template.status !== "draft") {
      return res.status(400).json({
        success: false,
        message:
          "Only draft templates can be edited. Create a new version instead.",
      });
    }

    // Update fields
    if (name) template.name = name;
    if (description !== undefined) template.description = description;
    if (sections) {
      template.sections = sections.map((section, index) => ({
        ...section,
        order: section.order || index,
      }));
    }
    if (requiredFor) template.requiredFor = requiredFor;
    if (disclaimers) template.disclaimers = disclaimers;
    if (risks) template.risks = risks;
    template.updatedBy = adminId;

    await template.save();

    res.json({
      success: true,
      message: "Consent template updated successfully",
      data: template,
    });
  } catch (error) {
    console.error("Error updating consent template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update consent template",
      error: error.message,
    });
  }
});

/**
 * POST /api/consent-templates/:id/publish
 * Publish consent template (lock it)
 */
router.post("/:id/publish", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const adminId = req.admin._id;
    const { id } = req.params;

    const template = await ConsentTemplate.findOne({
      _id: id,
      businessId: tenantId,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Consent template not found",
      });
    }

    if (template.status !== "draft") {
      return res.status(400).json({
        success: false,
        message: "Only draft templates can be published",
      });
    }

    // Validate template has required sections
    const hasSignature = template.sections.some((s) => s.type === "signature");
    if (!hasSignature) {
      return res.status(400).json({
        success: false,
        message: "Template must include a signature section",
      });
    }

    await template.publish(adminId);

    res.json({
      success: true,
      message: "Consent template published successfully",
      data: template,
    });
  } catch (error) {
    console.error("Error publishing consent template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to publish consent template",
      error: error.message,
    });
  }
});

/**
 * POST /api/consent-templates/:id/new-version
 * Create new version of published template
 */
router.post("/:id/new-version", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const adminId = req.admin._id;
    const { id } = req.params;

    const template = await ConsentTemplate.findOne({
      _id: id,
      businessId: tenantId,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Consent template not found",
      });
    }

    if (template.status !== "published") {
      return res.status(400).json({
        success: false,
        message: "Can only create new versions from published templates",
      });
    }

    // Create new version
    const newVersion = await template.createNewVersion();

    res.status(201).json({
      success: true,
      message: `Version ${newVersion.version} created successfully`,
      data: newVersion,
    });
  } catch (error) {
    console.error("Error creating template version:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create template version",
      error: error.message,
    });
  }
});

/**
 * POST /api/consent-templates/:id/archive
 * Archive consent template
 */
router.post("/:id/archive", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const adminId = req.admin._id;
    const { id } = req.params;

    const template = await ConsentTemplate.findOne({
      _id: id,
      businessId: tenantId,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Consent template not found",
      });
    }

    await template.archive(adminId);

    res.json({
      success: true,
      message: "Consent template archived successfully",
      data: template,
    });
  } catch (error) {
    console.error("Error archiving consent template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to archive consent template",
      error: error.message,
    });
  }
});

/**
 * DELETE /api/consent-templates/:id
 * Delete consent template (only drafts with no records)
 */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const template = await ConsentTemplate.findOne({
      _id: id,
      businessId: tenantId,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Consent template not found",
      });
    }

    if (template.status !== "draft") {
      return res.status(400).json({
        success: false,
        message:
          "Can only delete draft templates. Archive published templates instead.",
      });
    }

    // Check if any consent records exist
    const { default: ConsentRecord } = await import(
      "../models/ConsentRecord.js"
    );
    const recordCount = await ConsentRecord.countDocuments({
      consentTemplateId: template._id,
    });

    if (recordCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete template with existing consent records",
      });
    }

    await template.deleteOne();

    res.json({
      success: true,
      message: "Consent template deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting consent template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete consent template",
      error: error.message,
    });
  }
});

/**
 * GET /api/consent-templates/service/:serviceId
 * Get active consent template for a service (for client signing)
 */
router.get("/service/:serviceId", async (req, res) => {
  try {
    const { serviceId } = req.params;

    const template = await ConsentTemplate.findOne({
      "requiredFor.services": serviceId,
      status: "published",
    })
      .select("-createdBy -updatedBy")
      .lean();

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "No consent template found for this service",
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error("Error fetching consent template for service:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch consent template",
      error: error.message,
    });
  }
});

/**
 * GET /api/consent-templates/check-required/:serviceId
 * Check if consent is required for a service
 */
router.get("/check-required/:serviceId", async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: "Client ID is required",
      });
    }

    const result = await ConsentTemplate.isConsentRequired(serviceId, clientId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error checking consent requirement:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check consent requirement",
      error: error.message,
    });
  }
});

export default router;
