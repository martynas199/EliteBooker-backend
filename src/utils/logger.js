import { getRequestContext } from "./requestContext.js";

const LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isTest = process.env.NODE_ENV === "test";
const defaultLevel =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");
const threshold = LEVEL_ORDER[defaultLevel] || LEVEL_ORDER.info;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serializeError(error) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    type: error.type,
    statusCode: error.statusCode,
  };
}

function serializeValue(value, seen = new WeakSet()) {
  if (value == null) {
    return value;
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry, seen));
  }

  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = serializeValue(entry, seen);
  }
  return output;
}

function normalizeArgs(args) {
  if (!args.length) {
    return { message: "" };
  }

  const [first, ...rest] = args;

  if (typeof first === "string") {
    if (!rest.length) {
      return { message: first };
    }
    return {
      message: first,
      meta: rest.length === 1 ? serializeValue(rest[0]) : serializeValue(rest),
    };
  }

  if (first instanceof Error) {
    return {
      message: first.message || "Error",
      meta: {
        error: serializeError(first),
        extra: rest.length
          ? rest.length === 1
            ? serializeValue(rest[0])
            : serializeValue(rest)
          : undefined,
      },
    };
  }

  return {
    message: "Log",
    meta: args.length === 1 ? serializeValue(first) : serializeValue(args),
  };
}

function writeRecord(level, record) {
  if (isTest && process.env.LOG_TEST_OUTPUT !== "true") {
    return;
  }

  const payload = JSON.stringify(record);
  if (level === "error") {
    globalThis.console.error(payload);
    return;
  }
  if (level === "warn") {
    globalThis.console.warn(payload);
    return;
  }
  globalThis.console.log(payload);
}

export function createLogger(baseContext = {}) {
  const context = serializeValue(baseContext);

  const emit = (level, ...args) => {
    if ((LEVEL_ORDER[level] || LEVEL_ORDER.info) < threshold) {
      return;
    }

    const { message, meta } = normalizeArgs(args);
    const requestContext = getRequestContext();

    const record = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
      ...requestContext,
    };

    if (meta !== undefined) {
      if (isPlainObject(meta) && isPlainObject(record.meta)) {
        record.meta = { ...record.meta, ...meta };
      } else {
        record.meta = meta;
      }
    }

    writeRecord(level, record);
  };

  const logger = {
    debug: (...args) => emit("debug", ...args),
    info: (...args) => emit("info", ...args),
    warn: (...args) => emit("warn", ...args),
    error: (...args) => emit("error", ...args),
    log: (...args) => emit("info", ...args),
    child: (childContext = {}) => createLogger({ ...context, ...childContext }),
    toNodeLogger: () => ({
      log: (...args) => emit("info", ...args),
      warn: (...args) => emit("warn", ...args),
      error: (...args) => emit("error", ...args),
    }),
  };

  return logger;
}

export function createConsoleLogger({
  scope = "app",
  verbose = true,
  baseLogger,
} = {}) {
  const logger = (baseLogger || rootLogger).child({ scope });

  return {
    log: (...args) => {
      if (verbose) {
        logger.info(...args);
      }
    },
    info: (...args) => logger.info(...args),
    warn: (...args) => logger.warn(...args),
    error: (...args) => logger.error(...args),
    debug: (...args) => logger.debug(...args),
  };
}

export const rootLogger = createLogger({
  service: process.env.LOG_SERVICE_NAME || "booking-backend",
});

