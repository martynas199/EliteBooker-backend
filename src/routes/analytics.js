import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  getProfitAnalytics,
  getTopProducts,
} from "../controllers/analyticsController.js";

const router = Router();

// Apply admin authentication to all analytics routes
router.use(requireAdmin);

// Profit Analytics Routes
router.get("/profit", getProfitAnalytics);
router.get("/top-products", getTopProducts);

export default router;
