import { Router } from "express";
import { z } from "zod";
import WaitlistEntry from "../models/WaitlistEntry.js";
import Service from "../models/Service.js";
import Specialist from "../models/Specialist.js";
import requireAdmin from "../middleware/requireAdmin.js";

const router = Router();

const joinWaitlistSchema = z.object({
  serviceId: z.string().min(1),
  variantName: z.string().min(1),
  specialistId: z.string().optional().nullable(),
  desiredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  timePreference: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
  client: z.object({
    userId: z.string().optional().nullable(),
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional().nullable(),
  }),
  notes: z.string().max(1000).optional(),
});

const waitlistStatusEnum = z.enum([
  "active",
  "converted",
  "expired",
  "removed",
]);

const bulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  status: waitlistStatusEnum,
});

function resolveAuditActor(req, fallbackBy = "system") {
  if (req?.admin?._id) {
    return {
      by: `admin:${String(req.admin._id)}`,
      actor: {
        id: String(req.admin._id),
        name: req.admin.name || "",
        email: req.admin.email || "",
        role: req.admin.role || "admin",
      },
    };
  }
  return {
    by: fallbackBy,
    actor: null,
  };
}

function createAuditEntry({ action, req, fallbackBy = "system", meta = {} }) {
  const { by, actor } = resolveAuditActor(req, fallbackBy);
  return {
    action,
    at: new Date(),
    by,
    meta: {
      ...meta,
      ...(actor ? { actor } : {}),
    },
  };
}

function buildStatusUpdatePayload({ status, auditEntry }) {
  const now = new Date();
  const update = {
    $set: { status },
    $push: { audit: auditEntry },
  };

  if (status === "active") {
    update.$unset = {
      notifiedAt: "",
      convertedAt: "",
      convertedAppointmentId: "",
    };
    return update;
  }

  update.$set.notifiedAt = now;
  if (status === "converted") {
    update.$set.convertedAt = now;
  }

  return update;
}

function toTimelineEvent({ entry, event, source = "audit", action }) {
  const at = event?.at || entry?.updatedAt || entry?.createdAt || null;
  if (!at) return null;

  return {
    id: `${String(entry._id)}:${String(at)}:${source}:${action || event?.action || "event"}`,
    waitlistEntryId: String(entry._id),
    action: action || event?.action || "waitlist_event",
    at,
    by: event?.by || "system",
    source,
    status: entry.status,
    clientName: entry.client?.name || "Client",
    serviceName: entry.serviceId?.name || "Service",
    variantName: entry.variantName || "",
    meta: event?.meta || {},
  };
}

function requireTenantId(req, res) {
  if (!req.tenantId) {
    res.status(403).json({ error: "Tenant context required" });
    return false;
  }
  return true;
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.post("/", async (req, res) => {
  try {
    if (!requireTenantId(req, res)) return;

    const body = joinWaitlistSchema.parse(req.body || {});

    const service = await Service.findById(body.serviceId).lean();
    if (!service || service.active === false) {
      return res.status(404).json({ error: "Service not found" });
    }

    const variantExists = (service.variants || []).some(
      (variant) => variant.name === body.variantName,
    );
    if (!variantExists) {
      return res.status(400).json({ error: "Service variant not found" });
    }

    if (body.specialistId) {
      const specialist = await Specialist.findById(body.specialistId).lean();
      if (!specialist || specialist.active === false) {
        return res.status(404).json({ error: "Specialist not found" });
      }
    }

    const normalizedEmail = body.client.email.toLowerCase().trim();

    const duplicate = await WaitlistEntry.findOne({
      tenantId: req.tenantId,
      status: "active",
      serviceId: body.serviceId,
      variantName: body.variantName,
      specialistId: body.specialistId || null,
      desiredDate: body.desiredDate || null,
      "client.email": normalizedEmail,
    }).lean();

    if (duplicate) {
      return res.status(200).json({
        success: true,
        message: "Client is already on the waitlist for this request.",
        waitlistEntry: duplicate,
      });
    }

    const waitlistEntry = await WaitlistEntry.create({
      tenantId: req.tenantId,
      serviceId: body.serviceId,
      variantName: body.variantName,
      specialistId: body.specialistId || null,
      desiredDate: body.desiredDate || null,
      timePreference: body.timePreference || "any",
      client: {
        userId: body.client.userId || null,
        name: body.client.name.trim(),
        email: normalizedEmail,
        phone: body.client.phone?.trim() || "",
      },
      notes: body.notes?.trim(),
      source: req.admin ? "admin_manual" : "public_booking",
      status: "active",
      audit: [
        createAuditEntry({
          action: "waitlist_joined",
          req,
          fallbackBy: body.client.userId
            ? `client:${body.client.userId}`
            : `client:${normalizedEmail}`,
          meta: {
            source: req.admin ? "admin_manual" : "public_booking",
          },
        }),
      ],
    });

    res.status(201).json({
      success: true,
      message: "Added to waitlist successfully.",
      waitlistEntry,
    });
  } catch (error) {
    console.error("waitlist_create_err", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid waitlist payload",
        details: error.errors,
      });
    }
    res.status(500).json({ error: "Failed to add to waitlist" });
  }
});

