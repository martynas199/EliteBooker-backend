import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { applySentryRequestContext } from "./sentryContext.js";
import { createConsoleLogger } from "../utils/logger.js";
import { JWT_SECRET } from "../config/security.js";

const LOG_USER_AUTH =
  process.env.LOG_USER_AUTH === "true" || process.env.LOG_VERBOSE === "true";
const console = createConsoleLogger({
  scope: "user-auth-middleware",
  verbose: LOG_USER_AUTH,
});

// Middleware to authenticate customer users
export const authenticateUser = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (LOG_USER_AUTH) {
        console.log("[USER AUTH] Token verification failed:", err.message);
      }
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Ensure it's a customer token
    if (decoded.type !== "customer") {
      return res.status(403).json({ error: "Invalid token type" });
    }

    // Get user
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "User not found or inactive" });
    }

    // Attach user to request
    req.user = user;
    req.userId = user._id;
    applySentryRequestContext(req);

    next();
  } catch (error) {
    console.error("[AUTH MIDDLEWARE] Error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

// Optional middleware - allows both authenticated and guest users
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No token - continue as guest
      req.user = null;
      req.userId = null;
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      if (decoded.type === "customer") {
        const user = await User.findById(decoded.id);
        if (user && user.isActive) {
          req.user = user;
          req.userId = user._id;
          applySentryRequestContext(req);
        }
      }
    } catch (err) {
      // Invalid token - continue as guest
      if (LOG_USER_AUTH) {
        console.log("[OPTIONAL AUTH] Invalid token, continuing as guest");
      }
    }

    next();
  } catch (error) {
    console.error("[OPTIONAL AUTH MIDDLEWARE] Error:", error);
    next(); // Continue even if error
  }
};
