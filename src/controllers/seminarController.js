import Seminar from "../models/Seminar.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Get all published seminars (public)
 * @route GET /api/seminars/public
 */
export const getPublicSeminars = async (req, res) => {
  try {
    const {
      category,
      level,
      minPrice,
      maxPrice,
      locationType,
      fromDate,
      toDate,
      search,
      sort = "-createdAt",
      page = 1,
      limit = 12,
    } = req.query;

    const filter = { status: "published" };

    // Apply filters
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (locationType) filter["location.type"] = locationType;

    // Price range filter
    if (minPrice || maxPrice) {
      filter["pricing.price"] = {};
      if (minPrice) filter["pricing.price"].$gte = parseFloat(minPrice);
      if (maxPrice) filter["pricing.price"].$lte = parseFloat(maxPrice);
    }

    // Date range filter (sessions within date range)
    if (fromDate || toDate) {
      filter["sessions.date"] = {};
      if (fromDate) filter["sessions.date"].$gte = new Date(fromDate);
      if (toDate) filter["sessions.date"].$lte = new Date(toDate);
    }

    // Search by title or description
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { shortDescription: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [seminars, total] = await Promise.all([
      Seminar.find(filter)
        .populate("specialistId", "name email avatar")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Seminar.countDocuments(filter),
    ]);

    // Filter out past sessions and add computed fields
    const enrichedSeminars = seminars.map((seminar) => {
      const now = new Date();
      const upcomingSessions = seminar.sessions.filter(
        (s) => new Date(s.date) > now && s.status !== "cancelled"
      );

      return {
        ...seminar,
        upcomingSessions,
        nextSession: upcomingSessions[0] || null,
        spotsAvailable:
          upcomingSessions.length > 0
            ? upcomingSessions[0].maxAttendees -
              upcomingSessions[0].currentAttendees
            : 0,
      };
    });

    res.status(200).json({
      seminars: enrichedSeminars,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error in getPublicSeminars:", error);
    res.status(500).json({ error: "Failed to fetch seminars" });
  }
};

/**
 * Get single seminar by slug (public)
 * @route GET /api/seminars/public/:slug
 */
export const getPublicSeminarBySlug = async (req, res) => {
  try {
    const seminar = await Seminar.findOne({
      slug: req.params.slug,
      status: "published",
    })
      .populate("specialistId", "name email avatar bio")
      .lean();

    if (!seminar) {
      return res.status(404).json({ error: "Seminar not found" });
    }

    // Filter out past sessions
    const now = new Date();
    const upcomingSessions = seminar.sessions.filter(
      (s) => new Date(s.date) > now && s.status !== "cancelled"
    );

    res.status(200).json({
      ...seminar,
      upcomingSessions,
    });
  } catch (error) {
    console.error("Error in getPublicSeminarBySlug:", error);
    res.status(500).json({ error: "Failed to fetch seminar" });
  }
};

/**
 * Get all seminars (admin/specialist)
 * @route GET /api/seminars
 */
export const getSeminars = async (req, res) => {
  try {
    const { status, sort = "-createdAt", page = 1, limit = 20 } = req.query;

    const filter = {};

    // If not admin, only show own seminars
    if (req.user.role !== "admin") {
      filter.specialistId = req.user._id;
    }

    // Filter by status
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [seminars, total] = await Promise.all([
      Seminar.find(filter)
        .populate("specialistId", "name email")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Seminar.countDocuments(filter),
    ]);

    // Add booking counts
    const enrichedSeminars = seminars.map((seminar) => ({
      ...seminar,
      totalSessions: seminar.sessions.length,
      totalBookings: seminar.sessions.reduce(
        (sum, s) => sum + s.currentAttendees,
        0
      ),
    }));

    res.status(200).json({
      seminars: enrichedSeminars,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error in getSeminars:", error);
    res.status(500).json({ error: "Failed to fetch seminars" });
  }
};

/**
 * Get single seminar by ID
 * @route GET /api/seminars/:id
 */
export const getSeminarById = async (req, res) => {
  try {
    const seminar = await Seminar.findById(req.params.id)
      .populate("specialistId", "name email avatar")
      .lean();

    if (!seminar) {
      return res.status(404).json({ error: "Seminar not found" });
    }

    // Check permission
    if (
      req.user.role !== "admin" &&
      seminar.specialistId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.status(200).json(seminar);
  } catch (error) {
    console.error("Error in getSeminarById:", error);
    res.status(500).json({ error: "Failed to fetch seminar" });
  }
};

/**
 * Create new seminar
 * @route POST /api/seminars
 */
export const createSeminar = async (req, res) => {
  try {
    const {
      title,
      shortDescription,
      description,
      category,
      level,
      pricing,
      location,
      sessions,
      requirements,
      whatYouWillLearn,
      images,
    } = req.body;

    // Validation
    if (!title || !shortDescription || !description) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!pricing || !pricing.price) {
      return res.status(400).json({ error: "Pricing information required" });
    }

    if (!location || !location.type) {
      return res.status(400).json({ error: "Location information required" });
    }

    if (!sessions || sessions.length === 0) {
      return res.status(400).json({ error: "At least one session required" });
    }

    // Generate slug
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Check slug uniqueness
    const existingSeminar = await Seminar.findOne({ slug });
    let finalSlug = slug;
    if (existingSeminar) {
      finalSlug = `${slug}-${uuidv4().slice(0, 8)}`;
    }

    // Generate session IDs
    const sessionsWithIds = sessions.map((session) => ({
      ...session,
      sessionId: uuidv4(),
      currentAttendees: 0,
      status: "scheduled",
    }));

    // Create seminar
    const seminar = await Seminar.create({
      specialistId: req.user._id,
      tenantId: req.user.tenantId || req.user._id, // Use tenantId if available
      title,
      slug: finalSlug,
      shortDescription,
      description,
      category,
      level,
      pricing,
      location,
      sessions: sessionsWithIds,
      requirements: requirements || [],
      whatYouWillLearn: whatYouWillLearn || [],
      images: images || {},
      status: "draft",
    });

    res.status(201).json({
      message: "Seminar created successfully",
      seminar,
    });
  } catch (error) {
    console.error("Error in createSeminar:", error);
    res.status(500).json({ error: "Failed to create seminar" });
  }
};

/**
 * Update seminar
 * @route PUT /api/seminars/:id
 */
export const updateSeminar = async (req, res) => {
  try {
    const seminar = req.seminar; // Attached by isSeminarOwner middleware

    const {
      title,
      shortDescription,
      description,
      category,
      level,
      pricing,
      location,
      sessions,
      requirements,
      whatYouWillLearn,
      images,
    } = req.body;

    // Update fields
    if (title) {
      seminar.title = title;
      // Regenerate slug if title changed
      const newSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      if (newSlug !== seminar.slug) {
        seminar.slug = newSlug;
      }
    }
    if (shortDescription) seminar.shortDescription = shortDescription;
    if (description) seminar.description = description;
    if (category) seminar.category = category;
    if (level) seminar.level = level;
    if (pricing) seminar.pricing = pricing;
    if (location) seminar.location = location;
    if (requirements) seminar.requirements = requirements;
    if (whatYouWillLearn) seminar.whatYouWillLearn = whatYouWillLearn;
    if (images) seminar.images = images;

    // Update sessions
    if (sessions) {
      // Preserve existing session IDs and attendee counts
      const updatedSessions = sessions.map((newSession) => {
        const existingSession = seminar.sessions.find(
          (s) => s.sessionId === newSession.sessionId
        );
        return {
          ...newSession,
          sessionId: newSession.sessionId || uuidv4(),
          currentAttendees: existingSession
            ? existingSession.currentAttendees
            : 0,
          status: existingSession ? existingSession.status : "scheduled",
        };
      });
      seminar.sessions = updatedSessions;
    }

    await seminar.save();

    res.status(200).json({
      message: "Seminar updated successfully",
      seminar,
    });
  } catch (error) {
    console.error("Error in updateSeminar:", error);
    res.status(500).json({ error: "Failed to update seminar" });
  }
};

/**
 * Delete seminar
 * @route DELETE /api/seminars/:id
 */
export const deleteSeminar = async (req, res) => {
  try {
    const seminar = req.seminar; // Attached by isSeminarOwner middleware

    // Check if there are any confirmed bookings
    const hasBookings = seminar.sessions.some((s) => s.currentAttendees > 0);
    if (hasBookings) {
      return res.status(400).json({
        error: "Cannot delete seminar with existing bookings",
      });
    }

    await Seminar.findByIdAndDelete(req.params.id);

    res.status(200).json({
      message: "Seminar deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteSeminar:", error);
    res.status(500).json({ error: "Failed to delete seminar" });
  }
};

/**
 * Publish seminar
 * @route PATCH /api/seminars/:id/publish
 */
export const publishSeminar = async (req, res) => {
  try {
    const seminar = req.seminar;

    // Validation before publishing
    if (!seminar.images?.main?.url) {
      return res.status(400).json({ error: "Main image required" });
    }

    if (seminar.sessions.length === 0) {
      return res.status(400).json({ error: "At least one session required" });
    }

    seminar.status = "published";
    await seminar.save();

    res.status(200).json({
      message: "Seminar published successfully",
      seminar,
    });
  } catch (error) {
    console.error("Error in publishSeminar:", error);
    res.status(500).json({ error: "Failed to publish seminar" });
  }
};

/**
 * Archive seminar
 * @route PATCH /api/seminars/:id/archive
 */
export const archiveSeminar = async (req, res) => {
  try {
    const seminar = req.seminar;

    seminar.status = "archived";
    await seminar.save();

    res.status(200).json({
      message: "Seminar archived successfully",
      seminar,
    });
  } catch (error) {
    console.error("Error in archiveSeminar:", error);
    res.status(500).json({ error: "Failed to archive seminar" });
  }
};
