function resolveStatusCode(err) {
  const statusCode = Number(err?.statusCode || err?.status);
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
    return statusCode;
  }
  return 500;
}

export function notFoundHandler(req, res, next) {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not found" });
  }
  return next();
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = resolveStatusCode(err);
  const isProduction = process.env.NODE_ENV === "production";
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error(err);
  } else if (process.env.NODE_ENV !== "test") {
    console.warn(err?.message || "Client error");
  }

  const shouldHideMessage = isProduction && isServerError && !err?.expose;
  const message = shouldHideMessage
    ? "Internal server error"
    : err?.message || "Unknown error";

  return res.status(statusCode).json({ error: message });
}

