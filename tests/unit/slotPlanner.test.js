import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { computeSlotsForBeautician } from "../../src/utils/slotPlanner.js";

dayjs.extend(utc);
dayjs.extend(timezone);

describe("SlotPlanner - computeSlotsForBeautician", () => {
  const salonTz = "Europe/London";
  const baseDate = "2024-01-15"; // Monday

  const createSpecialist = (workingHoursOverride = {}) => ({
    _id: "specialist123",
    active: true,
    workingHours: {
      mon: {
        start: "09:00",
        end: "17:00",
        breaks: [],
        ...workingHoursOverride.mon,
      },
      tue: {
        start: "09:00",
        end: "17:00",
        breaks: [],
        ...workingHoursOverride.tue,
      },
      wed: {
        start: "09:00",
        end: "17:00",
        breaks: [],
        ...workingHoursOverride.wed,
      },
      thu: {
        start: "09:00",
        end: "17:00",
        breaks: [],
        ...workingHoursOverride.thu,
      },
      fri: {
        start: "09:00",
        end: "17:00",
        breaks: [],
        ...workingHoursOverride.fri,
      },
      sat: {
        start: "10:00",
        end: "16:00",
        breaks: [],
        ...workingHoursOverride.sat,
      },
      sun: null,
    },
    timeOff: [],
    customSchedule: {},
  });

  const createService = (overrides = {}) => ({
    durationMin: 60,
    bufferBeforeMin: 0,
    bufferAfterMin: 10,
    ...overrides,
  });

  describe("Basic Slot Generation", () => {
    it("should generate slots for a full working day with no appointments", () => {
      const specialist = createSpecialist();
      const service = createService();
      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length > 0).toBeTruthy(); // Should generate slots;
      // 9:00 - 17:00 = 8 hours = 480 minutes
      // With 70 min blocks (60 + 10 buffer) and 15 min steps
      // Should have multiple slots
      expect(slots.length >= 20).toBeTruthy(); // Should have at least 20 slots, got ${slots.length};

      // Verify first slot starts at or after 9:00
      const firstSlot = dayjs(slots[0].startISO).tz(salonTz);
      expect(firstSlot.hour() >= 9).toBeTruthy(); // First slot should be at or after 9:00;
    });

    it("should return empty array for non-working days (Sunday)", () => {
      const specialist = createSpecialist();
      const service = createService();
      const sundayDate = "2024-01-14"; // Sunday

      const slots = computeSlotsForBeautician({
        date: sundayDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length).toBe(0); // Should return no slots for Sunday;
    });

    it("should return empty array for inactive specialists", () => {
      const specialist = { ...createSpecialist(), active: false };
      const service = createService();

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length).toBe(0); // Should return no slots for inactive specialist;
    });

    it("should respect working hours for different days", () => {
      const specialist = createSpecialist();
      const service = createService();
      const saturdayDate = "2024-01-13"; // Saturday (10:00-16:00)

      const slots = computeSlotsForBeautician({
        date: saturdayDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length > 0).toBeTruthy(); // Should generate slots for Saturday;

      // Verify first slot is at or after 10:00
      const firstSlot = dayjs(slots[0].startISO).tz(salonTz);
      expect(firstSlot.hour() >= 10).toBeTruthy(); // Saturday should start at 10:00;

      // Verify last slot ends by 16:00
      const lastSlot = dayjs(slots[slots.length - 1].endISO).tz(salonTz);
      expect(lastSlot.hour() <= 16).toBeTruthy(); // Saturday should end by 16:00;
    });

    it("should generate correct slot durations including buffers", () => {
      const specialist = createSpecialist();
      const service = createService({
        durationMin: 30,
        bufferBeforeMin: 5,
        bufferAfterMin: 10,
      });

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length > 0).toBeTruthy(); // Should generate slots;

      // Total block = 30 + 5 + 10 = 45 minutes
      const firstSlot = dayjs(slots[0].startISO);
      const firstSlotEnd = dayjs(slots[0].endISO);
      const duration = firstSlotEnd.diff(firstSlot, "minute");

      expect(duration).toBe(45); // Slot duration should be 45 minutes (including buffers);
    });

    it("should respect custom step sizes", () => {
      const specialist = createSpecialist();
      const service = createService({ durationMin: 30, bufferAfterMin: 0 });

      const slots30 = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 30,
        service,
        specialist,
        appointments: [],
      });

      const slots15 = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots15.length > slots30.length).toBeTruthy(); // 15-minute steps should generate more slots than 30-minute steps;

      // Verify 30-minute steps
      if (slots30.length >= 2) {
        const gap = dayjs(slots30[1].startISO).diff(
          dayjs(slots30[0].startISO),
          "minute"
        );
        expect(gap).toBe(30); // Slots should be 30 minutes apart;
      }
    });
  });

  describe("Break Handling", () => {
    it("should exclude slots during break times", () => {
      const specialist = createSpecialist({
        mon: {
          start: "09:00",
          end: "17:00",
          breaks: [{ start: "12:00", end: "13:00" }],
        },
      });
      const service = createService({ durationMin: 30, bufferAfterMin: 0 });

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      // Check that no slot overlaps with lunch break
      const hasLunchSlot = slots.some((slot) => {
        const start = dayjs(slot.startISO).tz(salonTz);
        const end = dayjs(slot.endISO).tz(salonTz);
        const lunchStart = dayjs.tz(`${baseDate} 12:00`, salonTz);
        const lunchEnd = dayjs.tz(`${baseDate} 13:00`, salonTz);

        return start.isBefore(lunchEnd) && end.isAfter(lunchStart);
      });

      expect(hasLunchSlot).toBe(false); // No slots should overlap with lunch break;
    });

    it("should handle multiple breaks", () => {
      const specialist = createSpecialist({
        mon: {
          start: "09:00",
          end: "17:00",
          breaks: [
            { start: "10:30", end: "10:45" },
            { start: "12:00", end: "13:00" },
            { start: "15:00", end: "15:15" },
          ],
        },
      });
      const service = createService({ durationMin: 30, bufferAfterMin: 0 });

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length > 0).toBeTruthy(); // Should still generate slots around breaks;

      // Verify no slots overlap with any break
      const breaks = [
        { start: "10:30", end: "10:45" },
        { start: "12:00", end: "13:00" },
        { start: "15:00", end: "15:15" },
      ];

      breaks.forEach((breakTime) => {
        const hasOverlap = slots.some((slot) => {
          const start = dayjs(slot.startISO).tz(salonTz);
          const end = dayjs(slot.endISO).tz(salonTz);
          const breakStart = dayjs.tz(
            `${baseDate} ${breakTime.start}`,
            salonTz
          );
          const breakEnd = dayjs.tz(`${baseDate} ${breakTime.end}`, salonTz);

          return start.isBefore(breakEnd) && end.isAfter(breakStart);
        });

        expect(hasOverlap).toBe(false); // No slots should overlap with break ${breakTime.start}-${breakTime.end};
      });
    });
  });

  describe("Appointment Overlap Handling", () => {
    it("should exclude slots that overlap with existing appointments", () => {
      const specialist = createSpecialist();
      const service = createService({ durationMin: 60, bufferAfterMin: 0 });

      const appointments = [
        {
          start: dayjs.tz(`${baseDate} 10:00`, salonTz).toISOString(),
          end: dayjs.tz(`${baseDate} 11:00`, salonTz).toISOString(),
          status: "confirmed",
        },
      ];

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments,
      });

      // Check no slot overlaps with 10:00-11:00 appointment
      const hasOverlap = slots.some((slot) => {
        const start = dayjs(slot.startISO);
        const end = dayjs(slot.endISO);
        const apptStart = dayjs.tz(`${baseDate} 10:00`, salonTz);
        const apptEnd = dayjs.tz(`${baseDate} 11:00`, salonTz);

        return start.isBefore(apptEnd) && end.isAfter(apptStart);
      });

      expect(hasOverlap).toBe(false); // No slots should overlap with existing appointment;
    });

    it("should filter out cancelled appointments", () => {
      const specialist = createSpecialist();
      const service = createService({ durationMin: 60, bufferAfterMin: 0 });

      const appointments = [
        {
          start: dayjs.tz(`${baseDate} 10:00`, salonTz).toISOString(),
          end: dayjs.tz(`${baseDate} 11:00`, salonTz).toISOString(),
          status: "cancelled_full_refund",
        },
      ];

      const slotsWithCancelled = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments,
      });

      const slotsWithoutAppts = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      // Cancelled appointments should not block slots
      expect(slotsWithCancelled.length).toBe(slotsWithoutAppts.length); // Cancelled appointments should not affect slot availability;
    });

    it("should handle multiple appointments", () => {
      const specialist = createSpecialist();
      const service = createService({ durationMin: 30, bufferAfterMin: 0 });

      const appointments = [
        {
          start: dayjs.tz(`${baseDate} 09:00`, salonTz).toISOString(),
          end: dayjs.tz(`${baseDate} 09:30`, salonTz).toISOString(),
          status: "confirmed",
        },
        {
          start: dayjs.tz(`${baseDate} 11:00`, salonTz).toISOString(),
          end: dayjs.tz(`${baseDate} 12:00`, salonTz).toISOString(),
          status: "confirmed",
        },
        {
          start: dayjs.tz(`${baseDate} 14:00`, salonTz).toISOString(),
          end: dayjs.tz(`${baseDate} 15:00`, salonTz).toISOString(),
          status: "confirmed",
        },
      ];

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments,
      });

      expect(slots.length > 0).toBeTruthy(); // Should still have available slots between appointments;

      // Verify no overlaps with any appointment
      appointments.forEach((appt) => {
        const hasOverlap = slots.some((slot) => {
          const slotStart = dayjs(slot.startISO);
          const slotEnd = dayjs(slot.endISO);
          const apptStart = dayjs(appt.start);
          const apptEnd = dayjs(appt.end);

          return slotStart.isBefore(apptEnd) && slotEnd.isAfter(apptStart);
        });

        expect(hasOverlap).toBe(false); // No slots should overlap with appointments;
      });
    });

    it("should allow slots before and after appointments", () => {
      const specialist = createSpecialist();
      const service = createService({ durationMin: 60, bufferAfterMin: 0 });

      const appointments = [
        {
          start: dayjs.tz(`${baseDate} 12:00`, salonTz).toISOString(),
          end: dayjs.tz(`${baseDate} 13:00`, salonTz).toISOString(),
          status: "confirmed",
        },
      ];

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments,
      });

      // Should have morning slots
      const morningSlots = slots.filter((slot) => {
        const start = dayjs(slot.startISO).tz(salonTz);
        return start.hour() < 12;
      });

      // Should have afternoon slots
      const afternoonSlots = slots.filter((slot) => {
        const start = dayjs(slot.startISO).tz(salonTz);
        return start.hour() >= 13;
      });

      expect(morningSlots.length > 0).toBeTruthy(); // Should have morning slots;
      expect(afternoonSlots.length > 0).toBeTruthy(); // Should have afternoon slots;
    });
  });

  describe("Time-Off Handling", () => {
    it("should exclude all slots on a time-off day", () => {
      const specialist = createSpecialist();
      specialist.timeOff = [
        {
          start: dayjs.tz(`${baseDate} 00:00`, salonTz).toISOString(),
          end: dayjs.tz(`${baseDate} 23:59`, salonTz).toISOString(),
          reason: "Vacation",
        },
      ];

      const service = createService();
      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length).toBe(0); // Should return no slots on time-off day;
    });

    it("should handle multi-day time-off periods", () => {
      const specialist = createSpecialist();
      specialist.timeOff = [
        {
          start: dayjs.tz("2024-01-14 00:00", salonTz).toISOString(),
          end: dayjs.tz("2024-01-16 23:59", salonTz).toISOString(),
          reason: "Vacation",
        },
      ];

      const service = createService();
      const slots = computeSlotsForBeautician({
        date: baseDate, // 2024-01-15 (falls within time-off)
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length).toBe(0); // Should return no slots during multi-day time-off;
    });

    it("should handle partial day time-off", () => {
      const specialist = createSpecialist();
      specialist.timeOff = [
        {
          start: dayjs.tz(`${baseDate} 14:00`, salonTz).toISOString(),
          end: dayjs.tz(`${baseDate} 17:00`, salonTz).toISOString(),
          reason: "Doctor appointment",
        },
      ];

      const service = createService({ durationMin: 30, bufferAfterMin: 0 });
      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      // Should have morning slots
      const morningSlots = slots.filter((slot) => {
        const start = dayjs(slot.startISO).tz(salonTz);
        return start.hour() < 14;
      });

      // Should NOT have afternoon slots after 14:00
      const afternoonSlots = slots.filter((slot) => {
        const start = dayjs(slot.startISO).tz(salonTz);
        return start.hour() >= 14;
      });

      expect(morningSlots.length > 0).toBeTruthy(); // Should have morning slots;
      expect(afternoonSlots.length).toBe(0); // Should not have afternoon slots during time-off;
    });
  });

  describe("Edge Cases", () => {
    it("should handle very short working hours", () => {
      const specialist = createSpecialist({
        mon: { start: "09:00", end: "10:00", breaks: [] },
      });
      const service = createService({ durationMin: 30, bufferAfterMin: 0 });

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length > 0).toBeTruthy(); // Should generate slots for short working hours;
      expect(slots.length <= 4).toBeTruthy(); // Should have limited slots for 1-hour window;
    });

    it("should return empty when service duration exceeds available time", () => {
      const specialist = createSpecialist({
        mon: { start: "09:00", end: "09:30", breaks: [] },
      });
      const service = createService({ durationMin: 60, bufferAfterMin: 0 });

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length).toBe(0); // Should return no slots when service is too long;
    });

    it("should handle working hours ending at midnight", () => {
      const specialist = createSpecialist({
        mon: { start: "18:00", end: "23:59", breaks: [] },
      });
      const service = createService({ durationMin: 60, bufferAfterMin: 0 });

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length > 0).toBeTruthy(); // Should generate slots for evening hours;

      const lastSlot = dayjs(slots[slots.length - 1].endISO).tz(salonTz);
      expect(lastSlot.hour() <= 23).toBeTruthy(); // Last slot should end before midnight;
    });

    it("should handle empty working hours", () => {
      const specialist = {
        ...createSpecialist(),
        workingHours: {},
      };
      const service = createService();

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(slots.length).toBe(0); // Should return no slots with empty working hours;
    });
  });

  describe("Timezone Handling", () => {
    it("should generate correct slots for different timezones", () => {
      const specialist = createSpecialist();
      const service = createService();

      const nySlots = computeSlotsForBeautician({
        date: baseDate,
        salonTz: "America/New_York",
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      const londonSlots = computeSlotsForBeautician({
        date: baseDate,
        salonTz: "Europe/London",
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      expect(nySlots.length > 0).toBeTruthy(); // Should generate NY slots;
      expect(londonSlots.length > 0).toBeTruthy(); // Should generate London slots;

      // Same working hours should generate same number of slots
      expect(nySlots.length).toBe(londonSlots.length); // Should have same number of slots regardless of timezone;
    });
  });

  describe("Performance and Large Scale", () => {
    it("should handle many appointments efficiently", () => {
      const specialist = createSpecialist();
      const service = createService({ durationMin: 15, bufferAfterMin: 0 });

      // Generate 100 appointments throughout the day
      const appointments = Array.from({ length: 100 }, (_, i) => ({
        start: dayjs
          .tz(`${baseDate} 09:00`, salonTz)
          .add(i * 5, "minute")
          .toISOString(),
        end: dayjs
          .tz(`${baseDate} 09:00`, salonTz)
          .add(i * 5 + 10, "minute")
          .toISOString(),
        status: "confirmed",
      }));

      const startTime = Date.now();
      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments,
      });
      const duration = Date.now() - startTime;

      expect(duration < 1000).toBeTruthy(); // Should complete in under 1 second, took ${duration}ms;
      expect(Array.isArray(slots)).toBeTruthy(); // Should return array of slots;
    });
  });

  describe("Slot Continuity and Integrity", () => {
    it("should generate consecutive slots with correct spacing", () => {
      const specialist = createSpecialist();
      const service = createService({ durationMin: 30, bufferAfterMin: 0 });

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 30,
        service,
        specialist,
        appointments: [],
      });

      // Check consecutive slots are 30 minutes apart
      for (let i = 1; i < slots.length; i++) {
        const prevStart = dayjs(slots[i - 1].startISO);
        const currStart = dayjs(slots[i].startISO);
        const gap = currStart.diff(prevStart, "minute");

        expect(gap).toBe(30); // Consecutive slots should be 30 minutes apart, got ${gap};
      }
    });

    it("should ensure all slots have valid start and end times", () => {
      const specialist = createSpecialist();
      const service = createService();

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      slots.forEach((slot, index) => {
        expect(slot.startISO).toBeTruthy(); // Slot ${index} should have startISO;
        expect(slot.endISO).toBeTruthy(); // Slot ${index} should have endISO;

        const start = dayjs(slot.startISO);
        const end = dayjs(slot.endISO);

        expect(start.isValid()).toBeTruthy(); // Slot ${index} start should be valid;
        expect(end.isValid()).toBeTruthy(); // Slot ${index} end should be valid;
        expect(end.isAfter(start)).toBeTruthy(); // Slot ${index} end should be after start;
      });
    });

    it("should not generate duplicate slots", () => {
      const specialist = createSpecialist();
      const service = createService();

      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      const uniqueStarts = new Set(slots.map((s) => s.startISO));
      expect(uniqueStarts.size).toBe(slots.length); // All slots should have unique start times;
    });
  });

  describe("Custom Schedule Override", () => {
    it("should use custom schedule when provided", () => {
      const specialist = createSpecialist();
      specialist.customSchedule = {
        [baseDate]: [
          {
            start: "10:00",
            end: "15:00",
          },
        ],
      };

      const service = createService({ durationMin: 60, bufferAfterMin: 0 });
      const slots = computeSlotsForBeautician({
        date: baseDate,
        salonTz,
        stepMin: 15,
        service,
        specialist,
        appointments: [],
      });

      // Should use custom schedule (10:00-15:00) instead of regular Monday hours (09:00-17:00)
      const firstSlot = dayjs(slots[0].startISO).tz(salonTz);
      expect(firstSlot.hour() >= 10).toBeTruthy(); // Should start at custom schedule time;

      const lastSlot = dayjs(slots[slots.length - 1].endISO).tz(salonTz);
      expect(lastSlot.hour() <= 15).toBeTruthy(); // Should end at custom schedule time;
    });
  });
});
