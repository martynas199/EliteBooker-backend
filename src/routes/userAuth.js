import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = Router();

// JWT Secret
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";

// Helper to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId, type: "customer" }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

// POST /api/user-auth/register - Register new customer
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email, and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      lastLogin: new Date(),
    });

    // Generate token
    const token = generateToken(user._id);

    console.log(`[USER AUTH] New customer registered: ${email}`);

    res.status(201).json({
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    console.error("[USER AUTH] Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/user-auth/login - Login customer
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Account is deactivated" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    console.log(`[USER AUTH] Customer logged in: ${email}`);

    res.json({
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    console.error("[USER AUTH] Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/user-auth/me - Get current user (requires auth)
router.get("/me", async (req, res) => {
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
      console.log("[ME ROUTE] Token decoded successfully:", {
        id: decoded.id,
        userId: decoded.userId,
        type: decoded.type,
      });
    } catch (err) {
      console.log("[ME ROUTE] Token verification failed:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Ensure it's a customer token
    if (decoded.type !== "customer") {
      console.log("[ME ROUTE] Invalid token type:", decoded.type);
      return res.status(403).json({ error: "Invalid token type" });
    }

    // Get user
    console.log("[ME ROUTE] Looking up user with id:", decoded.id);
    const user = await User.findById(decoded.id);
    console.log("[ME ROUTE] User found:", !!user, "Active:", user?.isActive);
    if (!user || !user.isActive) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log("[ME ROUTE] Returning user:", user.email);

    res.json({ user: user.toJSON() });
  } catch (error) {
    console.error("[USER AUTH] Me error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// POST /api/user-auth/logout - Logout (client-side token removal, optional endpoint)
router.post("/logout", (req, res) => {
  // In JWT, logout is primarily handled client-side by removing the token
  // This endpoint is optional and can be used for logging purposes
  console.log("[USER AUTH] Customer logged out");
  res.json({ message: "Logged out successfully" });
});

export default router;
