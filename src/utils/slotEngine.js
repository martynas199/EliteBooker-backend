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
  beautician,
  variant,
  date,
  appointments,
  salonTz = "Europe/London",
  stepMin = 15,
}) {
  const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    dayjs(date).day()
  ];
  const hours = beautician.workingHours?.[dayName];
  if (!hours || !hours.start || !hours.end) return [];

  const duration =
    (variant.durationMin || 0) +
    (variant.bufferBeforeMin || 0) +
    (variant.bufferAfterMin || 0);
  const startMin = hhmmToMinutes(hours.start),
    endMin = hhmmToMinutes(hours.end);
  const breakWindows = (hours.breaks || []).map((b) => ({
    start: hhmmToMinutes(b.start),
    end: hhmmToMinutes(b.end),
  }));
  const taken = (appointments || []).map((a) => ({
    start: +new Date(a.start),
    end: +new Date(a.end),
  }));

  const out = [];
  for (let m = startMin; m + duration <= endMin; m += stepMin) {
    const slotStart = minutesToISO(date, m, salonTz);
    const slotEnd = minutesToISO(date, m + duration, salonTz);
    const slotWin = { start: +slotStart, end: +slotEnd };

    // Check if slot falls within a break
    if (breakWindows.some((bw) => m < bw.end && m + duration > bw.start))
      continue;

    // Check if slot overlaps with time-off period
    // Time-off periods are stored as full dates (start of day to end of day)
    const isTimeOff = (beautician.timeOff || []).some((off) => {
      const offStart = new Date(off.start);
      const offEnd = new Date(off.end);
      // Slot overlaps if: slotStart < offEnd AND offStart < slotEnd
      return slotStart < offEnd && offStart < slotEnd;
    });
    if (isTimeOff) continue;

    // Check if slot overlaps with existing appointment
    if (taken.some((t) => overlaps(slotWin, t))) continue;

    out.push({
      startISO: slotStart.toISOString(),
      endISO: slotEnd.toISOString(),
    });
  }
  return out;
}
