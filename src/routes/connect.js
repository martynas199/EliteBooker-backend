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

    let stripeAccountId = Specialist.stripeAccountId;

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
        Specialist.stripeAccountId = null;
        Specialist.stripeStatus = "not_connected";
        Specialist.stripeOnboardingCompleted = false;
        await Specialist.save();
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
      Specialist.stripeAccountId = stripeAccountId;
      Specialist.stripeAccountType = "standard";
      Specialist.stripeStatus = "pending";
      await Specialist.save();

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

    if (!Specialist.stripeAccountId) {
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
      account = await stripe.accounts.retrieve(Specialist.stripeAccountId);
    } catch (error) {
      // Account doesn't exist (likely test account with live keys)
      console.log(
        `Invalid Stripe account ID for specialist ${specialistId}, clearing...`
      );
      Specialist.stripeAccountId = null;
      Specialist.stripeStatus = "not_connected";
      Specialist.stripeOnboardingCompleted = false;
      await Specialist.save();

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
    if (isComplete && Specialist.stripeStatus !== "connected") {
      Specialist.stripeStatus = "connected";
      Specialist.stripeOnboardingCompleted = true;
      Specialist.stripePayoutsEnabled = account.payouts_enabled || false;
      await Specialist.save();
    } else if (!isComplete && Specialist.stripeStatus === "connected") {
      Specialist.stripeStatus = "pending";
      Specialist.stripeOnboardingCompleted = false;
      await Specialist.save();
    }

    res.json({
      status: Specialist.stripeStatus,
      connected: isComplete,
      stripeAccountId: Specialist.stripeAccountId,
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
 * Generate a login link for specialist to access their Stripe Express dashboard
 */
router.post("/dashboard-link/:specialistId", async (req, res) => {
  try {
    const { specialistId } = req.params;

    const specialist = await Specialist.findById(specialistId);
    if (!specialist || !Specialist.stripeAccountId) {
      return res.status(404).json({
        error: "Specialist not found or Stripe account not connected",
      });
    }

    const stripe = getStripe();
    const loginLink = await stripe.accounts.createLoginLink(
      Specialist.stripeAccountId
    );

    res.json({
      success: true,
      url: loginLink.url,
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

    if (Specialist.stripeAccountId) {
      // Optionally delete the account from Stripe
      // await stripe.accounts.del(Specialist.stripeAccountId);

      // Clear Stripe fields from database
      Specialist.stripeAccountId = null;
      Specialist.stripeStatus = "not_connected";
      Specialist.stripeOnboardingCompleted = false;
      await Specialist.save();
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
