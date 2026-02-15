import { rootLogger } from "../utils/logger.js";

const STATIC_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5177",
  "http://localhost:3000",
  "https://elitebooker.co.uk",
  "https://www.elitebooker.co.uk",
  "https://elite-booker-frontend-4yty84hoj-martynasgecas-projects.vercel.app",
  "https://permanentbyjuste.co.uk",
  "https://www.permanentbyjuste.co.uk",
];

function parseOrigins(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap(parseOrigins);
  }

  return String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildAllowedOrigins(frontendUrl = process.env.FRONTEND_URL) {
  const allOrigins = [
    ...STATIC_ALLOWED_ORIGINS,
    ...parseOrigins(frontendUrl),
  ].filter(Boolean);

  return [...new Set(allOrigins)];
}

export function isVercelPreviewOrigin(origin) {
  if (!origin || typeof origin !== "string") {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return parsed.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export function createCorsOptions({
  allowedOrigins = buildAllowedOrigins(),
  logger = rootLogger.child({ scope: "cors" }).toNodeLogger(),
} = {}) {
  return {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (isVercelPreviewOrigin(origin)) {
        if (process.env.NODE_ENV !== "test") {
          logger.log(`Allowing Vercel preview deployment: ${origin}`);
        }
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== "test") {
        logger.warn(`Blocked CORS request from origin: ${origin}`);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  };
}
