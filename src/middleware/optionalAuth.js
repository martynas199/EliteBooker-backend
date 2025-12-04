import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../models/Admin.js";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

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
      console.log("[optionalAuth] Token from Bearer header");
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
      console.log("[optionalAuth] Token from accessToken cookie");
    } else if (req.cookies && req.cookies.jwt) {
      // Backward compatibility
      token = req.cookies.jwt;
      console.log("[optionalAuth] Token from jwt cookie");
    }

    // No token = continue as guest
    if (!token) {
      console.log("[optionalAuth] No token found, continuing as guest");
      return next();
    }

    // 2) Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log(
        "[optionalAuth] Token verified, decoded admin ID:",
        decoded.id
      );
    } catch (jwtError) {
      // Invalid token - continue as guest
      console.log(
        "[optionalAuth] Token verification failed:",
        jwtError.message
      );
      return next();
    }

    // 3) Check if admin still exists and is active
    // Bypass multi-tenant filtering by using collection.findOne
    const adminDoc = await Admin.collection.findOne({
      _id: new mongoose.Types.ObjectId(decoded.id),
    });

    if (!adminDoc) {
      console.log("[optionalAuth] Admin not found for ID:", decoded.id);
      return next();
    }

    // Convert to plain object with the fields we need
    // Ensure tenantId is properly converted
    const admin = {
      _id: adminDoc._id,
      name: adminDoc.name,
      email: adminDoc.email,
      role: adminDoc.role,
      beauticianId: adminDoc.beauticianId,
      active: adminDoc.active,
      passwordChangedAt: adminDoc.passwordChangedAt,
      tenantId: adminDoc.tenantId
        ? new mongoose.Types.ObjectId(adminDoc.tenantId)
        : null,
    };

    if (!admin.active) {
      console.log("[optionalAuth] Admin is inactive:", admin.email);
      return next();
    }

    console.log("[optionalAuth] Admin found:", {
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
      console.log("[optionalAuth] Set req.tenantId from admin:", {
        value: req.tenantId,
        type: req.tenantId?.constructor.name,
        string: req.tenantId?.toString(),
        adminEmail: admin.email,
        isSuperAdmin: admin.role === "super_admin",
      });
    } else if (req.tenantId) {
      console.log(
        "[optionalAuth] tenantId already set by resolveTenant, keeping it:",
        {
          existing: req.tenantId.toString(),
          adminTenant: admin.tenantId?.toString(),
          adminEmail: admin.email,
        }
      );
    }

    // Mark super admin status for access control
    if (admin.role === "super_admin") {
      req.isSuperAdmin = true;
      console.log(
        "[optionalAuth] Super admin status set (but tenantId still set from token)"
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
