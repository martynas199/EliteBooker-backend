/**
 * Referral Routes
 * API endpoints for referral system
 */

import express from "express";
import {
  generateReferralCode,
  getMyCode,
  getDashboard,
  validateCode,
  getStats,
  getLeaderboard,
} from "../controllers/referralController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import optionalAuth from "../middleware/optionalAuth.js";

const router = express.Router();

// Public routes (no auth required)
router.post("/validate/:code", optionalAuth, validateCode);

// Protected routes (universal auth - works for both Clients and Tenants)
router.post("/generate", universalAuth, generateReferralCode);
router.get("/my-code", universalAuth, getMyCode);
router.get("/dashboard", universalAuth, getDashboard);
router.get("/stats", universalAuth, getStats);

// Leaderboard (auth optional for now)
router.get("/leaderboard", optionalAuth, getLeaderboard);

export default router;
