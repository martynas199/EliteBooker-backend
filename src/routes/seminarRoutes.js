import express from "express";
import multer from "multer";
import * as seminarController from "../controllers/seminarController.js";
import * as seminarBookingController from "../controllers/seminarBookingController.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { authenticateUser } from "../middleware/userAuth.js";
import { isSpecialist, isSeminarOwner } from "../middleware/seminarRoles.js";

const router = express.Router();

// Configure multer for memory storage (buffers)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// ============================================
// PUBLIC ROUTES (No auth required)
// ============================================

// Get all published seminars (client-facing)
router.get("/public", seminarController.getPublicSeminars);

// Get single seminar by slug (client-facing)
router.get("/public/:slug", seminarController.getPublicSeminarBySlug);

// ============================================
// ADMIN/SPECIALIST ROUTES (Auth required)
// ============================================

// Create new seminar (specialist only)
router.post("/", requireAdmin, isSpecialist, seminarController.createSeminar);

// Get all seminars (admin sees all, specialist sees own)
router.get("/", requireAdmin, seminarController.getSeminars);

// Get single seminar by ID
router.get("/:id", requireAdmin, seminarController.getSeminarById);

// Update seminar (owner or admin only) - support both PUT and PATCH
router.put(
  "/:id",
  requireAdmin,
  isSeminarOwner,
  seminarController.updateSeminar
);

router.patch(
  "/:id",
  requireAdmin,
  isSeminarOwner,
  seminarController.updateSeminar
);

// Delete seminar (owner or admin only)
router.delete(
  "/:id",
  requireAdmin,
  isSeminarOwner,
  seminarController.deleteSeminar
);

// Publish seminar
router.patch(
  "/:id/publish",
  requireAdmin,
  isSeminarOwner,
  seminarController.publishSeminar
);

// Archive seminar
router.patch(
  "/:id/archive",
  requireAdmin,
  isSeminarOwner,
  seminarController.archiveSeminar
);

// Upload main image
router.post(
  "/:id/upload-image",
  requireAdmin,
  isSeminarOwner,
  upload.single("image"),
  seminarController.uploadMainImage
);

// Upload gallery images
router.post(
  "/:id/upload-images",
  requireAdmin,
  isSeminarOwner,
  upload.array("images", 10),
  seminarController.uploadGalleryImages
);

// Get all bookings for a seminar
router.get(
  "/:id/bookings",
  requireAdmin,
  isSeminarOwner,
  seminarBookingController.getSeminarBookings
);

// Get attendees for a specific session
router.get(
  "/:id/sessions/:sessionId/attendees",
  requireAdmin,
  isSeminarOwner,
  seminarBookingController.getSessionAttendees
);

// ============================================
// BOOKING ROUTES
// ============================================

// Create Stripe checkout session for booking
router.post(
  "/checkout/create-session",
  seminarBookingController.createCheckoutSession
);

// Confirm payment and create booking (called by Stripe webhook)
router.post(
  "/checkout/confirm-payment",
  seminarBookingController.confirmPayment
);

// Get client's seminar bookings
router.get(
  "/bookings/my-bookings",
  authenticateUser,
  seminarBookingController.getMyBookings
);

// Get specific booking
router.get(
  "/bookings/:id",
  authenticateUser,
  seminarBookingController.getBookingById
);

// Cancel booking
router.patch(
  "/bookings/:id/cancel",
  authenticateUser,
  seminarBookingController.cancelBooking
);

export default router;
