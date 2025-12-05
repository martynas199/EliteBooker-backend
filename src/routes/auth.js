import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import crypto from "crypto";
import mongoose from "mongoose";
import Admin from "../models/Admin.js";
import RefreshToken from "../models/RefreshToken.js";
import nodemailer from "nodemailer";

const r = Router();

// JWT secret from environment or default (CHANGE IN PRODUCTION!)
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m"; // Short-lived access token
const JWT_COOKIE_EXPIRES_IN =
  process.env.JWT_COOKIE_EXPIRES_IN || 15 / (24 * 60); // 15 minutes in days
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Validation schemas
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "super_admin"]).optional(),
});

// Helper function to sign JWT token
const signToken = (admin) => {
  return jwt.sign(
    {
      id: admin._id,
      tenantId: admin.tenantId,
      role: admin.role,
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
    }
  );
};

// Helper function to get client IP
const getClientIp = (req) => {
  return req.ip || req.connection.remoteAddress || "unknown";
};

// Helper function to send token response with refresh token
const sendTokenResponse = async (admin, statusCode, res, req) => {
  const accessToken = signToken(admin);

  // Create refresh token in database
  const refreshTokenDoc = await RefreshToken.createForAdmin(
    admin._id,
    getClientIp(req)
  );

  // Access token cookie options (short-lived, 15 minutes)
  const accessTokenOptions = {
    expires: new Date(Date.now() + JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  };

  // Refresh token cookie options (longer-lived, 7 days)
  const refreshTokenOptions = {
    expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    // In development, use root path for proxy compatibility
    path: process.env.NODE_ENV === "production" ? "/api/auth/refresh" : "/",
  };

  // Send cookies and response
  res
    .status(statusCode)
    .cookie("accessToken", accessToken, accessTokenOptions)
    .cookie("refreshToken", refreshTokenDoc.token, refreshTokenOptions)
    .json({
      success: true,
      admin: {
        _id: admin._id,
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        active: admin.active,
        lastLogin: admin.lastLogin,
        beauticianId: admin.beauticianId,
        tenantId: admin.tenantId,
      },
    });
};

/**
 * POST /api/auth/register
 * Register a new admin (only for super_admin or initial setup)
 * Note: In production, you might want to restrict this or require super_admin auth
 */
r.post("/register", async (req, res) => {
  try {
    // Validate request body
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.errors,
      });
    }

    const { email, password, name, role } = validation.data;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(409).json({
        error: "Admin with this email already exists",
      });
    }

    // Create admin
    const admin = await Admin.create({
      email,
      password,
      name,
      role: role || "admin",
    });

    // Send token response
    await sendTokenResponse(admin, 201, res, req);
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      error: "Failed to register admin",
      details: error.message,
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
r.post("/login", async (req, res) => {
  try {
    console.log("[Login] Request body:", req.body);

    // Validate request body
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      console.log("[Login] Validation failed:", validation.error);
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.errors,
      });
    }

    const { email, password } = validation.data;
    console.log("[Login] Attempting login for:", email);

    // Find admin by email (include password for comparison)
    // IMPORTANT: Bypass multi-tenant filtering by using the collection directly
    // We don't know the tenant until after authentication
    const adminDoc = await Admin.collection.findOne({
      email: email.toLowerCase(),
    });

    // If found, hydrate it into a Mongoose document
    let admin = null;
    if (adminDoc) {
      admin = new Admin(adminDoc);
      // Manually select password field since we bypassed the model
      admin.password = adminDoc.password;
    }

    if (!admin || !admin.active) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // Check if account is locked and handle auto-unlock
    if (admin.lockUntil && admin.lockUntil < Date.now()) {
      // Lock has expired, automatically unlock
      admin.loginAttempts = 0;
      admin.lockUntil = undefined;
      await admin.save();
    } else if (admin.isLocked()) {
      // Still locked
      const minutesRemaining = Math.ceil(
        (admin.lockUntil - Date.now()) / (1000 * 60)
      );
      return res.status(423).json({
        error: `Account is temporarily locked due to too many failed login attempts. Please try again in ${minutesRemaining} minute${
          minutesRemaining !== 1 ? "s" : ""
        }.`,
        lockUntil: admin.lockUntil,
        minutesRemaining,
      });
    }

    // Check password
    const isPasswordCorrect = await admin.comparePassword(password);

    if (!isPasswordCorrect) {
      // Increment login attempts
      await admin.incLoginAttempts();

      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // Reset login attempts on successful login
    await admin.resetLoginAttempts();

    // Send token response with refresh token
    await sendTokenResponse(admin, 200, res, req);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Failed to login",
      details: error.message,
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
r.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({
        error: "No refresh token provided",
      });
    }

    // Find refresh token in database
    const refreshTokenDoc = await RefreshToken.findOne({
      token: refreshToken,
    }).populate("adminId");

    if (!refreshTokenDoc) {
      return res.status(401).json({
        error: "Invalid refresh token",
      });
    }

    // Check if token was already used (token reuse detection)
    if (refreshTokenDoc.revokedAt) {
      // Token reuse detected! Revoke all tokens for this admin
      await RefreshToken.revokeAllForAdmin(
        refreshTokenDoc.adminId._id,
        getClientIp(req),
        "token_reuse_detected"
      );

      return res.status(401).json({
        error:
          "Token reuse detected. All sessions have been terminated for security.",
      });
    }

    // Check if token is expired
    if (refreshTokenDoc.isExpired) {
      return res.status(401).json({
        error: "Refresh token expired. Please log in again.",
      });
    }

    // Check if admin is still active
    const admin = refreshTokenDoc.adminId;
    if (!admin || !admin.active) {
      await refreshTokenDoc.revoke(getClientIp(req), "manual_revoke");
      return res.status(401).json({
        error: "Admin account is no longer active",
      });
    }

    // Create new refresh token (rotation)
    const newRefreshTokenDoc = await RefreshToken.createForAdmin(
      admin._id,
      getClientIp(req)
    );

    // Revoke old refresh token and link to new one
    await refreshTokenDoc.revoke(
      getClientIp(req),
      "logout",
      newRefreshTokenDoc.token
    );

    // Create new access token
    const newAccessToken = signToken(admin);

    // Set new cookies
    const accessTokenOptions = {
      expires: new Date(
        Date.now() + JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
      ),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    };

    const refreshTokenOptions = {
      expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      path: "/api/auth/refresh",
    };

    res
      .cookie("accessToken", newAccessToken, accessTokenOptions)
      .cookie("refreshToken", newRefreshTokenDoc.token, refreshTokenOptions)
      .json({
        success: true,
        message: "Token refreshed successfully",
      });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({
      error: "Failed to refresh token",
      details: error.message,
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout and clear cookies
 */
r.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    // Revoke refresh token if exists
    if (refreshToken) {
      const refreshTokenDoc = await RefreshToken.findOne({
        token: refreshToken,
      });

      if (refreshTokenDoc && !refreshTokenDoc.revokedAt) {
        await refreshTokenDoc.revoke(getClientIp(req), "logout");
      }
    }

    // Clear cookies
    res
      .clearCookie("accessToken")
      .clearCookie("refreshToken", { path: "/api/auth/refresh" })
      .json({
        success: true,
        message: "Logged out successfully",
      });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: "Failed to logout",
      details: error.message,
    });
  }
});

