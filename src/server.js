// Load environment variables first (must be before all other imports)
import "./config/env.js";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import passport from "./config/passport.js";
import servicesRouter from "./routes/services.js";
import beauticiansRouter from "./routes/specialists.js";
import specialistsRouter from "./routes/specialists.js";
import slotsRouter from "./routes/slots.js";
import checkoutRouter from "./routes/checkout.js";
import appointmentsRouter from "./routes/appointments.js";
import webhooksRouter from "./routes/webhooks.js";
import salonRouter from "./routes/salon.js";
import settingsRouter from "./routes/settings.js";
import revenueRouter from "./routes/revenue.js";
import authRouter from "./routes/auth.js";
import userAuthRouter from "./routes/userAuth.js";
import usersRouter from "./routes/users.js";
import oauthRouter from "./routes/oauth.js";
import timeoffRouter from "./routes/timeoff.js";
import heroSectionsRouter from "./routes/heroSections.js";
import productsRouter from "./routes/products.js";
import ordersRouter from "./routes/orders.js";
import connectRouter from "./routes/connect.js";
import reportsRouter from "./routes/reports.js";
import adminsRouter from "./routes/admins.js";
import aboutUsRouter from "./routes/aboutUs.js";
import locationsRouter from "./routes/locations.js";
import analyticsRouter from "./routes/analytics.js";
import shippingRouter from "./routes/shipping.js";
import subscriptionsRouter from "./routes/subscriptions.js";
import wishlistRouter from "./routes/wishlist.js";
import blogPostsRouter from "./routes/blogPosts.js";
import tenantsRouter from "./routes/tenants.js";
import calendarRouter from "./routes/calendar.js";
import locksRouter from "./routes/locks.js";
import featuresRouter from "./routes/features.js";
import seminarRoutes from "./routes/seminarRoutes.js";
import adminClientsRouter from "./routes/admin/clients.js";
import clientRouter from "./routes/client.js";
import favoritesRouter from "./routes/favorites.js";
import giftCardsRouter from "./routes/giftCards.js";
import paymentsRouter from "./routes/payments.js";
import supportRouter from "./routes/support.js";
import { startReminderCron } from "./services/reminderService.js";
import {
  apiLimiter,
  authLimiter,
  registerLimiter,
  bookingLimiter,
  readLimiter,
} from "./middleware/rateLimiter.js";
import { resolveTenant } from "./middleware/resolveTenant.js";
import { attachTenantToModels } from "./middleware/multiTenantPlugin.js";
import optionalAuth from "./middleware/optionalAuth.js";

const app = express();

// Trust proxy - required for Render and other reverse proxies
// This allows Express to correctly identify the client's IP from X-Forwarded-For header
app.set("trust proxy", 1);

