import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateCreateBeautician,
  validateUpdateBeautician,
} from "../src/validations/specialist.schema.js";

describe("Specialist Schema Validation", () => {
  describe("validateCreateBeautician", () => {
    it("should validate a valid specialist", () => {
      const validBeautician = {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "+44 20 1234 5678",
        bio: "Experienced hair stylist with 10 years of experience",
        specialties: ["Haircuts", "Coloring", "Styling"],
        active: true,
        color: "#FF5733",
      };

      const result = validateCreateBeautician(validBeautician);
      assert.equal(result.success, true);
      assert.ok(result.data);
      assert.equal(result.data.name, "Jane Doe");
    });

    it("should fail when name is missing", () => {
      const invalidBeautician = {
        email: "jane@example.com",
        active: true,
      };

      const result = validateCreateBeautician(invalidBeautician);
      assert.equal(result.success, false);
      assert.ok(result.errors);
      assert.ok(result.errors.some((e) => e.path === "name"));
    });

    it("should fail when email is invalid", () => {
      const invalidBeautician = {
        name: "Jane Doe",
        email: "not-an-email",
      };

      const result = validateCreateBeautician(invalidBeautician);
      assert.equal(result.success, false);
      assert.ok(result.errors);
      assert.ok(result.errors.some((e) => e.path === "email"));
    });

    it("should validate specialist with working hours", () => {
      const validBeautician = {
        name: "Jane Doe",
        workingHours: [
          {
            dayOfWeek: 1, // Monday
            start: "09:00",
            end: "17:00",
          },
          {
            dayOfWeek: 2, // Tuesday
            start: "09:00",
            end: "17:00",
          },
        ],
      };

      const result = validateCreateBeautician(validBeautician);
      assert.equal(result.success, true);
      assert.equal(result.data.workingHours.length, 2);
    });

    it("should fail when working hours time format is invalid", () => {
      const invalidBeautician = {
        name: "Jane Doe",
        workingHours: [
          {
            dayOfWeek: 1,
            start: "9:00", // Invalid: should be 09:00
            end: "17:00",
          },
        ],
      };

      const result = validateCreateBeautician(invalidBeautician);
      assert.equal(result.success, false);
      assert.ok(result.errors);
    });

    it("should fail when dayOfWeek is out of range", () => {
      const invalidBeautician = {
        name: "Jane Doe",
        workingHours: [
          {
            dayOfWeek: 7, // Invalid: should be 0-6
            start: "09:00",
            end: "17:00",
          },
        ],
      };

      const result = validateCreateBeautician(invalidBeautician);
      assert.equal(result.success, false);
    });

    it("should validate specialist with time off", () => {
      const validBeautician = {
        name: "Jane Doe",
        timeOff: [
          {
            start: "2025-10-20T00:00:00Z",
            end: "2025-10-25T23:59:59Z",
            reason: "Vacation",
          },
        ],
      };

      const result = validateCreateBeautician(validBeautician);
      assert.equal(result.success, true);
      assert.equal(result.data.timeOff.length, 1);
    });

    it("should fail when time off datetime is invalid", () => {
      const invalidBeautician = {
        name: "Jane Doe",
        timeOff: [
          {
            start: "not-a-datetime",
            end: "2025-10-25T23:59:59Z",
          },
        ],
      };

      const result = validateCreateBeautician(invalidBeautician);
      assert.equal(result.success, false);
    });

    it("should validate specialist with image", () => {
      const validBeautician = {
        name: "Jane Doe",
        image: {
          provider: "cloudflare-r2",
          id: "abc123",
          url: "https://example.com/jane.jpg",
          alt: "Jane's profile photo",
          width: 400,
          height: 400,
        },
      };

      const result = validateCreateBeautician(validBeautician);
      assert.equal(result.success, true);
    });

    it("should fail when color is invalid hex", () => {
      const invalidBeautician = {
        name: "Jane Doe",
        color: "FF5733", // Missing #
      };

      const result = validateCreateBeautician(invalidBeautician);
      assert.equal(result.success, false);
      assert.ok(result.errors.some((e) => e.path === "color"));
    });

    it("should validate specialist with minimal fields", () => {
      const minimalBeautician = {
        name: "Jane Doe",
      };

      const result = validateCreateBeautician(minimalBeautician);
      assert.equal(result.success, true);
      assert.equal(result.data.name, "Jane Doe");
      assert.equal(result.data.active, true); // Default value
    });
  });

  describe("validateUpdateBeautician", () => {
    it("should validate partial update", () => {
      const update = {
        name: "Jane Smith",
        email: "jane.smith@example.com",
      };

      const result = validateUpdateBeautician(update);
      assert.equal(result.success, true);
      assert.equal(result.data.name, "Jane Smith");
      assert.equal(result.data.email, "jane.smith@example.com");
    });

    it("should validate empty update", () => {
      const result = validateUpdateBeautician({});
      assert.equal(result.success, true);
    });

    it("should fail when email is invalid", () => {
      const update = {
        email: "not-an-email",
      };

      const result = validateUpdateBeautician(update);
      assert.equal(result.success, false);
      assert.ok(result.errors.some((e) => e.path === "email"));
    });

    it("should validate updating only active status", () => {
      const update = {
        active: false,
      };

      const result = validateUpdateBeautician(update);
      assert.equal(result.success, true);
      assert.equal(result.data.active, false);
    });

    it("should validate updating specialties", () => {
      const update = {
        specialties: ["Nails", "Manicure", "Pedicure"],
      };

      const result = validateUpdateBeautician(update);
      assert.equal(result.success, true);
      assert.equal(result.data.specialties.length, 3);
    });
  });
});
