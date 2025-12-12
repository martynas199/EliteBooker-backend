import express from "express";
import ClientService from "../services/clientService.js";
import Client from "../models/Client.js";
import Appointment from "../models/Appointment.js";
import jwt from "jsonwebtoken";

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Middleware to authenticate client
 */
const authenticateClient = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    const cookieToken = req.cookies?.clientToken;
    const headerToken = req.headers.authorization?.replace("Bearer ", "");
    const token = cookieToken || headerToken;

    console.log(
      "[Client Auth] Cookie token:",
      cookieToken ? "present" : "missing"
    );
    console.log(
      "[Client Auth] Header token:",
      headerToken ? "present" : "missing"
    );

    if (!token) {
      console.log("[Client Auth] No token found - returning 401");
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== "client") {
      return res.status(401).json({
        success: false,
        error: "Invalid token type",
      });
    }

    const client = await Client.findById(decoded.id);

    if (!client || !client.isActive) {
      return res.status(401).json({
        success: false,
        error: "Client not found or inactive",
      });
    }

    req.client = client;
    next();
  } catch (error) {
    console.error("[Client Auth] Error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

/**
 * POST /api/client/register
 * Register a new client account or upgrade from soft signup
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: "Email, password, and name are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters",
      });
    }

    const result = await ClientService.registerClient({
      email,
      password,
      name,
      phone,
    });

    // Generate JWT
    const token = jwt.sign(
      {
        id: result.client._id,
        email: result.client.email,
        type: "client",
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Keep cookie for backward compatibility, but also return token
    res.cookie("clientToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      success: true,
      message: "Registration successful. Please verify your email.",
      token, // Return token for localStorage
      client: {
        id: result.client._id,
        email: result.client.email,
        name: result.client.name,
        phone: result.client.phone,
        isEmailVerified: result.client.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("[Client Register] Error:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Registration failed",
    });
  }
});

/**
 * POST /api/client/login
 * Login client
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    const client = await ClientService.loginClient(email, password);

    // Generate JWT
    const token = jwt.sign(
      {
        id: client._id,
        email: client.email,
        type: "client",
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Keep cookie for backward compatibility, but also return token
    res.cookie("clientToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      success: true,
      token, // Return token for localStorage
      client: {
        id: client._id,
        email: client.email,
        name: client.name,
        phone: client.phone,
        isEmailVerified: client.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("[Client Login] Error:", error);
    res.status(401).json({
      success: false,
      error: error.message || "Login failed",
    });
  }
});

/**
 * POST /api/client/logout
 * Logout client (clear cookie)
 * IMPORTANT: clearCookie options must EXACTLY match the cookie() options used when setting it
 */
router.post("/logout", (req, res) => {
  console.log("[Client Logout] Clearing all auth cookies");

  // Must use EXACT same options as when cookie was set (see oauth.js)
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };

  // Clear both clientToken and refreshToken
  res.clearCookie("clientToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);

  console.log("[Client Logout] Cookies cleared:", {
    clientToken: "cleared",
    refreshToken: "cleared",
    options: cookieOptions,
  });

  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

/**
 * GET /api/client/profile
 * Get client's global profile across all businesses
 */
router.get("/profile", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;

    const profile = await ClientService.getClientGlobalProfile(clientId);

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("[Client Profile] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch profile",
    });
  }
});

/**
 * GET /api/client/bookings
 * Get all bookings across all businesses
 */
router.get("/bookings", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;
    const { status, tenantId, limit = 50, skip = 0 } = req.query;

    const filter = { clientId };
    if (status) filter.status = status;
    if (tenantId) filter.tenantId = tenantId;

    const bookings = await Appointment.find(filter)
      .populate("tenantId", "name slug branding")
      .populate("serviceId")
      .populate("specialistId")
      .sort({ start: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Appointment.countDocuments(filter);

    res.json({
      success: true,
      bookings,
      total,
      hasMore: skip + bookings.length < total,
    });
  } catch (error) {
    console.error("[Client Bookings] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch bookings",
    });
  }
});

/**
 * PATCH /api/client/profile
 * Update client's global profile
 */
router.patch("/profile", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;
    const { name, phone, preferredLanguage, preferredCurrency } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (preferredLanguage) updates.preferredLanguage = preferredLanguage;
    if (preferredCurrency) updates.preferredCurrency = preferredCurrency;

    const client = await Client.findByIdAndUpdate(
      clientId,
      { $set: updates },
      { new: true }
    );

    res.json({
      success: true,
      client: {
        id: client._id,
        email: client.email,
        name: client.name,
        phone: client.phone,
        preferredLanguage: client.preferredLanguage,
        preferredCurrency: client.preferredCurrency,
      },
    });
  } catch (error) {
    console.error("[Client Update Profile] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update profile",
    });
  }
});

/**
 * GET /api/client/export
 * GDPR: Export all client data
 */
router.get("/export", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;

    const data = await ClientService.exportClientData(clientId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[Client Export] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to export data",
    });
  }
});

/**
 * DELETE /api/client/account
 * GDPR: Delete all client data
 */
router.delete("/account", authenticateClient, async (req, res) => {
  try {
    const clientId = req.client._id;
    const { confirmEmail } = req.body;

    if (confirmEmail !== req.client.email) {
      return res.status(400).json({
        success: false,
        error: "Email confirmation does not match",
      });
    }

    await ClientService.deleteClientData(clientId);

    res.json({
      success: true,
      message: "All your data has been deleted",
    });
  } catch (error) {
    console.error("[Client Delete] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to delete account",
    });
  }
});

/**
 * GET /api/client/me
 * Get current authenticated client info
 */
router.get("/me", authenticateClient, async (req, res) => {
  try {
    res.json({
      success: true,
      client: {
        id: req.client._id,
        email: req.client.email,
        name: req.client.name,
        phone: req.client.phone,
        avatar: req.client.avatar,
        isEmailVerified: req.client.isEmailVerified,
        memberSince: req.client.memberSince,
        totalBookings: req.client.totalBookings,
        preferredLanguage: req.client.preferredLanguage,
        preferredCurrency: req.client.preferredCurrency,
      },
    });
  } catch (error) {
    console.error("[Client Me] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch client info",
    });
  }
});

export default router;
export { authenticateClient };
