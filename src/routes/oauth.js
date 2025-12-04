import { Router } from "express";
import passport from "../config/passport.js";
import jwt from "jsonwebtoken";

const router = Router();

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId, type: "customer" },
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
    (err, user, info) => {
      if (err) {
        console.error("[OAUTH] Google callback error:", err);
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }

      if (!user) {
        console.log("[OAUTH] No user returned from Google auth");
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }

      try {
        // Generate JWT token
        const token = generateToken(user._id);
        console.log("[OAUTH] ✓ Google auth successful for user:", user.email);
        console.log("[OAUTH] Token generated, length:", token.length);

        // Redirect to frontend with token
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const redirectUrl = `${frontendUrl}/auth/success?token=${token}`;
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
    (err, user, info) => {
      if (err) {
        console.error("[OAUTH] Apple callback error:", err);
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }

      if (!user) {
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:5173"
          }/login?error=auth_failed`
        );
      }

      try {
        // Generate JWT token
        const token = generateToken(user._id);

        // Redirect to frontend with token
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        res.redirect(`${frontendUrl}/auth/success?token=${token}`);
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
