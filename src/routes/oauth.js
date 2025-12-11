import { Router } from "express";
import passport from "../config/passport.js";
import jwt from "jsonwebtoken";

const router = Router();

// Helper function to generate JWT token for clients
const generateToken = (clientId) => {
  return jwt.sign(
    { id: clientId, type: "client" },
    process.env.JWT_SECRET || "your-secret-key",
    { expiresIn: "7d" }
  );
};

// ============= Google OAuth =============

// Check if Google OAuth is configured
const isGoogleConfigured = !!(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

// Initiate Google OAuth
router.get("/google", (req, res, next) => {
  if (!isGoogleConfigured) {
    return res.status(503).json({
      error:
        "Google OAuth is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to environment variables.",
    });
  }
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    prompt: "select_account", // Force account selection every time
  })(req, res, next);
});

// Google OAuth callback
router.get("/google/callback", (req, res, next) => {
  if (!isGoogleConfigured) {
    return res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/login?error=google_not_configured`
    );
  }

  passport.authenticate(
    "google",
    {
      session: false,
      failureRedirect: `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/login?error=google_auth_failed`,
    },
    (err, client, info) => {
      if (err) {
        console.error("[OAUTH] Google callback error:", err);
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }

      if (!client) {
        console.log("[OAUTH] No client returned from Google auth");
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }

      try {
        // Generate JWT token for client
        const token = generateToken(client._id);
        console.log(
          "[OAUTH] ✓ Google auth successful for client:",
          client.email
        );
        console.log("[OAUTH] Token generated, setting cookie");

        // Set httpOnly cookie with token
        res.cookie("clientToken", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: "/",
        });

        console.log("[OAUTH] Cookie set - redirecting to landing page");

        // Redirect to frontend landing page
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const redirectUrl = `${frontendUrl}/`;
        console.log("[OAUTH] Redirecting to:", redirectUrl);
        res.redirect(redirectUrl);
      } catch (error) {
        console.error("[OAUTH] Token generation error:", error);
        res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }
    }
  )(req, res, next);
});

// ============= Apple OAuth =============

// Check if Apple OAuth is configured
const isAppleConfigured = !!(
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_PRIVATE_KEY
);

// Initiate Apple OAuth
router.get("/apple", (req, res, next) => {
  if (!isAppleConfigured) {
    return res.status(503).json({
      error:
        "Apple OAuth is not configured. Please add APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY to environment variables.",
    });
  }
  passport.authenticate("apple", {
    session: false,
  })(req, res, next);
});

// Apple OAuth callback (POST method as Apple uses form post)
router.post("/apple/callback", (req, res, next) => {
  if (!isAppleConfigured) {
    return res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/login?error=apple_not_configured`
    );
  }

  passport.authenticate(
    "apple",
    {
      session: false,
      failureRedirect: `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/login?error=apple_auth_failed`,
    },
    (err, client, info) => {
      if (err) {
        console.error("[OAUTH] Apple callback error:", err);
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }

      if (!client) {
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }

      try {
        // Generate JWT token for client
        const token = generateToken(client._id);
        console.log(
          "[OAUTH] ✓ Apple auth successful for client:",
          client.email
        );

        // Set httpOnly cookie with token
        res.cookie("clientToken", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: "/",
        });

        // Redirect to frontend landing page
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        res.redirect(`${frontendUrl}/`);
      } catch (error) {
        console.error("[OAUTH] Token generation error:", error);
        res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }
    }
  )(req, res, next);
});

// ============= OAuth Status Check =============

// Check if OAuth providers are configured
router.get("/providers", (req, res) => {
  res.json({
    google: !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    apple: !!(
      process.env.APPLE_CLIENT_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY
    ),
  });
});

export default router;