router.get("/", requireAdmin, async (req, res) => {
  try {
    if (!requireTenantId(req, res)) return;

    const requestedStatus =
      typeof req.query.status === "string" && req.query.status.trim()
        ? req.query.status.trim()
        : "active";
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
    const skip = (page - 1) * limit;
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    const baseQuery = {
      tenantId: req.tenantId,
    };

    if (req.query.serviceId) {
      baseQuery.serviceId = req.query.serviceId;
    }
    if (req.query.specialistId) {
      baseQuery.specialistId = req.query.specialistId;
    }
    if (search) {
      const safeRegex = new RegExp(escapeRegex(search), "i");
      baseQuery.$or = [
        { "client.name": safeRegex },
        { "client.email": safeRegex },
        { "client.phone": safeRegex },
      ];
    }

    const query = { ...baseQuery };
    if (requestedStatus !== "all") {
      query.status = requestedStatus;
    }

    const [entries, total, statusBuckets] = await Promise.all([
      WaitlistEntry.find(query)
        .populate("serviceId", "name")
        .populate("specialistId", "name")
        .sort({ priority: -1, createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WaitlistEntry.countDocuments(query),
      WaitlistEntry.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statusCounts = statusBuckets.reduce(
      (acc, bucket) => {
        if (bucket?._id) {
          acc[bucket._id] = bucket.count;
        }
        return acc;
      },
      { active: 0, converted: 0, expired: 0, removed: 0 },
    );

    const pages = Math.max(Math.ceil(total / limit), 1);
    const hasMore = page < pages;

    res.json({
      entries,
      counts: {
        active: statusCounts.active || 0,
        converted: statusCounts.converted || 0,
        expired: statusCounts.expired || 0,
        removed: statusCounts.removed || 0,
      },
      pagination: {
        page,
        limit,
        total,
        pages,
        hasMore,
      },
    });
  } catch (error) {
    console.error("waitlist_list_err", error);
    res.status(500).json({ error: "Failed to fetch waitlist entries" });
  }
});

router.get("/analytics", requireAdmin, async (req, res) => {
  try {
    if (!requireTenantId(req, res)) return;

    const timelineLimit = Math.min(
      Math.max(Number(req.query.limit) || 12, 5),
      50,
    );
    const baseQuery = { tenantId: req.tenantId };

    const [summaryBuckets, avgConversionResult, recentEntries] =
      await Promise.all([
        WaitlistEntry.aggregate([
          { $match: baseQuery },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
              },
              converted: {
                $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] },
              },
              expired: {
                $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] },
              },
              removed: {
                $sum: { $cond: [{ $eq: ["$status", "removed"] }, 1, 0] },
              },
              autoFilled: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$status", "converted"] },
                        { $ne: ["$convertedAppointmentId", null] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        WaitlistEntry.aggregate([
          {
            $match: {
              tenantId: req.tenantId,
              createdAt: { $type: "date" },
              convertedAt: { $type: "date" },
            },
          },
          {
            $project: {
              diffMs: { $subtract: ["$convertedAt", "$createdAt"] },
            },
          },
          { $match: { diffMs: { $gte: 0 } } },
          { $group: { _id: null, avgMs: { $avg: "$diffMs" } } },
        ]),
        WaitlistEntry.find(baseQuery)
          .populate("serviceId", "name")
          .sort({ updatedAt: -1 })
          .limit(Math.max(timelineLimit * 5, 40))
          .select(
            "client serviceId variantName status createdAt updatedAt convertedAt notifiedAt convertedAppointmentId audit",
          )
          .lean(),
      ]);

    const summary = summaryBuckets?.[0] || {
      total: 0,
      active: 0,
      converted: 0,
      expired: 0,
      removed: 0,
      autoFilled: 0,
    };

    const timelineEvents = [];

    for (const entry of recentEntries) {
      const auditEvents = Array.isArray(entry.audit) ? entry.audit : [];
      let hasJoinedAudit = false;
      let hasConvertedAudit = false;
      let hasStatusAudit = false;

      for (const auditEvent of auditEvents) {
        const normalizedAction = String(auditEvent?.action || "").toLowerCase();
        if (normalizedAction === "waitlist_joined") hasJoinedAudit = true;
        if (normalizedAction.includes("convert")) hasConvertedAudit = true;
        if (normalizedAction.includes("status")) hasStatusAudit = true;

        const timelineEvent = toTimelineEvent({
          entry,
          event: auditEvent,
          source: "audit",
        });
        if (timelineEvent) {
          timelineEvents.push(timelineEvent);
        }
      }

      if (!hasJoinedAudit && entry.createdAt) {
        const joinedFallback = toTimelineEvent({
          entry,
          event: {
            at: entry.createdAt,
            by: "system",
            meta: { source: "legacy_fallback" },
          },
          source: "fallback",
          action: "waitlist_joined",
        });
        if (joinedFallback) {
          timelineEvents.push(joinedFallback);
        }
      }

      if (!hasConvertedAudit && entry.convertedAt) {
        const convertedFallback = toTimelineEvent({
          entry,
          event: {
            at: entry.convertedAt,
            by: "system",
            meta: {
              source: "legacy_fallback",
              convertedAppointmentId: entry.convertedAppointmentId
                ? String(entry.convertedAppointmentId)
                : null,
            },
          },
          source: "fallback",
          action: "waitlist_converted",
        });
        if (convertedFallback) {
          timelineEvents.push(convertedFallback);
        }
      }

      if (
        !hasStatusAudit &&
        (entry.status === "expired" || entry.status === "removed") &&
        entry.notifiedAt
      ) {
        const statusFallback = toTimelineEvent({
          entry,
          event: {
            at: entry.notifiedAt,
            by: "system",
            meta: {
              source: "legacy_fallback",
              status: entry.status,
            },
          },
          source: "fallback",
          action: "waitlist_status_updated",
        });
        if (statusFallback) {
          timelineEvents.push(statusFallback);
        }
      }
    }

    timelineEvents.sort((a, b) => new Date(b.at) - new Date(a.at));

    const averageConversionMs = avgConversionResult?.[0]?.avgMs || null;
    const averageConversionHours =
      averageConversionMs != null
        ? Number((averageConversionMs / (1000 * 60 * 60)).toFixed(1))
        : null;

    res.json({
      totals: {
        total: summary.total,
        active: summary.active,
        converted: summary.converted,
        expired: summary.expired,
        removed: summary.removed,
      },
      conversionRate:
        summary.total > 0
          ? Number(((summary.converted / summary.total) * 100).toFixed(1))
          : 0,
      autoFilledConversions: summary.autoFilled,
      averageConversionHours,
      timeline: timelineEvents.slice(0, timelineLimit),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("waitlist_analytics_err", error);
    res.status(500).json({ error: "Failed to fetch waitlist analytics" });
  }
});

router.post("/bulk-status", requireAdmin, async (req, res) => {
  try {
    if (!requireTenantId(req, res)) return;

    const { ids, status } = bulkStatusSchema.parse(req.body || {});
    const uniqueIds = [...new Set(ids)];
    const update = buildStatusUpdatePayload({
      status,
      auditEntry: createAuditEntry({
        action: "waitlist_bulk_status_updated",
        req,
        meta: {
          status,
          idsCount: uniqueIds.length,
        },
      }),
    });

    const result = await WaitlistEntry.updateMany(
      {
        _id: { $in: uniqueIds },
        tenantId: req.tenantId,
      },
      update,
    );

    res.json({
      success: true,
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("waitlist_bulk_status_err", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid waitlist bulk status payload",
        details: error.errors,
      });
    }
    res.status(500).json({ error: "Failed to update waitlist entries" });
  }
});

router.patch("/:id/status", requireAdmin, async (req, res) => {
  try {
    if (!requireTenantId(req, res)) return;

    const bodySchema = z.object({
      status: waitlistStatusEnum,
    });
    const { status } = bodySchema.parse(req.body || {});

    const updated = await WaitlistEntry.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      buildStatusUpdatePayload({
        status,
        auditEntry: createAuditEntry({
          action: "waitlist_status_updated",
          req,
          meta: { status },
        }),
      }),
      { new: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "Waitlist entry not found" });
    }

    res.json({ success: true, waitlistEntry: updated });
  } catch (error) {
    console.error("waitlist_status_update_err", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid waitlist status payload",
        details: error.errors,
      });
    }
    res.status(500).json({ error: "Failed to update waitlist entry status" });
  }
});

export default router;
