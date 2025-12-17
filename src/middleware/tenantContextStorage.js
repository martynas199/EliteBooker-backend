import { AsyncLocalStorage } from "async_hooks";

const tenantStorage = new AsyncLocalStorage();

export function enterTenantContext(tenantId) {
  if (!tenantId) {
    return;
  }

  const value =
    typeof tenantId === "string" || typeof tenantId === "number"
      ? tenantId.toString()
      : tenantId;

  tenantStorage.enterWith({ tenantId: value });
}

export function runWithTenantContext(tenantId, callback) {
  if (!tenantId) {
    return callback();
  }

  const value =
    typeof tenantId === "string" || typeof tenantId === "number"
      ? tenantId.toString()
      : tenantId;

  return tenantStorage.run({ tenantId: value }, callback);
}

export function getTenantContext() {
  return tenantStorage.getStore()?.tenantId || null;
}

export default {
  enterTenantContext,
  runWithTenantContext,
  getTenantContext,
};
