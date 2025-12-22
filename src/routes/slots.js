import { Router } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { z } from "zod";
import Specialist from "../models/Specialist.js";
import Service from "../models/Service.js";
import Appointment from "../models/Appointment.js";
import {
  computeSlotsForBeautician,
  computeSlotsAnyStaff,
} from "../utils/slotPlanner.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const r = Router();

// Cache for fully-booked endpoint (5 minutes TTL for better performance)
const fullyBookedCache = new Map();
const CACHE_TTL = 300000; // 5 minutes (was 60 seconds)

/**
 * Normalize specialist object for slot computation
 * Converts Date objects to ISO strings for timeOff and Map to object for customSchedule
 */
function normalizeBeautician(specialist) {
  if (!specialist) return specialist;

  const normalized = {
    ...specialist,
    timeOff: (specialist.timeOff || []).map((off) => ({
      start: off.start instanceof Date ? off.start.toISOString() : off.start,
      end: off.end instanceof Date ? off.end.toISOString() : off.end,
      reason: off.reason,
    })),
    // Convert Map to plain object for customSchedule (only if it's a Map)
    customSchedule:
      specialist.customSchedule instanceof Map
        ? Object.fromEntries(specialist.customSchedule)
        : specialist.customSchedule || {},
  };

  return normalized;
}

/**
 * GET /api/slots/fully-booked
 * Returns dates that are fully booked (no available slots) for a specialist in a month
 */
