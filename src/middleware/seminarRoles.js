import Seminar from "../models/Seminar.js";

/**
 * Check if user is admin
 */
export const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

/**
 * Check if user is a specialist
 */
export const isSpecialist = async (req, res, next) => {
  try {
    // Check if user has admin or specialist role
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (req.user.role === "admin" || req.user.role === "specialist") {
      return next();
    }

    return res.status(403).json({ error: "Specialist access required" });
  } catch (error) {
    console.error("isSpecialist middleware error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * Check if user is the owner of the seminar or an admin
 */
export const isSeminarOwner = async (req, res, next) => {
  try {
    const seminarId = req.params.id;

    // Find the seminar
    const seminar = await Seminar.findById(seminarId);

    if (!seminar) {
      return res.status(404).json({ error: "Seminar not found" });
    }

    // Check if user is admin or seminar owner
    if (
      req.user.role === "admin" ||
      seminar.specialistId.toString() === req.user._id.toString()
    ) {
      req.seminar = seminar; // Attach seminar to request for controller use
      return next();
    }

    return res.status(403).json({
      error: "You do not have permission to access this seminar",
    });
  } catch (error) {
    console.error("isSeminarOwner middleware error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};
