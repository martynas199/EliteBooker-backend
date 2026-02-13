import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import mongoose from "mongoose";

const mockAppointmentRepository = {
  findAll: jest.fn(),
  count: jest.fn(),
  findById: jest.fn(),
  findServicesByIds: jest.fn(),
  createServiceMap: jest.fn(),
  extractServiceIds: jest.fn(),
};

const mockServiceModel = {
  find: jest.fn(),
};

const mockAppointmentModel = {
  aggregate: jest.fn(),
};

jest.unstable_mockModule("../../src/repositories/AppointmentRepository.js", () => ({
  default: mockAppointmentRepository,
}));

jest.unstable_mockModule("../../src/models/Service.js", () => ({
  default: mockServiceModel,
}));

jest.unstable_mockModule("../../src/models/Appointment.js", () => ({
  default: mockAppointmentModel,
}));

const { default: AppointmentService } = await import(
  "../../src/services/appointmentService.js"
);

function mockServiceSearchResult(results = []) {
  const lean = jest.fn().mockResolvedValue(results);
  const limit = jest.fn().mockReturnValue({ lean });
  const select = jest.fn().mockReturnValue({ limit });
  mockServiceModel.find.mockReturnValue({ select });
}

describe("AppointmentService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppointmentRepository.findAll.mockResolvedValue([]);
    mockAppointmentRepository.count.mockResolvedValue(0);
    mockAppointmentRepository.findById.mockResolvedValue(null);
    mockAppointmentRepository.findServicesByIds.mockResolvedValue([]);
    mockAppointmentRepository.createServiceMap.mockReturnValue(new Map());
    mockAppointmentRepository.extractServiceIds.mockReturnValue(new Set());
    mockAppointmentModel.aggregate.mockResolvedValue([]);
    mockServiceSearchResult([]);
  });

  it("builds specialist/status/search/date filters correctly", async () => {
    const specialistId = new mongoose.Types.ObjectId().toString();
    const serviceId = new mongoose.Types.ObjectId();
    mockServiceSearchResult([{ _id: serviceId }]);

    const filters = await AppointmentService.buildAppointmentFilters({
      specialistId,
      status: "cancelled",
      search: "lash",
      dateFrom: "2026-02-01T00:00:00.000Z",
      dateTo: "2026-02-28T23:59:59.999Z",
    });

    expect(filters.specialistId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(filters.specialistId.toString()).toBe(specialistId);
    expect(filters.status.$regex).toBeInstanceOf(RegExp);
    expect(filters.status.$regex.test("cancelled_no_refund")).toBe(true);
    expect(filters.start).toEqual({
      $gte: new Date("2026-02-01T00:00:00.000Z"),
      $lte: new Date("2026-02-28T23:59:59.999Z"),
    });
    expect(filters.$or).toEqual(
      expect.arrayContaining([
        { "client.name": expect.any(RegExp) },
        { "client.email": expect.any(RegExp) },
        { "client.phone": expect.any(RegExp) },
        { variantName: expect.any(RegExp) },
        { serviceId: { $in: [serviceId] } },
        { "services.serviceId": { $in: [serviceId] } },
      ]),
    );
  });

  it("ignores invalid filter inputs safely", async () => {
    const filters = await AppointmentService.buildAppointmentFilters({
      specialistId: "invalid-specialist-id",
      status: "all",
      search: "",
      dateFrom: "invalid-date",
      dateTo: "invalid-date",
    });

    expect(filters).toEqual({});
  });

  it("uses normalized filters in paginated appointment queries", async () => {
    const normalizedFilters = { status: "confirmed" };
    const buildFiltersSpy = jest
      .spyOn(AppointmentService, "buildAppointmentFilters")
      .mockResolvedValue(normalizedFilters);
    const populateSpy = jest
      .spyOn(AppointmentService, "populateServicesInBulk")
      .mockResolvedValue([{ _id: "apt-1" }]);

    mockAppointmentRepository.findAll.mockResolvedValue([{ _id: "apt-1" }]);
    mockAppointmentRepository.count.mockResolvedValue(23);

    const result = await AppointmentService.getAppointmentsPaginated({
      page: 2,
      limit: 10,
      tenantId: "tenant-1",
      filters: { status: "confirmed" },
    });

    expect(buildFiltersSpy).toHaveBeenCalledWith({ status: "confirmed" });
    expect(mockAppointmentRepository.findAll).toHaveBeenCalledWith({
      skip: 10,
      limit: 10,
      filters: normalizedFilters,
      tenantId: "tenant-1",
    });
    expect(mockAppointmentRepository.count).toHaveBeenCalledWith(
      normalizedFilters,
      "tenant-1",
    );
    expect(populateSpy).toHaveBeenCalledWith([{ _id: "apt-1" }]);
    expect(result).toEqual({
      data: [{ _id: "apt-1" }],
      pagination: {
        page: 2,
        limit: 10,
        total: 23,
        totalPages: 3,
        hasMore: true,
      },
    });
  });

  it("computes dashboard metrics including new KPI fields", async () => {
    mockAppointmentModel.aggregate.mockResolvedValue([
      {
        totalRevenue: 2000,
        thisMonthRevenue: 1200,
        lastMonthRevenue: 600,
        thisMonthAppointments: 18,
        lastMonthAppointments: 12,
        thisMonthNoShows: 3,
        upcomingAppointments: 9,
        todayAppointments: 4,
        customers: ["customer-1", "customer-2"],
      },
    ]);

    const tenantId = new mongoose.Types.ObjectId().toString();
    const specialistId = new mongoose.Types.ObjectId().toString();

    const metrics = await AppointmentService.getDashboardMetrics({
      tenantId,
      specialistId,
    });

    expect(mockAppointmentModel.aggregate).toHaveBeenCalledTimes(1);
    const [pipeline] = mockAppointmentModel.aggregate.mock.calls[0];
    expect(pipeline[0].$match.tenantId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(pipeline[0].$match.specialistId).toBeInstanceOf(
      mongoose.Types.ObjectId,
    );
    expect(metrics).toMatchObject({
      totalRevenue: 2000,
      thisMonthRevenue: 1200,
      lastMonthRevenue: 600,
      totalAppointments: 18,
      todayAppointments: 4,
      upcomingAppointments: 9,
      noShowsThisMonth: 3,
      uniqueCustomers: 2,
    });
    expect(metrics.revenueTrend).toBeCloseTo(100);
    expect(metrics.appointmentsTrend).toBeCloseTo(50);
  });

  it("requires tenantId when computing metrics", async () => {
    await expect(AppointmentService.getDashboardMetrics({})).rejects.toThrow(
      "tenantId is required to compute dashboard metrics",
    );
  });
});
