import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

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
      console.log("[USER AUTH] Token decoded:", {
        id: decoded.id,
        type: decoded.type,
        userId: decoded.userId,
      });
    } catch (err) {
      console.log("[USER AUTH] Token verification failed:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Ensure it's a customer token
    if (decoded.type !== "customer") {
      console.log("[USER AUTH] Invalid token type:", decoded.type);
      return res.status(403).json({ error: "Invalid token type" });
    }

    // Get user
    console.log("[USER AUTH] Looking for user with id:", decoded.id);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      console.log(
        "[USER AUTH] User not found or inactive. Found:",
        !!user,
        "Active:",
        user?.isActive
      );
      return res.status(401).json({ error: "User not found or inactive" });
    }

    console.log("[USER AUTH] User authenticated:", user.email);

    // Attach user to request
    req.user = user;
    req.userId = user._id;

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
        }
      }
    } catch (err) {
      // Invalid token - continue as guest
      console.log("[OPTIONAL AUTH] Invalid token, continuing as guest");
    }

    next();
  } catch (error) {
    console.error("[OPTIONAL AUTH MIDDLEWARE] Error:", error);
    next(); // Continue even if error
  }
};
