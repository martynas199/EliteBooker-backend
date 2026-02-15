import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const requestContextStorage = new AsyncLocalStorage();

function normalizeRequestId(value) {
  if (typeof value !== "string") {
    return randomUUID();
  }

  const normalized = value.trim();
  if (!normalized) {
    return randomUUID();
  }

  return normalized.slice(0, 128);
}

function getIncomingRequestId(req) {
  return req.headers["x-request-id"] || req.headers["x-correlation-id"];
}

export function requestContextMiddleware(req, res, next) {
  const requestId = normalizeRequestId(getIncomingRequestId(req));

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  requestContextStorage.run(
    {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
    },
    next
  );
}

export function getRequestContext() {
  return requestContextStorage.getStore() || {};
}

