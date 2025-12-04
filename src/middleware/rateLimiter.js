import rateLimit from "express-rate-limit";

/**
 * General API rate limiter
 * Limits requests to 500 per 15 minutes per IP
 * More lenient for production use with multiple concurrent users
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (allows ~33 req/min)
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for certain conditions (optional)
  skip: (req) => {
    // Don't rate limit health check endpoints or read-only public endpoints
    if (req.path === "/health" || req.path === "/api/health") return true;

    // Skip rate limiting in development mode (optional)
    if (process.env.NODE_ENV === "development") return true;

    return false;
  },
});

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks on login
 * Limits to 5 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: {
    error:
      "Too many login attempts from this IP, please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Slower requests to further discourage brute force
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * Strict rate limiter for registration
 * Prevents spam account creation
 * Limits to 3 requests per hour per IP
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registration attempts per hour
  message: {
    error:
      "Too many accounts created from this IP, please try again after an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Moderate rate limiter for booking endpoints
 * Prevents spam bookings
 * Limits to 10 bookings per hour per IP
 */
export const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 bookings per hour
  message: {
    error: "Too many booking attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development mode
    if (process.env.NODE_ENV === "development") return true;
    return false;
  },
});

/**
 * Lenient rate limiter for read-only endpoints
 * Limits to 1000 requests per 15 minutes per IP
 * Very permissive for public browsing (products, services, etc.)
 */
export const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // High limit for read operations (~66 req/min)
  message: {
    error: "Too many requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development mode
    if (process.env.NODE_ENV === "development") return true;
    return false;
  },
});
