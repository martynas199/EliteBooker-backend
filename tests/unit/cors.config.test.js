import { describe, it, expect, jest } from "@jest/globals";
import {
  buildAllowedOrigins,
  createCorsOptions,
  isVercelPreviewOrigin,
} from "../../src/config/cors.js";

function runOriginCheck(corsOptions, origin) {
  return new Promise((resolve) => {
    corsOptions.origin(origin, (error, allowed) => {
      resolve({ error, allowed });
    });
  });
}

describe("CORS configuration", () => {
  it("builds a deduplicated allowlist including FRONTEND_URL values", () => {
    const origins = buildAllowedOrigins(
      "https://custom.example.com, https://demo.example.com, https://custom.example.com",
    );

    expect(origins).toContain("https://custom.example.com");
    expect(origins).toContain("https://demo.example.com");
    expect(new Set(origins).size).toBe(origins.length);
  });

  it("detects Vercel preview origins correctly", () => {
    expect(isVercelPreviewOrigin("https://preview-app.vercel.app")).toBe(true);
    expect(isVercelPreviewOrigin("https://elitebooker.co.uk")).toBe(false);
    expect(isVercelPreviewOrigin("not-a-url")).toBe(false);
  });

  it("allows requests with no origin", async () => {
    const corsOptions = createCorsOptions({
      allowedOrigins: ["https://allowed.example.com"],
      logger: { log: jest.fn(), warn: jest.fn() },
    });

    const result = await runOriginCheck(corsOptions, undefined);
    expect(result.error).toBeNull();
    expect(result.allowed).toBe(true);
  });

  it("allows configured origins and blocks unknown origins", async () => {
    const corsOptions = createCorsOptions({
      allowedOrigins: ["https://allowed.example.com"],
      logger: { log: jest.fn(), warn: jest.fn() },
    });

    const allowed = await runOriginCheck(
      corsOptions,
      "https://allowed.example.com",
    );
    expect(allowed.error).toBeNull();
    expect(allowed.allowed).toBe(true);

    const blocked = await runOriginCheck(corsOptions, "https://blocked.example");
    expect(blocked.allowed).toBeUndefined();
    expect(blocked.error).toBeInstanceOf(Error);
    expect(blocked.error.message).toBe("Not allowed by CORS");
  });

  it("always allows vercel preview deployments", async () => {
    const corsOptions = createCorsOptions({
      allowedOrigins: [],
      logger: { log: jest.fn(), warn: jest.fn() },
    });

    const result = await runOriginCheck(
      corsOptions,
      "https://feature-branch-preview.vercel.app",
    );

    expect(result.error).toBeNull();
    expect(result.allowed).toBe(true);
  });
});

