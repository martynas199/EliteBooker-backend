import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Admin from "../models/Admin.js";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

/**
 * Admin authentication middleware
 * Verifies JWT token and checks if user is an admin
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function requireAdmin(req, res, next) {
  try {
    // 1) Get token from header or cookie (accessToken is the new cookie name)
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.cookies && req.cookies.jwt) {
      // Backward compatibility
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({
        error: "Not authenticated. Please log in to access this resource.",
      });
    }

    // 2) Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // 3) Check if admin still exists and is active
    // Bypass multi-tenant filtering by using collection.findOne
    const adminDoc = await Admin.collection.findOne({
      _id: new mongoose.Types.ObjectId(decoded.id),
    });

    if (!adminDoc || !adminDoc.active) {
      return res.status(401).json({
        error: "Admin no longer exists or is inactive.",
      });
    }

    // Load as Mongoose document for password checking
    const admin = await Admin.hydrate(adminDoc);

    // 4) Check if password was changed after token was issued
    if (admin.changedPasswordAfter && admin.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        error: "Password was recently changed. Please log in again.",
      });
    }

    // 5) Grant access - attach admin to request
    req.admin = admin;

    // 6) Set tenant context from admin's token if not already set
    if (admin.tenantId && !req.tenantId) {
      req.tenantId = admin.tenantId;
      console.log("[requireAdmin] Set req.tenantId from admin:", {
        value: req.tenantId,
        adminEmail: admin.email,
        isSuperAdmin: admin.role === "super_admin",
      });
    }

    // Mark super admin status separately for access control
    if (admin.role === "super_admin") {
      req.isSuperAdmin = true;
      console.log(
        "[requireAdmin] Super admin status set (but tenantId still set from token)"
      );
    }

    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid token. Please log in again.",
      });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Your token has expired. Please log in again.",
      });
    }

    console.error("requireAdmin middleware error:", error);
    return res.status(500).json({
      error: "Authentication failed",
      details: error.message,
    });
  }
}

/**
 * Middleware to require super admin access
 * Must be used after requireAdmin middleware
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireSuperAdmin(req, res, next) {
  // This middleware should be used after requireAdmin
  if (!req.admin) {
    return res.status(401).json({
      error: "Authentication required. Use requireAdmin middleware first.",
    });
  }

  // Check if admin has super_admin role
  if (req.admin.role !== "super_admin") {
    return res.status(403).json({
      error: "Access denied. Super admin privileges required.",
      message: "Only super administrators can perform this action.",
    });
  }

  next();
}

export default requireAdmin;
