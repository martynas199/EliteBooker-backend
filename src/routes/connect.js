import express from "express";
import Stripe from "stripe";
import Specialist from "../models/Specialist.js";

const router = express.Router();

// Initialize Stripe with fallback to STRIPE_SECRET
let stripeInstance = null;
function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
    if (!key)
      throw new Error("STRIPE_SECRET_KEY or STRIPE_SECRET not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

/**
 * POST /api/connect/onboard
 * Create a Stripe Connect Standard account for a specialist.
 * Standard accounts have zero monthly fees and Stripe-hosted onboarding.
 */
router.post("/onboard", async (req, res) => {
  try {
    const { specialistId, email, refreshUrl, returnUrl } = req.body;

    if (!specialistId || !email) {
      return res.status(400).json({
        error: "Missing required fields: specialistId and email",
      });
    }

    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    let stripeAccountId = specialist.stripeAccountId;

    const stripe = getStripe();

    // Check if existing account ID is valid (handles test->live mode migration)
    if (stripeAccountId) {
      try {
        await stripe.accounts.retrieve(stripeAccountId);
      } catch (error) {
        // Account doesn't exist in current mode (likely test account with live keys)
        console.log(
          `Clearing invalid Stripe account ID for specialist ${specialistId}`
        );
        stripeAccountId = null;
        specialist.stripeAccountId = null;
        specialist.stripeStatus = "not_connected";
        specialist.stripeOnboardingCompleted = false;
        await specialist.save();
      }
    }

    // Create new Stripe Connect account if doesn't exist
    if (!stripeAccountId) {
      console.log(
        `[CONNECT] Creating Standard account for specialist ${specialistId}`
      );

      const account = await stripe.accounts.create({
        type: "standard",
        country: "GB",
        email: email,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        business_type: "individual",
      });

      stripeAccountId = account.id;

      // Save Stripe account ID and type to database
      specialist.stripeAccountId = stripeAccountId;
      specialist.stripeAccountType = "standard";
      specialist.stripeStatus = "pending";
      await specialist.save();

      console.log(`[CONNECT] Created Standard account: ${stripeAccountId}`);
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url:
        refreshUrl || `${process.env.FRONTEND_URL}/admin/settings/reauth`,
      return_url:
        returnUrl ||
        `${process.env.FRONTEND_URL}/admin/settings/onboarding-complete`,
      type: "account_onboarding",
    });

    res.json({
      success: true,
      url: accountLink.url,
      stripeAccountId: stripeAccountId,
      accountType: "standard",
    });
  } catch (error) {
    console.error("Stripe Connect onboarding error:", error);
    res.status(500).json({
      error: "Failed to create onboarding link",
      message: error.message,
    });
  }
});

/**
 * GET /api/connect/status/:specialistId
 * Check the status of a specialist's Stripe Connect account
 */
router.get("/status/:specialistId", async (req, res) => {
  try {
    const { specialistId } = req.params;

    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    if (!specialist.stripeAccountId) {
      return res.json({
        status: "not_connected",
        connected: false,
        stripeAccountId: null,
        accountType: null,
      });
    }

    const stripe = getStripe();

    // Fetch account details from Stripe
    let account;
    try {
      account = await stripe.accounts.retrieve(specialist.stripeAccountId);
    } catch (error) {
      // Account doesn't exist (likely test account with live keys)
      console.log(
        `Invalid Stripe account ID for specialist ${specialistId}, clearing...`
      );
      specialist.stripeAccountId = null;
      specialist.stripeStatus = "not_connected";
      specialist.stripeOnboardingCompleted = false;
      await specialist.save();

      return res.json({
        status: "not_connected",
        connected: false,
        stripeAccountId: null,
        accountType: null,
        message:
          "Previous account was invalid and has been cleared. Please reconnect.",
      });
    }

    // Check if onboarding is complete
    const isComplete = account.details_submitted && account.charges_enabled;

    // Update specialist status in database
    if (isComplete && specialist.stripeStatus !== "connected") {
      specialist.stripeStatus = "connected";
      specialist.stripeOnboardingCompleted = true;
      specialist.stripePayoutsEnabled = account.payouts_enabled || false;
      await specialist.save();
    } else if (!isComplete && specialist.stripeStatus === "connected") {
      specialist.stripeStatus = "pending";
      specialist.stripeOnboardingCompleted = false;
      await specialist.save();
    }

    res.json({
      status: specialist.stripeStatus,
      connected: isComplete,
      stripeAccountId: specialist.stripeAccountId,
      accountType: "standard",
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      requirementsCurrentlyDue: account.requirements?.currently_due || [],
    });
  } catch (error) {
    console.error("Stripe Connect status check error:", error);
    res.status(500).json({
      error: "Failed to check account status",
      message: error.message,
    });
  }
});

/**
 * POST /api/connect/dashboard-link/:specialistId
 * Generate a login link for specialist to access their Stripe dashboard
 * For Standard accounts, returns the Stripe dashboard URL
 */
router.post("/dashboard-link/:specialistId", async (req, res) => {
  try {
    const { specialistId } = req.params;

    const specialist = await Specialist.findById(specialistId);
    if (!specialist || !specialist.stripeAccountId) {
      return res.status(404).json({
        error: "Specialist not found or Stripe account not connected",
      });
    }

    const accountType = specialist.stripeAccountType || "standard";

    // For Standard accounts, users log in directly to Stripe's dashboard
    if (accountType === "standard") {
      res.json({
        success: true,
        url: "https://dashboard.stripe.com",
        accountType: "standard",
        message: "Please log in with your Stripe account credentials",
      });
      return;
    }

    // For Express/Custom accounts, generate a login link
    const stripe = getStripe();
    const loginLink = await stripe.accounts.createLoginLink(
      specialist.stripeAccountId
    );

    res.json({
      success: true,
      url: loginLink.url,
      accountType: accountType,
    });
  } catch (error) {
    console.error("Stripe dashboard link error:", error);
    res.status(500).json({
      error: "Failed to create dashboard link",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/connect/disconnect/:specialistId
 * Disconnect a specialist's Stripe account (for testing/admin purposes)
 */
router.delete("/disconnect/:specialistId", async (req, res) => {
  try {
    const { specialistId } = req.params;

    const specialist = await Specialist.findById(specialistId);
    if (!specialist) {
      return res.status(404).json({ error: "Specialist not found" });
    }

    if (specialist.stripeAccountId) {
      // Optionally delete the account from Stripe
      // await stripe.accounts.del(specialist.stripeAccountId);

      // Clear Stripe fields from database
      specialist.stripeAccountId = null;
      specialist.stripeStatus = "not_connected";
      specialist.stripeOnboardingCompleted = false;
      await specialist.save();
    }

    res.json({
      success: true,
      message: "Stripe account disconnected successfully",
    });
  } catch (error) {
    console.error("Stripe disconnect error:", error);
    res.status(500).json({
      error: "Failed to disconnect account",
      message: error.message,
    });
  }
});

export default router;
