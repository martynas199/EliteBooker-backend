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
// Binary search to find first appointment that could overlap with given time
function findFirstPotentialOverlap(appointments, targetStart) {
  let left = 0;
  let right = appointments.length - 1;
  let result = appointments.length;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (appointments[mid].end > targetStart) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return result;
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

  // Pre-compute total slot count and pre-allocate array
  const totalSlots = Math.floor((endMin - startMin - duration) / stepMin) + 1;
  const out = [];

  // Early return if no slots possible
  if (totalSlots <= 0) return out;

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
  const taken = (appointments || [])
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

  for (let m = startMin; m + duration <= endMin; m += stepMin) {
    // Optimized time calculation using cached base and direct math
    const slotStartTime = baseDayTimestamp + m * minuteToMs;
    const slotEndTime = baseDayTimestamp + (m + duration) * minuteToMs;

    // Check if slot falls within a break - use binary search for many breaks
    let inBreak = false;
    if (mergedBreaks.length > 10) {
      // Binary search for breaks if many exist
      let left = 0,
        right = mergedBreaks.length - 1;
      while (left <= right && !inBreak) {
        const mid = (left + right) >> 1; // Faster than Math.floor
        const bw = mergedBreaks[mid];
        if (m < bw.end && m + duration > bw.start) {
          inBreak = true;
        } else if (m + duration <= bw.start) {
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }
    } else {
      // Linear search for few breaks (faster due to cache locality)
      for (let i = 0; i < mergedBreaks.length; i++) {
        const bw = mergedBreaks[i];
        if (m < bw.end && m + duration > bw.start) {
          inBreak = true;
          break;
        }
      }
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
