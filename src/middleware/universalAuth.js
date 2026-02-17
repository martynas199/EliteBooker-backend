/**
 * Universal Auth Middleware
 * Accepts BOTH Client and Tenant authentication
 * Used for features that work for both user types (like referrals)
 */

import jwt from "jsonwebtoken";
import Client from "../models/Client.js";
import Admin from "../models/Admin.js";
import { JWT_SECRET } from "../config/security.js";

/**
 * Authenticates either Client or Tenant
 * Sets req.client OR req.admin based on token type
 */
export const universalAuth = async (req, res, next) => {
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
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Handle based on token type
    if (decoded.type === "client") {
      // Client authentication
      const client = await Client.findById(decoded.id);
      if (!client || !client.isActive) {
        return res.status(401).json({ error: "Client not found or inactive" });
      }
      req.client = client;
      req.clientId = client._id;
      req.userType = "Client";
    } else if (decoded.type === "admin") {
      // Tenant admin authentication
      const admin = await Admin.findById(decoded.id);
      if (!admin || !admin.isActive) {
        return res.status(401).json({ error: "Admin not found or inactive" });
      }
      req.admin = admin;
      req.userType = "Tenant";
    } else {
      return res.status(403).json({ error: "Invalid token type" });
    }

    next();
  } catch (error) {
    console.error("[UNIVERSAL AUTH] Error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};
