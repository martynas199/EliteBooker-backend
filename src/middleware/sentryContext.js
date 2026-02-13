import * as Sentry from "@sentry/node";

const normalizeId = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object" && typeof value.toString === "function") {
    const normalized = value.toString();
    return normalized && normalized !== "[object Object]" ? normalized : null;
  }

  return null;
};

const resolveTenantId = (req) =>
  normalizeId(
    req.tenantId ||
      req.admin?.tenantId ||
      req.user?.tenantId ||
      req.client?.tenantId ||
      req.tenant?._id
  );

const resolveAdminId = (req) => normalizeId(req.admin?._id || req.admin?.id);

const resolveUserId = (req) =>
  normalizeId(
    req.userId || req.user?._id || req.user?.id || req.clientId || req.client?._id
  );

const resolveActorRole = (req) => req.admin?.role || req.user?.role || null;

export function applySentryRequestContext(req) {
  if (!Sentry.getClient()) {
    return;
  }

  const tenantId = resolveTenantId(req);
  const adminId = resolveAdminId(req);
  const userId = resolveUserId(req);
  const actorRole = resolveActorRole(req);
  const scope = Sentry.getIsolationScope();

  scope.setTag("request.method", req.method);
  scope.setTag("request.path", req.path);

  if (tenantId) {
    scope.setTag("tenant.id", tenantId);
  }

  if (req.tenantResolution) {
    scope.setTag("tenant.resolution", req.tenantResolution);
  }

  if (adminId) {
    scope.setTag("auth.actor", "admin");
    scope.setTag("auth.admin_id", adminId);
  } else if (userId) {
    scope.setTag("auth.actor", "user");
    scope.setTag("auth.user_id", userId);
  }

  if (actorRole) {
    scope.setTag("auth.role", actorRole);
  }

  scope.setContext("request_context", {
    tenantId: tenantId || undefined,
    adminId: adminId || undefined,
    userId: userId || undefined,
    tenantResolution: req.tenantResolution || undefined,
  });

  if (adminId) {
    Sentry.setUser({
      id: `admin:${adminId}`,
      ...(req.admin?.email ? { email: req.admin.email } : {}),
    });
    return;
  }

  if (userId) {
    Sentry.setUser({ id: `user:${userId}` });
    return;
  }

  Sentry.setUser(null);
}

export function sentryContextMiddleware(req, res, next) {
  try {
    applySentryRequestContext(req);
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("Unable to apply Sentry request context:", error?.message);
    }
  }

  next();
}

export default sentryContextMiddleware;
