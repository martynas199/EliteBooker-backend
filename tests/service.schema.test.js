import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateCreateService,
  validateUpdateService,
} from "../src/validations/service.schema.js";

describe("Service Schema Validation", () => {
  describe("validateCreateService", () => {
    it("should validate a valid service", () => {
      const validService = {
        name: "Haircut",
        category: "Hair",
        description: "Professional haircut service",
        variants: [
          {
            name: "Standard",
            durationMin: 30,
            price: 50.0,
            bufferBeforeMin: 5,
            bufferAfterMin: 10,
          },
        ],
        primaryBeauticianId: "507f1f77bcf86cd799439011",
        active: true,
      };

      const result = validateCreateService(validService);
      assert.equal(result.success, true);
      assert.ok(result.data);
      assert.equal(result.data.name, "Haircut");
    });

    it("should fail when name is missing", () => {
      const invalidService = {
        category: "Hair",
        variants: [
          {
            name: "Standard",
            durationMin: 30,
            price: 50.0,
          },
        ],
        primaryBeauticianId: "507f1f77bcf86cd799439011",
      };

      const result = validateCreateService(invalidService);
      assert.equal(result.success, false);
      assert.ok(result.errors);
      assert.ok(result.errors.some((e) => e.path === "name"));
    });

    it("should fail when primaryBeauticianId is missing", () => {
      const invalidService = {
        name: "Haircut",
        category: "Hair",
        variants: [
          {
            name: "Standard",
            durationMin: 30,
            price: 50.0,
          },
        ],
      };

      const result = validateCreateService(invalidService);
      assert.equal(result.success, false);
      assert.ok(result.errors);
      assert.ok(result.errors.some((e) => e.path === "primaryBeauticianId"));
    });

    it("should fail when primaryBeauticianId is invalid", () => {
      const invalidService = {
        name: "Haircut",
        category: "Hair",
        variants: [
          {
            name: "Standard",
            durationMin: 30,
            price: 50.0,
          },
        ],
        primaryBeauticianId: "invalid-id",
      };

      const result = validateCreateService(invalidService);
      assert.equal(result.success, false);
      assert.ok(result.errors);
      assert.ok(result.errors.some((e) => e.path === "primaryBeauticianId"));
    });

    it("should fail when variants array is empty", () => {
      const invalidService = {
        name: "Haircut",
        category: "Hair",
        variants: [],
        primaryBeauticianId: "507f1f77bcf86cd799439011",
      };

      const result = validateCreateService(invalidService);
      assert.equal(result.success, false);
      assert.ok(result.errors);
      assert.ok(result.errors.some((e) => e.path === "variants"));
    });

    it("should fail when variant price is negative", () => {
      const invalidService = {
        name: "Haircut",
        category: "Hair",
        variants: [
          {
            name: "Standard",
            durationMin: 30,
            price: -50.0,
          },
        ],
        primaryBeauticianId: "507f1f77bcf86cd799439011",
      };

      const result = validateCreateService(invalidService);
      assert.equal(result.success, false);
      assert.ok(result.errors);
      assert.ok(result.errors.some((e) => e.path.includes("variants")));
    });

    it("should validate service with image", () => {
      const validService = {
        name: "Haircut",
        category: "Hair",
        variants: [
          {
            name: "Standard",
            durationMin: 30,
            price: 50.0,
          },
        ],
        primaryBeauticianId: "507f1f77bcf86cd799439011",
        image: {
          provider: "cloudflare-r2",
          id: "abc123",
          url: "https://example.com/image.jpg",
          alt: "Haircut image",
          width: 800,
          height: 600,
        },
      };

      const result = validateCreateService(validService);
      assert.equal(result.success, true);
    });

    it("should fail when image URL is invalid", () => {
      const invalidService = {
        name: "Haircut",
        category: "Hair",
        variants: [
          {
            name: "Standard",
            durationMin: 30,
            price: 50.0,
          },
        ],
        primaryBeauticianId: "507f1f77bcf86cd799439011",
        image: {
          provider: "cloudflare-r2",
          id: "abc123",
          url: "not-a-url",
        },
      };

      const result = validateCreateService(invalidService);
      assert.equal(result.success, false);
      assert.ok(result.errors.some((e) => e.path.includes("image")));
    });
  });

  describe("validateUpdateService", () => {
    it("should validate partial update", () => {
      const update = {
        name: "Updated Haircut",
      };

      const result = validateUpdateService(update);
      assert.equal(result.success, true);
      assert.equal(result.data.name, "Updated Haircut");
    });

    it("should validate empty update", () => {
      const result = validateUpdateService({});
      assert.equal(result.success, true);
    });

    it("should fail when name is invalid", () => {
      const update = {
        name: "",
      };

      const result = validateUpdateService(update);
      assert.equal(result.success, false);
      assert.ok(result.errors.some((e) => e.path === "name"));
    });

    it("should validate updating only active status", () => {
      const update = {
        active: false,
      };

      const result = validateUpdateService(update);
      assert.equal(result.success, true);
      assert.equal(result.data.active, false);
    });
  });
});