/**
 * GET /api/auth/me
 * Get current logged in admin
 * Requires authentication middleware
 */
r.get("/me", async (req, res) => {
  try {
    console.log("[Auth /me] Request received");
    console.log("[Auth /me] Cookies:", req.cookies);
    console.log("[Auth /me] Cookie names:", Object.keys(req.cookies || {}));
    console.log("[Auth /me] Has accessToken?", !!req.cookies?.accessToken);
    console.log("[Auth /me] Has jwt?", !!req.cookies?.jwt);

    // Get token from cookie - prioritize accessToken over jwt
    let token;
    let tokenSource;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
      tokenSource = "Authorization header";
    } else if (req.cookies.accessToken) {
      token = req.cookies.accessToken;
      tokenSource = "accessToken cookie";
    } else if (req.cookies.jwt) {
      // Backward compatibility - but warn about old cookie
      token = req.cookies.jwt;
      tokenSource = "jwt cookie (deprecated)";
      console.warn(
        "[Auth /me] WARNING: Using deprecated jwt cookie. Should use accessToken."
      );
    }

    console.log("[Auth /me] Token source:", tokenSource);

    if (!token) {
      console.log("[Auth /me] No token found, returning 401");
      return res.status(401).json({
        error: "Not authenticated. Please log in.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("[Auth /me] Token decoded, admin ID:", decoded.id);
    console.log("[Auth /me] Token tenantId:", decoded.tenantId);

    // Find admin - bypass multi-tenant filtering since we're authenticating
    const adminDoc = await Admin.collection.findOne({
      _id: new mongoose.Types.ObjectId(decoded.id),
    });

    console.log("[Auth /me] Admin doc found:", !!adminDoc);
    if (adminDoc) {
      console.log("[Auth /me] Admin email:", adminDoc.email);
      console.log("[Auth /me] Admin active:", adminDoc.active);
      console.log("[Auth /me] Admin tenantId:", adminDoc.tenantId);
    }

    let admin = null;
    if (adminDoc) {
      admin = new Admin(adminDoc);
    }

    if (!admin || !admin.active) {
      console.log("[Auth /me] Admin not found or inactive, returning 401");
      return res.status(401).json({
        error: "Admin no longer exists or is inactive",
      });
    }

    // Check if password was changed after token was issued
    if (admin.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        error: "Password was recently changed. Please log in again.",
      });
    }

    res.json({
      success: true,
      admin: {
        _id: admin._id,
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        active: admin.active,
        lastLogin: admin.lastLogin,
        beauticianId: admin.beauticianId, // Added for Stripe Connect
      },
    });
  } catch (error) {
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

    console.error("Auth me error:", error);
    res.status(500).json({
      error: "Failed to get admin info",
      details: error.message,
    });
  }
});

