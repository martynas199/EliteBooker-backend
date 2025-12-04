/**
 * Integration Tests for Cross-Tenant Access Prevention
 *
 * Tests that API endpoints correctly:
 * - Prevent access to other tenants' data
 * - Enforce tenant context from JWT tokens
 * - Handle missing or invalid tenant context
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import app from "../../src/server.js"; // Adjust path as needed
import Tenant from "../../src/models/Tenant.js";
import Admin from "../../src/models/Admin.js";
import Appointment from "../../src/models/Appointment.js";
import Service from "../../src/models/Service.js";
import Beautician from "../../src/models/Beautician.js";

let mongoServer;
let tenant1, tenant2;
let admin1Token, admin2Token;
let admin1, admin2;

beforeAll(async () => {
  // Disconnect from any existing connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  // Create two test tenants
  tenant1 = await Tenant.create({
    name: "Salon One",
    slug: "salon-one",
    businessName: "Salon One Beauty Services",
    email: "contact@salon-one.com",
    phone: "+441234567890",
    status: "active",
  });

  tenant2 = await Tenant.create({
    name: "Salon Two",
    slug: "salon-two",
    businessName: "Salon Two Spa & Wellness",
    email: "contact@salon-two.com",
    phone: "+440987654321",
    status: "active",
  });

  // Create admin users for each tenant
  admin1 = await Admin.create({
    tenantId: tenant1._id,
    email: "admin@salon-one.com",
    password: "hashedpassword123",
    name: "Admin One",
    role: "salon-admin",
  });

  admin2 = await Admin.create({
    tenantId: tenant2._id,
    email: "admin@salon-two.com",
    password: "hashedpassword456",
    name: "Admin Two",
    role: "salon-admin",
  });

  // Generate JWT tokens
  const JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  admin1Token = jwt.sign(
    {
      id: admin1._id.toString(),
      tenantId: tenant1._id.toString(),
      role: "salon-admin",
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  admin2Token = jwt.sign(
    {
      id: admin2._id.toString(),
      tenantId: tenant2._id.toString(),
      role: "salon-admin",
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear relevant collections before each test
  await Appointment.deleteMany({});
  await Service.deleteMany({});
  await Beautician.deleteMany({});
});

describe("Cross-Tenant Access Prevention - API Endpoints", () => {
  describe("GET /api/appointments", () => {
    it("should only return appointments for the authenticated tenant", async () => {
      // Create appointments for both tenants
      const service1 = await Service.create({
        tenantId: tenant1._id,
        name: "Haircut",
        duration: 60,
        price: 5000,
        active: true,
      });

      const service2 = await Service.create({
        tenantId: tenant2._id,
        name: "Manicure",
        duration: 45,
        price: 3000,
        active: true,
      });

      const beautician1 = await Beautician.create({
        tenantId: tenant1._id,
        name: "Beautician One",
        email: "beautician1@salon-one.com",
        active: true,
      });

      const beautician2 = await Beautician.create({
        tenantId: tenant2._id,
        name: "Beautician Two",
        email: "beautician2@salon-two.com",
        active: true,
      });

      await Appointment.create({
        tenantId: tenant1._id,
        serviceId: service1._id,
        beauticianId: beautician1._id,
        start: new Date("2025-12-01T10:00:00"),
        end: new Date("2025-12-01T11:00:00"),
        price: 5000,
        status: "confirmed",
        client: {
          name: "Customer One",
          email: "customer1@example.com",
          phone: "1111111111",
        },
        payment: {
          mode: "pay_now",
          provider: "stripe",
          status: "unpaid",
          amountTotal: 5000,
        },
      });

      await Appointment.create({
        tenantId: tenant2._id,
        serviceId: service2._id,
        beauticianId: beautician2._id,
        start: new Date("2025-12-01T11:00:00"),
        end: new Date("2025-12-01T12:00:00"),
        price: 3000,
        status: "confirmed",
        client: {
          name: "Customer Two",
          email: "customer2@example.com",
          phone: "2222222222",
        },
        payment: {
          mode: "pay_now",
          provider: "stripe",
          status: "unpaid",
          amountTotal: 3000,
        },
      });

      // Request as tenant1 admin
      const response1 = await request(app)
        .get("/api/appointments")
        .set("Authorization", `Bearer ${admin1Token}`)
        .expect(200);

      expect(response1.body).toBeInstanceOf(Array);
      expect(response1.body).toHaveLength(1);
      expect(response1.body[0].client.email).toBe("customer1@example.com");

      // Request as tenant2 admin
      const response2 = await request(app)
        .get("/api/appointments")
        .set("Authorization", `Bearer ${admin2Token}`)
        .expect(200);

      expect(response2.body).toBeInstanceOf(Array);
      expect(response2.body).toHaveLength(1);
      expect(response2.body[0].client.email).toBe("customer2@example.com");
    });
  });

  describe("GET /api/appointments/:id", () => {
    it("should prevent access to appointments from other tenants", async () => {
      // Create appointment for tenant1
      const service = await Service.create({
        tenantId: tenant1._id,
        name: "Haircut",
        duration: 60,
        price: 5000,
        active: true,
      });

      const beautician = await Beautician.create({
        tenantId: tenant1._id,
        name: "Beautician One",
        email: "beautician@salon-one.com",
        active: true,
      });

      const appointment = await Appointment.create({
        tenantId: tenant1._id,
        serviceId: service._id,
        beauticianId: beautician._id,
        start: new Date("2025-12-01T10:00:00"),
        end: new Date("2025-12-01T11:00:00"),
        price: 5000,
        status: "confirmed",
        client: {
          name: "Customer One",
          email: "customer1@example.com",
          phone: "1111111111",
        },
        payment: {
          mode: "pay_now",
          provider: "stripe",
          status: "unpaid",
          amountTotal: 5000,
        },
      });

      // Tenant1 admin should be able to access
      await request(app)
        .get(`/api/appointments/${appointment._id}`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .expect(200);

      // Tenant2 admin should NOT be able to access
      await request(app)
        .get(`/api/appointments/${appointment._id}`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .expect(404); // Should return 404 as if it doesn't exist
    });
  });

  describe("PUT /api/appointments/:id", () => {
    it("should prevent updating appointments from other tenants", async () => {
      // Create appointment for tenant1
      const service = await Service.create({
        tenantId: tenant1._id,
        name: "Haircut",
        duration: 60,
        price: 5000,
        active: true,
      });

      const beautician = await Beautician.create({
        tenantId: tenant1._id,
        name: "Beautician One",
        email: "beautician@salon-one.com",
        active: true,
      });

      const appointment = await Appointment.create({
        tenantId: tenant1._id,
        serviceId: service._id,
        beauticianId: beautician._id,
        start: new Date("2025-12-01T10:00:00"),
        end: new Date("2025-12-01T11:00:00"),
        price: 5000,
        status: "confirmed",
        client: {
          name: "Customer One",
          email: "customer1@example.com",
          phone: "1111111111",
        },
        payment: {
          mode: "pay_now",
          provider: "stripe",
          status: "unpaid",
          amountTotal: 5000,
        },
      });

      // Tenant2 admin tries to update tenant1's appointment
      await request(app)
        .put(`/api/appointments/${appointment._id}`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .send({ status: "cancelled" })
        .expect(404); // Should return 404

      // Verify appointment was not modified
      const unchanged = await Appointment.findById(appointment._id);
      expect(unchanged.status).toBe("confirmed");
    });
  });

  describe("DELETE /api/appointments/:id", () => {
    it("should prevent deleting appointments from other tenants", async () => {
      // Create appointment for tenant1
      const service = await Service.create({
        tenantId: tenant1._id,
        name: "Haircut",
        duration: 60,
        price: 5000,
        active: true,
      });

      const beautician = await Beautician.create({
        tenantId: tenant1._id,
        name: "Beautician One",
        email: "beautician@salon-one.com",
        active: true,
      });

      const appointment = await Appointment.create({
        tenantId: tenant1._id,
        serviceId: service._id,
        beauticianId: beautician._id,
        start: new Date("2025-12-01T10:00:00"),
        end: new Date("2025-12-01T11:00:00"),
        price: 5000,
        status: "confirmed",
        client: {
          name: "Customer One",
          email: "customer1@example.com",
          phone: "1111111111",
        },
        payment: {
          mode: "pay_now",
          provider: "stripe",
          status: "unpaid",
          amountTotal: 5000,
        },
      });

      // Tenant2 admin tries to delete tenant1's appointment
      await request(app)
        .delete(`/api/appointments/${appointment._id}`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .expect(404); // Should return 404

      // Verify appointment still exists
      const stillExists = await Appointment.findById(appointment._id);
      expect(stillExists).not.toBeNull();
    });
  });

  describe("GET /api/services", () => {
    it("should only return services for the authenticated tenant", async () => {
      // Create services for both tenants
      await Service.create({
        tenantId: tenant1._id,
        name: "Haircut - Tenant 1",
        duration: 60,
        price: 5000,
        active: true,
      });

      await Service.create({
        tenantId: tenant2._id,
        name: "Haircut - Tenant 2",
        duration: 60,
        price: 6000,
        active: true,
      });

      // Request as tenant1 admin
      const response1 = await request(app)
        .get("/api/services")
        .set("Authorization", `Bearer ${admin1Token}`)
        .expect(200);

      expect(response1.body).toHaveLength(1);
      expect(response1.body[0].name).toBe("Haircut - Tenant 1");

      // Request as tenant2 admin
      const response2 = await request(app)
        .get("/api/services")
        .set("Authorization", `Bearer ${admin2Token}`)
        .expect(200);

      expect(response2.body).toHaveLength(1);
      expect(response2.body[0].name).toBe("Haircut - Tenant 2");
    });
  });

  describe("Header-based Tenant Resolution", () => {
    it("should use X-Tenant-ID header when provided", async () => {
      // Create appointment for tenant1
      const service = await Service.create({
        tenantId: tenant1._id,
        name: "Haircut",
        duration: 60,
        price: 5000,
        active: true,
      });

      const beautician = await Beautician.create({
        tenantId: tenant1._id,
        name: "Beautician One",
        email: "beautician@salon-one.com",
        active: true,
      });

      await Appointment.create({
        tenantId: tenant1._id,
        serviceId: service._id,
        beauticianId: beautician._id,
        start: new Date("2025-12-01T10:00:00"),
        end: new Date("2025-12-01T11:00:00"),
        price: 5000,
        status: "confirmed",
        client: {
          name: "Customer One",
          email: "customer1@example.com",
          phone: "1111111111",
        },
        payment: {
          mode: "pay_now",
          provider: "stripe",
          status: "unpaid",
          amountTotal: 5000,
        },
      });

      // Request with X-Tenant-ID header for tenant1
      const response = await request(app)
        .get("/api/appointments")
        .set("X-Tenant-ID", tenant1._id.toString())
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);
    });

    it("should prevent access with mismatched tenant header", async () => {
      // Create appointment for tenant1
      const service = await Service.create({
        tenantId: tenant1._id,
        name: "Haircut",
        duration: 60,
        price: 5000,
        active: true,
      });

      const beautician = await Beautician.create({
        tenantId: tenant1._id,
        name: "Beautician One",
        email: "beautician@salon-one.com",
        active: true,
      });

      await Appointment.create({
        tenantId: tenant1._id,
        serviceId: service._id,
        beauticianId: beautician._id,
        start: new Date("2025-12-01T10:00:00"),
        end: new Date("2025-12-01T11:00:00"),
        price: 5000,
        status: "confirmed",
        client: {
          name: "Customer One",
          email: "customer1@example.com",
          phone: "1111111111",
        },
        payment: {
          mode: "pay_now",
          provider: "stripe",
          status: "unpaid",
          amountTotal: 5000,
        },
      });

      // Request with X-Tenant-ID header for tenant2
      const response = await request(app)
        .get("/api/appointments")
        .set("X-Tenant-ID", tenant2._id.toString())
        .expect(200);

      // Should return empty array (no appointments for tenant2)
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(0);
    });
  });
});
