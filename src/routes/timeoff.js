import express from "express";
import Specialist from "../models/Specialist.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const router = express.Router();

/**
 * GET /api/timeoff
 * Get all time-off periods for all specialists
 */
router.get("/", async (req, res) => {
  try {
    const specialists = await Specialist.find({}, "name timeOff").lean();

    // Flatten time-off with specialist info
    const allTimeOff = [];
    for (const specialist of specialists) {
      if (specialist.timeOff && specialist.timeOff.length > 0) {
        for (const timeOff of specialist.timeOff) {
          allTimeOff.push({
            _id: timeOff._id,
            specialistId: specialist._id,
            beauticianName: specialist.name,
            start: timeOff.start,
            end: timeOff.end,
            reason: timeOff.reason || "",
          });
        }
      }
    }

    res.json(allTimeOff);
  } catch (error) {
    console.error("Error fetching time-off:", error);
    res.status(500).json({ error: "Failed to fetch time-off periods" });
  }
});

/**
 * POST /api/timeoff
 * Add a new time-off period for a specialist
 */
router.post("/", async (req, res) => {
  try {
    const { specialistId, start, end, reason } = req.body;

    // Validation
    if (!specialistId || !start || !end) {
      return res
        .status(400)
        .json({ error: "specialistId, start, and end are required" });
    }

    // CRITICAL: Parse dates in the salon's timezone
    // The end date is INCLUSIVE - if user selects Nov 1 to Nov 1, only Nov 1 is blocked
    // If user selects Nov 1 to Nov 3, then Nov 1, 2, and 3 are all blocked
    const salonTz = process.env.SALON_TZ || "Europe/London";

    console.log("Time-off request:", { start, end, specialistId });

    // Parse dates - support multiple formats (YYYY-MM-DD, DD/MM/YYYY)
    let startDay, endDay;

    // Try YYYY-MM-DD format first (ISO standard)
    startDay = dayjs(start, "YYYY-MM-DD", true);
    endDay = dayjs(end, "YYYY-MM-DD", true);

    // If invalid, try DD/MM/YYYY format (UK/EU format)
    if (!startDay.isValid()) {
      startDay = dayjs(start, "DD/MM/YYYY", true);
    }
    if (!endDay.isValid()) {
      endDay = dayjs(end, "DD/MM/YYYY", true);
    }

    // Final validation
    if (!startDay.isValid() || !endDay.isValid()) {
      console.error("Invalid dates:", {
        startDay: startDay.isValid() ? startDay.format() : "INVALID",
        endDay: endDay.isValid() ? endDay.format() : "INVALID",
        rawStart: start,
        rawEnd: end,
      });
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD or DD/MM/YYYY" });
    }

    console.log("Validated dates:", {
      startDay: startDay.format("YYYY-MM-DD"),
      endDay: endDay.format("YYYY-MM-DD"),
      isBefore: endDay.isBefore(startDay, "day"),
      isSame: endDay.isSame(startDay, "day"),
    });

    // Check that end date is not BEFORE start date (same day is OK)
    if (endDay.isBefore(startDay, "day")) {
      console.error("Date validation failed:", {
        start: startDay.format(),
        end: endDay.format(),
      });
      return res
        .status(400)
        .json({ error: "End date cannot be before start date" });
    }

    // Parse start date: beginning of day in salon timezone
    const startDate = startDay.tz(salonTz, true).startOf("day").toDate();

    // Parse end date: end of the SELECTED day (inclusive)
    // User selects "Nov 3" as end = block until end of Nov 3 (23:59:59)
    const endDate = endDay.tz(salonTz, true).endOf("day").toDate();

    console.log("Parsed dates:", {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    // Find specialist
    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Add time-off period
    specialist.timeOff = specialist.timeOff || [];
    specialist.timeOff.push({
      start: startDate,
      end: endDate,
      reason: reason || "",
    });

    await specialist.save();

    // Return the newly added time-off with specialist info
    const newTimeOff = specialist.timeOff[specialist.timeOff.length - 1];
    res.json({
      _id: newTimeOff._id,
      specialistId: specialist._id,
      beauticianName: specialist.name,
      start: newTimeOff.start,
      end: newTimeOff.end,
      reason: newTimeOff.reason,
    });
  } catch (error) {
    console.error("Error adding time-off:", error);
    res.status(500).json({ error: "Failed to add time-off period" });
  }
});

/**
 * DELETE /api/timeoff/:specialistId/:timeOffId
 * Remove a time-off period from a specialist
 */
router.delete("/:specialistId/:timeOffId", async (req, res) => {
  try {
    const { specialistId, timeOffId } = req.params;

    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    // Remove time-off period
    specialist.timeOff = (specialist.timeOff || []).filter(
      (timeOff) => timeOff._id.toString() !== timeOffId
    );

    await specialist.save();

    res.json({ message: "Time-off period removed successfully" });
  } catch (error) {
    console.error("Error removing time-off:", error);
    res.status(500).json({ error: "Failed to remove time-off period" });
  }
});

export default router;