/**
 * PATCH /api/auth/me
 * Update current admin profile (name, email)
 */
r.patch("/me", async (req, res) => {
  try {
    // Get token
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({
        error: "Not authenticated. Please log in.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find admin
    const admin = await Admin.findById(decoded.id);

    if (!admin) {
      return res.status(401).json({
        error: "Admin not found",
      });
    }

    const { name, email } = req.body;

    // Validate input
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: "Name is required",
      });
    }

    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({
        error: "Valid email is required",
      });
    }

    // Check if email is already taken by another admin
    if (email !== admin.email) {
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(409).json({
          error: "Email is already in use by another admin",
        });
      }
    }

    // Update admin
    admin.name = name.trim();
    admin.email = email.trim().toLowerCase();
    await admin.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      admin: {
        _id: admin._id,
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        active: admin.active,
        lastLogin: admin.lastLogin,
        beauticianId: admin.beauticianId, // Added for Stripe Connect
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      error: "Failed to update profile",
      details: error.message,
    });
  }
});

/**
 * PATCH /api/auth/change-password
 * Change password for logged in admin
 */
r.patch("/change-password", async (req, res) => {
  try {
    // Get token
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({
        error: "Not authenticated. Please log in.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find admin with password
    const admin = await Admin.findById(decoded.id).select("+password");

    if (!admin) {
      return res.status(401).json({
        error: "Admin not found",
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Please provide current and new password",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "New password must be at least 8 characters",
      });
    }

    // Check current password
    const isPasswordCorrect = await admin.comparePassword(currentPassword);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        error: "Current password is incorrect",
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    // Revoke all existing refresh tokens (force re-login on all devices)
    await RefreshToken.revokeAllForAdmin(
      admin._id,
      getClientIp(req),
      "password_change"
    );

    // Send new token
    await sendTokenResponse(admin, 200, res, req);
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      error: "Failed to change password",
      details: error.message,
    });
  }
});

