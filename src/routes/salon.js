import { Router } from "express";
import Settings from "../models/Settings.js";
import Tenant from "../models/Tenant.js";
import { optionalAuth } from "../middleware/optionalAuth.js";

const r = Router();

r.get("/", optionalAuth, async (req, res) => {
  // TENANT FILTERING: REQUIRED - Multi-tenant app must always filter by tenant
  if (!req.tenantId) {
    console.log("[SALON] ERROR: No tenantId found in request");
    return res.status(400).json({
      error: "Tenant context required. Please provide tenant information.",
    });
  }

  // Get settings from database (multi-tenant will automatically scope to current tenant)
  let settings = await Settings.findOne().lean();

  // Get tenant info for slug
  let tenant = await Tenant.findById(req.tenantId).lean();

  // Use settings values or fall back to env variables
  const name = settings?.salonName || process.env.SALON_NAME || "Your Salon";
  const phone = settings?.salonPhone || process.env.SALON_PHONE || "";
  const email = settings?.salonEmail || process.env.SALON_EMAIL || "";
  const address = settings?.salonAddress || process.env.SALON_ADDRESS || "";
  const tz = process.env.SALON_TZ || "Europe/London";
  const heroUrl = settings?.heroImage?.url || process.env.SALON_HERO_URL || "";
  const about = settings?.salonDescription || process.env.SALON_ABOUT || "";

  // Default hours if no settings exist
  const defaultHours = {
    mon: { start: "09:00", end: "17:00" },
    tue: { start: "09:00", end: "17:00" },
    wed: { start: "09:00", end: "17:00" },
    thu: { start: "09:00", end: "17:00" },
    fri: { start: "09:00", end: "17:00" },
    sat: { start: "09:00", end: "13:00" },
    sun: null,
  };

  const workingHours = settings?.workingHours || defaultHours;

  // Format hours for response
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const hours = {};
  for (const d of days) {
    const dayHours = workingHours[d];
    hours[d] = dayHours
      ? { open: true, start: dayHours.start, end: dayHours.end }
      : { open: false };
  }

  res.json({
    name,
    phone,
    email,
    address,
    tz,
    heroUrl,
    about,
    hours,
    slug: tenant?.slug || null,
    businessName: tenant?.businessName || name,
  });
});

export default r;
