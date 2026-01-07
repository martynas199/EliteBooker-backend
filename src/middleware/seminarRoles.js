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

    // Use req.admin from requireAdmin middleware (with fallback to req.user)
    const admin = req.admin || req.user;
    
    if (!admin) {
      return res.status(401).json({ error: "Authentication required" });
    }

    console.log("[isSeminarOwner] Permission check:", {
      adminRole: admin.role,
      adminId: admin._id.toString(),
      seminarSpecialistId: seminar.specialistId.toString(),
    });

    // Check if user is admin role or seminar owner
    const isAdminRole = ["super_admin", "admin", "owner", "manager"].includes(admin.role);
    const isOwner = seminar.specialistId.toString() === admin._id.toString();
    
    if (isAdminRole || isOwner) {
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
