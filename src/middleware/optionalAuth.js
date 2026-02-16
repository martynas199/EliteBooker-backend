import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../models/Admin.js";
import { createConsoleLogger } from "../utils/logger.js";
import { JWT_SECRET } from "../config/security.js";
const AUTH_DEBUG = process.env.AUTH_DEBUG === "true";
const console = createConsoleLogger({
  scope: "optional-auth",
  verbose: AUTH_DEBUG || process.env.LOG_VERBOSE === "true",
});

const authDebugLog = (...args) => {
  if (AUTH_DEBUG) {
    console.log(...args);
  }
};

/**
 * Optional authentication middleware
 * Checks for JWT token and attaches admin to request if valid
 * Does NOT return error if token is missing or invalid (continues as guest)
 *
 * Sets req.admin if authenticated, otherwise undefined
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function optionalAuth(req, res, next) {
  try {
    // 1) Get token from header or cookie
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
      authDebugLog("[optionalAuth] Token from Bearer header");
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
      authDebugLog("[optionalAuth] Token from accessToken cookie");
    } else if (req.cookies && req.cookies.jwt) {
      // Backward compatibility
      token = req.cookies.jwt;
      authDebugLog("[optionalAuth] Token from jwt cookie");
    }

    // No token = continue as guest
    if (!token) {
      authDebugLog("[optionalAuth] No token found, continuing as guest");
      return next();
    }

    // 2) Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      authDebugLog(
        "[optionalAuth] Token verified, decoded admin ID:",
        decoded.id,
      );
    } catch (jwtError) {
      // Invalid token - continue as guest
      authDebugLog(
        "[optionalAuth] Token verification failed:",
        jwtError.message,
      );
      return next();
    }

    // 3) Check if admin still exists and is active
    // Bypass multi-tenant filtering by using collection.findOne
    const adminDoc = await Admin.collection.findOne({
      _id: new mongoose.Types.ObjectId(decoded.id),
    });

    if (!adminDoc) {
      authDebugLog("[optionalAuth] Admin not found for ID:", decoded.id);
      return next();
    }

    // Convert to plain object with the fields we need
    // Ensure tenantId is properly converted
    const admin = {
      _id: adminDoc._id,
      name: adminDoc.name,
      email: adminDoc.email,
      role: adminDoc.role,
      specialistId: adminDoc.specialistId,
      active: adminDoc.active,
      passwordChangedAt: adminDoc.passwordChangedAt,
      tenantId: adminDoc.tenantId
        ? new mongoose.Types.ObjectId(adminDoc.tenantId)
        : null,
    };

    if (!admin.active) {
      authDebugLog("[optionalAuth] Admin is inactive:", admin.email);
      return next();
    }

    authDebugLog("[optionalAuth] Admin found:", {
      email: admin.email,
      tenantId: admin.tenantId,
      tenantIdType: admin.tenantId?.constructor.name,
      active: admin.active,
    });

    // 4) Check if password was changed after token was issued
    // Skip password check for now since we're using raw document
    // if (admin.changedPasswordAfter && admin.changedPasswordAfter(decoded.iat)) {
    //   // Password changed - continue as guest
    //   return next();
    // }

    // 5) Attach admin to request
    req.admin = admin;

    // 6) Set tenant context for multi-tenant filtering
    // Always set tenantId from admin's token if not already set
    // This ensures routes like /api/salon can get the correct tenant info
    if (admin.tenantId && !req.tenantId) {
      req.tenantId = admin.tenantId;
      authDebugLog("[optionalAuth] Set req.tenantId from admin:", {
        value: req.tenantId,
        type: req.tenantId?.constructor.name,
        string: req.tenantId?.toString(),
        adminEmail: admin.email,
        isSuperAdmin: admin.role === "super_admin",
      });
    } else if (req.tenantId) {
      authDebugLog(
        "[optionalAuth] tenantId already set by resolveTenant, keeping it:",
        {
          existing: req.tenantId.toString(),
          adminTenant: admin.tenantId?.toString(),
          adminEmail: admin.email,
        },
      );
    }

    // Mark super admin status for access control
    if (admin.role === "super_admin") {
      req.isSuperAdmin = true;
      authDebugLog(
        "[optionalAuth] Super admin status set (but tenantId still set from token)",
      );
    }

    next();
  } catch (error) {
    // Any error - log it but continue as guest (don't block request)
    console.error("optionalAuth middleware error:", error);
    next();
  }
}

export default optionalAuth;