// Security: Helmet for security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://accounts.google.com",
          "https://oauth2.googleapis.com",
        ],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        frameSrc: ["'self'", "https://accounts.google.com"],
        fontSrc: ["'self'", "data:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Security: CORS configuration
const allowedOrigins = [
  "http://localhost:5173", // Vite dev server (default)
  "http://localhost:5174", // Vite dev server (alternative port)
  "http://localhost:5177", // Vite dev server (alternative port)
  "http://localhost:3000", // Alternative dev port
  "https://elitebooker.co.uk", // Production frontend
  "https://www.elitebooker.co.uk", // Production frontend with www
  "https://elite-booker-frontend-4yty84hoj-martynasgecas-projects.vercel.app", // Vercel preview (temporary until DNS propagates)
  "https://permanentbyjuste.co.uk", // Production frontend
  "https://www.permanentbyjuste.co.uk", // Production frontend with www
  "https://www.elitebooker.co.uk", // Production frontend
  process.env.FRONTEND_URL, // Production frontend URL from env (if different)
].filter(Boolean);

// Also check for Vercel preview deployments
const isVercelPreview = (origin) => {
  return origin && origin.includes(".vercel.app");
};

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Allow Vercel preview deployments
      if (isVercelPreview(origin)) {
        console.log(`Allowing Vercel preview deployment: ${origin}`);
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`Blocked CORS request from origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Allow cookies to be sent
    optionsSuccessStatus: 200,
  })
);

// Logging
app.use(morgan("dev"));

// Cookie parser (for JWT in cookies)
app.use(cookieParser());

const PORT = process.env.PORT || 4000;
let MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI missing");
  process.exit(1);
}
// Remove quotes if they exist (Render sometimes adds them)
MONGO_URI = MONGO_URI.replace(/^["']|["']$/g, "").trim();
console.log("Connecting to MongoDB...");

// MongoDB connection options with better SSL/TLS handling
const mongoOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4, // Use IPv4, skip trying IPv6
};

try {
  await mongoose.connect(MONGO_URI, mongoOptions);
  console.log("✓ MongoDB connected successfully");

  // Start reminder cron job (runs every 1 hour, 07:00-21:00 only)
  console.log("Starting appointment reminder cron job...");
  startReminderCron();
} catch (error) {
  console.error("MongoDB connection error:", error.message);
  console.error(
    "Connection string (redacted):",
    MONGO_URI.replace(/:[^:@]+@/, ":****@")
  );
  process.exit(1);
}

// Health check (no rate limit)
app.get("/health", (req, res) => res.json({ ok: true }));

// Webhooks: use raw body for Stripe signature verification BEFORE json parser
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  webhooksRouter
);

// JSON parser for the rest of the API
app.use(express.json());

// Initialize Passport for OAuth
app.use(passport.initialize());

// Tenant resolution middleware (resolves tenant from domain, path, or JWT)
// This must come after JSON parser but before routes that need tenant context
app.use(resolveTenant);
// Attach tenant context to Mongoose operations
app.use(attachTenantToModels);
// Optional authentication middleware (extracts admin from JWT and sets req.tenantId)
// This must come AFTER resolveTenant to allow tenant resolution from JWT token
app.use(optionalAuth);

// Authentication routes with stricter rate limiting (BEFORE general limiter)
// Admin auth
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth", authRouter);

// Customer auth
app.use("/api/user-auth/login", authLimiter);
app.use("/api/user-auth/register", registerLimiter);
app.use("/api/user-auth", userAuthRouter);

// OAuth routes (Google, Apple login)
app.use("/api/oauth", oauthRouter);

// Tenant routes (public for registration, protected for management)
app.use("/api/tenants", tenantsRouter);

// Lock management routes (public for booking flow, lenient rate limit)
app.use("/api/locks", readLimiter, locksRouter);

// Public READ-ONLY routes with lenient rate limiting (BEFORE general limiter)
app.use("/api/services", readLimiter, servicesRouter);
app.use("/api/specialists", readLimiter, beauticiansRouter); // Legacy endpoint for backward compatibility
app.use("/api/specialists", readLimiter, specialistsRouter); // New endpoint
app.use("/api/slots", readLimiter, slotsRouter);
app.use("/api/salon", readLimiter, salonRouter);
app.use("/api/hero-sections", readLimiter, heroSectionsRouter);
app.use("/api/products", readLimiter, productsRouter);
app.use("/api/seminars", readLimiter, seminarRoutes); // Seminar routes (public + protected)
app.use("/api/about-us", aboutUsRouter);
app.use("/api/blog-posts", readLimiter, blogPostsRouter);
app.use("/api/locations", readLimiter, locationsRouter);

// Customer profile routes (protected)
app.use("/api/users", usersRouter);

// Wishlist routes (protected)
app.use("/api/wishlist", wishlistRouter);

// Orders (includes both read and write operations)
app.use("/api/orders", ordersRouter);

// Shipping rates (public endpoint)
app.use("/api/shipping", shippingRouter);

// Apply general rate limiting to remaining API routes
app.use("/api", apiLimiter);

// Support routes (protected - requires authentication)
app.use("/api/support", supportRouter);

// Booking with rate limiting to prevent spam
app.use("/api/checkout", bookingLimiter, checkoutRouter);

// Protected admin routes (authentication required)
app.use("/api/appointments", appointmentsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/revenue", revenueRouter);
app.use("/api/timeoff", timeoffRouter);
app.use("/api/connect", connectRouter); // Stripe Connect routes
app.use("/api/reports", reportsRouter); // Revenue and earnings reports
app.use("/api/admin/admins", adminsRouter); // Admin management routes
app.use("/api/admin/clients", adminClientsRouter); // Client management routes
app.use("/api/analytics", analyticsRouter); // Profit analytics routes
app.use("/api/payments", paymentsRouter); // Tap to Pay payment routes
app.use("/api/subscriptions", subscriptionsRouter); // E-commerce subscription routes
app.use("/api/calendar", calendarRouter); // Google Calendar integration routes
app.use("/api/features", featuresRouter); // Premium features subscription routes

// Client-facing routes (authentication required for most)
app.use("/api/client", clientRouter); // Client profile, bookings, GDPR
app.use("/api/favorites", favoritesRouter); // Client favorites
app.use("/api/gift-cards", giftCardsRouter); // Gift cards

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Unknown error" });
});

// Only start server if not in test environment
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🚀 API listening on :${PORT}`);
    console.log(`🔒 Security features enabled:`);
    console.log(`   - Helmet security headers`);
    console.log(`   - CORS restricted to: ${allowedOrigins.join(", ")}`);
    console.log(`   - Rate limiting active`);
    console.log(`   - JWT authentication required for admin routes`);
  });
}

// Export app for testing
export default app;
