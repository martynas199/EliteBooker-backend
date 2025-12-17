import Appointment from "../models/Appointment.js";
import Service from "../models/Service.js";

/**
 * Repository for Appointment data access
 * Handles all database operations for appointments
 */
class AppointmentRepository {
  /**
   * Find all appointments with optional pagination
   * @param {Object} options - Query options
   * @param {number} options.skip - Number of records to skip
   * @param {number} options.limit - Max records to return
   * @param {Object} options.filters - Additional filters
   * @param {string} options.tenantId - Tenant ID for multi-tenant filtering
   * @returns {Promise<Array>} Array of appointments
   */
  async findAll({ skip = 0, limit = 50, filters = {}, tenantId } = {}) {
    // CRITICAL: Always filter by tenantId to prevent cross-tenant data leaks
    const query = tenantId ? { ...filters, tenantId } : filters;

    return await Appointment.find(query)
      .sort({ start: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: "serviceId", select: "name" })
      .populate({ path: "specialistId", select: "name" })
      .lean();
  }

  /**
   * Count total appointments
   * @param {Object} filters - Query filters
   * @param {string} tenantId - Tenant ID for multi-tenant filtering
   * @returns {Promise<number>} Total count
   */
  async count(filters = {}, tenantId = null) {
    // CRITICAL: Always filter by tenantId to prevent cross-tenant data leaks
    const query = tenantId ? { ...filters, tenantId } : filters;
    return await Appointment.countDocuments(query);
  }

  /**
   * Find appointment by ID
   * @param {string} id - Appointment ID
   * @returns {Promise<Object|null>} Appointment or null
   */
  async findById(id) {
    return await Appointment.findById(id).lean();
  }

  /**
   * Bulk fetch services by IDs (performance optimized)
   * @param {Array<string>} serviceIds - Array of service IDs
   * @returns {Promise<Array>} Array of services
   */
  async findServicesByIds(serviceIds) {
    if (!serviceIds || serviceIds.length === 0) return [];
    return await Service.find({ _id: { $in: serviceIds } })
      .select("name")
      .lean();
  }

  /**
   * Create service ID to service object map for O(1) lookups
   * @param {Array} services - Array of service objects
   * @returns {Map} Map of serviceId -> service object
   */
  createServiceMap(services) {
    return new Map(services.map((s) => [s._id.toString(), s]));
  }

  /**
   * Extract unique service IDs from appointments array
   * @param {Array} appointments - Array of appointments
   * @returns {Set<string>} Set of unique service IDs
   */
  extractServiceIds(appointments) {
    const serviceIds = new Set();
    appointments.forEach((a) => {
      if (a.services && a.services.length > 0) {
        a.services.forEach((svc) => {
          if (svc.serviceId) serviceIds.add(svc.serviceId.toString());
        });
      }
    });
    return serviceIds;
  }
}

export default new AppointmentRepository();
