/**
 * Unit Tests for Multi-Tenant Plugin
 *
 * Tests that the multiTenantPlugin correctly:
 * - Filters queries by tenantId
 * - Prevents cross-tenant data access
 * - Handles edge cases
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Appointment from "../../src/models/Appointment.js";
import Service from "../../src/models/Service.js";

let mongoServer;

beforeAll(async () => {
  // Disconnect from any existing connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all collections before each test
  await Appointment.deleteMany({});
  await Service.deleteMany({});
});

describe("Multi-Tenant Plugin - Tenant Isolation", () => {
  const tenant1Id = new mongoose.Types.ObjectId();
  const tenant2Id = new mongoose.Types.ObjectId();
  const serviceId = new mongoose.Types.ObjectId();
  const beauticianId = new mongoose.Types.ObjectId();

  it("should only return documents for the current tenant context", async () => {
    // Create appointments for two different tenants
    await Appointment.create({
      tenantId: tenant1Id,
      serviceId,
      beauticianId,
      start: new Date("2025-12-01T10:00:00"),
      end: new Date("2025-12-01T11:00:00"),
      price: 5000,
      status: "confirmed",
      client: {
        name: "Tenant 1 Customer",
        email: "customer1@tenant1.com",
        phone: "1234567890",
      },
      payment: {
        mode: "pay_now",
        provider: "stripe",
        status: "unpaid",
        amountTotal: 5000,
      },
    });

    await Appointment.create({
      tenantId: tenant2Id,
      serviceId,
      beauticianId,
      start: new Date("2025-12-01T11:00:00"),
      end: new Date("2025-12-01T12:00:00"),
      price: 6000,
      status: "confirmed",
      client: {
        name: "Tenant 2 Customer",
        email: "customer2@tenant2.com",
        phone: "0987654321",
      },
      payment: {
        mode: "pay_now",
        provider: "stripe",
        status: "unpaid",
        amountTotal: 6000,
      },
    });

    // Set tenant context to tenant1
    Appointment.setTenantContext(tenant1Id);

    // Query should only return tenant1's appointments
    const tenant1Appointments = await Appointment.find({});
    expect(tenant1Appointments).toHaveLength(1);
    expect(tenant1Appointments[0].client.email).toBe("customer1@tenant1.com");
    expect(tenant1Appointments[0].tenantId.toString()).toBe(
      tenant1Id.toString()
    );

    // Set tenant context to tenant2
    Appointment.setTenantContext(tenant2Id);

    // Query should only return tenant2's appointments
    const tenant2Appointments = await Appointment.find({});
    expect(tenant2Appointments).toHaveLength(1);
    expect(tenant2Appointments[0].client.email).toBe("customer2@tenant2.com");
    expect(tenant2Appointments[0].tenantId.toString()).toBe(
      tenant2Id.toString()
    );
  });

  it("should prevent updates to documents from other tenants", async () => {
    // Create appointment for tenant1
    const appt = await Appointment.create({
      tenantId: tenant1Id,
      serviceId,
      beauticianId,
      date: new Date("2025-12-01"),
      startTime: "10:00",
      endTime: "11:00",
      status: "confirmed",
      customerName: "Tenant 1 Customer",
      customerEmail: "customer1@tenant1.com",
      customerPhone: "1234567890",
      payment: {
        amount: 5000,
        currency: "GBP",
        status: "unpaid",
      },
    });

    // Set tenant context to tenant2
    Appointment.setTenantContext(tenant2Id);

    // Try to update tenant1's appointment while in tenant2 context
    const result = await Appointment.updateOne(
      { _id: appt._id },
      { $set: { status: "cancelled" } }
    );

    // Update should not affect any documents
    expect(result.matchedCount).toBe(0);
    expect(result.modifiedCount).toBe(0);

    // Verify appointment was not updated
    Appointment.setTenantContext(tenant1Id);
    const unchangedAppt = await Appointment.findById(appt._id);
    expect(unchangedAppt.status).toBe("confirmed");
  });

  it("should prevent deletion of documents from other tenants", async () => {
    // Create appointment for tenant1
    const appt = await Appointment.create({
      tenantId: tenant1Id,
      serviceId,
      beauticianId,
      date: new Date("2025-12-01"),
      startTime: "10:00",
      endTime: "11:00",
      status: "confirmed",
      customerName: "Tenant 1 Customer",
      customerEmail: "customer1@tenant1.com",
      customerPhone: "1234567890",
      payment: {
        amount: 5000,
        currency: "GBP",
        status: "unpaid",
      },
    });

    // Set tenant context to tenant2
    Appointment.setTenantContext(tenant2Id);

    // Try to delete tenant1's appointment while in tenant2 context
    const result = await Appointment.deleteOne({ _id: appt._id });

    // Delete should not affect any documents
    expect(result.deletedCount).toBe(0);

    // Verify appointment still exists
    Appointment.setTenantContext(tenant1Id);
    const stillExists = await Appointment.findById(appt._id);
    expect(stillExists).not.toBeNull();
  });

  it("should prevent finding documents by ID from other tenants", async () => {
    // Create appointment for tenant1
    const appt = await Appointment.create({
      tenantId: tenant1Id,
      serviceId,
      beauticianId,
      date: new Date("2025-12-01"),
      startTime: "10:00",
      endTime: "11:00",
      status: "confirmed",
      customerName: "Tenant 1 Customer",
      customerEmail: "customer1@tenant1.com",
      customerPhone: "1234567890",
      payment: {
        amount: 5000,
        currency: "GBP",
        status: "unpaid",
      },
    });

    // Set tenant context to tenant2
    Appointment.setTenantContext(tenant2Id);

    // Try to find tenant1's appointment by ID while in tenant2 context
    const notFound = await Appointment.findById(appt._id);

    // Should return null
    expect(notFound).toBeNull();
  });

  it("should automatically add tenantId when creating documents", async () => {
    // Set tenant context
    Appointment.setTenantContext(tenant1Id);

    // Create appointment without explicitly setting tenantId
    const appt = await Appointment.create({
      serviceId,
      beauticianId,
      date: new Date("2025-12-01"),
      startTime: "10:00",
      endTime: "11:00",
      status: "confirmed",
      customerName: "Test Customer",
      customerEmail: "test@example.com",
      customerPhone: "1234567890",
      payment: {
        amount: 5000,
        currency: "GBP",
        status: "unpaid",
      },
    });

    // tenantId should be automatically set
    expect(appt.tenantId.toString()).toBe(tenant1Id.toString());
  });

  it("should prevent changing tenantId after creation", async () => {
    // Create appointment for tenant1
    const appt = await Appointment.create({
      tenantId: tenant1Id,
      serviceId,
      beauticianId,
      date: new Date("2025-12-01"),
      startTime: "10:00",
      endTime: "11:00",
      status: "confirmed",
      customerName: "Test Customer",
      customerEmail: "test@example.com",
      customerPhone: "1234567890",
      payment: {
        amount: 5000,
        currency: "GBP",
        status: "unpaid",
      },
    });

    // Try to change tenantId - should throw error
    appt.tenantId = tenant2Id;
    await expect(appt.save()).rejects.toThrow(
      "tenantId cannot be modified after creation"
    );

    // Verify tenantId remained unchanged (reload from DB with correct tenant context)
    Appointment.setTenantContext(tenant1Id);
    const reloaded = await Appointment.findById(appt._id);
    expect(reloaded).not.toBeNull();
    expect(reloaded.tenantId.toString()).toBe(tenant1Id.toString());
  });

  it("should work with countDocuments", async () => {
    // Create appointments for two tenants
    await Appointment.create({
      tenantId: tenant1Id,
      serviceId,
      beauticianId,
      date: new Date("2025-12-01"),
      startTime: "10:00",
      endTime: "11:00",
      status: "confirmed",
      customerName: "Tenant 1 Customer 1",
      customerEmail: "customer1@tenant1.com",
      customerPhone: "1234567890",
      payment: { amount: 5000, currency: "GBP", status: "unpaid" },
    });

    await Appointment.create({
      tenantId: tenant1Id,
      serviceId,
      beauticianId,
      date: new Date("2025-12-02"),
      startTime: "10:00",
      endTime: "11:00",
      status: "confirmed",
      customerName: "Tenant 1 Customer 2",
      customerEmail: "customer2@tenant1.com",
      customerPhone: "1234567891",
      payment: { amount: 5000, currency: "GBP", status: "unpaid" },
    });

    await Appointment.create({
      tenantId: tenant2Id,
      serviceId,
      beauticianId,
      date: new Date("2025-12-01"),
      startTime: "11:00",
      endTime: "12:00",
      status: "confirmed",
      customerName: "Tenant 2 Customer",
      customerEmail: "customer@tenant2.com",
      customerPhone: "0987654321",
      payment: { amount: 6000, currency: "GBP", status: "unpaid" },
    });

    // Set tenant context to tenant1
    Appointment.setTenantContext(tenant1Id);
    const count1 = await Appointment.countDocuments({});
    expect(count1).toBe(2);

    // Set tenant context to tenant2
    Appointment.setTenantContext(tenant2Id);
    const count2 = await Appointment.countDocuments({});
    expect(count2).toBe(1);
  });

  it("should clear tenant context when set to null", async () => {
    // Clear any existing appointments first
    Appointment.setTenantContext(null);
    await Appointment.deleteMany({});

    // Create appointments for tenant1
    await Appointment.create({
      tenantId: tenant1Id,
      serviceId,
      beauticianId,
      start: new Date("2025-12-01T10:00:00"),
      end: new Date("2025-12-01T11:00:00"),
      price: 5000,
      status: "confirmed",
      client: {
        name: "Test Customer",
        email: "test@example.com",
        phone: "1234567890",
      },
      payment: {
        mode: "pay_now",
        provider: "stripe",
        status: "unpaid",
        amountTotal: 5000,
      },
    });

    // Set tenant context
    Appointment.setTenantContext(tenant1Id);
    let count = await Appointment.countDocuments({});
    expect(count).toBe(1);

    // Clear tenant context
    Appointment.setTenantContext(null);
    count = await Appointment.countDocuments({});
    expect(count).toBe(1); // Should see all documents
  });
});
