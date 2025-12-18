import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";
dayjs.extend(utc);
dayjs.extend(tz);
export function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function minutesToISO(baseDate, minutes, zone) {
  const d = dayjs.tz(baseDate, zone).startOf("day").add(minutes, "minute");
  return d.toDate();
}
function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function computeSlots({
  specialist,
  variant,
  date,
  appointments,
  salonTz = "Europe/London",
  stepMin = 15,
}) {
  // Input validation
  if (!variant || stepMin <= 0) return [];

  const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    dayjs(date).day()
  ];
  const hours = specialist.workingHours?.[dayName];
  if (!hours || !hours.start || !hours.end) return [];

  const duration =
    (variant.durationMin || 0) +
    (variant.bufferBeforeMin || 0) +
    (variant.bufferAfterMin || 0);
  const startMin = hhmmToMinutes(hours.start);
  const endMin = hhmmToMinutes(hours.end);

  // Early return if no slots possible
  if (startMin + duration > endMin) return [];

  const out = [];

  // Pre-convert and merge overlapping breaks into consolidated ranges
  const breakWindows = (hours.breaks || [])
    .map((b) => ({
      start: hhmmToMinutes(b.start),
      end: hhmmToMinutes(b.end),
    }))
    .sort((a, b) => a.start - b.start);

  // Merge overlapping breaks
  const mergedBreaks = [];
  for (let i = 0; i < breakWindows.length; i++) {
    const current = breakWindows[i];
    if (
      mergedBreaks.length === 0 ||
      mergedBreaks[mergedBreaks.length - 1].end < current.start
    ) {
      mergedBreaks.push({ ...current });
    } else {
      mergedBreaks[mergedBreaks.length - 1].end = Math.max(
        mergedBreaks[mergedBreaks.length - 1].end,
        current.end
      );
    }
  }

  // Pre-convert appointments to timestamp ranges and sort by start time
  // Filter out cancelled appointments (parity with slotPlanner)
  const taken = (appointments || [])
    .filter((a) => a.status !== "cancelled")
    .map((a) => ({
      start: +new Date(a.start),
      end: +new Date(a.end),
    }))
    .sort((a, b) => a.start - b.start);

  // Pre-convert time-off periods to timestamp ranges and sort
  const timeOffRanges = (specialist.timeOff || [])
    .map((off) => ({
      start: +new Date(off.start),
      end: +new Date(off.end),
    }))
    .sort((a, b) => a.start - b.start);

  // Cache dayjs base date to avoid repeated parsing
  const baseDay = dayjs.tz(date, salonTz).startOf("day");
  const baseDayTimestamp = +baseDay.toDate();

  // Pre-compute minute-to-millisecond conversion
  const minuteToMs = 60 * 1000;

  let appointmentIndex = 0;
  let timeOffIndex = 0;
  let breakIndex = 0;

  for (let m = startMin; m + duration <= endMin; m += stepMin) {
    // Optimized time calculation using cached base and direct math
    const slotStartTime = baseDayTimestamp + m * minuteToMs;
    const slotEndTime = baseDayTimestamp + (m + duration) * minuteToMs;

    // Check if slot falls within a break using linear pointer
    // Advance break pointer while current break ends before slot starts
    while (
      breakIndex < mergedBreaks.length &&
      mergedBreaks[breakIndex].end <= m
    ) {
      breakIndex++;
    }

    // Check if current break overlaps with slot
    let inBreak = false;
    if (
      breakIndex < mergedBreaks.length &&
      m < mergedBreaks[breakIndex].end &&
      m + duration > mergedBreaks[breakIndex].start
    ) {
      inBreak = true;
    }
    if (inBreak) continue;

    // Check time-off with sliding window
    while (
      timeOffIndex < timeOffRanges.length &&
      timeOffRanges[timeOffIndex].end <= slotStartTime
    ) {
      timeOffIndex++;
    }

    let isTimeOff = false;
    for (let i = timeOffIndex; i < timeOffRanges.length; i++) {
      const off = timeOffRanges[i];
      if (off.start >= slotEndTime) break; // Sorted, so we can stop
      if (slotStartTime < off.end && off.start < slotEndTime) {
        isTimeOff = true;
        break;
      }
    }
    if (isTimeOff) continue;

    // Check appointments with sliding window and binary search for repositioning
    while (
      appointmentIndex < taken.length &&
      taken[appointmentIndex].end <= slotStartTime
    ) {
      appointmentIndex++;
    }

    let hasOverlap = false;
    for (let i = appointmentIndex; i < taken.length; i++) {
      const t = taken[i];
      if (t.start >= slotEndTime) break; // Sorted, early exit
      if (slotStartTime < t.end && t.start < slotEndTime) {
        hasOverlap = true;
        break;
      }
    }
    if (hasOverlap) continue;

    // Only create Date objects and ISO strings for valid slots
    const slotStart = new Date(slotStartTime);
    const slotEnd = new Date(slotEndTime);

    out.push({
      startISO: slotStart.toISOString(),
      endISO: slotEnd.toISOString(),
    });
  }

  return out;
}

/**
 * Wrapper function that matches the old slotPlanner API
 * This allows drop-in replacement in production routes
 */
export function computeTimeSlots({
  date,
  salonTz = "Europe/London",
  stepMin = 15,
  service,
  specialist,
  appointments = [],
  extraBlackouts = [],
  dayStartOverride,
  dayEndOverride,
}) {
  // Check if specialist is active
  if (specialist?.active === false) return [];

  // Get service variant (assuming service has variants or is itself the variant)
  const variant = service?.variants?.[0] || service;
  if (!variant) return [];

  // Build all appointments list including extraBlackouts
  const allAppointments = [
    ...appointments,
    ...extraBlackouts.map((b) => ({
      start: b.start,
      end: b.end,
      status: "confirmed", // extraBlackouts are always blocking
    })),
  ];

  // Call the optimized computeSlots
  const slots = computeSlots({
    specialist,
    variant,
    date,
    appointments: allAppointments,
    salonTz,
    stepMin,
  });

  // Filter past slots for today
  const now = dayjs().tz(salonTz);
  const isToday = now.format("YYYY-MM-DD") === date;

  if (isToday) {
    return slots.filter((slot) => {
      const slotTime = dayjs(slot.startISO).tz(salonTz);
      return slotTime.isAfter(now);
    });
  }

  return slots;
}