r.get("/fully-booked", async (req, res) => {
  const startTime = Date.now();

  try {
    // TENANT FILTERING: REQUIRED - Multi-tenant app must always filter by tenant
    if (!req.tenantId) {
      console.log("[SLOTS] ERROR: No tenantId found in request");
      return res.status(400).json({
        error: "Tenant context required. Please provide tenant information.",
      });
    }

    const { specialistId, year, month } = req.query;

    // Validation
    if (!specialistId || !year || !month) {
      return res.status(400).json({
        error: "Missing required parameters: specialistId, year, month",
      });
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: "Invalid year or month" });
    }

    // Check cache
    const cacheKey = `${specialistId}:${year}-${String(monthNum).padStart(
      2,
      "0"
    )}`;
    const cached = fullyBookedCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ fullyBooked: cached.data });
    }

    // Fetch specialist
    const specialist = await Specialist.findById(specialistId).lean();
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Get services for this specialist
    const services = await Service.find({
      $or: [
        { specialistId: specialistId },
        { beauticianIds: specialistId },
        { primaryBeauticianId: specialistId },
        { additionalBeauticianIds: specialistId },
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

    // OPTIMIZATION: Fetch ALL appointments for the entire month at once
    const monthStartDate = monthStart.toDate();
    // Use end-exclusive bound for safer date range querying
    const monthEndExclusiveDate = monthEnd.add(1, "millisecond").toDate();

    const allMonthAppts = await Appointment.find({
      specialistId,
      start: { $gte: monthStartDate, $lt: monthEndExclusiveDate },
      status: { $ne: "cancelled" },
    }).lean();

    // Group appointments by date for quick lookup
    // OPTIMIZATION: Convert to ISO strings once here instead of per-day per-service
    const apptsByDate = {};
    allMonthAppts.forEach((appt) => {
      const dateStr = dayjs(appt.start).tz(salonTz).format("YYYY-MM-DD");
      if (!apptsByDate[dateStr]) apptsByDate[dateStr] = [];
      apptsByDate[dateStr].push({
        start: new Date(appt.start).toISOString(),
        end: new Date(appt.end).toISOString(),
        status: appt.status,
      });
    });

    // OPTIMIZATION: Normalize specialist once before loop instead of per-day
    const normalizedSpecialist = normalizeBeautician(specialist);

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

      // Check if specialist works this day (either regular hours OR custom schedule)
      const dayOfWeek = dateObj.day();
      
      // Normalize custom schedule (convert Map to object if needed)
      const normalizedCustomSchedule =
        specialist.customSchedule instanceof Map
          ? Object.fromEntries(specialist.customSchedule)
          : specialist.customSchedule || {};
      
      const hasCustomSchedule = normalizedCustomSchedule[dateStr] && 
        Array.isArray(normalizedCustomSchedule[dateStr]) &&
        normalizedCustomSchedule[dateStr].length > 0;
      
      const worksThisDay = specialist.workingHours?.some(
        (wh) =>
          wh && typeof wh.dayOfWeek === "number" && wh.dayOfWeek === dayOfWeek
      );

      // Skip only if there's no regular working hours AND no custom schedule
      if (!worksThisDay && !hasCustomSchedule) {
        fullyBookedSet.add(dateStr);
        continue;
      }

      // Check if any service has available slots
      let hasAvailableSlots = false;

      // Use pre-fetched/normalized appointments for this date (compute once per day)
      const dayAppts = apptsByDate[dateStr] || [];

      for (const service of services) {
        try {
          const variant = service.variants?.[0] || {
            durationMin: service.durationMin || 60,
            bufferBeforeMin: 0,
            bufferAfterMin: 10,
          };

          const slots = computeSlotsForBeautician({
            date: dateStr,
            salonTz,
            stepMin: 15,
            service: {
              durationMin: variant.durationMin,
              bufferBeforeMin: variant.bufferBeforeMin || 0,
              bufferAfterMin: variant.bufferAfterMin || 0,
            },
            specialist: normalizedSpecialist, // Use pre-normalized specialist
            appointments: dayAppts, // Already in correct format!
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

  const { specialistId, serviceId, variantName, date, any, totalDuration } =
    req.query;

  if (!serviceId || !variantName || !date)
    return res.status(400).json({ error: "Missing params" });

  const service = await Service.findById(serviceId).lean();
  if (!service) return res.status(404).json({ error: "Service not found" });
  const variant = (service.variants || []).find((v) => v.name === variantName);
  if (!variant) return res.status(404).json({ error: "Variant not found" });

  // Use totalDuration if provided (multi-service booking), otherwise use variant duration
  const durationMin = totalDuration
    ? parseInt(totalDuration)
    : variant.durationMin;

  const svc = {
    durationMin: durationMin,
    bufferBeforeMin: variant.bufferBeforeMin || 0,
    bufferAfterMin: variant.bufferAfterMin || 0,
  };

  const salonTz = process.env.SALON_TZ || "Europe/London";
  const stepMin = Number(process.env.SLOTS_STEP_MIN || 15);
  let slots = [];
  if (any === "true") {
    // Single-specialist per service: resolve assigned specialist and compute directly
    const targetId = service.specialistId || (service.beauticianIds || [])[0];
    if (!targetId)
      return res
        .status(400)
        .json({ error: "Service has no assigned specialist" });
    const b = await Specialist.findById(targetId).lean();
    if (!b) return res.status(404).json({ error: "Specialist not found" });
    const dayStart = new Date(date);
    const dayEnd = new Date(new Date(date).getTime() + 86400000);

    const appts = await Appointment.find({
      specialistId: targetId,
      start: { $gte: dayStart, $lt: dayEnd },
      status: { $ne: "cancelled" },
    }).lean();

    const appointmentsForSlots = appts.map((a) => ({
      start: new Date(a.start).toISOString(),
      end: new Date(a.end).toISOString(),
      status: a.status,
    }));

    slots = computeSlotsForBeautician({
      date,
      salonTz,
      stepMin,
      service: svc,
      specialist: normalizeBeautician(b),
      appointments: appointmentsForSlots,
    });

    // Transform slots to include startTime and endTime
    slots = slots.map((slot) => ({
      startTime: new Date(slot.startISO).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      endTime: new Date(slot.endISO).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      startISO: slot.startISO,
      endISO: slot.endISO,
      specialistId: slot.specialistId,
    }));
  } else {
    const b = await Specialist.findById(specialistId).lean();
    if (!b) return res.status(404).json({ error: "Specialist not found" });

    const normalizedBeautician = normalizeBeautician(b);

    const dayStart = new Date(date);
    const dayEnd = new Date(new Date(date).getTime() + 86400000);

    const appts = await Appointment.find({
      specialistId,
      start: {
        $gte: dayStart,
        $lt: dayEnd,
      },
      status: { $ne: "cancelled" },
    }).lean();

    const appointmentsForSlots = appts.map((a) => ({
      start: new Date(a.start).toISOString(),
      end: new Date(a.end).toISOString(),
      status: a.status,
    }));

    slots = computeSlotsForBeautician({
      date,
      salonTz,
      stepMin,
      service: svc,
      specialist: normalizeBeautician(b),
      appointments: appointmentsForSlots,
    });

    // Transform slots to include startTime and endTime
    slots = slots.map((slot) => ({
      startTime: new Date(slot.startISO).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      endTime: new Date(slot.endISO).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      startISO: slot.startISO,
      endISO: slot.endISO,
      specialistId: slot.specialistId,
    }));
  }

  res.json({ slots });
});
export default r;
