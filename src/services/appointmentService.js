import dayjs from "dayjs";
import mongoose from "mongoose";
import Appointment from "../models/Appointment.js";
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
   * @param {string} options.tenantId - Tenant ID for filtering
   * @returns {Promise<Object>} Paginated appointments with populated services
   */
  async getAppointmentsPaginated({
    page = 1,
    limit = 50,
    tenantId = null,
  } = {}) {
    const skip = (page - 1) * limit;

    // Fetch appointments and total count in parallel
    const [appointments, total] = await Promise.all([
      AppointmentRepository.findAll({ skip, limit, tenantId }),
      AppointmentRepository.count({}, tenantId),
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
   * @param {string} tenantId - Tenant ID for filtering
   * @returns {Promise<Array>} All appointments with populated services
   */
  async getAllAppointments(tenantId = null) {
    const appointments = await AppointmentRepository.findAll({
      skip: 0,
      limit: Number.MAX_SAFE_INTEGER,
      tenantId,
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

  async getDashboardMetrics({ tenantId, specialistId = null } = {}) {
    if (!tenantId) {
      throw new Error("tenantId is required to compute dashboard metrics");
    }

    const tenantObjectId =
      typeof tenantId === "string"
        ? new mongoose.Types.ObjectId(tenantId)
        : tenantId;

    const match = { tenantId: tenantObjectId };

    if (specialistId && specialistId !== "all") {
      match.specialistId =
        typeof specialistId === "string"
          ? new mongoose.Types.ObjectId(specialistId)
          : specialistId;
    }

    const now = dayjs();
    const startOfToday = now.startOf("day").toDate();
    const startOfTomorrow = now.add(1, "day").startOf("day").toDate();
    const startOfThisMonth = now.startOf("month").toDate();
    const startOfNextMonth = dayjs(startOfThisMonth).add(1, "month").toDate();
    const startOfLastMonth = dayjs(startOfThisMonth)
      .subtract(1, "month")
      .toDate();

    const priceExpression = {
      $ifNull: [
        "$totalPrice",
        {
          $ifNull: [
            "$price",
            {
              $cond: [
                { $ifNull: ["$payment.amountTotal", false] },
                { $divide: ["$payment.amountTotal", 100] },
                0,
              ],
            },
          ],
        },
      ],
    };

    const customerKeyExpression = {
      $let: {
        vars: {
          clientId: {
            $cond: [
              { $ifNull: ["$clientId", false] },
              { $toString: "$clientId" },
              null,
            ],
          },
          clientObjectId: {
            $cond: [
              { $ifNull: ["$client._id", false] },
              { $toString: "$client._id" },
              null,
            ],
          },
          email: {
            $cond: [
              { $ifNull: ["$client.email", false] },
              { $toLower: "$client.email" },
              null,
            ],
          },
          phone: {
            $cond: [
              { $ifNull: ["$client.phone", false] },
              { $toString: "$client.phone" },
              null,
            ],
          },
          name: {
            $cond: [
              { $ifNull: ["$client.name", false] },
              { $concat: ["name:", "$client.name"] },
              null,
            ],
          },
          appointmentKey: { $toString: "$_id" },
        },
        in: {
          $ifNull: [
            "$$clientId",
            {
              $ifNull: [
                "$$clientObjectId",
                {
                  $ifNull: [
                    "$$email",
                    {
                      $ifNull: [
                        "$$phone",
                        {
                          $ifNull: [
                            "$$name",
                            { $concat: ["appointment:", "$$appointmentKey"] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    };

    const completedStatuses = ["confirmed", "completed"];

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          priceValue: priceExpression,
          customerKey: customerKeyExpression,
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $cond: [
                { $in: ["$status", completedStatuses] },
                "$priceValue",
                0,
              ],
            },
          },
          thisMonthRevenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$status", completedStatuses] },
                    { $gte: ["$start", startOfThisMonth] },
                    { $lt: ["$start", startOfNextMonth] },
                  ],
                },
                "$priceValue",
                0,
              ],
            },
          },
          lastMonthRevenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$status", completedStatuses] },
                    { $gte: ["$start", startOfLastMonth] },
                    { $lt: ["$start", startOfThisMonth] },
                  ],
                },
                "$priceValue",
                0,
              ],
            },
          },
          thisMonthAppointments: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$start", startOfThisMonth] },
                    { $lt: ["$start", startOfNextMonth] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          lastMonthAppointments: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$start", startOfLastMonth] },
                    { $lt: ["$start", startOfThisMonth] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          todayAppointments: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$start", startOfToday] },
                    { $lt: ["$start", startOfTomorrow] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          customers: { $addToSet: "$customerKey" },
        },
      },
    ];

    const [result] = await Appointment.aggregate(pipeline);

    const metrics = result || {
      totalRevenue: 0,
      thisMonthRevenue: 0,
      lastMonthRevenue: 0,
      thisMonthAppointments: 0,
      lastMonthAppointments: 0,
      todayAppointments: 0,
      customers: [],
    };

    const revenueTrend =
      metrics.lastMonthRevenue > 0
        ? ((metrics.thisMonthRevenue - metrics.lastMonthRevenue) /
            metrics.lastMonthRevenue) *
          100
        : metrics.thisMonthRevenue > 0
        ? 100
        : 0;

    const appointmentsTrend =
      metrics.lastMonthAppointments > 0
        ? ((metrics.thisMonthAppointments - metrics.lastMonthAppointments) /
            metrics.lastMonthAppointments) *
          100
        : metrics.thisMonthAppointments > 0
        ? 100
        : 0;

    return {
      totalRevenue: metrics.totalRevenue || 0,
      thisMonthRevenue: metrics.thisMonthRevenue || 0,
      lastMonthRevenue: metrics.lastMonthRevenue || 0,
      revenueTrend,
      totalAppointments: metrics.thisMonthAppointments || 0,
      appointmentsTrend,
      todayAppointments: metrics.todayAppointments || 0,
      uniqueCustomers: (metrics.customers || []).length,
    };
  }
}

export default new AppointmentService();
