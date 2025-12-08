import Service from "../models/Service.js";

/**
 * Middleware to check if admin has permission to modify a specific service
 *
 * PERMISSION RULES:
 * - SUPER_ADMIN & SALON_ADMIN: Can modify any service
 * - BEAUTICIAN (admin role): Can only modify services assigned to them
 *
 * @param {string} action - 'edit' or 'delete'
 */
export function checkServicePermission(action = "edit") {
  return async (req, res, next) => {
    try {
      const admin = req.admin; // Set by requireAdmin middleware
      const serviceId = req.params.id;

      if (!admin) {
        return res.status(401).json({
          error: "Authentication required",
        });
      }

      // SUPER_ADMIN and SALON_ADMIN can do anything
      if (admin.role === "super_admin" || admin.role === "salon-admin") {
        return next();
      }

      // BEAUTICIAN role: Check if service is assigned to them
      if (admin.role === "admin" || admin.role === "specialist") {
        if (!admin.beauticianId) {
          return res.status(403).json({
            error: "Access denied",
            message: "Your account is not linked to a specialist profile.",
          });
        }

        // Find the service
        const service = await Service.findById(serviceId);
        if (!service) {
          return res.status(404).json({ error: "Service not found" });
        }

        // Check if specialist is assigned (primary or additional)
        const beauticianIdStr = String(admin.beauticianId);
        const isPrimary =
          service.primaryBeauticianId &&
          String(service.primaryBeauticianId) === beauticianIdStr;
        const isAdditional =
          service.additionalBeauticianIds &&
          service.additionalBeauticianIds.some(
            (id) => String(id) === beauticianIdStr
          );

        if (!isPrimary && !isAdditional) {
          return res.status(403).json({
            error: "Access denied",
            message: `You can only ${action} services assigned to you.`,
          });
        }

        // BEAUTICIAN can edit and delete their assigned services
        return next();
      }

      // Unknown role
      return res.status(403).json({
        error: "Access denied",
        message: "Invalid role",
      });
    } catch (error) {
      console.error("checkServicePermission error:", error);
      return res.status(500).json({
        error: "Permission check failed",
        details: error.message,
      });
    }
  };
}

export default checkServicePermission;
