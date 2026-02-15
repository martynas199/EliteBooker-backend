import { describe, expect, it, jest } from "@jest/globals";
import { autoFillCancelledSlot } from "../../src/services/waitlistAutoFillService.js";

const toQueryResult = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const toWaitlistFindChain = (value) => ({
  sort: jest.fn().mockReturnValue({
    limit: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  }),
});

describe("waitlistAutoFillService", () => {
  it("returns not_cancelled when appointment is not cancelled", async () => {
    const AppointmentModel = {
      findOne: jest.fn().mockReturnValue(
        toQueryResult({
          _id: "appt_1",
          tenantId: "tenant_1",
          status: "confirmed",
        })
      ),
      create: jest.fn(),
    };

    const result = await autoFillCancelledSlot({
      appointmentId: "appt_1",
      tenantId: "tenant_1",
      deps: {
        AppointmentModel,
        WaitlistModel: {
          find: jest.fn(),
        },
      },
    });

    expect(result).toEqual({
      filled: false,
      reason: "appointment_not_cancelled",
    });
    expect(AppointmentModel.create).not.toHaveBeenCalled();
  });

  it("returns no_waitlist_candidates when no active entries match", async () => {
    const AppointmentModel = {
      findOne: jest.fn().mockReturnValue(
        toQueryResult({
          _id: "appt_1",
          tenantId: "tenant_1",
          status: "cancelled_no_refund",
          serviceId: "svc_1",
          variantName: "Standard",
          specialistId: "sp_1",
          start: new Date("2026-03-10T10:00:00.000Z"),
          end: new Date("2026-03-10T11:00:00.000Z"),
        })
      ),
      create: jest.fn(),
    };

    const WaitlistModel = {
      find: jest.fn().mockReturnValue(toWaitlistFindChain([])),
      findOneAndUpdate: jest.fn(),
    };

    const result = await autoFillCancelledSlot({
      appointmentId: "appt_1",
      tenantId: "tenant_1",
      deps: {
        AppointmentModel,
        WaitlistModel,
      },
    });

    expect(result).toEqual({
      filled: false,
      reason: "no_waitlist_candidates",
    });
    expect(AppointmentModel.create).not.toHaveBeenCalled();
  });

  it("creates a new appointment from the first eligible waitlist candidate", async () => {
    const cancelledAppointment = {
      _id: "appt_cancelled_1",
      tenantId: "tenant_1",
      status: "cancelled_no_refund",
      serviceId: "svc_1",
      variantName: "Standard",
      specialistId: "sp_1",
      start: new Date("2026-03-10T10:00:00.000Z"),
      end: new Date("2026-03-10T11:00:00.000Z"),
      price: 50,
    };

    const created = {
      _id: "appt_new_1",
      toObject: () => ({
        _id: "appt_new_1",
        client: { email: "first@example.com" },
      }),
    };

    const AppointmentModel = {
      findOne: jest
        .fn()
        .mockReturnValueOnce(toQueryResult(cancelledAppointment))
        .mockReturnValueOnce(toQueryResult(null)) // no client conflict
        .mockReturnValueOnce(toQueryResult(null)), // no slot conflict
      create: jest.fn().mockResolvedValue(created),
    };

    const WaitlistModel = {
      find: jest.fn().mockReturnValue(
        toWaitlistFindChain([
          {
            _id: "wait_1",
            client: {
              name: "First Client",
              email: "first@example.com",
              phone: "+447700900111",
              userId: "user_1",
            },
          },
        ])
      ),
      findOneAndUpdate: jest.fn().mockReturnValue(toQueryResult({ _id: "wait_1" })),
    };

    const ServiceModel = {
      findById: jest.fn().mockReturnValue(
        toQueryResult({
          _id: "svc_1",
          name: "Haircut",
          variants: [{ name: "Standard", durationMin: 60, price: 50 }],
        })
      ),
    };

    const SpecialistModel = {
      findById: jest.fn().mockReturnValue(
        toQueryResult({
          _id: "sp_1",
          name: "Specialist One",
        })
      ),
    };

    const sendConfirmationEmail = jest.fn().mockResolvedValue();
    const sendWaitlistFillSms = jest.fn().mockResolvedValue();

    const result = await autoFillCancelledSlot({
      appointmentId: "appt_cancelled_1",
      tenantId: "tenant_1",
      deps: {
        AppointmentModel,
        WaitlistModel,
        ServiceModel,
        SpecialistModel,
        sendConfirmationEmail,
        sendWaitlistFillSms,
      },
    });

    expect(result).toEqual({
      filled: true,
      appointmentId: "appt_new_1",
      waitlistEntryId: "wait_1",
    });

    expect(AppointmentModel.create).toHaveBeenCalledTimes(1);
    expect(WaitlistModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(sendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(sendWaitlistFillSms).toHaveBeenCalledTimes(1);
  });

  it("skips candidates with overlapping active bookings and fills with next one", async () => {
    const cancelledAppointment = {
      _id: "appt_cancelled_2",
      tenantId: "tenant_1",
      status: "cancelled_partial_refund",
      serviceId: "svc_1",
      variantName: "Standard",
      specialistId: "sp_1",
      start: new Date("2026-03-10T14:00:00.000Z"),
      end: new Date("2026-03-10T15:00:00.000Z"),
      price: 55,
    };

    const created = {
      _id: "appt_new_2",
      toObject: () => ({ _id: "appt_new_2" }),
    };

    const AppointmentModel = {
      findOne: jest
        .fn()
        .mockReturnValueOnce(toQueryResult(cancelledAppointment))
        .mockReturnValueOnce(toQueryResult({ _id: "existing_client_booking" })) // first candidate has conflict
        .mockReturnValueOnce(toQueryResult(null)) // second candidate no client conflict
        .mockReturnValueOnce(toQueryResult(null)), // slot still free
      create: jest.fn().mockResolvedValue(created),
    };

    const WaitlistModel = {
      find: jest.fn().mockReturnValue(
        toWaitlistFindChain([
          {
            _id: "wait_1",
            client: { name: "Busy Client", email: "busy@example.com" },
          },
          {
            _id: "wait_2",
            client: { name: "Free Client", email: "free@example.com" },
          },
        ])
      ),
      findOneAndUpdate: jest.fn().mockReturnValue(toQueryResult({ _id: "wait_2" })),
    };

    const result = await autoFillCancelledSlot({
      appointmentId: "appt_cancelled_2",
      tenantId: "tenant_1",
      deps: {
        AppointmentModel,
        WaitlistModel,
        ServiceModel: {
          findById: jest.fn().mockReturnValue(
            toQueryResult({
              _id: "svc_1",
              name: "Service",
              variants: [{ name: "Standard", durationMin: 60, price: 55 }],
            })
          ),
        },
        SpecialistModel: {
          findById: jest.fn().mockReturnValue(
            toQueryResult({ _id: "sp_1", name: "Spec" })
          ),
        },
        sendConfirmationEmail: jest.fn().mockResolvedValue(),
        sendWaitlistFillSms: jest.fn().mockResolvedValue(),
      },
    });

    expect(result).toEqual({
      filled: true,
      appointmentId: "appt_new_2",
      waitlistEntryId: "wait_2",
    });
    expect(AppointmentModel.create).toHaveBeenCalledTimes(1);
    expect(WaitlistModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});
