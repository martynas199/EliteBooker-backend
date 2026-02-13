import { afterEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import {
  errorHandler,
  notFoundHandler,
} from "../../src/middleware/errorHandler.js";

function buildTestApp() {
  const app = express();

  app.get("/api/client-error", (req, res, next) => {
    const error = new Error("Validation failed");
    error.status = 422;
    next(error);
  });

  app.get("/api/server-error", (req, res, next) => {
    next(new Error("Database unavailable"));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

describe("Error handling middleware", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it("returns 404 for unknown API routes", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/api/missing-route").expect(404);

    expect(response.body).toEqual({ error: "Not found" });
  });

  it("preserves explicit client status codes", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/api/client-error").expect(422);

    expect(response.body).toEqual({ error: "Validation failed" });
  });

  it("hides internal error details in production", async () => {
    process.env.NODE_ENV = "production";
    jest.spyOn(console, "error").mockImplementation(() => {});

    const app = buildTestApp();
    const response = await request(app).get("/api/server-error").expect(500);

    expect(response.body).toEqual({ error: "Internal server error" });
  });

  it("exposes server error message outside production", async () => {
    process.env.NODE_ENV = "test";
    jest.spyOn(console, "error").mockImplementation(() => {});

    const app = buildTestApp();
    const response = await request(app).get("/api/server-error").expect(500);

    expect(response.body).toEqual({ error: "Database unavailable" });
  });
});

