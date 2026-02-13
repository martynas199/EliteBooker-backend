import * as Sentry from "@sentry/node";

const isTest = process.env.NODE_ENV === "test";
const dsn = process.env.SENTRY_DSN;

const parseBoolean = (value, fallback = false) => {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
};

const parseSampleRate = (value, fallback = 0.2) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
};

if (!isTest && dsn) {
  const enableLogs = parseBoolean(process.env.SENTRY_ENABLE_LOGS, true);

  Sentry.init({
    dsn,
    sendDefaultPii: parseBoolean(process.env.SENTRY_SEND_DEFAULT_PII, true),
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.2),
    enableLogs,
    integrations: enableLogs
      ? [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })]
      : [],
  });
}

export default Sentry;
