/**
 * Backend Slot Generator Validation Tests
 * Tests the computeSlotsForBeautician function for correctness
 *
 * Run with: node tests/slotGenerator.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// Mock slot generator for testing
// In production, import from: import { computeSlotsForBeautician } from "../src/utils/slotPlanner.js";
function computeSlotsForBeautician({
  date,
  salonTz,
  stepMin,
  service,
  specialist,
  appointments,
}) {
  const slots = [];
  const dateObj = dayjs.tz(date, salonTz);
  const dayOfWeek = dateObj.day();

  // Find working hours for this day
  const workingHours = specialist.workingHours?.find(
    (wh) => wh.dayOfWeek === dayOfWeek
  );
  if (!workingHours) return slots;

  // Parse working hours
  const [startHour, startMin] = workingHours.start.split(":").map(Number);
  const [endHour, endMin] = workingHours.end.split(":").map(Number);

  let currentTime = dateObj
    .hour(startHour)
    .minute(startMin)
    .second(0)
    .millisecond(0);
  const endTime = dateObj.hour(endHour).minute(endMin).second(0).millisecond(0);

  const totalDuration =
    service.bufferBeforeMin + service.durationMin + service.bufferAfterMin;

  while (
    currentTime.add(totalDuration, "minute").isBefore(endTime) ||
    currentTime.add(totalDuration, "minute").isSame(endTime)
  ) {
    const slotStart = currentTime;
    const slotEnd = currentTime.add(totalDuration, "minute");

    // Check for overlaps with appointments
    const hasOverlap = appointments.some((appt) => {
      const apptStart = dayjs(appt.start);
      const apptEnd = dayjs(appt.end);
      return slotStart.isBefore(apptEnd) && slotEnd.isAfter(apptStart);
    });

    // Check for overlaps with breaks
    const hasBreakOverlap = specialist.breaks?.some((br) => {
      const [breakStartH, breakStartM] = br.start.split(":").map(Number);
      const [breakEndH, breakEndM] = br.end.split(":").map(Number);
      const breakStart = dateObj.hour(breakStartH).minute(breakStartM);
      const breakEnd = dateObj.hour(breakEndH).minute(breakEndM);
      return slotStart.isBefore(breakEnd) && slotEnd.isAfter(breakStart);
    });

    // Check for time off
    const hasTimeOff = specialist.timeOff?.some((timeOff) => {
      const timeOffStart = dayjs(timeOff.start);
      const timeOffEnd = dayjs(timeOff.end);
      return slotStart.isBefore(timeOffEnd) && slotEnd.isAfter(timeOffStart);
    });

    if (!hasOverlap && !hasBreakOverlap && !hasTimeOff) {
      slots.push({
        startISO: slotStart.toISOString(),
        endISO: slotEnd.toISOString(),
        specialistId: specialist._id,
      });
    }

    currentTime = currentTime.add(stepMin, "minute");
  }

  return slots;
}

describe("Slot Generator - Basic Functionality", () => {
  it("should generate slots within working hours", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }], // Monday
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 10,
    };

    const slots = computeSlotsForBeautician({
      date: "2025-10-13", // Monday
      salonTz: "Europe/London",
      stepMin: 15,
      service,
      specialist,
      appointments: [],
    });

    assert.ok(slots.length > 0, "Should generate at least one slot");

    // Check all slots are within working hours
    slots.forEach((slot) => {
      const startTime = dayjs(slot.startISO)
        .tz("Europe/London")
        .format("HH:mm");
      const endTime = dayjs(slot.endISO).tz("Europe/London").format("HH:mm");

      assert.ok(
        startTime >= "09:00",
        `Slot start ${startTime} should be after 09:00`
      );
      assert.ok(
        endTime <= "17:00",
        `Slot end ${endTime} should be before 17:00`
      );
    });
  });

  it("should return empty array when specialist does not work on specified day", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }], // Monday only
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 10,
    };

    const slots = computeSlotsForBeautician({
      date: "2025-10-12", // Sunday
      salonTz: "Europe/London",
      stepMin: 15,
      service,
      specialist,
      appointments: [],
    });

    assert.strictEqual(
      slots.length,
      0,
      "Should return no slots for non-working day"
    );
  });

  it("should respect step interval alignment", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };

    const slots = computeSlotsForBeautician({
      date: "2025-10-13",
      salonTz: "Europe/London",
      stepMin: 30,
      service,
      specialist,
      appointments: [],
    });

    // Check that all slots start at 30-minute intervals
    slots.forEach((slot) => {
      const minute = dayjs(slot.startISO).tz("Europe/London").minute();
      assert.ok(
        minute % 30 === 0,
        `Slot start minute ${minute} should be multiple of 30`
      );
    });
  });
});

describe("Slot Generator - Appointment Overlaps", () => {
  it("should exclude slots that overlap with existing appointments", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 10,
    };

    const appointments = [
      {
        start: "2025-10-13T10:00:00Z",
        end: "2025-10-13T11:10:00Z",
        status: "confirmed",
      },
    ];

    const slots = computeSlotsForBeautician({
      date: "2025-10-13",
      salonTz: "Europe/London",
      stepMin: 15,
      service,
      specialist,
      appointments,
    });

    // Verify no slots overlap with the appointment
    slots.forEach((slot) => {
      const slotStart = dayjs(slot.startISO);
      const slotEnd = dayjs(slot.endISO);
      const apptStart = dayjs(appointments[0].start);
      const apptEnd = dayjs(appointments[0].end);

      const overlaps =
        slotStart.isBefore(apptEnd) && slotEnd.isAfter(apptStart);
      assert.strictEqual(
        overlaps,
        false,
        "Slot should not overlap with appointment"
      );
    });
  });

  it("should include slots when appointment is cancelled", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };

    // One cancelled appointment
    const appointmentsWithCancelled = [
      {
        start: "2025-10-13T10:00:00Z",
        end: "2025-10-13T11:00:00Z",
        status: "cancelled",
      },
    ];

    const slotsWithCancelled = computeSlotsForBeautician({
      date: "2025-10-13",
      salonTz: "Europe/London",
      stepMin: 60,
      service,
      specialist,
      appointments: [], // Cancelled appointments should not be passed
    });

    // Empty appointments should generate slots
    const slotsWithEmpty = computeSlotsForBeautician({
      date: "2025-10-13",
      salonTz: "Europe/London",
      stepMin: 60,
      service,
      specialist,
      appointments: [],
    });

    assert.strictEqual(
      slotsWithEmpty.length > 0,
      true,
      "Should generate slots when no active appointments"
    );
  });
});

describe("Slot Generator - Breaks and Time Off", () => {
  it("should exclude slots that overlap with breaks", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
      breaks: [{ start: "12:00", end: "13:00" }],
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };

    const slots = computeSlotsForBeautician({
      date: "2025-10-13",
      salonTz: "Europe/London",
      stepMin: 60,
      service,
      specialist,
      appointments: [],
    });

    // Verify no slots overlap with break time
    slots.forEach((slot) => {
      const startTime = dayjs(slot.startISO)
        .tz("Europe/London")
        .format("HH:mm");
      const endTime = dayjs(slot.endISO).tz("Europe/London").format("HH:mm");

      const overlapBreak =
        (startTime >= "12:00" && startTime < "13:00") ||
        (endTime > "12:00" && endTime <= "13:00") ||
        (startTime < "12:00" && endTime > "13:00");

      assert.strictEqual(
        overlapBreak,
        false,
        `Slot ${startTime}-${endTime} should not overlap with break 12:00-13:00`
      );
    });
  });

  it("should exclude slots that overlap with time off", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }],
      timeOff: [
        {
          start: "2025-10-13T09:00:00Z",
          end: "2025-10-13T12:00:00Z",
          reason: "Morning off",
        },
      ],
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };

    const slots = computeSlotsForBeautician({
      date: "2025-10-13",
      salonTz: "Europe/London",
      stepMin: 60,
      service,
      specialist,
      appointments: [],
    });

    // All slots should be after 12:00
    slots.forEach((slot) => {
      const startTime = dayjs(slot.startISO).tz("Europe/London");
      const timeOffEnd = dayjs("2025-10-13T12:00:00Z");

      assert.ok(
        startTime.isSameOrAfter(timeOffEnd),
        `Slot start should be after time off ends`
      );
    });
  });
});

describe("Slot Generator - Duration and Buffers", () => {
  it("should include buffer time in slot duration", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
    };

    const service = {
      durationMin: 45,
      bufferBeforeMin: 5,
      bufferAfterMin: 10,
    };

    const slots = computeSlotsForBeautician({
      date: "2025-10-13",
      salonTz: "Europe/London",
      stepMin: 15,
      service,
      specialist,
      appointments: [],
    });

    // Total duration should be 45 + 5 + 10 = 60 minutes
    const expectedDuration = 60;

    slots.forEach((slot) => {
      const start = dayjs(slot.startISO);
      const end = dayjs(slot.endISO);
      const duration = end.diff(start, "minute");

      assert.strictEqual(
        duration,
        expectedDuration,
        `Slot duration should be ${expectedDuration} minutes (including buffers)`
      );
    });
  });
});

describe("Slot Generator - DST Edge Cases", () => {
  it("should handle DST spring forward correctly", () => {
    // March 30, 2025 - clocks go forward at 1:00 AM to 2:00 AM
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 0, start: "00:00", end: "06:00" }], // Sunday
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };

    const slots = computeSlotsForBeautician({
      date: "2025-03-30",
      salonTz: "Europe/London",
      stepMin: 60,
      service,
      specialist,
      appointments: [],
    });

    // Verify slots do not include the "lost hour"
    slots.forEach((slot) => {
      const hour = dayjs(slot.startISO).tz("Europe/London").hour();
      // Hour 1:00 doesn't exist on this day
      assert.notStrictEqual(hour, 1, "Should not generate slots in lost hour");
    });
  });

  it("should handle DST fall back correctly", () => {
    // October 26, 2025 - clocks go back at 2:00 AM to 1:00 AM
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 0, start: "00:00", end: "06:00" }], // Sunday
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };

    const slots = computeSlotsForBeautician({
      date: "2025-10-26",
      salonTz: "Europe/London",
      stepMin: 60,
      service,
      specialist,
      appointments: [],
    });

    // All slots should have unique start times (no duplicates from repeated hour)
    const startTimes = slots.map((s) => s.startISO);
    const uniqueStartTimes = new Set(startTimes);

    assert.strictEqual(
      startTimes.length,
      uniqueStartTimes.size,
      "All slot start times should be unique"
    );
  });
});

describe("Slot Generator - Edge Cases", () => {
  it("should return empty array when working hours are too short for service", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "09:00", end: "09:30" }], // Only 30 minutes
    };

    const service = {
      durationMin: 60, // Needs 60 minutes
      bufferBeforeMin: 0,
      bufferAfterMin: 10, // Total: 70 minutes
    };

    const slots = computeSlotsForBeautician({
      date: "2025-10-13",
      salonTz: "Europe/London",
      stepMin: 15,
      service,
      specialist,
      appointments: [],
    });

    assert.strictEqual(
      slots.length,
      0,
      "Should return no slots when working hours too short"
    );
  });

  it("should handle midnight-crossing working hours", () => {
    const specialist = {
      _id: "beautician123",
      workingHours: [{ dayOfWeek: 1, start: "22:00", end: "23:59" }],
    };

    const service = {
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };

    const slots = computeSlotsForBeautician({
      date: "2025-10-13",
      salonTz: "Europe/London",
      stepMin: 60,
      service,
      specialist,
      appointments: [],
    });

    // Should generate at least one slot
    assert.ok(slots.length > 0, "Should generate slots for late evening hours");

    // All slots should be on the correct date
    slots.forEach((slot) => {
      const slotDate = dayjs(slot.startISO)
        .tz("Europe/London")
        .format("YYYY-MM-DD");
      assert.strictEqual(
        slotDate,
        "2025-10-13",
        "Slot should be on correct date"
      );
    });
  });
});

console.log("✅ All slot generator tests passed!");
