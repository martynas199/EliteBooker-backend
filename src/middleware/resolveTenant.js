/**
 * Tenant Resolution Middleware
 *
 * Resolves the tenant from:
 * 1. Custom domain (e.g., yoursalon.com)
 * 2. Subdomain (e.g., yoursalon.platform.com)
 * 3. Path parameter (e.g., platform.com/salon/yoursalon)
 * 4. JWT token (for authenticated users)
 * 5. Request header (X-Tenant-ID for API calls)
 *
 * Sets req.tenant and req.tenantId for use in downstream middleware and routes.
 */

import Tenant from "../models/Tenant.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

// Platform domain (configure this based on your deployment)
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "nobleelegance.co.uk";
const PLATFORM_DOMAINS = [
  "nobleelegance.co.uk",
  "www.nobleelegance.co.uk",
  "permanentbyjuste.co.uk",
  "www.permanentbyjuste.co.uk",
  "localhost:5173",
  "localhost:5174",
  "localhost:3000",
];

/**
 * Cache for tenant lookups to improve performance
 * In production, consider using Redis for distributed caching
 */
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get tenant from cache or database
 */
async function getTenant(query) {
  const cacheKey = JSON.stringify(query);
  const cached = tenantCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tenant;
  }

  const tenant = await Tenant.findOne(query);

  if (tenant) {
    tenantCache.set(cacheKey, { tenant, timestamp: Date.now() });
  }

  return tenant;
}

/**
 * Clear tenant cache (call this when tenant data changes)
 */
export function clearTenantCache(tenantId = null) {
  if (tenantId) {
    // Clear specific tenant from cache
    for (const [key, value] of tenantCache.entries()) {
      if (value.tenant?._id?.toString() === tenantId.toString()) {
        tenantCache.delete(key);
      }
    }
  } else {
    // Clear all cache
    tenantCache.clear();
  }
}

/**
 * Resolve tenant from request
 */
export async function resolveTenant(req, res, next) {
  try {
    // Skip tenant resolution for public auth routes that don't need tenant context
    const publicAuthRoutes = [
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/tenants/register",
    ];

    if (publicAuthRoutes.includes(req.path)) {
      req.tenant = null;
      req.tenantId = null;
      req.tenantResolution = "skipped-public-route";
      return next();
    }

    let tenant = null;

    // 1. Check for explicit tenant slug in header (preferred for API calls)
    const tenantSlugHeader = req.headers["x-tenant-slug"];
    if (tenantSlugHeader) {
      tenant = await getTenant({ slug: tenantSlugHeader, active: true });
      if (tenant) {
        req.tenant = tenant;
        req.tenantId = tenant._id;
        req.tenantResolution = "header-slug";
        return next();
      }
    }

    // 2. Check for explicit tenant ID in header (fallback for backward compatibility)
    const tenantIdHeader = req.headers["x-tenant-id"];
    if (tenantIdHeader) {
      tenant = await getTenant({ _id: tenantIdHeader, active: true });
      if (tenant) {
        req.tenant = tenant;
        req.tenantId = tenant._id;
        req.tenantResolution = "header-id";
        return next();
      }
    }

    // 2. Resolve from custom domain
    const hostname = req.hostname || req.headers.host?.split(":")[0];

    if (hostname && !PLATFORM_DOMAINS.includes(hostname)) {
      // This is a custom domain - look up tenant
      tenant = await getTenant({
        "domains.domain": hostname,
        "domains.verified": true,
        active: true,
      });

      if (tenant) {
        req.tenant = tenant;
        req.tenantId = tenant._id;
        req.tenantResolution = "custom-domain";
        return next();
      }
    }

    // 3. Resolve from subdomain (if using subdomain routing)
    if (hostname && hostname.includes(".")) {
      const parts = hostname.split(".");
      if (parts.length >= 3) {
        // Potential subdomain
        const subdomain = parts[0];

        // Skip common subdomains
        if (!["www", "api", "admin", "app"].includes(subdomain)) {
          tenant = await getTenant({ slug: subdomain, active: true });

          if (tenant) {
            req.tenant = tenant;
            req.tenantId = tenant._id;
            req.tenantResolution = "subdomain";
            return next();
          }
        }
      }
    }

    // 4. Resolve from path parameter (e.g., /salon/:slug)
    const pathMatch = req.path.match(/^\/salon\/([^\/]+)/);
    if (pathMatch) {
      const slug = pathMatch[1];
      tenant = await getTenant({ slug, active: true });

      if (tenant) {
        req.tenant = tenant;
        req.tenantId = tenant._id;
        req.tenantResolution = "path";
        return next();
      }
    }

    // 5. Resolve from JWT token (for authenticated users)
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Check if token contains tenant ID
        if (decoded.tenantId) {
          tenant = await getTenant({ _id: decoded.tenantId, active: true });

          if (tenant) {
            req.tenant = tenant;
            req.tenantId = tenant._id;
            req.tenantResolution = "jwt";
            return next();
          }
        }

        // Alternative: Look up user's tenant from Admin/User model
        if (decoded.id) {
          const Admin = (await import("../models/Admin.js")).default;

          // Bypass multi-tenant filtering by using collection.findOne
          const adminDoc = await Admin.collection.findOne({
            _id: new mongoose.Types.ObjectId(decoded.id),
          });

          if (adminDoc?.tenantId) {
            tenant = await getTenant({ _id: adminDoc.tenantId, active: true });

            if (tenant) {
              req.tenant = tenant;
              req.tenantId = tenant._id;
              req.tenantResolution = "jwt-admin";
              return next();
            }
          }
        }
      } catch (error) {
        // Invalid token - continue without tenant context
        console.error("Token verification failed in resolveTenant:", error);
      }
    }

    // 6. No tenant found - this might be a platform-level route or error
    // For public routes, we can continue without tenant
    // For protected routes, downstream middleware will handle errors
    req.tenant = null;
    req.tenantId = null;
    req.tenantResolution = "none";

    next();
  } catch (error) {
    console.error("Tenant resolution error:", error);
    return res.status(500).json({
      error: "Failed to resolve tenant",
      message: error.message,
    });
  }
}

/**
 * Middleware to require tenant context
 * Use this for routes that MUST have a tenant
 */
export function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res.status(400).json({
      error: "Tenant context required",
      message:
        "This operation requires tenant context. Please specify a tenant via domain, subdomain, path, or header.",
    });
  }

  // Check if tenant is active
  if (req.tenant && !req.tenant.isActive()) {
    return res.status(403).json({
      error: "Tenant not active",
      message: "This salon account is not currently active.",
    });
  }

  next();
}

/**
 * Middleware for super admin to bypass tenant restrictions
 */
export function allowSuperAdminBypass(req, res, next) {
  // If user is super admin, allow access to all tenants
  if (req.admin && req.admin.role === "super_admin") {
    // Super admin can optionally specify tenant ID
    const targetTenantId =
      req.query.tenantId || req.body.tenantId || req.params.tenantId;

    if (targetTenantId) {
      req.tenantId = targetTenantId;
      req.tenantResolution = "super-admin-override";
    }
    // If no tenant specified, super admin sees all data (no filtering)
    return next();
  }

  // Regular users must have tenant context
  return requireTenant(req, res, next);
}

export default resolveTenant;
