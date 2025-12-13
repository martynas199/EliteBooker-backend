import jwt from "jsonwebtoken";
import Client from "../models/Client.js";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

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
      console.log("[CLIENT AUTH] Token decoded:", {
        id: decoded.id,
        type: decoded.type,
      });
    } catch (err) {
      console.log("[CLIENT AUTH] Token verification failed:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Ensure it's a client token
    if (decoded.type !== "client") {
      console.log("[CLIENT AUTH] Invalid token type:", decoded.type);
      return res.status(403).json({ error: "Invalid token type" });
    }

    // Get client
    console.log("[CLIENT AUTH] Looking for client with id:", decoded.id);
    const client = await Client.findById(decoded.id);
    if (!client || !client.isActive) {
      console.log(
        "[CLIENT AUTH] Client not found or inactive. Found:",
        !!client,
        "Active:",
        client?.isActive
      );
      return res.status(401).json({ error: "Client not found or inactive" });
    }

    console.log("[CLIENT AUTH] Client authenticated:", client.email);

    // Attach client to request
    req.client = client;
    req.clientId = client._id;

    next();
  } catch (error) {
    console.error("[CLIENT AUTH MIDDLEWARE] Error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};
