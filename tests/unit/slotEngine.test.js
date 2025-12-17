import { describe, it, expect, beforeEach } from "@jest/globals";
import { computeSlots, hhmmToMinutes } from "../../src/utils/slotEngine.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import tz from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(tz);

describe("hhmmToMinutes", () => {
  it("should convert 00:00 to 0", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
  });

  it("should convert 09:30 to 570", () => {
    expect(hhmmToMinutes("09:30")).toBe(570);
  });

  it("should convert 23:59 to 1439", () => {
    expect(hhmmToMinutes("23:59")).toBe(1439);
  });

  it("should handle single digit hours", () => {
    expect(hhmmToMinutes("9:30")).toBe(570);
  });
});

describe("computeSlots", () => {
  let baseSpecialist;
  let baseVariant;
  let testDate;

  beforeEach(() => {
    // Monday 2025-12-22
    testDate = "2025-12-22";

    baseSpecialist = {
      _id: "specialist1",
      name: "Test Specialist",
      workingHours: {
        mon: { start: "09:00", end: "17:00", breaks: [] },
        tue: { start: "09:00", end: "17:00", breaks: [] },
        wed: { start: "09:00", end: "17:00", breaks: [] },
        thu: { start: "09:00", end: "17:00", breaks: [] },
        fri: { start: "09:00", end: "17:00", breaks: [] },
        sat: { start: "10:00", end: "14:00", breaks: [] },
        sun: null,
      },
      timeOff: [],
    };

    baseVariant = {
      name: "60min Service",
      durationMin: 60,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      price: 100,
    };
  });

  describe("Basic Slot Generation", () => {
    it("should generate slots for a full day with no appointments", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // 9:00 to 17:00 = 8 hours = 480 minutes
      // With 60min slots and 15min steps: (480-60)/15 + 1 = 29 slots
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].startISO).toContain("09:00");
      expect(slots[slots.length - 1].startISO).toContain("16:00");
    });

    it("should respect working hours for different days", () => {
      // Saturday has different hours: 10:00-14:00
      const satDate = "2025-12-27"; // Saturday

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: satDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots[0].startISO).toContain("10:00");
      expect(slots[slots.length - 1].startISO).toContain("13:00");
    });

    it("should return empty array for non-working days", () => {
      const sunDate = "2025-12-28"; // Sunday

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: sunDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots).toEqual([]);
    });

    it("should generate correct slot durations including buffers", () => {
      const variantWithBuffers = {
        ...baseVariant,
        durationMin: 45,
        bufferBeforeMin: 5,
        bufferAfterMin: 10,
      };

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: variantWithBuffers,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // Total duration: 45 + 5 + 10 = 60 minutes
      const firstSlot = slots[0];
      const start = new Date(firstSlot.startISO);
      const end = new Date(firstSlot.endISO);
      const duration = (end - start) / (1000 * 60);

      expect(duration).toBe(60);
    });

    it("should respect custom step sizes", () => {
      const slots30 = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 30,
      });

      const slots15 = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // 30min steps should produce fewer slots than 15min steps
      expect(slots30.length).toBeLessThan(slots15.length);
    });
  });

  describe("Break Handling", () => {
    it("should exclude slots during break times", () => {
      const specialistWithBreak = {
        ...baseSpecialist,
        workingHours: {
          ...baseSpecialist.workingHours,
          mon: {
            start: "09:00",
            end: "17:00",
            breaks: [{ start: "12:00", end: "13:00" }],
          },
        },
      };

      const slots = computeSlots({
        specialist: specialistWithBreak,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // No slot should start between 12:00 and 13:00
      const slotsInBreak = slots.filter((slot) => {
        const hour = new Date(slot.startISO).getHours();
        return hour === 12;
      });

      expect(slotsInBreak.length).toBe(0);
    });

    it("should handle multiple breaks", () => {
      const specialistWithMultipleBreaks = {
        ...baseSpecialist,
        workingHours: {
          ...baseSpecialist.workingHours,
          mon: {
            start: "09:00",
            end: "17:00",
            breaks: [
              { start: "11:00", end: "11:30" },
              { start: "14:00", end: "14:30" },
            ],
          },
        },
      };

      const slots = computeSlots({
        specialist: specialistWithMultipleBreaks,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // Check that no slots overlap with break times
      slots.forEach((slot) => {
        const start = new Date(slot.startISO);
        const end = new Date(slot.endISO);
        const startMin = start.getHours() * 60 + start.getMinutes();
        const endMin = end.getHours() * 60 + end.getMinutes();

        // Should not overlap with 11:00-11:30 (660-690 minutes)
        const overlapsBreak1 = startMin < 690 && endMin > 660;
        // Should not overlap with 14:00-14:30 (840-870 minutes)
        const overlapsBreak2 = startMin < 870 && endMin > 840;

        expect(overlapsBreak1).toBe(false);
        expect(overlapsBreak2).toBe(false);
      });
    });
  });

  describe("Appointment Overlap Handling", () => {
    it("should exclude slots that overlap with existing appointments", () => {
      const appointments = [
        {
          start: "2025-12-22T10:00:00.000Z",
          end: "2025-12-22T11:00:00.000Z",
        },
      ];

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments,
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // No slot should overlap with 10:00-11:00
      const overlappingSlots = slots.filter((slot) => {
        const slotStart = new Date(slot.startISO);
        const slotEnd = new Date(slot.endISO);
        const apptStart = new Date(appointments[0].start);
        const apptEnd = new Date(appointments[0].end);

        return slotStart < apptEnd && apptStart < slotEnd;
      });

      expect(overlappingSlots.length).toBe(0);
    });

    it("should handle multiple appointments", () => {
      const appointments = [
        {
          start: "2025-12-22T09:00:00.000Z",
          end: "2025-12-22T10:00:00.000Z",
        },
        {
          start: "2025-12-22T14:00:00.000Z",
          end: "2025-12-22T15:00:00.000Z",
        },
      ];

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments,
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // Verify no overlaps with any appointment
      slots.forEach((slot) => {
        const slotStart = new Date(slot.startISO);
        const slotEnd = new Date(slot.endISO);

        appointments.forEach((appt) => {
          const apptStart = new Date(appt.start);
          const apptEnd = new Date(appt.end);
          const overlaps = slotStart < apptEnd && apptStart < slotEnd;
          expect(overlaps).toBe(false);
        });
      });
    });

    it("should allow slots before and after appointments", () => {
      const appointments = [
        {
          start: "2025-12-22T12:00:00.000Z",
          end: "2025-12-22T13:00:00.000Z",
        },
      ];

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments,
        salonTz: "Europe/London",
        stepMin: 60,
      });

      // Should have slots before 12:00
      const beforeSlots = slots.filter(
        (s) => new Date(s.startISO).getHours() < 12
      );
      expect(beforeSlots.length).toBeGreaterThan(0);

      // Should have slots after 13:00
      const afterSlots = slots.filter(
        (s) => new Date(s.endISO).getHours() > 13
      );
      expect(afterSlots.length).toBeGreaterThan(0);
    });
  });

  describe("Time-Off Handling", () => {
    it("should exclude all slots on a time-off day", () => {
      const specialistWithTimeOff = {
        ...baseSpecialist,
        timeOff: [
          {
            start: "2025-12-22T00:00:00.000Z",
            end: "2025-12-22T23:59:59.999Z",
          },
        ],
      };

      const slots = computeSlots({
        specialist: specialistWithTimeOff,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots).toEqual([]);
    });

    it("should handle multi-day time-off periods", () => {
      const specialistWithTimeOff = {
        ...baseSpecialist,
        timeOff: [
          {
            start: "2025-12-22T00:00:00.000Z",
            end: "2025-12-24T23:59:59.999Z",
          },
        ],
      };

      // Check Dec 22
      const slotsDay1 = computeSlots({
        specialist: specialistWithTimeOff,
        variant: baseVariant,
        date: "2025-12-22",
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });
      expect(slotsDay1).toEqual([]);

      // Check Dec 23
      const slotsDay2 = computeSlots({
        specialist: specialistWithTimeOff,
        variant: baseVariant,
        date: "2025-12-23",
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });
      expect(slotsDay2).toEqual([]);

      // Check Dec 25 (should have slots)
      const slotsDay3 = computeSlots({
        specialist: specialistWithTimeOff,
        variant: baseVariant,
        date: "2025-12-25",
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });
      expect(slotsDay3.length).toBeGreaterThan(0);
    });

    it("should handle partial day time-off", () => {
      const specialistWithTimeOff = {
        ...baseSpecialist,
        timeOff: [
          {
            start: "2025-12-22T09:00:00.000Z",
            end: "2025-12-22T12:00:00.000Z",
          },
        ],
      };

      const slots = computeSlots({
        specialist: specialistWithTimeOff,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // Should have slots after 12:00
      const afternoonSlots = slots.filter(
        (s) => new Date(s.startISO).getHours() >= 12
      );
      expect(afternoonSlots.length).toBeGreaterThan(0);

      // No slots should start before 12:00
      const morningSlots = slots.filter(
        (s) => new Date(s.startISO).getHours() < 12
      );
      expect(morningSlots.length).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very short working hours", () => {
      const shortHoursSpecialist = {
        ...baseSpecialist,
        workingHours: {
          ...baseSpecialist.workingHours,
          mon: { start: "10:00", end: "11:00", breaks: [] },
        },
      };

      const slots = computeSlots({
        specialist: shortHoursSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // 1 hour with 60min service = only 1 slot at 10:00
      expect(slots.length).toBe(1);
      expect(slots[0].startISO).toContain("10:00");
    });

    it("should return empty when service duration exceeds available time", () => {
      const longServiceVariant = {
        ...baseVariant,
        durationMin: 120,
      };

      const shortHoursSpecialist = {
        ...baseSpecialist,
        workingHours: {
          ...baseSpecialist.workingHours,
          mon: { start: "10:00", end: "11:00", breaks: [] },
        },
      };

      const slots = computeSlots({
        specialist: shortHoursSpecialist,
        variant: longServiceVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots).toEqual([]);
    });

    it("should handle midnight crossing working hours", () => {
      const nightShiftSpecialist = {
        ...baseSpecialist,
        workingHours: {
          ...baseSpecialist.workingHours,
          mon: { start: "22:00", end: "23:59", breaks: [] },
        },
      };

      const slots = computeSlots({
        specialist: nightShiftSpecialist,
        variant: { ...baseVariant, durationMin: 30 },
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].startISO).toContain("22:00");
    });

    it("should handle empty working hours", () => {
      const noHoursSpecialist = {
        ...baseSpecialist,
        workingHours: {},
      };

      const slots = computeSlots({
        specialist: noHoursSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots).toEqual([]);
    });

    it("should handle missing specialist.workingHours", () => {
      const noWorkingHoursSpecialist = {
        ...baseSpecialist,
        workingHours: undefined,
      };

      const slots = computeSlots({
        specialist: noWorkingHoursSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots).toEqual([]);
    });
  });

  describe("Timezone Handling", () => {
    it("should generate correct slots for different timezones", () => {
      const slotsLondon = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 60,
      });

      const slotsNY = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "America/New_York",
        stepMin: 60,
      });

      // Both should have same number of slots
      expect(slotsLondon.length).toBe(slotsNY.length);

      // But times should be different in UTC
      expect(slotsLondon[0].startISO).not.toBe(slotsNY[0].startISO);
    });
  });

  describe("Performance and Large Scale", () => {
    it("should handle many appointments efficiently", () => {
      // Create 50 appointments throughout the day
      const appointments = Array.from({ length: 50 }, (_, i) => {
        const hour = 9 + Math.floor((i * 8) / 50);
        const minute = (i * 15) % 60;
        const startTime = `2025-12-22T${String(hour).padStart(2, "0")}:${String(
          minute
        ).padStart(2, "0")}:00.000Z`;
        const endTime = dayjs(startTime).add(30, "minute").toISOString();
        return { start: startTime, end: endTime };
      });

      const startTime = Date.now();
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments,
        salonTz: "Europe/London",
        stepMin: 15,
      });
      const duration = Date.now() - startTime;

      expect(slots).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it("should handle many time-off periods", () => {
      const manyTimeOffSpecialist = {
        ...baseSpecialist,
        timeOff: Array.from({ length: 20 }, (_, i) => ({
          start: `2025-12-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
          end: `2025-12-${String(i + 1).padStart(2, "0")}T23:59:59.999Z`,
        })),
      };

      const startTime = Date.now();
      const slots = computeSlots({
        specialist: manyTimeOffSpecialist,
        variant: baseVariant,
        date: "2025-12-15", // Use a date within the time-off range
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });
      const duration = Date.now() - startTime;

      expect(slots).toEqual([]);
      expect(duration).toBeLessThan(100); // Should be very fast
    });
  });

  describe("Slot Continuity and Integrity", () => {
    it("should generate consecutive slots with correct spacing", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // Check that consecutive slots are 15 minutes apart
      for (let i = 0; i < slots.length - 1; i++) {
        const currentStart = new Date(slots[i].startISO);
        const nextStart = new Date(slots[i + 1].startISO);
        const diff = (nextStart - currentStart) / (1000 * 60);
        expect(diff).toBe(15);
      }
    });

    it("should ensure all slots have valid start and end times", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      slots.forEach((slot) => {
        const start = new Date(slot.startISO);
        const end = new Date(slot.endISO);

        expect(start).toBeInstanceOf(Date);
        expect(end).toBeInstanceOf(Date);
        expect(start.getTime()).toBeLessThan(end.getTime());
        expect(slot.startISO).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
        expect(slot.endISO).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      });
    });

    it("should not generate duplicate slots", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      const startTimes = slots.map((s) => s.startISO);
      const uniqueStartTimes = [...new Set(startTimes)];

      expect(startTimes.length).toBe(uniqueStartTimes.length);
    });
  });

  describe("Buffer Edge Cases", () => {
    it("should handle slots with only buffer time (no actual service duration)", () => {
      const bufferOnlyVariant = {
        ...baseVariant,
        durationMin: 0,
        bufferBeforeMin: 15,
        bufferAfterMin: 15,
      };

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: bufferOnlyVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots.length).toBeGreaterThan(0);
      const firstSlot = slots[0];
      const duration =
        (new Date(firstSlot.endISO) - new Date(firstSlot.startISO)) /
        (1000 * 60);
      expect(duration).toBe(30);
    });

    it("should handle large buffer times correctly", () => {
      const largeBufferVariant = {
        ...baseVariant,
        durationMin: 30,
        bufferBeforeMin: 30,
        bufferAfterMin: 30,
      };

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: largeBufferVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // Total duration: 30 + 30 + 30 = 90 minutes
      const firstSlot = slots[0];
      const duration =
        (new Date(firstSlot.endISO) - new Date(firstSlot.startISO)) /
        (1000 * 60);
      expect(duration).toBe(90);
    });
  });

  describe("Boundary Conditions", () => {
    it("should handle slot exactly at working hours start", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 60,
      });

      const firstSlot = slots[0];
      expect(firstSlot.startISO).toContain("09:00");
    });

    it("should handle slot ending exactly at working hours end", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 60,
      });

      const lastSlot = slots[slots.length - 1];
      expect(lastSlot.endISO).toContain("17:00");
    });

    it("should not create slot that extends beyond working hours", () => {
      const longVariant = {
        ...baseVariant,
        durationMin: 120,
      };

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: longVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // Last possible slot should start at 15:00 (ends at 17:00)
      const lastSlot = slots[slots.length - 1];
      expect(new Date(lastSlot.startISO).getHours()).toBe(15);
      expect(new Date(lastSlot.endISO).getHours()).toBe(17);
    });

    it("should handle appointment exactly at break boundary", () => {
      const specialistWithBreak = {
        ...baseSpecialist,
        workingHours: {
          ...baseSpecialist.workingHours,
          mon: {
            start: "09:00",
            end: "17:00",
            breaks: [{ start: "12:00", end: "13:00" }],
          },
        },
      };

      const appointments = [
        {
          start: "2025-12-22T11:00:00.000Z",
          end: "2025-12-22T12:00:00.000Z", // Ends exactly when break starts
        },
      ];

      const slots = computeSlots({
        specialist: specialistWithBreak,
        variant: baseVariant,
        date: testDate,
        appointments,
        salonTz: "Europe/London",
        stepMin: 60,
      });

      // Should have slot at 13:00 (after break)
      const afternoonSlots = slots.filter(
        (s) => new Date(s.startISO).getHours() >= 13
      );
      expect(afternoonSlots.length).toBeGreaterThan(0);
    });
  });

  describe("Complex Overlap Scenarios", () => {
    it("should handle back-to-back appointments", () => {
      const appointments = [
        {
          start: "2025-12-22T09:00:00.000Z",
          end: "2025-12-22T10:00:00.000Z",
        },
        {
          start: "2025-12-22T10:00:00.000Z", // Starts exactly when previous ends
          end: "2025-12-22T11:00:00.000Z",
        },
      ];

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments,
        salonTz: "Europe/London",
        stepMin: 60,
      });

      // Should have no slots from 9-11
      const overlappingSlots = slots.filter((s) => {
        const hour = new Date(s.startISO).getHours();
        return hour >= 9 && hour < 11;
      });
      expect(overlappingSlots.length).toBe(0);

      // Should have slots after 11:00
      const afterSlots = slots.filter(
        (s) => new Date(s.startISO).getHours() >= 11
      );
      expect(afterSlots.length).toBeGreaterThan(0);
    });

    it("should handle overlapping time-off periods", () => {
      const specialistWithOverlappingTimeOff = {
        ...baseSpecialist,
        timeOff: [
          {
            start: "2025-12-22T09:00:00.000Z",
            end: "2025-12-22T14:00:00.000Z",
          },
          {
            start: "2025-12-22T12:00:00.000Z", // Overlaps with first period
            end: "2025-12-22T16:00:00.000Z",
          },
        ],
      };

      const slots = computeSlots({
        specialist: specialistWithOverlappingTimeOff,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 60,
      });

      // Should only have slot at 16:00 (after both time-off periods)
      expect(slots.length).toBe(1);
      expect(slots[0].startISO).toContain("16:00");
    });

    it("should handle appointment spanning entire working day", () => {
      const appointments = [
        {
          start: "2025-12-22T09:00:00.000Z",
          end: "2025-12-22T17:00:00.000Z",
        },
      ];

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments,
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots).toEqual([]);
    });

    it("should handle break and appointment at same time", () => {
      const specialistWithBreak = {
        ...baseSpecialist,
        workingHours: {
          ...baseSpecialist.workingHours,
          mon: {
            start: "09:00",
            end: "17:00",
            breaks: [{ start: "12:00", end: "13:00" }],
          },
        },
      };

      const appointments = [
        {
          start: "2025-12-22T12:00:00.000Z",
          end: "2025-12-22T13:00:00.000Z", // Same as break time
        },
      ];

      const slots = computeSlots({
        specialist: specialistWithBreak,
        variant: baseVariant,
        date: testDate,
        appointments,
        salonTz: "Europe/London",
        stepMin: 60,
      });

      // No slots should exist from 12:00-13:00
      const noonSlots = slots.filter((s) => {
        const hour = new Date(s.startISO).getHours();
        return hour === 12;
      });
      expect(noonSlots.length).toBe(0);
    });
  });

  describe("Invalid Input Handling", () => {
    it("should handle null variant gracefully", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: null,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots).toEqual([]);
    });

    it("should handle undefined appointments", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: undefined,
        salonTz: "Europe/London",
        stepMin: 15,
      });

      expect(slots.length).toBeGreaterThan(0);
    });

    it("should handle invalid date format", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: "invalid-date",
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });

      // Should return empty or handle gracefully
      expect(Array.isArray(slots)).toBe(true);
    });

    it("should handle negative step size", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: -15,
      });

      // Should return empty or handle gracefully
      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBe(0);
    });

    it("should handle zero step size", () => {
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 0,
      });

      // Should return empty to avoid infinite loop
      expect(slots).toEqual([]);
    });

    it("should handle malformed appointment times", () => {
      const appointments = [
        {
          start: "invalid",
          end: "also-invalid",
        },
      ];

      expect(() => {
        computeSlots({
          specialist: baseSpecialist,
          variant: baseVariant,
          date: testDate,
          appointments,
          salonTz: "Europe/London",
          stepMin: 15,
        });
      }).not.toThrow(); // Should handle gracefully
    });
  });

  describe("DST and Cross-Day Scenarios", () => {
    it("should handle slots during DST transition", () => {
      // March 31, 2025 is when UK switches to BST
      const dstDate = "2025-03-31";

      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: dstDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 60,
      });

      expect(slots.length).toBeGreaterThan(0);
      // Verify all slots are valid ISO strings
      slots.forEach((slot) => {
        expect(new Date(slot.startISO).toString()).not.toBe("Invalid Date");
        expect(new Date(slot.endISO).toString()).not.toBe("Invalid Date");
      });
    });

    it("should handle working hours that span across midnight", () => {
      const nightShiftSpecialist = {
        ...baseSpecialist,
        workingHours: {
          ...baseSpecialist.workingHours,
          mon: { start: "20:00", end: "23:59", breaks: [] },
        },
      };

      const slots = computeSlots({
        specialist: nightShiftSpecialist,
        variant: { ...baseVariant, durationMin: 60 },
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 60,
      });

      expect(slots.length).toBeGreaterThan(0);
      const firstSlot = slots[0];
      expect(new Date(firstSlot.startISO).getHours()).toBeGreaterThanOrEqual(
        20
      );
    });
  });

  describe("Stress Testing", () => {
    it("should handle 1000 appointments efficiently", () => {
      // Create 1000 appointments throughout multiple days
      const appointments = Array.from({ length: 1000 }, (_, i) => {
        const dayOffset = Math.floor(i / 50);
        const hour = 9 + (i % 8);
        const minute = (i * 7) % 60;
        const startTime = dayjs(`2025-12-${22 + dayOffset}`)
          .hour(hour)
          .minute(minute)
          .toISOString();
        const endTime = dayjs(startTime).add(30, "minute").toISOString();
        return { start: startTime, end: endTime };
      });

      const startTime = Date.now();
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments,
        salonTz: "Europe/London",
        stepMin: 15,
      });
      const duration = Date.now() - startTime;

      expect(slots).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
    });

    it("should handle 100 breaks efficiently", () => {
      const manyBreaksSpecialist = {
        ...baseSpecialist,
        workingHours: {
          ...baseSpecialist.workingHours,
          mon: {
            start: "09:00",
            end: "17:00",
            breaks: Array.from({ length: 100 }, (_, i) => {
              const startMin = 540 + i * 4; // Every 4 minutes
              const endMin = startMin + 2;
              return {
                start: `${Math.floor(startMin / 60)
                  .toString()
                  .padStart(2, "0")}:${(startMin % 60)
                  .toString()
                  .padStart(2, "0")}`,
                end: `${Math.floor(endMin / 60)
                  .toString()
                  .padStart(2, "0")}:${(endMin % 60)
                  .toString()
                  .padStart(2, "0")}`,
              };
            }),
          },
        },
      };

      const startTime = Date.now();
      const slots = computeSlots({
        specialist: manyBreaksSpecialist,
        variant: baseVariant,
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 15,
      });
      const duration = Date.now() - startTime;

      expect(slots).toBeDefined();
      expect(duration).toBeLessThan(500); // Should be fast
    });

    it("should handle very small step sizes (1 minute)", () => {
      const startTime = Date.now();
      const slots = computeSlots({
        specialist: baseSpecialist,
        variant: { ...baseVariant, durationMin: 15 },
        date: testDate,
        appointments: [],
        salonTz: "Europe/London",
        stepMin: 1, // 1 minute steps
      });
      const duration = Date.now() - startTime;

      expect(slots.length).toBeGreaterThan(400); // Many slots
      expect(duration).toBeLessThan(1000); // Should still be fast
    });
  });
});