/**
 * Helper function to send password reset email
 */
async function sendPasswordResetEmail(admin, resetToken) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error(
      "[AUTH] SMTP not configured. Cannot send password reset email."
    );
    throw new Error("Email service not configured");
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || "587"),
    secure: parseInt(SMTP_PORT || "587") === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  // Create reset URL
  const resetUrl = `${process.env.FRONTEND_URL}/admin/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: SMTP_FROM || `"Elite Booker Admin" <${SMTP_USER}>`,
    to: admin.email,
    subject: "Password Reset Request - Elite Booker",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 10px; margin-top: 0;">
            🔑 Password Reset Request
          </h2>
          
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Hello <strong>${admin.name}</strong>,
          </p>
          
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            We received a request to reset your password for your Elite Booker admin account.
          </p>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              ⚠️ <strong>Important:</strong> This link will expire in 10 minutes for security reasons.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; background-color: #7c3aed; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Or copy and paste this URL into your browser:
          </p>
          <p style="color: #7c3aed; font-size: 12px; word-break: break-all; background-color: #f3f4f6; padding: 10px; border-radius: 4px;">
            ${resetUrl}
          </p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
            </p>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              For security reasons, this link will only work once and will expire after 10 minutes.
            </p>
          </div>
          
          <div style="margin-top: 30px; text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
              Elite Booker
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
              Admin Portal
            </p>
          </div>
        </div>
      </div>
    `,
  };

  try {
    await transport.sendMail(mailOptions);
    console.log(`[AUTH] Password reset email sent to ${admin.email}`);
  } catch (error) {
    console.error("[AUTH] Failed to send password reset email:", error);
    throw error;
  }
}

/**
 * POST /api/auth/forgot-password
 * Request password reset token
 */
r.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Please provide your email address",
      });
    }

    // Find admin by email
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

    // Don't reveal if email exists or not for security
    if (!admin) {
      return res.json({
        success: true,
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }

    // Check if account is active
    if (!admin.active) {
      return res.json({
        success: true,
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }

    // Generate reset token
    const resetToken = admin.createPasswordResetToken();
    await admin.save({ validateBeforeSave: false });

    try {
      // Send email
      await sendPasswordResetEmail(admin, resetToken);

      res.json({
        success: true,
        message: "Password reset link has been sent to your email address.",
      });
    } catch (error) {
      // If email fails, clear the reset token
      admin.passwordResetToken = undefined;
      admin.passwordResetExpires = undefined;
      await admin.save({ validateBeforeSave: false });

      console.error("Error sending reset email:", error);
      return res.status(500).json({
        error: "Failed to send password reset email. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      error: "Failed to process password reset request",
      details: error.message,
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
r.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: "Please provide reset token and new password",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters",
      });
    }

    // Hash the token from URL to compare with stored hashed token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find admin with valid reset token
    const admin = await Admin.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select("+passwordResetToken +passwordResetExpires");

    if (!admin) {
      return res.status(400).json({
        error:
          "Invalid or expired reset token. Please request a new password reset.",
      });
    }

    // Set new password
    admin.password = password;
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    admin.passwordChangedAt = Date.now();

    // Also reset login attempts if account was locked
    admin.loginAttempts = 0;
    admin.lockUntil = undefined;

    await admin.save();

    // Log the admin in with new password
    await sendTokenResponse(admin, 200, res, req);
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      error: "Failed to reset password",
      details: error.message,
    });
  }
});

export default r;
