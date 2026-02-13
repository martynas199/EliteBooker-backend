import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import passport from "./config/passport.js";
import { requestTimer } from "./middleware/performanceMonitoring.js";
import servicesRouter from "./routes/services.js";
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
import cancellationPolicyRouter from "./routes/cancellationPolicy.js";
import favoritesRouter from "./routes/favorites.js";
import giftCardsRouter from "./routes/giftCards.js";
import paymentsRouter from "./routes/payments.js";
import supportRouter from "./routes/support.js";
import demoRouter from "./routes/demo.js";
import consentTemplatesRouter from "./routes/consentTemplates.js";
import consentsRouter from "./routes/consents.js";
import consentPublicRouter from "./routes/consentPublic.js";
import referralRouter from "./routes/referralRoutes.js";
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
import { buildAllowedOrigins, createCorsOptions } from "./config/cors.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

const helmetConfig = {
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
};

export function createApp({ logger = console } = {}) {
  const app = express();
  const allowedOrigins = buildAllowedOrigins();

  // Trust proxy - required for Render and other reverse proxies
  app.set("trust proxy", 1);

  // Security middleware
  app.use(helmet(helmetConfig));
  app.use(cors(createCorsOptions({ allowedOrigins, logger })));

  // Logging
  app.use(morgan("dev"));

  // Performance monitoring (log slow requests > 750ms)
  if (process.env.NODE_ENV !== "test") {
    app.use(requestTimer(750));
  }

  // Cookie parser (for JWT in cookies)
  app.use(cookieParser());

  // Health check (no rate limit)
  app.get("/health", (req, res) => res.json({ ok: true }));

  // Webhooks: use raw body for Stripe signature verification BEFORE json parser
  app.use(
    "/api/webhooks",
    express.raw({ type: "application/json" }),
    webhooksRouter,
  );

  // JSON parser for the rest of the API
  app.use(express.json());

  // Initialize Passport for OAuth
  app.use(passport.initialize());

  // Tenant resolution middleware (resolves tenant from domain, path, or JWT)
  app.use(resolveTenant);
  app.use(attachTenantToModels);
  app.use(optionalAuth);

  // Authentication routes with stricter rate limiting (BEFORE general limiter)
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
  app.use("/api/specialists", readLimiter, specialistsRouter);
  app.use("/api/beauticians", readLimiter, specialistsRouter); // Legacy alias
  app.use("/api/slots", readLimiter, slotsRouter);
  app.use("/api/salon", readLimiter, salonRouter);
  app.use("/api/hero-sections", readLimiter, heroSectionsRouter);
  app.use("/api/products", readLimiter, productsRouter);
  app.use("/api/seminars", readLimiter, seminarRoutes);
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

  // Public consent routes (signing via link)
  app.use("/api/public", readLimiter, consentPublicRouter);

  // Apply general rate limiting to remaining API routes
  app.use("/api", apiLimiter);

  // Support routes (protected - requires authentication)
  app.use("/api/support", supportRouter);

  // Demo request routes (public)
  app.use("/api/demo-request", demoRouter);

  // Booking with rate limiting to prevent spam
  app.use("/api/checkout", bookingLimiter, checkoutRouter);

  // Protected admin routes (authentication required)
  app.use("/api/appointments", appointmentsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/revenue", revenueRouter);
  app.use("/api/timeoff", timeoffRouter);
  app.use("/api/connect", connectRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/admin/admins", adminsRouter);
  app.use("/api/admin/clients", adminClientsRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/subscriptions", subscriptionsRouter);
  app.use("/api/calendar", calendarRouter);
  app.use("/api/features", featuresRouter);

  // Client-facing routes (authentication required for most)
  app.use("/api/client", clientRouter);
  app.use("/api/favorites", favoritesRouter);
  app.use("/api/gift-cards", giftCardsRouter);
  app.use("/api/cancellation-policy", cancellationPolicyRouter);

  // Referral system routes (mixed: public validation + protected dashboard)
  app.use("/api/referrals", referralRouter);

  // Consent forms (admin template management + client signing)
  app.use("/api/consent-templates", consentTemplatesRouter);
  app.use("/api/consents", consentsRouter);

  // Fallback + error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, allowedOrigins };
}

