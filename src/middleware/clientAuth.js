import jwt from "jsonwebtoken";
import Client from "../models/Client.js";
import { applySentryRequestContext } from "./sentryContext.js";
import { JWT_SECRET } from "../config/security.js";

/**
 * Middleware to authenticate global clients (platform-wide)
 * Checks for JWT token with type "client"
 */
export const authenticateClient = async (req, res, next) => {
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

    // Ensure it's a client token
    if (decoded.type !== "client") {
      return res.status(403).json({ error: "Invalid token type" });
    }

    // Get client
    const client = await Client.findById(decoded.id);
    if (!client || !client.isActive) {
      return res.status(401).json({ error: "Client not found or inactive" });
    }

    // Attach client to request
    req.client = client;
    req.clientId = client._id;
    applySentryRequestContext(req);

    next();
  } catch (error) {
    console.error("[CLIENT AUTH MIDDLEWARE] Error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};
