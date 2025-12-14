import AppointmentRepository from "../repositories/AppointmentRepository.js";

/**
 * Service layer for Appointment business logic
 * Orchestrates data access and implements business rules
 */
class AppointmentService {
  /**
   * Get appointments with paginated results and populated services
   * Performance optimized with bulk fetching
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated appointments with populated services
   */
  async getAppointmentsPaginated({ page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;

    // Fetch appointments and total count in parallel
    const [appointments, total] = await Promise.all([
      AppointmentRepository.findAll({ skip, limit }),
      AppointmentRepository.count(),
    ]);

    // Bulk populate services for performance
    const populatedAppointments = await this.populateServicesInBulk(
      appointments
    );

    return {
      data: populatedAppointments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  /**
   * Get all appointments with populated services (no pagination)
   * @returns {Promise<Array>} All appointments with populated services
   */
  async getAllAppointments() {
    const appointments = await AppointmentRepository.findAll({
      skip: 0,
      limit: Number.MAX_SAFE_INTEGER,
    });
    return await this.populateServicesInBulk(appointments);
  }

  /**
   * Get single appointment by ID with populated services
   * @param {string} id - Appointment ID
   * @returns {Promise<Object|null>} Appointment with populated services
   */
  async getAppointmentById(id) {
    const appointment = await AppointmentRepository.findById(id);
    if (!appointment) return null;

    // Collect all service IDs (including legacy single service)
    const serviceIdsToFetch = [];
    if (appointment.serviceId) {
      serviceIdsToFetch.push(appointment.serviceId);
    }
    if (appointment.services && appointment.services.length > 0) {
      appointment.services.forEach((svc) => {
        if (svc.serviceId) serviceIdsToFetch.push(svc.serviceId);
      });
    }

    // Bulk fetch all services
    const services = await AppointmentRepository.findServicesByIds(
      serviceIdsToFetch
    );
    const serviceMap = AppointmentRepository.createServiceMap(services);

    // Populate services in appointment
    return this.enrichAppointmentWithServices(appointment, serviceMap);
  }

  /**
   * Populate services for multiple appointments in bulk (performance optimized)
   * Avoids N+1 query problem by fetching all services in one query
   * @param {Array} appointments - Array of appointments
   * @returns {Promise<Array>} Appointments with populated services
   */
  async populateServicesInBulk(appointments) {
    if (!appointments || appointments.length === 0) return [];

    // Extract all unique service IDs across all appointments
    const serviceIds = AppointmentRepository.extractServiceIds(appointments);

    // Bulk fetch all services in one query
    const services = await AppointmentRepository.findServicesByIds(
      Array.from(serviceIds)
    );

    // Create map for O(1) lookups
    const serviceMap = AppointmentRepository.createServiceMap(services);

    // Enrich each appointment with its services
    return appointments.map((appointment) =>
      this.enrichAppointmentWithServices(appointment, serviceMap)
    );
  }

  /**
   * Enrich a single appointment with service details
   * @param {Object} appointment - Appointment object
   * @param {Map} serviceMap - Map of serviceId -> service object
   * @returns {Object} Enriched appointment
   */
  enrichAppointmentWithServices(appointment, serviceMap) {
    // Populate services array
    let populatedServices = null;
    if (appointment.services && appointment.services.length > 0) {
      populatedServices = appointment.services.map((svc) => {
        const service = svc.serviceId
          ? serviceMap.get(svc.serviceId.toString())
          : null;
        return {
          ...svc,
          service,
          serviceName: service?.name || null,
        };
      });
    }

    return {
      ...appointment,
      service:
        appointment.serviceId &&
        typeof appointment.serviceId === "object" &&
        appointment.serviceId._id
          ? appointment.serviceId
          : null,
      specialist:
        appointment.specialistId &&
        typeof appointment.specialistId === "object" &&
        appointment.specialistId._id
          ? appointment.specialistId
          : null,
      services: populatedServices,
    };
  }

  /**
   * Bulk fetch service details by IDs (for use in other routes)
   * @param {Array<string>} serviceIds - Array of service IDs
   * @returns {Promise<Map>} Map of serviceId -> service object
   */
  async getServiceMapByIds(serviceIds) {
    const services = await AppointmentRepository.findServicesByIds(serviceIds);
    return AppointmentRepository.createServiceMap(services);
  }
}

export default new AppointmentService();
