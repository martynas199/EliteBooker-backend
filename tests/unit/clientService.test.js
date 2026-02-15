import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import mongoose from "mongoose";

const mockClientModel = {
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
};

const mockTenantClientModel = {
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
};

const mockAppointmentModel = {
  find: jest.fn(),
  create: jest.fn(),
  aggregate: jest.fn(),
};

jest.unstable_mockModule("../../src/models/Client.js", () => ({
  default: mockClientModel,
}));

jest.unstable_mockModule("../../src/models/TenantClient.js", () => ({
  default: mockTenantClientModel,
}));

jest.unstable_mockModule("../../src/models/Appointment.js", () => ({
  default: mockAppointmentModel,
}));

const { default: ClientService } = await import("../../src/services/clientService.js");

describe("ClientService.updateTenantClientMetrics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppointmentModel.aggregate.mockResolvedValue([]);
    mockTenantClientModel.findOneAndUpdate.mockResolvedValue(null);
  });

  it("aggregates booking metrics and updates tenant client", async () => {
    const tenantId = new mongoose.Types.ObjectId().toString();
    const clientId = new mongoose.Types.ObjectId().toString();
    const lastVisit = new Date("2026-02-14T12:30:00.000Z");

    mockAppointmentModel.aggregate.mockResolvedValue([
      {
        totalSpend: 360,
        totalVisits: 4,
        lastVisit,
      },
    ]);

    await ClientService.updateTenantClientMetrics(tenantId, clientId);

    expect(mockAppointmentModel.aggregate).toHaveBeenCalledTimes(1);
    const [pipeline] = mockAppointmentModel.aggregate.mock.calls[0];
    expect(pipeline[0].$match.tenantId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(pipeline[0].$match.clientId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(pipeline[0].$match.status).toEqual({
      $in: ["confirmed", "completed"],
    });

    expect(mockTenantClientModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        tenantId: expect.any(mongoose.Types.ObjectId),
        clientId: expect.any(mongoose.Types.ObjectId),
      },
      {
        $set: expect.objectContaining({
          totalSpend: 360,
          totalVisits: 4,
          lastVisit,
          averageSpend: 90,
          lifetimeValue: 360,
        }),
      }
    );
  });

  it("sets metrics to zero when client has no confirmed bookings", async () => {
    const tenantId = new mongoose.Types.ObjectId().toString();
    const clientId = new mongoose.Types.ObjectId().toString();

    mockAppointmentModel.aggregate.mockResolvedValue([]);

    await ClientService.updateTenantClientMetrics(tenantId, clientId);

    expect(mockTenantClientModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        tenantId: expect.any(mongoose.Types.ObjectId),
        clientId: expect.any(mongoose.Types.ObjectId),
      },
      {
        $set: expect.objectContaining({
          totalSpend: 0,
          totalVisits: 0,
          lastVisit: null,
          averageSpend: 0,
          lifetimeValue: 0,
        }),
      }
    );
  });
});

