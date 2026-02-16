const isProduction = process.env.NODE_ENV === "production";
const DEV_FALLBACK_JWT_SECRET = "dev-only-jwt-secret-change-me";

if (!process.env.JWT_SECRET && isProduction) {
  throw new Error("JWT_SECRET is required in production");
}

if (!process.env.JWT_SECRET && !isProduction) {
  console.warn(
    "[security] JWT_SECRET is not set; using development fallback secret",
  );
}

export const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACK_JWT_SECRET;
