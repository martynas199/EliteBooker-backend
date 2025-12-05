import { Router } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { z } from "zod";
import Beautician from "../models/Beautician.js";
import Service from "../models/Service.js";
import Appointment from "../models/Appointment.js";
import {
  computeSlotsForBeautician,
  computeSlotsAnyStaff,
} from "../utils/slotPlanner.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const r = Router();

// Cache for fully-booked endpoint (60 seconds TTL)
const fullyBookedCache = new Map();
const CACHE_TTL = 60000;

/**
 * Normalize beautician object for slot computation
 * Converts Date objects to ISO strings for timeOff and Map to object for customSchedule
 */
function normalizeBeautician(beautician) {
  if (!beautician) return beautician;

  const normalized = {
    ...beautician,
    timeOff: (beautician.timeOff || []).map((off) => ({
      start: off.start instanceof Date ? off.start.toISOString() : off.start,
      end: off.end instanceof Date ? off.end.toISOString() : off.end,
      reason: off.reason,
    })),
    // Convert Map to plain object for customSchedule (only if it's a Map)
    customSchedule:
      beautician.customSchedule instanceof Map
        ? Object.fromEntries(beautician.customSchedule)
        : beautician.customSchedule || {},
  };

  return normalized;
}

/**
 * GET /api/slots/fully-booked
 * Returns dates that are fully booked (no available slots) for a beautician in a month
 */
r.get("/fully-booked", async (req, res) => {
  try {
    // TENANT FILTERING: REQUIRED - Multi-tenant app must always filter by tenant
    if (!req.tenantId) {
      console.log("[SLOTS] ERROR: No tenantId found in request");
      return res.status(400).json({
        error: "Tenant context required. Please provide tenant information.",
      });
    }

    const { beauticianId, year, month } = req.query;

    // Validation
    if (!beauticianId || !year || !month) {
      return res.status(400).json({
        error: "Missing required parameters: beauticianId, year, month",
      });
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: "Invalid year or month" });
    }

    // Check cache
    const cacheKey = `${beauticianId}:${year}-${String(monthNum).padStart(
      2,
      "0"
    )}`;
    const cached = fullyBookedCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ fullyBooked: cached.data });
    }

    // Fetch beautician
    const beautician = await Beautician.findById(beauticianId).lean();
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    console.log(
      `[/slots/fully-booked] Checking beautician ${beautician.name} for ${year}-${monthNum}`
    );
    console.log(
      `[/slots/fully-booked] Working hours:`,
      beautician.workingHours
    );

    // Get services for this beautician
    const services = await Service.find({
      $or: [
        { beauticianId: beauticianId },
        { beauticianIds: beauticianId },
        { primaryBeauticianId: beauticianId },
        { additionalBeauticianIds: beauticianId },
      ],
      active: { $ne: false },
    }).lean();

    if (services.length === 0) {
      // No services = all days fully booked
      const daysInMonth = dayjs(
        `${year}-${String(monthNum).padStart(2, "0")}-01`
      ).daysInMonth();
      const allDates = Array.from(
        { length: daysInMonth },
        (_, i) =>
          `${year}-${String(monthNum).padStart(2, "0")}-${String(
            i + 1
          ).padStart(2, "0")}`
      );
      fullyBookedCache.set(cacheKey, { data: allDates, timestamp: Date.now() });
      return res.json({ fullyBooked: allDates });
    }

    const salonTz = process.env.SALON_TZ || "Europe/London";
    const fullyBookedSet = new Set();

    // Get month boundaries
    const monthStart = dayjs
      .tz(`${year}-${String(monthNum).padStart(2, "0")}-01`, salonTz)
      .startOf("day");
    const monthEnd = monthStart.endOf("month");
    const today = dayjs().tz(salonTz).startOf("day");

    // Check each day in the month
    const daysInMonth = monthStart.daysInMonth();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;
      const dateObj = dayjs.tz(dateStr, salonTz);

      // Past dates are fully booked
      if (dateObj.isBefore(today, "day")) {
        fullyBookedSet.add(dateStr);
        continue;
      }

      // Check if beautician works this day
      const dayOfWeek = dateObj.day();
      const worksThisDay = beautician.workingHours?.some(
        (wh) =>
          wh && typeof wh.dayOfWeek === "number" && wh.dayOfWeek === dayOfWeek
      );

      if (!worksThisDay) {
        fullyBookedSet.add(dateStr);
        continue;
      }

      // Check if any service has available slots
      let hasAvailableSlots = false;

      for (const service of services) {
        try {
          const variant = service.variants?.[0] || {
            durationMin: service.durationMin || 60,
            bufferBeforeMin: 0,
            bufferAfterMin: 10,
          };

          const dayStart = dateObj.toDate();
          const dayEnd = dateObj.add(1, "day").toDate();
          const appts = await Appointment.find({
            beauticianId,
            start: { $gte: dayStart, $lt: dayEnd },
            status: { $ne: "cancelled" },
          }).lean();

          const slots = computeSlotsForBeautician({
            date: dateStr,
            salonTz,
            stepMin: 15,
            service: {
              durationMin: variant.durationMin,
              bufferBeforeMin: variant.bufferBeforeMin || 0,
              bufferAfterMin: variant.bufferAfterMin || 0,
            },
            beautician: normalizeBeautician(beautician),
            appointments: appts.map((a) => ({
              start: new Date(a.start).toISOString(),
              end: new Date(a.end).toISOString(),
              status: a.status,
            })),
          });

          if (slots.length > 0) {
            hasAvailableSlots = true;
            break;
          }
        } catch (err) {
          console.error(`Error computing slots for ${dateStr}:`, err.message);
        }
      }

      if (!hasAvailableSlots) {
        fullyBookedSet.add(dateStr);
      }
    }

    const result = Array.from(fullyBookedSet).sort();

    // Cache result
    fullyBookedCache.set(cacheKey, { data: result, timestamp: Date.now() });

    res.json({ fullyBooked: result });
  } catch (error) {
    console.error("Error in /api/slots/fully-booked:", error);
    res.status(500).json({
      error: "Failed to fetch fully booked dates",
      message: error.message,
    });
  }
});

r.get("/", async (req, res) => {
  // TENANT FILTERING: REQUIRED - Multi-tenant app must always filter by tenant
  if (!req.tenantId) {
    console.log("[SLOTS] ERROR: No tenantId found in request");
    return res.status(400).json({
      error: "Tenant context required. Please provide tenant information.",
    });
  }

  const { beauticianId, serviceId, variantName, date, any } = req.query;
  if (!serviceId || !variantName || !date)
    return res.status(400).json({ error: "Missing params" });
  const service = await Service.findById(serviceId).lean();
  if (!service) return res.status(404).json({ error: "Service not found" });
  const variant = (service.variants || []).find((v) => v.name === variantName);
  if (!variant) return res.status(404).json({ error: "Variant not found" });
  const svc = {
    durationMin: variant.durationMin,
    bufferBeforeMin: variant.bufferBeforeMin || 0,
    bufferAfterMin: variant.bufferAfterMin || 0,
  };
  const salonTz = process.env.SALON_TZ || "Europe/London";
  const stepMin = Number(process.env.SLOTS_STEP_MIN || 15);
  let slots = [];
  if (any === "true") {
    // Single-beautician per service: resolve assigned beautician and compute directly
    const targetId = service.beauticianId || (service.beauticianIds || [])[0];
    if (!targetId)
      return res
        .status(400)
        .json({ error: "Service has no assigned beautician" });
    const b = await Beautician.findById(targetId).lean();
    if (!b) return res.status(404).json({ error: "Beautician not found" });
    const dayStart = new Date(date);
    const dayEnd = new Date(new Date(date).getTime() + 86400000);
    const appts = await Appointment.find({
      beauticianId: targetId,
      start: { $gte: dayStart, $lt: dayEnd },
      status: { $ne: "cancelled" },
    }).lean();
    slots = computeSlotsForBeautician({
      date,
      salonTz,
      stepMin,
      service: svc,
      beautician: normalizeBeautician(b),
      appointments: appts.map((a) => ({
        start: new Date(a.start).toISOString(),
        end: new Date(a.end).toISOString(),
        status: a.status,
      })),
    });
  } else {
    const b = await Beautician.findById(beauticianId).lean();
    if (!b) return res.status(404).json({ error: "Beautician not found" });

    const normalizedBeautician = normalizeBeautician(b);

    const appts = await Appointment.find({
      beauticianId,
      start: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).getTime() + 86400000),
      },
      status: { $ne: "cancelled" },
    }).lean();

    slots = computeSlotsForBeautician({
      date,
      salonTz,
      stepMin,
      service: svc,
      beautician: normalizedBeautician, // Use the same normalized instance
      appointments: appts.map((a) => ({
        start: new Date(a.start).toISOString(),
        end: new Date(a.end).toISOString(),
        status: a.status,
      })),
    });
  }
  res.json({ slots });
});
export default r;
